// Feature: admin-logger-unification, Property 3: 合并优先级（显式 > Static > Request）
import fc from 'fast-check';
import { mergeLogContext } from './merge-log-context';
import { normalizeModuleName } from './runtime-log.util';
import type {
    RuntimeHttpSnapshot,
    RuntimeLogActor,
    RuntimeLogRecord,
    RuntimeRpcSnapshot,
    RuntimeLoggerStaticContext,
    RuntimeRequestContext
} from './runtime-log.types';

/**
 * mergeLogContext 属性测试集合（admin-logger-unification）
 *
 * 本文件由任务 3.2 / 3.3 共同维护，每个 describe 块对应设计文档中的一条
 * Correctness Property。各 describe 块顶部以注释明确归属的特性 + Property 编号。
 */

/** firstDefined：按顺序取首个非 undefined 值，与 mergeLogContext 内部同名工具一致。 */
function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
    for (const value of values) {
        if (value !== undefined) return value;
    }
    return undefined;
}

/** 类型守卫：plain object（排除数组、null、原始类型）。 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 收集两个对象的所有 key（用于浅合并字段遍历）。 */
function collectKeys(
    a: Record<string, unknown> | undefined,
    b: Record<string, unknown> | RuntimeLogRecord | undefined
): Set<string> {
    const keys = new Set<string>();
    if (a) for (const k of Object.keys(a)) keys.add(k);
    if (b) for (const k of Object.keys(b as Record<string, unknown>)) keys.add(k);
    return keys;
}

/**
 * Property 3: 合并优先级（显式 > Static > Request）
 * Validates: Requirements 3.4, 5.1, 5.2, 5.3, 5.5
 *
 * 对任意三元组 (staticContext, requestContext, explicitContext)，对其同名 key
 * （取自三者并集）的最终 RuntimeLogEntry 字段值，等于按
 * "显式 > Static > Request" 优先级合并的结果（即对每个 key，取三者中
 * 按优先级第一个非 undefined 的值）；`actor.roles` 单独断言去重语义。
 *
 * 设计文档优先级表（design.md §3）：
 *
 * | 字段                 | 优先级（高 → 低）                                                  |
 * | ------------------- | ----------------------------------------------------------------- |
 * | module              | explicit → static → request → moduleName（每层先 normalizeModuleName） |
 * | requestId           | explicit → request                                                 |
 * | actor.id/type/name  | explicit → static → request                                        |
 * | actor.roles         | explicit overrides；否则 union(static, request) 去重                |
 * | http.*              | explicit → request（浅合并）                                        |
 * | rpc.*               | explicit → request（浅合并）                                        |
 * | resource.*          | explicit → static（浅合并）                                         |
 * | context.*           | 浅合并，explicit → static（含 domain）→ request.extra                |
 * | userId              | merged actor.id                                                    |
 */
describe('mergeLogContext - Property 3: 合并优先级（显式 > Static > Request）', () => {
    /**
     * 选用不会被 normalizeModuleName 改写的字符串集合：
     * - 仅小写字母 / 数字 / 下划线 / 连字符
     * - 首字符为小写字母
     * - 不含 Controller / Interceptor / Filter 后缀
     * - 不含前后空白
     * 这样 `normalizeModuleName(s) === s`，使得 Property 3 的优先级断言不与
     * Property 8（normalization）耦合。
     */
    const safeModuleNameArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/);

    /** moduleName 必填（logger 构造第一参数）；其余三层 module 可选。 */
    const optionalSafeModuleArb = fc.option(safeModuleNameArb, { nil: undefined });

    /** 一般标量字段：短字符串，避免影响缩减。 */
    const shortStringArb = fc.string({ minLength: 1, maxLength: 16 });
    const optionalShortStringArb = fc.option(shortStringArb, { nil: undefined });

    /** roles：字符串数组（含可能的重复），用于验证 union 去重。 */
    const rolesArb = fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
        maxLength: 5
    });

    /** static.actor：所有子字段可选；roles 可选。 */
    const staticActorArb = fc.option(
        fc.record(
            {
                id: optionalShortStringArb,
                type: fc.option(fc.constantFrom('user', 'service', 'system'), { nil: undefined }),
                name: optionalShortStringArb,
                roles: fc.option(rolesArb, { nil: undefined })
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /** request.actor：RuntimeLogActor，要求 id / type 必填。 */
    const requestActorArb = fc.option(
        fc.record(
            {
                id: shortStringArb,
                type: fc.constantFrom('user', 'service', 'system'),
                name: optionalShortStringArb,
                roles: fc.option(rolesArb, { nil: undefined })
            },
            { requiredKeys: ['id', 'type'] }
        ),
        { nil: undefined }
    );

    /** explicit.actor：与 static 相同的部分形态。 */
    const explicitActorArb = fc.option(
        fc.record(
            {
                id: optionalShortStringArb,
                type: fc.option(fc.constantFrom('user', 'service', 'system'), { nil: undefined }),
                name: optionalShortStringArb,
                roles: fc.option(rolesArb, { nil: undefined })
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /** http snapshot：仅生成几个稳定子字段，足以验证浅合并优先级。 */
    const httpRequestArb = fc.option(
        fc.record(
            {
                method: fc.option(fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'), { nil: undefined }),
                path: optionalShortStringArb,
                route: optionalShortStringArb,
                statusCode: fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined })
            },
            { requiredKeys: [] }
        ) as fc.Arbitrary<RuntimeHttpSnapshot>,
        { nil: undefined }
    );

    /** explicit.http 子字段集合与 request 相同（保持对照简单）。 */
    const httpExplicitArb = httpRequestArb;

    /** rpc snapshot：仅生成几个稳定子字段，足以验证浅合并优先级。 */
    const rpcRequestArb = fc.option(
        fc.record(
            {
                transport: fc.option(fc.constant<'grpc'>('grpc'), { nil: undefined }),
                service: optionalShortStringArb,
                method: optionalShortStringArb,
                path: optionalShortStringArb,
                grpcStatus: fc.option(fc.integer({ min: 0, max: 16 }), { nil: undefined }),
                durationMs: fc.option(fc.integer({ min: 0, max: 60_000 }), { nil: undefined })
            },
            { requiredKeys: [] }
        ) as fc.Arbitrary<RuntimeRpcSnapshot>,
        { nil: undefined }
    );

    /** explicit.rpc 子字段集合与 request 相同（保持对照简单）。 */
    const rpcExplicitArb = rpcRequestArb;

    /** static.resource：仅 type / id（与 RuntimeLoggerStaticContext.resource 类型一致）。 */
    const staticResourceArb = fc.option(
        fc.record(
            {
                type: optionalShortStringArb,
                id: optionalShortStringArb
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /** explicit.resource：允许 type / id / action（RuntimeLogResource 允许 action）。 */
    const explicitResourceArb = fc.option(
        fc.record(
            {
                type: optionalShortStringArb,
                id: optionalShortStringArb,
                action: optionalShortStringArb
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /** 自由扩展 context 字段：非保留 key + 简单值。 */
    const contextRecordArb = fc.option(
        fc.dictionary(
            fc
                .stringMatching(/^[a-z][a-z0-9_]{0,7}$/)
                .filter((k) => !['module', 'requestId', 'actor', 'http', 'rpc', 'resource', 'error'].includes(k)),
            fc.oneof(shortStringArb, fc.integer(), fc.boolean()),
            { maxKeys: 4 }
        ),
        { nil: undefined }
    );

    const optionalDomainArb = fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/), {
        nil: undefined
    });

    /** staticContext：所有字段可选。 */
    const staticContextArb: fc.Arbitrary<RuntimeLoggerStaticContext | undefined> = fc.option(
        fc.record(
            {
                module: optionalSafeModuleArb,
                domain: optionalDomainArb,
                resource: staticResourceArb,
                actor: staticActorArb,
                context: contextRecordArb
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /** requestContext：所有字段可选；actor / http / extra 也可缺省。 */
    const requestContextArb: fc.Arbitrary<RuntimeRequestContext | undefined> = fc.option(
        fc.record(
            {
                requestId: optionalShortStringArb,
                module: optionalSafeModuleArb,
                actor: requestActorArb,
                http: httpRequestArb,
                rpc: rpcRequestArb,
                extra: contextRecordArb
            },
            { requiredKeys: [] }
        ),
        { nil: undefined }
    );

    /**
     * explicitContext：以 Record<string, unknown> 形态生成。
     * - 保留 key（module / requestId / actor / http / resource）按结构化值生成
     * - 自由扩展字段会被展开到顶层（最终落到 RuntimeLogEntry.context）
     */
    const explicitContextArb: fc.Arbitrary<Record<string, unknown> | undefined> = fc.option(
        fc
            .record(
                {
                    module: optionalSafeModuleArb,
                    requestId: optionalShortStringArb,
                    actor: explicitActorArb,
                    http: httpExplicitArb,
                    rpc: rpcExplicitArb,
                    resource: explicitResourceArb,
                    extra: contextRecordArb
                },
                { requiredKeys: [] }
            )
            .map((raw) => {
                // 把 extra 展开到顶层，使 explicitContext 形如
                // { module, requestId, actor, http, resource, ...extra }
                const { extra, ...reserved } = raw;
                const merged: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(reserved)) {
                    if (v !== undefined) merged[k] = v;
                }
                if (extra) {
                    for (const [k, v] of Object.entries(extra)) {
                        if (v !== undefined) merged[k] = v;
                    }
                }
                return merged;
            }),
        { nil: undefined }
    );

    /**
     * Property 3 主体：对每个优先级 key 断言最终值等于按
     * "显式 > Static > Request" 顺序的首个非 undefined 值。
     */
    it('对每个 key 最终值等于按显式 > Static > Request 优先级取首个非 undefined 值', () => {
        fc.assert(
            fc.property(
                safeModuleNameArb, // moduleName（构造参数，最末优先级）
                staticContextArb,
                requestContextArb,
                explicitContextArb,
                (moduleName, staticContext, requestContext, explicitContext) => {
                    const merged = mergeLogContext({
                        moduleName,
                        staticContext,
                        requestContext,
                        explicitContext
                    });

                    const explicit = (explicitContext ?? {}) as Record<string, unknown>;

                    // ── module: explicit > static > request > moduleName（每层 normalize） ──
                    const explicitModule = typeof explicit.module === 'string' ? explicit.module : undefined;
                    const expectedModule = normalizeModuleName(
                        firstDefined(explicitModule, staticContext?.module, requestContext?.module, moduleName)!
                    );
                    expect(merged.module).toBe(expectedModule);

                    // ── requestId: explicit > request ──
                    const explicitRequestId = typeof explicit.requestId === 'string' ? explicit.requestId : undefined;
                    expect(merged.requestId).toBe(firstDefined(explicitRequestId, requestContext?.requestId));

                    // ── actor.id / type / name: explicit > static > request ──
                    const explicitActor = isPlainRecord(explicit.actor) ? explicit.actor : undefined;
                    const explicitActorId =
                        explicitActor && typeof explicitActor.id === 'string' ? explicitActor.id : undefined;
                    const explicitActorType =
                        explicitActor && typeof explicitActor.type === 'string' ? explicitActor.type : undefined;
                    const explicitActorName =
                        explicitActor && typeof explicitActor.name === 'string' ? explicitActor.name : undefined;

                    const expectedActorId = firstDefined(
                        explicitActorId,
                        staticContext?.actor?.id,
                        requestContext?.actor?.id
                    );
                    const expectedActorType = firstDefined(
                        explicitActorType,
                        staticContext?.actor?.type,
                        requestContext?.actor?.type
                    );
                    const expectedActorName = firstDefined(
                        explicitActorName,
                        staticContext?.actor?.name,
                        requestContext?.actor?.name
                    );

                    if (expectedActorId === undefined) {
                        expect(merged.actor).toBeUndefined();
                    } else {
                        expect(merged.actor?.id).toBe(expectedActorId);
                        expect(merged.actor?.type).toBe(expectedActorType ?? 'user');
                        expect(merged.actor?.name).toBe(expectedActorName);
                    }

                    // ── http.*：explicit > request 浅合并 ──
                    const explicitHttp = isPlainRecord(explicit.http) ? explicit.http : undefined;
                    const httpKeys = collectKeys(explicitHttp, requestContext?.http);
                    for (const key of httpKeys) {
                        const explicitVal = explicitHttp ? explicitHttp[key] : undefined;
                        const requestVal = requestContext?.http
                            ? (requestContext.http as Record<string, unknown>)[key]
                            : undefined;
                        const expectedVal = firstDefined(explicitVal, requestVal);
                        expect((merged.http as Record<string, unknown> | undefined)?.[key]).toEqual(expectedVal);
                    }

                    // ── rpc.*：explicit > request 浅合并 ──
                    const explicitRpc = isPlainRecord(explicit.rpc) ? explicit.rpc : undefined;
                    const rpcKeys = collectKeys(explicitRpc, requestContext?.rpc);
                    for (const key of rpcKeys) {
                        const explicitVal = explicitRpc ? explicitRpc[key] : undefined;
                        const requestVal = requestContext?.rpc
                            ? (requestContext.rpc as Record<string, unknown>)[key]
                            : undefined;
                        const expectedVal = firstDefined(explicitVal, requestVal);
                        expect((merged.rpc as Record<string, unknown> | undefined)?.[key]).toEqual(expectedVal);
                    }

                    // ── resource.*：explicit > static 浅合并 ──
                    const explicitResource = isPlainRecord(explicit.resource) ? explicit.resource : undefined;
                    const resourceKeys = collectKeys(explicitResource, staticContext?.resource);
                    for (const key of resourceKeys) {
                        const explicitVal = explicitResource ? explicitResource[key] : undefined;
                        const staticVal = staticContext?.resource
                            ? (staticContext.resource as Record<string, unknown>)[key]
                            : undefined;
                        const expectedVal = firstDefined(explicitVal, staticVal);
                        expect((merged.resource as Record<string, unknown> | undefined)?.[key]).toEqual(expectedVal);
                    }

                    // ── context.*：explicit > static（含 domain）> request.extra 浅合并 ──
                    const RESERVED = new Set(['module', 'requestId', 'actor', 'http', 'rpc', 'resource', 'error']);
                    const explicitExtra: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(explicit)) {
                        if (RESERVED.has(k)) continue;
                        explicitExtra[k] = v;
                    }
                    const staticLayer: Record<string, unknown> = {};
                    if (staticContext?.domain !== undefined) {
                        staticLayer.domain = staticContext.domain;
                    }
                    if (staticContext?.context) {
                        for (const [k, v] of Object.entries(staticContext.context)) {
                            staticLayer[k] = v;
                        }
                    }
                    const requestExtra = (requestContext?.extra ?? {}) as Record<string, unknown>;
                    const contextKeys = new Set<string>([
                        ...Object.keys(explicitExtra),
                        ...Object.keys(staticLayer),
                        ...Object.keys(requestExtra)
                    ]);
                    for (const key of contextKeys) {
                        const expectedVal = firstDefined(
                            Object.prototype.hasOwnProperty.call(explicitExtra, key) ? explicitExtra[key] : undefined,
                            Object.prototype.hasOwnProperty.call(staticLayer, key) ? staticLayer[key] : undefined,
                            Object.prototype.hasOwnProperty.call(requestExtra, key) ? requestExtra[key] : undefined
                        );
                        expect(merged.context?.[key]).toEqual(expectedVal);
                    }

                    // ── userId: merged actor.id ──
                    expect(merged.userId).toBe(expectedActorId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * actor.roles 单独的去重语义断言：
     * - 显式提供 roles（含空数组）→ 完全覆盖，仍按字符串相等去重
     * - 显式缺省，且 static / request 至少一方有 roles → union(static, request) 去重
     * - 三层都缺省 → merged.actor.roles 缺省
     */
    it('actor.roles 显式覆盖；缺省时 union(static, request) 按字符串去重', () => {
        const optionalRolesArb = fc.option(rolesArb, { nil: undefined });

        fc.assert(
            fc.property(
                safeModuleNameArb,
                optionalRolesArb, // staticRoles
                optionalRolesArb, // requestRoles
                optionalRolesArb, // explicitRoles
                (moduleName, staticRoles, requestRoles, explicitRoles) => {
                    // 在每一层都填入 actor.id 来确保 merged.actor 至少包含 id 字段，
                    // 这样我们可以稳定读取 merged.actor?.roles 进行断言。
                    const staticContext: RuntimeLoggerStaticContext = {
                        actor: {
                            id: 'static-id',
                            ...(staticRoles !== undefined ? { roles: staticRoles } : {})
                        }
                    };
                    const requestContext: RuntimeRequestContext = {
                        actor: {
                            id: 'request-id',
                            type: 'user',
                            ...(requestRoles !== undefined ? { roles: requestRoles } : {})
                        }
                    };
                    const explicitContext: Record<string, unknown> = {
                        actor: {
                            ...(explicitRoles !== undefined ? { roles: explicitRoles } : {})
                        }
                    };

                    const merged = mergeLogContext({
                        moduleName,
                        staticContext,
                        requestContext,
                        explicitContext
                    });

                    const actualRoles = merged.actor?.roles;

                    if (explicitRoles !== undefined) {
                        // 显式覆盖：等于 explicitRoles 的去重序列
                        const expected = [...new Set(explicitRoles)];
                        expect(actualRoles).toEqual(expected);
                    } else if (staticRoles !== undefined || requestRoles !== undefined) {
                        // union(static, request) 去重，顺序遵循 mergeLogContext 内部实现：
                        // [...new Set([...(staticRoles ?? []), ...(requestRoles ?? [])])]
                        const expected = [...new Set([...(staticRoles ?? []), ...(requestRoles ?? [])])];
                        expect(actualRoles).toEqual(expected);
                    } else {
                        // 三层都缺省 → roles 字段缺省
                        expect(actualRoles).toBeUndefined();
                    }

                    // 不可变性：去重后的数组不得包含重复项
                    if (Array.isArray(actualRoles)) {
                        expect(new Set(actualRoles).size).toBe(actualRoles.length);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

describe('mergeLogContext - error reserved key promotion', () => {
    it('promotes explicit error to RuntimeLogEntry.error and removes it from context', () => {
        const error = Object.assign(new Error('spicedb unavailable'), { code: 'SPICEDB_DOWN' });

        const merged = mergeLogContext({
            moduleName: 'authz',
            explicitContext: {
                error,
                reason: 'check_permission'
            }
        });

        expect(merged.error).toEqual(
            expect.objectContaining({
                name: 'Error',
                code: 'SPICEDB_DOWN',
                message: 'spicedb unavailable',
                stack: expect.stringContaining('spicedb unavailable')
            })
        );
        expect(merged.context).toEqual({
            reason: 'check_permission'
        });
    });

    it('keeps non-standard plain error object fields in details', () => {
        const merged = mergeLogContext({
            moduleName: 'authz',
            explicitContext: {
                error: {
                    message: 'spicedb request failed',
                    code: { raw: 'ERR_UPSTREAM' },
                    retryable: true,
                    endpoint: '/v1/permissions/check'
                },
                reason: 'check_permission'
            }
        });

        expect(merged.error).toEqual({
            message: 'spicedb request failed',
            details: {
                code: { raw: 'ERR_UPSTREAM' },
                retryable: true,
                endpoint: '/v1/permissions/check'
            }
        });
        expect(merged.context).toEqual({
            reason: 'check_permission'
        });
    });

    it('does not collapse plain error objects without summary fields to [object Object]', () => {
        const merged = mergeLogContext({
            moduleName: 'authz',
            explicitContext: {
                error: {
                    retryable: false,
                    upstream: 'spicedb'
                }
            }
        });

        expect(merged.error).toEqual({
            message: 'Non-Error object provided as error',
            details: {
                retryable: false,
                upstream: 'spicedb'
            }
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 3.3 will append Property 8 (module normalization) below this line.
// ─────────────────────────────────────────────────────────────────────────────

// Feature: admin-logger-unification, Property 8: 模块名归一化与覆盖优先级
describe('mergeLogContext - Property 8: module normalization and override priority', () => {
    /**
     * 生成"可含 Controller / Service / Interceptor / Filter 后缀"的字符串。
     *
     * - 70% 概率返回任意字符串（fc.string()），覆盖空串、Unicode、控制字符等边界
     * - 30% 概率返回 `<base><suffix>` 形式，确保 normalizeModuleName 的去后缀分支被命中
     */
    const moduleStringArb = fc.oneof(
        { weight: 7, arbitrary: fc.string() },
        {
            weight: 3,
            arbitrary: fc
                .tuple(fc.string(), fc.constantFrom('Controller', 'Service', 'Interceptor', 'Filter'))
                .map(([base, suffix]) => `${base}${suffix}`)
        }
    );

    /**
     * 任意一个 module 来源字段：undefined 或 moduleStringArb。
     */
    const optionalModuleArb = fc.option(moduleStringArb, { nil: undefined });

    /**
     * Property 8: 对任意 (ctorName, staticModule, requestModule, explicitModule) 四元组，
     * mergeLogContext 返回的 module 必须等于
     *   normalizeModuleName(firstDefined(explicitModule, staticModule, requestModule, ctorName))
     */
    it('result.module === normalizeModuleName(firstDefined(explicit, static, request, ctor))', () => {
        fc.assert(
            fc.property(
                moduleStringArb, // ctorName: 必填字符串（可为空）
                optionalModuleArb, // staticModule
                optionalModuleArb, // requestModule
                optionalModuleArb, // explicitModule
                (ctorName, staticModule, requestModule, explicitModule) => {
                    const result = mergeLogContext({
                        moduleName: ctorName,
                        staticContext: staticModule !== undefined ? { module: staticModule } : undefined,
                        requestContext: requestModule !== undefined ? { module: requestModule } : undefined,
                        explicitContext: explicitModule !== undefined ? { module: explicitModule } : undefined
                    });

                    const expected = normalizeModuleName(
                        firstDefined(explicitModule, staticModule, requestModule, ctorName)
                    );

                    expect(result.module).toBe(expected);
                }
            ),
            { numRuns: 100 }
        );
    });
});
