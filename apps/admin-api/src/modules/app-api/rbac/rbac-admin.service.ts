import type { AppUserAdminRpcMethod } from '@app/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RbacAuthorizationService } from '../../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../../system/rbac/rbac-permissions';
import { UserAdminGrpcClient, type ControlPlaneActor } from '../user/user-admin.grpc-client';

type RbacProxyPayload = Record<string, any>;
type RbacProxyResponse = Record<string, unknown>;

function asRecords(value: unknown): RbacProxyPayload[] {
    return Array.isArray(value) ? (value as RbacProxyPayload[]) : [];
}

@Injectable()
export class RbacAdminService {
    constructor(
        private readonly grpcClient: UserAdminGrpcClient,
        private readonly rbacAuthorizationService: RbacAuthorizationService
    ) {}

    async handleRoleAction(action: string, payload: RbacProxyPayload, actor: ControlPlaneActor, requestId?: string) {
        switch (action) {
            case 'query_role_list':
                return await this.withRoleListCapabilities(
                    await this.call('ListRbacRoles', payload, actor, requestId),
                    actor.id
                );
            case 'get_role_relations':
                return await this.withRoleRelationsCapabilities(
                    await this.call('GetRbacRoleRelations', payload, actor, requestId),
                    actor.id
                );
            case 'query_assignable_users':
                return await this.call('QueryRbacRoleAssignableUsers', payload, actor, requestId);
            case 'query_assignable_user_groups':
                return await this.call('QueryRbacRoleAssignableUserGroups', payload, actor, requestId);
            case 'query_relation_parent_roles':
                return await this.call('QueryRbacRoleAssignableParentRoles', payload, actor, requestId);
            case 'query_relation_permissions':
                return await this.call('QueryRbacRoleAssignablePermissions', payload, actor, requestId);
            case 'query_effective_users':
                return await this.call('QueryRbacRoleEffectiveUsers', payload, actor, requestId);
            case 'create_role':
                return this.decorateRole(
                    await this.call('CreateRbacRole', payload, actor, requestId),
                    await this.getRoleCapabilities(actor.id)
                );
            case 'update_role':
                return this.decorateRole(
                    await this.call('UpdateRbacRole', payload, actor, requestId),
                    await this.getRoleCapabilities(actor.id)
                );
            case 'delete_role':
                return await this.call('DeleteRbacRole', payload, actor, requestId);
            case 'assign_users':
                return await this.call('AssignRbacRoleUsers', payload, actor, requestId);
            case 'assign_user_groups':
                return await this.call('AssignRbacRoleUserGroups', payload, actor, requestId);
            case 'assign_parent_roles':
                return await this.call('AssignRbacRoleParentRoles', payload, actor, requestId);
            case 'assign_permissions':
                return await this.call('AssignRbacRolePermissions', payload, actor, requestId);
            default:
                throw this.notFound(action);
        }
    }

    async handleUserGroupAction(
        action: string,
        payload: RbacProxyPayload,
        actor: ControlPlaneActor,
        requestId?: string
    ) {
        switch (action) {
            case 'query_user_group_list':
                return await this.withUserGroupListCapabilities(
                    await this.call('ListRbacUserGroups', payload, actor, requestId),
                    actor.id
                );
            case 'relations':
                return await this.withUserGroupRelationsCapabilities(
                    await this.call('GetRbacUserGroupRelations', payload, actor, requestId),
                    actor.id
                );
            case 'query_relation_members':
                return await this.call('QueryRbacUserGroupMembers', payload, actor, requestId);
            case 'query_relation_roles':
                return await this.call('QueryRbacUserGroupRoles', payload, actor, requestId);
            case 'query_relation_menus':
                return await this.call('QueryRbacUserGroupMenus', payload, actor, requestId);
            case 'create_user_group':
                return this.decorateUserGroup(
                    await this.call('CreateRbacUserGroup', payload, actor, requestId),
                    await this.getUserGroupCapabilities(actor.id)
                );
            case 'update_user_group':
                return this.decorateUserGroup(
                    await this.call('UpdateRbacUserGroup', payload, actor, requestId),
                    await this.getUserGroupCapabilities(actor.id)
                );
            case 'delete_user_group':
                return await this.call('DeleteRbacUserGroup', payload, actor, requestId);
            case 'assign_members':
                return await this.withUserGroupRelationsCapabilities(
                    await this.call('AssignRbacUserGroupMembers', payload, actor, requestId),
                    actor.id
                );
            case 'assign_roles':
                return await this.withUserGroupRelationsCapabilities(
                    await this.call('AssignRbacUserGroupRoles', payload, actor, requestId),
                    actor.id
                );
            default:
                throw this.notFound(action);
        }
    }

    async handlePermissionAction(
        action: string,
        payload: RbacProxyPayload,
        actor: ControlPlaneActor,
        requestId?: string
    ) {
        switch (action) {
            case 'query_permission_list':
                return await this.withPermissionListCapabilities(
                    await this.call('ListRbacPermissions', payload, actor, requestId),
                    actor.id
                );
            case 'declaration_board':
                return await this.withPermissionBoardCapabilities(
                    await this.call('GetRbacPermissionDeclarationBoard', payload, actor, requestId),
                    actor.id
                );
            case 'suggest_code':
                return await this.call('SuggestRbacPermissionCode', payload, actor, requestId);
            case 'create_permission':
                return this.decoratePermission(
                    await this.call('CreateRbacPermission', payload, actor, requestId),
                    await this.getPermissionCapabilities(actor.id)
                );
            case 'update_permission':
                return this.decoratePermission(
                    await this.call('UpdateRbacPermission', payload, actor, requestId),
                    await this.getPermissionCapabilities(actor.id)
                );
            case 'delete_permission':
                return await this.call('DeleteRbacPermission', payload, actor, requestId);
            case 'relations':
                return await this.withPermissionRelationsCapabilities(
                    await this.call('GetRbacPermissionRelations', payload, actor, requestId),
                    actor.id
                );
            case 'query_relation_roles':
                return await this.call('QueryRbacPermissionRoles', payload, actor, requestId);
            case 'assign_roles':
                return await this.call('AssignRbacPermissionRoles', payload, actor, requestId);
            default:
                throw this.notFound(action);
        }
    }

    async handlePermissionGroupAction(
        action: string,
        payload: RbacProxyPayload,
        actor: ControlPlaneActor,
        requestId?: string
    ) {
        switch (action) {
            case 'query_permission_group_list':
                return await this.withPermissionGroupListCapabilities(
                    await this.call('ListRbacPermissionGroups', payload, actor, requestId),
                    actor.id
                );
            case 'create_group':
                return this.decoratePermissionGroup(
                    await this.call('CreateRbacPermissionGroup', payload, actor, requestId),
                    await this.getPermissionGroupCapabilities(actor.id)
                );
            case 'update_group':
                return this.decoratePermissionGroup(
                    await this.call('UpdateRbacPermissionGroup', payload, actor, requestId),
                    await this.getPermissionGroupCapabilities(actor.id)
                );
            case 'delete_group':
                return await this.call('DeleteRbacPermissionGroup', payload, actor, requestId);
            case 'relations':
                return await this.withPermissionGroupRelationsCapabilities(
                    await this.call('GetRbacPermissionGroupRelations', payload, actor, requestId),
                    actor.id
                );
            case 'assign_relations':
                return await this.withPermissionGroupRelationsCapabilities(
                    await this.call('AssignRbacPermissionGroupRelations', payload, actor, requestId),
                    actor.id
                );
            default:
                throw this.notFound(action);
        }
    }

    async handleMenuAction(action: string, payload: RbacProxyPayload, actor: ControlPlaneActor, requestId?: string) {
        switch (action) {
            case 'list':
            case 'tree':
                return await this.withMenuListCapabilities(
                    await this.call('ListRbacMenuTree', payload, actor, requestId),
                    actor.id
                );
            case 'pagedList':
                return await this.withMenuListCapabilities(
                    await this.call('ListRbacMenus', payload, actor, requestId),
                    actor.id
                );
            case 'detail':
                return await this.withMenuDetailCapabilities(
                    await this.call('GetRbacMenuDetail', payload, actor, requestId),
                    actor.id
                );
            case 'create':
                return this.decorateMenu(
                    await this.call('CreateRbacMenu', payload, actor, requestId),
                    await this.getMenuCapabilities(actor.id)
                );
            case 'update':
                return this.decorateMenu(
                    await this.call('UpdateRbacMenu', payload, actor, requestId),
                    await this.getMenuCapabilities(actor.id)
                );
            case 'delete':
                return await this.call('DeleteRbacMenu', payload, actor, requestId);
            default:
                throw this.notFound(action);
        }
    }

    private async call(
        method: AppUserAdminRpcMethod,
        payload: RbacProxyPayload,
        actor: ControlPlaneActor,
        requestId?: string
    ) {
        return await this.grpcClient.callTypedRbacControlPlane(method, payload, {
            actor,
            requestId,
            reason: `manage app-api RBAC via ${method}`
        });
    }

    private notFound(action: string): HttpException {
        return new HttpException(
            { code: HttpStatus.NOT_FOUND, message: `app-api RBAC 管理接口不存在: ${action}` },
            HttpStatus.NOT_FOUND
        );
    }

    private async getRoleCapabilities(actorId: string) {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_RBAC_ROLE_CREATE,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_UPDATE,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_DELETE,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER_GROUP,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PARENT_ROLE,
            RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PERMISSION
        ]);
        return {
            viewerCanCreateRole: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_CREATE) ?? false,
            viewerCanUpdate: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_UPDATE) ?? false,
            viewerCanDelete: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_DELETE) ?? false,
            viewerCanAssignUser: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER) ?? false,
            viewerCanAssignUserGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER_GROUP) ?? false,
            viewerCanAssignParentRole: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PARENT_ROLE) ?? false,
            viewerCanAssignPermission: permissions.get(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PERMISSION) ?? false
        };
    }

    private decorateRole(record: RbacProxyPayload, capabilities: Record<string, boolean>) {
        return {
            ...record,
            viewerCanUpdate: capabilities.viewerCanUpdate,
            viewerCanDelete: capabilities.viewerCanDelete,
            viewerCanAssignUser: capabilities.viewerCanAssignUser,
            viewerCanAssignUserGroup: capabilities.viewerCanAssignUserGroup,
            viewerCanAssignParentRole: capabilities.viewerCanAssignParentRole,
            viewerCanAssignPermission: capabilities.viewerCanAssignPermission
        };
    }

    private async withRoleListCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getRoleCapabilities(actorId);
        return {
            ...this.withRecords(response, (record) => this.decorateRole(record, capabilities)),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                viewerCanCreateRole: capabilities.viewerCanCreateRole
            }
        };
    }

    private async withRoleRelationsCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getRoleCapabilities(actorId);
        return {
            ...response,
            role: response.role ? this.decorateRole(response.role as RbacProxyPayload, capabilities) : response.role
        };
    }

    private async getUserGroupCapabilities(actorId: string) {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_CREATE,
            RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_UPDATE,
            RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_DELETE,
            RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_MEMBER,
            RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_ROLE
        ]);
        return {
            viewerCanCreateUserGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_CREATE) ?? false,
            viewerCanUpdate: permissions.get(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_UPDATE) ?? false,
            viewerCanDelete: permissions.get(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_DELETE) ?? false,
            viewerCanAssignMember: permissions.get(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_MEMBER) ?? false,
            viewerCanAssignRole: permissions.get(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_ROLE) ?? false
        };
    }

    private decorateUserGroup(record: RbacProxyPayload, capabilities: Record<string, boolean>) {
        return {
            ...record,
            viewerCanUpdate: capabilities.viewerCanUpdate,
            viewerCanDelete: capabilities.viewerCanDelete,
            viewerCanAssignMember: capabilities.viewerCanAssignMember,
            viewerCanAssignRole: capabilities.viewerCanAssignRole
        };
    }

    private async withUserGroupListCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getUserGroupCapabilities(actorId);
        return {
            ...this.withRecords(response, (record) => this.decorateUserGroup(record, capabilities)),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                viewerCanCreateUserGroup: capabilities.viewerCanCreateUserGroup
            }
        };
    }

    private async withUserGroupRelationsCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getUserGroupCapabilities(actorId);
        return {
            ...response,
            group: response.group
                ? this.decorateUserGroup(response.group as RbacProxyPayload, capabilities)
                : response.group
        };
    }

    private async getPermissionCapabilities(actorId: string) {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_CREATE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_UPDATE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_DELETE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_ASSIGN_ROLE
        ]);
        return {
            viewerCanCreatePermission: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_CREATE) ?? false,
            viewerCanUpdatePermission: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_UPDATE) ?? false,
            viewerCanDeletePermission: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_DELETE) ?? false,
            viewerCanAssignRole: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_ASSIGN_ROLE) ?? false
        };
    }

    private decoratePermission(record: RbacProxyPayload, capabilities: Record<string, boolean>) {
        return {
            ...record,
            viewerCanUpdate: capabilities.viewerCanUpdatePermission,
            viewerCanDelete: capabilities.viewerCanDeletePermission && record.isBuiltin !== true,
            viewerCanAssignRole: capabilities.viewerCanAssignRole
        };
    }

    private async withPermissionListCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getPermissionCapabilities(actorId);
        return {
            ...this.withRecords(response, (record) => this.decoratePermission(record, capabilities)),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                ...capabilities
            }
        };
    }

    private async withPermissionBoardCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getPermissionCapabilities(actorId);
        return {
            ...response,
            declarations: asRecords(response.declarations).map((declaration) => ({
                ...declaration,
                permission: declaration.permission
                    ? this.decoratePermission(declaration.permission as RbacProxyPayload, capabilities)
                    : declaration.permission
            })),
            unassignedPermissions: asRecords(response.unassignedPermissions).map((record) =>
                this.decoratePermission(record, capabilities)
            ),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                ...capabilities
            }
        };
    }

    private async withPermissionRelationsCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getPermissionCapabilities(actorId);
        return {
            ...response,
            permission: response.permission
                ? this.decoratePermission(response.permission as RbacProxyPayload, capabilities)
                : response.permission
        };
    }

    private async getPermissionGroupCapabilities(actorId: string) {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_CREATE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_UPDATE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_DELETE,
            RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_ASSIGN
        ]);
        return {
            viewerCanCreateGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_CREATE) ?? false,
            viewerCanUpdateGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_UPDATE) ?? false,
            viewerCanDeleteGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_DELETE) ?? false,
            viewerCanAssignGroup: permissions.get(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_ASSIGN) ?? false
        };
    }

    private decoratePermissionGroup(record: RbacProxyPayload, capabilities: Record<string, boolean>) {
        return {
            ...record,
            viewerCanUpdate: capabilities.viewerCanUpdateGroup,
            viewerCanDelete: capabilities.viewerCanDeleteGroup,
            viewerCanAssign: capabilities.viewerCanAssignGroup
        };
    }

    private async withPermissionGroupListCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getPermissionGroupCapabilities(actorId);
        return {
            ...this.withRecords(response, (record) => this.decoratePermissionGroup(record, capabilities)),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                ...capabilities
            }
        };
    }

    private async withPermissionGroupRelationsCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getPermissionGroupCapabilities(actorId);
        return {
            ...response,
            group: response.group
                ? this.decoratePermissionGroup(response.group as RbacProxyPayload, capabilities)
                : response.group
        };
    }

    private async getMenuCapabilities(actorId: string) {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_RBAC_MENU_CREATE,
            RBAC_PERMISSIONS.APP_RBAC_MENU_UPDATE,
            RBAC_PERMISSIONS.APP_RBAC_MENU_DELETE
        ]);
        return {
            viewerCanCreateMenu: permissions.get(RBAC_PERMISSIONS.APP_RBAC_MENU_CREATE) ?? false,
            viewerCanUpdateMenu: permissions.get(RBAC_PERMISSIONS.APP_RBAC_MENU_UPDATE) ?? false,
            viewerCanDeleteMenu: permissions.get(RBAC_PERMISSIONS.APP_RBAC_MENU_DELETE) ?? false
        };
    }

    private decorateMenu(record: RbacProxyPayload, capabilities: Record<string, boolean>) {
        return {
            ...record,
            viewerCanCreateMenu: capabilities.viewerCanCreateMenu,
            viewerCanUpdate: capabilities.viewerCanUpdateMenu,
            viewerCanDelete: capabilities.viewerCanDeleteMenu,
            viewerCanUpdateMenu: capabilities.viewerCanUpdateMenu,
            viewerCanDeleteMenu: capabilities.viewerCanDeleteMenu
        };
    }

    private async withMenuListCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getMenuCapabilities(actorId);
        return {
            ...this.withRecords(response, (record) => this.decorateMenu(record, capabilities)),
            meta: {
                ...((response.meta as RbacProxyPayload | undefined) ?? {}),
                ...capabilities
            }
        };
    }

    private async withMenuDetailCapabilities(response: RbacProxyResponse, actorId: string) {
        const capabilities = await this.getMenuCapabilities(actorId);
        return {
            ...response,
            menu: response.menu ? this.decorateMenu(response.menu as RbacProxyPayload, capabilities) : response.menu
        };
    }

    private withRecords(response: RbacProxyResponse, decorate: (record: RbacProxyPayload) => RbacProxyPayload) {
        return {
            ...response,
            records: asRecords(response.records).map((record) => decorate(record))
        };
    }
}
