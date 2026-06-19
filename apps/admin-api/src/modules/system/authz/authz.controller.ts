import { Body, Controller, Get, Post, Session } from '@nestjs/common';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { CheckRbacPermissionDto } from '../rbac/dto/rbac.dto';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';

@Controller('rbac/authz')
export class SystemRbacAuthzController {
    constructor(private readonly authzService: RbacAuthorizationService) {}

    @Get('me')
    async getMyRbacPermissions(@Session() session: BetterAuthSession) {
        return {
            permissions: await this.authzService.getGrantedCodes(session.user.id)
        };
    }

    @Post('check')
    async check(@Session() session: BetterAuthSession, @Body() data: CheckRbacPermissionDto) {
        return {
            allowed: await this.authzService.checkPermission(session.user.id, data.code)
        };
    }
}
