import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { SystemMenusModule } from '../menus/menus.module';
import { AuthzObjectExceptionModule } from '../../authz-object-exception/authz-object-exception.module';
import { SystemRbacAssignmentsModule } from '../assignments/assignments.module';
import { RbacAuthorizationModule } from '../rbac/rbac-authorization.module';
import { SystemRolesModule } from '../roles/roles.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SystemUsersController } from './users.controller';
import { SystemUsersService } from './users.service';

@Module({
    imports: [
        PrismaModule,
        SystemMenusModule,
        SystemRolesModule,
        RbacAuthorizationModule,
        SystemRbacAssignmentsModule,
        AdminUserStateModule,
        AuthzObjectExceptionModule
    ],
    controllers: [SystemUsersController],
    providers: [
        {
            provide: SystemUsersService,
            useClass: SystemUsersService
        }
    ],
    exports: [SystemUsersService]
})
export class SystemUsersModule {}
