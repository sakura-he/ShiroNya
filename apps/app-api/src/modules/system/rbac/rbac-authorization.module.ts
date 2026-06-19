import { PrismaModule } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import { AdminCacheModule } from '../../cache/admin-cache.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SystemRbacEffectivePermissionCacheService } from './rbac-effective-permission-cache.service';
import { RbacAuthorizationService } from './rbac-authorization.service';
import { SystemRbacGraphService } from './rbac-graph.service';

@Module({
    imports: [PrismaModule, AdminUserStateModule, AdminCacheModule],
    providers: [SystemRbacGraphService, RbacAuthorizationService, SystemRbacEffectivePermissionCacheService],
    exports: [SystemRbacGraphService, RbacAuthorizationService]
})
export class RbacAuthorizationModule {}
