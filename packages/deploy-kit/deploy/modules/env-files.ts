import { parse as parseDotenv } from 'dotenv';
import { execa } from 'execa';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';

import type { DeployConfig } from '../../core/types.ts';
import { shiroNyaAppImage } from './constants.ts';
import { databaseUrl, mongodbUrl } from './connection-strings.ts';
import { logDeployMessage } from './command.ts';

/**
 * 文件作用：
 * 这个模块负责生成部署目录里的环境变量文件。
 *
 * 它会写三类文件：
 * 1. 部署根目录 `.env`：给 Docker Compose 使用。
 * 2. `grafana-loki/.env`：给 Grafana 单独使用。
 * 3. `docker/config/admin-api/.env.production` 和 `docker/config/app-api/.env.production`：给应用容器使用。
 *
 * 新手注意：
 * - `.env` 不是 TypeScript 对象，最终必须写成 `KEY=value` 的纯文本。
 * - 应用容器里的地址大量使用 `127.0.0.1`，是因为 compose 内部通过 sidecar/proxy/端口映射组织服务。
 */

/**
 * 把键值对象格式化成 env 文件文本。
 *
 * 每一行是 `KEY=value`。
 * 这里不额外加引号，因为当前配置值由向导生成或用户输入，调用方需要保证值适合 env 文件格式。
 */
export function formatEnv(values: Record<string, string>): string {
    return Object.entries(values)
        // Object.entries 会把对象转成 [key, value] 数组；map 再把每一项拼成 env 行。
        .map(([key, value]) => `${key}=${value}`)
        // os.EOL 使用当前系统换行符，Windows 下是 CRLF，Linux/macOS 下是 LF。
        .join(os.EOL);
}

/**
 * 写主 env 和 Grafana env。
 *
 * 主 env 给 Docker Compose 的 `${VAR}` 变量使用。
 * Grafana env 单独拆出来，是为了让 Grafana 密码等配置可以被 Grafana 服务独立加载。
 */
export async function writeEnvFiles(config: DeployConfig): Promise<void> {
    // 部署根目录不存在时先创建。
    await fs.ensureDir(config.targetRoot);

    // grafanaEnvFile 位于 grafana-loki/.env，写文件前要先确保父目录存在。
    await fs.ensureDir(nodePath.dirname(config.grafanaEnvFile));

    // 文件末尾补一个换行，符合常见 env 文件格式，也方便 shell/cat 查看。
    await fs.writeFile(config.envFile, `${formatEnv(config.env)}${os.EOL}`, 'utf8');
    await fs.writeFile(config.grafanaEnvFile, `${formatEnv(config.grafanaEnv)}${os.EOL}`, 'utf8');
    await logDeployMessage(config, 'config env', `写入主环境文件: ${config.envFile}`);
    await logDeployMessage(config, 'config env', `写入 Grafana 环境文件: ${config.grafanaEnvFile}`);
    await logDeployMessage(
        config,
        'config env',
        `主配置 ${Object.keys(config.env).length} 项，Grafana 配置 ${Object.keys(config.grafanaEnv).length} 项`
    );
}

/**
 * 从镜像里读取默认 `.env.production`。
 *
 * 读取方式说明：
 * - `docker run --rm` 启动一个临时容器，命令结束后自动删除。
 * - `--pull never` 禁止这里隐式拉镜像；镜像拉取由 docker-pull 步骤负责。
 * - `--entrypoint sh` 覆盖镜像默认启动命令，只运行 shell 读取文件。
 * - `2>/dev/null || true` 表示文件不存在时不报错，返回空配置。
 */
async function readImageEnvProduction(image: string): Promise<Record<string, string>> {
    try {
        const { stdout } = await execa('docker', [
            'run',
            '--rm',
            '--pull',
            'never',
            '--entrypoint',
            'sh',
            image,
            '-lc',
            'cat /app/.env.production 2>/dev/null || true'
        ]);
        // stdout 是 env 文件文本，解析成对象后再和部署配置合并。
        return parseDotenv(stdout);
    } catch {
        // 读取失败不阻塞部署；调用方会继续使用部署配置生成必要变量。
        return {};
    }
}

/** 读取端口配置；如果用户没有显式填写，就使用公开部署默认端口。 */
function configuredPort(config: DeployConfig, key: string, fallback: string): string {
    // trim 可以处理用户手动编辑 .env 时留下的空格；空字符串继续回退默认值。
    return config.env[key]?.trim() || fallback;
}

/** 生成 localhost HTTP URL。 */
function localhostUrl(port: string): string {
    return `http://localhost:${port}`;
}

/** 生成 127.0.0.1 HTTP URL。 */
function loopbackUrl(port: string): string {
    return `http://127.0.0.1:${port}`;
}

/** 读取公开访问 origin；没有配置时回退到 localhost + 对应端口。 */
function configuredOrigin(config: DeployConfig, key: string, fallbackPort: string): string {
    return config.env[key]?.trim() || localhostUrl(fallbackPort);
}

/** 判断公开访问 origin 是否使用 HTTPS。 */
function isHttpsOrigin(origin: string): boolean {
    try {
        return new URL(origin).protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * 去重并拼成英文逗号分隔的 origin 列表。
 *
 * 特殊字符说明：
 * - `,` 是 env 中多个 origin 的分隔符，所以 origin 本身不能包含逗号。
 * - `exp://*` 中的 `*` 是 Expo 开发地址通配写法，Better Auth 原有配置已经使用它。
 * - `shironya://` 是移动端自定义 scheme，不是普通 HTTP URL，但 Better Auth trustedOrigins 支持这类来源声明。
 */
function commaSeparatedOrigins(origins: string[]): string {
    return [...new Set(origins.map((origin) => origin.trim()).filter(Boolean))].join(',');
}

/** 生成 admin-api 认证域和浏览器跨域白名单。 */
function adminWebOrigins(config: DeployConfig): string {
    const adminApiPort = configuredPort(config, 'ADMIN_API_PORT', '57300');
    const adminWebPort = configuredPort(config, 'ADMIN_WEB_PORT', '57301');
    const adminApiPublicOrigin = configuredOrigin(config, 'ADMIN_API_PUBLIC_ORIGIN', adminApiPort);
    const adminWebPublicOrigin = configuredOrigin(config, 'ADMIN_WEB_PUBLIC_ORIGIN', adminWebPort);

    return commaSeparatedOrigins([
        adminWebPublicOrigin,
        adminApiPublicOrigin,
        localhostUrl(adminWebPort),
        loopbackUrl(adminWebPort),
        localhostUrl(adminApiPort),
        loopbackUrl(adminApiPort),
        // 常用 Vite 开发端口保留在白名单里，方便开源用户本地调试前端。
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5176',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5176'
    ]);
}

/** 生成 app-api 认证域和跨域白名单。 */
function appOrigins(config: DeployConfig): string {
    const appApiPort = configuredPort(config, 'APP_API_PORT', '3001');
    const adminWebPort = configuredPort(config, 'ADMIN_WEB_PORT', '57301');
    const appApiPublicOrigin = configuredOrigin(config, 'APP_API_PUBLIC_ORIGIN', appApiPort);
    const adminWebPublicOrigin = configuredOrigin(config, 'ADMIN_WEB_PUBLIC_ORIGIN', adminWebPort);

    return commaSeparatedOrigins([
        appApiPublicOrigin,
        adminWebPublicOrigin,
        localhostUrl(appApiPort),
        loopbackUrl(appApiPort),
        localhostUrl(adminWebPort),
        loopbackUrl(adminWebPort),
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5176',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5176',
        'shironya://',
        'exp://*'
    ]);
}

/**
 * 生成应用容器必须覆盖的环境变量。
 *
 * 为什么叫 overrides：
 * - 如果 useImageDefaults=true，会先从镜像读取默认 env。
 * - 这里返回的值会覆盖镜像默认值，确保数据库、Redis、SpiceDB、Cerbos 指向当前部署环境。
 */
function applicationEnvOverrides(config: DeployConfig, service: 'admin-api' | 'app-api'): Record<string, string> {
    // 数据库名允许配置覆盖；缺省值和配置向导默认值保持一致。
    const adminDatabase = config.env.ADMIN_POSTGRES_DB ?? 'admin_api_db';
    const appDatabase = config.env.APP_POSTGRES_DB ?? 'app_api_db';

    // admin-api 和 app-api 的 Redis 用户、端口不同，下面用 isAdmin 分支选择。
    const isAdmin = service === 'admin-api';
    const redisScope = isAdmin ? 'ADMIN' : 'APP';
    const redisPort = isAdmin ? (config.env.ADMIN_REDIS_PORT ?? '17379') : (config.env.APP_REDIS_PORT ?? '26379');
    const redisUser = isAdmin ? config.env.ADMIN_REDIS_USER : config.env.APP_REDIS_USER;
    const redisPassword = isAdmin ? config.env.ADMIN_REDIS_PASSWORD : config.env.APP_REDIS_PASSWORD;
    const adminApiPort = configuredPort(config, 'ADMIN_API_PORT', '57300');
    const appApiPort = configuredPort(config, 'APP_API_PORT', '3001');
    const adminApiPublicOrigin = configuredOrigin(config, 'ADMIN_API_PUBLIC_ORIGIN', adminApiPort);
    const appApiPublicOrigin = configuredOrigin(config, 'APP_API_PUBLIC_ORIGIN', appApiPort);
    const adminOrigins = adminWebOrigins(config);
    const applicationOrigins = appOrigins(config);

    return {
        // 明确生产模式，避免应用读取开发配置。
        NODE_ENV: 'production',
        // APP_NAME 被 admin-api/app-api 的 Better Auth 配置读取，用于认证应用名称。
        APP_NAME: config.env.APP_NAME ?? 'Shiro Nya',
        // 显式写入服务端口，避免容器内应用回退到镜像默认值。
        ADMIN_API_PORT: adminApiPort,
        APP_API_PORT: appApiPort,
        // Better Auth 和 JWT 密钥来自部署向导，不能依赖镜像里的示例值。
        ADMIN_BETTER_AUTH_SECRET: config.env.ADMIN_BETTER_AUTH_SECRET,
        BETTER_AUTH_SECRET: config.env.BETTER_AUTH_SECRET,
        JWT_SIGNING_KEY: config.env.JWT_SIGNING_KEY,
        // Better Auth baseURL 使用公开访问来源；服务路径仍由应用代码里的 basePath 决定。
        ADMIN_BETTER_AUTH_URL: adminApiPublicOrigin,
        BETTER_AUTH_URL: appApiPublicOrigin,
        // trustedOrigins 和 CORS 使用同一组派生来源，避免登录接口通过但浏览器跨域失败，或反过来。
        ADMIN_BETTER_AUTH_TRUSTED_ORIGINS: adminOrigins,
        ADMIN_CORS_ORIGINS: adminOrigins,
        APP_BETTER_AUTH_TRUSTED_ORIGINS: applicationOrigins,
        APP_CORS_ORIGINS: applicationOrigins,
        // HTTPS 公开访问时必须启用 secure cookie；本地 HTTP 部署保持 false。
        ADMIN_BETTER_AUTH_COOKIE_SECURE: String(isHttpsOrigin(adminApiPublicOrigin)),
        APP_BETTER_AUTH_COOKIE_SECURE: String(isHttpsOrigin(appApiPublicOrigin)),
        // admin-api 作为客户端访问 app-api gRPC；app-api 在 0.0.0.0 监听，admin-api 通过 127.0.0.1 连接。
        APP_USER_ADMIN_GRPC_HOST: '0.0.0.0',
        APP_USER_ADMIN_GRPC_CLIENT_HOST: '127.0.0.1',
        APP_USER_ADMIN_GRPC_PORT: '50051',
        APP_USER_ADMIN_GRPC_TLS_CA_PATH: '/app/certs/app-user-admin-grpc/ca.crt',
        APP_USER_ADMIN_GRPC_TLS_SERVER_CERT_PATH: '/app/certs/app-user-admin-grpc/server.crt',
        APP_USER_ADMIN_GRPC_TLS_SERVER_KEY_PATH: '/app/certs/app-user-admin-grpc/server.key',
        APP_USER_ADMIN_GRPC_TLS_CLIENT_CERT_PATH: '/app/certs/app-user-admin-grpc/client.crt',
        APP_USER_ADMIN_GRPC_TLS_CLIENT_KEY_PATH: '/app/certs/app-user-admin-grpc/client.key',
        APP_USER_ADMIN_GRPC_TLS_SERVER_NAME: 'localhost',
        // 两个数据库 URL 都写入，便于 admin-api/app-api 中需要跨库配置的场景。
        ADMIN_DATABASE_URL: databaseUrl(config, adminDatabase),
        APP_DATABASE_URL: databaseUrl(config, appDatabase),
        MONGODB_URI: mongodbUrl(config),
        // 通用 REDIS_* 给旧式或共享 Redis 配置读取；下面的 ADMIN_/APP_ 前缀给明确服务读取。
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: redisPort,
        REDIS_USER: redisUser,
        REDIS_PASSWORD: redisPassword,
        // 计算属性名：`${redisScope}_REDIS_HOST` 会变成 ADMIN_REDIS_HOST 或 APP_REDIS_HOST。
        [`${redisScope}_REDIS_HOST`]: '127.0.0.1',
        [`${redisScope}_REDIS_PORT`]: redisPort,
        [`${redisScope}_REDIS_USER`]: redisUser,
        [`${redisScope}_REDIS_PASSWORD`]: redisPassword,
        ADMIN_REDIS_HOST: '127.0.0.1',
        ADMIN_REDIS_PORT: config.env.ADMIN_REDIS_PORT ?? '17379',
        ADMIN_REDIS_USER: config.env.ADMIN_REDIS_USER,
        ADMIN_REDIS_PASSWORD: config.env.ADMIN_REDIS_PASSWORD,
        APP_REDIS_HOST: '127.0.0.1',
        APP_REDIS_PORT: config.env.APP_REDIS_PORT ?? '26379',
        APP_REDIS_USER: config.env.APP_REDIS_USER,
        APP_REDIS_PASSWORD: config.env.APP_REDIS_PASSWORD,
        // 应用容器访问 SpiceDB/Cerbos 时走容器内部本地端口或本地代理。
        ADMIN_SPICEDB_ENDPOINT: '127.0.0.1:50052',
        ADMIN_SPICEDB_TOKEN: config.env.SPICEDB_GRPC_PRESHARED_KEY,
        ADMIN_SPICEDB_INSECURE: 'true',
        ADMIN_SPICEDB_TLS_ENABLED: 'false',
        APP_SPICEDB_ENDPOINT: '127.0.0.1:50052',
        APP_SPICEDB_TOKEN: config.env.SPICEDB_GRPC_PRESHARED_KEY,
        APP_SPICEDB_INSECURE: 'true',
        APP_SPICEDB_TLS_ENABLED: 'false',
        ADMIN_SPICEDB_KAFKA_BROKERS: '127.0.0.1:19092',
        APP_SPICEDB_KAFKA_BROKERS: '127.0.0.1:19092',
        APP_CERBOS_ENDPOINT: '127.0.0.1:3592',
        APP_CERBOS_TLS_ENABLED: 'false',
        ADMIN_CERBOS_ENDPOINT: '127.0.0.1:3692',
        ADMIN_CERBOS_TLS_ENABLED: 'false'
    };
}

/**
 * 写 admin-api 和 app-api 的生产环境文件。
 *
 * useImageDefaults:
 * - false：只写部署工具生成的必要配置。
 * - true：先读取镜像内置 `.env.production`，再用部署配置覆盖关键项。
 */
export async function writeApplicationEnvFiles(config: DeployConfig, useImageDefaults = false): Promise<void> {
    // 两个服务的输出路径固定在目标 docker/config 下，compose.generated.yaml 会只读挂载这些文件。
    const targets = [
        {
            service: 'admin-api' as const,
            image: shiroNyaAppImage('admin-api', config.env),
            output: nodePath.join(config.targetDockerDir, 'config', 'admin-api', '.env.production')
        },
        {
            service: 'app-api' as const,
            image: shiroNyaAppImage('app-api', config.env),
            output: nodePath.join(config.targetDockerDir, 'config', 'app-api', '.env.production')
        }
    ];

    for (const target of targets) {
        await logDeployMessage(
            config,
            `${target.service} env`,
            useImageDefaults ? `读取镜像默认环境: ${target.image}` : '使用部署配置生成环境文件'
        );

        // 需要镜像默认值时读取，否则从空对象开始。
        const base = useImageDefaults ? await readImageEnvProduction(target.image) : {};

        // 后面的 applicationEnvOverrides 覆盖 base，确保部署环境里的连接串和凭据优先生效。
        const merged = {
            ...base,
            ...applicationEnvOverrides(config, target.service)
        };

        // 写文件前先创建父目录，例如 docker/config/admin-api。
        await fs.ensureDir(nodePath.dirname(target.output));
        await fs.writeFile(target.output, `${formatEnv(merged)}${os.EOL}`, 'utf8');
        await logDeployMessage(
            config,
            `${target.service} env`,
            `写入 ${target.output}，共 ${Object.keys(merged).length} 项`
        );
    }
}

/**
 * 创建应用运行时需要持久化的目录。
 *
 * 这些目录会被 Docker volume bind mount 到容器里。
 */
export async function ensureRuntimeDirs(config: DeployConfig): Promise<void> {
    // static/uploads/chunks/merge/logs 是应用上传、分片、合并、静态资源和日志目录。
    const dirs = [
        nodePath.join(config.targetRoot, 'admin-api', 'static'),
        nodePath.join(config.targetRoot, 'admin-api', 'uploads'),
        nodePath.join(config.targetRoot, 'admin-api', 'chunks'),
        nodePath.join(config.targetRoot, 'admin-api', 'merge'),
        nodePath.join(config.targetRoot, 'admin-api', 'logs'),
        nodePath.join(config.targetRoot, 'app-api', 'static'),
        nodePath.join(config.targetRoot, 'app-api', 'uploads'),
        nodePath.join(config.targetRoot, 'app-api', 'chunks'),
        nodePath.join(config.targetRoot, 'app-api', 'merge'),
        nodePath.join(config.targetRoot, 'app-api', 'logs'),
        config.targetLogDir
    ];

    for (const dir of dirs) {
        // ensureDir 是幂等的：目录存在就不做事，不存在就创建。
        await fs.ensureDir(dir);
        await logDeployMessage(config, 'runtime dirs', `确保目录存在: ${dir}`);
    }
}
