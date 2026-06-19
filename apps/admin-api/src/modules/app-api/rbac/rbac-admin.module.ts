import { Module } from '@nestjs/common';
import { RbacMenuAdminModule } from './menu/rbac-menu-admin.module';
import { RbacPermissionGroupAdminModule } from './permission-group/rbac-permission-group-admin.module';
import { RbacPermissionAdminModule } from './permission/rbac-permission-admin.module';
import { RbacRoleAdminModule } from './role/rbac-role-admin.module';
import { RbacAdminCoreModule } from './rbac-admin-core.module';
import { RbacUserGroupAdminModule } from './user-group/rbac-user-group-admin.module';

@Module({
    imports: [
        RbacAdminCoreModule,
        RbacRoleAdminModule,
        RbacUserGroupAdminModule,
        RbacPermissionAdminModule,
        RbacPermissionGroupAdminModule,
        RbacMenuAdminModule
    ],
    exports: [RbacAdminCoreModule]
})
export class RbacAdminModule {}
