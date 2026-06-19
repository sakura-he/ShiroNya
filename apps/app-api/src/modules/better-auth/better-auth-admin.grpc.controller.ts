import type {
    BanAdminUserRequest,
    CheckAdminUserPermissionRequest,
    CreateAdminUserRequest,
    GetAdminUserRequest,
    ImpersonateAdminUserRequest,
    ListAdminUserSessionsRequest,
    ListAdminUsersRequest,
    RemoveAdminUserRequest,
    RevokeAdminUserSessionRequest,
    RevokeAdminUserSessionsRequest,
    SetAdminUserPasswordRequest,
    StopImpersonatingAdminUserRequest,
    UnbanAdminUserRequest,
    UpdateAdminUserRequest
} from '@app/common';
import { APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, type AppUserAdminRpcMethod } from '@app/common';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminControlPlaneAccessService } from '../app-user-admin/admin-control-plane-access.service';
import { BetterAuthAdminService } from './better-auth-admin.service';

@Controller()
export class BetterAuthAdminGrpcController {
    constructor(
        private readonly betterAuthAdminService: BetterAuthAdminService,
        private readonly controlPlaneAccessService: AdminControlPlaneAccessService
    ) {}

    private assertAccess(method: AppUserAdminRpcMethod, metadata: unknown): void {
        this.controlPlaneAccessService.assertRpcAccess(method, metadata);
    }

    /** 处理 admin 用户列表 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'ListAdminUsers')
    async listAdminUsers(request: ListAdminUsersRequest, metadata?: unknown) {
        this.assertAccess('ListAdminUsers', metadata);
        return await this.betterAuthAdminService.listAdminUsers(request);
    }

    /** 处理 admin 用户详情 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'GetAdminUser')
    async getAdminUser(request: GetAdminUserRequest, metadata?: unknown) {
        this.assertAccess('GetAdminUser', metadata);
        return await this.betterAuthAdminService.getAdminUser(request);
    }

    /** 处理 admin 用户创建 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'CreateAdminUser')
    async createAdminUser(request: CreateAdminUserRequest, metadata?: unknown) {
        this.assertAccess('CreateAdminUser', metadata);
        return await this.betterAuthAdminService.createAdminUser(request);
    }

    /** 处理 admin 用户更新 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'UpdateAdminUser')
    async updateAdminUser(request: UpdateAdminUserRequest, metadata?: unknown) {
        this.assertAccess('UpdateAdminUser', metadata);
        return await this.betterAuthAdminService.updateAdminUser(request);
    }

    /** 处理 admin 用户封禁 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'BanAdminUser')
    async banAdminUser(request: BanAdminUserRequest, metadata?: unknown) {
        this.assertAccess('BanAdminUser', metadata);
        return await this.betterAuthAdminService.banAdminUser(request);
    }

    /** 处理 admin 用户解封 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'UnbanAdminUser')
    async unbanAdminUser(request: UnbanAdminUserRequest, metadata?: unknown) {
        this.assertAccess('UnbanAdminUser', metadata);
        return await this.betterAuthAdminService.unbanAdminUser(request);
    }

    /** 处理 admin 用户会话列表 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'ListAdminUserSessions')
    async listAdminUserSessions(request: ListAdminUserSessionsRequest, metadata?: unknown) {
        this.assertAccess('ListAdminUserSessions', metadata);
        return await this.betterAuthAdminService.listAdminUserSessions(request);
    }

    /** 处理 admin 伪装用户 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'ImpersonateAdminUser')
    async impersonateAdminUser(request: ImpersonateAdminUserRequest, metadata?: unknown) {
        this.assertAccess('ImpersonateAdminUser', metadata);
        return await this.betterAuthAdminService.impersonateAdminUser(request);
    }

    /** 处理停止伪装 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'StopImpersonatingAdminUser')
    async stopImpersonatingAdminUser(request: StopImpersonatingAdminUserRequest, metadata?: unknown) {
        this.assertAccess('StopImpersonatingAdminUser', metadata);
        return await this.betterAuthAdminService.stopImpersonatingAdminUser(request);
    }

    /** 处理单会话撤销 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'RevokeAdminUserSession')
    async revokeAdminUserSession(request: RevokeAdminUserSessionRequest, metadata?: unknown) {
        this.assertAccess('RevokeAdminUserSession', metadata);
        return await this.betterAuthAdminService.revokeAdminUserSession(request);
    }

    /** 处理全会话撤销 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'RevokeAdminUserSessions')
    async revokeAdminUserSessions(request: RevokeAdminUserSessionsRequest, metadata?: unknown) {
        this.assertAccess('RevokeAdminUserSessions', metadata);
        return await this.betterAuthAdminService.revokeAdminUserSessions(request);
    }

    /** 处理删除 admin 用户 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'RemoveAdminUser')
    async removeAdminUser(request: RemoveAdminUserRequest, metadata?: unknown) {
        this.assertAccess('RemoveAdminUser', metadata);
        return await this.betterAuthAdminService.removeAdminUser(request);
    }

    /** 处理设置 admin 用户密码 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'SetAdminUserPassword')
    async setAdminUserPassword(request: SetAdminUserPasswordRequest, metadata?: unknown) {
        this.assertAccess('SetAdminUserPassword', metadata);
        return await this.betterAuthAdminService.setAdminUserPassword(request);
    }

    /** 处理 admin 权限检查 RPC。 */
    @GrpcMethod(APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME, 'CheckAdminUserPermission')
    async checkAdminUserPermission(request: CheckAdminUserPermissionRequest, metadata?: unknown) {
        this.assertAccess('CheckAdminUserPermission', metadata);
        return await this.betterAuthAdminService.checkAdminUserPermission(request);
    }
}
