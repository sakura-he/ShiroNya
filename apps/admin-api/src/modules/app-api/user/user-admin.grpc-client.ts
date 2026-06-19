import {
    APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME,
    APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME,
    APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME,
    APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME,
    APP_USER_ADMIN_RPC_SCOPE_MAP,
    BusinessException,
    createGrpcRequestMetadata,
    parseGrpcErrorPayload,
    toRbacGrpcRequest,
    type AppBetterAuthAdminGrpcServiceClient,
    type AppUserAdminAbacRpcMethod,
    type AppBusinessUserAdminGrpcServiceClient,
    type AppCerbosAbacAdminGrpcServiceClient,
    type AppRbacMenuAdminGrpcServiceClient,
    type AppRbacPermissionAdminGrpcServiceClient,
    type AppRbacPermissionGroupAdminGrpcServiceClient,
    type AppRbacRoleAdminGrpcServiceClient,
    type AppRbacUserGroupAdminGrpcServiceClient,
    type AppRoleMenuPolicyAdminGrpcServiceClient,
    type AppUserAdminRpcMethod,
    type AssignRoleMenusRequest,
    type CreateBusinessUserRequest,
    type DeleteBusinessUserRequest,
    type GetBusinessUserRequest,
    type GetBusinessUserRoleIdsRequest,
    type GetRoleMenuIdsRequest,
    type ListBusinessRolesResponse,
    type ListBusinessUsersRequest,
    type ListBusinessUsersResponse,
    type RemoveRoleMenuPolicyRequest,
    type ResetBusinessUserPasswordRequest,
    type SoftDeleteBusinessUserRequest,
    type SuccessResponse,
    type UpdateBusinessUserRequest,
    type UpdateBusinessUserStatusRequest,
    type UserMessage
} from '@app/common';
import { HttpException, HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, type Observable } from 'rxjs';
import { ulid } from 'ulid';
import { USER_ADMIN_GRPC_CLIENT } from './user-admin.tokens';

export type ControlPlaneActor = {
    id: string;
    name?: string | null;
};

type GrpcCallContext = {
    actor: ControlPlaneActor;
    reason?: string;
    requestId?: string;
};

type RbacGrpcInvoker = (
    request: any,
    metadata?: ReturnType<typeof createGrpcRequestMetadata>
) => Observable<any>;

@Injectable()
export class UserAdminGrpcClient implements OnModuleInit {
    private businessUserService!: AppBusinessUserAdminGrpcServiceClient;
    private betterAuthService!: AppBetterAuthAdminGrpcServiceClient;
    private roleMenuPolicyService!: AppRoleMenuPolicyAdminGrpcServiceClient;
    private rbacRoleService!: AppRbacRoleAdminGrpcServiceClient;
    private rbacUserGroupService!: AppRbacUserGroupAdminGrpcServiceClient;
    private rbacPermissionService!: AppRbacPermissionAdminGrpcServiceClient;
    private rbacPermissionGroupService!: AppRbacPermissionGroupAdminGrpcServiceClient;
    private rbacMenuService!: AppRbacMenuAdminGrpcServiceClient;
    private abacService!: AppCerbosAbacAdminGrpcServiceClient;

    constructor(
        @Inject(USER_ADMIN_GRPC_CLIENT)
        private readonly grpcClient: ClientGrpc
    ) {}

    onModuleInit(): void {
        this.businessUserService = this.grpcClient.getService<AppBusinessUserAdminGrpcServiceClient>(
            APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME
        );
        this.betterAuthService = this.grpcClient.getService<AppBetterAuthAdminGrpcServiceClient>(
            APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME
        );
        this.roleMenuPolicyService = this.grpcClient.getService<AppRoleMenuPolicyAdminGrpcServiceClient>(
            APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME
        );
        this.rbacRoleService = this.grpcClient.getService<AppRbacRoleAdminGrpcServiceClient>(
            APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME
        );
        this.rbacUserGroupService = this.grpcClient.getService<AppRbacUserGroupAdminGrpcServiceClient>(
            APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME
        );
        this.rbacPermissionService = this.grpcClient.getService<AppRbacPermissionAdminGrpcServiceClient>(
            APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME
        );
        this.rbacPermissionGroupService = this.grpcClient.getService<AppRbacPermissionGroupAdminGrpcServiceClient>(
            APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME
        );
        this.rbacMenuService = this.grpcClient.getService<AppRbacMenuAdminGrpcServiceClient>(
            APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME
        );
        this.abacService = this.grpcClient.getService<AppCerbosAbacAdminGrpcServiceClient>(
            APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME
        );
    }

    listBusinessUsers(request: ListBusinessUsersRequest, context: GrpcCallContext) {
        return this.call('ListBusinessUsers', context, (metadata) =>
            this.businessUserService.listBusinessUsers(request, metadata)
        );
    }

    listBusinessRoles(context: GrpcCallContext) {
        return this.call('ListBusinessRoles', context, (metadata) =>
            this.businessUserService.listBusinessRoles({}, metadata)
        );
    }

    getBusinessUser(request: GetBusinessUserRequest, context: GrpcCallContext) {
        return this.call('GetBusinessUser', context, (metadata) =>
            this.businessUserService.getBusinessUser(request, metadata)
        );
    }

    getBusinessUserRoleIds(request: GetBusinessUserRoleIdsRequest, context: GrpcCallContext) {
        return this.call('GetBusinessUserRoleIds', context, (metadata) =>
            this.businessUserService.getBusinessUserRoleIds(request, metadata)
        );
    }

    createBusinessUser(request: CreateBusinessUserRequest, context: GrpcCallContext) {
        return this.call('CreateBusinessUser', context, (metadata) =>
            this.businessUserService.createBusinessUser(request, metadata)
        );
    }

    updateBusinessUser(request: UpdateBusinessUserRequest, context: GrpcCallContext) {
        return this.call('UpdateBusinessUser', context, (metadata) =>
            this.businessUserService.updateBusinessUser(request, metadata)
        );
    }

    async updateBusinessUserStatus(
        request: UpdateBusinessUserStatusRequest,
        context: GrpcCallContext
    ): Promise<void> {
        await this.call('UpdateBusinessUserStatus', context, (metadata) =>
            this.businessUserService.updateBusinessUserStatus(request, metadata)
        );
    }

    async softDeleteBusinessUser(
        request: SoftDeleteBusinessUserRequest,
        context: GrpcCallContext
    ): Promise<void> {
        await this.call('SoftDeleteBusinessUser', context, (metadata) =>
            this.businessUserService.softDeleteBusinessUser(request, metadata)
        );
    }

    async deleteBusinessUser(request: DeleteBusinessUserRequest, context: GrpcCallContext): Promise<void> {
        await this.call('DeleteBusinessUser', context, (metadata) =>
            this.businessUserService.deleteBusinessUser(request, metadata)
        );
    }

    async resetBusinessUserPassword(
        request: ResetBusinessUserPasswordRequest,
        context: GrpcCallContext
    ): Promise<void> {
        await this.call('ResetBusinessUserPassword', context, (metadata) =>
            this.businessUserService.resetBusinessUserPassword(request, metadata)
        );
    }

    getRoleMenuIds(request: GetRoleMenuIdsRequest, context: GrpcCallContext) {
        return this.call('GetRoleMenuIds', context, (metadata) =>
            this.roleMenuPolicyService.getRoleMenuIds(request, metadata)
        );
    }

    assignRoleMenus(request: AssignRoleMenusRequest, context: GrpcCallContext) {
        return this.call('AssignRoleMenus', context, (metadata) =>
            this.roleMenuPolicyService.assignRoleMenus(request, metadata)
        );
    }

    removeRoleMenuPolicy(request: RemoveRoleMenuPolicyRequest, context: GrpcCallContext) {
        return this.call('RemoveRoleMenuPolicy', context, (metadata) =>
            this.roleMenuPolicyService.removeRoleMenuPolicy(request, metadata)
        );
    }

    async callTypedRbacControlPlane(
        method: AppUserAdminRpcMethod,
        payload: Record<string, unknown>,
        context: GrpcCallContext
    ): Promise<Record<string, unknown>> {
        const request = toRbacGrpcRequest(payload);
        const invoke = this.resolveRbacInvoker(method);
        return await this.call<Record<string, unknown>>(method, context, (metadata) => invoke(request, metadata));
    }

    async callTypedAbacControlPlane(
        method: AppUserAdminAbacRpcMethod,
        payload: Record<string, unknown>,
        context: GrpcCallContext
    ): Promise<Record<string, unknown>> {
        const response = await this.call<{ json: string }>(method, context, (metadata) => {
            switch (method) {
                case 'GetAbacHealth':
                    return this.abacService.getAbacHealth({}, metadata);
                case 'GetAbacFields':
                    return this.abacService.getAbacFields({}, metadata);
                case 'ListAbacFieldRegistry':
                    return this.abacService.listAbacFieldRegistry(toJsonControlPlaneRequest(payload), metadata);
                case 'UpsertAbacField':
                    return this.abacService.upsertAbacField(toJsonControlPlaneRequest(payload), metadata);
                case 'DeleteAbacField':
                    return this.abacService.deleteAbacField({ id: String(payload.id ?? '') }, metadata);
                case 'ListAbacRbacPermissionOptions':
                    return this.abacService.listAbacRbacPermissionOptions(toJsonControlPlaneRequest(payload), metadata);
                case 'ListAbacPolicyGroups':
                    return this.abacService.listAbacPolicyGroups({}, metadata);
                case 'UpsertAbacPolicyGroup':
                    return this.abacService.upsertAbacPolicyGroup(toJsonControlPlaneRequest(payload), metadata);
                case 'DeleteAbacPolicyGroup':
                    return this.abacService.deleteAbacPolicyGroup({ id: String(payload.id ?? '') }, metadata);
                case 'ListAbacManualPolicies':
                    return this.abacService.listAbacManualPolicies({}, metadata);
                case 'ValidateAbacManualPolicy':
                    return this.abacService.validateAbacManualPolicy(toJsonControlPlaneRequest(payload), metadata);
                case 'UpsertAbacManualPolicy':
                    return this.abacService.upsertAbacManualPolicy(toJsonControlPlaneRequest(payload), metadata);
                case 'DeleteAbacManualPolicy':
                    return this.abacService.deleteAbacManualPolicy({ id: String(payload.id ?? '') }, metadata);
                case 'PreviewAbacCompile':
                    return this.abacService.previewAbacCompile({}, metadata);
                case 'PreviewAbacPublish':
                    return this.abacService.previewAbacPublish(toJsonControlPlaneRequest(payload), metadata);
                case 'PublishAbac':
                    return this.abacService.publishAbac(toJsonControlPlaneRequest(payload), metadata);
                case 'GetAbacReleases':
                    return this.abacService.getAbacReleases({}, metadata);
                case 'RollbackAbacRelease':
                    return this.abacService.rollbackAbacRelease({ revision: String(payload.revision ?? '') }, metadata);
                case 'TestAbacRuntime':
                    return this.abacService.testAbacRuntime(toJsonControlPlaneRequest(payload), metadata);
                default:
                    throw new HttpException(
                        {
                            code: HttpStatus.BAD_GATEWAY,
                            message: 'app-api ABAC gRPC 方法未注册',
                            data: {
                                upstream: 'app-api',
                                method
                            }
                        },
                        HttpStatus.BAD_GATEWAY
                    );
            }
        });
        return parseJsonControlPlaneResponse(response);
    }

    private resolveRbacInvoker(method: AppUserAdminRpcMethod): RbacGrpcInvoker {
        switch (method) {
            case 'ListRbacRoles':
                return (request, metadata) => this.rbacRoleService.listRbacRoles(request, metadata);
            case 'GetRbacRoleRelations':
                return (request, metadata) => this.rbacRoleService.getRbacRoleRelations(request, metadata);
            case 'QueryRbacRoleAssignableUsers':
                return (request, metadata) => this.rbacRoleService.queryRbacRoleAssignableUsers(request, metadata);
            case 'QueryRbacRoleAssignableUserGroups':
                return (request, metadata) => this.rbacRoleService.queryRbacRoleAssignableUserGroups(request, metadata);
            case 'QueryRbacRoleAssignableParentRoles':
                return (request, metadata) =>
                    this.rbacRoleService.queryRbacRoleAssignableParentRoles(request, metadata);
            case 'QueryRbacRoleAssignablePermissions':
                return (request, metadata) =>
                    this.rbacRoleService.queryRbacRoleAssignablePermissions(request, metadata);
            case 'QueryRbacRoleEffectiveUsers':
                return (request, metadata) => this.rbacRoleService.queryRbacRoleEffectiveUsers(request, metadata);
            case 'CreateRbacRole':
                return (request, metadata) => this.rbacRoleService.createRbacRole(request, metadata);
            case 'UpdateRbacRole':
                return (request, metadata) => this.rbacRoleService.updateRbacRole(request, metadata);
            case 'DeleteRbacRole':
                return (request, metadata) => this.rbacRoleService.deleteRbacRole(request, metadata);
            case 'AssignRbacRoleUsers':
                return (request, metadata) => this.rbacRoleService.assignRbacRoleUsers(request, metadata);
            case 'AssignRbacRoleUserGroups':
                return (request, metadata) => this.rbacRoleService.assignRbacRoleUserGroups(request, metadata);
            case 'AssignRbacRoleParentRoles':
                return (request, metadata) => this.rbacRoleService.assignRbacRoleParentRoles(request, metadata);
            case 'AssignRbacRolePermissions':
                return (request, metadata) => this.rbacRoleService.assignRbacRolePermissions(request, metadata);
            case 'ListRbacUserGroups':
                return (request, metadata) => this.rbacUserGroupService.listRbacUserGroups(request, metadata);
            case 'GetRbacUserGroupRelations':
                return (request, metadata) => this.rbacUserGroupService.getRbacUserGroupRelations(request, metadata);
            case 'QueryRbacUserGroupMembers':
                return (request, metadata) => this.rbacUserGroupService.queryRbacUserGroupMembers(request, metadata);
            case 'QueryRbacUserGroupRoles':
                return (request, metadata) => this.rbacUserGroupService.queryRbacUserGroupRoles(request, metadata);
            case 'QueryRbacUserGroupMenus':
                return (request, metadata) => this.rbacUserGroupService.queryRbacUserGroupMenus(request, metadata);
            case 'CreateRbacUserGroup':
                return (request, metadata) => this.rbacUserGroupService.createRbacUserGroup(request, metadata);
            case 'UpdateRbacUserGroup':
                return (request, metadata) => this.rbacUserGroupService.updateRbacUserGroup(request, metadata);
            case 'DeleteRbacUserGroup':
                return (request, metadata) => this.rbacUserGroupService.deleteRbacUserGroup(request, metadata);
            case 'AssignRbacUserGroupMembers':
                return (request, metadata) => this.rbacUserGroupService.assignRbacUserGroupMembers(request, metadata);
            case 'AssignRbacUserGroupRoles':
                return (request, metadata) => this.rbacUserGroupService.assignRbacUserGroupRoles(request, metadata);
            case 'ListRbacPermissions':
                return (request, metadata) => this.rbacPermissionService.listRbacPermissions(request, metadata);
            case 'GetRbacPermissionDeclarationBoard':
                return (_request, metadata) =>
                    this.rbacPermissionService.getRbacPermissionDeclarationBoard({}, metadata);
            case 'SuggestRbacPermissionCode':
                return (request, metadata) => this.rbacPermissionService.suggestRbacPermissionCode(request, metadata);
            case 'CreateRbacPermission':
                return (request, metadata) => this.rbacPermissionService.createRbacPermission(request, metadata);
            case 'UpdateRbacPermission':
                return (request, metadata) => this.rbacPermissionService.updateRbacPermission(request, metadata);
            case 'DeleteRbacPermission':
                return (request, metadata) => this.rbacPermissionService.deleteRbacPermission(request, metadata);
            case 'GetRbacPermissionRelations':
                return (request, metadata) => this.rbacPermissionService.getRbacPermissionRelations(request, metadata);
            case 'QueryRbacPermissionRoles':
                return (request, metadata) => this.rbacPermissionService.queryRbacPermissionRoles(request, metadata);
            case 'AssignRbacPermissionRoles':
                return (request, metadata) => this.rbacPermissionService.assignRbacPermissionRoles(request, metadata);
            case 'ListRbacPermissionGroups':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.listRbacPermissionGroups(request, metadata);
            case 'CreateRbacPermissionGroup':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.createRbacPermissionGroup(request, metadata);
            case 'UpdateRbacPermissionGroup':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.updateRbacPermissionGroup(request, metadata);
            case 'DeleteRbacPermissionGroup':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.deleteRbacPermissionGroup(request, metadata);
            case 'GetRbacPermissionGroupRelations':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.getRbacPermissionGroupRelations(request, metadata);
            case 'AssignRbacPermissionGroupRelations':
                return (request, metadata) =>
                    this.rbacPermissionGroupService.assignRbacPermissionGroupRelations(request, metadata);
            case 'ListRbacMenuTree':
                return (request, metadata) => this.rbacMenuService.listRbacMenuTree(request, metadata);
            case 'ListRbacMenus':
                return (request, metadata) => this.rbacMenuService.listRbacMenus(request, metadata);
            case 'GetRbacMenuDetail':
                return (request, metadata) => this.rbacMenuService.getRbacMenuDetail(request, metadata);
            case 'CreateRbacMenu':
                return (request, metadata) => this.rbacMenuService.createRbacMenu(request, metadata);
            case 'UpdateRbacMenu':
                return (request, metadata) => this.rbacMenuService.updateRbacMenu(request, metadata);
            case 'DeleteRbacMenu':
                return (request, metadata) => this.rbacMenuService.deleteRbacMenu(request, metadata);
            default:
                throw new HttpException(
                    {
                        code: HttpStatus.BAD_GATEWAY,
                        message: 'app-api RBAC gRPC 方法未注册',
                        data: {
                            upstream: 'app-api',
                            method
                        }
                    },
                    HttpStatus.BAD_GATEWAY
                );
        }
    }

    private async call<T>(
        method: AppUserAdminRpcMethod,
        context: GrpcCallContext,
        invoke: (metadata: ReturnType<typeof createGrpcRequestMetadata>) => Observable<T>
    ): Promise<T> {
        const metadata = createGrpcRequestMetadata({
            requestId: context.requestId ?? ulid(),
            sourceApp: 'admin-api',
            targetRpcMethod: method,
            actorId: context.actor.id,
            actorName: context.actor.name ?? undefined,
            reason: context.reason,
            scopes: [APP_USER_ADMIN_RPC_SCOPE_MAP[method]]
        });

        try {
            return await firstValueFrom(invoke(metadata));
        } catch (error) {
            this.rethrowGrpcError(error, method);
        }
    }

    private rethrowGrpcError(error: unknown, method: AppUserAdminRpcMethod): never {
        const payload = parseGrpcErrorPayload(error);
        if (payload) {
            if (payload.category === 'business') {
                throw new BusinessException(
                    { code: payload.code, message: payload.message },
                    { upstream: 'app-api', method }
                );
            }

            throw new HttpException(
                {
                    code: payload.code,
                    message: payload.message,
                    data: {
                        ...(payload.data ?? {}),
                        upstream: 'app-api',
                        grpcStatus: payload.grpcStatus,
                        method
                    }
                },
                payload.httpStatus
            );
        }

        throw new HttpException(
            {
                code: HttpStatus.BAD_GATEWAY,
                message: '调用 app-api 管理接口失败',
                data: {
                    upstream: 'app-api',
                    method,
                    reason: error instanceof Error ? error.message : String(error)
                }
            },
            HttpStatus.BAD_GATEWAY
        );
    }
}

export type BusinessUserListResponse = ListBusinessUsersResponse;
export type BusinessUserMessage = UserMessage;
export type BusinessRoleListResponse = ListBusinessRolesResponse;
export type SuccessResponseMessage = SuccessResponse;

function toJsonControlPlaneRequest(payload: Record<string, unknown>): { json: string } {
    return {
        json: JSON.stringify(payload ?? {})
    };
}

function parseJsonControlPlaneResponse(response: { json?: string }): Record<string, unknown> {
    if (!response.json) {
        return {};
    }
    const parsed = JSON.parse(response.json) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}
