import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage } from './command.ts';
import { syncMongoRootUser } from './mongodb-sync.ts';
import { migrateSpiceDbDatastore, syncSpiceDbPostgres } from './spicedb-sync.ts';

/**
 * 文件作用：
 * 这个模块负责把“有状态服务”的同步动作串起来。
 *
 * 有状态服务指有数据卷、有持久化数据的服务，例如 PostgreSQL、SpiceDB datastore、MongoDB。
 * 这些服务不能只靠重新启动容器完成配置更新，因为数据目录已经存在时，官方镜像初始化逻辑通常不会重复执行。
 */

/**
 * 同步部署环境里的有状态服务凭据和结构。
 *
 * 顺序不能随便改：
 * 1. 先同步 PostgreSQL 角色和数据库，因为 SpiceDB datastore 依赖 PostgreSQL。
 * 2. 再执行 SpiceDB migration，因为它需要可用的 datastore 连接串。
 * 3. 最后同步 MongoDB root 用户，因为它独立于 PostgreSQL/SpiceDB。
 */
export async function syncStatefulServiceCredentials(config: DeployConfig): Promise<void> {
    await logDeployMessage(config, 'stateful sync', '开始同步 PostgreSQL / SpiceDB 凭据');
    // 确保 PostgreSQL 中的业务库、SpiceDB 库和对应角色存在且密码正确。
    await syncSpiceDbPostgres(config);

    await logDeployMessage(config, 'stateful sync', '开始迁移 SpiceDB datastore');
    // 创建或升级 SpiceDB 自己需要的 datastore 表结构。
    await migrateSpiceDbDatastore(config);

    await logDeployMessage(config, 'stateful sync', '开始同步 MongoDB root 凭据');
    // 如果 MongoDB 数据卷已经初始化，离线更新 root 用户密码。
    await syncMongoRootUser(config);

    await logDeployMessage(config, 'stateful sync', '有状态服务凭据同步完成');
}
