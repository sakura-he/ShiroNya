import type { DeployConfig } from '../../core/types.ts';
import { logDeployMessage, runLoggedCommand } from './command.ts';

/**
 * 文件作用：
 * 这个模块统一封装 Docker Compose 命令。
 *
 * 所有部署模块都应该通过这里调用 compose，避免每个文件自己拼：
 * - `docker compose --env-file ... -f ...`
 * - Compose 环境变量
 * - 命令日志标题
 */

type DockerComposeCommandOptions = {
    env?: NodeJS.ProcessEnv;
    input?: string;
    terminalOutput?: boolean;
    title?: string;
};

/**
 * 生成 docker compose 参数数组。
 *
 * 参数说明：
 * - `compose`：Docker 新版内置的 Compose 子命令，相当于执行 `docker compose`。
 * - `--ansi never`：关闭彩色控制字符，避免日志里出现难读的 ANSI escape code。
 * - `--progress json/plain`：控制 pull/build 的进度输出格式；pull 进度解析时使用 json。
 * - `--env-file config.envFile`：把主 env 文件交给 Compose 解析。
 * - `--project-directory config.targetDockerDir`：让 `./config/...` 这类相对路径以目标 docker 目录为基准。
 * - `-f file`：指定 Compose 文件；多个 `-f` 按顺序加载，后面的 override 前面的配置。
 */
export function composeArgs(
    config: DeployConfig,
    action: string[],
    options: { progress?: 'json' | 'plain' } = {}
): string[] {
    return [
        // 使用 Docker CLI 的 compose 子命令，即最终命令是 `docker compose ...`。
        'compose',
        // 关闭 ANSI 彩色输出，日志里不会出现 `\x1b[32m` 这类控制字符。
        '--ansi',
        'never',
        // Docker pull 需要 JSON 进度时才插入 --progress json；普通命令不带这个参数。
        ...(options.progress ? ['--progress', options.progress] : []),
        // 主 env 文件提供 compose.yaml 里 `${VAR}` 变量的取值。
        '--env-file',
        config.envFile,
        // project directory 决定 compose 中相对路径 `./config/...` 从哪里开始解析。
        '--project-directory',
        config.targetDockerDir,
        // 每个 compose 文件都展开成 `-f <file>`，多个文件按数组顺序传入。
        ...config.composeFiles.flatMap((file) => ['-f', file]),
        // action 是调用方传入的具体动作，例如 ['up', '-d']。
        ...action
    ];
}

/**
 * 生成传给 Docker Compose 进程的环境变量。
 *
 * 这些环境变量会被 compose.yaml 或 generated override 引用：
 * - `SHIRO_NYA_ROOT`：部署根目录。
 * - `SHIRO_NYA_LOG_DIR`：日志目录。
 * - `GRAFANA_ENV_FILE`：Grafana 专用 env 文件路径。
 */
export function composeEnv(config: DeployConfig): NodeJS.ProcessEnv {
    return {
        // 继承当前进程环境，保留 PATH、Docker 相关变量、代理变量等。
        ...process.env,
        // 以下变量会被 compose.yaml 或服务配置引用。
        SHIRO_NYA_ROOT: config.targetRoot,
        SHIRO_NYA_LOG_DIR: config.targetLogDir,
        GRAFANA_ENV_FILE: config.grafanaEnvFile
    };
}

/**
 * 执行一条 Docker Compose 命令。
 *
 * action 示例：
 * - `['config', '--quiet']`
 * - `['up', '-d', '--pull', 'never']`
 * - `['exec', '-T', 'shiro-nya-postgres', ...]`
 */
export async function runDockerComposeCommand(
    config: DeployConfig,
    action: string[],
    options: DockerComposeCommandOptions = {}
): Promise<void> {
    await runLoggedCommand(config, 'docker', composeArgs(config, action), {
        // 在目标 docker 目录下执行，便于相对路径和人工排查保持一致。
        cwd: config.targetDockerDir,
        env: {
            // 先放标准 compose 环境，再允许调用方覆盖或追加环境变量。
            ...composeEnv(config),
            ...options.env
        },
        input: options.input,
        terminalOutput: options.terminalOutput,
        title: options.title ?? `docker compose ${action.join(' ')}`
    });
}

/**
 * 按用户选择登录 GHCR。
 *
 * `--password-stdin` 说明：
 * - token 不放在命令行参数里，避免被 shell history 或进程列表看到。
 * - token 通过 stdin 传给 docker login。
 */
export async function loginGhcrIfRequested(config: DeployConfig): Promise<void> {
    if (config.ghcrMode !== 'login') {
        // 用户选择 skip 时不验证用户名/token，因为公开镜像或已提前 docker login 都不需要。
        await logDeployMessage(config, 'ghcr login', '跳过 GHCR 登录');
        return;
    }

    if (!config.ghcrUsername || !config.ghcrToken) {
        // 选择 login 却缺字段属于配置错误，要直接停止部署。
        throw new Error('GHCR 登录缺少用户名或 token。');
    }

    // token 通过 stdin 输入，不放到命令行参数里。
    await runLoggedCommand(config, 'docker', ['login', 'ghcr.io', '-u', config.ghcrUsername, '--password-stdin'], {
        input: config.ghcrToken,
        title: 'login ghcr.io'
    });
}
