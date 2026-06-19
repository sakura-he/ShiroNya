import nodePath from 'node:path';

import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage, resolvePrismaCliCommand, runLoggedCommand } from './command.ts';
import { databaseUrl } from './connection-strings.ts';

/**
 * 文件作用：
 * 这个模块负责把 Prisma schema 同步到部署环境的业务数据库。
 *
 * deploy-kit 不生成 Prisma Client，也不改业务工程代码。
 * 它只把 `runtime/prisma/admin` 和 `runtime/prisma/app` 中的模型定义推送到数据库，
 * 让新部署环境具备 admin-api 和 app-api 所需的数据表结构。
 */

/**
 * 同步 admin-api / app-api 两个业务数据库结构。
 *
 * 执行逻辑：
 * 1. 先解析可用的 Prisma CLI。
 * 2. 为 admin-api 和 app-api 分别构造 schema 目录和数据库 URL。
 * 3. 对每个目标执行 `prisma db push --schema <schemaDir> --url <url>`。
 *
 * 特殊参数说明：
 * - `CHECKPOINT_DISABLE=1`：关闭 Prisma 相关遥测/检查点提示，保持部署日志干净。
 * - `PRISMA_HIDE_UPDATE_MESSAGE=1`：隐藏 Prisma 版本更新提示，避免用户误以为部署失败。
 */
export async function syncApplicationDatabaseSchemas(config: DeployConfig): Promise<void> {
    // 解析可用 Prisma CLI；返回 null 表示所有候选都不可用。
    const prisma = await resolvePrismaCliCommand();
    if (!prisma) {
        throw new Error(`缺少 Prisma CLI。请确认 Node.js 22 自带的 npx 可用，或确保 prisma 在 PATH 中可执行。`);
    }
    await logDeployMessage(config, 'database schema', `使用 Prisma CLI: ${prisma.label}`);

    // 两个目标分别对应 admin-api 和 app-api 的 Prisma schema 目录。
    const targets = [
        {
            title: 'sync admin-api database schema',
            schemaDir: nodePath.join(config.runtimePrismaDir, 'admin'),
            url: databaseUrl(config, config.env.ADMIN_POSTGRES_DB ?? 'admin_api_db')
        },
        {
            title: 'sync app-api database schema',
            schemaDir: nodePath.join(config.runtimePrismaDir, 'app'),
            url: databaseUrl(config, config.env.APP_POSTGRES_DB ?? 'app_api_db')
        }
    ];

    for (const target of targets) {
        await logDeployMessage(config, 'database schema', `同步业务数据库结构: ${target.title}`);
        await runLoggedCommand(
            config,
            // prisma.command 可能是 npx、prisma、pnpm 或本地 prisma.cmd。
            prisma.command,
            // prisma.args 是候选命令自带参数；后面追加真正的 db push 参数。
            [...prisma.args, 'db', 'push', '--schema', target.schemaDir, '--url', target.url],
            {
                // 某些候选命令需要在指定 cwd 下运行，例如 pnpm exec prisma。
                cwd: prisma.cwd,
                env: {
                    // 继承当前环境，保留 PATH、代理变量等。
                    ...process.env,
                    // 禁用 Prisma 额外提示，保持部署日志可读。
                    CHECKPOINT_DISABLE: '1',
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                },
                title: target.title
            }
        );
        await logDeployMessage(config, 'database schema', `${target.title} 完成`);
    }
}
