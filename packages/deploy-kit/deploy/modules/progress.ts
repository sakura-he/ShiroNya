import type {
    DeployConfig,
    DeployHeaderLogoController,
    DeployProgressReporter,
    DeployProgressUiController,
    DeployStep
} from '../../core/types.ts';
import { writeDeployRuntimeErrorLog, writeDeployRuntimeLog } from '../../logging/deploy-logger.ts';
import { startDeployProgressUi } from '../../ui/deploy-progress-ui.ts';
import { formatDuration } from '../../utils/format.ts';
import { setActiveDeployTerminalOutput, writeDeployRuntimeEntryToTerminal } from './command.ts';

/**
 * 文件作用：
 * 这个模块负责把“部署步骤执行过程”转换成 UI 进度和结构化日志。
 *
 * 这里不做具体部署动作，只做调度辅助：
 * - 开始步骤时写 START 日志。
 * - 步骤成功时写 DONE 日志。
 * - 步骤失败时写 FAIL 日志。
 * - 把 Docker pull 这类步骤内部进度折算成整体进度。
 */

/**
 * 创建部署进度上报器。
 *
 * logo 是顶部动画控制器；progressUi 是步骤列表 UI。
 * 二者关系：
 * - logo 显示总体百分比和当前步骤编号。
 * - progressUi 显示每个步骤的状态和滚动日志。
 */
export function createDeployProgressReporter(logo: DeployHeaderLogoController): DeployProgressReporter {
    // progressUi 在 start() 时创建，在 stop() 时销毁。
    let progressUi: DeployProgressUiController | undefined;

    // 内部使用 0-based currentStep；展示给用户时要转成 1-based。
    const setHeaderStep = (currentStep: number, totalSteps: number): void => {
        // safeTotal 至少为 1，避免除以 0 或显示 [1/0]。
        const safeTotal = Math.max(1, totalSteps);

        // currentStep 传入 0 表示第一步，所以展示时 +1；同时限制在 1..safeTotal。
        const displayStep = Math.min(safeTotal, Math.max(1, currentStep + 1));
        logo.setHeaderStep?.(displayStep, safeTotal);
    };

    return {
        start(steps) {
            // 如果重复 start，先停掉旧 UI，避免多个 UI 同时写终端。
            progressUi?.stop();

            // 优先使用 logo 自带的进度 UI；没有时使用默认 startDeployProgressUi。
            progressUi = logo.startDeployProgress?.(steps) ?? startDeployProgressUi(steps, logo);

            // 让 command.ts 把命令输出写入进度 UI 的日志区域。
            setActiveDeployTerminalOutput((text) => progressUi?.writeLog(text));
            setHeaderStep(0, steps.length);
        },
        setStep(currentStep, totalSteps) {
            setHeaderStep(currentStep, totalSteps);

            // 整体进度 = 已完成步骤数 / 总步骤数，并限制在 0..1。
            logo.setProgress(Math.min(1, Math.max(0, currentStep / Math.max(1, totalSteps))));
        },
        setStepProgress(currentStep, totalSteps, stepProgress) {
            // 所有输入都做边界保护，避免某个步骤误传负数或大于 1 的值导致 UI 异常。
            const boundedTotal = Math.max(1, totalSteps);
            const boundedStep = Math.min(boundedTotal, Math.max(0, currentStep));
            const boundedProgress = Math.min(1, Math.max(0, stepProgress));
            setHeaderStep(boundedStep, boundedTotal);

            // 整体进度 = (已完成步骤 + 当前步骤内部进度) / 总步骤数。
            logo.setProgress((boundedStep + boundedProgress) / boundedTotal);
            progressUi?.setProgress(boundedStep, boundedProgress);
        },
        stepStarted(currentStep, totalSteps) {
            setHeaderStep(currentStep, totalSteps);
            // 通知 UI 把当前步骤标为 running。
            progressUi?.startStep(currentStep);
        },
        stepCompleted(currentStep, _totalSteps, _title, durationMs) {
            // 通知 UI 把当前步骤标为 success，并展示耗时。
            progressUi?.completeStep(currentStep, durationMs);
        },
        stepFailed(currentStep, _totalSteps, _title, durationMs) {
            // 通知 UI 把当前步骤标为 failed，并展示耗时。
            progressUi?.failStep(currentStep, durationMs);
        },
        stop() {
            // 停止 UI 渲染，并释放 command.ts 的终端输出接管。
            progressUi?.stop();
            progressUi = undefined;
            setActiveDeployTerminalOutput(undefined);
        }
    };
}

export async function runDeploySteps(
    config: DeployConfig,
    steps: DeployStep[],
    reporter: DeployProgressReporter
): Promise<void> {
    // 总步骤数固定取传入数组长度；步骤执行过程中不再增删，保证进度稳定。
    const totalSteps = steps.length;
    reporter.start(steps);
    reporter.setStep(0, totalSteps);

    try {
        for (let index = 0; index < steps.length; index++) {
            // index 是 0-based，日志里的 [1/N] 更适合人看，所以使用 index + 1。
            const step = steps[index];
            const stepLabel = `[${index + 1}/${totalSteps}] ${step.title}`;

            // 记录开始时间，用于 DONE/FAIL 日志里展示耗时。
            const startedAt = Date.now();

            reporter.stepStarted(index, totalSteps, step.title);
            writeDeployRuntimeEntryToTerminal(
                writeDeployRuntimeLog(config, step.title, `START ${stepLabel}`, {
                    currentStep: index + 1,
                    totalSteps
                })
            );

            try {
                await step.action({
                    setProgress(progress) {
                        // 给长步骤使用，例如 Docker pull 可以持续上报 0~1 的局部进度。
                        reporter.setStepProgress(index, totalSteps, progress);
                    }
                });
                const durationMs = Date.now() - startedAt;
                // 当前步骤成功后，整体进度推进到下一步开头。
                reporter.setStep(index + 1, totalSteps);
                reporter.stepCompleted(index, totalSteps, step.title, durationMs);
                writeDeployRuntimeEntryToTerminal(
                    writeDeployRuntimeLog(config, step.title, `DONE ${stepLabel} ${formatDuration(durationMs)}`, {
                        currentStep: index + 1,
                        durationMs,
                        totalSteps
                    })
                );
            } catch (error) {
                const durationMs = Date.now() - startedAt;
                // 先通知 UI，再写错误日志，最后重新抛出，让 CLI 统一显示失败 toast。
                reporter.stepFailed(index, totalSteps, step.title, durationMs);
                writeDeployRuntimeEntryToTerminal(
                    writeDeployRuntimeErrorLog(
                        config,
                        step.title,
                        `FAIL ${stepLabel} ${formatDuration(durationMs)}`,
                        error,
                        {
                            currentStep: index + 1,
                            durationMs,
                            totalSteps
                        }
                    )
                );
                throw error;
            }
        }
    } finally {
        // 无论成功、失败还是中途抛错，都必须 stop，释放终端输出接管。
        reporter.stop();
    }
}
