/**
 * 运行时日志级别
 */
export type RuntimeLogLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

/**
 * 运行时控制台日志样式配置。
 * 只影响控制台标题行展示，不影响 RuntimeLogEntry 结构和 JSONL 落盘内容。
 */
export interface RuntimeConsoleLogStyle {
    /** Winston 颜色表，key 支持日志级别、badge_<level>、context、ms 等 colorize 名称。 */
    colors?: Partial<Record<string, string>>;
    /** 各日志级别对应的颜文字/符号标签。 */
    levelEmotions?: Partial<Record<RuntimeLogLevel, string>>;
    /** 控制台级别 badge 显示宽度。 */
    badgeWidth?: number;
    /** .title(context) 标题行展开标记。 */
    titleArgsOpenMarker?: string;
    /** .title(context) 参数块收束标记。 */
    titleArgsCloseMarker?: string;
    /** 标题行和参数标记之间的间隔。 */
    titleArgsContentGap?: string;
}

/**
 * Runtime logger 初始化配置。
 */
export interface RuntimeLoggerOptions extends RuntimeLoggerStaticContext {
    /** 当前 logger 的控制台样式覆盖。 */
    consoleStyle?: RuntimeConsoleLogStyle;
}

/**
 * LogModule / 全局 runtime logger 配置。
 */
export interface RuntimeLoggerModuleOptions {
    /** 全局控制台样式覆盖。 */
    consoleStyle?: RuntimeConsoleLogStyle;
}

/**
 * 运行时日志类型
 */
export type RuntimeLogType = 'system' | 'user_action' | 'audit';

/**
 * 结构化日志的基础键值对象
 */
export type RuntimeLogRecord = Record<string, unknown>;

/**
 * 日志中的操作者信息
 */
export interface RuntimeLogActor {
    id: string;
    type: string;
    name?: string;
    roles?: string[];
}

/**
 * 日志中的资源信息
 */
export interface RuntimeLogResource {
    type?: string;
    id?: string;
    action?: string;
}

/**
 * 日志中的结果信息
 */
export interface RuntimeLogResult {
    success: boolean;
    message?: string;
}

/**
 * 日志中的错误信息
 */
export interface RuntimeLogError {
    name?: string;
    code?: string | number;
    message?: string;
    stack?: string;
    /** 普通错误对象中未进入摘要字段的额外信息。 */
    details?: RuntimeLogRecord;
}

/**
 * HTTP 相关的详细快照
 */
export interface RuntimeHttpSnapshot {
    controllerHandler?: string;
    method?: string;
    path?: string;
    route?: string;
    requestHeaders?: unknown;
    requestQuery?: unknown;
    requestParams?: unknown;
    requestBody?: unknown;
    responseHeaders?: unknown;
    responseBody?: unknown;
    statusCode?: number;
    bizCode?: number;
    durationMs?: number;
    ip?: string;
    userAgent?: string;
}

/**
 * gRPC 相关的详细快照
 */
export interface RuntimeRpcSnapshot {
    transport?: 'grpc';
    service?: string;
    method?: string;
    path?: string;
    peer?: string;
    requestMetadata?: unknown;
    requestBody?: unknown;
    grpcStatus?: number;
    durationMs?: number;
}

/**
 * 日志内嵌的标签候选字段。
 * Promtail 只应把低基数字段提升为 Loki labels，高基数字段保留在日志 JSON 中按需解析。
 */
export interface RuntimeLogLabels {
    id: string;
    app: string;
    env: string;
    log_type: RuntimeLogType;
    level: RuntimeLogLevel;
    module: string;
    user_id: string;
}

/**
 * 最终写入文件和控制台的日志结构
 */
export interface RuntimeLogEntry {
    /** 日志唯一标识（ULID） */
    id: string;
    ts: string;
    level: RuntimeLogLevel;
    logType: RuntimeLogType;
    app: string;
    env: string;
    module: string;
    userId: string;
    labels: RuntimeLogLabels;
    message: string;
    event: string;
    requestId?: string;
    traceId?: string;
    spanId?: string;
    caller?: string;
    actor?: RuntimeLogActor;
    http?: RuntimeHttpSnapshot;
    rpc?: RuntimeRpcSnapshot;
    resource?: RuntimeLogResource;
    result?: RuntimeLogResult;
    error?: RuntimeLogError;
    context?: RuntimeLogRecord;
}

/**
 * 运行时日志输入结构
 */
export interface RuntimeLogInput {
    level: RuntimeLogLevel;
    logType: RuntimeLogType;
    module: string;
    userId?: string;
    message: string;
    event?: string;
    requestId?: string;
    actor?: RuntimeLogActor;
    http?: RuntimeHttpSnapshot;
    rpc?: RuntimeRpcSnapshot;
    resource?: RuntimeLogResource;
    result?: RuntimeLogResult;
    error?: RuntimeLogError;
    context?: RuntimeLogRecord;
    caller?: string;
}

/**
 * 审计日志装饰器配置
 */
export interface AuditLogOptions {
    module: string;
    action: string;
    summary: string;
    resourceType: string;
    resourceIdPath?: string;
    context?: RuntimeLogRecord;
}

/**
 * 请求对象上的审计上下文
 */
export interface AuditRequestContext extends AuditLogOptions {
    beforeData?: unknown;
    context?: RuntimeLogRecord;
}

/**
 * 请求对象上的日志上下文
 */
export interface RuntimeRequestContextState {
    requestId?: string;
    startAt?: number;
    module?: string;
    controllerHandler?: string;
    responseBody?: unknown;
    audit?: AuditRequestContext;
}

/**
 * 请求范围内的日志上下文快照。
 * 中间件先写入 requestId / actor / HTTP 入口快照，拦截器再补 controller/module 等路由信息。
 */
export interface RuntimeRequestContext extends RuntimeRequestContextState {
    actor?: RuntimeLogActor;
    http?: RuntimeHttpSnapshot;
    rpc?: RuntimeRpcSnapshot;
    extra?: RuntimeLogRecord;
}

/**
 * Logger 实例级常量上下文。
 * 适合把“这个服务/控制器永远属于哪个领域、默认操作哪类资源”绑定在 logger 上，
 * 每次写日志都会与请求上下文和调用处显式 context 合并。
 */
export interface RuntimeLoggerStaticContext {
    module?: string;
    domain?: string;
    resource?: { type?: string; id?: string };
    actor?: Partial<RuntimeLogActor>;
    context?: RuntimeLogRecord;
}

/**
 * 审计日志落库输入结构
 */
export interface AuditLogWriteInput {
    app: string;
    module: string;
    action: string;
    summary: string;
    resourceType: string;
    resourceId?: string;
    requestId?: string;
    actorId?: string;
    actorType?: string;
    actorName?: string;
    actorRoles?: string[];
    requestMethod?: string;
    requestPath?: string;
    ip?: string;
    userAgent?: string;
    statusCode?: number;
    bizCode?: number;
    result: 'SUCCESS' | 'FAILURE' | 'DENY';
    failureReason?: string;
    requestHeaders?: unknown;
    requestBody?: unknown;
    responseHeaders?: unknown;
    responseBody?: unknown;
    beforeData?: unknown;
    afterData?: unknown;
    context?: RuntimeLogRecord;
}
