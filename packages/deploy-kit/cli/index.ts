import { collectConfig } from '../config/index.ts';
import { setPromptHeaderLogoController } from '../ui/ink-prompts.ts';
import { startDeployHeaderLogo } from '../ui/logo.ts';
import { printHelp, shouldShowHelp } from './help.ts';
import { deploy } from '../deploy/orchestrator.ts';
import { readDockerContainerStatuses } from '../deploy/modules/docker-status.ts';
import { createDeployProgressReporter } from '../deploy/modules/progress.ts';
import { summary } from '../deploy/modules/summary.ts';
import {
    installDeployThemeOutputTransform,
    printDeploySummary,
    printDeployToast,
    printDockerContainerStatusTable
} from '../ui/theme.ts';
import type { DeployHeaderLogoController } from '../core/types.ts';

/**
 * 文件作用：
 * 这个文件是 deploy-kit 的命令行入口，相当于整个部署工具的“总开关”。
 * 用户执行 `pnpm run deploy` 或发布后的 `node shiro-nya-deploy.mjs` 时，最终都会进入这里。
 *
 * 它不直接拼 Docker 命令，也不直接写 env 文件，而是负责串起四件事：
 * 1. 判断是否展示帮助信息。
 * 2. 启动终端 Logo/进度 UI。
 * 3. 调用配置向导收集 DeployConfig。
 * 4. 调用 deploy 编排器执行部署步骤，并在最后打印摘要和容器状态。
 */
installDeployThemeOutputTransform();

/**
 * 主流程说明：
 * - `shouldShowHelp()` 只处理 `-h` / `--help`，命中后立即返回，避免继续进入交互向导。
 * - `deployHeaderLogo` 是终端顶部动画和进度条控制器；任何异常都要 stop，否则终端光标和渲染区域可能残留。
 * - `collectConfig()` 会弹出交互式问题，并把用户答案整理成 DeployConfig。
 * - `deploy(config, deployProgress)` 只接受整理好的配置，不再关心用户是手动输入还是自动生成。
 * - 部署完成后再读 `docker compose ps`，这样用户能直接看到容器是否 running/healthy。
 */
async function main(): Promise<void> {
    // 帮助命令是“只读动作”，用户只是想看用法，不应该启动 Logo、不应该进入部署配置向导。
    if (shouldShowHelp()) {
        printHelp();
        return;
    }

    // 这里先声明为 undefined，是为了 catch/finally 中也能安全地停止它。
    // 如果 startDeployHeaderLogo 在创建过程中抛错，deployHeaderLogo 仍然可能没有值。
    let deployHeaderLogo: DeployHeaderLogoController | undefined;

    try {
        // 启动顶部 Logo 动画。这个控制器后续还会承载整体部署进度。
        deployHeaderLogo = await startDeployHeaderLogo();

        // 把 Logo 控制器交给 prompt 层，这样交互问题可以渲染在 Logo 下方，不会和动画互相覆盖。
        setPromptHeaderLogoController(deployHeaderLogo);

        // collectConfig 会逐步询问部署目录、密码策略、数据库账号、GHCR 登录等问题。
        // 返回的 config 是后续所有部署模块共享的“唯一配置源”。
        const config = await collectConfig();

        // 配置收集完成后立刻解绑 prompt 控制器，避免部署阶段还有旧 prompt 状态影响终端布局。
        setPromptHeaderLogoController(null);

        // 切换 Logo 到“部署进度模式”，从纯动画变成可以展示百分比和步骤状态。
        deployHeaderLogo.startProgress();

        // 创建进度上报器。部署模块只调用 reporter，不直接操作 UI。
        const deployProgress = createDeployProgressReporter(deployHeaderLogo);

        // 执行真正的部署流程。这里会按 orchestrator.ts 里的步骤顺序运行。
        await deploy(config, deployProgress);

        // 部署步骤结束后停止 Logo 动画，避免后续摘要文字被动画刷新覆盖。
        deployHeaderLogo.stop();

        // 打印部署摘要，包括目标目录、env 文件路径、证书目录、访问地址等。
        printDeploySummary(summary(config));

        // 这个标记只表示“状态读取失败”，不表示 Docker Compose 部署失败。
        let dockerStatusReadFailed = false;
        if (config.deployNow) {
            // 只有用户选择立即部署时，才有必要读取容器状态。
            // 如果只是生成配置，容器可能根本没有启动。
            const containerStatuses = await readDockerContainerStatuses(config);

            // readDockerContainerStatuses 失败时会返回一行 name=docker compose ps/state=unknown 的占位记录。
            dockerStatusReadFailed = containerStatuses.some(
                (status) => status.name === 'docker compose ps' && status.state === 'unknown'
            );

            // 表格里会展示服务名、容器名、端口、状态，方便用户部署后立即检查。
            printDockerContainerStatusTable(containerStatuses);
        }
        printDeployToast({
            message: config.deployNow
                ? dockerStatusReadFailed
                    ? '部署命令已完成，但 Docker 容器状态读取失败，详见上方表格。'
                    : '部署摘要和 Docker 容器状态已刷新。'
                : '未执行 Docker Compose 部署。',
            title: config.deployNow
                ? dockerStatusReadFailed
                    ? '部署完成，容器状态读取失败'
                    : '部署完成'
                : '配置已生成',
            variant: config.deployNow ? (dockerStatusReadFailed ? 'warning' : 'success') : 'info'
        });
    } catch (error) {
        // 无论错误来自配置向导、Docker 命令还是数据库同步，都先释放 prompt 控制器。
        setPromptHeaderLogoController(null);

        // stop 使用可选链：如果 Logo 没启动成功，这行不会抛二次错误。
        deployHeaderLogo?.stop();

        // Error 对象取 message；非 Error 的异常也转成字符串，保证 toast 能展示。
        const message = error instanceof Error ? error.message : String(error);
        printDeployToast({
            message,
            title: '部署失败',
            variant: 'error'
        });

        // CLI 失败时必须返回非 0 退出码，方便 CI 或外部脚本判断失败。
        process.exit(1);
    } finally {
        // finally 再做一次清理是防御式写法：
        // 即使 try/catch 中某个清理动作之后又抛错，终端 UI 状态也能尽量恢复。
        setPromptHeaderLogoController(null);
        deployHeaderLogo?.stop();
    }
}

// 顶层不 await main，是为了保持入口简单；main 内部已经处理错误并设置退出码。
void main();
