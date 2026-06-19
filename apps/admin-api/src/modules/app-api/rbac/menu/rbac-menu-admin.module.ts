import { Module } from '@nestjs/common';
import { RbacAdminCoreModule } from '../rbac-admin-core.module';
import { RbacMenuAdminController } from './rbac-menu-admin.controller';

@Module({
    imports: [RbacAdminCoreModule],
    controllers: [RbacMenuAdminController]
})
export class RbacMenuAdminModule {}
