import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { RbacAuthorizationModule } from '../rbac/rbac-authorization.module';
import { SystemRbacAssignmentsService } from './assignments.service';

@Module({
    imports: [PrismaModule, RbacAuthorizationModule, AdminUserStateModule],
    providers: [SystemRbacAssignmentsService],
    exports: [SystemRbacAssignmentsService]
})
export class SystemRbacAssignmentsModule {}
