import fs from 'fs-extra';
import nodePath from 'node:path';

import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage } from './command.ts';
import { runDockerComposeCommand } from './docker-compose.ts';

/**
 * 文件作用：
 * 这个模块负责执行开源版初始化 SQL。
 *
 * 重要边界：
 * - Prisma 仍然负责创建表结构，部署流程会先执行 `prisma db push`。
 * - 这里的 SQL 只负责填充初始数据，例如账号、角色、用户组、权限、菜单、字典和演示任务。
 * - SQL 文件放在仓库根目录 `database/seeds/open-source`，deploy-kit 源码和业务项目共用同一份文件。
 * - 打包发布时，tsup 会把这些 SQL 复制到 `deploy_script/runtime/seed-sql`，release 脚本再把它们压缩进单文件部署脚本。
 */

type SeedTarget = {
    /** 日志里显示的人类可读名称。 */
    label: string;
    /** 目标数据库名，从主 env 中读取，允许用户在向导里改库名。 */
    databaseName: string;
    /** 对应的 SQL 文件名。 */
    fileName: string;
};

/**
 * 读取一个 SQL 文件。
 *
 * 为什么要单独检查：
 * - 文件不存在通常表示构建产物缺少 seed-sql 目录，继续跑只会得到晦涩的 psql 错误。
 * - 空文件通常是打包或编辑失误，应该在真正接触数据库前失败。
 */
async function readSeedSqlFile(config: DeployConfig, fileName: string): Promise<string> {
    // nodePath.join 用当前系统路径分隔符拼出真实文件路径，兼容 Windows 和 Linux。
    const filePath = nodePath.join(config.runtimeSeedSqlDir, fileName);

    // pathExists 比直接 readFile 后 catch 更适合表达“资源缺失”这种配置错误。
    if (!(await fs.pathExists(filePath))) {
        throw new Error(`缺少开源版初始化 SQL 文件：${filePath}`);
    }

    // SQL 文件统一按 UTF-8 读取，因为里面包含中文说明和中文演示数据。
    const sqlText = await fs.readFile(filePath, 'utf8');
    if (!sqlText.trim()) {
        throw new Error(`开源版初始化 SQL 文件为空：${filePath}`);
    }

    await logDeployMessage(config, 'seed sql', `读取初始化 SQL: ${filePath}`);
    return sqlText;
}

/**
 * 在 PostgreSQL 容器中对指定业务库执行 SQL。
 *
 * 执行方式说明：
 * - 使用 `docker compose exec -T shiro-nya-postgres`，这样目标机器不需要安装宿主机版 psql。
 * - `-T` 关闭伪终端，保证 SQL 文本可以通过 stdin 稳定传给 psql。
 * - `ON_ERROR_STOP=1` 让 SQL 任意一处失败都立刻让 psql 非 0 退出，部署流程会停止。
 * - `PGPASSWORD` 从容器环境变量 `POSTGRES_PASSWORD` 读取，避免密码出现在命令参数里。
 */
async function runSeedSql(config: DeployConfig, target: SeedTarget, sqlText: string): Promise<void> {
    await logDeployMessage(config, 'seed sql', `开始初始化 ${target.label}: ${target.databaseName}`);

    await runDockerComposeCommand(
        config,
        [
            'exec',
            '-T',
            '-e',
            'POSTGRES_USER',
            '-e',
            'POSTGRES_PASSWORD',
            '-e',
            `SHIRO_NYA_TARGET_DB=${target.databaseName}`,
            'shiro-nya-postgres',
            'sh',
            '-lc',
            [
                'set -eu',
                // PGPASSWORD 是 psql 支持的标准环境变量，只作用于当前命令进程。
                'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$SHIRO_NYA_TARGET_DB"'
            ].join('\n')
        ],
        {
            env: config.env,
            input: sqlText,
            title: `seed ${target.label} database`
        }
    );

    await logDeployMessage(config, 'seed sql', `${target.label} 初始化 SQL 执行完成`);
}

/**
 * 执行 admin-api 和 app-api 的开源版初始化数据。
 *
 * 顺序放在 Prisma schema 同步之后：
 * - 如果表不存在，SQL 会失败，所以必须先 `db push`。
 * - 如果服务已经启动，应用可能在首轮请求里读到空菜单；因此这里在 `docker compose up -d` 前完成填充。
 */
export async function seedOpenSourceInitialData(config: DeployConfig): Promise<void> {
    const targets: SeedTarget[] = [
        {
            label: 'admin-api',
            databaseName: config.env.ADMIN_POSTGRES_DB ?? 'admin_api_db',
            fileName: 'admin-api.sql'
        },
        {
            label: 'app-api',
            databaseName: config.env.APP_POSTGRES_DB ?? 'app_api_db',
            fileName: 'app-api.sql'
        }
    ];

    await logDeployMessage(config, 'seed sql', `开源版初始化 SQL 目录: ${config.runtimeSeedSqlDir}`);

    for (const target of targets) {
        // 每个库读取自己的 SQL，避免 admin/app 表结构差异导致误执行。
        const sqlText = await readSeedSqlFile(config, target.fileName);
        await runSeedSql(config, target, sqlText);
    }
}
