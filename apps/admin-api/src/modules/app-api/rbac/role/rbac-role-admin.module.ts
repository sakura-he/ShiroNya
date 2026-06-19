import { Module } from '@nestjs/common';
import { RbacAdminCoreModule } from '../rbac-admin-core.module';
import { RbacRoleAdminController } from './rbac-role-admin.controller';

@Module({
    imports: [RbacAdminCoreModule],
    controllers: [RbacRoleAdminController]
})
export class RbacRoleAdminModule {}
