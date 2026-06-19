import { Module } from '@nestjs/common';
import { RbacAdminCoreModule } from '../rbac-admin-core.module';
import { RbacPermissionGroupAdminController } from './rbac-permission-group-admin.controller';

@Module({
    imports: [RbacAdminCoreModule],
    controllers: [RbacPermissionGroupAdminController]
})
export class RbacPermissionGroupAdminModule {}
