import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { Prisma, RbacStatus } from '@app/prisma-app/generated/client';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { Traceable } from 'nestjs-otel';
import { AdminUserAdminService } from '../../better-auth/admin-user-admin.service';
import { isActiveBetterAuthBan } from '../../better-auth/better-auth-ban';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import {
    QueryUserAssignableRoleDto,
    QueryUserAssignableUserGroupDto,
    CreateUserDto,
    QueryUserListDto,
    QueryUserRelationMenuDto,
    QueryUserRelationRoleDto,
    QueryUserRelationUserGroupDto,
    QueryUserSessionsDto,
    UpdateUserDto
} from './dto/user.dto';

type AdminUserRecord = Prisma.BetterAuthUserGetPayload<{
    include: {
        profile: true;
    };
}>;

type AdminUserDetailRecord = Prisma.BetterAuthUserGetPayload<{
    include: {
        profile: true;
        accounts: {
            select: {
                id: true;
                accountId: true;
                providerId: true;
                scope: true;
                accessTokenExpiresAt: true;
                refreshTokenExpiresAt: true;
                createdAt: true;
                updatedAt: true;
            };
        };
        sessions: {
            select: {
                id: true;
                expiresAt: true;
                createdAt: true;
                updatedAt: true;
                ipAddress: true;
                userAgent: true;
                impersonatedBy: true;
            };
        };
        _count: {
            select: {
                accounts: true;
                sessions: true;
                rbacUserRoles: true;
                rbacGroupMembers: true;
                rbacEffectiveRoles: true;
                rbacEffectivePermissions: true;
                rbacVisibleMenus: true;
            };
        };
    };
}>;

type AdminUserGroupRecord = Prisma.RbacUserGroupGetPayload<Record<string, never>>;

/**
 * 把后台用户聚合记录转换成前端使用的统一结构。
 */
function toAdminUserView(
    record: AdminUserRecord,
    roleIds: number[],
    effectiveRoleIds: number[],
    userGroups: AdminUserGroupRecord[] = []
) {
    return {
        id: record.id,
        username: record.username ?? '',
        name: record.name,
        email: record.email,
        emailVerified: record.emailVerified,
        image: record.image ?? null,
        phoneNumber: record.phoneNumber ?? null,
        phoneNumberVerified: record.phoneNumberVerified ?? false,
        displayUsername: record.displayUsername ?? null,
        banned: record.banned === true,
        banReason: record.banReason ?? null,
        banExpires: record.banExpires ?? null,
        remark: record.profile?.remark ?? null,
        lastLoginAt: record.profile?.lastLoginAt ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        roleIds,
        effectiveRoleIds,
        userGroupIds: userGroups.map((group) => group.id),
        userGroups
    };
}

type AdminUserView = ReturnType<typeof toAdminUserView>;

/**
 * 提供后台用户的 Better Auth BFF 管理能力。
 */
@Traceable()
@Injectable()
export class SystemUsersService {
    private readonly logger = createRuntimeLogger(SystemUsersService.name, {
        module: 'user',
        domain: 'user',
        resource: { type: 'user' }
    });

    /**
     * 注入后台用户管理、RBAC 授权和 RBAC 读模型依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserAdminService: AdminUserAdminService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly rbacAssignmentService: SystemRbacAssignmentsService,
        private readonly rbacGraphService: SystemRbacGraphService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService,
        private readonly adminUserStateService: AdminUserStateService
    ) {}

    /**
     * upsert 后台用户资料表，只维护 Better Auth 主表之外的业务字段。
     */
    private async upsertUserProfile(
        userId: string,
        data: {
            remark?: string | null;
            createdBy?: string;
            lastLoginAt?: Date | null;
        }
    ): Promise<void> {
        await this.prismaService.betterAuthUserProfile.upsert({
            where: {
                userId
            },
            create: {
                userId,
                remark: data.remark ?? null,
                createdBy: data.createdBy ?? null,
                lastLoginAt: data.lastLoginAt ?? null
            },
            update: data
        });
    }

    private async bumpUserStateVersion(userId: string, action: string): Promise<void> {
        try {
            await this.adminUserStateService.bumpUserStateVersion(userId);
        } catch (error) {
            this.logger.warn(`${action}: bumpUserStateVersion 失败`, { error, userId });
        }
    }

    /**
     * 通过用户 ID 获取后台用户详情。
     */
    async getUserByID(id: string) {
        const user = await this.prismaService.betterAuthUser.findUnique({
            where: {
                id
            },
            include: {
                profile: true
            }
        });

        if (!user) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }

        const [directRoleIdMap, effectiveRoleIdMap] = await Promise.all([
            this.getBatchUserDirectRoleIds([id]),
            this.getBatchUserEffectiveRoleIds([id])
        ]);
        const roleIds = directRoleIdMap.get(id) ?? [];
        const effectiveRoleIds = effectiveRoleIdMap.get(id) ?? [];

        return toAdminUserView(user, roleIds, effectiveRoleIds);
    }

    /**
     * 查询后台用户详情，直接从 Better Auth 主表和 RBAC 读模型聚合，不返回密码、token 等敏感字段。
     */
    async getUserDetail(id: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_DETAIL);

        const user = (await this.prismaService.betterAuthUser.findUnique({
            where: {
                id
            },
            include: {
                profile: true,
                accounts: {
                    select: {
                        id: true,
                        accountId: true,
                        providerId: true,
                        scope: true,
                        accessTokenExpiresAt: true,
                        refreshTokenExpiresAt: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                sessions: {
                    select: {
                        id: true,
                        expiresAt: true,
                        createdAt: true,
                        updatedAt: true,
                        ipAddress: true,
                        userAgent: true,
                        impersonatedBy: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 5
                },
                _count: {
                    select: {
                        accounts: true,
                        sessions: true,
                        rbacUserRoles: true,
                        rbacGroupMembers: true,
                        rbacEffectiveRoles: true,
                        rbacEffectivePermissions: true,
                        rbacVisibleMenus: true
                    }
                }
            }
        })) as AdminUserDetailRecord | null;

        if (!user) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }

        const now = new Date();
        const [directRoleIdMap, effectiveRoleIdMap, userGroupMap, state, activeSessionCount, permissions] =
            await Promise.all([
                this.getBatchUserDirectRoleIds([id]),
                this.getBatchUserEffectiveRoleIds([id]),
                this.getBatchUserGroups([id]),
                this.rbacGraphService.getUserEffectiveState(id),
                this.prismaService.betterAuthSession.count({
                    where: {
                        userId: id,
                        expiresAt: {
                            gt: now
                        }
                    }
                }),
                this.getViewerUserPermissions(actorId)
            ]);
        const userGroups = userGroupMap.get(id) ?? [];
        const baseUser = toAdminUserView(
            user,
            directRoleIdMap.get(id) ?? [],
            effectiveRoleIdMap.get(id) ?? [],
            userGroups
        );

        return {
            ...this.withViewerUserCapabilities(baseUser, permissions),
            betterAuthUser: {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image ?? null,
                banned: user.banned ?? null,
                banReason: user.banReason ?? null,
                banExpires: user.banExpires ?? null,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                phoneNumber: user.phoneNumber ?? null,
                phoneNumberVerified: user.phoneNumberVerified ?? null,
                username: user.username ?? null,
                displayUsername: user.displayUsername ?? null
            },
            roleCount: user._count.rbacUserRoles,
            groupCount: user._count.rbacGroupMembers,
            effectiveRoleCount: user._count.rbacEffectiveRoles,
            effectivePermissionCount: user._count.rbacEffectivePermissions,
            visibleMenuCount: user._count.rbacVisibleMenus,
            accountCount: user._count.accounts,
            sessionCount: user._count.sessions,
            activeSessionCount,
            accounts: user.accounts,
            recentSessions: user.sessions,
            effectivePermissionIds: state.permissionIds,
            visibleMenuIds: state.visibleMenuIds,
            isSuperAdmin: state.isSuperAdmin
        };
    }

    /**
     * 查询后台用户关系视图初始化数据，表格明细由分页接口按需加载。
     */
    async getUserRelations(id: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        const user = await this.getUserByID(id);
        const [userGroupIds, state] = await Promise.all([
            this.getUserGroupIdsByUserId(id),
            this.rbacGraphService.getUserEffectiveState(id)
        ]);
        const directRoleIdSet = new Set(user.roleIds);
        const inheritedRoleIds = (user.effectiveRoleIds ?? []).filter((roleId) => !directRoleIdSet.has(roleId));
        const userWithCapabilities = this.withViewerUserCapabilities(
            {
                ...user,
                userGroupIds
            },
            await this.getViewerUserPermissions(actorId)
        );

        return {
            user: userWithCapabilities,
            roleIds: user.roleIds,
            groupIds: userGroupIds,
            effectiveRoleIds: state.roleIds,
            effectivePermissionIds: state.permissionIds,
            userGroupIds,
            visibleMenuIds: state.visibleMenuIds,
            inheritedRoleIds,
            isSuperAdmin: state.isSuperAdmin
        };
    }

    /**
     * 分页查询用户的角色关系，关系 ID 来源走现有投影/SpiceDB 裁决，元数据筛选在数据库侧完成。
     */
    async getUserRelationRoles(query: QueryUserRelationRoleDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        const user = await this.getUserByID(query.userId);
        const directRoleIds = user.roleIds ?? [];
        const effectiveRoleIds = user.effectiveRoleIds ?? [];
        const directRoleIdSet = new Set(directRoleIds);
        const relationRoleIds =
            query.relation === 'direct'
                ? directRoleIds
                : query.relation === 'effective'
                  ? effectiveRoleIds
                  : effectiveRoleIds.filter((roleId) => !directRoleIdSet.has(roleId));

        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            where: {
                id: {
                    in: relationRoleIds
                },
                deletedAt: null,
                ...this.buildRoleFieldWhere(query),
                ...(query.status ? { status: query.status as RbacStatus } : {})
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: {
                id: 'asc'
            }
        });

        return {
            records,
            pagination
        };
    }

    /**
     * 分页查询用户所属用户组，成员关系来源走 RBAC 用户组成员表，用户组元数据筛选在数据库侧完成。
     */
    async getUserRelationUserGroups(query: QueryUserRelationUserGroupDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        await this.getUserByID(query.userId);
        const userGroupIds = await this.getUserGroupIdsByUserId(query.userId);
        const [records, pagination] = await this.prismaService.rbacUserGroup.findManyAndCount({
            where: {
                id: {
                    in: userGroupIds
                },
                deletedAt: null,
                ...this.buildUserGroupFieldWhere(query),
                ...(query.status ? { status: query.status as RbacStatus } : {})
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: {
                id: 'asc'
            }
        });

        return {
            records: await this.attachRolesToUserGroups(records),
            pagination
        };
    }

    /**
     * 分页查询用户可见菜单。menu.view 展示态通过 RBAC 可见菜单读模型计算。
     */
    async getUserRelationMenus(query: QueryUserRelationMenuDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        await this.getUserByID(query.userId);
        const { visibleMenuIds } = await this.rbacGraphService.getUserEffectiveState(query.userId);
        const [records, pagination] = await this.prismaService.rbacMenu.findManyAndCount({
            where: {
                id: {
                    in: visibleMenuIds
                },
                ...this.buildMenuFieldWhere(query),
                ...(query.type ? { type: query.type } : {}),
                ...(query.status ? { status: query.status } : {})
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: [
                {
                    order: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return {
            records,
            pagination
        };
    }

    /**
     * 分页查询用户可分配角色。assigned 基于当前前端草稿集合计算。
     */
    async getUserAssignableRoles(query: QueryUserAssignableRoleDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        await this.getUserByID(query.userId);
        const draftRoleIdSet = new Set(query.draftRoleIds);
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.status ? { status: query.status } : {}),
                ...this.buildRoleFieldWhere(query),
                ...(query.assigned !== undefined
                    ? {
                          id: query.assigned
                              ? {
                                    in: [...draftRoleIdSet]
                                }
                              : {
                                    notIn: [...draftRoleIdSet]
                                }
                      }
                    : {})
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: [
                {
                    sort: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return {
            records: records.map((record) => ({
                ...record,
                assigned: draftRoleIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 分页查询用户可分配用户组。assigned 基于当前前端草稿集合计算。
     */
    async getUserAssignableUserGroups(query: QueryUserAssignableUserGroupDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        await this.getUserByID(query.userId);
        const draftGroupIdSet = new Set(query.draftGroupIds);
        const [records, pagination] = await this.prismaService.rbacUserGroup.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.status ? { status: query.status } : {}),
                ...this.buildUserGroupFieldWhere(query),
                ...(query.assigned !== undefined
                    ? {
                          id: query.assigned
                              ? {
                                    in: [...draftGroupIdSet]
                                }
                              : {
                                    notIn: [...draftGroupIdSet]
                                }
                      }
                    : {})
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: [
                {
                    sort: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return {
            records: records.map((record) => ({
                ...record,
                assigned: draftGroupIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 按角色 ID 查询角色元数据，并保持 DB 排序稳定。
     */
    private async findRolesByIds(roleIds: number[]) {
        const uniqueRoleIds = [...new Set(roleIds)].filter((roleId) => Number.isInteger(roleId) && roleId > 0);
        if (uniqueRoleIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                deletedAt: null
            },
            orderBy: {
                id: 'asc'
            }
        });
    }

    /**
     * 按用户组 ID 查询用户组元数据，并附带每个用户组授予的角色。
     */
    private async findUserGroupsWithRoles(groupIds: number[]) {
        const uniqueGroupIds = [...new Set(groupIds)].filter((groupId) => Number.isInteger(groupId) && groupId > 0);
        if (uniqueGroupIds.length === 0) {
            return [];
        }

        const groups = await this.prismaService.rbacUserGroup.findMany({
            where: {
                id: {
                    in: uniqueGroupIds
                },
                deletedAt: null
            },
            orderBy: {
                id: 'asc'
            }
        });
        const groupRoleIdMap = await this.getBatchGroupRoleIds(groups.map((group) => group.id));
        const allRoleIds = [...new Set([...groupRoleIdMap.values()].flat())];
        const roleRecords = await this.findRolesByIds(allRoleIds);
        const roleIndex = new Map(roleRecords.map((role) => [role.id, role]));

        return groups.map((group) => {
            const roleIds = groupRoleIdMap.get(group.id) ?? [];
            const roles = roleIds
                .map((roleId) => roleIndex.get(roleId))
                .filter((role): role is NonNullable<typeof role> => role !== undefined);
            return {
                ...group,
                roleIds,
                roles
            };
        });
    }

    /**
     * 按菜单 ID 查询菜单元数据，并保持菜单排序稳定。
     */
    private async findMenusByIds(menuIds: number[]) {
        const uniqueMenuIds = [...new Set(menuIds)].filter((menuId) => Number.isInteger(menuId) && menuId > 0);
        if (uniqueMenuIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacMenu.findMany({
            where: {
                id: {
                    in: uniqueMenuIds
                }
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
    }

    /**
     * 为用户组记录补充 RBAC 用户组角色路径，供分页关系表展示角色数量。
     */
    private async attachRolesToUserGroups(groups: AdminUserGroupRecord[]) {
        const groupRoleIdMap = await this.getBatchGroupRoleIds(groups.map((group) => group.id));
        const allRoleIds = [...new Set([...groupRoleIdMap.values()].flat())];
        const roleRecords = await this.findRolesByIds(allRoleIds);
        const roleIndex = new Map(roleRecords.map((role) => [role.id, role]));

        return groups.map((group) => {
            const roleIds = groupRoleIdMap.get(group.id) ?? [];
            const roles = roleIds
                .map((roleId) => roleIndex.get(roleId))
                .filter((role): role is NonNullable<typeof role> => role !== undefined);
            return {
                ...group,
                roleIds,
                roles
            };
        });
    }

    private async getUserGroupIdsByUserId(userId: string): Promise<number[]> {
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

    private async getUserIdsByGroupId(groupId: number): Promise<string[]> {
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

    private async getBatchUserGroups(userIds: string[]): Promise<Map<string, AdminUserGroupRecord[]>> {
        const uniqueUserIds = [...new Set(userIds)];
        const result = new Map(uniqueUserIds.map((userId) => [userId, [] as AdminUserGroupRecord[]]));
        if (uniqueUserIds.length === 0) {
            return result;
        }

        const rows = await this.prismaService.rbacUserGroupMember.findMany({
            where: {
                userId: {
                    in: uniqueUserIds
                },
                group: {
                    deletedAt: null
                }
            },
            include: {
                group: true
            }
        });
        for (const row of rows) {
            result.get(row.userId)?.push(row.group);
        }
        return result;
    }

    private async getBatchUserDirectRoleIds(userIds: string[]): Promise<Map<string, number[]>> {
        const uniqueUserIds = [...new Set(userIds)];
        const result = new Map(uniqueUserIds.map((userId) => [userId, [] as number[]]));
        if (uniqueUserIds.length === 0) {
            return result;
        }

        const rows = await this.prismaService.rbacUserRole.findMany({
            where: {
                userId: {
                    in: uniqueUserIds
                }
            },
            select: {
                userId: true,
                roleId: true
            }
        });
        for (const row of rows) {
            result.get(row.userId)?.push(row.roleId);
        }
        return result;
    }

    private async getBatchUserEffectiveRoleIds(userIds: string[]): Promise<Map<string, number[]>> {
        const uniqueUserIds = [...new Set(userIds)];
        const result = new Map(uniqueUserIds.map((userId) => [userId, [] as number[]]));
        if (uniqueUserIds.length === 0) {
            return result;
        }

        const rows = await this.prismaService.rbacEffectiveUserRole.findMany({
            where: {
                userId: {
                    in: uniqueUserIds
                },
                role: {
                    deletedAt: null
                }
            },
            select: {
                userId: true,
                roleId: true
            }
        });
        for (const row of rows) {
            result.get(row.userId)?.push(row.roleId);
        }
        return result;
    }

    private async getBatchGroupRoleIds(groupIds: number[]): Promise<Map<number, number[]>> {
        const uniqueGroupIds = [...new Set(groupIds)];
        const result = new Map(uniqueGroupIds.map((groupId) => [groupId, [] as number[]]));
        if (uniqueGroupIds.length === 0) {
            return result;
        }

        const rows = await this.prismaService.rbacUserGroupRole.findMany({
            where: {
                groupId: {
                    in: uniqueGroupIds
                }
            },
            select: {
                groupId: true,
                roleId: true
            }
        });
        for (const row of rows) {
            result.get(row.groupId)?.push(row.roleId);
        }
        return result;
    }

    /**
     * 构造角色关系表的关键字查询条件。
     */
    private buildRoleKeywordWhere(keyword?: string): Prisma.RbacRoleWhereInput {
        const normalizedKeyword = keyword?.trim();
        if (!normalizedKeyword) {
            return {};
        }
        const numericKeyword = Number(normalizedKeyword);
        const idFilter =
            Number.isInteger(numericKeyword) && numericKeyword > 0
                ? [
                      {
                          id: numericKeyword
                      }
                  ]
                : [];

        return {
            OR: [
                ...idFilter,
                {
                    name: {
                        contains: normalizedKeyword
                    }
                },
                {
                    code: {
                        contains: normalizedKeyword
                    }
                },
                {
                    description: {
                        contains: normalizedKeyword
                    }
                }
            ]
        };
    }

    private buildRoleFieldWhere(query: {
        keyword?: string;
        name?: string;
        code?: string;
        description?: string;
    }): Prisma.RbacRoleWhereInput {
        const name = query.name?.trim();
        const code = query.code?.trim();
        const description = query.description?.trim();

        return {
            ...this.buildRoleKeywordWhere(query.keyword),
            ...(name ? { name: { contains: name } } : {}),
            ...(code ? { code: { contains: code } } : {}),
            ...(description ? { description: { contains: description } } : {})
        };
    }

    /**
     * 构造用户组关系表的关键字查询条件。
     */
    private buildUserGroupKeywordWhere(keyword?: string): Prisma.RbacUserGroupWhereInput {
        const normalizedKeyword = keyword?.trim();
        if (!normalizedKeyword) {
            return {};
        }
        const numericKeyword = Number(normalizedKeyword);
        const idFilter =
            Number.isInteger(numericKeyword) && numericKeyword > 0
                ? [
                      {
                          id: numericKeyword
                      }
                  ]
                : [];

        return {
            OR: [
                ...idFilter,
                {
                    name: {
                        contains: normalizedKeyword
                    }
                },
                {
                    code: {
                        contains: normalizedKeyword
                    }
                },
                {
                    description: {
                        contains: normalizedKeyword
                    }
                }
            ]
        };
    }

    private buildUserGroupFieldWhere(query: {
        keyword?: string;
        name?: string;
        code?: string;
        description?: string;
    }): Prisma.RbacUserGroupWhereInput {
        const name = query.name?.trim();
        const code = query.code?.trim();
        const description = query.description?.trim();

        return {
            ...this.buildUserGroupKeywordWhere(query.keyword),
            ...(name ? { name: { contains: name } } : {}),
            ...(code ? { code: { contains: code } } : {}),
            ...(description ? { description: { contains: description } } : {})
        };
    }

    /**
     * 构造菜单关系表的关键字查询条件。
     */
    private buildMenuKeywordWhere(keyword?: string): Prisma.RbacMenuWhereInput {
        const normalizedKeyword = keyword?.trim();
        if (!normalizedKeyword) {
            return {};
        }
        const numericKeyword = Number(normalizedKeyword);
        const idFilter =
            Number.isInteger(numericKeyword) && numericKeyword > 0
                ? [
                      {
                          id: numericKeyword
                      }
                  ]
                : [];

        return {
            OR: [
                ...idFilter,
                {
                    title: {
                        contains: normalizedKeyword
                    }
                },
                {
                    requiredPermissionCode: {
                        contains: normalizedKeyword
                    }
                }
            ]
        };
    }

    private buildMenuFieldWhere(query: {
        keyword?: string;
        title?: string;
        requiredPermissionCode?: string;
        path?: string;
    }): Prisma.RbacMenuWhereInput {
        const title = query.title?.trim();
        const requiredPermissionCode = query.requiredPermissionCode?.trim();
        const path = query.path?.trim();

        return {
            ...this.buildMenuKeywordWhere(query.keyword),
            ...(title ? { title: { contains: title } } : {}),
            ...(requiredPermissionCode ? { requiredPermissionCode: { contains: requiredPermissionCode } } : {}),
            ...(path ? { path: { contains: path } } : {})
        };
    }

    /**
     * 获取后台用户分页列表。
     */
    async getUserList(query: QueryUserListDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_VIEW);
        const pageSize = query.pageSize;
        const filteredUserIds = query.userGroupId ? await this.getUserIdsByGroupId(query.userGroupId) : undefined;
        const createdAtFilter = query.createdAt
            ? {
                  gte: dayjs(query.createdAt[0], 'YYYY-MM-DD HH:mm:ss').toDate(),
                  lte: dayjs(query.createdAt[1], 'YYYY-MM-DD HH:mm:ss').toDate()
              }
            : undefined;

        const where: Prisma.BetterAuthUserWhereInput = {
            ...(query.username
                ? {
                      username: {
                          contains: query.username
                      }
                  }
                : {}),
            ...(query.name
                ? {
                      name: {
                          contains: query.name
                      }
                  }
                : {}),
            ...(query.email
                ? {
                      email: {
                          contains: query.email
                      }
                  }
                : {}),
            ...(query.phoneNumber
                ? {
                      phoneNumber: {
                          contains: query.phoneNumber
                      }
                  }
                : {}),
            ...(query.banned !== undefined
                ? {
                      banned: query.banned
                  }
                : {}),
            ...(createdAtFilter
                ? {
                      createdAt: createdAtFilter
                  }
                : {}),
            ...(filteredUserIds
                ? {
                      id: {
                          in: filteredUserIds
                      }
                  }
                : {}),
            ...(query.remark
                ? {
                      profile: {
                          is: {
                              remark: {
                                  contains: query.remark
                              }
                          }
                      }
                  }
                : {})
        };

        const [records, pagination] = (await this.prismaService.betterAuthUser.findManyAndCount({
            take: pageSize,
            skip: query.page && pageSize ? (query.page - 1) * pageSize : undefined,
            where,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                profile: true
            }
        })) as unknown as [AdminUserRecord[], { total: number; totalPages: number; pageSize: number; page: number }];

        const userGroupMap = await this.getBatchUserGroups(records.map((record) => record.id));
        const userIds = records.map((record) => record.id);
        const [directRoleIdMap, effectiveRoleIdMap] = await Promise.all([
            this.getBatchUserDirectRoleIds(userIds),
            this.getBatchUserEffectiveRoleIds(userIds)
        ]);
        const recordsWithRoles = records.map((record) =>
            toAdminUserView(
                record,
                directRoleIdMap.get(record.id) ?? [],
                effectiveRoleIdMap.get(record.id) ?? [],
                userGroupMap.get(record.id) ?? []
            )
        );
        const recordsWithCapabilities = await this.attachViewerUserCapabilities(recordsWithRoles, actorId);

        return {
            records: recordsWithCapabilities,
            meta: {
                viewerCanCreateUser: await this.rbacAuthorizationService.checkPermission(
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_USER_CREATE
                ),
                viewerCanImpersonateUser: await this.rbacAuthorizationService.checkPermission(
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE
                )
            },
            pagination
        };
    }

    /**
     * 批量为用户列表记录补充当前用户对每行用户对象的操作能力。
     */
    private async attachViewerUserCapabilities(records: AdminUserView[], actorId: string) {
        if (records.length === 0) {
            return records.map((record) => this.withViewerUserCapabilities(record));
        }

        const permissions = await this.getViewerUserPermissions(actorId);

        return records.map((record) => this.withViewerUserCapabilities(record, permissions));
    }

    /**
     * 将权限布尔值合并到用户记录，供前端按钮直接消费。
     */
    private withViewerUserCapabilities(record: AdminUserView, permissions: Record<string, boolean> = {}) {
        const targetCanBeImpersonated = !isActiveBetterAuthBan(record);

        return {
            ...record,
            viewerCanViewDetail: permissions.detail === true,
            viewerCanUpdate: permissions.update === true,
            viewerCanDelete: permissions.delete === true,
            viewerCanResetPassword: permissions.reset_password === true,
            viewerCanViewSession: permissions.view_session === true,
            viewerCanRevokeSession: permissions.revoke_session === true,
            viewerCanImpersonate: permissions.impersonate === true && targetCanBeImpersonated,
            viewerCanAssignRole: permissions.assign_role === true,
            viewerCanAssignUserGroup: permissions.assign_user_group === true
        };
    }

    private async getViewerUserPermissions(actorId: string): Promise<Record<string, boolean>> {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.SYSTEM_USER_UPDATE,
            RBAC_PERMISSIONS.SYSTEM_USER_DELETE,
            RBAC_PERMISSIONS.SYSTEM_USER_DETAIL,
            RBAC_PERMISSIONS.SYSTEM_USER_RESET_PASSWORD,
            RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW,
            RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE,
            RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE,
            RBAC_PERMISSIONS.USER_ASSIGN_ROLE,
            RBAC_PERMISSIONS.USER_ASSIGN_USER_GROUP
        ]);

        return {
            detail: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_DETAIL) ?? false,
            update: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_UPDATE) ?? false,
            delete: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_DELETE) ?? false,
            reset_password: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_RESET_PASSWORD) ?? false,
            view_session: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW) ?? false,
            revoke_session: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE) ?? false,
            impersonate: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE) ?? false,
            assign_role: permissions.get(RBAC_PERMISSIONS.USER_ASSIGN_ROLE) ?? false,
            assign_user_group: permissions.get(RBAC_PERMISSIONS.USER_ASSIGN_USER_GROUP) ?? false
        };
    }

    /**
     * 创建后台用户，并分别写入 Better Auth 主表和本地资料表。
     */
    async createUser(operatorUserId: string, createUserDto: CreateUserDto) {
        await this.rbacAuthorizationService.assertPermission(operatorUserId, RBAC_PERMISSIONS.SYSTEM_USER_CREATE);

        const user = await this.adminUserAdminService.createUser({
            email: createUserDto.email ?? `${createUserDto.username}@shiro-nya.local`,
            name: createUserDto.name,
            password: createUserDto.password,
            username: createUserDto.username,
            image: createUserDto.image,
            phoneNumber: createUserDto.phoneNumber
        });

        try {
            await this.upsertUserProfile(user.id, {
                remark: createUserDto.remark,
                createdBy: operatorUserId,
                lastLoginAt: null
            });
            if (createUserDto.banned) {
                await this.adminUserAdminService.banUser(user.id);
            }
        } catch (error) {
            await this.adminUserAdminService.removeUser(user.id);
            throw error;
        }

        return await this.getUserByID(user.id);
    }

    /**
     * 更新后台用户主表和资料表。
     */
    async updateUser(id: string, updateUserDto: UpdateUserDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_UPDATE);

        await this.getUserByID(id);

        const mainData: {
            email?: string;
            name?: string;
            username?: string;
            image?: string | null;
            phoneNumber?: string | null;
        } = {};

        if (updateUserDto.email !== undefined) {
            mainData.email = updateUserDto.email ?? undefined;
        }
        if (updateUserDto.name !== undefined) {
            mainData.name = updateUserDto.name;
        }
        if (updateUserDto.username !== undefined) {
            mainData.username = updateUserDto.username;
        }
        if (updateUserDto.image !== undefined) {
            mainData.image = updateUserDto.image;
        }
        if (updateUserDto.phoneNumber !== undefined) {
            mainData.phoneNumber = updateUserDto.phoneNumber;
        }

        if (Object.keys(mainData).length > 0) {
            await this.adminUserAdminService.updateUser(id, mainData);
        }

        if (updateUserDto.password) {
            await this.adminUserAdminService.setUserPassword(id, updateUserDto.password);
        }

        const profileData: {
            remark?: string | null;
        } = {};

        if (updateUserDto.remark !== undefined) {
            profileData.remark = updateUserDto.remark;
        }

        if (Object.keys(profileData).length > 0) {
            await this.upsertUserProfile(id, profileData);
        }

        if (updateUserDto.banned !== undefined) {
            if (updateUserDto.banned) {
                await this.adminUserAdminService.banUser(id);
            } else {
                await this.adminUserAdminService.unbanUser(id);
            }
        }

        if (
            Object.keys(mainData).length > 0 ||
            Object.keys(profileData).length > 0 ||
            updateUserDto.banned !== undefined
        ) {
            await this.bumpUserStateVersion(id, 'updateUser');
        }

        return await this.getUserByID(id);
    }

    /**
     * 删除指定后台用户。
     */
    async deleteUser(id: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_DELETE);
        await this.authzObjectExceptionService.cleanupDeletedUser(id);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserRole.deleteMany({ where: { userId: id } });
            await tx.rbacUserGroupMember.deleteMany({ where: { userId: id } });
            await tx.rbacEffectiveUserRole.deleteMany({ where: { userId: id } });
            await tx.rbacEffectiveUserPermission.deleteMany({ where: { userId: id } });
            await tx.rbacUserVisibleMenu.deleteMany({ where: { userId: id } });
        });
        await this.adminUserAdminService.removeUser(id);
        return null;
    }

    /**
     * 分页查询指定后台用户的会话列表。
     */
    async getUserSessionList(query: QueryUserSessionsDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW);
        await this.getUserByID(query.id);

        const [records, pagination] = await this.prismaService.betterAuthSession.findManyAndCount({
            where: {
                userId: query.id
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: {
                createdAt: 'desc'
            }
        });

        return {
            records,
            pagination
        };
    }

    /**
     * 重置指定后台用户密码。
     */
    async resetUserPassword(id: string, password: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_RESET_PASSWORD);
        await this.adminUserAdminService.setUserPassword(id, password);
    }

    async banUser(id: string, actorId: string, banReason?: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_UPDATE);
        await this.adminUserAdminService.banUser(id, banReason);
        await this.bumpUserStateVersion(id, 'banUser');
        return await this.getUserDetail(id, actorId);
    }

    async unbanUser(id: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_UPDATE);
        await this.adminUserAdminService.unbanUser(id);
        await this.bumpUserStateVersion(id, 'unbanUser');
        return await this.getUserDetail(id, actorId);
    }

    /**
     * 撤销指定后台用户的全部会话。
     */
    async revokeUserSessions(id: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE);
        await this.adminUserAdminService.revokeUserSessions(id);
    }

    async revokeUserSession(sessionToken: string, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE);
        await this.adminUserAdminService.revokeUserSession(sessionToken);
    }

    async assignRoles(userId: string, roleIds: number[], actorId: string) {
        return await this.rbacAssignmentService.replaceUserRoles(userId, roleIds, actorId);
    }

    async assignUserGroups(userId: string, groupIds: number[], actorId: string) {
        return await this.rbacAssignmentService.replaceUserGroups(userId, groupIds, actorId);
    }
}
