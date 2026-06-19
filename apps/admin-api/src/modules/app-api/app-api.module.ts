import { Module } from '@nestjs/common';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { AbacAdminModule } from './abac/abac-admin.module';
import { RbacAdminModule } from './rbac/rbac-admin.module';
import { UserAdminGrpcModule } from './user/user-admin-grpc.module';
import { UserAdminController } from './user/user-admin.controller';
import { UserAdminService } from './user/user-admin.service';

@Module({
    imports: [UserAdminGrpcModule, RbacAuthorizationModule, RbacAdminModule, AbacAdminModule],
    controllers: [UserAdminController],
    providers: [UserAdminService],
    exports: [UserAdminService]
})
export class AppApiModule {}
