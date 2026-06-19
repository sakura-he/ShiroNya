import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/prisma-admin';
import { QueryAuditLogDto } from './dto/audit-log.dto';

/**
 * 审计日志查询服务
 */
@Injectable()
export class SystemAuditLogsQueryService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * 查询审计日志列表
     */
    async getAuditLogs(query: QueryAuditLogDto) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;
        const skip = (page - 1) * pageSize;
        const where: Record<string, unknown> = {};

        if (query.module) {
            where.module = query.module;
        }
        if (query.action) {
            where.action = query.action;
        }
        if (query.result) {
            where.result = query.result;
        }
        if (query.actorId) {
            where.actorId = query.actorId;
        }
        if (query.keyword) {
            where.OR = [
                {
                    summary: {
                        contains: query.keyword,
                        mode: 'insensitive'
                    }
                },
                {
                    failureReason: {
                        contains: query.keyword,
                        mode: 'insensitive'
                    }
                },
                {
                    requestPath: {
                        contains: query.keyword,
                        mode: 'insensitive'
                    }
                }
            ];
        }
        if (query.startDate && query.endDate) {
            where.createdAt = {
                gte: new Date(query.startDate),
                lte: new Date(query.endDate)
            };
        }

        const total = await this.prisma.auditLog.count({ where });
        const records = await this.prisma.auditLog.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: {
                createdAt: 'desc'
            }
        });

        return {
            records,
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        };
    }

    /**
     * 获取审计日志详情
     */
    async getAuditLogDetail(id: string) {
        return await this.prisma.auditLog.findUnique({
            where: { id }
        });
    }
}
