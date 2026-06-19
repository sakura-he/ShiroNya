import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogService } from '../logger/audit-log.service';
import { BaseExceptionFilter } from './base-exception.filter';
import { normalizeExceptionToShiroErrorResponse } from './shiro-error-normalizer';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * HTTP 异常过滤器
 * 处理 HttpException 类型的异常（不包括 BusinessException）
 */
@Injectable()
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'HttpExceptionFilter';

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 处理并格式化 HTTP 异常，同时补充用户状态版本响应头 */
    async catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const normalizedError = normalizeExceptionToShiroErrorResponse(exception);
        const status = normalizedError.statusCode;
        const resBody = normalizedError.body;

        // 记录系统日志
        this.recordSystemLog(exception, host, undefined, undefined, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(status).json(resBody);
    }
}
