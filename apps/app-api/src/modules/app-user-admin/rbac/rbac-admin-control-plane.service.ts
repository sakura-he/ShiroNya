import type { AppUserAdminRpcMethod } from '@app/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SystemMenusService } from '../../system/menus/menus.service';
import { CreateMenuSchema, QueryMenuListSchema, QueryMenuTreeSchema, UpdateMenuSchema } from '../../system/menus/dto/menu.dto';
import {
    AssignRbacPermissionGroupRelationsSchema,
    AssignRbacPermissionRolesSchema,
    CreateRbacPermissionGroupSchema,
    CreateRbacPermissionSchema,
    QueryRbacPermissionGroupListSchema,
    QueryRbacPermissionListSchema,
    QueryRbacPermissionRolesSchema,
    SuggestRbacPermissionCodeSchema,
    UpdateRbacPermissionGroupSchema,
    UpdateRbacPermissionSchema
} from '../../system/rbac/dto/rbac.dto';
import { SystemRbacPermissionGroupsService } from '../../system/permission-groups/permission-groups.service';
import { SystemRbacPermissionsService } from '../../system/permissions/permissions.service';
import type { RbacServiceContext } from '../../system/rbac/rbac-service-context';
import { SystemRolesService } from '../../system/roles/roles.service';
import {
    AssignRoleParentSchema,
    AssignRolePermissionSchema,
    AssignRoleUserGroupSchema,
    AssignRoleUserSchema,
    CreateRoleDataSchema,
    QueryRoleAssignableParentSchema,
    QueryRoleAssignablePermissionSchema,
    QueryRoleAssignableUserGroupSchema,
    QueryRoleAssignableUserSchema,
    QueryRoleEffectiveUserSchema,
    QueryRoleListSchema,
    UpdateRoleDataSchema
} from '../../system/roles/dto/role.dto';
import { SystemUserGroupsService } from '../../system/user-groups/user-groups.service';
import { AdminErrorCodes } from '../../../common/constants/index';
import {
    AssignUserGroupMemberSchema,
    AssignUserGroupRoleSchema,
    CreateUserGroupSchema,
    QueryUserGroupListSchema,
    QueryUserGroupRelationMemberSchema,
    QueryUserGroupRelationMenuSchema,
    QueryUserGroupRelationRoleSchema,
    UpdateUserGroupSchema
} from '../../system/user-groups/dto/user-group.dto';

type RbacAdminPayload = Record<string, unknown>;

const TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT: RbacServiceContext = {
    authorizationBoundary: 'trusted-admin-control-plane'
};

function requiredNumber(payload: RbacAdminPayload, key: string): number {
    const value = payload[key];
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new HttpException(
            {
                code: AdminErrorCodes.CONTROL_PLANE.PARAM_INVALID.code,
                message: `app-api RBAC 控制面缺少有效参数: ${key}`
            },
            HttpStatus.BAD_REQUEST
        );
    }
    return numberValue;
}

function updatePayload(payload: RbacAdminPayload): RbacAdminPayload {
    const data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return data as RbacAdminPayload;
    }
    return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'id'));
}

function parsePayload<T>(schema: z.ZodType<T>, payload: RbacAdminPayload, method: AppUserAdminRpcMethod): T {
    try {
        return schema.parse(payload);
    } catch (error) {
        throw new HttpException(
            {
                code: AdminErrorCodes.CONTROL_PLANE.PARAM_INVALID.code,
                message: `app-api RBAC 控制面参数无效: ${method}`,
                data: error instanceof z.ZodError ? { issues: error.issues } : undefined
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

@Injectable()
export class RbacAdminControlPlaneService {
    constructor(
        private readonly roleService: SystemRolesService,
        private readonly userGroupService: SystemUserGroupsService,
        private readonly permissionService: SystemRbacPermissionsService,
        private readonly permissionGroupService: SystemRbacPermissionGroupsService,
        private readonly menuService: SystemMenusService
    ) {}

    async handle(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        if (method.includes('RbacRole') || method === 'ListRbacRoles') {
            return await this.handleRole(method, payload, actorId);
        }
        if (method.includes('RbacUserGroup') || method === 'ListRbacUserGroups') {
            return await this.handleUserGroup(method, payload, actorId);
        }
        if (method.includes('RbacPermissionGroup') || method === 'ListRbacPermissionGroups') {
            return await this.handlePermissionGroup(method, payload, actorId);
        }
        if (method.includes('RbacPermission') || method === 'ListRbacPermissions') {
            return await this.handlePermission(method, payload, actorId);
        }
        if (method.includes('RbacMenu') || method === 'ListRbacMenus') {
            return await this.handleMenu(method, payload, actorId);
        }
        throw this.notImplemented(method);
    }

    private notImplemented(method: AppUserAdminRpcMethod): HttpException {
        return new HttpException(
            {
                code: AdminErrorCodes.CONTROL_PLANE.METHOD_SCOPE_NOT_DECLARED.code,
                message: `app-api RBAC 控制面未实现方法: ${method}`
            },
            HttpStatus.BAD_GATEWAY
        );
    }

    private async handleRole(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        switch (method) {
            case 'ListRbacRoles':
                return await this.roleService.getAllRoles(
                    parsePayload(QueryRoleListSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacRoleRelations':
                return await this.roleService.getRoleRelations(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacRoleAssignableUsers':
                return await this.roleService.getRoleAssignableUsers(
                    parsePayload(QueryRoleAssignableUserSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacRoleAssignableUserGroups':
                return await this.roleService.getRoleAssignableUserGroups(
                    parsePayload(QueryRoleAssignableUserGroupSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacRoleAssignableParentRoles':
                return await this.roleService.getRoleAssignableParentRoles(
                    parsePayload(QueryRoleAssignableParentSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacRoleAssignablePermissions':
                return await this.roleService.getRoleAssignablePermissions(
                    parsePayload(QueryRoleAssignablePermissionSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacRoleEffectiveUsers':
                return await this.roleService.getRoleEffectiveUsers(
                    parsePayload(QueryRoleEffectiveUserSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'CreateRbacRole':
                return await this.roleService.createRole(
                    parsePayload(CreateRoleDataSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'UpdateRbacRole':
                return await this.roleService.updateRole(
                    requiredNumber(payload, 'id'),
                    parsePayload(UpdateRoleDataSchema, updatePayload(payload), method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'DeleteRbacRole':
                return await this.roleService.deleteRole(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacRoleUsers':
                const roleUsersPayload = parsePayload(AssignRoleUserSchema, payload, method);
                return await this.roleService.assignDirectUsers(
                    roleUsersPayload.roleId,
                    roleUsersPayload.userIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacRoleUserGroups':
                const roleUserGroupsPayload = parsePayload(AssignRoleUserGroupSchema, payload, method);
                return await this.roleService.assignUserGroups(
                    roleUserGroupsPayload.roleId,
                    roleUserGroupsPayload.userGroupIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacRoleParentRoles':
                const roleParentRolesPayload = parsePayload(AssignRoleParentSchema, payload, method);
                return await this.roleService.assignParentRoles(
                    roleParentRolesPayload.roleId,
                    roleParentRolesPayload.parentRoleIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacRolePermissions':
                const rolePermissionsPayload = parsePayload(AssignRolePermissionSchema, payload, method);
                return await this.roleService.assignPermissions(
                    rolePermissionsPayload.roleId,
                    rolePermissionsPayload.permissionIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            default:
                throw this.notImplemented(method);
        }
    }

    private async handleUserGroup(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        switch (method) {
            case 'ListRbacUserGroups':
                return await this.userGroupService.getUserGroupList(
                    parsePayload(QueryUserGroupListSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacUserGroupRelations':
                return await this.userGroupService.getUserGroupRelations(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacUserGroupMembers':
                return await this.userGroupService.getUserGroupRelationMembers(
                    parsePayload(QueryUserGroupRelationMemberSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacUserGroupRoles':
                return await this.userGroupService.getUserGroupRelationRoles(
                    parsePayload(QueryUserGroupRelationRoleSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacUserGroupMenus':
                return await this.userGroupService.getUserGroupRelationMenus(
                    parsePayload(QueryUserGroupRelationMenuSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'CreateRbacUserGroup':
                return await this.userGroupService.createUserGroup(
                    actorId,
                    parsePayload(CreateUserGroupSchema, payload, method),
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'UpdateRbacUserGroup':
                return await this.userGroupService.updateUserGroup(
                    requiredNumber(payload, 'id'),
                    parsePayload(UpdateUserGroupSchema, updatePayload(payload), method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'DeleteRbacUserGroup':
                return await this.userGroupService.deleteUserGroup(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacUserGroupMembers':
                const groupMembersPayload = parsePayload(AssignUserGroupMemberSchema, payload, method);
                return await this.userGroupService.assignMembers(
                    groupMembersPayload.groupId,
                    groupMembersPayload.userIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacUserGroupRoles':
                const groupRolesPayload = parsePayload(AssignUserGroupRoleSchema, payload, method);
                return await this.userGroupService.assignRoles(
                    groupRolesPayload.groupId,
                    groupRolesPayload.roleIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            default:
                throw this.notImplemented(method);
        }
    }

    private async handlePermission(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        switch (method) {
            case 'ListRbacPermissions':
                return await this.permissionService.getPermissionList(
                    parsePayload(QueryRbacPermissionListSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacPermissionDeclarationBoard':
                return await this.permissionService.getDeclarationBoard(actorId, TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT);
            case 'SuggestRbacPermissionCode':
                return await this.permissionService.suggestCode(
                    parsePayload(SuggestRbacPermissionCodeSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'CreateRbacPermission':
                return await this.permissionService.createPermission(
                    parsePayload(CreateRbacPermissionSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'UpdateRbacPermission':
                return await this.permissionService.updatePermission(
                    requiredNumber(payload, 'id'),
                    parsePayload(UpdateRbacPermissionSchema, updatePayload(payload), method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'DeleteRbacPermission':
                return await this.permissionService.deletePermission(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacPermissionRelations':
                return await this.permissionService.getPermissionRelations(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'QueryRbacPermissionRoles':
                return await this.permissionService.queryAssignableRoles(
                    parsePayload(QueryRbacPermissionRolesSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacPermissionRoles':
                const permissionRolesPayload = parsePayload(AssignRbacPermissionRolesSchema, payload, method);
                return await this.permissionService.assignRoles(
                    permissionRolesPayload.permissionId,
                    permissionRolesPayload.roleIds,
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            default:
                throw this.notImplemented(method);
        }
    }

    private async handlePermissionGroup(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        switch (method) {
            case 'ListRbacPermissionGroups':
                return await this.permissionGroupService.getGroupList(
                    parsePayload(QueryRbacPermissionGroupListSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'CreateRbacPermissionGroup':
                return await this.permissionGroupService.createGroup(
                    parsePayload(CreateRbacPermissionGroupSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'UpdateRbacPermissionGroup':
                return await this.permissionGroupService.updateGroup(
                    requiredNumber(payload, 'id'),
                    parsePayload(UpdateRbacPermissionGroupSchema, updatePayload(payload), method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'DeleteRbacPermissionGroup':
                return await this.permissionGroupService.deleteGroup(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacPermissionGroupRelations':
                return await this.permissionGroupService.getGroupRelations(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'AssignRbacPermissionGroupRelations':
                return await this.permissionGroupService.assignRelations(
                    parsePayload(AssignRbacPermissionGroupRelationsSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            default:
                throw this.notImplemented(method);
        }
    }

    private async handleMenu(method: AppUserAdminRpcMethod, payload: RbacAdminPayload, actorId: string) {
        switch (method) {
            case 'ListRbacMenuTree':
                return await this.menuService.getMenuTree(
                    parsePayload(QueryMenuTreeSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'ListRbacMenus':
                return await this.menuService.getMenuList(
                    parsePayload(QueryMenuListSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'GetRbacMenuDetail':
                return await this.menuService.getMenuDetail(
                    requiredNumber(payload, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'CreateRbacMenu':
                return await this.menuService.createMenu(
                    parsePayload(CreateMenuSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'UpdateRbacMenu':
                return await this.menuService.update(
                    parsePayload(UpdateMenuSchema, payload, method),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            case 'DeleteRbacMenu':
                return await this.menuService.deleteMenu(
                    requiredNumber({ id: payload.id ?? payload.menu_id }, 'id'),
                    actorId,
                    TRUSTED_ADMIN_CONTROL_PLANE_RBAC_CONTEXT
                );
            default:
                throw this.notImplemented(method);
        }
    }
}
