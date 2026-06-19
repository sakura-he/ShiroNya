import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@app/prisma-admin';
import { AdminSpiceDbAuthorizationService } from './admin-spicedb-authorization.service';
import { AdminSpiceDbClientFactory } from './admin-spicedb-client.factory';

/**
 * 全局提供 admin 侧 SpiceDB 授权服务，避免业务模块重复装配客户端。
 */
@Global()
@Module({
    imports: [PrismaModule],
    providers: [AdminSpiceDbClientFactory, AdminSpiceDbAuthorizationService],
    exports: [AdminSpiceDbClientFactory, AdminSpiceDbAuthorizationService]
})
export class AdminSpiceDbAuthorizationModule {}
