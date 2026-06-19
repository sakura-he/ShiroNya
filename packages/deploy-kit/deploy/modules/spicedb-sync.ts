import { v1 } from '@authzed/authzed-node';
import fs from 'node:fs/promises';

import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage } from './command.ts';
import { spiceDbDatastoreUrl } from './connection-strings.ts';
import { runDockerComposeCommand } from './docker-compose.ts';

/**
 * 文件作用：
 * 这个模块负责同步 PostgreSQL 中的数据库/角色，并执行 SpiceDB datastore migration。
 *
 * 为什么需要它：
 * - PostgreSQL 官方容器的初始化 SQL 通常只在数据目录首次创建时执行。
 * - 部署时修改 env 后，已有数据库里的角色密码、数据库 owner 不一定会自动变化。
 * - SpiceDB 使用 PostgreSQL 作为 datastore 时，需要执行 `spicedb migrate head` 准备内部表结构。
 * - Datastore migration 只创建 SpiceDB 内部表，不会写入业务授权模型，所以还需要发布 `spicedb/schema.zed`。
 */

const spicedbServiceName = 'admin-api-spicedb';
const spicedbHostGrpcEndpoint = '127.0.0.1:50052';
const spicedbReadyRetryCount = 60;
const spicedbReadyRetryDelayMs = 1000;

type SpiceDbNodeClient = ReturnType<typeof v1.NewClient>;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * 把未知异常转成适合日志展示的短文本。
 *
 * gRPC 报错通常是 Error 实例，message 里会包含 UNAVAILABLE、UNAUTHENTICATED 等原因。
 * 如果不是 Error，就退回 String(error)，避免日志里只看到 `[object Object]`。
 */
function formatUnknownError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

/**
 * 判断 ReadSchema 的“尚未写入任何 schema”错误。
 *
 * SpiceDB 全新 datastore 上第一次 ReadSchema 会返回 gRPC code=5，也就是 NOT_FOUND。
 * 这个错误不是服务未就绪，反而说明：
 * - gRPC 端口已经可访问。
 * - token 已经验证通过。
 * - datastore migration 已经可以被 SpiceDB 使用。
 *
 * 因此等待就绪时遇到它应该直接放行，后续 WriteSchema 会创建第一版 schema。
 */
function isNoSchemaDefinedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const maybeGrpcError = error as { code?: unknown; message?: unknown };
    return maybeGrpcError.code === 5 || String(maybeGrpcError.message ?? '').includes('no schema has been defined');
}

/**
 * 创建部署脚本使用的 SpiceDB gRPC client。
 *
 * 注意这里连接的是宿主机端口 `127.0.0.1:50052`：
 * - 部署脚本运行在宿主机进程里，不在 Docker 网络里。
 * - 应用容器内部才使用 `admin-api-spicedb:50051`。
 * - 这个端口由 `runtime/docker/compose.yaml` 固定映射，不暴露给部署向导配置。
 */
function createDeploySpiceDbClient(config: DeployConfig): SpiceDbNodeClient {
    const token = config.env.SPICEDB_GRPC_PRESHARED_KEY;
    if (!token) {
        throw new Error('缺少 SPICEDB_GRPC_PRESHARED_KEY，无法发布 SpiceDB schema。');
    }

    return v1.NewClient(token, spicedbHostGrpcEndpoint, v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS);
}

/**
 * 等待 SpiceDB gRPC 服务可用。
 *
 * docker compose up -d 只代表容器进程已经启动，不代表 gRPC 服务已经开始接收请求。
 * 这里用 ReadSchema 做轻量探测：能返回说明 token、端口、datastore migration 都已经可用。
 */
async function waitForSpiceDbGrpc(client: SpiceDbNodeClient): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= spicedbReadyRetryCount; attempt++) {
        try {
            await client.promises.readSchema(v1.ReadSchemaRequest.create({}));
            return;
        } catch (error) {
            if (isNoSchemaDefinedError(error)) {
                return;
            }
            lastError = error;
            if (attempt < spicedbReadyRetryCount) {
                await sleep(spicedbReadyRetryDelayMs);
            }
        }
    }

    throw new Error(`SpiceDB gRPC 服务未就绪：${formatUnknownError(lastError)}`);
}

/**
 * 同步 PostgreSQL 和 SpiceDB 使用的数据库凭据。
 *
 * 这个函数会确保：
 * - admin-api 数据库存在，owner 正确。
 * - app-api 数据库存在，owner 正确。
 * - SpiceDB 专用 PostgreSQL role 存在，密码正确。
 * - SpiceDB 专用数据库存在，owner 正确。
 */
export async function syncSpiceDbPostgres(config: DeployConfig): Promise<void> {
    await logDeployMessage(config, 'spicedb postgres', '启动 PostgreSQL 服务以同步 SpiceDB 凭据');

    // 只启动 PostgreSQL 服务，--pull never 表示不要在这里拉镜像，镜像拉取由前面的 pull 步骤负责。
    await runDockerComposeCommand(config, ['up', '-d', '--pull', 'never', 'shiro-nya-postgres']);

    await logDeployMessage(config, 'spicedb postgres', '等待 PostgreSQL 就绪');
    await runDockerComposeCommand(
        config,
        [
            'exec',
            '-T',
            'shiro-nya-postgres',
            'sh',
            '-lc',
            [
                // set -e：命令失败时退出；set -u：未定义变量时报错。
                'set -eu',
                // 最多等待 60 秒，pg_isready 成功就 exit 0。
                'for i in $(seq 1 60); do',
                '  if pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then exit 0; fi',
                '  sleep 1',
                'done',
                // 循环结束仍未成功时，再执行一次 pg_isready，让错误原因进入日志。
                'pg_isready -U "$POSTGRES_USER" -d postgres'
            ].join('\n')
        ],
        { title: 'wait for postgres' }
    );

    await logDeployMessage(config, 'spicedb postgres', '同步 PostgreSQL 数据库、角色和 SpiceDB 凭据');
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
            'ADMIN_POSTGRES_DB',
            '-e',
            'APP_POSTGRES_DB',
            '-e',
            'SPICEDB_POSTGRES_USER',
            '-e',
            'SPICEDB_POSTGRES_PASSWORD',
            '-e',
            'SPICEDB_POSTGRES_DB',
            'shiro-nya-postgres',
            'sh',
            '-lc',
            [
                'set -eu',
                // `: "${VAR:=default}"` 是 POSIX shell 写法：如果变量为空或未设置，就赋默认值。
                ': "${ADMIN_POSTGRES_DB:=admin_api_db}"',
                ': "${APP_POSTGRES_DB:=app_api_db}"',
                // psql -v ON_ERROR_STOP=1 表示 SQL 任意语句失败就让 psql 非 0 退出。
                'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \\',
                // 下面的 -v 把 shell 环境变量安全传给 psql 变量。
                '  -v postgres_user="$POSTGRES_USER" \\',
                '  -v postgres_password="$POSTGRES_PASSWORD" \\',
                '  -v admin_db="$ADMIN_POSTGRES_DB" \\',
                '  -v app_db="$APP_POSTGRES_DB" \\',
                '  -v spicedb_user="$SPICEDB_POSTGRES_USER" \\',
                '  -v spicedb_password="$SPICEDB_POSTGRES_PASSWORD" \\',
                '  -v spicedb_db="$SPICEDB_POSTGRES_DB" <<\'SQL\'',
                // format('%I', value) 用于 SQL 标识符，例如角色名/数据库名，能正确处理特殊字符和引号。
                // format('%L', value) 用于 SQL 字面量，例如密码，能正确转义。
                // \gexec 是 psql 元命令：把 SELECT 生成的 SQL 文本再执行一次。
                "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'postgres_user', :'postgres_password') \\gexec",
                "SELECT format('CREATE DATABASE %I OWNER %I', :'admin_db', :'postgres_user')",
                "WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'admin_db') \\gexec",
                "SELECT format('ALTER DATABASE %I OWNER TO %I', :'admin_db', :'postgres_user') \\gexec",
                "SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'postgres_user')",
                "WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_db') \\gexec",
                "SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'postgres_user') \\gexec",
                "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'spicedb_user', :'spicedb_password')",
                "WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'spicedb_user') \\gexec",
                "SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'spicedb_user', :'spicedb_password') \\gexec",
                "SELECT format('CREATE DATABASE %I OWNER %I', :'spicedb_db', :'spicedb_user')",
                "WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'spicedb_db') \\gexec",
                "SELECT format('ALTER DATABASE %I OWNER TO %I', :'spicedb_db', :'spicedb_user') \\gexec",
                'SQL'
            ].join('\n')
        ],
        {
            // 把 DeployConfig.env 注入 docker compose exec，使容器内 shell 能读取 POSTGRES_* 变量。
            env: config.env,
            title: 'sync spicedb postgres credentials'
        }
    );
    await logDeployMessage(config, 'spicedb postgres', 'PostgreSQL 与 SpiceDB 凭据同步完成');
}

/**
 * 执行 SpiceDB datastore migration。
 *
 * SpiceDB 的授权数据存储在 PostgreSQL 中，migration 会创建/更新 SpiceDB 自己需要的内部表。
 */
export async function migrateSpiceDbDatastore(config: DeployConfig): Promise<void> {
    // datastoreUrl 作为 spicedb migration 参数直接写入日志，便于部署人员核对实际连接串。
    const datastoreUrl = spiceDbDatastoreUrl(config);

    await logDeployMessage(config, 'spicedb migrate', '停止 admin-api-spicedb 以执行 datastore migration');
    // 停止正在运行的 SpiceDB，避免 migration 和服务进程同时操作 datastore。
    await runDockerComposeCommand(config, ['stop', spicedbServiceName]);
    await logDeployMessage(config, 'spicedb migrate', '执行 SpiceDB datastore migration');
    await runDockerComposeCommand(
        config,
        [
            'run',
            // --rm 表示 migration 容器执行完后自动删除。
            '--rm',
            // --no-deps 表示只运行 admin-api-spicedb 这个服务，不额外启动依赖。
            '--no-deps',
            spicedbServiceName,
            'migrate',
            'head',
            // 明确 datastore engine 是 postgres。
            '--datastore-engine=postgres',
            `--datastore-conn-uri=${datastoreUrl}`,
            // 跳过 release check，避免离线或网络受限环境因为检查版本而失败。
            '--skip-release-check=true'
        ],
        {
            title: 'migrate spicedb datastore'
        }
    );
    await logDeployMessage(config, 'spicedb migrate', 'SpiceDB datastore migration 完成');
}

/**
 * 发布项目的 SpiceDB schema。
 *
 * 重要区别：
 * - `migrateSpiceDbDatastore` 只处理 SpiceDB 内部 datastore 表结构。
 * - 这个函数把业务授权模型写进 SpiceDB，例如 user、role、menu 等 object definition。
 *
 * 如果少了这一步，应用启动后调用 SpiceDB 会报：
 * - `object definition 'menu' not found`
 * - `object definition 'role' not found`
 */
export async function publishSpiceDbSchema(config: DeployConfig): Promise<void> {
    await logDeployMessage(config, 'spicedb schema', '读取项目 SpiceDB schema 文件');
    const schema = await fs.readFile(config.runtimeSpiceDbSchemaPath, 'utf8');

    if (!schema.trim()) {
        throw new Error(`SpiceDB schema 文件为空：${config.runtimeSpiceDbSchemaPath}`);
    }

    await logDeployMessage(config, 'spicedb schema', '启动 SpiceDB 服务以发布 schema');
    await runDockerComposeCommand(config, ['up', '-d', '--pull', 'never', spicedbServiceName], {
        title: 'start spicedb for schema publish'
    });

    const client = createDeploySpiceDbClient(config);
    try {
        await logDeployMessage(config, 'spicedb schema', '等待 SpiceDB gRPC 服务就绪');
        await waitForSpiceDbGrpc(client);

        await logDeployMessage(config, 'spicedb schema', `写入 schema: ${config.runtimeSpiceDbSchemaPath}`);
        const response = await client.promises.writeSchema(v1.WriteSchemaRequest.create({ schema }));
        const writtenAt = response.writtenAt?.token;
        await logDeployMessage(
            config,
            'spicedb schema',
            writtenAt ? `SpiceDB schema 发布完成，revision=${writtenAt}` : 'SpiceDB schema 发布完成'
        );
    } finally {
        // gRPC client 会持有 HTTP/2 channel；发布完成后显式关闭，避免部署脚本进程被连接拖住。
        client.close();
    }
}
