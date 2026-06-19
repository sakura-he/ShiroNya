import { PrismaModule } from '@app/prisma-admin';
import { Module } from '@nestjs/common';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { AdminSpiceDbAuthorizationModule } from '../spicedb/admin-spicedb-authorization.module';
import { AuthzProjectionInvalidationService } from './authz-projection-invalidation.service';
import { BaseRelationProjectionService } from './base-relation-projection.service';
import { ProjectionAuthzReadService } from './projection-authz-read.service';
import { ProjectionHealthGateService } from './projection-health-gate.service';

/**
 * 提供 SpiceDB 关系投影读模型，供 SpiceDB 数据页和显式关系授权查询复用。
 */
@Module({
    imports: [PrismaModule, AdminSpiceDbAuthorizationModule, AdminUserStateModule],
    providers: [
        BaseRelationProjectionService,
        ProjectionHealthGateService,
        ProjectionAuthzReadService,
        AuthzProjectionInvalidationService
    ],
    exports: [
        BaseRelationProjectionService,
        ProjectionHealthGateService,
        ProjectionAuthzReadService,
        AuthzProjectionInvalidationService
    ]
})
export class AdminSpiceDbProjectionModule {}
