import { Inject, Injectable, Optional } from '@nestjs/common';
import { ulid } from 'ulid';
import { writeAuditConsoleLog, writeSystemLog } from './runtime-logger';
import type { AuditLogWriteInput, RuntimeLogError } from './runtime-log.types';

export const AUDIT_LOG_PRISMA_CLIENT = Symbol('AUDIT_LOG_PRISMA_CLIENT');

export type AuditLogPrismaClient = {
    auditLog: {
        create(args: { data: Record<string, unknown> }): Promise<unknown>;
    };
};

/** 审计落库结果：调用方可据此决定是否告警、重试或在高风险场景中中断流程。 */
export interface AuditLogWriteResult {
    persisted: boolean;
    error?: RuntimeLogError;
}

/**
 * 将日志快照转换为 Prisma JSON 值
 */
function toPrismaJsonValue(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    return value;
}

/** 将任意持久化异常转成结构化错误，避免只留下 message 字符串。 */
function buildAuditPersistenceError(error: unknown): RuntimeLogError {
    if (error instanceof Error) {
        const errorWithCode = error as Error & { code?: unknown };
        return {
            name: error.name,
            code:
                typeof errorWithCode.code === 'string' || typeof errorWithCode.code === 'number'
                    ? errorWithCode.code
                    : undefined,
            message: error.message,
            stack: error.stack
        };
    }

    return {
        message: String(error)
    };
}

/**
 * 审计日志落库服务
 */
@Injectable()
export class AuditLogService {
    constructor(
        @Optional()
        @Inject(AUDIT_LOG_PRISMA_CLIENT)
        private readonly prisma?: AuditLogPrismaClient
    ) {}

    /**
     * 写入审计日志并同步输出控制台
     */
    async writeAuditLog(input: AuditLogWriteInput): Promise<AuditLogWriteResult> {
        writeAuditConsoleLog({
            level: input.result === 'SUCCESS' ? 'info' : 'warn',
            module: input.module,
            message: input.summary,
            event: input.action,
            requestId: input.requestId,
            userId: input.actorId || 'anonymous',
            actor: input.actorId
                ? {
                      id: input.actorId,
                      type: input.actorType || 'user',
                      name: input.actorName,
                      roles: input.actorRoles
                  }
                : undefined,
            resource: {
                type: input.resourceType,
                id: input.resourceId,
                action: input.action
            },
            result: {
                success: input.result === 'SUCCESS',
                message: input.failureReason
            },
            http: {
                method: input.requestMethod,
                path: input.requestPath,
                requestHeaders: input.requestHeaders,
                requestBody: input.requestBody,
                responseHeaders: input.responseHeaders,
                responseBody: input.responseBody,
                statusCode: input.statusCode,
                bizCode: input.bizCode,
                ip: input.ip,
                userAgent: input.userAgent
            },
            context: input.context
        });

        try {
            if (!this.prisma) {
                throw new Error('AUDIT_LOG_PRISMA_CLIENT is not configured');
            }

            await this.prisma.auditLog.create({
                data: {
                    id: ulid(),
                    app: input.app,
                    module: input.module,
                    action: input.action,
                    summary: input.summary,
                    resourceType: input.resourceType,
                    resourceId: input.resourceId,
                    requestId: input.requestId,
                    actorId: input.actorId,
                    actorType: input.actorType,
                    actorName: input.actorName,
                    actorRoles: input.actorRoles || undefined,
                    requestMethod: input.requestMethod,
                    requestPath: input.requestPath,
                    ip: input.ip,
                    userAgent: input.userAgent,
                    statusCode: input.statusCode,
                    bizCode: input.bizCode,
                    result: input.result,
                    failureReason: input.failureReason,
                    requestHeaders: toPrismaJsonValue(input.requestHeaders),
                    requestBody: toPrismaJsonValue(input.requestBody),
                    responseHeaders: toPrismaJsonValue(input.responseHeaders),
                    responseBody: toPrismaJsonValue(input.responseBody),
                    beforeData: toPrismaJsonValue(input.beforeData),
                    afterData: toPrismaJsonValue(input.afterData),
                    context: toPrismaJsonValue(input.context)
                }
            });
            return { persisted: true };
        } catch (error) {
            const persistenceError = buildAuditPersistenceError(error);
            writeSystemLog({
                level: 'error',
                module: 'audit_log_service',
                message: '写入审计日志失败',
                requestId: input.requestId,
                error: persistenceError,
                context: {
                    app: input.app,
                    module: input.module,
                    summary: input.summary,
                    action: input.action,
                    resourceType: input.resourceType,
                    resourceId: input.resourceId,
                    actorId: input.actorId,
                    result: input.result
                }
            });
            return {
                persisted: false,
                error: persistenceError
            };
        }
    }
}
