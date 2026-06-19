import { BusinessException, createRuntimeLogger, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { Injectable } from '@nestjs/common';
import { Traceable } from 'nestjs-otel';
import {
    MenuStatusEnum,
    MenuTypeEnum,
    Prisma,
    RbacMenu,
    RbacPermissionKind,
    RbacStatus
} from '@app/prisma-app/generated/client';
import { isNil } from 'es-toolkit';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
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
import {
    CreateMenuDto,
    QueryMenuListDto,
    QueryMenuRelationRoleDto,
    QueryMenuTreeDto,
    QueryMenuVisibleUserDto,
    UpdateMenuDto
} from './dto/menu.dto';
@Traceable()
@Injectable()
export class SystemMenusService {
    private readonly logger = createRuntimeLogger(SystemMenusService.name, {
        module: 'menu',
        domain: 'menu',
        resource: { type: 'menu' }
    });

    /**
     * 注入菜单元数据、状态版本和 RBAC 授权依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly rbacAssignmentService: SystemRbacAssignmentsService,
        private readonly authzGraphService: SystemRbacGraphService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService
    ) {}
    /**
     * 创建 RBAC 菜单元数据，并确保菜单声明的 requiredPermissionCode 已入库。
     */
    async createMenu(createMenuDto: CreateMenuDto, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_CREATE,
            context
        );
        // 检查创建的菜单是否合法
        await this.checkMenu(createMenuDto);
        await this.ensureRequiredPermissionCodeAvailable(createMenuDto.requiredPermissionCode);
        await this.ensureRequiredPermissionExists(createMenuDto.requiredPermissionCode);
        await this.ensureGroupExists(createMenuDto.groupId ?? null);
        const result = await this.prismaService.rbacMenu.create({
            data: {
                ...createMenuDto,
                createdBy: actorId,
                updatedBy: actorId
            }
        });
        await this.rebuildAffectedUsers(
            await this.authzGraphService.getAffectedUserIdsByMenuPermissionCodes([result.requiredPermissionCode])
        );
        // 菜单创建成功后更新全局菜单版本号，通知前端刷新
        try {
            await this.adminUserStateService.bumpMenuStateVersion();
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpMenuStateVersion 失败
            this.logger.warn('createMenu: bumpMenuStateVersion 失败', { error });
        }
        return result;
    }

    /**
     * 查询菜单列表，支持前端传入的筛选参数并保持树构建所需的稳定排序。
     */
    async findAll(query: QueryMenuListDto, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
            context
        );
        const createdAtFilter = query.createdAt
            ? {
                  gte: new Date(query.createdAt[0]),
                  lte: new Date(query.createdAt[1])
              }
            : undefined;

        const records = await this.prismaService.rbacMenu.findMany({
            where: {
                ...this.buildMenuWhere(query),
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
            },
            orderBy: this.buildMenuOrderBy()
        });
        return {
            records: await this.attachViewerMenuCapabilities(records, actorId, context),
            meta: {
                viewerCanCreateMenu: await checkRbacServicePermission(
                    this.rbacAuthorizationService,
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_MENU_CREATE,
                    context
                )
            }
        };
    }

    async getMenuTree(query: QueryMenuTreeDto, actorId: string, context?: RbacServiceContext) {
        return await this.findAll(query, actorId, context);
    }

    async getMenuList(query: QueryMenuListDto, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
            context
        );
        const [records, pagination] = await this.prismaService.rbacMenu.findManyAndCount({
            where: this.buildMenuWhere(query),
            take: query.pageSize,
            skip: query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined,
            orderBy: this.buildMenuOrderBy()
        });
        return {
            records: await this.attachViewerMenuCapabilities(records, actorId, context),
            meta: {
                viewerCanCreateMenu: await checkRbacServicePermission(
                    this.rbacAuthorizationService,
                    actorId,
                    RBAC_PERMISSIONS.SYSTEM_MENU_CREATE,
                    context
                )
            },
            pagination
        };
    }

    async getMenuDetail(id: number, actorId: string, context?: RbacServiceContext) {
        const menu = await this.assertMenuViewable(id, actorId, context);
        return {
            menu: await this.attachViewerMenuCapability(menu, actorId, context)
        };
    }

    /**
     * 按菜单主键查询菜单元数据。
     */
    async findOne(id: number) {
        return await this.prismaService.rbacMenu.findUnique({
            where: { id }
        });
    }

    /**
     * 按菜单主键查询菜单元数据，并断言当前用户拥有查看菜单资源的能力。
     */
    async findOneForViewer(id: number, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
            context
        );
        return await this.findOne(id);
    }

    /**
     * 批量为菜单列表记录补充当前用户对每行菜单对象的操作能力。
     */
    private async attachViewerMenuCapabilities(records: RbacMenu[], actorId: string, context?: RbacServiceContext) {
        if (records.length === 0) {
            return records.map((record) => this.withViewerMenuCapabilities(record));
        }

        const permissions = await this.getViewerMenuPermissions(actorId, context);

        return records.map((record) => this.withViewerMenuCapabilities(record, permissions));
    }

    /**
     * 为单个菜单记录补充当前用户操作能力。
     */
    private async attachViewerMenuCapability(record: RbacMenu, actorId: string, context?: RbacServiceContext) {
        return this.withViewerMenuCapabilities(record, await this.getViewerMenuPermissions(actorId, context));
    }

    /**
     * 将权限布尔值合并到菜单记录，供前端按钮直接消费。
     */
    private withViewerMenuCapabilities(record: RbacMenu, permissions: Record<string, boolean> = {}) {
        return {
            ...record,
            viewerCanUpdate: permissions.update === true,
            viewerCanDelete: permissions.delete === true,
            viewerCanAssignRole: permissions.assign_role === true
        };
    }

    private async getViewerMenuPermissions(
        actorId: string,
        context?: RbacServiceContext
    ): Promise<Record<string, boolean>> {
        const permissions = await checkRbacServicePermissions(
            this.rbacAuthorizationService,
            actorId,
            [
                RBAC_PERMISSIONS.SYSTEM_MENU_UPDATE,
                RBAC_PERMISSIONS.SYSTEM_MENU_DELETE,
                RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE
            ],
            context
        );

        return {
            update: permissions.get(RBAC_PERMISSIONS.SYSTEM_MENU_UPDATE) ?? false,
            delete: permissions.get(RBAC_PERMISSIONS.SYSTEM_MENU_DELETE) ?? false,
            assign_role: permissions.get(RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE) ?? false
        };
    }

    /**
     * 查询菜单关系视图初始化数据，表格明细由分页接口按需加载。
     */
    async getMenuRelations(id: number, actorId: string, context?: RbacServiceContext) {
        const menu = await this.findOne(id);
        if (!menu) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
            context
        );

        const [roleIds, visibleUserIds] = await Promise.all([
            this.getMenuViewerRoleIds(id),
            this.getVisibleUserIdsByMenuId(id)
        ]);

        return {
            menu: await this.attachViewerMenuCapability(menu, actorId, context),
            roleIds,
            visibleUserIds
        };
    }

    /**
     * 分页查询拥有菜单所需权限的角色表，筛选和分页在数据库侧完成。
     */
    async getMenuRelationRoles(query: QueryMenuRelationRoleDto, actorId: string, context?: RbacServiceContext) {
        await this.assertMenuViewable(query.menuId, actorId, context);
        const draftRoleIdSet = new Set(query.draftRoleIds);
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            where: {
                ...this.buildRoleFieldWhere(query),
                ...(query.status ? { status: query.status as RbacStatus } : {}),
                deletedAt: null,
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
     * 分页查询菜单当前可见用户。menu.view 展示态通过 RBAC 可见菜单读模型计算。
     */
    async getMenuVisibleUsers(query: QueryMenuVisibleUserDto, actorId: string, context?: RbacServiceContext) {
        await this.assertMenuViewable(query.menuId, actorId, context);
        const visibleUserIds = await this.getVisibleUserIdsByMenuId(query.menuId);
        const [records, pagination] = await this.prismaService.betterAuthUser.findManyAndCount({
            where: {
                id: {
                    in: visibleUserIds
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

        return {
            records,
            pagination
        };
    }

    /**
     * 更新菜单元数据，并刷新全局菜单状态版本。
     */
    async update(updateMenuDto: UpdateMenuDto, actorId: string, context?: RbacServiceContext) {
        const { id, ...rest } = updateMenuDto;
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_UPDATE,
            context
        );
        const previous = await this.findOne(id);
        if (!previous) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
        if (
            updateMenuDto.requiredPermissionCode !== undefined &&
            updateMenuDto.requiredPermissionCode !== previous.requiredPermissionCode
        ) {
            await this.ensureRequiredPermissionCodeAvailable(updateMenuDto.requiredPermissionCode, id);
            await this.ensureRequiredPermissionExists(updateMenuDto.requiredPermissionCode);
        }
        if (updateMenuDto.groupId !== undefined) {
            await this.ensureGroupExists(updateMenuDto.groupId ?? null);
        }
        const result = await this.prismaService.rbacMenu.update({
            where: { id },
            data: {
                ...rest,
                updatedBy: actorId
            }
        });
        if (this.hasEffectiveMenuVisibilityChanged(previous, result)) {
            await this.rebuildAffectedUsers(
                await this.authzGraphService.getAffectedUserIdsByMenuPermissionCodes([
                    previous.requiredPermissionCode,
                    result.requiredPermissionCode
                ])
            );
        }
        // 菜单更新成功后更新全局菜单版本号，通知前端刷新
        try {
            await this.adminUserStateService.bumpMenuStateVersion();
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpMenuStateVersion 失败
            this.logger.warn('update: bumpMenuStateVersion 失败', { error });
        }
        return result;
    }

    /**
     * 删除指定菜单，删除前校验是否仍被角色授权引用。
     */
    async deleteMenu(id: number, actorId: string, context?: RbacServiceContext) {
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_DELETE,
            context
        );
        const menu = await this.findOne(id);
        if (!menu) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
        // 查询该菜单是否被别的角色关联
        let roles = await this.getRolesByMenu(id);
        this.logger.debug.title('查询菜单关联角色', { id, roles });
        if (roles.length > 0) {
            let refUsers = roles.map((roles) => {
                return `角色名: ${roles.name} , 角色id:  ${roles.id}`;
            });
            this.logger.debug.title('菜单关联角色详情', { refUsers });
            throw new BusinessException(ErrorCodes.ROLE.DELETE_FAILED_REF(refUsers.join(',')));
        }
        await this.authzObjectExceptionService.cleanupDeletedResource('menu', String(id));
        const result = await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserVisibleMenu.deleteMany({ where: { menuId: id } });
            return await tx.rbacMenu.delete({
                where: {
                    id
                }
            });
        });
        await this.rebuildAffectedUsers(
            await this.authzGraphService.getAffectedUserIdsByMenuPermissionCodes([menu.requiredPermissionCode])
        );
        // 菜单删除成功后更新全局菜单版本号，通知前端刷新
        try {
            await this.adminUserStateService.bumpMenuStateVersion();
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 bumpMenuStateVersion 失败
            this.logger.warn('deleteMenu: bumpMenuStateVersion 失败', { error });
        }
        return result;
    }

    /**
     * 从菜单视角替换拥有 requiredPermissionCode 的角色集合，并刷新相关角色版本。
     */
    async assignRoles(id: RbacMenu['id'], roleIds: number[], actorId: string, context?: RbacServiceContext) {
        return await this.rbacAssignmentService.replaceMenuViewerRoles(id, roleIds, actorId, context);
    }

    /**
     * 获取指定菜单的 requiredPermissionCode 被哪些角色授予。
     */
    async getRolesByMenu(id: RbacMenu['id']) {
        const roleIds = await this.getMenuViewerRoleIds(id);
        if (roleIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: roleIds
                },
                deletedAt: null
            },
            select: {
                name: true,
                code: true,
                id: true
            }
        });
    }

    /**
     * 校验菜单存在，并确认当前用户具备菜单管理视图权限。
     */
    private async assertMenuViewable(id: number, actorId: string, context?: RbacServiceContext) {
        const menu = await this.findOne(id);
        if (!menu) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
        await assertRbacServicePermission(
            this.rbacAuthorizationService,
            actorId,
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
            context
        );
        return menu;
    }

    private buildMenuWhere(query: {
        keyword?: string;
        name?: string;
        title?: string;
        requiredPermissionCode?: string;
        path?: string;
        type?: MenuTypeEnum | string;
        status?: MenuStatusEnum | string;
        groupId?: number;
    }): Prisma.RbacMenuWhereInput {
        return {
            ...(query.type ? { type: query.type as MenuTypeEnum } : {}),
            ...(query.status ? { status: query.status as MenuStatusEnum } : {}),
            ...(query.groupId ? { groupId: query.groupId } : {}),
            ...this.buildMenuKeywordWhere(query.keyword ?? query.name),
            ...(query.title ? { title: { contains: query.title } } : {}),
            ...(query.requiredPermissionCode
                ? { requiredPermissionCode: { contains: query.requiredPermissionCode } }
                : {}),
            ...(query.path ? { path: { contains: query.path } } : {})
        };
    }

    private buildMenuOrderBy(): Prisma.RbacMenuOrderByWithRelationInput[] {
        return [
            {
                order: 'asc'
            },
            {
                id: 'asc'
            }
        ];
    }

    /**
     * 构造角色关系表关键字查询条件。
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
     * 构造后台用户关系表关键字查询条件。
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
                },
                {
                    path: {
                        contains: normalizedKeyword
                    }
                },
                {
                    componentPath: {
                        contains: normalizedKeyword
                    }
                }
            ]
        };
    }

    private async ensureRequiredPermissionExists(requiredPermissionCode: string) {
        const count = await this.prismaService.rbacPermission.count({
            where: {
                code: requiredPermissionCode,
                deletedAt: null,
                status: RbacStatus.ENABLE
            }
        });
        if (count !== 1) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
    }

    private async ensureGroupExists(groupId: number | null): Promise<void> {
        if (!groupId) {
            return;
        }
        const count = await this.prismaService.rbacPermissionGroup.count({
            where: {
                id: groupId,
                deletedAt: null
            }
        });
        if (count !== 1) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
    }

    private async ensureRequiredPermissionCodeAvailable(requiredPermissionCode: string, excludeId?: number) {
        const existing = await this.prismaService.rbacMenu.findFirst({
            where: {
                requiredPermissionCode,
                ...(excludeId ? { id: { not: excludeId } } : {})
            },
            select: {
                id: true
            }
        });
        if (existing) {
            throw new BusinessException(ErrorCodes.MENU.NAME_ALREADY_EXISTS);
        }
    }

    /**
     * 校验角色 ID 是否全部存在。
     */
    private async ensureRolesExist(roleIds: number[]): Promise<void> {
        const uniqueRoleIds = [...new Set(roleIds)];
        if (uniqueRoleIds.length === 0) {
            return;
        }

        const found = await this.prismaService.rbacRole.count({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                deletedAt: null
            }
        });

        if (found !== uniqueRoleIds.length) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND);
        }
    }

    private hasEffectiveMenuVisibilityChanged(
        previous: Pick<RbacMenu, 'requiredPermissionCode' | 'status'>,
        next: Pick<RbacMenu, 'requiredPermissionCode' | 'status'>
    ): boolean {
        return previous.requiredPermissionCode !== next.requiredPermissionCode || previous.status !== next.status;
    }

    private async rebuildAffectedUsers(userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        if (uniqueUserIds.length === 0) {
            return;
        }
        await this.authzGraphService.applyRebuild(uniqueUserIds);
    }

    private async getMenuPermissionRecord(menu: Pick<RbacMenu, 'requiredPermissionCode'>) {
        return await this.prismaService.rbacPermission.findFirst({
            where: {
                code: menu.requiredPermissionCode,
                deletedAt: null
            },
            select: {
                id: true,
                code: true
            }
        });
    }

    private async ensureRequiredPermission(
        menu: Pick<RbacMenu, 'title' | 'type' | 'requiredPermissionCode'>,
        actorId: string
    ) {
        return await this.prismaService.rbacPermission.upsert({
            where: {
                code: menu.requiredPermissionCode
            },
            update: {
                name: menu.title,
                kind: menu.type === MenuTypeEnum.Button ? RbacPermissionKind.ACTION : RbacPermissionKind.MENU,
                status: RbacStatus.ENABLE,
                isBuiltin: true,
                updatedBy: actorId
            },
            create: {
                code: menu.requiredPermissionCode,
                name: menu.title,
                description: `菜单所需权限: ${menu.title}`,
                kind: menu.type === MenuTypeEnum.Button ? RbacPermissionKind.ACTION : RbacPermissionKind.MENU,
                status: RbacStatus.ENABLE,
                isBuiltin: true,
                createdBy: actorId,
                updatedBy: actorId
            },
            select: {
                id: true,
                code: true
            }
        });
    }

    private async getMenuViewerRoleIds(menuId: number): Promise<number[]> {
        const menu = await this.findOne(menuId);
        if (!menu) {
            return [];
        }
        const permission = await this.getMenuPermissionRecord(menu);
        if (!permission) {
            return [];
        }
        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                permissionId: permission.id
            },
            select: {
                roleId: true
            }
        });
        return rows.map((row) => row.roleId);
    }

    private async getVisibleUserIdsByMenuId(menuId: number): Promise<string[]> {
        const rows = await this.prismaService.rbacUserVisibleMenu.findMany({
            where: {
                menuId
            },
            select: {
                userId: true
            }
        });
        return rows.map((row) => row.userId);
    }
    /**
     * 检查创建菜单时的父子节点类型约束是否合法。
     */
    async checkMenu(menu: CreateMenuDto) {
        if (isNil(menu.pid)) {
            // 目录和菜单的父级可以为空,为空不做父级检测,但是按钮不能为空
            if (menu.type === MenuTypeEnum.Button) {
                throw new BusinessException(ErrorCodes.MENU.PARENT_NOT_FOUND);
            }
        } else {
            // 获取菜单父节点
            let parent: RbacMenu | null = null;
            parent = await this.prismaService.rbacMenu.findUnique({ where: { id: menu.pid } });
            if (isNil(parent)) {
                // 父级不存在
                throw new BusinessException(ErrorCodes.MENU.PARENT_NOT_FOUND);
            }
            // 判断父节点的类型是否合法

            // 按钮的上级只能为页面类型的节点
            if (menu.type === MenuTypeEnum.Button && parent.type !== MenuTypeEnum.Page) {
                throw new BusinessException(ErrorCodes.MENU.BUTTON_PARENT_MUST_PAGE);
            }
            // 页面的父级只能为目录类型的节点
            if (menu.type === MenuTypeEnum.Page && parent.type !== MenuTypeEnum.Catalog) {
                throw new BusinessException(ErrorCodes.MENU.PAGE_PARENT_MUST_CATALOG_ROOT);
            }
            // 目录的父级只能为目录类型的节点
            if (menu.type === MenuTypeEnum.Catalog && parent.type !== MenuTypeEnum.Catalog) {
                throw new BusinessException(ErrorCodes.MENU.CATALOG_PARENT_MUST_CATALOG_OR_NULL);
            }
        }
    }
}
