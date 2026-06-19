import {
    APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME,
    APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME,
    fromRbacGrpcRequest,
    toRbacGrpcResponse,
    type AppUserAdminRpcMethod
} from '@app/common';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminControlPlaneAccessService } from '../admin-control-plane-access.service';
import { RbacAdminControlPlaneService } from './rbac-admin-control-plane.service';

type RbacGrpcRequest = Record<string, unknown>;

@Controller()
export class RbacAdminGrpcController {
    constructor(
        private readonly rbacAdminService: RbacAdminControlPlaneService,
        private readonly controlPlaneAccessService: AdminControlPlaneAccessService
    ) {}

    private async handle(method: AppUserAdminRpcMethod, request: RbacGrpcRequest, metadata?: unknown) {
        const context = this.controlPlaneAccessService.assertRpcAccess(method, metadata);
        const result = await this.rbacAdminService.handle(method, fromRbacGrpcRequest(request), context.actorId);
        return toRbacGrpcResponse(result);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'ListRbacRoles')
    listRbacRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'GetRbacRoleRelations')
    getRbacRoleRelations(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacRoleRelations', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacRoleAssignableUsers')
    queryRbacRoleAssignableUsers(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacRoleAssignableUsers', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacRoleAssignableUserGroups')
    queryRbacRoleAssignableUserGroups(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacRoleAssignableUserGroups', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacRoleAssignableParentRoles')
    queryRbacRoleAssignableParentRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacRoleAssignableParentRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacRoleAssignablePermissions')
    queryRbacRoleAssignablePermissions(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacRoleAssignablePermissions', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacRoleEffectiveUsers')
    queryRbacRoleEffectiveUsers(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacRoleEffectiveUsers', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'CreateRbacRole')
    createRbacRole(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('CreateRbacRole', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'UpdateRbacRole')
    updateRbacRole(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('UpdateRbacRole', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'DeleteRbacRole')
    deleteRbacRole(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('DeleteRbacRole', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacRoleUsers')
    assignRbacRoleUsers(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacRoleUsers', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacRoleUserGroups')
    assignRbacRoleUserGroups(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacRoleUserGroups', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacRoleParentRoles')
    assignRbacRoleParentRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacRoleParentRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacRolePermissions')
    assignRbacRolePermissions(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacRolePermissions', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'ListRbacUserGroups')
    listRbacUserGroups(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacUserGroups', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'GetRbacUserGroupRelations')
    getRbacUserGroupRelations(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacUserGroupRelations', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacUserGroupMembers')
    queryRbacUserGroupMembers(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacUserGroupMembers', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacUserGroupRoles')
    queryRbacUserGroupRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacUserGroupRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacUserGroupMenus')
    queryRbacUserGroupMenus(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacUserGroupMenus', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'CreateRbacUserGroup')
    createRbacUserGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('CreateRbacUserGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'UpdateRbacUserGroup')
    updateRbacUserGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('UpdateRbacUserGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'DeleteRbacUserGroup')
    deleteRbacUserGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('DeleteRbacUserGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacUserGroupMembers')
    assignRbacUserGroupMembers(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacUserGroupMembers', request, metadata);
    }

    @GrpcMethod(APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacUserGroupRoles')
    assignRbacUserGroupRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacUserGroupRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'ListRbacPermissions')
    listRbacPermissions(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacPermissions', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'GetRbacPermissionDeclarationBoard')
    getRbacPermissionDeclarationBoard(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacPermissionDeclarationBoard', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'SuggestRbacPermissionCode')
    suggestRbacPermissionCode(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('SuggestRbacPermissionCode', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'CreateRbacPermission')
    createRbacPermission(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('CreateRbacPermission', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'UpdateRbacPermission')
    updateRbacPermission(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('UpdateRbacPermission', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'DeleteRbacPermission')
    deleteRbacPermission(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('DeleteRbacPermission', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'GetRbacPermissionRelations')
    getRbacPermissionRelations(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacPermissionRelations', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'QueryRbacPermissionRoles')
    queryRbacPermissionRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('QueryRbacPermissionRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacPermissionRoles')
    assignRbacPermissionRoles(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacPermissionRoles', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'ListRbacPermissionGroups')
    listRbacPermissionGroups(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacPermissionGroups', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'CreateRbacPermissionGroup')
    createRbacPermissionGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('CreateRbacPermissionGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'UpdateRbacPermissionGroup')
    updateRbacPermissionGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('UpdateRbacPermissionGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'DeleteRbacPermissionGroup')
    deleteRbacPermissionGroup(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('DeleteRbacPermissionGroup', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'GetRbacPermissionGroupRelations')
    getRbacPermissionGroupRelations(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacPermissionGroupRelations', request, metadata);
    }

    @GrpcMethod(APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME, 'AssignRbacPermissionGroupRelations')
    assignRbacPermissionGroupRelations(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('AssignRbacPermissionGroupRelations', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'ListRbacMenuTree')
    listRbacMenuTree(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacMenuTree', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'ListRbacMenus')
    listRbacMenus(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('ListRbacMenus', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'GetRbacMenuDetail')
    getRbacMenuDetail(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('GetRbacMenuDetail', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'CreateRbacMenu')
    createRbacMenu(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('CreateRbacMenu', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'UpdateRbacMenu')
    updateRbacMenu(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('UpdateRbacMenu', request, metadata);
    }

    @GrpcMethod(APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME, 'DeleteRbacMenu')
    deleteRbacMenu(request: RbacGrpcRequest, metadata?: unknown) {
        return this.handle('DeleteRbacMenu', request, metadata);
    }
}
