import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Injectable } from '@nestjs/common';
import { AdminErrorCodes } from '../../../common/constants/index';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS, type RbacPermissionCode } from '../rbac/rbac-permissions';

const SUPER_ADMIN_PERMISSION_READONLY_SUMMARY = '超级管理员角色默认拥有全部权限，不能编辑直接授权权限';

@Injectable()
export class SystemRbacAssignmentsService {
    private readonly logger = createRuntimeLogger(SystemRbacAssignmentsService.name, {
        module: 'rbac',
        domain: 'assignment',
        resource: { type: 'rbac_assignment' }
    });

    constructor(
        private readonly prismaService: PrismaService,
        private readonly authzService: RbacAuthorizationService,
        private readonly graphService: SystemRbacGraphService,
        private readonly adminUserStateService: AdminUserStateService
    ) {}

    async replaceUserRoles(userId: string, roleIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.USER_ASSIGN_ROLE);
        await this.ensureUserExists(userId);
        await this.ensureRolesExist(roleIds);
        const previousRoleIds = await this.getUserRoleIds(userId);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserRole.deleteMany({ where: { userId } });
            const uniqueRoleIds = this.normalizeNumberIds(roleIds);
            if (uniqueRoleIds.length > 0) {
                await tx.rbacUserRole.createMany({
                    data: uniqueRoleIds.map((roleId) => ({
                        userId,
                        roleId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([
            this.rebuildAffectedUsers([userId]),
            this.bumpRoleStateVersions([...previousRoleIds, ...roleIds])
        ]);
        return null;
    }

    async replaceUserGroups(userId: string, groupIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.USER_ASSIGN_USER_GROUP);
        await this.ensureUserExists(userId);
        await this.ensureGroupsExist(groupIds);
        const previousGroupIds = await this.getUserGroupIds(userId);
        const affectedRoleIds = await this.getRoleIdsByGroupIds([...previousGroupIds, ...groupIds]);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserGroupMember.deleteMany({ where: { userId } });
            const uniqueGroupIds = this.normalizeNumberIds(groupIds);
            if (uniqueGroupIds.length > 0) {
                await tx.rbacUserGroupMember.createMany({
                    data: uniqueGroupIds.map((groupId) => ({
                        userId,
                        groupId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([this.rebuildAffectedUsers([userId]), this.bumpRoleStateVersions(affectedRoleIds)]);
        return null;
    }

    async replaceGroupMembers(groupId: number, userIds: string[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER);
        await this.ensureGroupExists(groupId);
        await this.ensureUsersExist(userIds);
        const previousUserIds = await this.getGroupMemberIds(groupId);
        const roleIds = await this.getGroupRoleIds(groupId);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserGroupMember.deleteMany({ where: { groupId } });
            const uniqueUserIds = this.normalizeStringIds(userIds);
            if (uniqueUserIds.length > 0) {
                await tx.rbacUserGroupMember.createMany({
                    data: uniqueUserIds.map((userId) => ({
                        groupId,
                        userId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([
            this.rebuildAffectedUsers([...previousUserIds, ...userIds]),
            this.bumpRoleStateVersions(roleIds)
        ]);
        return null;
    }

    async replaceGroupRoles(groupId: number, roleIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_ROLE);
        await this.ensureGroupExists(groupId);
        await this.ensureRolesExist(roleIds);
        const previousRoleIds = await this.getGroupRoleIds(groupId);
        const memberUserIds = await this.getGroupMemberIds(groupId);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserGroupRole.deleteMany({ where: { groupId } });
            const uniqueRoleIds = this.normalizeNumberIds(roleIds);
            if (uniqueRoleIds.length > 0) {
                await tx.rbacUserGroupRole.createMany({
                    data: uniqueRoleIds.map((roleId) => ({
                        groupId,
                        roleId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([
            this.rebuildAffectedUsers(memberUserIds),
            this.bumpRoleStateVersions([...previousRoleIds, ...roleIds])
        ]);
        return null;
    }

    async replaceRoleUsers(roleId: number, userIds: string[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER);
        const role = await this.ensureRoleExists(roleId);
        await this.ensureUsersExist(userIds);
        const previousUserIds = await this.getRoleUserIds(roleId);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserRole.deleteMany({ where: { roleId } });
            const uniqueUserIds = this.normalizeStringIds(userIds);
            if (uniqueUserIds.length > 0) {
                await tx.rbacUserRole.createMany({
                    data: uniqueUserIds.map((userId) => ({
                        roleId,
                        userId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([
            this.rebuildAffectedUsers([...previousUserIds, ...userIds]),
            this.bumpRoleStateVersion(role.id)
        ]);
        return null;
    }

    async replaceRoleGroups(roleId: number, groupIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER_GROUP);
        const role = await this.ensureRoleExists(roleId);
        await this.ensureGroupsExist(groupIds);
        const previousGroupIds = await this.getRoleGroupIds(roleId);
        const affectedUserIds = await this.graphService.getAffectedUserIdsByGroupIds([
            ...previousGroupIds,
            ...groupIds
        ]);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserGroupRole.deleteMany({ where: { roleId } });
            const uniqueGroupIds = this.normalizeNumberIds(groupIds);
            if (uniqueGroupIds.length > 0) {
                await tx.rbacUserGroupRole.createMany({
                    data: uniqueGroupIds.map((groupId) => ({
                        roleId,
                        groupId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([this.rebuildAffectedUsers(affectedUserIds), this.bumpRoleStateVersion(role.id)]);
        return null;
    }

    async replaceRoleParentRoles(roleId: number, parentRoleIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.ROLE_ASSIGN_PARENT_ROLE);
        await this.ensureRoleExists(roleId);
        await this.ensureRolesExist(parentRoleIds);
        await this.assertNoRoleInheritCycle(roleId, parentRoleIds);
        const previousDependentRoleIds = await this.graphService.getRoleDependentRoleIds([roleId]);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRoleInherit.deleteMany({ where: { roleId } });
            const uniqueParentRoleIds = this.normalizeNumberIds(parentRoleIds);
            if (uniqueParentRoleIds.length > 0) {
                await tx.rbacRoleInherit.createMany({
                    data: uniqueParentRoleIds.map((parentRoleId) => ({
                        roleId,
                        parentRoleId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        const nextDependentRoleIds = await this.graphService.getRoleDependentRoleIds([roleId]);
        const affectedRoleIds = [...previousDependentRoleIds, ...nextDependentRoleIds];
        await Promise.all([
            this.rebuildAffectedUsers(await this.graphService.getAffectedUserIdsByRoleIds(affectedRoleIds)),
            this.bumpRoleStateVersions(affectedRoleIds)
        ]);
        return null;
    }

    async replaceRolePermissions(roleId: number, permissionIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION);
        const role = await this.ensureRoleExists(roleId);
        this.assertRolePermissionsEditable(role);
        await this.ensurePermissionsExist(permissionIds);
        const affectedUserIds = await this.graphService.getAffectedUserIdsByRoleIds([roleId]);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRolePermission.deleteMany({ where: { roleId } });
            const uniquePermissionIds = this.normalizeNumberIds(permissionIds);
            if (uniquePermissionIds.length > 0) {
                await tx.rbacRolePermission.createMany({
                    data: uniquePermissionIds.map((permissionId) => ({
                        roleId,
                        permissionId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        await Promise.all([this.rebuildAffectedUsers(affectedUserIds), this.bumpRoleStateVersion(role.id)]);
        return null;
    }

    async replacePermissionRoles(permissionId: number, roleIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION);
        await this.ensurePermissionExists(permissionId);
        await this.ensureRolesExist(roleIds);
        const previousRoleIds = await this.getPermissionRoleIds(permissionId);
        const preservedSuperAdminRoleIds = await this.getSuperAdminRoleIds([...previousRoleIds, ...roleIds]);
        this.assertNoAddedSuperAdminRolePermissions(roleIds, previousRoleIds, preservedSuperAdminRoleIds);
        const editableRoleIds = this.excludeRoleIds(roleIds, preservedSuperAdminRoleIds);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRolePermission.deleteMany({
                where: this.createEditableRolePermissionWhere(permissionId, preservedSuperAdminRoleIds)
            });
            if (editableRoleIds.length > 0) {
                await tx.rbacRolePermission.createMany({
                    data: editableRoleIds.map((roleId) => ({
                        roleId,
                        permissionId,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        const affectedRoleIds = this.excludeRoleIds(
            [...previousRoleIds, ...editableRoleIds],
            preservedSuperAdminRoleIds
        );
        await Promise.all([
            this.rebuildAffectedUsers(await this.graphService.getAffectedUserIdsByRoleIds(affectedRoleIds)),
            this.bumpRoleStateVersions(affectedRoleIds)
        ]);
        return null;
    }

    async replaceMenuViewerRoles(menuId: number, roleIds: number[], actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE);
        const menu = await this.ensureMenuExists(menuId);
        await this.ensureRolesExist(roleIds);
        const permission = await this.ensurePermissionExistsByCode(menu.requiredPermissionCode);
        const previousRoleIds = await this.getMenuViewerRoleIds(menuId);
        const preservedSuperAdminRoleIds = await this.getSuperAdminRoleIds([...previousRoleIds, ...roleIds]);
        this.assertNoAddedSuperAdminRolePermissions(roleIds, previousRoleIds, preservedSuperAdminRoleIds);
        const editableRoleIds = this.excludeRoleIds(roleIds, preservedSuperAdminRoleIds);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRolePermission.deleteMany({
                where: this.createEditableRolePermissionWhere(permission.id, preservedSuperAdminRoleIds)
            });
            if (editableRoleIds.length > 0) {
                await tx.rbacRolePermission.createMany({
                    data: editableRoleIds.map((roleId) => ({
                        roleId,
                        permissionId: permission.id,
                        createdBy: actorId
                    })),
                    skipDuplicates: true
                });
            }
        });
        const affectedRoleIds = this.excludeRoleIds(
            [...previousRoleIds, ...editableRoleIds],
            preservedSuperAdminRoleIds
        );
        await Promise.all([
            this.rebuildAffectedUsers(await this.graphService.getAffectedUserIdsByRoleIds(affectedRoleIds)),
            this.bumpRoleStateVersions(affectedRoleIds)
        ]);
        return null;
    }

    private async ensureUserExists(userId: string) {
        const user = await this.prismaService.betterAuthUser.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true
            }
        });
        if (!user) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }
        return user;
    }

    private async ensureUsersExist(userIds: string[]) {
        const uniqueIds = this.normalizeStringIds(userIds);
        if (uniqueIds.length === 0) {
            return;
        }
        const count = await this.prismaService.betterAuthUser.count({
            where: {
                id: {
                    in: uniqueIds
                }
            }
        });
        if (count !== uniqueIds.length) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }
    }

    private async ensureRoleExists(roleId: number) {
        const role = await this.prismaService.rbacRole.findFirst({
            where: {
                id: roleId,
                deletedAt: null
            },
            select: {
                id: true,
                name: true,
                isSuperAdmin: true
            }
        });
        if (!role) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
        return role;
    }

    private async ensureRolesExist(roleIds: number[]) {
        const uniqueIds = this.normalizeNumberIds(roleIds);
        if (uniqueIds.length === 0) {
            return;
        }
        const count = await this.prismaService.rbacRole.count({
            where: {
                id: {
                    in: uniqueIds
                },
                deletedAt: null
            }
        });
        if (count !== uniqueIds.length) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND_IDS(uniqueIds.join(',')));
        }
    }

    private assertRolePermissionsEditable(role: { id: number; isSuperAdmin: boolean }) {
        if (!role.isSuperAdmin) {
            return;
        }
        throw new BusinessException(AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID, {
            summary: SUPER_ADMIN_PERMISSION_READONLY_SUMMARY,
            roleId: role.id
        });
    }

    private assertNoAddedSuperAdminRolePermissions(
        roleIds: number[],
        previousRoleIds: number[],
        superAdminRoleIds: number[]
    ) {
        const previousRoleIdSet = new Set(this.normalizeNumberIds(previousRoleIds));
        const superAdminRoleIdSet = new Set(superAdminRoleIds);
        const addedSuperAdminRoleIds = this.normalizeNumberIds(roleIds).filter(
            (roleId) => superAdminRoleIdSet.has(roleId) && !previousRoleIdSet.has(roleId)
        );
        if (addedSuperAdminRoleIds.length === 0) {
            return;
        }
        throw new BusinessException(AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID, {
            summary: SUPER_ADMIN_PERMISSION_READONLY_SUMMARY,
            roleIds: addedSuperAdminRoleIds
        });
    }

    private async getSuperAdminRoleIds(roleIds: number[]) {
        const uniqueRoleIds = this.normalizeNumberIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return [];
        }
        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                deletedAt: null,
                isSuperAdmin: true
            },
            select: {
                id: true
            }
        });
        return roles.map((role) => role.id);
    }

    private excludeRoleIds(roleIds: number[], excludedRoleIds: number[]) {
        if (excludedRoleIds.length === 0) {
            return this.normalizeNumberIds(roleIds);
        }
        const excludedRoleIdSet = new Set(excludedRoleIds);
        return this.normalizeNumberIds(roleIds).filter((roleId) => !excludedRoleIdSet.has(roleId));
    }

    private createEditableRolePermissionWhere(permissionId: number, preservedRoleIds: number[]) {
        if (preservedRoleIds.length === 0) {
            return { permissionId };
        }
        return {
            permissionId,
            roleId: {
                notIn: preservedRoleIds
            }
        };
    }

    private async ensureGroupExists(groupId: number) {
        const group = await this.prismaService.rbacUserGroup.findFirst({
            where: {
                id: groupId,
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        if (!group) {
            throw new BusinessException(AdminErrorCodes.USER_GROUP.NOT_FOUND);
        }
        return group;
    }

    private async ensureGroupsExist(groupIds: number[]) {
        const uniqueIds = this.normalizeNumberIds(groupIds);
        if (uniqueIds.length === 0) {
            return;
        }
        const count = await this.prismaService.rbacUserGroup.count({
            where: {
                id: {
                    in: uniqueIds
                },
                deletedAt: null
            }
        });
        if (count !== uniqueIds.length) {
            throw new BusinessException(AdminErrorCodes.USER_GROUP.NOT_FOUND);
        }
    }

    private async ensurePermissionExists(permissionId: number) {
        const permission = await this.prismaService.rbacPermission.findFirst({
            where: {
                id: permissionId,
                deletedAt: null
            },
            select: {
                id: true,
                code: true
            }
        });
        if (!permission) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
        return permission;
    }

    private async ensurePermissionExistsByCode(code: RbacPermissionCode | string) {
        const permission = await this.prismaService.rbacPermission.findFirst({
            where: {
                code,
                deletedAt: null
            },
            select: {
                id: true,
                code: true
            }
        });
        if (!permission) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
        return permission;
    }

    private async ensurePermissionsExist(permissionIds: number[]) {
        const uniqueIds = this.normalizeNumberIds(permissionIds);
        if (uniqueIds.length === 0) {
            return;
        }
        const count = await this.prismaService.rbacPermission.count({
            where: {
                id: {
                    in: uniqueIds
                },
                deletedAt: null
            }
        });
        if (count !== uniqueIds.length) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
    }

    private async ensureMenuExists(menuId: number) {
        const menu = await this.prismaService.rbacMenu.findUnique({
            where: {
                id: menuId
            },
            select: {
                id: true,
                requiredPermissionCode: true
            }
        });
        if (!menu) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
        return menu;
    }

    private async assertNoRoleInheritCycle(roleId: number, parentRoleIds: number[]) {
        const uniqueParentIds = this.normalizeNumberIds(parentRoleIds);
        if (uniqueParentIds.includes(roleId)) {
            throw new BusinessException(AdminErrorCodes.RBAC.ROLE_INHERIT_SELF);
        }
        if (uniqueParentIds.length === 0) {
            return;
        }
        const parentRows = await this.prismaService.rbacRoleInherit.findMany({
            select: {
                roleId: true,
                parentRoleId: true
            }
        });
        const parentIdsByRoleId = new Map<number, number[]>();
        for (const row of parentRows) {
            if (row.roleId === roleId) {
                continue;
            }
            const values = parentIdsByRoleId.get(row.roleId) ?? [];
            values.push(row.parentRoleId);
            parentIdsByRoleId.set(row.roleId, values);
        }
        parentIdsByRoleId.set(roleId, uniqueParentIds);

        const visiting = new Set<number>();
        const visited = new Set<number>();
        const visit = (currentRoleId: number): boolean => {
            if (visiting.has(currentRoleId)) {
                return true;
            }
            if (visited.has(currentRoleId)) {
                return false;
            }
            visiting.add(currentRoleId);
            for (const parentRoleId of parentIdsByRoleId.get(currentRoleId) ?? []) {
                if (visit(parentRoleId)) {
                    return true;
                }
            }
            visiting.delete(currentRoleId);
            visited.add(currentRoleId);
            return false;
        };
        if (visit(roleId)) {
            throw new BusinessException(AdminErrorCodes.RBAC.ROLE_INHERIT_CYCLE);
        }
    }

    private async getUserRoleIds(userId: string) {
        const rows = await this.prismaService.rbacUserRole.findMany({
            where: {
                userId
            },
            select: {
                roleId: true
            }
        });
        return rows.map((row) => row.roleId);
    }

    private async getUserGroupIds(userId: string) {
        const rows = await this.prismaService.rbacUserGroupMember.findMany({
            where: {
                userId
            },
            select: {
                groupId: true
            }
        });
        return rows.map((row) => row.groupId);
    }

    private async getGroupMemberIds(groupId: number) {
        const rows = await this.prismaService.rbacUserGroupMember.findMany({
            where: {
                groupId
            },
            select: {
                userId: true
            }
        });
        return rows.map((row) => row.userId);
    }

    private async getGroupRoleIds(groupId: number) {
        const rows = await this.prismaService.rbacUserGroupRole.findMany({
            where: {
                groupId
            },
            select: {
                roleId: true
            }
        });
        return rows.map((row) => row.roleId);
    }

    private async getRoleUserIds(roleId: number) {
        const rows = await this.prismaService.rbacUserRole.findMany({
            where: {
                roleId
            },
            select: {
                userId: true
            }
        });
        return rows.map((row) => row.userId);
    }

    private async getRoleGroupIds(roleId: number) {
        const rows = await this.prismaService.rbacUserGroupRole.findMany({
            where: {
                roleId
            },
            select: {
                groupId: true
            }
        });
        return rows.map((row) => row.groupId);
    }

    private async getRoleIdsByGroupIds(groupIds: number[]) {
        const uniqueGroupIds = this.normalizeNumberIds(groupIds);
        if (uniqueGroupIds.length === 0) {
            return [];
        }
        const rows = await this.prismaService.rbacUserGroupRole.findMany({
            where: {
                groupId: {
                    in: uniqueGroupIds
                }
            },
            select: {
                roleId: true
            }
        });
        return rows.map((row) => row.roleId);
    }

    private async getPermissionRoleIds(permissionId: number) {
        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                permissionId
            },
            select: {
                roleId: true
            }
        });
        return rows.map((row) => row.roleId);
    }

    private async getMenuViewerRoleIds(menuId: number) {
        const menu = await this.ensureMenuExists(menuId);
        const permission = await this.ensurePermissionExistsByCode(menu.requiredPermissionCode);
        return await this.getPermissionRoleIds(permission.id);
    }

    private async rebuildAffectedUsers(userIds: string[]) {
        const uniqueUserIds = this.normalizeStringIds(userIds);
        if (uniqueUserIds.length === 0) {
            return;
        }
        await this.graphService.applyRebuild(uniqueUserIds);
    }

    private async bumpRoleStateVersions(roleIds: number[]) {
        const uniqueRoleIds = this.normalizeNumberIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return;
        }
        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                }
            },
            select: {
                id: true,
                name: true
            }
        });
        await Promise.all(roles.map((role) => this.bumpRoleStateVersion(role.id)));
    }

    private async bumpRoleStateVersion(roleId: number) {
        try {
            await this.adminUserStateService.bumpRoleStateVersion(roleId);
        } catch (error) {
            this.logger.warn('bumpRoleStateVersion 失败', { error, roleId });
        }
    }

    private normalizeNumberIds(ids: number[]) {
        return [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
    }

    private normalizeStringIds(ids: string[]) {
        return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    }
}
