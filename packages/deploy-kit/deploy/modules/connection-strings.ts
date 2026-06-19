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
