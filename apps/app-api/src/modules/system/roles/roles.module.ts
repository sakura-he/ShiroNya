import { PrismaModule } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import { AuthzObjectExceptionModule } from '../../authz-object-exception/authz-object-exception.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SystemMenusModule } from '../menus/menus.module';
import { SystemRbacAssignmentsModule } from '../assignments/assignments.module';
import { RbacAuthorizationModule } from '../rbac/rbac-authorization.module';
import { SystemRolesController } from './roles.controller';
import { SystemRolesService } from './roles.service';

@Module({
    imports: [
        PrismaModule,
        SystemMenusModule,
        AdminUserStateModule,
        RbacAuthorizationModule,
        SystemRbacAssignmentsModule,
        AuthzObjectExceptionModule
    ],
    controllers: [SystemRolesController],
    providers: [SystemRolesService],
    exports: [SystemRolesService]
})
export class SystemRolesModule {}
