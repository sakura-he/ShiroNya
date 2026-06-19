import type { DeployConfig, DeployProgressReporter, DeployStep } from '../core/types.ts';
import { prepareDeploymentAssets } from './modules/assets.ts';
import { initializeDeployLog } from './modules/command.ts';
import { createDeployNowSteps } from './modules/deploy-steps.ts';
import { loginGhcrIfRequested, runDockerComposeCommand } from './modules/docker-compose.ts';
import { writeEnvFiles } from './modules/env-files.ts';
import { ensureDeployPrerequisites } from './modules/prerequisites.ts';
import { runDeploySteps } from './modules/progress.ts';

/**
 * 文件作用：
 * 这个文件是部署步骤编排器，负责决定“部署时先做什么、后做什么”。
 *
 * 它不关心每一步的内部细节：
 * - 复制 Docker 配置由 assets.ts 负责。
 * - 写 env 文件由 env-files.ts 负责。
 * - Docker Compose 命令由 docker-compose.ts 负责。
 * - 进度条和日志由 progress.ts / command.ts 负责。
 *
 * 这样拆分后，排查问题时可以先看这里确定步骤顺序，再去对应模块看具体实现。
 */

/**
 * 根据配置生成部署步骤列表。
 *
 * 顺序说明：
 * 1. 先初始化日志，因为后续任何失败都需要写入部署日志。
 * 2. 再检查依赖，避免用户填完配置后才发现 Docker/Prisma 不存在。
 * 3. GHCR 登录放在写文件前后都可以；这里放前面，便于及早发现镜像仓库凭据问题。
 * 4. 先写 env，再准备资产，因为资产生成时会用到目标目录和 env 相关路径。
 * 5. 如果 deployNow=false，只生成配置，不执行 Docker Compose。
 */
function deploySteps(config: DeployConfig): DeployStep[] {
    // 基础步骤无论 deployNow 是否为 true 都会执行。
    // deployNow=false 时，这些步骤足够生成目标目录、env、证书和 compose 配置。
    const steps: DeployStep[] = [
        {
            title: '初始化运行日志',
            // 日志初始化放第一步，后面的所有命令输出和错误都能落到同一个日志目录。
            action: () => initializeDeployLog(config)
        },
        {
            title: '检查部署依赖',
            // 检查 docker、docker compose、Prisma CLI 和 Docker daemon 是否可用。
            action: () => ensureDeployPrerequisites(config)
        },
        {
            title: '登录 GHCR 镜像仓库',
            // 如果用户选择跳过登录，这一步内部只写一条“跳过”日志，不会报错。
            action: () => loginGhcrIfRequested(config)
        },
        {
            title: '写入配置文件',
            // 写主 .env 和 Grafana .env。Docker Compose 后续通过 --env-file 读取主 .env。
            action: () => writeEnvFiles(config)
        },
        {
            title: '准备部署资产',
            // 复制 compose/config，创建运行目录，写应用 .env.production，生成 TLS 证书。
            action: () => prepareDeploymentAssets(config)
        }
    ];

    if (config.deployNow) {
        // 只有用户确认“立即部署”时，才追加真正会启动/修改容器的步骤。
        steps.push(
            {
                title: '校验 Docker Compose 配置',
                // `docker compose config --quiet` 只校验配置，不启动容器；失败会提前暴露 YAML/env 问题。
                action: () => runDockerComposeCommand(config, ['config', '--quiet'])
            },
            // createDeployNowSteps 会继续追加 pull、凭据同步、数据库 schema、up -d、Grafana 密码同步。
            ...createDeployNowSteps(config)
        );
    }

    return steps;
}

/**
 * 执行完整部署。
 *
 * `reporter` 是进度上报器，编排器只把步骤交给 `runDeploySteps`，
 * 由 `runDeploySteps` 统一负责 START/DONE/FAIL 日志和 UI 状态更新。
 */
export async function deploy(config: DeployConfig, reporter: DeployProgressReporter): Promise<void> {
    await runDeploySteps(config, deploySteps(config), reporter);
}
