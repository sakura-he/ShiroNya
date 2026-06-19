import type { AppUserAdminAbacRpcMethod } from '@app/common';
import { Injectable } from '@nestjs/common';
import { UserAdminGrpcClient, type ControlPlaneActor } from '../user/user-admin.grpc-client';

@Injectable()
export class AbacAdminService {
    constructor(private readonly grpcClient: UserAdminGrpcClient) {}

    async call(
        method: AppUserAdminAbacRpcMethod,
        payload: Record<string, unknown>,
        actor: ControlPlaneActor,
        requestId?: string
    ) {
        return await this.grpcClient.callTypedAbacControlPlane(method, payload, {
            actor,
            requestId,
            reason: `manage app-api Cerbos ABAC via ${method}`
        });
    }
}
