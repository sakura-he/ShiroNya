import { execa } from 'execa';

import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage, runLoggedCommand } from './command.ts';
import { runDockerComposeCommand } from './docker-compose.ts';

/**
 * 文件作用：
 * 这个模块负责同步 MongoDB root 用户凭据。
 *
 * MongoDB 的官方初始化变量只在“第一次创建数据目录”时生效。
 * 如果数据卷已经存在，单纯修改 env 不会自动更新 root 密码。
 * 所以这里会在已有数据卷场景下，短暂停止 MongoDB 服务，挂载数据卷运行一个临时维护容器来更新用户。
 */

/** 检查 Docker volume 是否存在。 */
async function dockerVolumeExists(volumeName: string): Promise<boolean> {
    try {
        // `docker volume inspect` 成功表示 volume 存在；失败表示不存在或 Docker 不可用。
        await execa('docker', ['volume', 'inspect', volumeName], { stdout: 'ignore', stderr: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * 判断 MongoDB 数据卷里是否已经有真实数据库数据。
 *
 * WiredTiger 和 storage.bson 是 MongoDB 数据目录里的典型文件。
 * 如果都没有，说明 volume 还没初始化，不需要离线改 root 用户。
 */
async function dockerVolumeHasMongoData(volumeName: string): Promise<boolean> {
    try {
        await execa(
            'docker',
            [
                'run',
                // --rm 表示临时容器退出后自动删除。
                '--rm',
                // :ro 表示只读挂载，这里只是检查数据是否存在，不应该修改数据卷。
                '-v',
                `${volumeName}:/data/db:ro`,
                'mongo:4.4',
                'sh',
                '-lc',
                'test -f /data/db/WiredTiger -o -f /data/db/storage.bson'
            ],
            { stdout: 'ignore', stderr: 'ignore' }
        );
        return true;
    } catch {
        return false;
    }
}

/**
 * 同步 MongoDB root 用户名和密码。
 *
 * 逻辑说明：
 * 1. 数据卷不存在：说明 MongoDB 还没初始化，跳过，后续 compose 首次启动会用 env 初始化。
 * 2. 数据卷存在但为空：同样跳过。
 * 3. 数据卷已有数据：停止 MongoDB 服务，用 noauth 模式临时启动 mongod，更新/创建 root 用户。
 */
export async function syncMongoRootUser(config: DeployConfig): Promise<void> {
    const volumeName = 'shiro-nya-mongodb-data';
    await logDeployMessage(config, 'mongodb', `检查 MongoDB 数据卷: ${volumeName}`);
    if (!(await dockerVolumeExists(volumeName))) {
        await logDeployMessage(config, 'mongodb', 'MongoDB 数据卷不存在，跳过 root 凭据同步');
        return;
    }

    if (!(await dockerVolumeHasMongoData(volumeName))) {
        await logDeployMessage(config, 'mongodb', 'MongoDB 数据卷为空，跳过 root 凭据同步');
        return;
    }

    // 离线维护前先停掉 compose 管理的 MongoDB，避免两个 mongod 同时写同一个数据目录。
    await logDeployMessage(config, 'mongodb', '停止 MongoDB 服务以执行离线凭据同步');
    await runDockerComposeCommand(config, ['stop', 'shiro-nya-mongodb']);

    // maintenanceScript 会在临时 mongo:4.4 容器内部执行。
    // 使用数组 join('\n') 组装脚本，比手写一个超长字符串更容易维护。
    const maintenanceScript = [
        // set -e：任意命令失败就退出；set -u：引用未定义变量时报错。
        'set -eu',
        // noauth 模式启动 mongod，这样可以在不知道旧密码的情况下修改 root 用户。
        'mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017 --fork --logpath /tmp/mongod.log --noauth',
        // cleanup 函数用于脚本退出时关闭临时 mongod。
        'cleanup() { mongod --shutdown --dbpath /data/db >/dev/null 2>&1 || true; }',
        // trap cleanup EXIT 表示无论成功失败，退出前都执行 cleanup。
        'trap cleanup EXIT',
        // 最多等待 60 秒，直到临时 mongod 响应 ping。
        'for i in $(seq 1 60); do',
        '  if mongo admin --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; then break; fi',
        '  if [ "$i" = "60" ]; then cat /tmp/mongod.log >&2; exit 1; fi',
        '  sleep 1',
        'done',
        [
            // mongo --eval 后面的 JavaScript 在 Mongo shell 内执行。
            "mongo admin --quiet --eval '",
            // _getEnv 从容器环境变量读取部署配置。
            'const username = _getEnv("MONGO_USER");',
            'const password = _getEnv("MONGO_PASSWORD");',
            'const database = _getEnv("MONGO_DB") || "admin";',
            'if (!username || !password) { throw new Error("MONGO_USER and MONGO_PASSWORD are required"); }',
            'const admin = db.getSiblingDB("admin");',
            // root 角色必须绑定 admin 数据库。
            'const roles = [{ role: "root", db: "admin" }];',
            'if (admin.getUser(username)) {',
            // 用户存在就更新密码和角色。
            '  admin.updateUser(username, { pwd: password, roles });',
            '} else {',
            // 用户不存在就创建 root 用户。
            '  admin.createUser({ user: username, pwd: password, roles });',
            '}',
            // 写入再删除探针集合，验证目标业务库可访问。
            'db.getSiblingDB(database).getCollection("__shiro_nya_deploy_probe__").insertOne({ at: new Date() });',
            'db.getSiblingDB(database).getCollection("__shiro_nya_deploy_probe__").drop();',
            'print("MongoDB credentials synced");',
            "'"
        ].join(' ')
    ].join('\n');

    await runLoggedCommand(
        config,
        'docker',
        [
            'run',
            '--rm',
            // 读写挂载 MongoDB 数据卷，临时 mongod 会直接修改里面的用户信息。
            '-v',
            'shiro-nya-mongodb-data:/data/db',
            '-v',
            'shiro-nya-mongodb-config-data:/data/configdb',
            // -e 不带值时，Docker 会从当前进程 env 中取同名变量传入容器。
            '-e',
            'MONGO_USER',
            '-e',
            'MONGO_PASSWORD',
            '-e',
            'MONGO_DB',
            'mongo:4.4',
            'sh',
            '-lc',
            maintenanceScript
        ],
        {
            env: {
                // 继承 PATH、Docker 相关变量。
                ...process.env,
                // 把部署配置里的 MONGO_USER/MONGO_PASSWORD/MONGO_DB 注入给 docker run。
                ...config.env
            },
            title: 'sync mongodb root credentials'
        }
    );
    await logDeployMessage(config, 'mongodb', 'MongoDB root 凭据同步完成');
}
