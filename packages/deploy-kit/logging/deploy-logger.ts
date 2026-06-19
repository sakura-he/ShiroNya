import os from 'node:os';

import { createRuntimeLogger, type RuntimeLogger } from '../../../libs/common/src/logger/runtime-logger.ts';
import type { RuntimeLogEntry } from '../../../libs/common/src/logger/runtime-log.types.ts';
import type { DeployConfig } from '../core/types.ts';

/**
 * 文件作用：
 * 这个模块把 deploy-kit 的部署日志接入项目统一 logger。
 *
 * 输出说明：
 * - 终端/UI 输出由 `command.ts` 主动打印，避免通用 logger 自己的 console transport 打乱 Ink 进度界面。
 * - 文件输出仍然走项目统一 runtime logger；该 logger 会按项目约定写入 `LOKI_LOG_DIR` 对应目录。
 * - 因为部署日志也属于项目运行日志，所以这里继续使用统一 logger，而不是另起一套日志格式。
 */

/** deploy-kit 在日志中的应用名，便于 Loki/Grafana 按 app 过滤。 */
const deployLoggerAppName = 'shiro-nya-deploy';

/** 同一个 source 复用 logger，避免重复创建 Winston transport。 */
const loggerCache = new Map<string, RuntimeLogger>();

/** 记录本次部署配置出的日志目录，优先级高于外部环境变量。 */
let configuredLogDir: string | undefined;

/** deploy-kit 对外暴露的日志条目类型，实际就是项目统一 RuntimeLogEntry。 */
export type DeployRuntimeLogEntry = RuntimeLogEntry;

/**
 * 配置部署运行日志环境。
 *
 * 通用 logger 会读取这些环境变量：
 * - `SHIRO_APP_NAME`：写入日志标签中的 app 名。
 * - `SHIRO_LOG_CONSOLE`：是否由通用 logger 自己打印到控制台；deploy-kit 自己管理终端输出，所以这里默认关闭。
 * - `LOKI_LOG_DIR`：runtime logger 的 JSONL 文件输出目录，后续可被 Loki/Promtail 采集。
 */
export function configureDeployRuntimeLogger(config: DeployConfig): void {
    process.env.SHIRO_APP_NAME = process.env.SHIRO_APP_NAME || deployLoggerAppName;
    process.env.SHIRO_LOG_CONSOLE = process.env.SHIRO_LOG_CONSOLE ?? 'false';
    process.env.LOKI_LOG_DIR = config.targetLogDir;
    configuredLogDir = config.targetLogDir;
}

/** 获取部署日志目录，优先使用本次 DeployConfig，其次使用已经配置过的环境。 */
export function getDeployRuntimeLogDir(config?: DeployConfig): string {
    return configuredLogDir ?? config?.targetLogDir ?? process.env.LOKI_LOG_DIR ?? 'logs/loki';
}

/**
 * 规范化日志来源名。
 *
 * source 会进入日志 module 字段，也会显示在终端 `[source]` 前缀里。
 */
export function normalizeDeployLogSource(source: string): string {
    const normalized = source.trim().replace(/\s+/g, ' ');
    if (!normalized) return 'deploy';

    return normalized.length > 32 ? `${normalized.slice(0, 31)}...` : normalized;
}

/**
 * 清洗命令输出。
 *
 * 这里仅处理显示格式：
 * - 把 Windows CRLF 和旧式 CR 换行统一成 LF。
 * - 去掉 ANSI escape code，避免日志文件出现颜色控制符。
 */
export function normalizeDeployCommandOutput(input: string): string {
    return input
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/**
 * 获取指定 source 的 runtime logger。
 *
 * 如果传入 config，就先设置部署日志环境，确保文件输出进入本次部署目录。
 */
export function deployRuntimeLogger(source: string, config?: DeployConfig): RuntimeLogger {
    if (config) configureDeployRuntimeLogger(config);

    const moduleName = normalizeDeployLogSource(source);
    const cached = loggerCache.get(moduleName);
    if (cached) return cached;

    const logger = createRuntimeLogger(moduleName, {
        domain: 'deploy',
        resource: {
            type: 'deploy_script'
        }
    });
    loggerCache.set(moduleName, logger);
    return logger;
}

/** 写一条 info 级别部署日志。 */
export function writeDeployRuntimeLog(
    config: DeployConfig,
    source: string,
    message: string,
    context?: Record<string, unknown>
): RuntimeLogEntry {
    const logger = deployRuntimeLogger(source, config);
    return logger.info.title(message, context);
}

/** 写一条 error 级别部署日志，并把原始 error 放入 context。 */
export function writeDeployRuntimeErrorLog(
    config: DeployConfig,
    source: string,
    message: string,
    error: unknown,
    context?: Record<string, unknown>
): RuntimeLogEntry {
    const logger = deployRuntimeLogger(source, config);
    return logger.error(message, {
        ...context,
        error
    });
}

/**
 * 把命令输出拆成多条 info 日志。
 *
 * 一行输出对应一条 runtime log，便于 Loki/Grafana 和本地文件按行检索。
 */
export function writeDeployRuntimeOutput(config: DeployConfig, source: string, output: string): RuntimeLogEntry[] {
    const logger = deployRuntimeLogger(source, config);
    const lines = normalizeDeployCommandOutput(output)
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim());

    return lines.map((line) =>
        logger.info.title(line, {
            stream: source
        })
    );
}

/** 把 runtime log 条目格式化成终端里的一行文本。 */
export function formatDeployRuntimeConsoleLine(entry: RuntimeLogEntry): string {
    const labels = [
        `app=${entry.labels.app}`,
        `env=${entry.labels.env}`,
        `type=${entry.labels.log_type}`,
        `user=${entry.labels.user_id}`
    ].join(' ');
    return `[${entry.level.toUpperCase()}] [${entry.module}] [${labels}] ${entry.message}`;
}

/**
 * 生成给用户看的日志位置提示。
 *
 * os.EOL 用系统换行符，让 Windows 终端和 Linux 终端显示都自然。
 */
export function deployLogLocationText(config: DeployConfig): string {
    return `${getDeployRuntimeLogDir(config)}${os.EOL}  app=${process.env.SHIRO_APP_NAME || deployLoggerAppName}`;
}
