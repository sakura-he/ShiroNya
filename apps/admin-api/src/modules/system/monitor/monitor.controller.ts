import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RedisMonitorOverviewDto, SystemMonitorRuntimeStatusDto } from './dto/monitor.dto';
import { SystemMonitorService } from './monitor.service';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';

@ApiTags('System/Monitor')
@Controller('system/monitor')
export class SystemMonitorController {
    constructor(private readonly monitorService: SystemMonitorService) {}

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_MONITOR_STATUS_VIEW)
    @Get('status')
    @ApiOkResByZod({ summary: '获取系统运行状态', type: SystemMonitorRuntimeStatusDto })
    async getRuntimeStatus() {
        return await this.monitorService.getRuntimeStatus();
    }

    @RbacPermission(RBAC_PERMISSIONS.SYSTEM_MONITOR_REDIS_VIEW)
    @Get('redis')
    @ApiOkResByZod({ summary: '获取 Redis 监控概况', type: RedisMonitorOverviewDto })
    async getRedisOverview() {
        return await this.monitorService.getRedisOverview();
    }
}
