import { createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { RbacStatus, Prisma } from '@app/prisma-app/generated/client';
import { Injectable, Optional } from '@nestjs/common';
import {
    AdminSpiceDbRelationshipChangeEvent,
    MenuRoleProjectionInput,
    UserGroupMemberProjectionInput,
    UserGroupRoleProjectionInput,
    UserRoleProjectionInput
} from './spicedb-projection.constants';
import {
    AdminSpiceDbAuthorizationService,
    MenuRoleRelation,
    RoleAssignmentRefs,
    UserGroupMemberRelation,
    UserGroupRoleRelation,
    UserRoleRelation
} from '../spicedb/admin-spicedb-authorization.service';
import { AuthzProjectionInvalidationService } from './authz-projection-invalidation.service';

type UserGroupSummary = Prisma.RbacUserGroupGetPayload<Record<string, never>>;
type ProjectionTransactionClient = Pick<
    PrismaService,
    | 'spiceDbUserGroupMemberProjection'
    | 'spiceDbUserRoleProjection'
    | 'spiceDbUserGroupRoleProjection'
    | 'spiceDbMenuRoleProjection'
>;

type ProjectionRelationSets = {
    userGroupMembers: UserGroupMemberProjectionInput[];
    userRoles: UserRoleProjectionInput[];
    userGroupRoles: UserGroupRoleProjectionInput[];
    menuRoles: MenuRoleProjectionInput[];
};

type CurrentProjectionRelationSets = {
    userGroupMembers: Array<Pick<UserGroupMemberProjectionInput, 'userId' | 'groupId'>>;
    userRoles: Array<Pick<UserRoleProjectionInput, 'userId' | 'roleId'>>;
    userGroupRoles: Array<Pick<UserGroupRoleProjectionInput, 'groupId' | 'roleId'>>;
    menuRoles: Array<Pick<MenuRoleProjectionInput, 'menuId' | 'roleId' | 'relation'>>;
};

type ProjectionDiff<TCurrent, TDesired> = {
    current: TCurrent[];
    missing: TDesired[];
    stale: TCurrent[];
};

type ProjectionChange =
    | {
          type: 'userGroupMember';
          operation: string;
          data: UserGroupMemberProjectionInput;
      }
    | {
          type: 'userRole';
          operation: string;
          data: UserRoleProjectionInput;
      }
    | {
          type: 'userGroupRole';
          operation: string;
          data: UserGroupRoleProjectionInput;
      }
    | {
          type: 'menuRole';
          operation: string;
          data: MenuRoleProjectionInput;
      };

export type ProjectionReconcileStats = {
    desiredCount: number;
    currentCount: number;
    missingCount: number;
    staleCount: number;
};

export type BaseRelationProjectionReconcileResult = {
    userGroupMembers: ProjectionReconcileStats;
    userRoles: ProjectionReconcileStats;
    userGroupRoles: ProjectionReconcileStats;
    menuRoles: ProjectionReconcileStats;
    total: ProjectionReconcileStats;
};

export type RoleImpactSummary = {
    roleCount: number;
    affectedGroupCount: number;
    directUserAssignmentCount: number;
    groupMemberAssignmentCount: number;
    affectedUserEstimate: number;
};

@Injectable()
export class BaseRelationProjectionService {
    private readonly logger = createRuntimeLogger(BaseRelationProjectionService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'authz_base_relation_projection' }
    });
    private readonly writeChunkSize = 500;
    private readonly menuRoleRelations = new Set(['viewer', 'manager']);

    constructor(
        private readonly prismaService: PrismaService,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        @Optional() private readonly invalidationService?: AuthzProjectionInvalidationService
    ) {}

    /**
     * 使用 SpiceDB 当前全部基础关系重建本地投影表。
     */
    async rebuildFromSpiceDb(zedToken?: string | null): Promise<BaseRelationProjectionReconcileResult> {
        const desiredRelations = await this.readDesiredProjectionRelations(zedToken);
        const currentCounts = await this.countCurrentProjectionRelations();

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserGroupMemberProjection.deleteMany();
            await tx.spiceDbUserRoleProjection.deleteMany();
            await tx.spiceDbUserGroupRoleProjection.deleteMany();
            await tx.spiceDbMenuRoleProjection.deleteMany();
            await this.createUserGroupMemberProjectionRows(tx, desiredRelations.userGroupMembers);
            await this.createUserRoleProjectionRows(tx, desiredRelations.userRoles);
            await this.createUserGroupRoleProjectionRows(tx, desiredRelations.userGroupRoles);
            await this.createMenuRoleProjectionRows(tx, desiredRelations.menuRoles);
        });
        await this.bumpProjectionCacheVersion();

        return this.createRebuildResult(desiredRelations, currentCounts);
    }

    /**
     * 检测 SpiceDB 当前全量基础关系与本地投影表的差异，只返回概况不写入数据库。
     */
    async inspectFullSync(zedToken?: string | null): Promise<BaseRelationProjectionReconcileResult> {
        const desiredRelations = await this.readDesiredProjectionRelations(zedToken);
        const currentRelations = await this.readCurrentProjectionRelations();
        const diffs = this.createProjectionDiffs(desiredRelations, currentRelations);

        return this.createReconcileResult(diffs);
    }

    /**
     * 对账 SpiceDB 当前全部基础关系和本地投影，只增删差异数据。
     */
    async reconcileFromSpiceDb(zedToken?: string | null): Promise<BaseRelationProjectionReconcileResult> {
        const desiredRelations = await this.readDesiredProjectionRelations(zedToken);
        const currentRelations = await this.readCurrentProjectionRelations();
        const diffs = this.createProjectionDiffs(desiredRelations, currentRelations);

        await this.prismaService.$transaction(async (tx) => {
            await this.deleteUserGroupMemberProjectionRows(tx, diffs.userGroupMembers.stale);
            await this.deleteUserRoleProjectionRows(tx, diffs.userRoles.stale);
            await this.deleteUserGroupRoleProjectionRows(tx, diffs.userGroupRoles.stale);
            await this.deleteMenuRoleProjectionRows(tx, diffs.menuRoles.stale);
            await this.createUserGroupMemberProjectionRows(tx, diffs.userGroupMembers.missing);
            await this.createUserRoleProjectionRows(tx, diffs.userRoles.missing);
            await this.createUserGroupRoleProjectionRows(tx, diffs.userGroupRoles.missing);
            await this.createMenuRoleProjectionRows(tx, diffs.menuRoles.missing);
        });
        await this.bumpProjectionCacheVersion();

        return this.createReconcileResult(diffs);
    }

    /**
     * 替换单个用户组的成员投影，供业务写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceGroupMembers(groupId: number, userIds: string[], zedToken?: string | null): Promise<void> {
        const relations = this.normalizeUserGroupMemberRelations(
            userIds.map((userId) => ({
                userId,
                groupId,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserGroupMemberProjection.deleteMany({
                where: {
                    groupId
                }
            });
            await this.createUserGroupMemberProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个用户的直接角色投影，供用户写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceUserRoles(userId: string, roleIds: number[], zedToken?: string | null): Promise<void> {
        const relations = this.normalizeUserRoleRelations(
            roleIds.map((roleId) => ({
                userId,
                roleId,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserRoleProjection.deleteMany({
                where: {
                    userId
                }
            });
            await this.createUserRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个角色的直接用户投影，供角色写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceRoleDirectUsers(roleId: number, userIds: string[], zedToken?: string | null): Promise<void> {
        const relations = this.normalizeUserRoleRelations(
            userIds.map((userId) => ({
                userId,
                roleId,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserRoleProjection.deleteMany({
                where: {
                    roleId
                }
            });
            await this.createUserRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个用户组继承的角色投影，供用户组写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceGroupRoles(groupId: number, roleIds: number[], zedToken?: string | null): Promise<void> {
        const relations = this.normalizeUserGroupRoleRelations(
            roleIds.map((roleId) => ({
                groupId,
                roleId,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    groupId
                }
            });
            await this.createUserGroupRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个角色分配到的用户组投影，供角色写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceRoleGroups(roleId: number, groupIds: number[], zedToken?: string | null): Promise<void> {
        const relations = this.normalizeUserGroupRoleRelations(
            groupIds.map((groupId) => ({
                groupId,
                roleId,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    roleId
                }
            });
            await this.createUserGroupRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个菜单授权给角色的投影，供菜单写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceMenuRoles(
        menuId: number,
        roleIds: number[],
        relation = 'viewer',
        zedToken?: string | null
    ): Promise<void> {
        const relations = this.normalizeMenuRoleRelations(
            roleIds.map((roleId) => ({
                menuId,
                roleId,
                relation,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbMenuRoleProjection.deleteMany({
                where: {
                    menuId,
                    relation
                }
            });
            await this.createMenuRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 替换单个角色拥有的菜单投影，供角色写路径在 SpiceDB 写入成功后同步更新。
     */
    async replaceRoleMenus(
        roleId: number,
        menuIds: number[],
        relation = 'viewer',
        zedToken?: string | null
    ): Promise<void> {
        const relations = this.normalizeMenuRoleRelations(
            menuIds.map((menuId) => ({
                menuId,
                roleId,
                relation,
                zedToken
            }))
        );

        await this.prismaService.$transaction(async (tx) => {
            await tx.spiceDbMenuRoleProjection.deleteMany({
                where: {
                    roleId,
                    relation
                }
            });
            await this.createMenuRoleProjectionRows(tx, relations);
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 删除单个用户组相关的全部投影，供用户组删除后清理本地读模型。
     */
    async removeGroup(groupId: number): Promise<void> {
        await this.prismaService.$transaction([
            this.prismaService.spiceDbUserGroupMemberProjection.deleteMany({
                where: {
                    groupId
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    groupId
                }
            })
        ]);
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 删除单个用户相关的全部投影，供后台用户删除后清理本地读模型。
     */
    async removeUser(userId: string): Promise<void> {
        await this.prismaService.$transaction([
            this.prismaService.spiceDbUserGroupMemberProjection.deleteMany({
                where: {
                    userId
                }
            }),
            this.prismaService.spiceDbUserRoleProjection.deleteMany({
                where: {
                    userId
                }
            })
        ]);
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 删除单个角色相关的全部投影，供角色删除后清理本地读模型。
     */
    async removeRole(roleId: number): Promise<void> {
        await this.prismaService.$transaction([
            this.prismaService.spiceDbUserRoleProjection.deleteMany({
                where: {
                    roleId
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    roleId
                }
            }),
            this.prismaService.spiceDbMenuRoleProjection.deleteMany({
                where: {
                    roleId
                }
            })
        ]);
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 删除单个菜单相关的全部投影，供菜单删除后清理本地读模型。
     */
    async removeMenu(menuId: number): Promise<void> {
        await this.prismaService.spiceDbMenuRoleProjection.deleteMany({
            where: {
                menuId
            }
        });
        await this.bumpProjectionCacheVersion();
    }

    /**
     * 应用 SpiceDB Watch 权限变更事件，维护关系投影。
     */
    async applyPermissionChangeEvents(events: AdminSpiceDbRelationshipChangeEvent[]): Promise<number> {
        const targetChanges = events
            .map((event) => this.parseProjectionChange(event))
            .filter((change): change is ProjectionChange => change !== null);

        if (targetChanges.length === 0) {
            return 0;
        }

        await this.prismaService.$transaction(
            async (tx) => {
                await this.applyProjectionChangesInTransaction(tx, targetChanges);
            },
            {
                maxWait: 10000,
                timeout: 30000
            }
        );

        this.logger.debug.title('已应用 SpiceDB Watch 权限变更投影事件', {
            count: targetChanges.length
        });
        await this.bumpProjectionCacheVersion();

        return targetChanges.length;
    }

    /**
     * 在外部数据库事务中应用 SpiceDB Watch 权限变更事件，供 Kafka consumer 同步写入事件日志和游标。
     */
    async applyPermissionChangeEventsInTransaction(
        tx: ProjectionTransactionClient,
        events: AdminSpiceDbRelationshipChangeEvent[]
    ): Promise<number> {
        const targetChanges = events
            .map((event) => this.parseProjectionChange(event))
            .filter((change): change is ProjectionChange => change !== null);

        await this.applyProjectionChangesInTransaction(tx, targetChanges);
        return targetChanges.length;
    }

    /**
     * 在指定事务客户端中顺序应用投影变更，保持 create/delete 事件幂等。
     */
    private async applyProjectionChangesInTransaction(
        tx: ProjectionTransactionClient,
        targetChanges: ProjectionChange[]
    ): Promise<void> {
        for (const change of targetChanges) {
            if (this.isCreateOperation(change.operation)) {
                await this.upsertProjectionChange(tx, change);
                continue;
            }

            if (this.isDeleteOperation(change.operation)) {
                await this.deleteProjectionChange(tx, change);
            }
        }
    }

    private async bumpProjectionCacheVersion(): Promise<void> {
        await this.invalidationService?.bumpProjectionCacheVersion();
    }

    /**
     * 批量读取用户所属用户组元数据，供用户导出和列表查询直接走业务库投影。
     */
    async getBatchUserGroups(userIds: string[]): Promise<Map<string, UserGroupSummary[]>> {
        const uniqueUserIds = [...new Set(userIds)].filter((userId) => userId.trim().length > 0);
        const result = new Map(uniqueUserIds.map((userId) => [userId, [] as UserGroupSummary[]]));
        if (uniqueUserIds.length === 0) {
            return result;
        }

        const projections = await this.prismaService.spiceDbUserGroupMemberProjection.findMany({
            where: {
                userId: {
                    in: uniqueUserIds
                }
            },
            orderBy: [
                {
                    groupId: 'asc'
                },
                {
                    userId: 'asc'
                }
            ]
        });
        const groupIds = [...new Set(projections.map((projection) => projection.groupId))];
        const groups =
            groupIds.length > 0
                ? await this.prismaService.rbacUserGroup.findMany({
                      where: {
                          id: {
                              in: groupIds
                          }
                      },
                      orderBy: {
                          id: 'asc'
                      }
                  })
                : [];
        const groupIndex = new Map(groups.map((group) => [group.id, group]));

        for (const projection of projections) {
            const group = groupIndex.get(projection.groupId);
            if (!group) {
                continue;
            }
            result.get(projection.userId)?.push(group);
        }

        return result;
    }

    /**
     * 批量读取某个用户组内的用户 ID 投影，供列表筛选复用。
     */
    async getUserIdsByGroupId(groupId: number): Promise<string[]> {
        const projections = await this.prismaService.spiceDbUserGroupMemberProjection.findMany({
            where: {
                groupId
            },
            select: {
                userId: true
            }
        });

        return projections.map((projection) => projection.userId);
    }

    /**
     * 批量读取多个用户组内的成员用户 ID，供角色分配影响范围计算复用。
     */
    async getUserIdsByGroupIds(groupIds: number[]): Promise<string[]> {
        const uniqueGroupIds = [...new Set(groupIds)].filter((groupId) => Number.isInteger(groupId) && groupId > 0);
        if (uniqueGroupIds.length === 0) {
            return [];
        }

        const projections = await this.prismaService.spiceDbUserGroupMemberProjection.findMany({
            where: {
                groupId: {
                    in: uniqueGroupIds
                }
            },
            select: {
                userId: true
            },
            orderBy: {
                userId: 'asc'
            }
        });

        return [
            ...new Set(projections.map((projection) => projection.userId).filter((userId) => userId.trim().length > 0))
        ];
    }

    /**
     * 读取指定用户所在的用户组 ID，供用户关系视图避免回查 SpiceDB。
     */
    async getUserGroupIdsByUserId(userId: string): Promise<number[]> {
        if (userId.trim().length === 0) {
            return [];
        }

        const projections = await this.prismaService.spiceDbUserGroupMemberProjection.findMany({
            where: {
                userId
            },
            select: {
                groupId: true
            },
            orderBy: {
                groupId: 'asc'
            }
        });

        return [...new Set(projections.map((projection) => projection.groupId))];
    }

    /**
     * 读取角色直接分配的用户 ID，供角色关系视图复用。
     */
    async getRoleDirectUserIds(roleId: number): Promise<string[]> {
        if (!Number.isInteger(roleId) || roleId <= 0) {
            return [];
        }

        const projections = await this.prismaService.spiceDbUserRoleProjection.findMany({
            where: {
                roleId
            },
            select: {
                userId: true
            },
            orderBy: {
                userId: 'asc'
            }
        });

        return [
            ...new Set(projections.map((projection) => projection.userId).filter((userId) => userId.trim().length > 0))
        ];
    }

    /**
     * 读取角色通过 assignee 指向的用户组 ID，供角色关系视图复用。
     */
    async getRoleAssignedUserGroupIds(roleId: number): Promise<number[]> {
        if (!Number.isInteger(roleId) || roleId <= 0) {
            return [];
        }

        const projections = await this.prismaService.spiceDbUserGroupRoleProjection.findMany({
            where: {
                roleId
            },
            select: {
                groupId: true
            },
            orderBy: {
                groupId: 'asc'
            }
        });

        return [...new Set(projections.map((projection) => projection.groupId))];
    }

    /**
     * 通过本地投影和业务状态计算角色当前命中的用户 ID，避免详情/列表页回查 SpiceDB。
     */
    async getRoleEffectiveUserIds(roleId: number): Promise<string[]> {
        if (!Number.isInteger(roleId) || roleId <= 0) {
            return [];
        }

        const userIdMap = await this.getBatchRoleEffectiveUserIds([roleId]);
        return userIdMap.get(roleId) ?? [];
    }

    /**
     * 读取角色当前直接分配的用户与用户组，供删除前引用检查走投影读模型。
     */
    async getRoleAssignmentRefs(roleId: number): Promise<RoleAssignmentRefs> {
        const [userIds, userGroupIds] = await Promise.all([
            this.getRoleDirectUserIds(roleId),
            this.getRoleAssignedUserGroupIds(roleId)
        ]);

        return {
            userIds,
            userGroupIds
        };
    }

    /**
     * 按角色批量汇总影响范围，只读取本地投影表计数，不展开查询具体用户。
     */
    async getRoleImpactSummary(roleIds: number[]): Promise<RoleImpactSummary> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        if (uniqueRoleIds.length === 0) {
            return {
                roleCount: 0,
                affectedGroupCount: 0,
                directUserAssignmentCount: 0,
                groupMemberAssignmentCount: 0,
                affectedUserEstimate: 0
            };
        }

        const [directUserAssignmentCount, groupRoleGroups] = await Promise.all([
            this.prismaService.spiceDbUserRoleProjection.count({
                where: {
                    roleId: {
                        in: uniqueRoleIds
                    }
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.groupBy({
                by: ['groupId'],
                where: {
                    roleId: {
                        in: uniqueRoleIds
                    }
                },
                _count: {
                    _all: true
                }
            })
        ]);
        const groupIds = this.uniqueNumbers(groupRoleGroups.map((group) => group.groupId));
        const groupMemberGroups =
            groupIds.length === 0
                ? []
                : await this.prismaService.spiceDbUserGroupMemberProjection.groupBy({
                      by: ['groupId'],
                      where: {
                          groupId: {
                              in: groupIds
                          }
                      },
                      _count: {
                          _all: true
                      }
                  });
        const groupMemberAssignmentCount = groupMemberGroups.reduce((count, group) => count + group._count._all, 0);

        return {
            roleCount: uniqueRoleIds.length,
            affectedGroupCount: groupIds.length,
            directUserAssignmentCount,
            groupMemberAssignmentCount,
            // 这是轻量估算，用户跨多个角色或用户组时可能重复计数；精确值只在 precise 模式计算。
            affectedUserEstimate: directUserAssignmentCount + groupMemberAssignmentCount
        };
    }

    /**
     * 读取用户组分配到的角色 ID，供用户组详情和关系视图复用。
     */
    async getGroupRoleIds(groupId: number): Promise<number[]> {
        const roleIdMap = await this.getBatchGroupRoleIds([groupId]);
        return roleIdMap.get(groupId) ?? [];
    }

    /**
     * 批量读取用户组分配到的角色 ID，供用户详情按组展示角色时避免 N+1。
     */
    async getBatchGroupRoleIds(groupIds: number[]): Promise<Map<number, number[]>> {
        const uniqueGroupIds = [...new Set(groupIds)].filter((groupId) => Number.isInteger(groupId) && groupId > 0);
        const roleIdSets = new Map(uniqueGroupIds.map((groupId) => [groupId, new Set<number>()]));
        if (uniqueGroupIds.length === 0) {
            return this.toSortedNumberMap(roleIdSets);
        }

        const projections = await this.prismaService.spiceDbUserGroupRoleProjection.findMany({
            where: {
                groupId: {
                    in: uniqueGroupIds
                }
            },
            orderBy: [
                {
                    groupId: 'asc'
                },
                {
                    roleId: 'asc'
                }
            ]
        });

        for (const projection of projections) {
            roleIdSets.get(projection.groupId)?.add(projection.roleId);
        }

        return this.toSortedNumberMap(roleIdSets);
    }

    /**
     * 读取角色可查看的菜单 ID，默认使用 viewer 关系。
     */
    async getRoleMenuIds(roleId: number, relation: string | string[] = 'viewer'): Promise<number[]> {
        const menuIds = await this.getMenuIdsByRoleIds([roleId], relation);
        return menuIds;
    }

    /**
     * 批量读取角色可查看的菜单 ID，供用户组关系视图按角色汇总菜单。
     */
    async getMenuIdsByRoleIds(roleIds: number[], relation: string | string[] = 'viewer'): Promise<number[]> {
        const uniqueRoleIds = [...new Set(roleIds)].filter((roleId) => Number.isInteger(roleId) && roleId > 0);
        if (uniqueRoleIds.length === 0) {
            return [];
        }
        const relations = Array.isArray(relation) ? relation : [relation];

        const projections = await this.prismaService.spiceDbMenuRoleProjection.findMany({
            where: {
                roleId: {
                    in: uniqueRoleIds
                },
                relation: {
                    in: relations
                }
            },
            select: {
                menuId: true
            },
            orderBy: {
                menuId: 'asc'
            }
        });

        return [...new Set(projections.map((projection) => projection.menuId))];
    }

    /**
     * 读取菜单授权的角色 ID，默认使用 viewer 关系。
     */
    async getMenuViewerRoleIds(menuId: number, relation = 'viewer'): Promise<number[]> {
        if (!Number.isInteger(menuId) || menuId <= 0) {
            return [];
        }

        const projections = await this.prismaService.spiceDbMenuRoleProjection.findMany({
            where: {
                menuId,
                relation
            },
            select: {
                roleId: true
            },
            orderBy: {
                roleId: 'asc'
            }
        });

        return [...new Set(projections.map((projection) => projection.roleId))];
    }

    /**
     * 通过本地投影计算用户可见菜单 ID。普通用户走角色菜单投影，super_admin 走全部菜单。
     */
    async getVisibleMenuIdsByUserId(userId: string): Promise<number[]> {
        if (userId.trim().length === 0) {
            return [];
        }

        const roleIdMap = await this.getBatchUserEffectiveRoleIds([userId]);
        const roleIds = roleIdMap.get(userId) ?? [];
        if (roleIds.length === 0) {
            return [];
        }

        const roleIndex = await this.getEnabledRoleIndex(roleIds);
        if ([...roleIndex.values()].some((role) => role.isSuperAdmin)) {
            return await this.getAllMenuIds();
        }

        return await this.getMenuIdsByRoleIds(roleIds, ['viewer', 'manager']);
    }

    /**
     * 通过本地投影计算菜单可见用户 ID，包含角色授权用户和 super_admin 用户。
     */
    async getVisibleUserIdsByMenuId(menuId: number): Promise<string[]> {
        if (!Number.isInteger(menuId) || menuId <= 0) {
            return [];
        }

        const [menuRoleIds, superAdminRoleIds] = await Promise.all([
            this.getMenuRoleIds(menuId, ['viewer', 'manager']),
            this.getSuperAdminRoleIds()
        ]);
        const roleIds = this.uniqueNumbers([...menuRoleIds, ...superAdminRoleIds]);
        const userIdMap = await this.getBatchRoleEffectiveUserIds(roleIds);

        return [...new Set([...userIdMap.values()].flat())].sort();
    }

    /**
     * 批量读取用户直接角色 ID，供用户列表避免逐条读取 SpiceDB。
     */
    async getBatchUserDirectRoleIds(userIds: string[]): Promise<Map<string, number[]>> {
        const uniqueUserIds = [...new Set(userIds)].filter((userId) => userId.trim().length > 0);
        const roleIdSets = this.createUserRoleIdSetMap(uniqueUserIds);
        if (uniqueUserIds.length === 0) {
            return this.toSortedRoleIdMap(roleIdSets);
        }

        const projections = await this.prismaService.spiceDbUserRoleProjection.findMany({
            where: {
                userId: {
                    in: uniqueUserIds
                }
            },
            orderBy: [
                {
                    userId: 'asc'
                },
                {
                    roleId: 'asc'
                }
            ]
        });

        for (const projection of projections) {
            roleIdSets.get(projection.userId)?.add(projection.roleId);
        }

        return this.toSortedRoleIdMap(roleIdSets);
    }

    /**
     * 批量计算用户有效角色 ID，使用投影表和 role/user_group 业务状态模拟 role#assigned 语义。
     */
    async getBatchUserEffectiveRoleIds(userIds: string[]): Promise<Map<string, number[]>> {
        const uniqueUserIds = [...new Set(userIds)].filter((userId) => userId.trim().length > 0);
        const roleIdSets = this.createUserRoleIdSetMap(uniqueUserIds);
        if (uniqueUserIds.length === 0) {
            return this.toSortedRoleIdMap(roleIdSets);
        }

        const [directAssignments, groupMemberAssignments] = await Promise.all([
            this.prismaService.spiceDbUserRoleProjection.findMany({
                where: {
                    userId: {
                        in: uniqueUserIds
                    }
                },
                select: {
                    userId: true,
                    roleId: true
                }
            }),
            this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                where: {
                    userId: {
                        in: uniqueUserIds
                    }
                },
                select: {
                    userId: true,
                    groupId: true
                }
            })
        ]);
        const groupIds = this.uniqueNumbers(groupMemberAssignments.map((assignment) => assignment.groupId));
        const enabledGroupIds = await this.getEnabledGroupIdSet(groupIds);
        const enabledGroupMemberAssignments = groupMemberAssignments.filter((assignment) =>
            enabledGroupIds.has(assignment.groupId)
        );
        const groupRoleAssignments =
            enabledGroupIds.size > 0
                ? await this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                      where: {
                          groupId: {
                              in: [...enabledGroupIds]
                          }
                      },
                      select: {
                          groupId: true,
                          roleId: true
                      }
                  })
                : [];
        const groupRoleIdMap = new Map<number, number[]>();
        for (const assignment of groupRoleAssignments) {
            groupRoleIdMap.set(assignment.groupId, [
                ...(groupRoleIdMap.get(assignment.groupId) ?? []),
                assignment.roleId
            ]);
        }
        const roleIds = this.uniqueNumbers([
            ...directAssignments.map((assignment) => assignment.roleId),
            ...groupRoleAssignments.map((assignment) => assignment.roleId)
        ]);
        const enabledRoleIds = await this.getEnabledRoleIdSet(roleIds);

        for (const assignment of directAssignments) {
            if (enabledRoleIds.has(assignment.roleId)) {
                roleIdSets.get(assignment.userId)?.add(assignment.roleId);
            }
        }

        for (const assignment of enabledGroupMemberAssignments) {
            for (const roleId of groupRoleIdMap.get(assignment.groupId) ?? []) {
                if (enabledRoleIds.has(roleId)) {
                    roleIdSets.get(assignment.userId)?.add(roleId);
                }
            }
        }

        return this.toSortedRoleIdMap(roleIdSets);
    }

    /**
     * 批量计算角色命中的用户 ID，使用直接用户投影和启用用户组成员投影。
     */
    private async getBatchRoleEffectiveUserIds(roleIds: number[]): Promise<Map<number, string[]>> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        const userIdSets = new Map(uniqueRoleIds.map((roleId) => [roleId, new Set<string>()]));
        if (uniqueRoleIds.length === 0) {
            return this.toSortedStringMap(userIdSets);
        }

        const enabledRoleIds = await this.getEnabledRoleIdSet(uniqueRoleIds);
        if (enabledRoleIds.size === 0) {
            return this.toSortedStringMap(userIdSets);
        }

        const [directAssignments, groupAssignments] = await Promise.all([
            this.prismaService.spiceDbUserRoleProjection.findMany({
                where: {
                    roleId: {
                        in: [...enabledRoleIds]
                    }
                },
                select: {
                    roleId: true,
                    userId: true
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                where: {
                    roleId: {
                        in: [...enabledRoleIds]
                    }
                },
                select: {
                    roleId: true,
                    groupId: true
                }
            })
        ]);
        const groupIds = this.uniqueNumbers(groupAssignments.map((assignment) => assignment.groupId));
        const enabledGroupIds = await this.getEnabledGroupIdSet(groupIds);
        const groupMembers =
            enabledGroupIds.size > 0
                ? await this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                      where: {
                          groupId: {
                              in: [...enabledGroupIds]
                          }
                      },
                      select: {
                          groupId: true,
                          userId: true
                      }
                  })
                : [];
        const groupMemberMap = new Map<number, string[]>();
        for (const member of groupMembers) {
            groupMemberMap.set(member.groupId, [...(groupMemberMap.get(member.groupId) ?? []), member.userId]);
        }

        for (const assignment of directAssignments) {
            userIdSets.get(assignment.roleId)?.add(assignment.userId);
        }
        for (const assignment of groupAssignments) {
            if (!enabledGroupIds.has(assignment.groupId)) {
                continue;
            }
            for (const userId of groupMemberMap.get(assignment.groupId) ?? []) {
                userIdSets.get(assignment.roleId)?.add(userId);
            }
        }

        return this.toSortedStringMap(userIdSets);
    }

    private async getMenuRoleIds(menuId: number, relations: string[]): Promise<number[]> {
        const projections = await this.prismaService.spiceDbMenuRoleProjection.findMany({
            where: {
                menuId,
                relation: {
                    in: relations
                }
            },
            select: {
                roleId: true
            },
            orderBy: {
                roleId: 'asc'
            }
        });

        return this.uniqueNumbers(projections.map((projection) => projection.roleId));
    }

    private async getAllMenuIds(): Promise<number[]> {
        const menus = await this.prismaService.rbacMenu.findMany({
            select: {
                id: true
            },
            orderBy: [
                {
                    order: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return menus.map((menu) => menu.id);
    }

    private async getSuperAdminRoleIds(): Promise<number[]> {
        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                isSuperAdmin: true,
                status: RbacStatus.ENABLE
            },
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        });

        return roles.map((role) => role.id);
    }

    private async getEnabledRoleIndex(
        roleIds: number[]
    ): Promise<Map<number, { id: number; code: string; isSuperAdmin: boolean }>> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        if (uniqueRoleIds.length === 0) {
            return new Map();
        }

        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                status: RbacStatus.ENABLE
            },
            select: {
                id: true,
                code: true,
                isSuperAdmin: true
            }
        });

        return new Map(roles.map((role) => [role.id, role]));
    }

    private async getEnabledRoleIdSet(roleIds: number[]): Promise<Set<number>> {
        return new Set((await this.getEnabledRoleIndex(roleIds)).keys());
    }

    private async getEnabledGroupIdSet(groupIds: number[]): Promise<Set<number>> {
        const uniqueGroupIds = this.uniqueNumbers(groupIds);
        if (uniqueGroupIds.length === 0) {
            return new Set();
        }

        const groups = await this.prismaService.rbacUserGroup.findMany({
            where: {
                id: {
                    in: uniqueGroupIds
                },
                status: RbacStatus.ENABLE
            },
            select: {
                id: true
            }
        });

        return new Set(groups.map((group) => group.id));
    }

    /**
     * 从 SpiceDB 读取全部基础关系并转换成投影行。
     */
    private async readDesiredProjectionRelations(zedToken?: string | null): Promise<ProjectionRelationSets> {
        const [userGroupMembers, userRoles, userGroupRoles, menuRoles] = await Promise.all([
            this.spiceDbAuthorizationService.getAllUserGroupMemberRelations(zedToken),
            this.spiceDbAuthorizationService.getAllUserRoleRelations(zedToken),
            this.spiceDbAuthorizationService.getAllUserGroupRoleRelations(zedToken),
            this.spiceDbAuthorizationService.getAllMenuRoleRelations(zedToken)
        ]);

        return {
            userGroupMembers: this.normalizeUserGroupMemberRelations(
                userGroupMembers.map((relation) => ({
                    ...relation,
                    zedToken
                }))
            ),
            userRoles: this.normalizeUserRoleRelations(
                userRoles.map((relation) => ({
                    ...relation,
                    zedToken
                }))
            ),
            userGroupRoles: this.normalizeUserGroupRoleRelations(
                userGroupRoles.map((relation) => ({
                    ...relation,
                    zedToken
                }))
            ),
            menuRoles: this.normalizeMenuRoleRelations(
                menuRoles.map((relation) => ({
                    ...relation,
                    zedToken
                }))
            )
        };
    }

    /**
     * 统计当前全部关系投影行数，供重建结果报告使用。
     */
    private async countCurrentProjectionRelations(): Promise<Record<keyof ProjectionRelationSets, number>> {
        const [userGroupMembers, userRoles, userGroupRoles, menuRoles] = await Promise.all([
            this.prismaService.spiceDbUserGroupMemberProjection.count(),
            this.prismaService.spiceDbUserRoleProjection.count(),
            this.prismaService.spiceDbUserGroupRoleProjection.count(),
            this.prismaService.spiceDbMenuRoleProjection.count()
        ]);

        return {
            userGroupMembers,
            userRoles,
            userGroupRoles,
            menuRoles
        };
    }

    /**
     * 读取当前四张关系投影表的轻量字段，供检测和差异对账共用。
     */
    private async readCurrentProjectionRelations(): Promise<CurrentProjectionRelationSets> {
        const [userGroupMembers, userRoles, userGroupRoles, menuRoles] = await Promise.all([
            this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                select: {
                    userId: true,
                    groupId: true
                }
            }),
            this.prismaService.spiceDbUserRoleProjection.findMany({
                select: {
                    userId: true,
                    roleId: true
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                select: {
                    groupId: true,
                    roleId: true
                }
            }),
            this.prismaService.spiceDbMenuRoleProjection.findMany({
                select: {
                    menuId: true,
                    roleId: true,
                    relation: true
                }
            })
        ]);

        return {
            userGroupMembers,
            userRoles,
            userGroupRoles,
            menuRoles
        };
    }

    /**
     * 计算 SpiceDB 目标关系与本地投影关系的分表差异。
     */
    private createProjectionDiffs(
        desiredRelations: ProjectionRelationSets,
        currentRelations: CurrentProjectionRelationSets
    ) {
        return {
            userGroupMembers: this.diffProjectionRelations(
                desiredRelations.userGroupMembers,
                currentRelations.userGroupMembers,
                (relation) => this.createUserGroupMemberProjectionKey(relation),
                (relation) => this.createUserGroupMemberProjectionKey(relation)
            ),
            userRoles: this.diffProjectionRelations(
                desiredRelations.userRoles,
                currentRelations.userRoles,
                (relation) => this.createUserRoleProjectionKey(relation),
                (relation) => this.createUserRoleProjectionKey(relation)
            ),
            userGroupRoles: this.diffProjectionRelations(
                desiredRelations.userGroupRoles,
                currentRelations.userGroupRoles,
                (relation) => this.createUserGroupRoleProjectionKey(relation),
                (relation) => this.createUserGroupRoleProjectionKey(relation)
            ),
            menuRoles: this.diffProjectionRelations(
                desiredRelations.menuRoles,
                currentRelations.menuRoles,
                (relation) => this.createMenuRoleProjectionKey(relation),
                (relation) => this.createMenuRoleProjectionKey(relation)
            )
        };
    }

    /**
     * 创建全量重建后的分表与总计统计。
     */
    private createRebuildResult(
        desiredRelations: ProjectionRelationSets,
        currentCounts: Record<keyof ProjectionRelationSets, number>
    ): BaseRelationProjectionReconcileResult {
        return this.createProjectionResult({
            userGroupMembers: this.createProjectionStats(
                desiredRelations.userGroupMembers.length,
                currentCounts.userGroupMembers,
                desiredRelations.userGroupMembers.length,
                currentCounts.userGroupMembers
            ),
            userRoles: this.createProjectionStats(
                desiredRelations.userRoles.length,
                currentCounts.userRoles,
                desiredRelations.userRoles.length,
                currentCounts.userRoles
            ),
            userGroupRoles: this.createProjectionStats(
                desiredRelations.userGroupRoles.length,
                currentCounts.userGroupRoles,
                desiredRelations.userGroupRoles.length,
                currentCounts.userGroupRoles
            ),
            menuRoles: this.createProjectionStats(
                desiredRelations.menuRoles.length,
                currentCounts.menuRoles,
                desiredRelations.menuRoles.length,
                currentCounts.menuRoles
            )
        });
    }

    /**
     * 创建差异对账后的分表与总计统计。
     */
    private createReconcileResult(diffs: {
        userGroupMembers: ProjectionDiff<unknown, unknown>;
        userRoles: ProjectionDiff<unknown, unknown>;
        userGroupRoles: ProjectionDiff<unknown, unknown>;
        menuRoles: ProjectionDiff<unknown, unknown>;
    }): BaseRelationProjectionReconcileResult {
        return this.createProjectionResult({
            userGroupMembers: this.createProjectionStats(
                diffs.userGroupMembers.current.length -
                    diffs.userGroupMembers.stale.length +
                    diffs.userGroupMembers.missing.length,
                diffs.userGroupMembers.current.length,
                diffs.userGroupMembers.missing.length,
                diffs.userGroupMembers.stale.length
            ),
            userRoles: this.createProjectionStats(
                diffs.userRoles.current.length - diffs.userRoles.stale.length + diffs.userRoles.missing.length,
                diffs.userRoles.current.length,
                diffs.userRoles.missing.length,
                diffs.userRoles.stale.length
            ),
            userGroupRoles: this.createProjectionStats(
                diffs.userGroupRoles.current.length -
                    diffs.userGroupRoles.stale.length +
                    diffs.userGroupRoles.missing.length,
                diffs.userGroupRoles.current.length,
                diffs.userGroupRoles.missing.length,
                diffs.userGroupRoles.stale.length
            ),
            menuRoles: this.createProjectionStats(
                diffs.menuRoles.current.length - diffs.menuRoles.stale.length + diffs.menuRoles.missing.length,
                diffs.menuRoles.current.length,
                diffs.menuRoles.missing.length,
                diffs.menuRoles.stale.length
            )
        });
    }

    /**
     * 汇总各投影表统计，方便运维判断本次修复规模。
     */
    private createProjectionResult(
        stats: Omit<BaseRelationProjectionReconcileResult, 'total'>
    ): BaseRelationProjectionReconcileResult {
        const values = Object.values(stats);
        return {
            ...stats,
            total: this.createProjectionStats(
                values.reduce((sum, item) => sum + item.desiredCount, 0),
                values.reduce((sum, item) => sum + item.currentCount, 0),
                values.reduce((sum, item) => sum + item.missingCount, 0),
                values.reduce((sum, item) => sum + item.staleCount, 0)
            )
        };
    }

    /**
     * 创建单张投影表的对账统计对象。
     */
    private createProjectionStats(
        desiredCount: number,
        currentCount: number,
        missingCount: number,
        staleCount: number
    ): ProjectionReconcileStats {
        return {
            desiredCount,
            currentCount,
            missingCount,
            staleCount
        };
    }

    /**
     * 对比目标关系和当前投影，找出需要新增和删除的行。
     */
    private diffProjectionRelations<TDesired, TCurrent>(
        desiredRelations: TDesired[],
        currentRelations: TCurrent[],
        createDesiredKey: (relation: TDesired) => string,
        createCurrentKey: (relation: TCurrent) => string
    ): ProjectionDiff<TCurrent, TDesired> {
        const desiredIndex = new Map(desiredRelations.map((relation) => [createDesiredKey(relation), relation]));
        const currentIndex = new Map(currentRelations.map((relation) => [createCurrentKey(relation), relation]));

        return {
            current: currentRelations,
            missing: desiredRelations.filter((relation) => !currentIndex.has(createDesiredKey(relation))),
            stale: currentRelations.filter((relation) => !desiredIndex.has(createCurrentKey(relation)))
        };
    }

    /**
     * 批量删除用户组成员投影差异行。
     */
    private async deleteUserGroupMemberProjectionRows(
        tx: ProjectionTransactionClient,
        relations: Array<Pick<UserGroupMemberProjectionInput, 'userId' | 'groupId'>>
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            await tx.spiceDbUserGroupMemberProjection.deleteMany({
                where: {
                    OR: relationChunk.map((relation) => ({
                        userId: relation.userId,
                        groupId: relation.groupId
                    }))
                }
            });
        }
    }

    /**
     * 批量删除用户直接角色投影差异行。
     */
    private async deleteUserRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: Array<Pick<UserRoleProjectionInput, 'userId' | 'roleId'>>
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            await tx.spiceDbUserRoleProjection.deleteMany({
                where: {
                    OR: relationChunk.map((relation) => ({
                        userId: relation.userId,
                        roleId: relation.roleId
                    }))
                }
            });
        }
    }

    /**
     * 批量删除用户组角色投影差异行。
     */
    private async deleteUserGroupRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: Array<Pick<UserGroupRoleProjectionInput, 'groupId' | 'roleId'>>
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            await tx.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    OR: relationChunk.map((relation) => ({
                        groupId: relation.groupId,
                        roleId: relation.roleId
                    }))
                }
            });
        }
    }

    /**
     * 批量删除菜单角色投影差异行。
     */
    private async deleteMenuRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: Array<Pick<MenuRoleProjectionInput, 'menuId' | 'roleId' | 'relation'>>
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            await tx.spiceDbMenuRoleProjection.deleteMany({
                where: {
                    OR: relationChunk.map((relation) => ({
                        menuId: relation.menuId,
                        roleId: relation.roleId,
                        relation: relation.relation
                    }))
                }
            });
        }
    }

    /**
     * 创建用户到角色集合的空索引。
     */
    private createUserRoleIdSetMap(userIds: string[]): Map<string, Set<number>> {
        return new Map(userIds.map((userId) => [userId, new Set<number>()]));
    }

    /**
     * 将用户角色 Set 索引转换为稳定排序数组。
     */
    private toSortedRoleIdMap(roleIdSets: Map<string, Set<number>>): Map<string, number[]> {
        return new Map(
            [...roleIdSets.entries()].map(([userId, roleIds]) => [
                userId,
                [...roleIds].sort((left, right) => left - right)
            ])
        );
    }

    /**
     * 将数字集合索引转换为稳定排序数组。
     */
    private toSortedNumberMap(numberSets: Map<number, Set<number>>): Map<number, number[]> {
        return new Map(
            [...numberSets.entries()].map(([key, valueSet]) => [key, [...valueSet].sort((left, right) => left - right)])
        );
    }

    /**
     * 将字符串集合索引转换为稳定排序数组。
     */
    private toSortedStringMap(stringSets: Map<number, Set<string>>): Map<number, string[]> {
        return new Map([...stringSets.entries()].map(([key, valueSet]) => [key, [...valueSet].sort()]));
    }

    /**
     * 过滤并排序正整数 ID，供批量聚合查询稳定复用。
     */
    private uniqueNumbers(values: number[]): number[] {
        return [...new Set(values)]
            .filter((value) => Number.isInteger(value) && value > 0)
            .sort((left, right) => left - right);
    }

    /**
     * 写入用户组成员投影数据时批量拆分，避免单次 createMany 负载过大。
     */
    private async createUserGroupMemberProjectionRows(
        tx: ProjectionTransactionClient,
        relations: UserGroupMemberProjectionInput[]
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            if (relationChunk.length === 0) {
                continue;
            }
            await tx.spiceDbUserGroupMemberProjection.createMany({
                data: relationChunk,
                skipDuplicates: true
            });
        }
    }

    /**
     * 写入用户直接角色投影数据时批量拆分，避免单次 createMany 负载过大。
     */
    private async createUserRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: UserRoleProjectionInput[]
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            if (relationChunk.length === 0) {
                continue;
            }
            await tx.spiceDbUserRoleProjection.createMany({
                data: relationChunk,
                skipDuplicates: true
            });
        }
    }

    /**
     * 写入用户组角色投影数据时批量拆分，避免单次 createMany 负载过大。
     */
    private async createUserGroupRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: UserGroupRoleProjectionInput[]
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            if (relationChunk.length === 0) {
                continue;
            }
            await tx.spiceDbUserGroupRoleProjection.createMany({
                data: relationChunk,
                skipDuplicates: true
            });
        }
    }

    /**
     * 写入菜单角色投影数据时批量拆分，避免单次 createMany 负载过大。
     */
    private async createMenuRoleProjectionRows(
        tx: ProjectionTransactionClient,
        relations: MenuRoleProjectionInput[]
    ): Promise<void> {
        for (const relationChunk of this.chunk(relations, this.writeChunkSize)) {
            if (relationChunk.length === 0) {
                continue;
            }
            await tx.spiceDbMenuRoleProjection.createMany({
                data: relationChunk,
                skipDuplicates: true
            });
        }
    }

    /**
     * 根据投影变更类型写入对应投影表，重复事件使用 upsert 保持幂等。
     */
    private async upsertProjectionChange(tx: ProjectionTransactionClient, change: ProjectionChange): Promise<void> {
        if (change.type === 'userGroupMember') {
            await tx.spiceDbUserGroupMemberProjection.upsert({
                where: {
                    userId_groupId: {
                        userId: change.data.userId,
                        groupId: change.data.groupId
                    }
                },
                create: change.data,
                update: {
                    zedToken: change.data.zedToken ?? null
                }
            });
            return;
        }

        if (change.type === 'userRole') {
            await tx.spiceDbUserRoleProjection.upsert({
                where: {
                    userId_roleId: {
                        userId: change.data.userId,
                        roleId: change.data.roleId
                    }
                },
                create: change.data,
                update: {
                    zedToken: change.data.zedToken ?? null
                }
            });
            return;
        }

        if (change.type === 'userGroupRole') {
            await tx.spiceDbUserGroupRoleProjection.upsert({
                where: {
                    groupId_roleId: {
                        groupId: change.data.groupId,
                        roleId: change.data.roleId
                    }
                },
                create: change.data,
                update: {
                    zedToken: change.data.zedToken ?? null
                }
            });
            return;
        }

        await tx.spiceDbMenuRoleProjection.upsert({
            where: {
                menuId_roleId_relation: {
                    menuId: change.data.menuId,
                    roleId: change.data.roleId,
                    relation: change.data.relation
                }
            },
            create: change.data,
            update: {
                zedToken: change.data.zedToken ?? null
            }
        });
    }

    /**
     * 根据投影变更类型删除对应投影表记录，重复删除使用 deleteMany 保持幂等。
     */
    private async deleteProjectionChange(tx: ProjectionTransactionClient, change: ProjectionChange): Promise<void> {
        if (change.type === 'userGroupMember') {
            await tx.spiceDbUserGroupMemberProjection.deleteMany({
                where: {
                    userId: change.data.userId,
                    groupId: change.data.groupId
                }
            });
            return;
        }

        if (change.type === 'userRole') {
            await tx.spiceDbUserRoleProjection.deleteMany({
                where: {
                    userId: change.data.userId,
                    roleId: change.data.roleId
                }
            });
            return;
        }

        if (change.type === 'userGroupRole') {
            await tx.spiceDbUserGroupRoleProjection.deleteMany({
                where: {
                    groupId: change.data.groupId,
                    roleId: change.data.roleId
                }
            });
            return;
        }

        await tx.spiceDbMenuRoleProjection.deleteMany({
            where: {
                menuId: change.data.menuId,
                roleId: change.data.roleId,
                relation: change.data.relation
            }
        });
    }

    /**
     * 把 SpiceDB Watch 事件解析成当前项目支持的关系投影变更。
     */
    private parseProjectionChange(event: AdminSpiceDbRelationshipChangeEvent): ProjectionChange | null {
        const zedToken = event.zedToken ?? null;
        const userGroupMember = this.parseUserGroupMemberEvent(event, zedToken);
        if (userGroupMember) {
            return userGroupMember;
        }

        const userRole = this.parseUserRoleEvent(event, zedToken);
        if (userRole) {
            return userRole;
        }

        const userGroupRole = this.parseUserGroupRoleEvent(event, zedToken);
        if (userGroupRole) {
            return userGroupRole;
        }

        return this.parseMenuRoleEvent(event, zedToken);
    }

    /**
     * 解析 user_group#member@user 事件。
     */
    private parseUserGroupMemberEvent(
        event: AdminSpiceDbRelationshipChangeEvent,
        zedToken?: string | null
    ): ProjectionChange | null {
        if (
            event.resourceType !== 'user_group' ||
            event.relation !== 'member' ||
            event.subjectType !== 'user' ||
            !event.resourceId ||
            !event.subjectId
        ) {
            return null;
        }

        const groupId = Number(event.resourceId);
        if (!Number.isInteger(groupId) || event.subjectId.trim().length === 0) {
            return null;
        }

        return {
            type: 'userGroupMember',
            operation: event.operation,
            data: {
                userId: event.subjectId,
                groupId,
                zedToken
            }
        };
    }

    /**
     * 解析 role#assignee@user 事件。
     */
    private parseUserRoleEvent(
        event: AdminSpiceDbRelationshipChangeEvent,
        zedToken?: string | null
    ): ProjectionChange | null {
        if (
            event.resourceType !== 'role' ||
            event.relation !== 'assignee' ||
            event.subjectType !== 'user' ||
            !event.resourceId ||
            !event.subjectId
        ) {
            return null;
        }

        const roleId = Number(event.resourceId);
        if (!Number.isInteger(roleId) || event.subjectId.trim().length === 0) {
            return null;
        }

        return {
            type: 'userRole',
            operation: event.operation,
            data: {
                userId: event.subjectId,
                roleId,
                zedToken
            }
        };
    }

    /**
     * 解析 role#assignee@user_group 事件。
     */
    private parseUserGroupRoleEvent(
        event: AdminSpiceDbRelationshipChangeEvent,
        zedToken?: string | null
    ): ProjectionChange | null {
        if (
            event.resourceType !== 'role' ||
            event.relation !== 'assignee' ||
            event.subjectType !== 'user_group' ||
            !event.resourceId ||
            !event.subjectId
        ) {
            return null;
        }

        const roleId = Number(event.resourceId);
        const groupId = Number(event.subjectId);
        if (!Number.isInteger(roleId) || !Number.isInteger(groupId)) {
            return null;
        }

        return {
            type: 'userGroupRole',
            operation: event.operation,
            data: {
                groupId,
                roleId,
                zedToken
            }
        };
    }

    /**
     * 解析 menu#viewer@role 和 menu#manager@role 事件。
     */
    private parseMenuRoleEvent(
        event: AdminSpiceDbRelationshipChangeEvent,
        zedToken?: string | null
    ): ProjectionChange | null {
        if (
            event.resourceType !== 'menu' ||
            !event.relation ||
            !this.menuRoleRelations.has(event.relation) ||
            event.subjectType !== 'role' ||
            !event.resourceId ||
            !event.subjectId
        ) {
            return null;
        }

        const menuId = Number(event.resourceId);
        const roleId = Number(event.subjectId);
        if (!Number.isInteger(menuId) || !Number.isInteger(roleId)) {
            return null;
        }

        return {
            type: 'menuRole',
            operation: event.operation,
            data: {
                menuId,
                roleId,
                relation: event.relation,
                zedToken
            }
        };
    }

    /**
     * 判断 SpiceDB Watch 事件是否表示关系创建。
     */
    private isCreateOperation(operation: string): boolean {
        return ['OPERATION_CREATE', 'OPERATION_TOUCH'].includes(operation);
    }

    /**
     * 判断 SpiceDB Watch 事件是否表示关系删除。
     */
    private isDeleteOperation(operation: string): boolean {
        return operation === 'OPERATION_DELETE';
    }

    /**
     * 标准化用户组成员关系，去重并剔除非法用户或用户组 ID。
     */
    private normalizeUserGroupMemberRelations(
        relations: Array<UserGroupMemberRelation & { zedToken?: string | null }>
    ) {
        const relationIndex = new Map<string, UserGroupMemberProjectionInput>();

        for (const relation of relations) {
            if (relation.userId.trim().length === 0 || !Number.isInteger(relation.groupId) || relation.groupId <= 0) {
                continue;
            }

            relationIndex.set(this.createUserGroupMemberProjectionKey(relation), {
                userId: relation.userId,
                groupId: relation.groupId,
                zedToken: relation.zedToken ?? null
            });
        }

        return [...relationIndex.values()];
    }

    /**
     * 标准化用户直接角色关系，去重并剔除非法用户或角色 ID。
     */
    private normalizeUserRoleRelations(relations: Array<UserRoleRelation & { zedToken?: string | null }>) {
        const relationIndex = new Map<string, UserRoleProjectionInput>();

        for (const relation of relations) {
            if (relation.userId.trim().length === 0 || !Number.isInteger(relation.roleId) || relation.roleId <= 0) {
                continue;
            }

            relationIndex.set(`${relation.userId}:${relation.roleId}`, {
                userId: relation.userId,
                roleId: relation.roleId,
                zedToken: relation.zedToken ?? null
            });
        }

        return [...relationIndex.values()];
    }

    /**
     * 标准化用户组角色关系，去重并剔除非法用户组或角色 ID。
     */
    private normalizeUserGroupRoleRelations(relations: Array<UserGroupRoleRelation & { zedToken?: string | null }>) {
        const relationIndex = new Map<string, UserGroupRoleProjectionInput>();

        for (const relation of relations) {
            if (
                !Number.isInteger(relation.groupId) ||
                relation.groupId <= 0 ||
                !Number.isInteger(relation.roleId) ||
                relation.roleId <= 0
            ) {
                continue;
            }

            relationIndex.set(`${relation.groupId}:${relation.roleId}`, {
                groupId: relation.groupId,
                roleId: relation.roleId,
                zedToken: relation.zedToken ?? null
            });
        }

        return [...relationIndex.values()];
    }

    /**
     * 标准化菜单角色关系，去重并剔除非法菜单、角色或关系名。
     */
    private normalizeMenuRoleRelations(relations: Array<MenuRoleRelation & { zedToken?: string | null }>) {
        const relationIndex = new Map<string, MenuRoleProjectionInput>();

        for (const relation of relations) {
            if (
                !Number.isInteger(relation.menuId) ||
                relation.menuId <= 0 ||
                !Number.isInteger(relation.roleId) ||
                relation.roleId <= 0 ||
                !this.menuRoleRelations.has(relation.relation)
            ) {
                continue;
            }

            relationIndex.set(`${relation.menuId}:${relation.roleId}:${relation.relation}`, {
                menuId: relation.menuId,
                roleId: relation.roleId,
                relation: relation.relation,
                zedToken: relation.zedToken ?? null
            });
        }

        return [...relationIndex.values()];
    }

    /**
     * 生成用户组成员投影复合 key，供投影差异计算使用。
     */
    private createUserGroupMemberProjectionKey(
        relation: Pick<UserGroupMemberProjectionInput, 'userId' | 'groupId'>
    ): string {
        return `${relation.userId}:${relation.groupId}`;
    }

    /**
     * 生成用户直接角色投影复合 key，供投影差异计算使用。
     */
    private createUserRoleProjectionKey(relation: Pick<UserRoleProjectionInput, 'userId' | 'roleId'>): string {
        return `${relation.userId}:${relation.roleId}`;
    }

    /**
     * 生成用户组角色投影复合 key，供投影差异计算使用。
     */
    private createUserGroupRoleProjectionKey(
        relation: Pick<UserGroupRoleProjectionInput, 'groupId' | 'roleId'>
    ): string {
        return `${relation.groupId}:${relation.roleId}`;
    }

    /**
     * 生成菜单角色投影复合 key，供投影差异计算使用。
     */
    private createMenuRoleProjectionKey(
        relation: Pick<MenuRoleProjectionInput, 'menuId' | 'roleId' | 'relation'>
    ): string {
        return `${relation.menuId}:${relation.roleId}:${relation.relation}`;
    }

    /**
     * 按固定大小拆分数组，避免 SQL 语句过长。
     */
    private chunk<T>(items: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }
}
