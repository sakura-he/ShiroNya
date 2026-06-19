import { ArgumentsHost, Catch, ExceptionFilter, Inject, Injectable, Optional } from '@nestjs/common';
import { Response } from 'express';
import { ZodSerializationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import { ErrorCodes } from '../constants/error-code.constant';
import { AuditLogService } from '../logger/audit-log.service';
import { BaseExceptionFilter } from './base-exception.filter';
import type { ShiroErrorResponse } from './types';
import { USER_STATE_HEADER_WRITER } from './user-state-header-writer.interface';
import type { UserStateHeaderWriter } from './user-state-header-writer.interface';

/**
 * Zod 响应序列化异常过滤器
 * 处理 ZodSerializationException，隐藏内部细节并记录字段错误上下文
 */
@Injectable()
@Catch(ZodSerializationException)
export class ZodSerializationExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    protected readonly filterName = 'ZodSerializationExceptionFilter';

    constructor(
        @Optional() auditLogService?: AuditLogService,
        @Optional() @Inject(USER_STATE_HEADER_WRITER) userStateHeaderWriter?: UserStateHeaderWriter
    ) {
        super(auditLogService, userStateHeaderWriter);
    }

    /** 覆盖错误码提取逻辑，统一使用系统级序列化错误码写入错误日志 */
    protected override getErrorCode(_exception: Error): string {
        return String(ErrorCodes.SYSTEM.SERIALIZATION_FAILED.code);
    }

    /** 覆盖错误信息提取逻辑，避免日志主消息泄露内部异常文本 */
    protected override getErrorMessage(_exception: Error): string {
        return ErrorCodes.SYSTEM.SERIALIZATION_FAILED.message;
    }

    /** 处理并格式化 Zod 响应序列化异常，同时补充用户状态版本响应头 */
    async catch(exception: ZodSerializationException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const zodError = exception.getZodError() as ZodError;
        // 仅保留定位问题所需字段，避免返回过多内部细节。
        const issues = (zodError?.issues ?? []).map((issue) => ({
            path: issue.path,
            code: issue.code,
            message: issue.message
        }));

        const { code: errorCode, message: errorMessage } = ErrorCodes.SYSTEM.SERIALIZATION_FAILED;
        const resBody: ShiroErrorResponse = {
            data: null,
            code: +errorCode,
            message: errorMessage
        };

        // 记录系统日志（序列化失败使用 ERROR 级别，包含字段错误详情）
        this.recordSystemLog(exception, host, 'error', { issues }, resBody);
        await this.recordAuditFailureIfNeeded(exception, host, resBody);
        await this.attachUserStateHeaders(host);

        response.status(500).json(resBody);
    }
}
