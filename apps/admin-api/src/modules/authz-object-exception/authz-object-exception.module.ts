import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { AdminSpiceDbAuthorizationModule } from '../spicedb/admin-spicedb-authorization.module';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { AuthzObjectExceptionService } from './authz-object-exception.service';

/**
 * 装配核心对象级例外授权的源表、预览、写入和清理能力。
 */
@Module({
    imports: [PrismaModule, AdminSpiceDbAuthorizationModule, RbacAuthorizationModule, AdminUserStateModule],
    providers: [AuthzObjectExceptionService],
    exports: [AuthzObjectExceptionService]
})
export class AuthzObjectExceptionModule {}
