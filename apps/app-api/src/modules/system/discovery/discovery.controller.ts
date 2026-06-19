import { Controller, Get, Session } from '@nestjs/common';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { SystemRbacPermissionDiscoveryService } from './discovery.service';

@Controller('rbac/permission')
export class SystemRbacPermissionDiscoveryController {
    constructor(
        private readonly permissionDiscoveryService: SystemRbacPermissionDiscoveryService,
        private readonly authzService: RbacAuthorizationService
    ) {}

    @Get('candidates')
    async getCandidates(@Session() session: BetterAuthSession) {
        await this.authzService.assertPermission(session.user.id, RBAC_PERMISSIONS.PERMISSION_VIEW);
        return this.permissionDiscoveryService.getCandidates();
    }
}
