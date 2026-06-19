import { Injectable, NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction } from 'express';
import { ErrorCodes } from '../constants/error-code.constant';
import { AuditLogService } from '../logger/audit-log.service';
import { runWithRequestContext } from '../logger/request-context';
import {
    buildImplicitAuditContext,
    buildErrorSummary,
    createRequestId,
    ensureRequestLogContext,
    extractActorFromRequest,
    getBizCodeFromBody,
    getClientIp,
    getHttpHeaderValue,
    getLogUserId,
    getResultByResponse,
    getRuntimeAppName,
    getValueByPath,
    HTTP_REQUEST_ID_HEADER,
    HTTP_USER_AGENT_HEADER,
    mergeRequestLogContext,
    sanitizeForLogging
} from '../logger/runtime-log.util';
import type { RuntimeHttpSnapshot, RuntimeRequestContext } from '../logger/runtime-log.types';
import type { HttpLoggingRequest, HttpLoggingResponse } from '../logger/http-log.types';
import { writeUserActionLog } from '../logger/runtime-logger';

/**
 * HTTP 日志中间件
 *
 * 在请求进入业务链路前创建 AsyncLocalStorage 上下文，
 * 让 controller/service 中的 createRuntimeLogger 调用能自动带上 requestId、actor 和 HTTP 快照。
 */
@Injectable()
export class HttpLogMiddleware implements NestMiddleware {
    constructor(private readonly auditLogService: AuditLogService) {}

    /**
     * 绑定请求与响应日志采集流程
     */
    use(request: HttpLoggingRequest, response: HttpLoggingResponse, next: NextFunction): void {
        if (this.shouldSkip(request.originalUrl || request.url)) {
            next();
            return;
        }

        if (response.__shiroHttpLogFinishListenerBound) {
            next();
            return;
        }

        response.__shiroHttpLogFinishListenerBound = true;

        // 取出（或新建）请求对象上的 context；同一对象会同时挂在 request 和 ALS 中。
        const existingState: RuntimeRequestContext = ensureRequestLogContext(request);

        // 中间件阶段先记录入口快照；路由参数和 handler 名称会在拦截器阶段继续补齐。
        const requestId = createRequestId(getHttpHeaderValue(request, HTTP_REQUEST_ID_HEADER));
        request.headers[HTTP_REQUEST_ID_HEADER] = requestId;
        const requestPath = request.originalUrl || request.url;
        const httpSnapshot: RuntimeHttpSnapshot = {
            controllerHandler: existingState.controllerHandler,
            method: request.method,
            path: requestPath,
            route: request.route?.path,
            requestHeaders: sanitizeForLogging(request.headers),
            requestQuery: sanitizeForLogging(request.query),
            requestParams: sanitizeForLogging(request.params),
            requestBody: sanitizeForLogging(request.body),
            ip: getClientIp(request),
            userAgent: getHttpHeaderValue(request, HTTP_USER_AGENT_HEADER)
        };

        const state = mergeRequestLogContext(request, {
            requestId,
            startAt: Date.now(),
            actor: extractActorFromRequest(request),
            http: httpSnapshot
        });
        // module / controllerHandler 由 HttpLogContextInterceptor 在 controller 解析后回填。

        response.setHeader(HTTP_REQUEST_ID_HEADER, requestId);
        attachRequestIdToActiveSpan(requestId);
        this.patchResponseBody(request, response);
        response.on('finish', () => {
            void this.handleFinishedRequest(request, response);
        });

        // 用 ALS 包裹 next() 后，异步链路中的 logger 都能读到同一份 state 引用。
        runWithRequestContext(state, () => next());
    }

    /**
     * 判断当前路径是否跳过日志
     */
    private shouldSkip(url: string): boolean {
        const path = url.split('?')[0];
        return (
            path === '/favicon.ico' ||
            path === '/health' ||
            path.startsWith('/api-docs') ||
            path.startsWith('/docs') ||
            path.startsWith('/static')
        );
    }

    /**
     * 包装响应发送方法以获取完整响应体
     */
    private patchResponseBody(request: HttpLoggingRequest, response: HttpLoggingResponse): void {
        if (response.__shiroHttpLogBodyPatched) {
            return;
        }

        response.__shiroHttpLogBodyPatched = true;
        const originalJson = response.json.bind(response);
        const originalSend = response.send.bind(response);

        response.json = ((body: unknown) => {
            mergeRequestLogContext(request, { responseBody: body });
            return originalJson(body);
        }) as typeof response.json;

        response.send = ((body: unknown) => {
            const state = ensureRequestLogContext(request);
            if (state.responseBody === undefined) {
                mergeRequestLogContext(request, { responseBody: body });
            }
            return originalSend(body);
        }) as typeof response.send;
    }

    /**
     * 在响应结束后输出用户操作日志和审计日志。
     * 自动 HTTP 日志只保留“完成态”这一条，因为它已经包含请求与响应的完整快照，
     * 标题中直接带上最终状态码，便于控制台快速区分成功、拒绝和失败请求。
     *
     * 复用入口阶段已脱敏的请求快照，只在响应结束时补齐响应侧字段和耗时。
     */
    private async handleFinishedRequest(request: HttpLoggingRequest, response: HttpLoggingResponse): Promise<void> {
        const state = ensureRequestLogContext(request);
        const actor = state.actor || extractActorFromRequest(request);
        const requestId = state.requestId;
        const requestPath = request.originalUrl || request.url;
        const responseBody = sanitizeForLogging(state.responseBody);
        const responseHeaders = sanitizeForLogging(response.getHeaders());
        const durationMs = state.startAt ? Date.now() - state.startAt : undefined;
        const statusCode = response.statusCode;
        const bizCode = getBizCodeFromBody(state.responseBody);
        const result = getResultByResponse(statusCode, bizCode, ErrorCodes.SUCCESS.code);
        const error = buildErrorSummary(state.responseBody, statusCode);

        const baseHttp: RuntimeHttpSnapshot = state.http!;

        const finalHttp: RuntimeHttpSnapshot = {
            ...baseHttp,
            controllerHandler: state.controllerHandler ?? baseHttp.controllerHandler,
            route: request.route?.path ?? baseHttp.route,
            requestParams: sanitizeForLogging(request.params),
            responseHeaders,
            responseBody,
            statusCode,
            bizCode,
            durationMs
        };

        writeUserActionLog({
            level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
            module: state.module || 'http',
            userId: getLogUserId(request),
            message: `[完成 ${statusCode}] ${request.method} ${requestPath}`,
            event: 'http_response',
            requestId,
            actor,
            http: finalHttp,
            result: {
                success: result === 'SUCCESS',
                message: error?.message
            },
            error,
            context: {
                app: getRuntimeAppName()
            }
        });

        const auditContext = state.audit || buildImplicitAuditContext(requestPath, statusCode);
        if (!auditContext) {
            return;
        }

        await this.auditLogService.writeAuditLog({
            app: getRuntimeAppName(),
            module: auditContext.module,
            action: auditContext.action,
            summary: auditContext.summary,
            resourceType: auditContext.resourceType,
            resourceId: getValueByPath(
                {
                    params: request.params,
                    query: request.query,
                    body: request.body
                },
                auditContext.resourceIdPath
            ),
            requestId,
            actorId: actor?.id,
            actorType: actor?.type,
            actorName: actor?.name,
            actorRoles: actor?.roles,
            requestMethod: request.method,
            requestPath: requestPath,
            ip: getClientIp(request),
            userAgent: getHttpHeaderValue(request, HTTP_USER_AGENT_HEADER),
            statusCode,
            bizCode,
            result,
            failureReason: error?.message,
            requestHeaders: finalHttp.requestHeaders,
            requestBody: finalHttp.requestBody,
            responseHeaders,
            responseBody,
            beforeData: sanitizeForLogging(auditContext.beforeData),
            afterData: responseBody,
            context: sanitizeForLogging({
                controllerHandler: state.controllerHandler,
                route: request.route?.path,
                ...(auditContext.context || {})
            }) as Record<string, unknown>
        });
    }
}

function attachRequestIdToActiveSpan(requestId: string): void {
    const span = trace.getActiveSpan();
    if (!span) {
        return;
    }

    span.setAttributes({
        'request.id': requestId,
        'http.request_id': requestId,
        'shiro.request_id': requestId
    });
}
