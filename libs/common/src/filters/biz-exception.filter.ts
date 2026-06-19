import { ArgumentsHost, Catch, ExceptionFilter, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from '../exceptions/biz.exception';
import { AuditLogService } from '../logger/audit-log.service';
import { BaseExceptionFilter } from './base-exception.filter';
import { normalizeExceptionToShiroErrorResponse } from './shiro-error-normalizer';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * 业务异常过滤器
 * 处理 BusinessException 类型的异常
 */
@Injectable()
@Catch(BusinessException)
export class BusinessExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'BusinessExceptionFilter';

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 处理并格式化业务异常，同时补充用户状态版本响应头 */
    async catch(exception: BusinessException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const normalizedError = normalizeExceptionToShiroErrorResponse(exception);
        const statusCode = normalizedError.statusCode;
        const resBody = normalizedError.body;

        // 记录系统日志（业务异常使用 WARN 级别，包含业务上下文）
        this.recordSystemLog(exception, host, 'warn', exception.bizContext, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(statusCode).json(resBody);
    }
}
