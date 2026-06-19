import { BusinessException, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { MenuStatusEnum, MenuTypeEnum, Prisma, RbacStatus } from '@app/prisma-app/generated/client';
import { Injectable } from '@nestjs/common';
import { Traceable } from 'nestjs-otel';
import { AdminErrorCodes } from '../../../common/constants/index';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import {
    assertRbacServicePermission,
    checkRbacServicePermission,
    checkRbacServicePermissions,
    type RbacServiceContext
} from '../rbac/rbac-service-context';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import {
    CreateUserGroupDto,
    QueryUserGroupListDto,
    QueryUserGroupRelationMemberDto,
    QueryUserGroupRelationMenuDto,
    QueryUserGroupRelationRoleDto,
    UpdateUserGroupDto
} from './dto/user-group.dto';

type UserGroupRecord = Prisma.RbacUserGroupGetPayload<Record<string, never>>;
type UserGroupView = UserGroupRecord & {
    memberUserIds: string[];
    roleIds: number[];
};

@Traceable()
@Injectable()
export class SystemUserGroupsService {
    /**
     * 注入用户组元数据、角色校验、状态版本和 RBAC 授权依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly rbacAssignmentService: SystemRbacAssignmentsService,
        private readonly rbacGraphService: SystemRbacGraphService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService
    ) {}

    /**
     * 将用户组元数据与本地投影关系组合成前端可直接使用的结构。
     */
    private async toUserGroupView(group: UserGroupRecord): Promise<UserGroupView> {
        const [view] = await this.attachRelationIdsToGroups([group]);
        return view;
    }

    /**
     * 查询用户组分页列表，并附带成员和角色分配 ID。
     */
    async getUserGroupList(query: QueryUserGroupListDto, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW,
            context
        );
        const where: Prisma.RbacUserGroupWhereInput = {
            deletedAt: null,
            ...this.buildGroupListKeywordWhere(query.keyword),
            ...(query.name ? { name: { contains: query.name } } : {}),
            ...(query.code ? { code: { contains: query.code } } : {}),
            ...(query.status ? { status: query.status as RbacStatus } : {})
        };

        const [records, pagination] = await this.prismaService.rbacUserGroup.findManyAndCount({
            where,
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
        const recordsWithRelations = await this.attachRelationIdsToGroups(records);
        const recordsWithCapabilities = await this.attachViewerUserGroupCapabilities(
            recordsWithRelations,
            actorId,
            context
        );

        return {
            records: recordsWithCapabilities,
            meta: {
                viewerCanCreateUserGroup: await checkRbacServicePermission(
                    this.rbacAuthorizationService,
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_USER_GROUP_CREATE,
                    context
                )
            },
            pagination
        };
    }

    /**
     * 获取用户组详情。
     */
    async getUserGroupById(id: number) {
        const group = await this.prismaService.rbacUserGroup.findFirst({
            where: {
                id,
                deletedAt: null
            }
        });

        if (!group) {
            throw new BusinessException(AdminErrorCodes.USER_GROUP.NOT_FOUND);
        }

        return await this.toUserGroupView(group);
    }

    /**
     * 获取用户组详情，并断言当前用户拥有查看该用户组资源的能力。
     */
    async getUserGroupByIdForViewer(id: number, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW,
            context
        );
        return await this.getUserGroupById(id);
    }

    /**
     * 批量为用户组列表记录补充当前用户对每行用户组对象的操作能力。
     */
    private async attachViewerUserGroupCapabilities(
        records: UserGroupView[],
        actorId: string,
        context?: RbacServiceContext
    ) {
        if (records.length === 0) {
            return records.map((record) => this.withViewerUserGroupCapabilities(record));
        }

        const permissions = await this.getViewerUserGroupPermissions(actorId, context);

        return records.map((record) => this.withViewerUserGroupCapabilities(record, permissions));
    }

    /**
     * 为单个用户组记录补充当前用户操作能力。
     */
    private async attachViewerUserGroupCapability(
        record: UserGroupView,
        actorId: string,
        context?: RbacServiceContext
    ) {
        return this.withViewerUserGroupCapabilities(record, await this.getViewerUserGroupPermissions(actorId, context));
    }

    /**
     * 将权限布尔值合并到用户组记录，供前端按钮直接消费。
     */
    private withViewerUserGroupCapabilities(record: UserGroupView, permissions: Record<string, boolean> = {}) {
        return {
            ...record,
            viewerCanUpdate: permissions.update === true,
            viewerCanDelete: permissions.delete === true,
            viewerCanAssignMember: permissions.assign_member === true,
            viewerCanAssignRole: permissions.assign_role === true
        };
    }

    private async getViewerUserGroupPermissions(
        actorId: string,
        context?: RbacServiceContext
    ): Promise<Record<string, boolean>> {
        const permissions = await checkRbacServicePermissions(
            this.rbacAuthorizationService,
            actorId,
            [
                RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE,
                RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE,
                RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER,
                RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_ROLE
            ],
            context
        );

        return {
            update: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE) ?? false,
            delete: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE) ?? false,
            assign_member: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER) ?? false,
            assign_role: permissions.get(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_ROLE) ?? false
        };
    }

    /**
     * 查询用户组关系抽屉初始化数据，表格明细由分页接口按需加载。
     */
    async getUserGroupRelations(id: number, actorId: string, context?: RbacServiceContext) {
        const group = await this.getUserGroupByIdForViewer(id, actorId, context);
        const visibleMenuIds = await this.rbacGraphService.getGroupVisibleMenuIds(id);

        return {
            group: await this.attachViewerUserGroupCapability(group, actorId, context),
            memberUserIds: group.memberUserIds,
            roleIds: group.roleIds,
            visibleMenuIds
        };
    }

    /**
     * 分页查询用户组成员分配表，成员关系来源走 RBAC 草稿 ID 集，用户元数据筛选在数据库侧完成。
     */
    async getUserGroupRelationMembers(
        query: QueryUserGroupRelationMemberDto,
        actorId: string,
        context?: RbacServiceContext
    ) {
        await this.getUserGroupByIdForViewer(query.groupId, actorId, context);
        const draftUserIdSet = new Set(query.draftUserIds);
        const [records, pagination] = await this.prismaService.betterAuthUser.findManyAndCount({
            where: {
                ...this.buildUserFieldWhere(query),
                ...(query.banned !== undefined ? { banned: query.banned } : {}),
                ...(query.assigned !== undefined
                    ? {
                          id: query.assigned
                              ? {
                                    in: [...draftUserIdSet]
                                }
                              : {
                                    notIn: [...draftUserIdSet]
                                }
                      }
                    : {})
            },
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                banned: true,
                image: true
            },
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: {
                createdAt: 'desc'
            }
        });

        return {
            records: records.map((record) => ({
                ...record,
                assigned: draftUserIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 分页查询用户组继承角色，角色关系来源走 RBAC 草稿 ID 集，角色元数据筛选在数据库侧完成。
     */
    async getUserGroupRelationRoles(
        query: QueryUserGroupRelationRoleDto,
        actorId: string,
        context?: RbacServiceContext
    ) {
        await this.getUserGroupByIdForViewer(query.groupId, actorId, context);
        const draftRoleIdSet = new Set(query.draftRoleIds);
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            where: {
                deletedAt: null,
                ...this.buildRoleFieldWhere(query),
                ...(query.status ? { status: query.status as RbacStatus } : {}),
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
            orderBy: {
                id: 'asc'
            }
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
     * 分页查询用户组可见菜单，用户组角色和菜单权限关系均读取 RBAC effective 结果。
     */
    async getUserGroupRelationMenus(
        query: QueryUserGroupRelationMenuDto,
        actorId: string,
        context?: RbacServiceContext
    ) {
        await this.getUserGroupByIdForViewer(query.groupId, actorId, context);
        const menuIds = await this.rbacGraphService.getGroupVisibleMenuIds(query.groupId);
        const [records, pagination] = await this.prismaService.rbacMenu.findManyAndCount({
            where: {
                id: {
                    in: menuIds
                },
                ...this.buildMenuFieldWhere(query),
                ...(query.type ? { type: query.type as MenuTypeEnum } : {}),
                ...(query.status ? { status: query.status as MenuStatusEnum } : {})
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
     * 创建 RBAC 用户组元数据。
     */
    async createUserGroup(operatorUserId: string, data: CreateUserGroupDto, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            operatorUserId,
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_CREATE,
            context
        );
        await this.ensureCodeAvailable(data.code);

        const group = await this.prismaService.rbacUserGroup.create({
            data: {
                name: data.name,
                code: data.code,
                description: data.description,
                sort: data.sort,
                status: data.status as RbacStatus,
                createdBy: operatorUserId,
                updatedBy: operatorUserId
            }
        });

        return await this.getUserGroupById(group.id);
    }

    /**
     * 更新用户组元数据；启用状态变化时只重建当前组成员的 RBAC effective 读模型。
     */
    async updateUserGroup(id: number, data: UpdateUserGroupDto, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE,
            context
        );
        const existingGroup = await this.getUserGroupById(id);

        if (data.code && data.code !== existingGroup.code) {
            await this.ensureCodeAvailable(data.code, id);
        }

        const updated = await this.prismaService.rbacUserGroup.update({
            where: {
                id
            },
            data: {
                name: data.name,
                code: data.code,
                description: data.description,
                sort: data.sort,
                status: data.status as RbacStatus | undefined,
                updatedBy: actorId
            }
        });

        const shouldRebuildUsers = data.status !== undefined && data.status !== existingGroup.status;
        await this.bumpRelatedStateVersions(
            shouldRebuildUsers ? existingGroup.memberUserIds : [],
            existingGroup.roleIds
        );
        return await this.getUserGroupById(updated.id);
    }

    /**
     * 替换用户组成员集合，并刷新受影响成员和当前用户组角色的状态版本。
     */
    async assignMembers(groupId: number, userIds: string[], actorId: string, context?: RbacServiceContext) {
        await this.rbacAssignmentService.replaceGroupMembers(groupId, userIds, actorId, context);
        return await this.getUserGroupRelations(groupId, actorId, context);
    }

    /**
     * 替换用户组继承角色集合，并刷新用户组成员和受影响角色的状态版本。
     */
    async assignRoles(groupId: number, roleIds: number[], actorId: string, context?: RbacServiceContext) {
        await this.rbacAssignmentService.replaceGroupRoles(groupId, roleIds, actorId, context);
        return await this.getUserGroupRelations(groupId, actorId, context);
    }

    /**
     * 删除用户组前先清理 RBAC 成员和角色分配。
     */
    async deleteUserGroup(id: number, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE,
            context
        );
        const group = await this.getUserGroupById(id);
        await this.authzObjectExceptionService.cleanupDeletedResource('user_group', String(id));
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserGroupMember.deleteMany({ where: { groupId: id } });
            await tx.rbacUserGroupRole.deleteMany({ where: { groupId: id } });
            await tx.rbacUserGroup.update({
                where: {
                    id
                },
                data: {
                    deletedAt: new Date(),
                    updatedBy: actorId
                }
            });
        });
        await this.bumpRelatedStateVersions(group.memberUserIds, group.roleIds);
        return null;
    }

    /**
     * 校验用户组编码是否可用。
     */
    private async ensureCodeAvailable(code: string, excludeId?: number): Promise<void> {
        const existing = await this.prismaService.rbacUserGroup.findFirst({
            where: {
                code,
                deletedAt: null,
                ...(excludeId ? { id: { not: excludeId } } : {})
            }
        });

        if (existing) {
            throw new BusinessException(AdminErrorCodes.USER_GROUP.CODE_EXISTS);
        }
    }

    /**
     * 构造用户组列表的关键字查询条件。
     */
    private buildGroupListKeywordWhere(keyword?: string): Prisma.RbacUserGroupWhereInput {
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

    /**
     * 构造后台用户关系表的关键字查询条件。
     */
    private buildUserKeywordWhere(keyword?: string): Prisma.BetterAuthUserWhereInput {
        const normalizedKeyword = keyword?.trim();
        if (!normalizedKeyword) {
            return {};
        }

        return {
            OR: [
                {
                    id: {
                        contains: normalizedKeyword
                    }
                },
                {
                    username: {
                        contains: normalizedKeyword
                    }
                },
                {
                    name: {
                        contains: normalizedKeyword
                    }
                },
                {
                    email: {
                        contains: normalizedKeyword
                    }
                }
            ]
        };
    }

    private buildUserFieldWhere(query: {
        keyword?: string;
        id?: string;
        username?: string;
        name?: string;
        email?: string;
    }): Prisma.BetterAuthUserWhereInput {
        const id = query.id?.trim();
        const username = query.username?.trim();
        const name = query.name?.trim();
        const email = query.email?.trim();
        const conditions: Prisma.BetterAuthUserWhereInput[] = [];
        const keywordWhere = this.buildUserKeywordWhere(query.keyword);
        if (Object.keys(keywordWhere).length > 0) {
            conditions.push(keywordWhere);
        }
        if (id) {
            conditions.push({ id: { contains: id } });
        }
        if (username) {
            conditions.push({ username: { contains: username } });
        }
        if (name) {
            conditions.push({ name: { contains: name } });
        }
        if (email) {
            conditions.push({ email: { contains: email } });
        }

        return conditions.length > 0 ? { AND: conditions } : {};
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
     * 校验成员用户 ID 是否全部存在。
     */
    private async ensureUsersExist(userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        if (uniqueUserIds.length === 0) {
            return;
        }

        const found = await this.prismaService.betterAuthUser.count({
            where: {
                id: {
                    in: uniqueUserIds
                }
            }
        });

        if (found !== uniqueUserIds.length) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }
    }

    /**
     * 用户组关系变更后刷新受影响用户和角色的状态版本。
     */
    private async bumpRelatedStateVersions(userIds: string[], roleIds: number[]): Promise<void> {
        const uniqueRoleIds = [...new Set(roleIds)];
        const uniqueUserIds = [...new Set(userIds)];
        const roles =
            uniqueRoleIds.length > 0
                ? await this.prismaService.rbacRole.findMany({
                      where: {
                          id: {
                              in: uniqueRoleIds
                          },
                          deletedAt: null
                      },
                      select: {
                          id: true,
                          name: true
                      }
                  })
                : [];

        await Promise.all([
            // system 用户组入口写 RBAC 源表；读模型只重建实际受影响成员，避免分页或元数据更新触发全量展开。
            uniqueUserIds.length > 0 ? this.rbacGraphService.applyRebuild(uniqueUserIds) : Promise.resolve(),
            ...roles.map((role) => this.adminUserStateService.bumpRoleStateVersion(role.id))
        ]);
    }

    private async attachRelationIdsToGroups(groups: UserGroupRecord[]): Promise<UserGroupView[]> {
        const groupIds = groups.map((group) => group.id);
        if (groupIds.length === 0) {
            return [];
        }

        // 列表页一次性批量读取成员和角色关系，避免每个用户组各查两次关系表。
        const [memberRows, roleRows] = await Promise.all([
            this.prismaService.rbacUserGroupMember.findMany({
                where: {
                    groupId: {
                        in: groupIds
                    }
                },
                select: {
                    groupId: true,
                    userId: true
                }
            }),
            this.prismaService.rbacUserGroupRole.findMany({
                where: {
                    groupId: {
                        in: groupIds
                    }
                },
                select: {
                    groupId: true,
                    roleId: true
                }
            })
        ]);

        const memberIdsByGroupId = new Map<number, string[]>();
        for (const row of memberRows) {
            const userIds = memberIdsByGroupId.get(row.groupId) ?? [];
            userIds.push(row.userId);
            memberIdsByGroupId.set(row.groupId, userIds);
        }

        const roleIdsByGroupId = new Map<number, number[]>();
        for (const row of roleRows) {
            const roleIds = roleIdsByGroupId.get(row.groupId) ?? [];
            roleIds.push(row.roleId);
            roleIdsByGroupId.set(row.groupId, roleIds);
        }

        return groups.map((group) => ({
            ...group,
            memberUserIds: memberIdsByGroupId.get(group.id) ?? [],
            roleIds: roleIdsByGroupId.get(group.id) ?? []
        }));
    }
}
