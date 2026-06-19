import { PrismaModule } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import { AuthzObjectExceptionModule } from '../../authz-object-exception/authz-object-exception.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SystemRbacAssignmentsModule } from '../assignments/assignments.module';
import { RbacAuthorizationModule } from '../rbac/rbac-authorization.module';
import { SystemMenusController } from './menus.controller';
import { SystemMenusService } from './menus.service';

@Module({
    imports: [
        PrismaModule,
        AdminUserStateModule,
        RbacAuthorizationModule,
        SystemRbacAssignmentsModule,
        AuthzObjectExceptionModule
    ],
    controllers: [SystemMenusController],
    providers: [SystemMenusService],
    exports: [SystemMenusService]
})
export class SystemMenusModule {}
