// Feature: admin-logger-unification
//
// 本文件汇集 Request_Context_Store（基于 AsyncLocalStorage）相关的属性测试。
// - Property 5（任务 2.2）：请求范围内的 requestId / actor.id / http.method 透传
// - Property 7（任务 2.3）：请求结束后上下文释放（含 Promise.all 并发互不可见）
//
// 注意：fast-check@^4.6.0 已在仓库 devDependencies 中，无需新增依赖。

import fc from 'fast-check';

import { getRequestContext, runWithRequestContext } from './request-context';
import type { RuntimeRequestContext } from './runtime-log.types';

/**
 * 共享生成器：构造一份 RuntimeRequestContext。
 * - requestId / startAt / actor / http 字段全部可缺省；
 * - actor.roles 走 fc.option 以同时覆盖空数组与缺省两种形态。
 *
 * 该生成器同时供 Property 5 与 Property 7 使用。
 */
const requestContextArb: fc.Arbitrary<RuntimeRequestContext> = fc.record(
    {
        requestId: fc.string({ minLength: 1, maxLength: 32 }),
        startAt: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        actor: fc.option(
            fc.record(
                {
                    id: fc.string({ minLength: 1, maxLength: 32 }),
                    type: fc.constantFrom('user', 'admin', 'system'),
                    name: fc.string({ minLength: 0, maxLength: 32 }),
                    roles: fc.array(fc.string({ minLength: 1, maxLength: 16 }), { maxLength: 4 }),
                },
                { requiredKeys: ['id', 'type'] },
            ),
            { nil: undefined },
        ),
        http: fc.option(
            fc.record(
                {
                    method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
                    path: fc.string({ minLength: 1, maxLength: 64 }),
                    route: fc.string({ minLength: 1, maxLength: 64 }),
                },
                { requiredKeys: [] },
            ),
            { nil: undefined },
        ),
    },
    { requiredKeys: [] },
);

// Feature: admin-logger-unification, Property 7: 请求结束后上下文释放
//
// 断言：
//   1. runWithRequestContext(state, fn) 同步返回后，外层 getRequestContext() 必须为 undefined
//   2. runWithRequestContext(state, async () => ...) 返回的 Promise resolve 后，
//      外层 getRequestContext() 必须为 undefined
//   3. 多个 Promise.all 并发请求互不可见：每个回调内只能看见自己的 state，
//      且全部 resolve 后外层 getRequestContext() 仍为 undefined
//
// Validates: Requirements 4.7
describe('Request_Context_Store - Property 7: 请求结束后上下文释放', () => {
    beforeEach(() => {
        // 防御性断言：每个用例开始前外层栈不应残留上下文，
        // 否则说明上一个用例存在跨用例污染。
        if (getRequestContext() !== undefined) {
            throw new Error(
                'Pre-test invariant violated: outer getRequestContext() should be undefined',
            );
        }
    });

    test('runWithRequestContext 同步返回后，外层 getRequestContext() 必须为 undefined', () => {
        fc.assert(
            fc.property(requestContextArb, (state) => {
                expect(getRequestContext()).toBeUndefined();

                const seenInside = runWithRequestContext(state, () => getRequestContext());

                // 内层应直接看到传入的同一份引用
                expect(seenInside).toBe(state);
                // 同步返回后外层立刻不可见
                expect(getRequestContext()).toBeUndefined();
            }),
            { numRuns: 100 },
        );
    });

    test('runWithRequestContext 返回的 Promise resolve 后，外层 getRequestContext() 必须为 undefined', async () => {
        await fc.assert(
            fc.asyncProperty(requestContextArb, async (state) => {
                expect(getRequestContext()).toBeUndefined();

                const seenInside = await runWithRequestContext(state, async () => {
                    // 故意跨越多个异步边界，确认 ALS 在异步链中保持
                    await Promise.resolve();
                    await new Promise<void>((resolve) => setImmediate(resolve));
                    const first = getRequestContext();
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                    const second = getRequestContext();
                    expect(first).toBe(state);
                    expect(second).toBe(state);
                    return second;
                });

                expect(seenInside).toBe(state);
                // Promise resolve 之后外层栈不应再看到上下文
                expect(getRequestContext()).toBeUndefined();
            }),
            { numRuns: 100 },
        );
    });

    test('多个 Promise.all 并发请求互不可见', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(requestContextArb, { minLength: 2, maxLength: 6 }),
                async (states) => {
                    expect(getRequestContext()).toBeUndefined();

                    const observed = await Promise.all(
                        states.map((state) =>
                            runWithRequestContext(state, async () => {
                                // 通过 setImmediate / setTimeout 让多个并发任务交错执行
                                await new Promise<void>((resolve) => setImmediate(resolve));
                                const seenAfterImmediate = getRequestContext();
                                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                                const seenAfterTimeout = getRequestContext();
                                await Promise.resolve();
                                const seenAfterMicrotask = getRequestContext();
                                return { seenAfterImmediate, seenAfterTimeout, seenAfterMicrotask };
                            }),
                        ),
                    );

                    // 每个回调只能看到自己启动时绑定的 state
                    for (let index = 0; index < states.length; index += 1) {
                        expect(observed[index].seenAfterImmediate).toBe(states[index]);
                        expect(observed[index].seenAfterTimeout).toBe(states[index]);
                        expect(observed[index].seenAfterMicrotask).toBe(states[index]);
                    }

                    // 全部 resolve 之后，外层栈仍然不可见
                    expect(getRequestContext()).toBeUndefined();
                },
            ),
            { numRuns: 100 },
        );
    });
});

// Feature: admin-logger-unification, Property 5: 请求范围内的 requestId / actor.id / http.method 透传
//
// 断言：在 runWithRequestContext 范围内调用 getRequestContext() 必须：
//   1. 返回与传入 state 完全相同的对象引用（ALS 不进行拷贝）
//   2. 字段（requestId / actor.id / http.method）严格等于输入
//
// Validates: Requirements 4.4, 8.3
describe('Request_Context_Store - Property 5: 请求范围内的 requestId / actor.id / http.method 透传', () => {
    /**
     * Property 5 专用 ALS state 生成器：
     * 要求 requestId / actor / http 必填，actor.id 与 http.method 也必填，
     * 这样才能稳定断言三个核心字段透传。
     */
    const property5StateArb: fc.Arbitrary<RuntimeRequestContext> = fc.record(
        {
            requestId: fc.string({ minLength: 1, maxLength: 32 }),
            actor: fc.record(
                {
                    id: fc.string({ minLength: 1, maxLength: 32 }),
                    type: fc.constantFrom('user', 'service', 'system', 'anonymous'),
                    name: fc.option(fc.string({ minLength: 1, maxLength: 32 }), { nil: undefined }),
                    roles: fc.option(
                        fc.array(fc.string({ minLength: 1, maxLength: 16 }), { maxLength: 5 }),
                        { nil: undefined },
                    ),
                },
                { requiredKeys: ['id', 'type'] },
            ),
            http: fc.record(
                {
                    method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'),
                    path: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: undefined }),
                    route: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: undefined }),
                    statusCode: fc.option(fc.integer({ min: 100, max: 599 }), { nil: undefined }),
                },
                { requiredKeys: ['method'] },
            ),
        },
        { requiredKeys: ['requestId', 'actor', 'http'] },
    );

    it('runWithRequestContext 内 getRequestContext() 返回同一引用且 requestId / actor.id / http.method 等于输入', () => {
        fc.assert(
            fc.property(property5StateArb, (state) => {
                let captured: RuntimeRequestContext | undefined;

                runWithRequestContext(state, () => {
                    captured = getRequestContext();
                });

                // 引用相等：ALS 不应对 state 进行拷贝
                expect(captured).toBe(state);

                // 字段相等（Property 5 校验的三个核心字段）
                expect(captured?.requestId).toBe(state.requestId);
                expect(captured?.actor?.id).toBe(state.actor?.id);
                expect(captured?.http?.method).toBe(state.http?.method);
            }),
            { numRuns: 100 },
        );
    });
});
