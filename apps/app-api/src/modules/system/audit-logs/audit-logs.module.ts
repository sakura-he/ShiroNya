import { Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma-app';
import { SystemAuditLogsController } from './audit-logs.controller';
import { SystemAuditLogsQueryService } from './audit-logs.service';

/**
 * 审计日志查询模块
 */
@Module({
    imports: [PrismaModule],
    controllers: [SystemAuditLogsController],
    providers: [SystemAuditLogsQueryService],
    exports: [SystemAuditLogsQueryService]
})
export class SystemAuditLogsModule {}
