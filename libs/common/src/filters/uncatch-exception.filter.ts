import { ArgumentsHost, Catch, ExceptionFilter, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogService } from '../logger/audit-log.service';
import { BaseExceptionFilter } from './base-exception.filter';
import { normalizeExceptionToShiroErrorResponse } from './shiro-error-normalizer';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * 未捕获异常过滤器（兜底）
 * 处理所有未被其他过滤器捕获的异常
 */
@Injectable()
@Catch()
export class UncatchExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'UncatchExceptionFilter';

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 处理并格式化未捕获异常，同时补充用户状态版本响应头 */
    async catch(exception: Error, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const normalizedError = normalizeExceptionToShiroErrorResponse(exception);
        const resBody = normalizedError.body;

        // 记录系统日志（未捕获异常使用 ERROR 级别）
        this.recordSystemLog(exception, host, 'error', undefined, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(normalizedError.statusCode).json(resBody);
    }
}
