import { ulid } from 'ulid';
import type { Readable } from 'node:stream';
import type {
    AuditRequestContext,
    RuntimeLogActor,
    RuntimeLogError,
    RuntimeLogRecord,
    RuntimeRequestContext
} from './runtime-log.types';
import type { HttpLoggingRequest } from './http-log.types';

export const HTTP_REQUEST_ID_HEADER = 'x-request-id';
export const HTTP_USER_AGENT_HEADER = 'user-agent';

const HTTP_FORWARDED_FOR_HEADER = 'x-forwarded-for';
const HTTP_REAL_IP_HEADER = 'x-real-ip';

const SHIRO_RESPONSE_CODE_FIELD = 'code';
const SHIRO_RESPONSE_MESSAGE_FIELD = 'message';
const SHIRO_ERROR_NAME_FIELD = 'name';

const REQUEST_SESSION_FIELD = 'session';
const REQUEST_USER_FIELD = 'user';
const SESSION_USER_FIELD = 'user';
const SESSION_ROLES_FIELD = 'roles';
const SESSION_ACTOR_PRIMARY_ID_KEYS = ['id'] as const;
const SESSION_ACTOR_FALLBACK_ID_KEYS = ['sub'] as const;
const REQUEST_ACTOR_ID_KEYS = ['id', 'userId', 'sub'] as const;
const ACTOR_TYPE_KEYS = ['type'] as const;
const SESSION_ACTOR_NAME_KEYS = ['name'] as const;
const REQUEST_ACTOR_NAME_KEYS = ['username', 'name'] as const;
const ROLE_NAME_KEYS = ['code', 'name'] as const;

const SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /token/i,
    /authorization/i,
    /cookie/i,
    /secret/i,
    /api_?key/i,
    /psalt/i,
    /captcha/i,
    /(sms|verify|verification|otp).*code/i,
    /code.*(sms|verify|verification|otp)/i
];

/**
 * 获取当前运行中的应用名称
 */
export function getRuntimeAppName(): string {
    return process.env.SHIRO_APP_NAME || 'unknown-app';
}

/**
 * 获取当前运行环境名称
 */
export function getRuntimeEnvName(): string {
    return process.env.NODE_ENV || 'development';
}

/**
 * 判断当前是否生产环境
 */
export function isProductionEnvironment(): boolean {
    return getRuntimeEnvName() === 'production';
}

/**
 * 判断当前是否需要输出控制台 detail 详情。
 */
export function shouldPrintConsoleDetails(): boolean {
    if (process.env.SHIRO_LOG_CONSOLE_DETAILS === 'false') {
        return false;
    }

    return !isProductionEnvironment();
}

/**
 * 生成请求 ID（使用 ULID）
 */
export function createRequestId(current?: string | string[]): string {
    if (Array.isArray(current)) {
        return current[0] || ulid();
    }
    return current || ulid();
}

/**
 * 从运行时对象中按优先级读取第一个可转成字符串的字段。
 * 这些 key 是日志边界对外部请求 / 会话形态的适配点，集中在常量里避免散落硬编码。
 */
function pickStringByKeys(record: RuntimeLogRecord | undefined, keys: readonly string[]): string | undefined {
    if (!record) {
        return undefined;
    }

    for (const key of keys) {
        const value = toOptionalString(record[key]);
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

/** 按参数顺序返回首个有意义字符串。 */
function firstOptionalString(...values: Array<string | undefined>): string | undefined {
    for (const value of values) {
        if (value !== undefined) {
            return value;
        }
    }

    return undefined;
}

/** 读取 HTTP 头第一个值，统一处理 Node/Express 可能返回的 string[]。 */
export function getHttpHeaderValue(request: HttpLoggingRequest, headerName: string): string | undefined {
    const value = request.headers[headerName];
    return Array.isArray(value) ? value[0] : value;
}

/**
 * 获取请求真实 IP
 */
export function getClientIp(request: HttpLoggingRequest): string {
    const forwardedFor = getHttpHeaderValue(request, HTTP_FORWARDED_FOR_HEADER);
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = getHttpHeaderValue(request, HTTP_REAL_IP_HEADER);
    if (realIp) {
        return realIp;
    }

    return request.ip || request.socket?.remoteAddress || 'unknown';
}

/**
 * 获取日志中使用的用户 ID
 */
export function getLogUserId(request?: HttpLoggingRequest): string {
    const actor = extractActorFromRequest(request);
    return actor?.id || 'anonymous';
}

/**
 * 从请求中提取操作者信息
 */
export function extractActorFromRequest(request?: HttpLoggingRequest): RuntimeLogActor | undefined {
    if (!request) {
        return undefined;
    }

    const session = request[REQUEST_SESSION_FIELD] as RuntimeLogRecord | undefined;
    const sessionUser = session?.[SESSION_USER_FIELD] as RuntimeLogRecord | undefined;
    const sessionRoles = session?.[SESSION_ROLES_FIELD] as Array<string | RuntimeLogRecord> | undefined;
    const requestUser = request[REQUEST_USER_FIELD] as RuntimeLogRecord | undefined;
    const actorId = firstOptionalString(
        pickStringByKeys(sessionUser, SESSION_ACTOR_PRIMARY_ID_KEYS),
        pickStringByKeys(requestUser, REQUEST_ACTOR_ID_KEYS),
        pickStringByKeys(sessionUser, SESSION_ACTOR_FALLBACK_ID_KEYS)
    );

    if (!actorId) {
        return undefined;
    }

    const actorRoles = Array.isArray(sessionRoles)
        ? sessionRoles
              .map((item) => {
                  if (typeof item === 'string') return item;
                  return pickStringByKeys(item, ROLE_NAME_KEYS);
              })
              .filter((item): item is string => Boolean(item))
        : [];

    return {
        id: actorId,
        type:
            firstOptionalString(
                pickStringByKeys(sessionUser, ACTOR_TYPE_KEYS),
                pickStringByKeys(requestUser, ACTOR_TYPE_KEYS)
            ) || 'user',
        name: firstOptionalString(
            pickStringByKeys(sessionUser, SESSION_ACTOR_NAME_KEYS),
            pickStringByKeys(requestUser, REQUEST_ACTOR_NAME_KEYS)
        ),
        roles: actorRoles.length > 0 ? actorRoles : undefined
    };
}

/**
 * 将值转换为可选字符串
 */
export function toOptionalString(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    return String(value);
}

const LOGGER_INTERNAL_FILE_HINTS = ['/logger/runtime-log.util.', '/logger/runtime-logger.'];

function formatStackFrameLocation(line: string): string | undefined {
    const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
    if (!match) {
        return undefined;
    }

    const [, fn, file, row] = match;
    const normalizedFile = file.replace(/\\/g, '/');
    const fileName = normalizedFile.split('/').pop();
    if (!fileName) {
        return undefined;
    }

    return `${fileName}:${row}${fn ? ` (${fn})` : ''}`;
}

/**
 * 获取业务调用位置。
 *
 * logger 内部调用层级会随着封装调整而变化，所以默认按文件名跳过日志模块自身；
 * 只有找不到外部帧时才回退到固定偏移，避免 caller 被写成 writeSystemLog/composeAndWrite。
 */
export function getCallerLocation(stackOffset: number = 3): string | undefined {
    const stack = new Error().stack;
    if (!stack) {
        return undefined;
    }

    const lines = stack.split('\n');
    for (const line of lines.slice(1)) {
        const normalizedLine = line.replace(/\\/g, '/');
        if (LOGGER_INTERNAL_FILE_HINTS.some((hint) => normalizedLine.includes(hint))) {
            continue;
        }

        const location = formatStackFrameLocation(line);
        if (location) {
            return location;
        }
    }

    return lines[stackOffset] ? formatStackFrameLocation(lines[stackOffset]) : undefined;
}

/**
 * 获取业务响应码
 */
export function getBizCodeFromBody(body: unknown): number | undefined {
    if (!body || typeof body !== 'object') {
        return undefined;
    }

    const code = (body as RuntimeLogRecord)[SHIRO_RESPONSE_CODE_FIELD];
    return typeof code === 'number' ? code : undefined;
}

/**
 * 根据状态码和业务码推断结果类型。
 * 401/403 视为权限拒绝，4xx+ 视为失败，bizCode 不等于 successCode 也视为失败。
 */
export function getResultByResponse(
    statusCode: number,
    bizCode?: number,
    successCode?: number
): 'SUCCESS' | 'FAILURE' | 'DENY' {
    if (statusCode === 401 || statusCode === 403) {
        return 'DENY';
    }

    if (statusCode >= 400) {
        return 'FAILURE';
    }

    if (successCode !== undefined && bizCode !== undefined && bizCode !== successCode) {
        return 'FAILURE';
    }

    return 'SUCCESS';
}

/**
 * 构造错误摘要
 */
export function buildErrorSummary(body: unknown, statusCode: number): RuntimeLogError | undefined {
    if (statusCode < 400) {
        return undefined;
    }

    if (body && typeof body === 'object') {
        const record = body as RuntimeLogRecord;
        return {
            name: toOptionalString(record[SHIRO_ERROR_NAME_FIELD]),
            code: toOptionalString(record[SHIRO_RESPONSE_CODE_FIELD]),
            message: toOptionalString(record[SHIRO_RESPONSE_MESSAGE_FIELD])
        };
    }

    return {
        message: typeof body === 'string' ? body : `HTTP ${statusCode}`
    };
}

/**
 * 判断对象是否为 Buffer
 */
function isBufferLike(value: unknown): value is Buffer {
    return typeof Buffer !== 'undefined' && Buffer.isBuffer(value);
}

/**
 * 判断对象是否为可读流
 */
function isReadableStream(value: unknown): value is Readable {
    return Boolean(value && typeof value === 'object' && typeof (value as Readable).pipe === 'function');
}

/**
 * 判断对象是否为上传文件对象
 */
function isUploadFile(value: unknown): value is RuntimeLogRecord {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const file = value as RuntimeLogRecord;
    return Boolean(file.originalname || file.filename || file.mimetype || file.encoding || file.size || file.fieldname);
}

/**
 * 判断键名是否属于敏感字段
 */
function shouldMaskKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * 对日志内容执行脱敏和二进制标准化
 */
export function sanitizeForLogging(value: unknown, parentKey?: string, seen?: WeakSet<object>): unknown {
    const visiting = seen ?? new WeakSet<object>();

    if (parentKey && shouldMaskKey(parentKey) && isProductionEnvironment()) {
        return '[FILTERED]';
    }

    if (value === undefined || value === null) {
        return value;
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (typeof value === 'function') {
        return `[Function:${value.name || 'anonymous'}]`;
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack
        };
    }

    if (isBufferLike(value)) {
        return {
            type: 'buffer',
            size: value.length
        };
    }

    if (isReadableStream(value)) {
        return {
            type: 'stream'
        };
    }

    if (isUploadFile(value)) {
        const file = value as RuntimeLogRecord;
        return {
            type: 'file',
            fieldname: toOptionalString(file.fieldname),
            originalname: toOptionalString(file.originalname),
            filename: toOptionalString(file.filename),
            mimetype: toOptionalString(file.mimetype),
            encoding: toOptionalString(file.encoding),
            size: typeof file.size === 'number' ? file.size : undefined
        };
    }

    if (visiting.has(value as object)) {
        return '[Circular]';
    }

    visiting.add(value as object);

    try {
        if (Array.isArray(value)) {
            return value.map((item) => sanitizeForLogging(item, parentKey, visiting));
        }

        const result: RuntimeLogRecord = {};
        for (const [key, entryValue] of Object.entries(value as RuntimeLogRecord)) {
            result[key] = sanitizeForLogging(entryValue, key, visiting);
        }
        return result;
    } finally {
        // 这里跟踪的是当前递归链，而不是全局“已见过”集合。
        // 同一对象被两个兄弟字段复用不应被误判为循环引用。
        visiting.delete(value as object);
    }
}

/**
 * 提取日志模块名
 */
export function normalizeModuleName(moduleName?: string): string {
    if (!moduleName) {
        return 'unknown';
    }

    return moduleName
        .replace(/Controller$/, '')
        .replace(/Interceptor$/, '')
        .replace(/Filter$/, '')
        .trim();
}

/**
 * 从对象路径读取值
 */
export function getValueByPath(source: unknown, path?: string): string | undefined {
    if (!source || !path) {
        return undefined;
    }

    const keys = path.split('.');
    let current: unknown = source;
    for (const key of keys) {
        if (!current || typeof current !== 'object') {
            return undefined;
        }
        current = (current as RuntimeLogRecord)[key];
    }
    return toOptionalString(current);
}

/**
 * 确保请求对象存在日志上下文
 */
export function ensureRequestLogContext(request: HttpLoggingRequest): RuntimeRequestContext {
    if (!request.__shiroLogContext) {
        request.__shiroLogContext = {};
    }
    return request.__shiroLogContext;
}

/**
 * 请求上下文里的 actor / http / extra 都是“逐步补齐”的对象：
 * 中间件写入口快照，拦截器补路由与控制器信息，业务代码也可以追加扩展字段。
 * 因此这里必须浅合并 patch，而不是整对象替换；否则已写入字段会被小补丁覆盖丢失。
 */
function mergeRequestContextObject<T extends object>(current: T | undefined, patch: T): T {
    return current ? { ...current, ...patch } : { ...patch };
}

/**
 * 合并请求范围日志上下文。
 *
 * 这是 request.__shiroLogContext 的唯一增量写入口；中间件已把同一份对象引用绑定进
 * AsyncLocalStorage，所以这里只更新 request 上的 state，logger 从 ALS 读到的也是更新后的对象。
 */
export function mergeRequestLogContext(
    request: HttpLoggingRequest,
    patch: Partial<RuntimeRequestContext>
): RuntimeRequestContext {
    const state = ensureRequestLogContext(request);

    if (patch.requestId !== undefined) state.requestId = patch.requestId;
    if (patch.startAt !== undefined) state.startAt = patch.startAt;
    if (patch.module !== undefined) state.module = patch.module;
    if (patch.controllerHandler !== undefined) state.controllerHandler = patch.controllerHandler;
    if (patch.responseBody !== undefined) state.responseBody = patch.responseBody;

    if (patch.audit !== undefined) {
        const mergedAuditContext =
            state.audit?.context || patch.audit.context
                ? {
                      ...(state.audit?.context || {}),
                      ...(patch.audit.context || {})
                  }
                : undefined;
        state.audit = {
            ...state.audit,
            ...patch.audit,
            ...(mergedAuditContext ? { context: mergedAuditContext } : {})
        } as AuditRequestContext;
    }

    if (patch.actor !== undefined) {
        state.actor = mergeRequestContextObject(state.actor, patch.actor);
    }
    if (patch.http !== undefined) {
        state.http = mergeRequestContextObject(state.http, patch.http);
    }
    if (patch.rpc !== undefined) {
        state.rpc = mergeRequestContextObject(state.rpc, patch.rpc);
    }
    if (patch.extra !== undefined) {
        state.extra = mergeRequestContextObject(state.extra, patch.extra);
    }

    return state;
}

/**
 * 写入请求审计上下文的入口。
 */
export function setRequestAuditContext(request: HttpLoggingRequest, audit: AuditRequestContext): RuntimeRequestContext {
    return mergeRequestLogContext(request, { audit });
}

/**
 * 向当前请求的审计上下文追加业务字段。
 */
export function appendAuditContext(request: HttpLoggingRequest, context: RuntimeLogRecord): RuntimeRequestContext {
    const state = ensureRequestLogContext(request);
    const currentAudit =
        state.audit ??
        ({
            module: 'security',
            action: 'authorization',
            summary: '授权审计上下文',
            resourceType: 'authorization'
        } as AuditRequestContext);

    state.audit = {
        ...currentAudit,
        context: {
            ...(currentAudit.context || {}),
            ...context
        }
    };

    return state;
}

/**
 * 审计路径匹配规则表。
 * 使用正则精确匹配路径段，避免 includes 导致的误匹配（如 /reset_password 误中 /password）。
 */
const AUDIT_PATH_RULES: Array<{
    pattern: RegExp;
    action: string;
    summary: string;
    failSummary: string;
}> = [
    {
        pattern: /\/(login|sign[-_]?in|login_by_phone|login_by_username)(\/|$)/,
        action: 'login',
        summary: '登录',
        failSummary: '登录失败'
    },
    {
        pattern: /\/(register|sign[-_]?up)(\/|$)/,
        action: 'register',
        summary: '注册',
        failSummary: '注册失败'
    },
    {
        pattern: /\/send_sms_code(\/|$)/,
        action: 'send_sms_code',
        summary: '发送短信验证码',
        failSummary: '发送短信验证码失败'
    },
    {
        pattern: /\/verify_sms_code(\/|$)/,
        action: 'verify_sms_code',
        summary: '验证短信验证码',
        failSummary: '验证短信验证码失败'
    },
    {
        pattern: /\/change[-_]password(\/|$)/,
        action: 'change_password',
        summary: '修改密码',
        failSummary: '修改密码失败'
    },
    {
        pattern: /\/(request[-_]reset|forgot[-_]password)(\/|$)/,
        action: 'request_reset',
        summary: '请求重置密码',
        failSummary: '请求重置密码失败'
    },
    {
        pattern: /\/verify[-_]reset(\/|$)/,
        action: 'verify_reset',
        summary: '验证重置凭证',
        failSummary: '验证重置凭证失败'
    },
    {
        pattern: /\/reset[-_]password(\/|$)/,
        action: 'reset_password',
        summary: '重置密码',
        failSummary: '重置密码失败'
    }
];

/**
 * 根据请求路径推断内置审计上下文。
 * 使用正则表匹配路径段，优先匹配具体路径，最后兜底 401/403 权限拒绝。
 */
export function buildImplicitAuditContext(path: string, statusCode?: number): AuditRequestContext | undefined {
    const pathOnly = path.split(/[?#]/)[0];
    const lowerPath = pathOnly.toLowerCase();
    const isFailed = statusCode !== undefined && statusCode >= 400;

    // 遍历规则表，首个匹配即返回
    for (const rule of AUDIT_PATH_RULES) {
        if (rule.pattern.test(lowerPath)) {
            return {
                module: 'auth',
                action: rule.action,
                summary: isFailed ? rule.failSummary : rule.summary,
                resourceType: 'account'
            };
        }
    }

    // 兜底：401/403 视为权限拒绝
    if (statusCode === 401 || statusCode === 403) {
        return {
            module: 'security',
            action: 'deny',
            summary: '权限拒绝',
            resourceType: 'permission',
            context: {
                path
            }
        };
    }

    return undefined;
}
