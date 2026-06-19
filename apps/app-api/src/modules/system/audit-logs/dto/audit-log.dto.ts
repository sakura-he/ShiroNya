import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * 查询审计日志 Schema
 */
export const QueryAuditLogSchema = z
    .object({
        module: z.string().optional(),
        action: z.string().optional(),
        result: z.enum(['SUCCESS', 'FAILURE', 'DENY']).optional(),
        actorId: z.string().optional(),
        keyword: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20)
    })
    .refine(
        (data) => {
            if (data.startDate && !data.endDate) return false;
            if (!data.startDate && data.endDate) return false;
            return true;
        },
        {
            message: 'startDate and endDate must be provided together',
            path: ['startDate', 'endDate']
        }
    );

export class QueryAuditLogDto extends createZodDto(QueryAuditLogSchema) {}

/**
 * 审计日志详情参数 Schema（id 为 ULID 字符串）
 */
export const AuditLogDetailParamsSchema = z.object({
    id: z.string().min(1)
});

export class AuditLogDetailParamsDto extends createZodDto(AuditLogDetailParamsSchema) {}
