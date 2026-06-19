import { PrismaService } from '@app/prisma-admin';
import { MenuStatusEnum, MenuTypeEnum, RbacStatus } from '@app/prisma-admin/generated/client';
import {
    buildRbacEffectiveStates,
    createRbacGraphSnapshot,
    createRbacRebuildSummary,
    createRbacRoleChildIndex,
    createRbacRoleParentIndex,
    normalizePositiveRbacIds,
    normalizeRbacPermissionCodes,
    resolveRbacMenuIdsWithAncestors,
    resolveRbacPermissionIdsFromRoleIds,
    resolveRbacRoleClosureFromIndex,
    resolveRbacRoleDependentIdsFromIndex,
    resolveRbacVisibleMenuIdsFromPermissionIds,
    sortRbacStringIds,
    type RbacEffectiveState as CoreRbacEffectiveState,
    type RbacGraphSnapshot as CoreRbacGraphSnapshot
} from '@app/rbac-core';
import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';

export type RbacEffectiveState = CoreRbacEffectiveState;
type RbacGraphSnapshot = CoreRbacGraphSnapshot<MenuTypeEnum>;

/**
 * RBAC 图展开服务。
 *
 * 这里只读取 RBAC 源表并写入 RBAC effective 读模型；导航由用户有效权限和菜单 requiredPermissionCode 匹配。
 */
@Injectable()
export class SystemRbacGraphService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService
    ) {}

    async getRoleClosure(roleIds: number[]): Promise<number[]> {
        const uniqueRoleIds = this.normalizePositiveNumberIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return [];
        }

        const inherits = await this.prismaService.rbacRoleInherit.findMany({
            select: {
                roleId: true,
                parentRoleId: true
            }
        });
        const relatedRoleIds = new Set(uniqueRoleIds);
        for (const inherit of inherits) {
            relatedRoleIds.add(inherit.roleId);
            relatedRoleIds.add(inherit.parentRoleId);
        }
        const activeRoleIds = new Set(await this.filterActiveRoleIds([...relatedRoleIds]));
        if (uniqueRoleIds.every((roleId) => !activeRoleIds.has(roleId))) {
            return [];
        }

        return this.resolveRoleClosureFromIndex(uniqueRoleIds, this.createRoleParentIndex(inherits), activeRoleIds);
    }

    async getRoleDependentRoleIds(roleIds: number[]): Promise<number[]> {
        const uniqueRoleIds = this.normalizePositiveNumberIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return [];
        }

        const snapshot = await this.createGraphSnapshot();
        return this.resolveRoleDependentIdsFromIndex(uniqueRoleIds, snapshot.childRoleIdsByParentId);
    }

    async getRoleEffectiveUserIds(roleId: number): Promise<string[]> {
        const rows = await this.prismaService.rbacEffectiveUserRole.findMany({
            where: {
                roleId,
                role: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                userId: true
            },
            orderBy: {
                userId: 'asc'
            }
        });
        return rows.map((row) => row.userId);
    }

    async getAffectedUserIdsByRoleIds(roleIds: number[]): Promise<string[]> {
        const affectedRoleIds = await this.getRoleDependentRoleIds(roleIds);
        if (affectedRoleIds.length === 0) {
            return [];
        }

        const [directRoleRows, groupRoleRows] = await Promise.all([
            this.prismaService.rbacUserRole.findMany({
                where: {
                    roleId: {
                        in: affectedRoleIds
                    }
                },
                select: {
                    userId: true
                }
            }),
            this.prismaService.rbacUserGroupRole.findMany({
                where: {
                    roleId: {
                        in: affectedRoleIds
                    }
                },
                select: {
                    groupId: true
                }
            })
        ]);
        const groupUserIds = await this.getAffectedUserIdsByGroupIds(groupRoleRows.map((row) => row.groupId));
        return this.sortStringIds([...directRoleRows.map((row) => row.userId), ...groupUserIds]);
    }

    async getAffectedUserIdsByGroupIds(groupIds: number[]): Promise<string[]> {
        const uniqueGroupIds = this.normalizePositiveNumberIds(groupIds);
        if (uniqueGroupIds.length === 0) {
            return [];
        }

        const rows = await this.prismaService.rbacUserGroupMember.findMany({
            where: {
                groupId: {
                    in: uniqueGroupIds
                }
            },
            select: {
                userId: true
            }
        });
        return this.sortStringIds(rows.map((row) => row.userId));
    }

    async getAffectedUserIdsByPermissionIds(permissionIds: number[]): Promise<string[]> {
        const uniquePermissionIds = this.normalizePositiveNumberIds(permissionIds);
        if (uniquePermissionIds.length === 0) {
            return [];
        }

        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                permissionId: {
                    in: uniquePermissionIds
                }
            },
            select: {
                roleId: true
            }
        });
        return await this.getAffectedUserIdsByRoleIds(rows.map((row) => row.roleId));
    }

    async getAffectedUserIdsByPermissionCodes(permissionCodes: string[]): Promise<string[]> {
        const uniqueCodes = this.normalizePermissionCodes(permissionCodes);
        if (uniqueCodes.length === 0) {
            return [];
        }

        const rows = await this.prismaService.rbacPermission.findMany({
            where: {
                code: {
                    in: uniqueCodes
                },
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        return await this.getAffectedUserIdsByPermissionIds(rows.map((row) => row.id));
    }

    async getAffectedUserIdsByMenuPermissionCodes(permissionCodes: string[]): Promise<string[]> {
        const uniqueCodes = this.normalizePermissionCodes(permissionCodes);
        if (uniqueCodes.length === 0) {
            return [];
        }

        // 菜单可见性变化除了影响持有对应权限的用户，也会影响“全菜单可见”的超管用户。
        const [permissionUserIds, superAdminUserIds] = await Promise.all([
            this.getAffectedUserIdsByPermissionCodes(uniqueCodes),
            this.getCurrentSuperAdminUserIds()
        ]);
        return this.sortStringIds([...permissionUserIds, ...superAdminUserIds]);
    }

    async getCurrentSuperAdminUserIds(): Promise<string[]> {
        const rows = await this.prismaService.rbacEffectiveUserRole.findMany({
            where: {
                role: {
                    isSuperAdmin: true,
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                userId: true
            },
            orderBy: {
                userId: 'asc'
            }
        });
        return this.sortStringIds(rows.map((row) => row.userId));
    }

    async getGroupVisibleMenuIds(groupId: number): Promise<number[]> {
        const groupRoleRows = await this.prismaService.rbacUserGroupRole.findMany({
            where: {
                groupId
            },
            select: {
                roleId: true
            }
        });
        return await this.resolveVisibleMenuIdsForRoleIds(groupRoleRows.map((row) => row.roleId));
    }

    async getUserEffectiveState(userId: string): Promise<RbacEffectiveState> {
        // 运行时查询必须吃 effective 读模型，不能重新 buildEffectiveStates 展开整张 RBAC 图。
        // Better Auth 已经确认了当前用户身份；这里按 userId 直接读取最终角色、权限和菜单快照。
        const [roleRows, permissionRows, menuRows] = await Promise.all([
            this.prismaService.rbacEffectiveUserRole.findMany({
                where: {
                    userId,
                    role: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    roleId: true,
                    role: {
                        select: {
                            isSuperAdmin: true
                        }
                    }
                },
                orderBy: {
                    roleId: 'asc'
                }
            }),
            this.prismaService.rbacEffectiveUserPermission.findMany({
                where: {
                    userId,
                    permission: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    permissionId: true,
                    permission: {
                        select: {
                            code: true
                        }
                    }
                },
                orderBy: {
                    permissionId: 'asc'
                }
            }),
            this.prismaService.rbacUserVisibleMenu.findMany({
                where: {
                    userId,
                    menu: {
                        status: MenuStatusEnum.ENABLE
                    }
                },
                select: {
                    menuId: true
                },
                orderBy: {
                    menuId: 'asc'
                }
            })
        ]);

        return {
            userId,
            roleIds: roleRows.map((row) => row.roleId),
            permissionIds: permissionRows.map((row) => row.permissionId),
            permissionCodes: permissionRows.map((row) => row.permission.code),
            visibleMenuIds: menuRows.map((row) => row.menuId),
            isSuperAdmin: roleRows.some((row) => row.role.isSuperAdmin)
        };
    }

    async previewRebuild(userIds?: string[]) {
        const states = await this.buildEffectiveStates(userIds);
        return this.createRebuildSummary(states);
    }

    async applyRebuild(userIds?: string[]) {
        const states = await this.buildEffectiveStates(userIds);
        const version = ulid();
        const userIdFilter = states.map((state) => state.userId);

        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacEffectiveUserRole.deleteMany({
                where: {
                    userId: {
                        in: userIdFilter
                    }
                }
            });
            await tx.rbacEffectiveUserPermission.deleteMany({
                where: {
                    userId: {
                        in: userIdFilter
                    }
                }
            });
            await tx.rbacUserVisibleMenu.deleteMany({
                where: {
                    userId: {
                        in: userIdFilter
                    }
                }
            });

            const roleRows = states.flatMap((state) =>
                state.roleIds.map((roleId) => ({
                    userId: state.userId,
                    roleId,
                    version
                }))
            );
            const permissionRows = states.flatMap((state) =>
                state.permissionIds.map((permissionId) => ({
                    userId: state.userId,
                    permissionId,
                    version
                }))
            );
            const menuRows = states.flatMap((state) =>
                state.visibleMenuIds.map((menuId) => ({
                    userId: state.userId,
                    menuId,
                    version
                }))
            );

            if (roleRows.length > 0) {
                await tx.rbacEffectiveUserRole.createMany({
                    data: roleRows,
                    skipDuplicates: true
                });
            }
            if (permissionRows.length > 0) {
                await tx.rbacEffectiveUserPermission.createMany({
                    data: permissionRows,
                    skipDuplicates: true
                });
            }
            if (menuRows.length > 0) {
                await tx.rbacUserVisibleMenu.createMany({
                    data: menuRows,
                    skipDuplicates: true
                });
            }
        });
        await this.bumpRebuiltUserStateVersions(userIdFilter);

        return {
            ...this.createRebuildSummary(states),
            version
        };
    }

    async getOverview() {
        const [
            roleCount,
            groupCount,
            permissionCount,
            userRoleCount,
            groupMemberCount,
            groupRoleCount,
            rolePermissionCount,
            menuCount,
            effectiveRoleCount,
            effectivePermissionCount,
            visibleMenuCount
        ] = await Promise.all([
            this.prismaService.rbacRole.count({ where: { deletedAt: null } }),
            this.prismaService.rbacUserGroup.count({ where: { deletedAt: null } }),
            this.prismaService.rbacPermission.count({ where: { deletedAt: null } }),
            this.prismaService.rbacUserRole.count(),
            this.prismaService.rbacUserGroupMember.count(),
            this.prismaService.rbacUserGroupRole.count(),
            this.prismaService.rbacRolePermission.count(),
            this.prismaService.rbacMenu.count(),
            this.prismaService.rbacEffectiveUserRole.count(),
            this.prismaService.rbacEffectiveUserPermission.count(),
            this.prismaService.rbacUserVisibleMenu.count()
        ]);

        return {
            sources: {
                roleCount,
                groupCount,
                permissionCount,
                userRoleCount,
                groupMemberCount,
                groupRoleCount,
                rolePermissionCount,
                menuCount
            },
            effective: {
                effectiveRoleCount,
                effectivePermissionCount,
                visibleMenuCount
            }
        };
    }

    private async buildEffectiveStates(userIds?: string[]): Promise<RbacEffectiveState[]> {
        const users = await this.prismaService.betterAuthUser.findMany({
            where: userIds?.length
                ? {
                      id: {
                          in: [...new Set(userIds)]
                      }
                  }
                : undefined,
            select: {
                id: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        const targetUserIds = users.map((user) => user.id);
        if (targetUserIds.length === 0) {
            return [];
        }

        // 重建读模型时一次性读取图快照，并在内存中展开，避免按用户循环查库。
        const [directRoleRows, groupMemberRows] = await Promise.all([
            this.prismaService.rbacUserRole.findMany({
                where: {
                    userId: {
                        in: targetUserIds
                    }
                },
                select: {
                    userId: true,
                    roleId: true
                }
            }),
            this.prismaService.rbacUserGroupMember.findMany({
                where: {
                    userId: {
                        in: targetUserIds
                    }
                },
                select: {
                    userId: true,
                    groupId: true
                }
            })
        ]);
        const activeGroupIds = new Set(await this.filterActiveGroupIds(groupMemberRows.map((row) => row.groupId)));
        const groupRoleRows =
            activeGroupIds.size > 0
                ? await this.prismaService.rbacUserGroupRole.findMany({
                      where: {
                          groupId: {
                              in: [...activeGroupIds]
                          }
                      },
                      select: {
                          groupId: true,
                          roleId: true
                      }
                  })
                : [];
        const snapshot = await this.createGraphSnapshot();
        return buildRbacEffectiveStates({
            targetUserIds,
            directRoleRows,
            groupMemberRows,
            activeGroupIds,
            groupRoleRows,
            snapshot,
            buttonMenuType: MenuTypeEnum.Button
        });
    }

    private createRebuildSummary(states: RbacEffectiveState[]) {
        return createRbacRebuildSummary(states);
    }

    private async bumpRebuiltUserStateVersions(userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        if (uniqueUserIds.length === 0) {
            return;
        }

        await Promise.all(uniqueUserIds.map((userId) => this.adminUserStateService.bumpUserStateVersion(userId)));
    }

    private async createGraphSnapshot(): Promise<RbacGraphSnapshot> {
        const [roleRows, inheritRows, rolePermissionRows, permissionRows, menuRows] = await Promise.all([
            this.prismaService.rbacRole.findMany({
                where: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                },
                select: {
                    id: true,
                    isSuperAdmin: true
                }
            }),
            this.prismaService.rbacRoleInherit.findMany({
                select: {
                    roleId: true,
                    parentRoleId: true
                }
            }),
            this.prismaService.rbacRolePermission.findMany({
                where: {
                    permission: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    roleId: true,
                    permissionId: true
                }
            }),
            this.prismaService.rbacPermission.findMany({
                where: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                },
                select: {
                    id: true,
                    code: true
                },
                orderBy: {
                    id: 'asc'
                }
            }),
            this.prismaService.rbacMenu.findMany({
                where: {
                    status: MenuStatusEnum.ENABLE
                },
                select: {
                    id: true,
                    pid: true,
                    type: true,
                    requiredPermissionCode: true
                },
                orderBy: {
                    id: 'asc'
                }
            })
        ]);

        return createRbacGraphSnapshot({
            roles: roleRows,
            inherits: inheritRows,
            rolePermissions: rolePermissionRows,
            permissions: permissionRows,
            menus: menuRows
        });
    }

    private createRoleParentIndex(inherits: Array<{ roleId: number; parentRoleId: number }>): Map<number, number[]> {
        return createRbacRoleParentIndex(inherits);
    }

    private createRoleChildIndex(inherits: Array<{ roleId: number; parentRoleId: number }>): Map<number, number[]> {
        return createRbacRoleChildIndex(inherits);
    }

    private resolveRoleClosureFromIndex(
        roleIds: number[],
        parentRoleIdsByRoleId: Map<number, number[]>,
        activeRoleIds: Set<number>
    ): number[] {
        return resolveRbacRoleClosureFromIndex(roleIds, parentRoleIdsByRoleId, activeRoleIds);
    }

    private resolveRoleDependentIdsFromIndex(
        roleIds: number[],
        childRoleIdsByParentId: Map<number, number[]>
    ): number[] {
        return resolveRbacRoleDependentIdsFromIndex(roleIds, childRoleIdsByParentId);
    }

    private resolvePermissionIdsFromRoleIds(roleIds: number[], snapshot: RbacGraphSnapshot): number[] {
        return resolveRbacPermissionIdsFromRoleIds(roleIds, snapshot);
    }

    private resolveVisibleMenuIdsFromPermissionIds(permissionIds: number[], snapshot: RbacGraphSnapshot): number[] {
        return resolveRbacVisibleMenuIdsFromPermissionIds(permissionIds, snapshot, MenuTypeEnum.Button);
    }

    private resolveMenuIdsWithAncestors(
        menuIds: Iterable<number>,
        menuMetaById: Map<number, { pid?: number | null; type?: MenuTypeEnum }>
    ): number[] {
        return resolveRbacMenuIdsWithAncestors(menuIds, menuMetaById, MenuTypeEnum.Button);
    }

    private normalizePositiveNumberIds(ids: number[]): number[] {
        return normalizePositiveRbacIds(ids);
    }

    private normalizePermissionCodes(codes: string[]): string[] {
        return normalizeRbacPermissionCodes(codes);
    }

    private sortStringIds(ids: string[]): string[] {
        return sortRbacStringIds(ids);
    }

    private async resolveVisibleMenuIdsForRoleIds(roleIds: number[]): Promise<number[]> {
        const closureRoleIds = await this.getRoleClosure(roleIds);
        const permissionIds = await this.resolvePermissionIdsForRoleIds(closureRoleIds);
        return await this.resolveVisibleMenuIdsForPermissionIds(permissionIds);
    }

    private async resolvePermissionIdsForRoleIds(roleIds: number[]): Promise<number[]> {
        if (roleIds.length === 0) {
            return [];
        }
        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                roleId: {
                    in: roleIds
                },
                permission: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                permissionId: true
            }
        });
        return [...new Set(rows.map((row) => row.permissionId))].sort((a, b) => a - b);
    }

    private async resolveVisibleMenuIdsForPermissionIds(permissionIds: number[]): Promise<number[]> {
        if (permissionIds.length === 0) {
            return [];
        }

        const permissionRows = await this.prismaService.rbacPermission.findMany({
            where: {
                id: {
                    in: permissionIds
                },
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                code: true
            }
        });
        return await this.resolveVisibleMenuIdsForPermissionCodes(permissionRows.map((row) => row.code));
    }

    private async resolveVisibleMenuIdsForPermissionCodes(permissionCodes: string[]): Promise<number[]> {
        const uniqueCodes = [...new Set(permissionCodes.map((code) => code.trim()).filter(Boolean))];
        if (uniqueCodes.length === 0) {
            return [];
        }

        const menuRows = await this.prismaService.rbacMenu.findMany({
            where: {
                status: MenuStatusEnum.ENABLE
            },
            select: {
                id: true,
                pid: true,
                type: true,
                requiredPermissionCode: true
            }
        });
        const uniqueCodeSet = new Set(uniqueCodes);
        const directMenuIds = menuRows
            .filter((row) => uniqueCodeSet.has(row.requiredPermissionCode))
            .map((row) => row.id);
        return this.resolveMenuIdsWithAncestors(
            directMenuIds,
            new Map(menuRows.map((row) => [row.id, { pid: row.pid ?? null, type: row.type }]))
        );
    }

    private async filterActiveRoleIds(roleIds: number[]): Promise<number[]> {
        const uniqueRoleIds = [...new Set(roleIds)].filter((roleId) => Number.isInteger(roleId) && roleId > 0);
        if (uniqueRoleIds.length === 0) {
            return [];
        }
        const rows = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        return rows.map((row) => row.id);
    }

    private async filterActiveGroupIds(groupIds: number[]): Promise<number[]> {
        const uniqueGroupIds = [...new Set(groupIds)].filter((groupId) => Number.isInteger(groupId) && groupId > 0);
        if (uniqueGroupIds.length === 0) {
            return [];
        }
        const rows = await this.prismaService.rbacUserGroup.findMany({
            where: {
                id: {
                    in: uniqueGroupIds
                },
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        return rows.map((row) => row.id);
    }
}
