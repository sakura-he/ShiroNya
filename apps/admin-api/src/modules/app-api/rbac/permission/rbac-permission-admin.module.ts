import { Module } from '@nestjs/common';
import { RbacAdminCoreModule } from '../rbac-admin-core.module';
import { RbacPermissionAdminController } from './rbac-permission-admin.controller';

@Module({
    imports: [RbacAdminCoreModule],
    controllers: [RbacPermissionAdminController]
})
export class RbacPermissionAdminModule {}
