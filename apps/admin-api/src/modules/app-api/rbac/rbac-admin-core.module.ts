import { Module } from '@nestjs/common';
import { RbacAuthorizationModule } from '../../system/rbac/rbac-authorization.module';
import { UserAdminGrpcModule } from '../user/user-admin-grpc.module';
import { RbacAdminService } from './rbac-admin.service';

@Module({
    imports: [UserAdminGrpcModule, RbacAuthorizationModule],
    providers: [RbacAdminService],
    exports: [RbacAdminService]
})
export class RbacAdminCoreModule {}
