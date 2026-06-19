import type { DeployConfig, DeployStep } from '../../core/types.ts';
import { syncApplicationDatabaseSchemas } from './database-schema.ts';
import { runDockerComposeCommand } from './docker-compose.ts';
import { runDockerComposePull } from './docker-pull.ts';
import { writeApplicationEnvFiles } from './env-files.ts';
import { seedOpenSourceInitialData } from './seed-data.ts';
import { syncStatefulServiceCredentials } from './stateful-sync.ts';

/**
 * 文件作用：
 * 这个模块只定义“立即部署”阶段的步骤列表。
 *
 * orchestrator.ts 负责基础步骤，例如写 env、复制配置、生成证书。
 * 如果用户选择 deployNow=true，才会追加这里的步骤。
 */

/**
 * 创建需要实际操作 Docker 的部署步骤。
 *
 * 顺序说明：
 * 1. 先拉镜像，避免后面启动服务时才发现镜像下载失败。
 * 2. 拉完镜像后刷新应用环境文件，可以读取镜像内置 `.env.production` 作为默认值。
 * 3. 同步 PostgreSQL/SpiceDB/MongoDB 这类有状态服务的账号和库。
 * 4. 同步业务数据库结构。
 * 5. 执行开源版初始化 SQL，填充账号、权限、菜单和演示数据。
 * 6. 启动 Compose 服务。
 */
export function createDeployNowSteps(config: DeployConfig): DeployStep[] {
    return [
        {
            title: '拉取 Docker 镜像',
            action: (context) => runDockerComposePull(config, context)
        },
        {
            title: '刷新应用运行环境',
            action: () => writeApplicationEnvFiles(config, true)
        },
        {
            title: '同步有状态服务凭据',
            action: () => syncStatefulServiceCredentials(config)
        },
        {
            title: '同步业务数据库结构',
            action: () => syncApplicationDatabaseSchemas(config)
        },
        {
            title: '初始化开源版数据库数据',
            action: () => seedOpenSourceInitialData(config)
        },
        {
            title: '启动 Docker Compose 服务',
            action: () => runDockerComposeCommand(config, ['up', '-d', '--pull', 'never'])
        }
    ];
}
