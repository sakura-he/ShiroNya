import { CerbosAbacModule } from '@app/cerbos-abac';
import { PrismaModule, PrismaService } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { BetterAuthAdminGrpcController } from '../better-auth/better-auth-admin.grpc.controller';
import { BetterAuthAdminService } from '../better-auth/better-auth-admin.service';
import { BetterAuthInternalAdminService } from '../better-auth/better-auth-internal-admin.service';
import { SystemMenusPolicyGrpcController } from '../system/menus/menus-policy.grpc.controller';
import { SystemMenusModule } from '../system/menus/menus.module';
import { SystemUsersAdminGrpcController } from '../system/users/users-admin.grpc.controller';
import { SystemUsersAdminService } from '../system/users/users-admin.service';
import { AdminControlPlaneAccessService } from './admin-control-plane-access.service';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { SystemMenusPolicyService } from '../system/menus/menus-policy.service';
import { SystemRbacAssignmentsModule } from '../system/assignments/assignments.module';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { SystemRbacModule } from '../system/rbac/rbac.module';
import { SystemRolesModule } from '../system/roles/roles.module';
import { SystemUserGroupsModule } from '../system/user-groups/user-groups.module';
import { AbacAdminGrpcController } from './abac/abac-admin.grpc.controller';
import { RbacAdminGrpcController } from './rbac/rbac-admin.grpc.controller';
import { RbacAdminControlPlaneService } from './rbac/rbac-admin-control-plane.service';

@Module({
    imports: [
        // 用户状态版本服务不是全局 provider，这里显式导入，避免启动时依赖注入失败。
        AdminUserStateModule,
        DiscoveryModule,
        PrismaModule,
        CerbosAbacModule.forRoot({
            appName: 'app-api',
            cerbosEnvPrefix: 'APP_',
            prismaServiceToken: PrismaService,
            imports: [PrismaModule]
        }),
        SystemMenusModule,
        SystemRbacAssignmentsModule,
        RbacAuthorizationModule,
        SystemRbacModule,
        SystemRolesModule,
        SystemUserGroupsModule
    ],
    controllers: [
        SystemUsersAdminGrpcController,
        BetterAuthAdminGrpcController,
        SystemMenusPolicyGrpcController,
        RbacAdminGrpcController,
        AbacAdminGrpcController
    ],
    providers: [
        BetterAuthAdminService,
        BetterAuthInternalAdminService,
        SystemUsersAdminService,
        AdminControlPlaneAccessService,
        SystemMenusPolicyService,
        RbacAdminControlPlaneService
    ],
    exports: [SystemUsersAdminService, BetterAuthAdminService]
})
export class AppUserAdminModule {}
