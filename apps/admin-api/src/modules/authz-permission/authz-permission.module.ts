import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AuthzObjectExceptionModule } from '../authz-object-exception/authz-object-exception.module';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { SpiceDbDataModule } from '../system/spicedb-data/spicedb-data.module';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { AuthzPermissionController } from './authz-permission.controller';
import { AuthzPermissionService } from './authz-permission.service';

/**
 * 装配独立权限管理页的矩阵读取和 manager 授权写入能力。
 */
@Module({
    imports: [
        PrismaModule,
        SpiceDbDataModule,
        RbacAuthorizationModule,
        AdminUserStateModule,
        AuthzObjectExceptionModule
    ],
    controllers: [AuthzPermissionController],
    providers: [AuthzPermissionService],
    exports: [AuthzPermissionService]
})
export class AuthzPermissionModule {}
