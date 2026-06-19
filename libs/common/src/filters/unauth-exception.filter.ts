import { ArgumentsHost, Catch, ExceptionFilter, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { UnauthException } from '../exceptions/unauth.exception';
import { AuditLogService } from '../logger/audit-log.service';
import { BaseExceptionFilter } from './base-exception.filter';
import { normalizeExceptionToShiroErrorResponse } from './shiro-error-normalizer';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * 未授权异常过滤器
 * 处理 UnauthException 类型的异常
 */
@Injectable()
@Catch(UnauthException)
export class UnauthExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'UnauthExceptionFilter';

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 处理并格式化认证异常，同时补充用户状态版本响应头 */
    async catch(exception: UnauthException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const normalizedError = normalizeExceptionToShiroErrorResponse(exception);
        const resBody = normalizedError.body;

        // 记录系统日志（认证错误使用 WARN 级别）
        this.recordSystemLog(exception, host, 'warn', undefined, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(normalizedError.statusCode).json(resBody);
    }
}
