import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SystemRbacAuthzController } from '../authz/authz.controller';
import { SystemRbacEffectiveController } from '../effective/effective.controller';
import { SystemRbacEffectiveService } from '../effective/effective.service';
import { SystemRbacPermissionDiscoveryController } from '../discovery/discovery.controller';
import { SystemRbacPermissionDiscoveryService } from '../discovery/discovery.service';
import { SystemRbacPermissionGroupsController } from '../permission-groups/permission-groups.controller';
import { SystemRbacPermissionGroupsService } from '../permission-groups/permission-groups.service';
import { SystemRbacPermissionsController } from '../permissions/permissions.controller';
import { SystemRbacPermissionsService } from '../permissions/permissions.service';
import { SystemRbacAssignmentsModule } from '../assignments/assignments.module';
import { RbacAuthorizationModule } from './rbac-authorization.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';

@Module({
    imports: [
        PrismaModule,
        DiscoveryModule,
        RbacAuthorizationModule,
        SystemRbacAssignmentsModule,
        AdminUserStateModule
    ],
    controllers: [
        SystemRbacAuthzController,
        SystemRbacPermissionsController,
        SystemRbacPermissionGroupsController,
        SystemRbacPermissionDiscoveryController,
        SystemRbacEffectiveController
    ],
    providers: [
        SystemRbacPermissionsService,
        SystemRbacPermissionGroupsService,
        SystemRbacPermissionDiscoveryService,
        SystemRbacEffectiveService
    ],
    exports: [RbacAuthorizationModule, SystemRbacAssignmentsModule]
})
export class SystemRbacModule {}
