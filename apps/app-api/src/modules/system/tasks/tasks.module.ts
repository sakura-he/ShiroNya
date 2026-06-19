import { PrismaModule } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import { AuthzObjectExceptionModule } from '../../authz-object-exception/authz-object-exception.module';
import { AdminSpiceDbProjectionModule } from '../../spicedb-projection/spicedb-projection.module';
import { AdminSpiceDbAuthorizationModule } from '../../spicedb/admin-spicedb-authorization.module';
import { ClearChunksTaskService } from '../../../tasks/clear_chunks_task';
import { SystemTasksService } from './tasks.service';
import { SystemTasksController } from './tasks.controller';

@Module({
    imports: [PrismaModule, AdminSpiceDbAuthorizationModule, AdminSpiceDbProjectionModule, AuthzObjectExceptionModule],
    controllers: [SystemTasksController],
    providers: [SystemTasksService, ClearChunksTaskService],
    exports: [SystemTasksService]
})
export class SystemTasksModule {}
