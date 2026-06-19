import { Injectable } from '@nestjs/common';
import { RbacRebuildDto, QueryRbacUserEffectiveStateDto } from '../rbac/dto/rbac.dto';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';

@Injectable()
export class SystemRbacEffectiveService {
    constructor(
        private readonly authzService: RbacAuthorizationService,
        private readonly graphService: SystemRbacGraphService
    ) {}

    async getOverview(actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.EFFECTIVE_VIEW);
        return await this.graphService.getOverview();
    }

    async queryUserEffectiveState(query: QueryRbacUserEffectiveStateDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.EFFECTIVE_VIEW);
        return await this.graphService.getUserEffectiveState(query.userId);
    }

    async previewRebuild(data: RbacRebuildDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.EFFECTIVE_REBUILD);
        return await this.graphService.previewRebuild(data.userIds);
    }

    async applyRebuild(data: RbacRebuildDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.EFFECTIVE_REBUILD);
        return await this.graphService.applyRebuild(data.userIds);
    }
}
