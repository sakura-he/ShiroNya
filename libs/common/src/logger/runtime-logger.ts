import { inspect } from 'node:util';
import * as path from 'node:path';
import * as winston from 'winston';
import { trace } from '@opentelemetry/api';
import { ulid } from 'ulid';
import dayjs from 'dayjs';
import DailyRotateFile from 'winston-daily-rotate-file';
import stringWidth from 'string-width';
import {
    getCallerLocation,
    getRuntimeAppName,
    getRuntimeEnvName,
    normalizeModuleName,
    sanitizeForLogging,
    shouldPrintConsoleDetails
} from './runtime-log.util';
import type {
    RuntimeConsoleLogStyle,
    RuntimeLogEntry,
    RuntimeLogInput,
    RuntimeLogLevel,
    RuntimeLogType,
    RuntimeLoggerModuleOptions,
    RuntimeLoggerOptions,
    RuntimeLoggerStaticContext
} from './runtime-log.types';
import { mergeLogContext } from './merge-log-context';
import { getRequestContext } from './request-context';

/**
 * 自定义 Winston 日志级别，保持与项目 RuntimeLogLevel 一致。
 */
const SHIRO_LOG_LEVELS: winston.config.AbstractConfigSetLevels = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    verbose: 5
};

/**
 * 项目统一颜色变量表（唯一颜色源）。
 * 使用 Winston 颜色名格式，通过 winston.addColors() 注册后，
 * 由 winstonColorizer.colorize() 统一着色，禁止在其他位置硬编码 ANSI 颜色码。
 *
 * - 级别色（fatal~verbose）：用于标题行 PID、消息、title 参数引导箭头前景色
 * - badge 色（badge_*）：用于级别标签的背景色 + 白色粗体前景
 * - 通用色（context / ms）：上下文标识和耗时的前景色
 */
const DEFAULT_SHIRO_LOG_COLORS: Record<string, string> = {
    // 级别前景色
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'magenta',
    verbose: 'cyan',
    // badge 色（白色粗体前景 + 级别背景）
    badge_fatal: 'bold white redBG',
    badge_error: 'bold white redBG',
    badge_warn: 'bold white yellowBG',
    badge_info: 'bold white greenBG',
    badge_debug: 'bold white magentaBG',
    badge_verbose: 'bold white cyanBG',
    // 通用色
    context: 'yellow',
    ms: 'yellow'
};

// 注册颜色到 Winston，使 colorize format 可用
winston.addColors(DEFAULT_SHIRO_LOG_COLORS);

/** Winston colorize 实例，用于统一着色 */
const winstonColorizer = winston.format.colorize();

const DEFAULT_CONSOLE_BADGE_WIDTH = 7;
const DEFAULT_TITLE_ARGS_OPEN_MARKER = '↓';
const DEFAULT_TITLE_ARGS_CLOSE_MARKER = '↑';
const DEFAULT_TITLE_ARGS_CONTENT_GAP = ' ';
const DEFAULT_LEVEL_EMOTION_LABELS: Record<RuntimeLogLevel, string> = {
    info: '(❁´◡`❁)',
    verbose: '(‾◡◝)',
    fatal: '∑( 口 ||',
    debug: '(´･ω･`)?',
    error: '〒▽〒',
    warn: '(•_•)'
};

interface ResolvedRuntimeConsoleStyle {
    colors: Record<string, string>;
    levelEmotions: Record<RuntimeLogLevel, string>;
    badgeWidth: number;
    titleArgsOpenMarker: string;
    titleArgsCloseMarker: string;
    titleArgsContentGap: string;
}

let runtimeLoggerModuleOptions: RuntimeLoggerModuleOptions = {};

function mergeConsoleStyle(...styles: Array<RuntimeConsoleLogStyle | undefined>): ResolvedRuntimeConsoleStyle {
    const resolved: ResolvedRuntimeConsoleStyle = {
        colors: { ...DEFAULT_SHIRO_LOG_COLORS },
        levelEmotions: { ...DEFAULT_LEVEL_EMOTION_LABELS },
        badgeWidth: DEFAULT_CONSOLE_BADGE_WIDTH,
        titleArgsOpenMarker: DEFAULT_TITLE_ARGS_OPEN_MARKER,
        titleArgsCloseMarker: DEFAULT_TITLE_ARGS_CLOSE_MARKER,
        titleArgsContentGap: DEFAULT_TITLE_ARGS_CONTENT_GAP
    };

    for (const style of styles) {
        if (!style) {
            continue;
        }
        if (style.colors) {
            for (const [key, value] of Object.entries(style.colors)) {
                if (value !== undefined) {
                    resolved.colors[key] = value;
                }
            }
        }
        if (style.levelEmotions) {
            for (const level of Object.keys(style.levelEmotions) as RuntimeLogLevel[]) {
                const value = style.levelEmotions[level];
                if (value !== undefined) {
                    resolved.levelEmotions[level] = value;
                }
            }
        }
        if (style.badgeWidth !== undefined) {
            resolved.badgeWidth = Math.max(1, Math.floor(style.badgeWidth));
        }
        if (style.titleArgsOpenMarker !== undefined) {
            resolved.titleArgsOpenMarker = style.titleArgsOpenMarker;
        }
        if (style.titleArgsCloseMarker !== undefined) {
            resolved.titleArgsCloseMarker = style.titleArgsCloseMarker;
        }
        if (style.titleArgsContentGap !== undefined) {
            resolved.titleArgsContentGap = style.titleArgsContentGap;
        }
    }

    winston.addColors(resolved.colors);
    return resolved;
}

function resolveConsoleStyle(style?: RuntimeConsoleLogStyle): ResolvedRuntimeConsoleStyle {
    return mergeConsoleStyle(runtimeLoggerModuleOptions.consoleStyle, style);
}

/**
 * 配置 runtime logger 全局默认项。
 * 适合在 LogModule.forRoot()/forPrisma() 或应用 bootstrap 阶段调用。
 */
export function configureRuntimeLogger(options: RuntimeLoggerModuleOptions = {}): void {
    runtimeLoggerModuleOptions = structuredClone(options);
    resolveConsoleStyle();
}

/** 按应用名缓存 Winston logger，避免重复创建 Console transport。 */
const winstonLoggerMap = new Map<string, winston.Logger>();

/** 记录已挂载的文件 transport，避免同一个 app + logType 重复注册。 */
const fileTransportSet = new Set<string>();

/**
 * 缓存上一次控制台日志的时间，用于计算控制台标题行的 +Xms。
 */
let lastTimestampMs = Date.now();

/**
 * 从当前 OpenTelemetry active span 中提取 trace 关联字段。
 * traceId/spanId 只写入 JSON 和控制台上下文，不提升为 Loki label，避免高基数 stream。
 */
function getActiveTraceFields(): Pick<RuntimeLogEntry, 'traceId' | 'spanId'> {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext || !spanContext.traceId || /^0+$/.test(spanContext.traceId)) {
        return {};
    }

    return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId
    };
}

/**
 * 构造最终日志结构体，使用 ULID 作为唯一标识。
 * 写入边界统一做一次标准化，确保 BigInt、Error、Buffer、循环引用等值都能安全 JSON 化。
 */
function buildRuntimeEntry(input: RuntimeLogInput): RuntimeLogEntry {
    const id = ulid();
    const app = getRuntimeAppName();
    const env = getRuntimeEnvName();
    const moduleName = normalizeModuleName(input.module);
    const userId = input.userId || (input.logType === 'system' ? 'system' : 'anonymous');
    const ts = new Date().toISOString();
    const traceFields = getActiveTraceFields();

    return {
        id,
        ts,
        level: input.level,
        logType: input.logType,
        app,
        env,
        module: moduleName,
        userId,
        labels: {
            id,
            app,
            env,
            log_type: input.logType,
            level: input.level,
            module: moduleName,
            user_id: userId
        },
        message: input.message,
        event: input.event || input.logType,
        requestId: input.requestId,
        ...traceFields,
        caller: input.caller || getCallerLocation(4),
        actor: sanitizeForLogging(input.actor) as RuntimeLogEntry['actor'],
        http: sanitizeForLogging(input.http) as RuntimeLogEntry['http'],
        rpc: sanitizeForLogging(input.rpc) as RuntimeLogEntry['rpc'],
        resource: sanitizeForLogging(input.resource) as RuntimeLogEntry['resource'],
        result: sanitizeForLogging(input.result) as RuntimeLogEntry['result'],
        error: sanitizeForLogging(input.error) as RuntimeLogEntry['error'],
        context: sanitizeForLogging(input.context) as RuntimeLogEntry['context']
    };
}

/**
 * 将日志级别格式化成 badge 风格标签文本，并保持固定宽度。
 */
function getLevelEmotionBadgeWidth(style: ResolvedRuntimeConsoleStyle): number {
    return Math.max(...Object.values(style.levelEmotions).map((label) => stringWidth(label)));
}

function formatBadgeLabel(level: string, style: ResolvedRuntimeConsoleStyle): string {
    const label = level.toUpperCase();
    const leftPadding = Math.max(0, Math.floor((style.badgeWidth - label.length) / 2));
    return label.padStart(label.length + leftPadding).padEnd(style.badgeWidth);
}

/** 计算级别文字在固定宽度 badge 内的起始显示列，用于让 title context 对齐 `INFO/WARN/...`。 */
function getLevelLabelStartColumn(level: RuntimeLogInput['level'], style: ResolvedRuntimeConsoleStyle): number {
    const label = formatBadgeLabel(level, style);
    const firstVisibleIndex = label.search(/\S/);
    return firstVisibleIndex < 0 ? 0 : stringWidth(label.slice(0, firstVisibleIndex));
}

/**
 * 根据日志级别构造带颜色的 badge 标签。
 * 通过 winstonColorizer 使用 badge_<level> 颜色（白色粗体前景 + 级别背景）。
 */
function formatLevelBadge(level: RuntimeLogInput['level'], style: ResolvedRuntimeConsoleStyle): string {
    const label = formatBadgeLabel(level, style);
    return winstonColorizer.colorize(`badge_${level}` as string, label);
}

/** 按终端显示宽度右侧补空格，让颜文字 badge 固定宽度且内容左对齐。 */
function padEndByDisplayWidth(label: string, width: number): string {
    return `${label}${' '.repeat(Math.max(0, width - stringWidth(label)))}`;
}

/**
 * 根据日志级别构造颜文字 badge。
 * 固定宽度但内容左对齐，只使用日志级别前景色，不加背景色。
 */
function formatLevelEmotionBadge(level: RuntimeLogInput['level'], style: ResolvedRuntimeConsoleStyle): string {
    const label = padEndByDisplayWidth(style.levelEmotions[level], getLevelEmotionBadgeWidth(style));
    return winstonColorizer.colorize(level, label);
}

/**
 * 将 ISO 时间戳格式化成控制台使用的本地时间格式。
 */
function formatConsoleTimestamp(timestamp: string): string {
    return dayjs(timestamp).format('YYYY/MM/DD HH:mm:ss');
}

/**
 * 生成控制台日志上下文标识。
 */
function buildConsoleContext(entry: RuntimeLogEntry): string {
    const segments = [entry.logType, entry.module, `user:${entry.userId}`];

    if (entry.requestId) {
        segments.push(`req:${entry.requestId}`);
    }
    if (entry.traceId) {
        segments.push(`trace:${entry.traceId}`);
    }

    return segments.join(' ');
}

/**
 * 构建 user_action 控制台摘要对象，避免开发环境被整包 HTTP 明细刷屏。
 * 这里只裁剪控制台 detail，不影响 Loki 文件落盘的完整结构。
 */
function buildUserActionConsoleSummary(entry: RuntimeLogEntry): Partial<RuntimeLogEntry> {
    return {
        id: entry.id,
        ts: entry.ts,
        level: entry.level,
        logType: entry.logType,
        app: entry.app,
        env: entry.env,
        module: entry.module,
        userId: entry.userId,
        labels: entry.labels,
        message: entry.message,
        event: entry.event,
        requestId: entry.requestId,
        traceId: entry.traceId,
        spanId: entry.spanId,
        caller: entry.caller,
        actor: entry.actor
    };
}

/**
 * 构建非生产环境下的控制台详情对象文本。
 * 正常 user_action 仍输出摘要，避免健康请求刷屏；错误请求必须输出完整 entry，
 * 这样控制台能直接看到 http.responseBody、error 和 context，不必再去翻 JSONL 文件。
 */
function buildConsoleDetailsMessage(entry: RuntimeLogEntry): string | undefined {
    if (!shouldPrintConsoleDetails()) {
        return undefined;
    }

    const consoleDetails =
        entry.logType === 'user_action' && entry.level !== 'error' && entry.level !== 'fatal'
            ? // 正常 user_action 在控制台仅保留基础字段，避免把请求头和响应体整包打印出来。
              buildUserActionConsoleSummary(entry)
            : entry;

    return inspect(consoleDetails, {
        depth: null,
        colors: true,
        compact: false,
        breakLength: 120
    });
}

/**
 * 拼接控制台标题行。
 * 格式：`<LEVEL_BADGE> <EMOTION_BADGE> <PID>  - <timestamp> [context] <message> +Xms`
 * 所有着色均通过 winstonColorizer.colorize() 完成，颜色定义来自 SHIRO_LOG_COLORS。
 */
function buildConsoleTitleLine(
    entry: RuntimeLogEntry,
    context: string,
    style: ResolvedRuntimeConsoleStyle,
    hasTitleArgs: boolean = false
): string {
    const level = entry.level;
    const timestamp = formatConsoleTimestamp(entry.ts);
    const now = Date.now();
    const diffMs = now - lastTimestampMs;
    lastTimestampMs = now;

    const badge = formatLevelBadge(level, style);
    const emotionBadge = formatLevelEmotionBadge(level, style);

    // 使用 winstonColorizer 给 PID 和消息着级别前景色
    const colorizedPid = winstonColorizer.colorize(level, String(process.pid));
    const colorizedMessage = winstonColorizer.colorize(level, entry.message);

    // context 和 ms 使用 winstonColorizer 着通用色
    const colorizedContext = winstonColorizer.colorize('context' as string, `[${context}]`);
    const colorizedMs = winstonColorizer.colorize('ms' as string, `+${diffMs}ms`);
    const titleArgsMarker = hasTitleArgs
        ? `${style.titleArgsContentGap}${winstonColorizer.colorize(level, style.titleArgsOpenMarker)}`
        : '';

    const pidPart = `${badge} ${emotionBadge} ${colorizedPid}  - `;
    return `${pidPart}${timestamp} ${colorizedContext} ${colorizedMessage} ${colorizedMs}${titleArgsMarker}`;
}

/**
 * 将 `.title(message, context)` 的 context 格式化成标题行下方的多行参数块。
 *
 * context 块整体对齐级别文字（INFO/WARN/...）起点；标题行末尾的 `↓` 表示展开，
 * context 最后一行末尾的 `↑` 表示收束。
 */
function buildTitleArgsLine(
    level: RuntimeLogInput['level'],
    style: ResolvedRuntimeConsoleStyle,
    titleArgs?: Record<string, unknown>
): string | undefined {
    if (!titleArgs || Object.keys(titleArgs).length === 0) {
        return undefined;
    }

    const closeMarker = winstonColorizer.colorize(level, style.titleArgsCloseMarker);
    const argsLines = inspect(titleArgs, { depth: 2, colors: true, compact: false, breakLength: 120 }).split('\n');
    const blockIndent = ' '.repeat(getLevelLabelStartColumn(level, style));
    const lastIndex = argsLines.length - 1;
    const contextLines = argsLines.map((line, index) => {
        const suffix = index === lastIndex ? `${style.titleArgsContentGap}${closeMarker}` : '';
        return `${blockIndent}${line}${suffix}`;
    });

    return contextLines.join('\n');
}

/**
 * 创建控制台输出格式。
 * titleOnly 为 true 时输出标题行和可选参数行，不附加 detail 结构体。
 * 注意：titleOnly 只影响控制台展示，文件 transport 仍写完整 RuntimeLogEntry。
 */
function createRuntimeConsoleFormat(): winston.Logform.Format {
    return winston.format.printf((info) => {
        const entry = info.entry as RuntimeLogEntry;
        const context = String(info.context);
        const titleOnly = Boolean(info.titleOnly);
        const consoleStyle = resolveConsoleStyle(info.consoleStyle as RuntimeConsoleLogStyle | undefined);

        if (titleOnly) {
            const titleArgs = info.titleArgs as Record<string, unknown> | undefined;
            const titleArgsLine = buildTitleArgsLine(entry.level, consoleStyle, titleArgs);
            const titleLine = buildConsoleTitleLine(entry, context, consoleStyle, Boolean(titleArgsLine));
            return titleArgsLine ? `${titleLine}\n${titleArgsLine}` : titleLine;
        }

        const titleLine = buildConsoleTitleLine(entry, context, consoleStyle);

        const detailsMessage = buildConsoleDetailsMessage(entry);

        if (!detailsMessage) {
            return titleLine;
        }

        return `${titleLine}\n${detailsMessage}`;
    });
}

/**
 * 创建 JSON Lines 文件输出格式，保证每行都是完整 RuntimeLogEntry JSON。
 */
function createJsonLinesFormat(): winston.Logform.Format {
    return winston.format.printf((info) => JSON.stringify(info.entry as RuntimeLogEntry));
}

/** 获取指定应用的 Winston logger，并挂载控制台 transport。 */
function getAppWinstonLogger(appName: string): winston.Logger {
    const current = winstonLoggerMap.get(appName);
    if (current) {
        return current;
    }

    const transports: winston.transport[] = [];
    if (process.env.SHIRO_LOG_CONSOLE !== 'false') {
        transports.push(
            new winston.transports.Console({
                stderrLevels: ['error', 'fatal'],
                format: createRuntimeConsoleFormat()
            })
        );
    }

    const logger = winston.createLogger({
        levels: SHIRO_LOG_LEVELS,
        level: 'verbose',
        transports
    });

    winstonLoggerMap.set(appName, logger);
    return logger;
}

/** 确保指定 app + logType 的 DailyRotateFile transport 已挂载。 */
function ensureFileTransport(logger: winston.Logger, appName: string, logType: RuntimeLogType): void {
    // audit 类型仅输出控制台，不落盘文件
    if (logType === 'audit') {
        return;
    }

    const transportKey = `${appName}:${logType}`;
    if (fileTransportSet.has(transportKey)) {
        return;
    }

    const baseDir = process.env.LOKI_LOG_DIR || path.join(process.cwd(), 'logs', 'loki');
    const logDir = path.join(baseDir, appName);
    const transport = new DailyRotateFile({
        dirname: logDir,
        filename: `${logType}-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        format: createJsonLinesFormat()
    });

    /**
     * 输出文件 transport 的内部错误，避免写盘失败被静默吞掉。
     */
    transport.on('error', (error: Error) => {
        process.stderr.write(`[runtime-logger] Winston DailyRotateFile 写入失败 (${transportKey}): ${error.message}\n`);
    });

    logger.add(transport);
    fileTransportSet.add(transportKey);
}

/** 日志写入选项 */
interface WriteLogOptions {
    /** 输出标题行和可选参数行，不附加 detail 结构体 */
    titleOnly?: boolean;
    /** titleOnly 模式下输出到标题行下方的参数 */
    titleArgs?: Record<string, unknown>;
    /** 当前日志调用使用的控制台样式 */
    consoleStyle?: RuntimeConsoleLogStyle;
}

/**
 * 统一写入运行时日志，控制台与文件落盘全部交给 Winston transport。
 */
export function writeRuntimeLog(input: RuntimeLogInput, options?: WriteLogOptions): RuntimeLogEntry {
    const entry = buildRuntimeEntry(input);
    const logger = getAppWinstonLogger(entry.app);

    ensureFileTransport(logger, entry.app, entry.logType);
    logger.log({
        level: entry.level,
        message: entry.message,
        entry,
        context: buildConsoleContext(entry),
        titleOnly: options?.titleOnly ?? false,
        titleArgs: options?.titleArgs,
        consoleStyle: options?.consoleStyle
    });

    return entry;
}

/**
 * 写入系统日志（logType 固定为 system）。
 */
export function writeSystemLog(input: Omit<RuntimeLogInput, 'logType'>, options?: WriteLogOptions): RuntimeLogEntry {
    return writeRuntimeLog(
        {
            ...input,
            logType: 'system'
        },
        options
    );
}

/**
 * 写入用户操作日志（logType 固定为 user_action）。
 */
export function writeUserActionLog(input: Omit<RuntimeLogInput, 'logType'>): RuntimeLogEntry {
    return writeRuntimeLog({
        ...input,
        logType: 'user_action'
    });
}

/**
 * 输出审计日志到控制台（logType 固定为 audit，不落盘文件）。
 */
export function writeAuditConsoleLog(input: Omit<RuntimeLogInput, 'logType'>): RuntimeLogEntry {
    return writeRuntimeLog({
        ...input,
        logType: 'audit'
    });
}

/**
 * 带 title 方法的日志函数类型。
 * 调用函数本身输出完整日志（含 detail），调用 .title() 输出标题行和可选参数行。
 */
interface LogMethod {
    (message: string, context?: Record<string, unknown>): RuntimeLogEntry;
    /** 输出标题行和可选参数行，不附加 detail 结构体 */
    title: (message: string, context?: Record<string, unknown>) => RuntimeLogEntry;
}

/** createRuntimeLogger 返回的 logger 实例类型 */
export interface RuntimeLogger {
    info: LogMethod;
    debug: LogMethod;
    verbose: LogMethod;
    warn: LogMethod;
    error: LogMethod;
    fatal: LogMethod;
    /** 手动写入完整结构的系统日志 */
    system: (input: Omit<RuntimeLogInput, 'module' | 'logType'>) => RuntimeLogEntry;
    /** 手动写入用户操作日志 */
    userAction: (input: Omit<RuntimeLogInput, 'module' | 'logType'>) => RuntimeLogEntry;
    /** 手动输出审计控制台日志 */
    audit: (input: Omit<RuntimeLogInput, 'module' | 'logType'>) => RuntimeLogEntry;
}

/**
 * 把任意级别 / 任意 titleOnly 模式的写入路径收敛到同一个内部函数。
 * logger facade 的普通调用和 `.title()` 调用都先合并 static/request/explicit 三层上下文，
 * 再进入同一个 writeSystemLog 管线，避免不同级别出现字段漂移。
 */
function composeAndWrite(
    level: RuntimeLogInput['level'],
    normalizedModule: string,
    frozenStaticContext: RuntimeLoggerStaticContext | undefined,
    consoleStyle: RuntimeConsoleLogStyle | undefined,
    message: string,
    explicitContext: Record<string, unknown> | undefined,
    options?: { titleOnly?: boolean }
): RuntimeLogEntry {
    const merged = mergeLogContext({
        moduleName: normalizedModule,
        staticContext: frozenStaticContext,
        requestContext: getRequestContext(),
        explicitContext
    });

    return writeSystemLog(
        {
            level,
            module: merged.module,
            message,
            requestId: merged.requestId,
            actor: merged.actor,
            http: merged.http,
            resource: merged.resource,
            error: merged.error,
            userId: merged.userId,
            context: merged.context
        },
        {
            consoleStyle,
            ...(options?.titleOnly ? { titleOnly: true, titleArgs: explicitContext } : {})
        }
    );
}

/**
 * 创建带 .title() 变体的日志方法。
 *
 * 调用方式：
 * - `logger.info('msg', ctx)`：输出完整 RuntimeLogEntry（含 detail，文件 transport 接收完整结构）。
 * - `logger.info.title('msg', ctx)`：标题行单独输出；ctx 存在时在下一行紧凑打印，不附加 detail 块。
 */
function createLogMethod(
    level: RuntimeLogInput['level'],
    normalizedModule: string,
    frozenStaticContext: RuntimeLoggerStaticContext | undefined,
    consoleStyle: RuntimeConsoleLogStyle | undefined
): LogMethod {
    /** 输出完整日志（含 detail） */
    const method = (message: string, context?: Record<string, unknown>): RuntimeLogEntry => {
        return composeAndWrite(level, normalizedModule, frozenStaticContext, consoleStyle, message, context);
    };

    /** 输出标题行和可选参数行，不附加 detail 结构体。 */
    method.title = (message: string, context?: Record<string, unknown>): RuntimeLogEntry => {
        return composeAndWrite(level, normalizedModule, frozenStaticContext, consoleStyle, message, context, {
            titleOnly: true
        });
    };

    return method;
}

/**
 * 把 `system / userAction / audit` 三个手动入口的输入合并入 `mergeLogContext`，
 * 让 facade 上的手动入口也能继承 logger 创建时绑定的 staticContext 与当前请求上下文。
 */
function composeManualInput(
    input: Omit<RuntimeLogInput, 'module' | 'logType'>,
    normalizedModule: string,
    frozenStaticContext: RuntimeLoggerStaticContext | undefined
): Omit<RuntimeLogInput, 'logType'> {
    const explicitContext: Record<string, unknown> = {};
    // 先平铺 input.context.*（其中保留 key 会被下面顶层字段覆盖）
    if (input.context !== undefined) {
        Object.assign(explicitContext, input.context);
    }
    if (input.requestId !== undefined) explicitContext.requestId = input.requestId;
    if (input.actor !== undefined) explicitContext.actor = input.actor;
    if (input.http !== undefined) explicitContext.http = input.http;
    if (input.resource !== undefined) explicitContext.resource = input.resource;
    if (input.error !== undefined) explicitContext.error = input.error;

    const merged = mergeLogContext({
        moduleName: normalizedModule,
        staticContext: frozenStaticContext,
        requestContext: getRequestContext(),
        explicitContext
    });

    return {
        level: input.level,
        module: merged.module,
        message: input.message,
        event: input.event,
        userId: input.userId ?? merged.userId,
        requestId: merged.requestId,
        actor: merged.actor,
        http: merged.http,
        rpc: input.rpc,
        resource: merged.resource,
        result: input.result,
        error: merged.error,
        context: merged.context,
        caller: input.caller
    };
}

/**
 * 在 createRuntimeLogger 入口处对调用方传入的 staticContext 进行结构化深拷贝。
 * staticContext 是 logger 配置快照，只接受 structuredClone 支持的纯数据；
 * 如果调用方塞入函数、句柄这类运行时对象，应该在创建 logger 时直接暴露错误。
 */
function cloneStaticContext(staticContext: RuntimeLoggerStaticContext): RuntimeLoggerStaticContext {
    return structuredClone(staticContext);
}

function resolveLoggerStaticContext(options: RuntimeLoggerOptions): RuntimeLoggerStaticContext | undefined {
    const staticContext: RuntimeLoggerStaticContext = {};
    if (options.module !== undefined) staticContext.module = options.module;
    if (options.domain !== undefined) staticContext.domain = options.domain;
    if (options.resource !== undefined) staticContext.resource = options.resource;
    if (options.actor !== undefined) staticContext.actor = options.actor;
    if (options.context !== undefined) staticContext.context = options.context;
    return Object.keys(staticContext).length > 0 ? staticContext : undefined;
}

/**
 * 创建可在任意位置复用的运行时 logger。
 * 每个级别方法均支持 .title() 变体，输出标题行和可选参数行，不附加 detail。
 *
 * 所有 facade 方法都会自动合并三层上下文：
 * 显式 context > logger staticContext > 当前请求 AsyncLocalStorage context。
 */
export function createRuntimeLogger(moduleName: string, options: RuntimeLoggerOptions = {}): RuntimeLogger {
    const normalizedModule = normalizeModuleName(moduleName);

    const staticContext = resolveLoggerStaticContext(options);
    const frozenStaticContext: RuntimeLoggerStaticContext | undefined =
        staticContext === undefined ? undefined : cloneStaticContext(staticContext);
    const consoleStyle = options.consoleStyle ? structuredClone(options.consoleStyle) : undefined;

    return {
        info: createLogMethod('info', normalizedModule, frozenStaticContext, consoleStyle),
        debug: createLogMethod('debug', normalizedModule, frozenStaticContext, consoleStyle),
        verbose: createLogMethod('verbose', normalizedModule, frozenStaticContext, consoleStyle),
        warn: createLogMethod('warn', normalizedModule, frozenStaticContext, consoleStyle),
        error: createLogMethod('error', normalizedModule, frozenStaticContext, consoleStyle),
        fatal: createLogMethod('fatal', normalizedModule, frozenStaticContext, consoleStyle),

        /**
         * 手动写入完整结构的系统日志（logType: 'system'）。
         */
        system(input: Omit<RuntimeLogInput, 'module' | 'logType'>) {
            return writeSystemLog(composeManualInput(input, normalizedModule, frozenStaticContext), { consoleStyle });
        },

        /**
         * 手动写入用户操作日志（logType: 'user_action'）。
         */
        userAction(input: Omit<RuntimeLogInput, 'module' | 'logType'>) {
            return writeRuntimeLog(
                {
                    ...composeManualInput(input, normalizedModule, frozenStaticContext),
                    logType: 'user_action'
                },
                { consoleStyle }
            );
        },

        /**
         * 手动输出审计控制台日志（logType: 'audit'，不落盘文件）。
         */
        audit(input: Omit<RuntimeLogInput, 'module' | 'logType'>) {
            return writeRuntimeLog(
                {
                    ...composeManualInput(input, normalizedModule, frozenStaticContext),
                    logType: 'audit'
                },
                { consoleStyle }
            );
        }
    };
}
