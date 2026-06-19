import { normalizeModuleName } from './runtime-log.util';
import type {
    RuntimeHttpSnapshot,
    RuntimeLogActor,
    RuntimeLogError,
    RuntimeLogRecord,
    RuntimeLogResource,
    RuntimeRpcSnapshot,
    RuntimeLoggerStaticContext,
    RuntimeRequestContext
} from './runtime-log.types';

/** mergeLogContext 输入：三层上下文（外加 logger 构造参数）汇聚到一条 RuntimeLogEntry。 */
export interface MergeInputs {
    /** logger 构造第一参数；最末优先级，归一化后兜底为 'unknown' */
    moduleName: string;
    /** 实例上的常量上下文（已结构化拷贝） */
    staticContext?: RuntimeLoggerStaticContext;
    /** 当前 ALS 中的请求上下文，可能为 undefined */
    requestContext?: RuntimeRequestContext;
    /** 调用方在级别方法第二参数显式传入的上下文（类型为未知，运行时做防御性解构） */
    explicitContext?: Record<string, unknown>;
}

/** mergeLogContext 输出：可直接展开到 writeSystemLog 顶层字段。 */
export interface MergeResult {
    module: string;
    requestId?: string;
    actor?: RuntimeLogActor;
    http?: RuntimeHttpSnapshot;
    rpc?: RuntimeRpcSnapshot;
    resource?: RuntimeLogResource;
    error?: RuntimeLogError;
    context?: RuntimeLogRecord;
    userId?: string;
}

/**
 * 显式 context 中被结构化抽取的顶层 key，不会再作为额外字段进入 context.*。
 * 注意：`userId` 不在该集合内——它会一并被收入 context.*，最终的顶层 `userId`
 * 由 mergedActor.id 派生（设计文档要求）。
 */
const RESERVED_EXPLICIT_KEYS = new Set(['module', 'requestId', 'actor', 'http', 'rpc', 'resource', 'error']);

/** 防御性 plain object 判断（排除数组、null、Date、Error 等非普通对象）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

/** 仅当 value 是 string 类型时返回；否则 undefined。 */
function pickString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** 仅当 value 是 string 或 number 类型时返回，用于 RuntimeLogError.code。 */
function pickErrorCode(value: unknown): string | number | undefined {
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

/** 从普通错误对象中抽取未进入 name/code/message/stack 摘要的额外字段。 */
function pickErrorDetails(
    value: Record<string, unknown>,
    summary: {
        name: string | undefined;
        code: string | number | undefined;
        message: string | undefined;
        stack: string | undefined;
    }
): RuntimeLogRecord | undefined {
    const details: RuntimeLogRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        if (
            (key === 'name' && summary.name !== undefined) ||
            (key === 'code' && summary.code !== undefined) ||
            (key === 'message' && summary.message !== undefined) ||
            (key === 'stack' && summary.stack !== undefined)
        ) {
            continue;
        }
        if (entry !== undefined) details[key] = entry;
    }
    return compactRecord(details);
}

/** 按顺序取首个非 undefined 值（"firstDefined" 语义）。 */
function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
    for (const value of values) {
        if (value !== undefined) return value;
    }
    return undefined;
}

/** 删除 undefined 字段，并在没有有效字段时返回 undefined。 */
function compactRecord(record: Record<string, unknown>): Record<string, unknown> | undefined {
    const compacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
        if (value !== undefined) compacted[key] = value;
    }
    return Object.keys(compacted).length > 0 ? compacted : undefined;
}

/** 仅当输入有定义时调用 normalizeModuleName，避免把 undefined 误转成 'unknown'。 */
function normalizeIfDefined(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    return normalizeModuleName(value);
}

/**
 * 防御性解析 explicitContext.actor，把任意结构裁剪成 Partial<RuntimeLogActor>。
 *
 * 关键语义：`roles` 字段区分"显式空数组"和"未提供"——
 * - 当 actor.roles 是数组（含空数组）→ 视为显式提供，进入 result.roles，触发"显式覆盖"路径
 * - 当 actor.roles 缺省 / 非数组 → 不写入 result.roles，触发"union(static, request)"路径
 */
function readActorPartial(value: unknown): Partial<RuntimeLogActor> | undefined {
    if (!isPlainObject(value)) return undefined;

    const result: Partial<RuntimeLogActor> = {};
    const id = pickString(value.id);
    const type = pickString(value.type);
    const name = pickString(value.name);
    if (id !== undefined) result.id = id;
    if (type !== undefined) result.type = type;
    if (name !== undefined) result.name = name;
    if (Array.isArray(value.roles)) {
        result.roles = value.roles.filter((item): item is string => typeof item === 'string');
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 合并 actor：id/type/name 走优先级覆盖；roles 走"显式覆盖 ?? union 去重"。
 *
 * RuntimeLogActor 的 id 是身份锚点；如果三层都没有 id，就不写 actor，
 * 避免把 `{ roles: [...] }` 这类半结构对象 cast 成完整操作者。
 */
function mergeActor(
    explicit: Partial<RuntimeLogActor> | undefined,
    staticActor: Partial<RuntimeLogActor> | undefined,
    requestActor: RuntimeLogActor | undefined
): RuntimeLogActor | undefined {
    const id = firstDefined(explicit?.id, staticActor?.id, requestActor?.id);
    const type = firstDefined(explicit?.type, staticActor?.type, requestActor?.type);
    const name = firstDefined(explicit?.name, staticActor?.name, requestActor?.name);

    let roles: string[] | undefined;
    if (explicit?.roles !== undefined) {
        // 显式 actor.roles 完全覆盖（仍按字符串相等去重，防御调用方传入重复项）
        roles = [...new Set(explicit.roles)];
    } else if (staticActor?.roles !== undefined || requestActor?.roles !== undefined) {
        // 显式缺省时：union(static, request) 去重
        roles = [...new Set([...(staticActor?.roles ?? []), ...(requestActor?.roles ?? [])])];
    } else {
        roles = undefined;
    }

    if (id === undefined) {
        return undefined;
    }

    const merged: RuntimeLogActor = {
        id,
        type: type ?? 'user'
    };
    if (name !== undefined) merged.name = name;
    if (roles !== undefined) merged.roles = roles;
    return merged;
}

/** 防御性解析 explicit.http：保留所有非 undefined 子字段，作为浅合并输入。 */
function readHttpPartial(value: unknown): RuntimeHttpSnapshot | undefined {
    if (!isPlainObject(value)) return undefined;
    return compactRecord(value) as RuntimeHttpSnapshot | undefined;
}

/** 浅合并 http：explicit.* 覆盖 request.*；两层均缺省时返回 undefined。 */
function mergeHttp(
    explicit: RuntimeHttpSnapshot | undefined,
    request: RuntimeHttpSnapshot | undefined
): RuntimeHttpSnapshot | undefined {
    if (!explicit && !request) return undefined;
    return compactRecord({
        ...((request ?? {}) as Record<string, unknown>),
        ...((explicit ?? {}) as Record<string, unknown>)
    }) as RuntimeHttpSnapshot | undefined;
}

/** 防御性解析 explicit.rpc：保留所有非 undefined 子字段，作为浅合并输入。 */
function readRpcPartial(value: unknown): RuntimeRpcSnapshot | undefined {
    if (!isPlainObject(value)) return undefined;
    return compactRecord(value) as RuntimeRpcSnapshot | undefined;
}

/** 浅合并 rpc：explicit.* 覆盖 request.*；两层均缺省时返回 undefined。 */
function mergeRpc(
    explicit: RuntimeRpcSnapshot | undefined,
    request: RuntimeRpcSnapshot | undefined
): RuntimeRpcSnapshot | undefined {
    if (!explicit && !request) return undefined;
    return compactRecord({
        ...((request ?? {}) as Record<string, unknown>),
        ...((explicit ?? {}) as Record<string, unknown>)
    }) as RuntimeRpcSnapshot | undefined;
}

/** 防御性解析 explicit.resource：仅接受 type / id / action 三个字符串字段。 */
function readResourcePartial(value: unknown): RuntimeLogResource | undefined {
    if (!isPlainObject(value)) return undefined;
    return compactRecord({
        type: pickString(value.type),
        id: pickString(value.id),
        action: pickString(value.action)
    }) as RuntimeLogResource | undefined;
}

/** 浅合并 resource：explicit.* 覆盖 static.*；两层均缺省时返回 undefined。 */
function mergeResource(
    explicit: RuntimeLogResource | undefined,
    staticResource: { type?: string; id?: string; action?: string } | undefined
): RuntimeLogResource | undefined {
    if (!explicit && !staticResource) return undefined;
    return compactRecord({
        ...((staticResource ?? {}) as Record<string, unknown>),
        ...((explicit ?? {}) as Record<string, unknown>)
    }) as RuntimeLogResource | undefined;
}

/**
 * 防御性解析 explicit.error，把 logger.error('msg', { error }) 这类调用提升到
 * RuntimeLogEntry.error，避免 error stack 只藏在 context.error 里。
 */
function readErrorSummary(value: unknown): RuntimeLogError | undefined {
    if (value === undefined) return undefined;

    if (value instanceof Error) {
        const errorWithCode = value as Error & { code?: unknown };
        return {
            name: value.name,
            code: pickErrorCode(errorWithCode.code),
            message: value.message,
            stack: value.stack
        };
    }

    if (isPlainObject(value)) {
        const name = pickString(value.name);
        const code = pickErrorCode(value.code);
        const message = pickString(value.message);
        const stack = pickString(value.stack);
        const details = pickErrorDetails(value, { name, code, message, stack });

        if (name !== undefined || code !== undefined || message !== undefined || stack !== undefined) {
            return {
                ...(name !== undefined ? { name } : {}),
                ...(code !== undefined ? { code } : {}),
                ...(message !== undefined ? { message } : {}),
                ...(stack !== undefined ? { stack } : {}),
                ...(details !== undefined ? { details } : {})
            };
        }

        if (details !== undefined) {
            return {
                message: 'Non-Error object provided as error',
                details
            };
        }
    }

    return {
        message: typeof value === 'string' ? value : String(value)
    };
}

/**
 * 把 staticContext 中"会进入 RuntimeLogEntry.context"的字段抽离成单层 Record：
 * - staticContext.domain → result.domain（设计要求 domain 写入 context.domain）
 * - staticContext.context → 直接展开
 *
 * 其它顶层字段（module / actor / resource）有专门的合并通道，不进入 context。
 */
function buildStaticContextLayer(
    staticContext: RuntimeLoggerStaticContext | undefined
): Record<string, unknown> | undefined {
    if (!staticContext) return undefined;
    const result: Record<string, unknown> = {};
    let hasField = false;
    if (staticContext.domain !== undefined) {
        result.domain = staticContext.domain;
        hasField = true;
    }
    if (staticContext.context && Object.keys(staticContext.context).length > 0) {
        Object.assign(result, staticContext.context);
        hasField = true;
    }
    return hasField ? result : undefined;
}

/**
 * 浅合并 RuntimeLogEntry.context，优先级 explicit > static > request.extra；
 * 三层均缺省时返回 undefined（保持 RuntimeLogEntry.context 字段稳定）。
 */
function mergeContext(
    explicitExtra: Record<string, unknown> | undefined,
    staticLayer: Record<string, unknown> | undefined,
    requestExtra: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
    if (!explicitExtra && !staticLayer && !requestExtra) return undefined;
    return compactRecord({
        ...(requestExtra ?? {}),
        ...(staticLayer ?? {}),
        ...(explicitExtra ?? {})
    });
}

/** 合并三层上下文，调用方可直接把结果展开到 RuntimeLogInput。 */
export function mergeLogContext(input: MergeInputs): MergeResult {
    const { moduleName, staticContext, requestContext, explicitContext } = input;
    const explicit: Record<string, unknown> = explicitContext ?? {};

    // module 标识日志来源，显式覆盖优先，其次是 logger 创建时绑定的静态上下文。
    const explicitModule = normalizeIfDefined(pickString(explicit.module));
    const staticModule = normalizeIfDefined(staticContext?.module);
    const requestModule = normalizeIfDefined(requestContext?.module);
    // moduleName 是必填参数；若为空字符串/未定义，normalizeModuleName 会兜底为 'unknown'
    const ctorModule = normalizeModuleName(moduleName);
    const moduleResolved = firstDefined(explicitModule, staticModule, requestModule, ctorModule)!;

    // requestId 只来自显式 context 或请求上下文，不从 staticContext 读取，避免实例级污染。
    const explicitRequestId = pickString(explicit.requestId);
    const requestRequestId = pickString(requestContext?.requestId);
    const requestIdResolved = firstDefined(explicitRequestId, requestRequestId);

    // actor.id 是顶层 userId 的来源；没有 id 时不写半截 actor。
    const actorResolved = mergeActor(readActorPartial(explicit.actor), staticContext?.actor, requestContext?.actor);

    // HTTP 快照来自请求上下文，显式字段可覆盖其中某些子字段。
    const httpResolved = mergeHttp(readHttpPartial(explicit.http), requestContext?.http);

    // RPC 快照来自请求上下文，显式字段可覆盖其中某些子字段。
    const rpcResolved = mergeRpc(readRpcPartial(explicit.rpc), requestContext?.rpc);

    // resource 是业务资源语义，staticContext 可提供默认资源类型，调用处可补资源 id/action。
    const resourceResolved = mergeResource(readResourcePartial(explicit.resource), staticContext?.resource);

    // error 是保留 key：提升为 RuntimeLogEntry.error，避免堆栈只藏在 context 里。
    const errorResolved = readErrorSummary(explicit.error);

    // context 只收自由扩展字段；保留 key 已经走各自的结构化通道。
    const explicitExtra: Record<string, unknown> = {};
    let hasExplicitExtra = false;
    for (const [k, v] of Object.entries(explicit)) {
        if (RESERVED_EXPLICIT_KEYS.has(k)) continue;
        explicitExtra[k] = v;
        hasExplicitExtra = true;
    }
    const contextResolved = mergeContext(
        hasExplicitExtra ? explicitExtra : undefined,
        buildStaticContextLayer(staticContext),
        requestContext?.extra
    );

    // userId 跟随 actor.id；没有 actor 时由 buildRuntimeEntry 按 logType 兜底。
    const userIdResolved = pickString(actorResolved?.id);

    // undefined 字段不写入返回对象，保持最终日志 JSON 简洁。
    const result: MergeResult = { module: moduleResolved };
    if (requestIdResolved !== undefined) result.requestId = requestIdResolved;
    if (actorResolved !== undefined) result.actor = actorResolved;
    if (httpResolved !== undefined) result.http = httpResolved;
    if (rpcResolved !== undefined) result.rpc = rpcResolved;
    if (resourceResolved !== undefined) result.resource = resourceResolved;
    if (errorResolved !== undefined) result.error = errorResolved;
    if (contextResolved !== undefined) result.context = contextResolved;
    if (userIdResolved !== undefined) result.userId = userIdResolved;
    return result;
}
