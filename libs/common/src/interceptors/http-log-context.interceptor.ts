import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { context as otelContext, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { catchError, finalize, Observable, throwError } from 'rxjs';
import type { RuntimeLogActor } from '../logger/runtime-log.types';
import type { HttpLoggingRequest } from '../logger/http-log.types';
import { AUDIT_LOG_KEY } from '../decorators/audit-log.decorator';
import type { AuditLogOptions } from '../logger/runtime-log.types';
import {
    extractActorFromRequest,
    mergeRequestLogContext,
    normalizeModuleName,
    sanitizeForLogging
} from '../logger/runtime-log.util';

/**
 * HTTP 日志上下文拦截器
 */
@Injectable()
export class HttpLogContextInterceptor implements NestInterceptor {
    private readonly tracer = trace.getTracer('shiro-nya.nest');

    constructor(private readonly reflector: Reflector) {}

    /**
     * 将控制器与审计元数据写入请求上下文
     */
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (context.getType<'http'>() !== 'http') {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest<HttpLoggingRequest>();
        const className = context.getClass().name;
        const handlerName = context.getHandler().name;
        const moduleName = normalizeModuleName(className);
        const controllerHandler = `${className}.${handlerName}`;
        const auditOptions = this.reflector.getAllAndOverride<AuditLogOptions | undefined>(AUDIT_LOG_KEY, [
            context.getHandler(),
            context.getClass()
        ]);

        // 中间件已经把 request.__shiroLogContext 放进 AsyncLocalStorage；
        // 这里只写 request 上的那份对象，logger 从 ALS 读到的是同一个引用。
        const requestPath = request.originalUrl || request.url;
        const route = request.route?.path;

        const actor = extractActorFromRequest(request);
        const requestId = request.__shiroLogContext?.requestId;

        mergeRequestLogContext(request, {
            module: moduleName,
            controllerHandler,
            audit: auditOptions,
            actor,
            http: {
                controllerHandler,
                route,
                requestParams: sanitizeForLogging(request.params)
            }
        });

        attachControllerAttributesToActiveSpan({
            moduleName,
            controllerHandler,
            route,
            method: request.method,
            path: requestPath,
            requestId,
            actor
        });

        const span = this.tracer.startSpan(controllerHandler, {
            attributes: {
                'code.namespace': className,
                'code.function': handlerName,
                'shiro.module': moduleName,
                'shiro.controller_handler': controllerHandler,
                'http.request.method': request.method,
                'url.path': requestPath,
                ...(requestId
                    ? {
                          'request.id': requestId,
                          'http.request_id': requestId,
                          'shiro.request_id': requestId
                      }
                    : {}),
                ...(actor?.id
                    ? {
                          'enduser.id': actor.id,
                          'user.id': actor.id,
                          'shiro.user_id': actor.id
                      }
                    : {}),
                ...(route ? { 'http.route': route } : {})
            }
        });
        const activeContext = trace.setSpan(otelContext.active(), span);

        return new Observable((subscriber) =>
            otelContext.with(activeContext, () => {
                try {
                    return next
                        .handle()
                        .pipe(
                            catchError((error: unknown) => {
                                recordSpanException(span, error);
                                return throwError(() => error);
                            }),
                            finalize(() => span.end())
                        )
                        .subscribe(subscriber);
                } catch (error) {
                    recordSpanException(span, error);
                    span.end();
                    subscriber.error(error);
                    return undefined;
                }
            })
        );
    }
}

function attachControllerAttributesToActiveSpan(input: {
    moduleName: string;
    controllerHandler: string;
    route?: string;
    method?: string;
    path?: string;
    requestId?: string;
    actor?: RuntimeLogActor;
}): void {
    const span = trace.getActiveSpan();
    if (!span) {
        return;
    }

    span.setAttributes({
        'shiro.module': input.moduleName,
        'shiro.controller_handler': input.controllerHandler,
        ...(input.method ? { 'http.request.method': input.method } : {}),
        ...(input.path ? { 'url.path': input.path } : {}),
        ...(input.requestId
            ? {
                  'request.id': input.requestId,
                  'http.request_id': input.requestId,
                  'shiro.request_id': input.requestId
              }
            : {}),
        ...(input.actor?.id
            ? {
                  'enduser.id': input.actor.id,
                  'user.id': input.actor.id,
                  'shiro.user_id': input.actor.id
              }
            : {}),
        ...(input.route ? { 'http.route': input.route } : {})
    });
}

function recordSpanException(span: Span, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    span.recordException(error instanceof Error ? error : new Error(message));
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message
    });
}
