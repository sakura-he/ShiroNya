import { Body, Controller, Get, Post } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { QueryRbacUserEffectiveStateDto, RbacRebuildDto } from '../rbac/dto/rbac.dto';
import { SystemRbacEffectiveService } from './effective.service';

@Controller('rbac/effective')
export class SystemRbacEffectiveController {
    constructor(private readonly effectiveService: SystemRbacEffectiveService) {}

    @Get('overview')
    async getOverview(@Session() session: BetterAuthSession) {
        return await this.effectiveService.getOverview(session.user.id);
    }

    @Post('query_user_effective_state')
    async queryUserEffectiveState(@Session() session: BetterAuthSession, @Body() data: QueryRbacUserEffectiveStateDto) {
        return await this.effectiveService.queryUserEffectiveState(data, session.user.id);
    }

    @Post('rebuild/preview')
    async previewRebuild(@Session() session: BetterAuthSession, @Body() data: RbacRebuildDto) {
        return await this.effectiveService.previewRebuild(data, session.user.id);
    }

    @Post('rebuild/apply')
    async applyRebuild(@Session() session: BetterAuthSession, @Body() data: RbacRebuildDto) {
        return await this.effectiveService.applyRebuild(data, session.user.id);
    }
}
