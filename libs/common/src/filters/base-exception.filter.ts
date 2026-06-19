import { ArgumentsHost, HttpException, Inject, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes } from '../constants/error-code.constant';
import type { LogLevel } from '@nestjs/common';
import { AuditLogService } from '../logger/audit-log.service';
import type { RuntimeLogLevel } from '../logger/runtime-log.types';
import type { HttpLoggingRequest } from '../logger/http-log.types';
import {
    buildImplicitAuditContext,
    extractActorFromRequest,
    getBizCodeFromBody,
    getClientIp,
    getHttpHeaderValue,
    getResultByResponse,
    getRuntimeAppName,
    getValueByPath,
    HTTP_USER_AGENT_HEADER,
    sanitizeForLogging
} from '../logger/runtime-log.util';
import { writeSystemLog } from '../logger/runtime-logger';
import { BusinessException } from '../exceptions/biz.exception';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * 异常过滤器基类
 * 提供通用的错误日志记录功能
 */
export abstract class BaseExceptionFilter {
    /** 过滤器名称，子类应覆盖此属性 */
    protected abstract readonly filterName: string;

    constructor(
        @Optional() protected readonly auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) protected readonly userStateHeaderWriter?: UserStateHeaderWriter
    ) {}

    /** 在异常响应返回前尝试补充用户状态版本相关响应头 */
    protected async attachUserStateHeaders(host: ArgumentsHost): Promise<void> {
        if (!this.userStateHeaderWriter) return;
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request & { session?: any }>();
        const response = ctx.getResponse<Response>();
        await this.userStateHeaderWriter.attachUserStateHeaders(request, response);
    }

    /**
     * 记录系统日志
     */
    protected recordSystemLog(
        exception: Error,
        host: ArgumentsHost,
        errorLevel?: LogLevel,
        errorContext?: Record<string, any>,
        responseBody?: unknown
    ): void {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<HttpLoggingRequest>();
        const response = ctx.getResponse<Response>();
        const actor = extractActorFromRequest(request);
        const level = errorLevel ?? this.getErrorLevel(exception);
        const errorCode = this.getErrorCode(exception);
        const errorMessage = this.getErrorMessage(exception);
        const statusCode = response.statusCode || (exception instanceof HttpException ? exception.getStatus() : 500);
        const bizCode = getBizCodeFromBody(responseBody);
        const result = getResultByResponse(statusCode, bizCode, ErrorCodes.SUCCESS.code);

        writeSystemLog({
            level: this.toRuntimeLevel(level),
            module: this.filterName,
            userId: actor?.id || 'anonymous',
            message: errorMessage,
            event: 'http_exception',
            requestId: request.__shiroLogContext?.requestId,
            actor,
            http: {
                controllerHandler: request.__shiroLogContext?.controllerHandler,
                method: request.method,
                path: request.originalUrl || request.url,
                route: request.route?.path,
                requestHeaders: sanitizeForLogging(request.headers),
                requestQuery: sanitizeForLogging(request.query),
                requestParams: sanitizeForLogging(request.params),
                requestBody: sanitizeForLogging(request.body),
                responseHeaders: sanitizeForLogging(response.getHeaders()),
                responseBody: sanitizeForLogging(responseBody),
                statusCode,
                bizCode,
                ip: getClientIp(request),
                userAgent: getHttpHeaderValue(request, HTTP_USER_AGENT_HEADER)
            },
            result: {
                success: result === 'SUCCESS',
                message: errorMessage
            },
            error: {
                name: exception.name,
                code: errorCode,
                message: errorMessage,
                stack: exception.stack
            },
            context: sanitizeForLogging({
                filterName: this.filterName,
                errorContext
            }) as Record<string, unknown>
        });
    }

    /**
     * 在异常场景下补录审计日志
     */
    protected async recordAuditFailureIfNeeded(
        exception: Error,
        host: ArgumentsHost,
        responseBody: unknown
    ): Promise<void> {
        if (!this.auditLogService) {
            return;
        }

        const ctx = host.switchToHttp();
        const request = ctx.getRequest<HttpLoggingRequest>();
        const response = ctx.getResponse<Response>();
        const actor = extractActorFromRequest(request);
        const auditContext =
            request.__shiroLogContext?.audit || this.buildFallbackAuditContext(request, response.statusCode);
        if (!auditContext) {
            return;
        }

        const bizCode = getBizCodeFromBody(responseBody);
        const statusCode = response.statusCode;
        const result = getResultByResponse(statusCode, bizCode, ErrorCodes.SUCCESS.code);

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
            requestId: request.__shiroLogContext?.requestId,
            actorId: actor?.id,
            actorType: actor?.type,
            actorName: actor?.name,
            actorRoles: actor?.roles,
            requestMethod: request.method,
            requestPath: request.originalUrl || request.url,
            ip: getClientIp(request),
            userAgent: getHttpHeaderValue(request, HTTP_USER_AGENT_HEADER),
            statusCode,
            bizCode,
            result,
            failureReason: this.getErrorMessage(exception),
            requestHeaders: sanitizeForLogging(request.headers),
            requestBody: sanitizeForLogging(request.body),
            responseHeaders: sanitizeForLogging(response.getHeaders()),
            responseBody: sanitizeForLogging(responseBody),
            beforeData: sanitizeForLogging(auditContext.beforeData),
            afterData: sanitizeForLogging(responseBody),
            context: sanitizeForLogging({
                route: request.route?.path,
                controllerHandler: request.__shiroLogContext?.controllerHandler,
                ...(auditContext.context || {})
            }) as Record<string, unknown>
        });
    }

    /**
     * 根据异常类型推断日志级别
     */
    protected getErrorLevel(exception: Error): LogLevel {
        if (exception instanceof BusinessException) {
            return 'warn';
        }

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            return status >= 500 ? 'error' : 'warn';
        }

        return 'error';
    }

    /**
     * 获取错误码
     */
    protected getErrorCode(exception: Error): string {
        if (exception instanceof BusinessException) {
            return String(exception.bizCode);
        }

        if (exception instanceof HttpException) {
            return String(exception.getStatus());
        }

        return exception.name || 'UNKNOWN_ERROR';
    }

    /**
     * 获取错误信息
     */
    protected getErrorMessage(exception: Error): string {
        if (exception instanceof BusinessException) {
            return exception.bizMessage || exception.message;
        }

        if (exception instanceof HttpException) {
            const response = exception.getResponse();
            if (typeof response === 'string') {
                return response;
            }
            if (typeof response === 'object' && response !== null) {
                return (response as any).message || exception.message;
            }
        }

        return exception.message;
    }

    /**
     * 将 NestJS LogLevel 转换为运行时日志级别，并把 `log` 映射为 `info`。
     */
    protected toRuntimeLevel(level: LogLevel): RuntimeLogLevel {
        if (level === 'log') {
            return 'info';
        }

        return level as RuntimeLogLevel;
    }

    /**
     * 构建兜底审计上下文
     */
    protected buildFallbackAuditContext(request: HttpLoggingRequest, statusCode: number) {
        return buildImplicitAuditContext(request.originalUrl || request.url, statusCode);
    }
}
