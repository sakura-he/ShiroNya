import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { asPrismaISODate } from '@app/prisma-admin/extensions/date-to-iso-string.extension';
import { AuditLogDetailParamsDto, QueryAuditLogDto } from './dto/audit-log.dto';
import { AuditLogDetailDto, AuditLogListDataDto } from './dto/audit-log-res.dto';
import { SystemAuditLogsQueryService } from './audit-logs.service';

/**
 * 审计日志控制器
 * 当前仅要求已登录会话，接口不执行额外权限拦截。
 */
@ApiTags('System/AuditLog')
@Controller('system/audit-log')
export class SystemAuditLogsController {
    constructor(private readonly auditLogQueryService: SystemAuditLogsQueryService) {}

    /** 查询审计日志列表 */
    @ApiCookieAuth('admin-api.session')
    @Post('list')
    @ApiOkResByZod({
        summary: '查询审计日志列表',
        description: '返回审计日志分页列表',
        type: AuditLogListDataDto
    })
    async getAuditLogs(@Body() query: QueryAuditLogDto) {
        const result = await this.auditLogQueryService.getAuditLogs(query);
        return asPrismaISODate(result);
    }

    /** 获取审计日志详情 */
    @ApiCookieAuth('admin-api.session')
    @Get(':id')
    @ApiOkResByZod({
        summary: '获取审计日志详情',
        description: '返回指定审计日志详情',
        type: AuditLogDetailDto
    })
    async getAuditLogDetail(@Param() params: AuditLogDetailParamsDto) {
        const result = await this.auditLogQueryService.getAuditLogDetail(params.id);
        return asPrismaISODate(result);
    }
}
