import { SetMetadata } from '@nestjs/common';
import type { AuditLogOptions } from '../logger/runtime-log.types';

/**
 * 审计日志元数据键
 */
export const AUDIT_LOG_KEY = '__audit_log_key__';

/**
 * 审计日志装饰器
 */
export const AuditLog = (options: AuditLogOptions) =>
    SetMetadata(AUDIT_LOG_KEY, {
        ...options
    });
