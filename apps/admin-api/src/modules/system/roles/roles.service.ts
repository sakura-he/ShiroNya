import { BusinessException, createRuntimeLogger, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma, RbacRole, RbacStatus } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { Traceable } from 'nestjs-otel';
import { intersection, xor } from 'es-toolkit';
import { AdminErrorCodes } from '../../../common/constants/index';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import {
    CreateRoleDto,
    QueryRoleAssignableParentDto,
    QueryRoleAssignablePermissionDto,
    QueryRoleAssignableUserDto,
    QueryRoleAssignableUserGroupDto,
    QueryRoleEffectiveUserDto,
    QueryRoleListDto,
    UpdateRoleDto
} from './dto/role.dto';

/**
 * 提供后台角色元数据、直接用户分配和用户组分配的管理能力。
 */
@Traceable()
@Injectable()
export class SystemRolesService {
    private readonly logger = createRuntimeLogger(SystemRolesService.name, {
        module: 'role',
        domain: 'role',
        resource: { type: 'role' }
    });

    /**
     * 注入角色元数据、状态版本和 RBAC 授权依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly rbacGraphService: SystemRbacGraphService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService
    ) {}

    /**
     * 分页查询后台角色列表及其基础元数据。
     */
    async getAllRoles(query: QueryRoleListDto, actorId: string) {
        this.logger.debug.title('查询角色列表', { query });
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW);
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            take: query.pageSize,
            skip: query.page ? (query.page - 1) * query.pageSize! : undefined,
            where: {
                deletedAt: null,
                ...this.buildRoleKeywordWhere(query.keyword ?? query.name),
                ...(query.code ? { code: { contains: query.code } } : {}),
                status: query.status as RbacStatus | undefined,
                createdAt: query.createdAt
                    ? {
                          gte: dayjs(query.createdAt[0], 'YYYY-MM-DD HH:mm:ss').toDate(),
                          lte: dayjs(query.createdAt[1], 'YYYY-MM-DD HH:mm:ss').toDate()
                      }
                    : undefined
            },
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
            records: await this.attachViewerRoleCapabilities(records, actorId),
            meta: {
                viewerCanCreateRole: await this.rbacAuthorizationService.checkPermission(
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_ROLE_CREATE
                )
            },
            pagination
        };
    }

    /**
     * 查询角色关系抽屉初始化数据，关系 ID 读取走本地投影。
     */
    async getRoleRelations(id: number, actorId: string) {
        const role = await this.findOne(id);
        if (!role) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW);

        const [directUserIds, userGroupIds, parentRoleIds, permissionIds, effectivePermissionState, effectiveUserIds] =
            await Promise.all([
                this.getRoleUserIds(id),
                this.getRoleGroupIds(id),
                this.getParentRoleIds(id),
                this.getRolePermissionIds(id),
                this.getRoleEffectivePermissionState(id),
                this.rbacGraphService.getRoleEffectiveUserIds(id)
            ]);

        return {
            role: this.withViewerRoleCapabilities(role, await this.getViewerRolePermissions(actorId)),
            directUserIds,
            userGroupIds,
            parentRoleIds,
            permissionIds,
            effectivePermissionIds: effectivePermissionState.effectivePermissionIds,
            inheritedPermissionIds: effectivePermissionState.inheritedPermissionIds,
            effectiveUserIds
        };
    }

    /**
     * 分页查询角色直接用户分配表，关系来源走 RBAC 草稿 ID 集，筛选和分页在数据库侧完成。
     */
    async getRoleAssignableUsers(query: QueryRoleAssignableUserDto, actorId: string) {
        await this.assertRoleViewable(query.roleId, actorId);
        const draftUserIdSet = new Set(query.draftUserIds);
        const where: Prisma.BetterAuthUserWhereInput = {
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
        };
        const [records, pagination] = await this.prismaService.betterAuthUser.findManyAndCount({
            where,
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
     * 分页查询角色可分配用户组，关系来源走 RBAC 草稿 ID 集，用户组元数据筛选在数据库侧完成。
     */
    async getRoleAssignableUserGroups(query: QueryRoleAssignableUserGroupDto, actorId: string) {
        await this.assertRoleViewable(query.roleId, actorId);
        const draftUserGroupIdSet = new Set(query.draftUserGroupIds);
        const where: Prisma.RbacUserGroupWhereInput = {
            deletedAt: null,
            ...this.buildUserGroupFieldWhere(query),
            ...(query.status ? { status: query.status as RbacStatus } : {}),
            ...(query.assigned !== undefined
                ? {
                      id: query.assigned
                          ? {
                                in: [...draftUserGroupIdSet]
                            }
                          : {
                                notIn: [...draftUserGroupIdSet]
                            }
                  }
                : {})
        };
        const [records, pagination] = await this.prismaService.rbacUserGroup.findManyAndCount({
            where,
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: {
                id: 'asc'
            }
        });

        return {
            records: records.map((record) => ({
                ...record,
                assigned: draftUserGroupIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 分页查询角色可继承的父角色。
     */
    async getRoleAssignableParentRoles(query: QueryRoleAssignableParentDto, actorId: string) {
        await this.assertRoleViewable(query.roleId, actorId);
        const draftRoleIdSet = new Set(query.draftRoleIds);
        const where: Prisma.RbacRoleWhereInput = {
            id: {
                not: query.roleId
            },
            deletedAt: null,
            ...this.buildRoleFieldWhere(query),
            ...(query.status ? { status: query.status } : {}),
            ...(query.assigned !== undefined
                ? {
                      id: query.assigned
                          ? {
                                in: [...draftRoleIdSet],
                                not: query.roleId
                            }
                          : {
                                notIn: [...draftRoleIdSet],
                                not: query.roleId
                            }
                  }
                : {})
        };
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
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

        return {
            records: records.map((record) => ({
                ...record,
                assigned: draftRoleIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 分页查询角色可授予权限。
     */
    async getRoleAssignablePermissions(query: QueryRoleAssignablePermissionDto, actorId: string) {
        await this.assertRoleViewable(query.roleId, actorId);
        const draftPermissionIdSet = new Set(query.draftPermissionIds);
        const [records, pagination] = await this.prismaService.rbacPermission.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.kind ? { kind: query.kind } : {}),
                ...(query.status ? { status: query.status } : {}),
                ...this.buildPermissionFieldWhere(query),
                ...(query.assigned !== undefined
                    ? {
                          id: query.assigned
                              ? {
                                    in: [...draftPermissionIdSet]
                                }
                              : {
                                    notIn: [...draftPermissionIdSet]
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
                assigned: draftPermissionIdSet.has(record.id)
            })),
            pagination
        };
    }

    /**
     * 分页查询角色有效用户。有效关系来自 RBAC effective 读模型，用户元数据筛选在数据库侧完成。
     */
    async getRoleEffectiveUsers(query: QueryRoleEffectiveUserDto, actorId: string) {
        await this.assertRoleViewable(query.roleId, actorId);
        const effectiveUserIds = await this.rbacGraphService.getRoleEffectiveUserIds(query.roleId);
        const [records, pagination] = await this.prismaService.betterAuthUser.findManyAndCount({
            where: {
                id: {
                    in: effectiveUserIds
                },
                ...this.buildUserFieldWhere(query),
                ...(query.banned !== undefined ? { banned: query.banned } : {})
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

        const sourceByUserId = await this.resolveEffectiveUserSourcesForRole(
            query.roleId,
            records.map((record) => record.id)
        );

        return {
            records: records.map((record) => ({
                ...record,
                ...(sourceByUserId.get(record.id) ?? {
                    effectiveRoleSources: [],
                    effectiveRoleSourceRoleIds: [],
                    effectiveRoleSourceGroupIds: []
                })
            })),
            pagination
        };
    }

    /**
     * 创建 RBAC 角色。
     */
    async createRole(createRoleDto: CreateRoleDto, actorId: string) {
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_CREATE);
        const findRole = await this.findByCode(createRoleDto.code);
        if (findRole) {
            throw new BusinessException(ErrorCodes.ROLE.NAME_ALREADY_EXISTS);
        }

        const result = await this.prismaService.rbacRole.create({
            data: {
                code: createRoleDto.code,
                name: createRoleDto.name,
                description: createRoleDto.description,
                sort: createRoleDto.sort,
                status: createRoleDto.status as RbacStatus,
                isSuperAdmin: createRoleDto.isSuperAdmin ?? createRoleDto.code === 'super_admin',
                isBuiltin: createRoleDto.isBuiltin ?? false,
                createdBy: actorId,
                updatedBy: actorId
            }
        });

        try {
            await this.adminUserStateService.bumpRoleStateVersion(result.id);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpRoleStateVersion 失败
            this.logger.warn('createRole: bumpRoleStateVersion 失败', { error, roleId: result.id });
        }
        return result;
    }

    /**
     * 更新指定 RBAC 角色元数据。
     */
    async updateRole(id: number, updateRoleDto: UpdateRoleDto, actorId: string) {
        const existingRole = await this.prismaService.rbacRole.findFirst({
            where: {
                id,
                deletedAt: null
            }
        });

        if (!existingRole) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_UPDATE);
        if (updateRoleDto.code && updateRoleDto.code !== existingRole.code) {
            const duplicatedRole = await this.findByCode(updateRoleDto.code);
            if (duplicatedRole) {
                throw new BusinessException(ErrorCodes.ROLE.NAME_ALREADY_EXISTS);
            }
        }
        const nextIsSuperAdmin =
            updateRoleDto.isSuperAdmin !== undefined
                ? updateRoleDto.isSuperAdmin
                : updateRoleDto.code !== undefined
                  ? updateRoleDto.code === 'super_admin'
                  : existingRole.isSuperAdmin;
        const effectiveChanged =
            (updateRoleDto.status !== undefined && updateRoleDto.status !== existingRole.status) ||
            nextIsSuperAdmin !== existingRole.isSuperAdmin;
        const affectedUserIds = effectiveChanged ? await this.rbacGraphService.getAffectedUserIdsByRoleIds([id]) : [];

        const result = await this.prismaService.rbacRole.update({
            where: {
                id
            },
            data: {
                code: updateRoleDto.code,
                name: updateRoleDto.name,
                description: updateRoleDto.description,
                sort: updateRoleDto.sort,
                status: updateRoleDto.status as RbacStatus | undefined,
                isSuperAdmin:
                    updateRoleDto.isSuperAdmin !== undefined
                        ? updateRoleDto.isSuperAdmin
                        : updateRoleDto.code
                          ? updateRoleDto.code === 'super_admin'
                          : undefined,
                isBuiltin: updateRoleDto.isBuiltin,
                updatedBy: actorId
            }
        });
        await this.rebuildAffectedUsers(affectedUserIds);

        try {
            await this.adminUserStateService.bumpRoleStateVersion(id);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpRoleStateVersion 失败
            this.logger.warn('updateRole: bumpRoleStateVersion 失败', { error, roleId: id });
        }
        return result;
    }

    /**
     * 删除角色前先校验是否仍被后台用户引用。
     */
    async deleteRole(id: number, actorId: string) {
        const role = await this.findOne(id);
        if (!role) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE);

        const [assignedUserIds, assignedGroupIds] = await Promise.all([
            this.getRoleUserIds(id),
            this.getRoleGroupIds(id)
        ]);
        const assignments = {
            userIds: assignedUserIds,
            userGroupIds: assignedGroupIds
        };
        if (assignments.userIds.length > 0 || assignments.userGroupIds.length > 0) {
            const refSubjects = [
                ...assignments.userIds.map((userId) => `用户ID: ${userId}`),
                ...assignments.userGroupIds.map((groupId) => `用户组ID: ${groupId}`)
            ];
            throw new BusinessException(ErrorCodes.ROLE.DELETE_FAILED_REF(refSubjects.join(',')));
        }
        const affectedUserIds = await this.rbacGraphService.getAffectedUserIdsByRoleIds([id]);

        await this.authzObjectExceptionService.cleanupDeletedRole(id);
        await this.prismaService.authzResourceRoleBinding.deleteMany({
            where: {
                roleId: id
            }
        });

        const result = await this.prismaService.rbacRole.update({
            where: {
                id
            },
            data: {
                deletedAt: new Date(),
                updatedBy: actorId
            }
        });
        await this.rebuildAffectedUsers(affectedUserIds);

        try {
            await this.adminUserStateService.bumpRoleStateVersion(id);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpRoleStateVersion 失败
            this.logger.warn('deleteRole: bumpRoleStateVersion 失败', { error, roleId: id });
        }
        return result;
    }

    /**
     * 通过角色编码查询角色。
     */
    async findByCode(code: string) {
        return await this.prismaService.rbacRole.findFirst({
            where: { code, deletedAt: null }
        });
    }

    /**
     * 通过角色主键查询角色。
     */
    async findOne(id: number) {
        return await this.prismaService.rbacRole.findFirst({
            where: { id, deletedAt: null }
        });
    }

    /**
     * 校验角色存在并且当前用户有查看该角色资源的权限。
     */
    private async assertRoleViewable(id: number, actorId: string) {
        const role = await this.findOne(id);
        if (!role) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW);
        return role;
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

    private buildPermissionCodewordWhere(keyword?: string): Prisma.RbacPermissionWhereInput {
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

    private buildPermissionFieldWhere(query: {
        keyword?: string;
        code?: string;
        name?: string;
        description?: string;
    }): Prisma.RbacPermissionWhereInput {
        const code = query.code?.trim();
        const name = query.name?.trim();
        const description = query.description?.trim();

        return {
            ...this.buildPermissionCodewordWhere(query.keyword),
            ...(code ? { code: { contains: code } } : {}),
            ...(name ? { name: { contains: name } } : {}),
            ...(description ? { description: { contains: description } } : {})
        };
    }

    /**
     * 校验传入的角色主键是否全部存在。
     */
    async checkHasRoles(roles: RbacRole['id'][]) {
        const findRoleIDs = (
            await this.prismaService.rbacRole.findMany({
                where: { id: { in: roles }, deletedAt: null }
            })
        ).map((role) => role.id);

        if (roles.length && (!findRoleIDs || findRoleIDs.length === 0)) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }

        const existRoleIds = intersection(findRoleIDs, roles);
        if (existRoleIds.length < roles.length) {
            const lackRoleIds = xor(existRoleIds, roles);
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND_IDS(lackRoleIds.join(',')));
        }
    }

    /**
     * 批量为角色列表补充当前用户对每行角色对象的操作能力。
     */
    private async attachViewerRoleCapabilities(records: RbacRole[], actorId: string) {
        if (records.length === 0) {
            return records.map((record) => this.withViewerRoleCapabilities(record));
        }

        const permissions = await this.getViewerRolePermissions(actorId);

        return records.map((record) => this.withViewerRoleCapabilities(record, permissions));
    }

    /**
     * 将权限布尔值合并到角色记录，供前端按钮直接消费。
     */
    private withViewerRoleCapabilities(record: RbacRole, permissions: Record<string, boolean> = {}) {
        return {
            ...record,
            viewerCanUpdate: permissions.update === true,
            viewerCanDelete: permissions.delete === true,
            viewerCanAssignUser: permissions.assign_user === true,
            viewerCanAssignUserGroup: permissions.assign_user_group === true,
            viewerCanAssignParentRole: permissions.assign_parent_role === true,
            viewerCanAssignPermission: permissions.assign_permission === true,
            viewerCanAssignTaskCapability: permissions.assign_task_capability === true,
            viewerCanAssignTaskResource: permissions.assign_task_resource === true
        };
    }

    private async getViewerRolePermissions(actorId: string): Promise<Record<string, boolean>> {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.SYSTEM_ROLE_UPDATE,
            RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE,
            RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER,
            RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER_GROUP,
            RBAC_PERMISSIONS.ROLE_ASSIGN_PARENT_ROLE,
            RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION,
            RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY,
            RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE
        ]);

        return {
            update: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_UPDATE) ?? false,
            delete: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE) ?? false,
            assign_user: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER) ?? false,
            assign_user_group: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER_GROUP) ?? false,
            assign_parent_role: permissions.get(RBAC_PERMISSIONS.ROLE_ASSIGN_PARENT_ROLE) ?? false,
            assign_permission: permissions.get(RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION) ?? false,
            assign_task_capability: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY) ?? false,
            assign_task_resource: permissions.get(RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE) ?? false
        };
    }

    /**
     * 校验用户 ID 是否全部存在。
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
     * 校验用户组 ID 是否全部存在。
     */
    private async ensureUserGroupsExist(userGroupIds: number[]): Promise<void> {
        const uniqueUserGroupIds = [...new Set(userGroupIds)];
        if (uniqueUserGroupIds.length === 0) {
            return;
        }

        const found = await this.prismaService.rbacUserGroup.count({
            where: {
                id: {
                    in: uniqueUserGroupIds
                },
                deletedAt: null
            }
        });

        if (found !== uniqueUserGroupIds.length) {
            throw new BusinessException(AdminErrorCodes.USER_GROUP.NOT_FOUND);
        }
    }

    /**
     * 查询一组用户组内的成员用户 ID，用于刷新间接角色变更影响范围。
     */
    private async findUserIdsByGroupIds(userGroupIds: number[]): Promise<string[]> {
        const uniqueUserGroupIds = [...new Set(userGroupIds)].filter(
            (userGroupId) => Number.isInteger(userGroupId) && userGroupId > 0
        );
        if (uniqueUserGroupIds.length === 0) {
            return [];
        }

        const rows = await this.prismaService.rbacUserGroupMember.findMany({
            where: {
                groupId: {
                    in: uniqueUserGroupIds
                }
            },
            select: {
                userId: true
            }
        });
        return [...new Set(rows.map((row) => row.userId))];
    }

    private async rebuildAffectedUsers(userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        if (uniqueUserIds.length === 0) {
            return;
        }
        await this.rbacGraphService.applyRebuild(uniqueUserIds);
    }

    private async getRoleUserIds(roleId: number): Promise<string[]> {
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

    private async getRoleGroupIds(roleId: number): Promise<number[]> {
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

    private async getParentRoleIds(roleId: number): Promise<number[]> {
        const rows = await this.prismaService.rbacRoleInherit.findMany({
            where: {
                roleId
            },
            select: {
                parentRoleId: true
            }
        });
        return rows.map((row) => row.parentRoleId);
    }

    private async getRolePermissionIds(roleId: number): Promise<number[]> {
        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                roleId
            },
            select: {
                permissionId: true
            }
        });
        return rows.map((row) => row.permissionId);
    }

    private async getRoleEffectivePermissionState(roleId: number) {
        const roleIds = await this.rbacGraphService.getRoleClosure([roleId]);
        if (roleIds.length === 0) {
            return {
                effectivePermissionIds: [],
                inheritedPermissionIds: []
            };
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
                roleId: true,
                permissionId: true
            }
        });
        return {
            effectivePermissionIds: [...new Set(rows.map((row) => row.permissionId))].sort((a, b) => a - b),
            inheritedPermissionIds: [
                ...new Set(rows.filter((row) => row.roleId !== roleId).map((row) => row.permissionId))
            ].sort((a, b) => a - b)
        };
    }

    private async resolveEffectiveUserSourcesForRole(roleId: number, userIds: string[]) {
        const uniqueUserIds = [...new Set(userIds)];
        const emptySource = () => ({
            effectiveRoleSources: [] as string[],
            effectiveRoleSourceRoleIds: [] as number[],
            effectiveRoleSourceGroupIds: [] as number[]
        });
        const sourceByUserId = new Map<string, ReturnType<typeof emptySource>>(
            uniqueUserIds.map((userId) => [userId, emptySource()])
        );
        if (uniqueUserIds.length === 0) {
            return sourceByUserId;
        }

        const [directRoleRows, groupMemberRows] = await Promise.all([
            this.prismaService.rbacUserRole.findMany({
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
            this.prismaService.rbacUserGroupMember.findMany({
                where: {
                    userId: {
                        in: uniqueUserIds
                    },
                    group: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    userId: true,
                    groupId: true
                }
            })
        ]);
        const groupIds = [...new Set(groupMemberRows.map((row) => row.groupId))];
        const groupRoleRows =
            groupIds.length > 0
                ? await this.prismaService.rbacUserGroupRole.findMany({
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
                : [];
        const roleIdsByGroup = new Map<number, number[]>();
        for (const row of groupRoleRows) {
            const roleIds = roleIdsByGroup.get(row.groupId) ?? [];
            roleIds.push(row.roleId);
            roleIdsByGroup.set(row.groupId, roleIds);
        }

        const addSource = (
            userId: string,
            source: 'DIRECT_ROLE' | 'USER_GROUP_ROLE',
            sourceRoleId?: number,
            sourceGroupId?: number
        ) => {
            const current = sourceByUserId.get(userId) ?? emptySource();
            if (!current.effectiveRoleSources.includes(source)) {
                current.effectiveRoleSources.push(source);
            }
            if (sourceRoleId && !current.effectiveRoleSourceRoleIds.includes(sourceRoleId)) {
                current.effectiveRoleSourceRoleIds.push(sourceRoleId);
            }
            if (sourceGroupId && !current.effectiveRoleSourceGroupIds.includes(sourceGroupId)) {
                current.effectiveRoleSourceGroupIds.push(sourceGroupId);
            }
            sourceByUserId.set(userId, current);
        };

        for (const row of directRoleRows) {
            if (row.roleId === roleId) {
                addSource(row.userId, 'DIRECT_ROLE', row.roleId);
            }
        }
        for (const member of groupMemberRows) {
            for (const sourceRoleId of roleIdsByGroup.get(member.groupId) ?? []) {
                if (sourceRoleId === roleId) {
                    addSource(member.userId, 'USER_GROUP_ROLE', sourceRoleId, member.groupId);
                }
            }
        }

        return sourceByUserId;
    }
}
