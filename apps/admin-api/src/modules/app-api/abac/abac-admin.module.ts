import { Module } from '@nestjs/common';
import { UserAdminGrpcModule } from '../user/user-admin-grpc.module';
import { AbacAdminController } from './abac-admin.controller';
import { AbacAdminService } from './abac-admin.service';

@Module({
    imports: [UserAdminGrpcModule],
    controllers: [AbacAdminController],
    providers: [AbacAdminService],
    exports: [AbacAdminService]
})
export class AbacAdminModule {}
