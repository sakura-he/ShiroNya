import { APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, type AppUserAdminAbacRpcMethod } from '@app/common';
import { CerbosAbacControlPlaneService } from '@app/cerbos-abac';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminControlPlaneAccessService } from '../admin-control-plane-access.service';

type AbacJsonRequest = {
    json?: string;
};

type AbacIdRequest = {
    id?: string;
};

type AbacRevisionRequest = {
    revision?: string;
};

@Controller()
export class AbacAdminGrpcController {
    constructor(
        private readonly abacControlPlaneService: CerbosAbacControlPlaneService,
        private readonly controlPlaneAccessService: AdminControlPlaneAccessService
    ) {}

    private async handle(
        method: AppUserAdminAbacRpcMethod,
        metadata: unknown,
        run: (actorId: string) => Promise<unknown> | unknown
    ) {
        const context = this.controlPlaneAccessService.assertRpcAccess(method, metadata);
        const result = await run(context.actorId);
        return {
            json: JSON.stringify(result ?? {})
        };
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'GetAbacHealth')
    getAbacHealth(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('GetAbacHealth', metadata, () => this.abacControlPlaneService.getHealth());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'GetAbacFields')
    getAbacFields(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('GetAbacFields', metadata, () => this.abacControlPlaneService.getFieldRegistry());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'ListAbacFieldRegistry')
    listAbacFieldRegistry(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('ListAbacFieldRegistry', metadata, () =>
            this.abacControlPlaneService.listFieldRegistry(parseJsonRequest(request))
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'UpsertAbacField')
    upsertAbacField(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('UpsertAbacField', metadata, (actorId) =>
            this.abacControlPlaneService.upsertField(parseJsonRequest(request), actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'DeleteAbacField')
    deleteAbacField(request: AbacIdRequest, metadata?: unknown) {
        return this.handle('DeleteAbacField', metadata, (actorId) =>
            this.abacControlPlaneService.deleteField(request.id ?? '', actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'ListAbacRbacPermissionOptions')
    listAbacRbacPermissionOptions(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('ListAbacRbacPermissionOptions', metadata, () =>
            this.abacControlPlaneService.listRbacPermissionOptions(parseJsonRequest(request))
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'ListAbacPolicyGroups')
    listAbacPolicyGroups(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('ListAbacPolicyGroups', metadata, () => this.abacControlPlaneService.listPolicyGroups());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'UpsertAbacPolicyGroup')
    upsertAbacPolicyGroup(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('UpsertAbacPolicyGroup', metadata, (actorId) =>
            this.abacControlPlaneService.upsertPolicyGroup(parseJsonRequest(request), actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'DeleteAbacPolicyGroup')
    deleteAbacPolicyGroup(request: AbacIdRequest, metadata?: unknown) {
        return this.handle('DeleteAbacPolicyGroup', metadata, (actorId) =>
            this.abacControlPlaneService.deletePolicyGroup(request.id ?? '', actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'ListAbacManualPolicies')
    listAbacManualPolicies(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('ListAbacManualPolicies', metadata, () => this.abacControlPlaneService.listManualPolicies());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'ValidateAbacManualPolicy')
    validateAbacManualPolicy(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('ValidateAbacManualPolicy', metadata, () =>
            this.abacControlPlaneService.validateManualPolicy(parseJsonRequest(request))
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'UpsertAbacManualPolicy')
    upsertAbacManualPolicy(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('UpsertAbacManualPolicy', metadata, (actorId) =>
            this.abacControlPlaneService.upsertManualPolicy(parseJsonRequest(request), actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'DeleteAbacManualPolicy')
    deleteAbacManualPolicy(request: AbacIdRequest, metadata?: unknown) {
        return this.handle('DeleteAbacManualPolicy', metadata, (actorId) =>
            this.abacControlPlaneService.deleteManualPolicy(request.id ?? '', actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'PreviewAbacCompile')
    previewAbacCompile(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('PreviewAbacCompile', metadata, () => this.abacControlPlaneService.compilePreview());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'PreviewAbacPublish')
    previewAbacPublish(_request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('PreviewAbacPublish', metadata, () => this.abacControlPlaneService.previewPublish());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'PublishAbac')
    publishAbac(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('PublishAbac', metadata, (actorId) =>
            this.abacControlPlaneService.publish(parseJsonRequest(request) as { reason?: string }, actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'GetAbacReleases')
    getAbacReleases(_request: Record<string, never>, metadata?: unknown) {
        return this.handle('GetAbacReleases', metadata, () => this.abacControlPlaneService.listReleases());
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'RollbackAbacRelease')
    rollbackAbacRelease(request: AbacRevisionRequest, metadata?: unknown) {
        return this.handle('RollbackAbacRelease', metadata, (actorId) =>
            this.abacControlPlaneService.rollback(request.revision ?? '', actorId)
        );
    }

    @GrpcMethod(APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME, 'TestAbacRuntime')
    testAbacRuntime(request: AbacJsonRequest, metadata?: unknown) {
        return this.handle('TestAbacRuntime', metadata, () =>
            this.abacControlPlaneService.runtimeTest(parseJsonRequest(request))
        );
    }

}

function parseJsonRequest(request: AbacJsonRequest): Record<string, unknown> {
    if (!request.json) {
        return {};
    }
    const parsed = JSON.parse(request.json) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}
