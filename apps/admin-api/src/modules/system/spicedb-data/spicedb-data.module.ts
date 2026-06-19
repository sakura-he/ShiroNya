import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AdminSpiceDbProjectionModule } from '../../spicedb-projection/spicedb-projection.module';
import { AdminSpiceDbStreamConsumerModule } from '../../spicedb-stream/admin-spicedb-stream-consumer.module';
import { AdminUserStateModule } from '../../user-state/admin-user-state.module';
import { SpiceDbDataController } from './spicedb-data.controller';
import { SpiceDbDataKafkaOpsService } from './spicedb-data-kafka-ops.service';
import { SpiceDbDataService } from './spicedb-data.service';
import { SpiceDbProjectionReconcileService } from './spicedb-projection-reconcile.service';

/**
 * 装配 SpiceDB 数据管理接口及关系投影对账服务。
 */
@Module({
    imports: [PrismaModule, AdminSpiceDbProjectionModule, AdminSpiceDbStreamConsumerModule, AdminUserStateModule],
    controllers: [SpiceDbDataController],
    providers: [SpiceDbDataService, SpiceDbProjectionReconcileService, SpiceDbDataKafkaOpsService],
    exports: [SpiceDbDataService, SpiceDbProjectionReconcileService]
})
export class SpiceDbDataModule {}
