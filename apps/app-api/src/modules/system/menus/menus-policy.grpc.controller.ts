import type { AssignRoleMenusRequest, GetRoleMenuIdsRequest, RemoveRoleMenuPolicyRequest } from '@app/common';
import { APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME, type AppUserAdminRpcMethod } from '@app/common';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminControlPlaneAccessService } from '../../app-user-admin/admin-control-plane-access.service';
import { SystemMenusPolicyService } from './menus-policy.service';

@Controller()
export class SystemMenusPolicyGrpcController {
    constructor(
        private readonly menuPolicyService: SystemMenusPolicyService,
        private readonly controlPlaneAccessService: AdminControlPlaneAccessService
    ) {}

    private assertAccess(method: AppUserAdminRpcMethod, metadata: unknown): void {
        this.controlPlaneAccessService.assertRpcAccess(method, metadata);
    }

    /** 获取角色当前可见的菜单 ID 列表。 */
    @GrpcMethod(APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME, 'GetRoleMenuIds')
    async getRoleMenuIds(request: GetRoleMenuIdsRequest, metadata?: unknown) {
        this.assertAccess('GetRoleMenuIds', metadata);
        const values = await this.menuPolicyService.getRoleMenuIds(request.roleCode);
        return { values };
    }

    /** 为角色保存菜单配置。 */
    @GrpcMethod(APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME, 'AssignRoleMenus')
    async assignRoleMenus(request: AssignRoleMenusRequest, metadata?: unknown) {
        this.assertAccess('AssignRoleMenus', metadata);
        await this.menuPolicyService.assignMenusByIds(request.roleCode, request.menuIds);
        return { success: true };
    }

    /** 清理角色菜单配置。 */
    @GrpcMethod(APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME, 'RemoveRoleMenuPolicy')
    async removeRoleMenuPolicy(request: RemoveRoleMenuPolicyRequest, metadata?: unknown) {
        this.assertAccess('RemoveRoleMenuPolicy', metadata);
        await this.menuPolicyService.removeRoleFromPolicy(request.roleCode);
        return { success: true };
    }
}
