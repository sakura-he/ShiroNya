import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 审计日志信息 Schema
 */
export const AuditLogInfoSchema = z.object({
    id: z.string(),
    app: z.string(),
    module: z.string(),
    action: z.string(),
    summary: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    requestId: z.string().nullable(),
    actorId: z.string().nullable(),
    actorType: z.string().nullable(),
    actorName: z.string().nullable(),
    actorRoles: z.any().nullable(),
    requestMethod: z.string().nullable(),
    requestPath: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    statusCode: z.number().nullable(),
    bizCode: z.number().nullable(),
    result: z.enum(['SUCCESS', 'FAILURE', 'DENY']),
    failureReason: z.string().nullable(),
    requestHeaders: z.any().nullable(),
    requestBody: z.any().nullable(),
    responseHeaders: z.any().nullable(),
    responseBody: z.any().nullable(),
    beforeData: z.any().nullable(),
    afterData: z.any().nullable(),
    context: z.any().nullable(),
    createdAt: z.any()
});

export class AuditLogInfoDto extends createZodDto(AuditLogInfoSchema) {}

/**
 * 审计日志列表 Schema
 */
export const AuditLogListDataSchema = z.object({
    records: z.array(AuditLogInfoSchema),
    pagination: z.object({
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number()
    })
});

export class AuditLogListDataDto extends createZodDto(AuditLogListDataSchema) {}

/**
 * 审计日志详情 Schema
 */
export const AuditLogDetailSchema = AuditLogInfoSchema.nullable();

export class AuditLogDetailDto extends createZodDto(AuditLogDetailSchema as any) {}
