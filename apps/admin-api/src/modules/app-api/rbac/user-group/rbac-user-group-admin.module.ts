import { Module } from '@nestjs/common';
import { RbacAdminCoreModule } from '../rbac-admin-core.module';
import { RbacUserGroupAdminController } from './rbac-user-group-admin.controller';

@Module({
    imports: [RbacAdminCoreModule],
    controllers: [RbacUserGroupAdminController]
})
export class RbacUserGroupAdminModule {}
