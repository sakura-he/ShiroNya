import { ArgumentsHost, Catch, ExceptionFilter, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import z, { ZodError } from 'zod';
import { ErrorCodes } from '../constants/error-code.constant';
import { AuditLogService } from '../logger/audit-log.service';
import { createRuntimeLogger } from '../logger/runtime-logger';
import { BaseExceptionFilter } from './base-exception.filter';
import { ShiroErrorResponse } from './types';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * Zod 验证异常过滤器
 * 处理 ZodValidationException 类型的异常
 */
@Injectable()
@Catch(ZodValidationException)
export class ZodValidationExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'ZodValidationExceptionFilter';
    private readonly logger = createRuntimeLogger(ZodValidationExceptionFilter.name);

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 处理并格式化 Zod 参数校验异常，同时补充用户状态版本响应头 */
    async catch(exception: ZodValidationException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        this.logger.debug('Catch ZodValidationException', {
            exception
        });
        const zodError = exception.getZodError() as ZodError;
        const formatError = z.flattenError(zodError);
        const { code: errorCode, message: errorMessage } = ErrorCodes.PARAM.INVALID;

        const resBody: ShiroErrorResponse = {
            data: formatError,
            code: +errorCode,
            message: errorMessage
        };

        // 记录系统日志（参数验证错误使用 WARN 级别，包含字段错误详情）
        this.recordSystemLog(exception, host, 'warn', formatError, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(400).json(resBody);
    }
}
