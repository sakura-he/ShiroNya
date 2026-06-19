import type { DeployConfig } from '../../core/types.ts';

/**
 * 文件作用：
 * 这个模块把 DeployConfig 中的用户名、密码、数据库名转换成服务连接串。
 *
 * 注意：
 * - 连接串会进入部署日志，方便部署人员确认实际连接目标。
 * - 密码优先使用 `*_URLENCODED`，因为密码里可能包含 `@`、`:`、`/`、`#` 等 URL 特殊字符。
 * - 如果不编码，这些字符会被误认为 URL 语法的一部分，导致连接失败。
 */

/**
 * 生成 PostgreSQL 连接串。
 *
 * `postgresql://user:password@host:port/database` 是 Prisma 支持的标准格式。
 * 这里使用 `127.0.0.1:15432`，因为部署脚本在宿主机上执行 Prisma，而 PostgreSQL 容器把 5432 映射到宿主机 15432。
 */
export function databaseUrl(config: DeployConfig, databaseName: string): string {
    const user = config.env.POSTGRES_USER;
    const password = config.env.POSTGRES_PASSWORD_URLENCODED ?? encodeURIComponent(config.env.POSTGRES_PASSWORD ?? '');
    return `postgresql://${user}:${password}@127.0.0.1:15432/${databaseName}`;
}

/**
 * 生成“应用容器内部”使用的 PostgreSQL 连接串。
 *
 * 这个函数和 databaseUrl 的区别非常重要：
 * - databaseUrl 给部署脚本本身使用，部署脚本运行在宿主机上，所以要连 `127.0.0.1:15432`。
 * - containerDatabaseUrl 给 admin-api/app-api 容器使用，容器运行在 Docker bridge 网络里，所以要连服务名 `shiro-nya-postgres:5432`。
 *
 * 如果容器里继续写 `127.0.0.1`，意思会变成“连接当前应用容器自己”，而不是连接 PostgreSQL 容器。
 */
export function containerDatabaseUrl(config: DeployConfig, databaseName: string): string {
    const user = config.env.POSTGRES_USER;
    // URLENCODED 版本可以安全放进 URL 的 userinfo 段，避免密码里的 @、:、/、# 被当成 URL 结构字符。
    const password = config.env.POSTGRES_PASSWORD_URLENCODED ?? encodeURIComponent(config.env.POSTGRES_PASSWORD ?? '');
    return `postgresql://${user}:${password}@shiro-nya-postgres:5432/${databaseName}`;
}

/**
 * 生成 MongoDB 连接串。
 *
 * `authSource=admin` 表示用 admin 库校验 root 用户身份，即使实际业务库是 `MONGO_DB`。
 */
export function mongodbUrl(config: DeployConfig): string {
    const user = config.env.MONGO_USER;
    const password = config.env.MONGO_PASSWORD_URLENCODED ?? encodeURIComponent(config.env.MONGO_PASSWORD ?? '');
    return `mongodb://${user}:${password}@127.0.0.1:27017/${config.env.MONGO_DB}?authSource=admin`;
}

/**
 * 生成“应用容器内部”使用的 MongoDB 连接串。
 *
 * MongoDB 对宿主机暴露的是 `127.0.0.1:27017`，但应用容器之间应该通过 Docker 服务名访问。
 * 这里固定使用 `shiro-nya-mongodb:27017`，这样 Windows、Linux、macOS 的 Docker Desktop/Engine 都能按同一套网络规则工作。
 */
export function containerMongodbUrl(config: DeployConfig): string {
    const user = config.env.MONGO_USER;
    // MongoDB 密码同样要 URL 编码，否则特殊字符会破坏 mongodb:// 连接串。
    const password = config.env.MONGO_PASSWORD_URLENCODED ?? encodeURIComponent(config.env.MONGO_PASSWORD ?? '');
    return `mongodb://${user}:${password}@shiro-nya-mongodb:27017/${config.env.MONGO_DB}?authSource=admin`;
}

/**
 * 生成 SpiceDB 使用的 PostgreSQL datastore 连接串。
 *
 * 这里的 host 是 `shiro-nya-postgres`，不是 127.0.0.1，
 * 因为 SpiceDB migration 通过 Docker Compose 里的 SpiceDB 容器运行，容器之间通过 service name 访问。
 *
 * `sslmode=disable` 表示 SpiceDB 连接内部 Docker 网络里的 PostgreSQL 时不启用数据库 TLS。
 */
export function spiceDbDatastoreUrl(config: DeployConfig): string {
    const user = config.env.SPICEDB_POSTGRES_USER;
    const password =
        config.env.SPICEDB_POSTGRES_PASSWORD_URLENCODED ??
        encodeURIComponent(config.env.SPICEDB_POSTGRES_PASSWORD ?? '');
    return `postgres://${user}:${password}@shiro-nya-postgres:5432/${config.env.SPICEDB_POSTGRES_DB}?sslmode=disable`;
}
