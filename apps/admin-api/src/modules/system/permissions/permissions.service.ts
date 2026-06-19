import { BusinessException, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma, RbacPermission, RbacStatus } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { AdminErrorCodes } from '../../../common/constants/index';
import {
    CreateRbacPermissionDto,
    QueryRbacPermissionListDto,
    QueryRbacPermissionRolesDto,
    SuggestRbacPermissionCodeDto,
    UpdateRbacPermissionDto
} from '../rbac/dto/rbac.dto';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { isValidRbacPermissionCode, suggestRbacPermissionCode } from '../rbac/rbac-permission-code';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import {
    SystemRbacPermissionDiscoveryService,
    type RbacPermissionCandidateAction
} from '../discovery/discovery.service';

@Injectable()
export class SystemRbacPermissionsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly authzService: RbacAuthorizationService,
        private readonly graphService: SystemRbacGraphService,
        private readonly discoveryService: SystemRbacPermissionDiscoveryService
    ) {}

    async getPermissionList(query: QueryRbacPermissionListDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);
        const [records, pagination] = await this.prismaService.rbacPermission.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.kind ? { kind: query.kind } : {}),
                ...(query.status ? { status: query.status } : {}),
                ...(query.groupId ? { groupId: query.groupId } : {}),
                ...this.buildPermissionFieldWhere(query)
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
        const meta = await this.getMeta(actorId);

        return {
            records: records.map((record) => this.withCapabilities(record, meta)),
            meta,
            pagination
        };
    }

    async createPermission(data: CreateRbacPermissionDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_CREATE);
        this.assertValidCode(data.code);
        await this.ensureCodeAvailable(data.code);
        await this.ensureGroupExists(data.groupId ?? null);
        const permission = await this.prismaService.rbacPermission.create({
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                kind: data.kind,
                groupId: data.groupId ?? null,
                sort: data.sort,
                isBuiltin: data.isBuiltin,
                status: data.status,
                createdBy: actorId,
                updatedBy: actorId
            }
        });
        if (permission.status === RbacStatus.ENABLE) {
            await this.rebuildAffectedUsers(await this.graphService.getCurrentSuperAdminUserIds());
        }
        return permission;
    }

    async getDeclarationBoard(actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);

        const candidates = this.discoveryService.getCandidates();
        const declaredCodes = new Set(candidates.actions.map((action) => action.permissionCode));
        const meta = await this.getMeta(actorId);
        const permissions = await this.prismaService.rbacPermission.findMany({
            where: {
                deletedAt: null
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
        const permissionsWithCapabilities = permissions.map((record) => this.withCapabilities(record, meta));
        const permissionByCode = new Map(
            permissionsWithCapabilities.map((permission) => [permission.code, permission])
        );

        return {
            tree: candidates.tree,
            declarations: candidates.actions.map((action) => {
                const permission = permissionByCode.get(action.permissionCode) ?? null;
                return {
                    ...action,
                    declarationKey: this.buildDeclarationKey(action),
                    databaseState: permission ? 'EXISTS' : 'MISSING',
                    permission
                };
            }),
            unassignedPermissions: permissionsWithCapabilities.filter(
                (permission) => !declaredCodes.has(permission.code)
            ),
            meta
        };
    }

    async updatePermission(id: number, data: UpdateRbacPermissionDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_UPDATE);
        const permission = await this.getExistingPermission(id);
        if (data.code && data.code !== permission.code) {
            this.assertValidCode(data.code);
            await this.ensureCodeAvailable(data.code, id);
        }
        if (data.groupId !== undefined) {
            await this.ensureGroupExists(data.groupId ?? null);
        }
        const effectiveChanged =
            (data.code !== undefined && data.code !== permission.code) ||
            (data.status !== undefined && data.status !== permission.status);
        const affectedUserIds = effectiveChanged ? await this.getPermissionEffectiveChangeUserIds(permission.id) : [];
        const updated = await this.prismaService.rbacPermission.update({
            where: {
                id
            },
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                kind: data.kind,
                groupId: data.groupId,
                sort: data.sort,
                isBuiltin: data.isBuiltin,
                status: data.status,
                updatedBy: actorId
            }
        });
        await this.rebuildAffectedUsers(affectedUserIds);
        return updated;
    }

    async deletePermission(id: number, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_DELETE);
        const permission = await this.getExistingPermission(id);
        if (permission.isBuiltin) {
            throw new BusinessException(AdminErrorCodes.RBAC.BUILTIN_DELETE_FORBIDDEN);
        }
        await this.assertPermissionNotRequiredByMenu(permission.code);
        const affectedUserIds = await this.getPermissionEffectiveChangeUserIds(permission.id);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRolePermission.deleteMany({ where: { permissionId: id } });
            await tx.rbacEffectiveUserPermission.deleteMany({ where: { permissionId: id } });
            await tx.rbacPermission.update({
                where: {
                    id
                },
                data: {
                    deletedAt: new Date(),
                    updatedBy: actorId
                }
            });
        });
        await this.rebuildAffectedUsers(affectedUserIds);
        return null;
    }

    async suggestCode(data: SuggestRbacPermissionCodeDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_CREATE);
        return {
            // 建议 code 只由服务端生成候选值；保存时仍按用户最终提交的 code 做格式和唯一性校验。
            code: suggestRbacPermissionCode(data)
        };
    }

    async getPermissionRelations(id: number, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);
        const permission = await this.getExistingPermission(id);
        const [roleRows, menuRows, effectiveUserRows] = await Promise.all([
            this.prismaService.rbacRolePermission.findMany({
                where: {
                    permissionId: id
                },
                select: {
                    roleId: true
                }
            }),
            this.prismaService.rbacMenu.findMany({
                where: {
                    requiredPermissionCode: permission.code
                },
                select: {
                    id: true
                }
            }),
            this.prismaService.rbacEffectiveUserPermission.findMany({
                where: {
                    permissionId: id
                },
                select: {
                    userId: true
                }
            })
        ]);

        return {
            permission: this.withCapabilities(permission, await this.getMeta(actorId)),
            roleIds: roleRows.map((row) => row.roleId),
            menuIds: menuRows.map((row) => row.id),
            effectiveUserIds: effectiveUserRows.map((row) => row.userId)
        };
    }

    async queryAssignableRoles(query: QueryRbacPermissionRolesDto, actorId: string) {
        await this.assertPermissionViewable(query.permissionId, actorId);
        const assignedRoleIds = await this.getPermissionRoleIds(query.permissionId);
        const assignedSet = new Set(assignedRoleIds);
        const [records, pagination] = await this.prismaService.rbacRole.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.status ? { status: query.status } : {}),
                ...this.buildRoleFieldWhere(query),
                ...(query.assigned !== undefined
                    ? {
                          id: query.assigned
                              ? {
                                    in: [...assignedSet]
                                }
                              : {
                                    notIn: [...assignedSet]
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
                assigned: assignedSet.has(record.id)
            })),
            pagination
        };
    }

    async getExistingPermission(id: number) {
        const permission = await this.prismaService.rbacPermission.findFirst({
            where: {
                id,
                deletedAt: null
            }
        });
        if (!permission) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
        return permission;
    }

    private async assertPermissionViewable(id: number, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);
        return await this.getExistingPermission(id);
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

    private async ensureCodeAvailable(code: string, excludeId?: number) {
        const existing = await this.prismaService.rbacPermission.findFirst({
            where: {
                code,
                ...(excludeId ? { id: { not: excludeId } } : {})
            }
        });
        if (existing) {
            throw new BusinessException(AdminErrorCodes.RBAC.CODE_EXISTS);
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
            throw new BusinessException(AdminErrorCodes.RBAC.NOT_FOUND);
        }
    }

    private async ensureRolesExist(roleIds: number[]) {
        const uniqueIds = [...new Set(roleIds)];
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
            throw new BusinessException(AdminErrorCodes.RBAC.NOT_FOUND);
        }
    }

    private async assertPermissionNotRequiredByMenu(code: string) {
        const menuCount = await this.prismaService.rbacMenu.count({
            where: {
                requiredPermissionCode: code
            }
        });
        if (menuCount > 0) {
            throw new BusinessException(AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID, {
                code,
                menuCount
            });
        }
    }

    private async getPermissionEffectiveChangeUserIds(permissionId: number): Promise<string[]> {
        // 权限状态或 code 改动会影响显式持有该权限的用户，也会影响超管的“全权限”展开结果。
        const [permissionUserIds, superAdminUserIds] = await Promise.all([
            this.graphService.getAffectedUserIdsByPermissionIds([permissionId]),
            this.graphService.getCurrentSuperAdminUserIds()
        ]);
        return [...new Set([...permissionUserIds, ...superAdminUserIds])];
    }

    private async rebuildAffectedUsers(userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        if (uniqueUserIds.length === 0) {
            return;
        }
        await this.graphService.applyRebuild(uniqueUserIds);
    }

    private assertValidCode(code: string): void {
        if (!isValidRbacPermissionCode(code)) {
            throw new BusinessException(AdminErrorCodes.RBAC.CODE_INVALID, {
                code
            });
        }
    }

    private async getMeta(actorId: string) {
        const permissions = await this.authzService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.PERMISSION_CREATE,
            RBAC_PERMISSIONS.PERMISSION_UPDATE,
            RBAC_PERMISSIONS.PERMISSION_DELETE,
            RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION
        ]);
        return {
            viewerCanCreatePermission: permissions.get(RBAC_PERMISSIONS.PERMISSION_CREATE) ?? false,
            viewerCanUpdatePermission: permissions.get(RBAC_PERMISSIONS.PERMISSION_UPDATE) ?? false,
            viewerCanDeletePermission: permissions.get(RBAC_PERMISSIONS.PERMISSION_DELETE) ?? false,
            viewerCanAssignRole: permissions.get(RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION) ?? false
        };
    }

    private withCapabilities(
        record: RbacPermission,
        meta: Awaited<ReturnType<SystemRbacPermissionsService['getMeta']>>
    ) {
        return {
            ...record,
            viewerCanUpdate: meta.viewerCanUpdatePermission,
            viewerCanDelete: meta.viewerCanDeletePermission && !record.isBuiltin,
            viewerCanAssignRole: meta.viewerCanAssignRole
        };
    }

    private buildDeclarationKey(action: RbacPermissionCandidateAction): string {
        return [action.moduleName, action.sourceKind, action.className, action.methodName, action.permissionCode].join(
            ':'
        );
    }

    private buildPermissionFieldWhere(query: QueryRbacPermissionListDto): Prisma.RbacPermissionWhereInput {
        const code = query.code?.trim();
        const name = query.name?.trim();
        const description = query.description?.trim();

        return {
            ...(code ? { code: { contains: code } } : {}),
            ...(name ? { name: { contains: name } } : {}),
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
                { code: { contains: normalizedKeyword } },
                { name: { contains: normalizedKeyword } },
                { description: { contains: normalizedKeyword } }
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
}
