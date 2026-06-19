import type {
    CreateBusinessUserRequest,
    DeleteBusinessUserRequest,
    GetBusinessUserRequest,
    GetBusinessUserRoleIdsRequest,
    ListBusinessUsersRequest,
    ResetBusinessUserPasswordRequest,
    SoftDeleteBusinessUserRequest,
    UpdateBusinessUserRequest,
    UpdateBusinessUserStatusRequest
} from '@app/common';
import { APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, type AppUserAdminRpcMethod } from '@app/common';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminControlPlaneAccessService } from '../../app-user-admin/admin-control-plane-access.service';
import { SystemUsersAdminService } from './users-admin.service';
import type { AdminControlPlaneContext } from '../../app-user-admin/admin-control-plane-access.service';

@Controller()
export class SystemUsersAdminGrpcController {
    constructor(
        private readonly userAdminService: SystemUsersAdminService,
        private readonly controlPlaneAccessService: AdminControlPlaneAccessService
    ) {}

    private assertAccess(method: AppUserAdminRpcMethod, metadata: unknown): AdminControlPlaneContext {
        return this.controlPlaneAccessService.assertRpcAccess(method, metadata);
    }

    /** 处理业务用户列表查询 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'ListBusinessUsers')
    async listBusinessUsers(request: ListBusinessUsersRequest, metadata?: unknown) {
        this.assertAccess('ListBusinessUsers', metadata);
        return await this.userAdminService.listBusinessUsers(request);
    }

    /** 处理业务角色列表查询 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'ListBusinessRoles')
    async listBusinessRoles(_request: Record<string, never>, metadata?: unknown) {
        this.assertAccess('ListBusinessRoles', metadata);
        return await this.userAdminService.listBusinessRoles();
    }

    /** 处理业务用户详情查询 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'GetBusinessUser')
    async getBusinessUser(request: GetBusinessUserRequest, metadata?: unknown) {
        this.assertAccess('GetBusinessUser', metadata);
        return await this.userAdminService.getBusinessUser(request);
    }

    /** 处理业务用户角色列表查询 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'GetBusinessUserRoleIds')
    async getBusinessUserRoleIds(request: GetBusinessUserRoleIdsRequest, metadata?: unknown) {
        this.assertAccess('GetBusinessUserRoleIds', metadata);
        return await this.userAdminService.getBusinessUserRoleIds(request);
    }

    /** 处理业务用户创建 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'CreateBusinessUser')
    async createBusinessUser(request: CreateBusinessUserRequest, metadata?: unknown) {
        const context = this.assertAccess('CreateBusinessUser', metadata);
        return await this.userAdminService.createBusinessUser(request, context.actorId);
    }

    /** 处理业务用户更新 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'UpdateBusinessUser')
    async updateBusinessUser(request: UpdateBusinessUserRequest, metadata?: unknown) {
        const context = this.assertAccess('UpdateBusinessUser', metadata);
        return await this.userAdminService.updateBusinessUser(request, context.actorId);
    }

    /** 处理业务用户状态更新 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'UpdateBusinessUserStatus')
    async updateBusinessUserStatus(request: UpdateBusinessUserStatusRequest, metadata?: unknown) {
        this.assertAccess('UpdateBusinessUserStatus', metadata);
        await this.userAdminService.updateBusinessUserStatus(request);
        return {};
    }

    /** 处理业务用户软删除 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'SoftDeleteBusinessUser')
    async softDeleteBusinessUser(request: SoftDeleteBusinessUserRequest, metadata?: unknown) {
        this.assertAccess('SoftDeleteBusinessUser', metadata);
        await this.userAdminService.softDeleteBusinessUser(request);
        return {};
    }

    /** 处理业务用户真实删除 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'DeleteBusinessUser')
    async deleteBusinessUser(request: DeleteBusinessUserRequest, metadata?: unknown) {
        this.assertAccess('DeleteBusinessUser', metadata);
        await this.userAdminService.deleteBusinessUser(request);
        return {};
    }

    /** 处理业务用户密码重置 RPC。 */
    @GrpcMethod(APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME, 'ResetBusinessUserPassword')
    async resetBusinessUserPassword(request: ResetBusinessUserPasswordRequest, metadata?: unknown) {
        this.assertAccess('ResetBusinessUserPassword', metadata);
        await this.userAdminService.resetBusinessUserPassword(request);
        return {};
    }
}
