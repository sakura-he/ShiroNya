import { AsyncLocalStorage } from 'node:async_hooks';
import type { RuntimeRequestContext } from './runtime-log.types';

/**
 * 唯一的全局 AsyncLocalStorage 实例。
 *
 * `HttpLogMiddleware` 会把 request.__shiroLogContext 这同一份对象放进 ALS。
 * 拦截器继续修改 request 上的对象，logger 通过 `getRequestContext()` 读到的也是同一个引用。
 *
 * AsyncLocalStorage 自动覆盖回调内部所有 await / Promise.then / setImmediate /
 * setTimeout / process.nextTick 的异步边界，无需业务侧手动透传。
 */
const requestContextStorage = new AsyncLocalStorage<RuntimeRequestContext>();

/**
 * 在 `fn` 的执行栈内绑定一份 `RuntimeRequestContext`，使该栈帧及其所有同步 / 异步
 * 子调用都能通过 `getRequestContext()` 读到同一份引用。
 *
 * 离开 `fn` 后上下文自动释放，不存在跨请求污染。
 *
 * @param state 请求上下文快照（HttpLogMiddleware 入口构造的初始 state）
 * @param fn    需要在该上下文下执行的回调（通常是 NestJS 的 `next()`）
 * @returns     `fn` 的返回值（同步返回值或 Promise）
 */
export function runWithRequestContext<T>(state: RuntimeRequestContext, fn: () => T): T {
    return requestContextStorage.run(state, fn);
}

/**
 * 读取当前栈帧上的 `RuntimeRequestContext`。
 *
 * - 在 `runWithRequestContext` 包裹的栈内调用：返回 `runWithRequestContext` 时
 *   传入的同一份 state 引用（拦截器对其字段的更新对调用方可见）。
 * - 不在 ALS 包裹内调用（如 `onModuleInit` / 定时任务 / Kafka 消费回调 /
 *   `tracing.ts` 启动钩子）：返回 `undefined`，调用方需要按非请求范围处理。
 */
export function getRequestContext(): RuntimeRequestContext | undefined {
    return requestContextStorage.getStore();
}
