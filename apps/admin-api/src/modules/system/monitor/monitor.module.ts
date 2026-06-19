import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { UserAdminGrpcModule } from '../../app-api/user/user-admin-grpc.module';
import { AdminSpiceDbAuthorizationModule } from '../../spicedb/admin-spicedb-authorization.module';
import { SystemMonitorController } from './monitor.controller';
import { SystemMonitorService } from './monitor.service';

@Module({
    imports: [PrismaModule, UserAdminGrpcModule, AdminSpiceDbAuthorizationModule],
    controllers: [SystemMonitorController],
    providers: [SystemMonitorService]
})
export class SystemMonitorModule {}
