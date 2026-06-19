import type { Request, Response } from 'express';
import type { RuntimeLogRecord, RuntimeRequestContext } from './runtime-log.types';

/**
 * HTTP 边界上的请求扩展。
 *
 * 核心 runtime logger 不依赖 Express；只有 HTTP 中间件、拦截器、异常过滤器和守卫需要这个类型。
 */
export interface HttpLoggingRequest extends Request {
    user?: RuntimeLogRecord;
    session?: RuntimeLogRecord;
    __shiroLogContext?: RuntimeRequestContext;
}

/**
 * HTTP 边界上的响应扩展。
 */
export interface HttpLoggingResponse extends Response {
    __shiroHttpLogBodyPatched?: boolean;
    __shiroHttpLogFinishListenerBound?: boolean;
}
