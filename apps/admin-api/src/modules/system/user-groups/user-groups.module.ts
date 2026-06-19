import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AuthzObjectExceptionModule } from '../../authz-object-exception/authz-object-exception.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SystemRbacAssignmentsModule } from '../assignments/assignments.module';
import { RbacAuthorizationModule } from '../rbac/rbac-authorization.module';
import { SystemUserGroupsController } from './user-groups.controller';
import { SystemUserGroupsService } from './user-groups.service';

/**
 * 用户组模块，元数据存储在业务库，成员与角色分配存储在 SpiceDB。
 */
@Module({
    imports: [
        PrismaModule,
        AdminUserStateModule,
        RbacAuthorizationModule,
        SystemRbacAssignmentsModule,
        AuthzObjectExceptionModule
    ],
    controllers: [SystemUserGroupsController],
    providers: [SystemUserGroupsService],
    exports: [SystemUserGroupsService]
})
export class SystemUserGroupsModule {}
