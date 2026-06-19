import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
    imports: [PrismaModule, AdminUserStateModule, RbacAuthorizationModule],
    controllers: [AccountController],
    providers: [AccountService]
})
export class AccountModule {}
