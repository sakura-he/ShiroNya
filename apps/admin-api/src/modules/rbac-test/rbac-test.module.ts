import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { RbacTestController } from './rbac-test.controller';
import { RbacTestService } from './rbac-test.service';

@Module({
    imports: [PrismaModule, RbacAuthorizationModule],
    controllers: [RbacTestController],
    providers: [RbacTestService]
})
export class RbacTestModule {}
