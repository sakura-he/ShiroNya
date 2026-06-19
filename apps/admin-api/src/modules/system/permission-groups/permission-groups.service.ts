import { BusinessException, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma, RbacPermissionGroup } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { AdminErrorCodes } from '../../../common/constants/index';
import {
    AssignRbacPermissionGroupRelationsDto,
    CreateRbacPermissionGroupDto,
    QueryRbacPermissionGroupListDto,
    UpdateRbacPermissionGroupDto
} from '../rbac/dto/rbac.dto';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';

type RbacPermissionGroupRecord = RbacPermissionGroup & {
    _count?: {
        permissions: number;
        menus: number;
    };
};

@Injectable()
export class SystemRbacPermissionGroupsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly authzService: RbacAuthorizationService
    ) {}

    async getGroupList(query: QueryRbacPermissionGroupListDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);
        const [records, pagination] = await this.prismaService.rbacPermissionGroup.findManyAndCount({
            where: {
                deletedAt: null,
                ...(query.status ? { status: query.status } : {}),
                ...this.buildGroupKeywordWhere(query.keyword)
            },
            include: {
                _count: {
                    select: {
                        permissions: true,
                        menus: true
                    }
                }
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

    async createGroup(data: CreateRbacPermissionGroupDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_CREATE);
        await this.ensureCodeAvailable(data.code);
        return await this.prismaService.rbacPermissionGroup.create({
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                sort: data.sort,
                status: data.status,
                createdBy: actorId,
                updatedBy: actorId
            }
        });
    }

    async updateGroup(id: number, data: UpdateRbacPermissionGroupDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_UPDATE);
        const group = await this.getExistingGroup(id);
        if (data.code && data.code !== group.code) {
            await this.ensureCodeAvailable(data.code, id);
        }
        return await this.prismaService.rbacPermissionGroup.update({
            where: {
                id
            },
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                sort: data.sort,
                status: data.status,
                updatedBy: actorId
            }
        });
    }

    async deleteGroup(id: number, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_DELETE);
        await this.getExistingGroup(id);
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacPermission.updateMany({
                where: {
                    groupId: id
                },
                data: {
                    groupId: null
                }
            });
            await tx.rbacMenu.updateMany({
                where: {
                    groupId: id
                },
                data: {
                    groupId: null
                }
            });
            await tx.rbacPermissionGroup.update({
                where: {
                    id
                },
                data: {
                    deletedAt: new Date(),
                    updatedBy: actorId
                }
            });
        });
        return null;
    }

    async getGroupRelations(id: number, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_VIEW);
        const group = await this.getExistingGroup(id);
        const [permissionRows, menuRows] = await Promise.all([
            this.prismaService.rbacPermission.findMany({
                where: {
                    groupId: id,
                    deletedAt: null
                },
                select: {
                    id: true
                }
            }),
            this.prismaService.rbacMenu.findMany({
                where: {
                    groupId: id
                },
                select: {
                    id: true
                }
            })
        ]);
        return {
            group: this.withCapabilities(group, await this.getMeta(actorId)),
            permissionIds: permissionRows.map((row) => row.id),
            menuIds: menuRows.map((row) => row.id)
        };
    }

    async assignRelations(data: AssignRbacPermissionGroupRelationsDto, actorId: string) {
        await this.authzService.assertPermission(actorId, RBAC_PERMISSIONS.PERMISSION_UPDATE);
        await this.getExistingGroup(data.groupId);
        const permissionIds = [...new Set(data.permissionIds)];
        const menuIds = [...new Set(data.menuIds)];
        await Promise.all([this.ensurePermissionsExist(permissionIds), this.ensureMenusExist(menuIds)]);

        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacPermission.updateMany({
                where: {
                    groupId: data.groupId,
                    id: {
                        notIn: permissionIds
                    }
                },
                data: {
                    groupId: null
                }
            });
            if (permissionIds.length > 0) {
                await tx.rbacPermission.updateMany({
                    where: {
                        id: {
                            in: permissionIds
                        },
                        deletedAt: null
                    },
                    data: {
                        groupId: data.groupId
                    }
                });
            }

            await tx.rbacMenu.updateMany({
                where: {
                    groupId: data.groupId,
                    id: {
                        notIn: menuIds
                    }
                },
                data: {
                    groupId: null
                }
            });
            if (menuIds.length > 0) {
                await tx.rbacMenu.updateMany({
                    where: {
                        id: {
                            in: menuIds
                        }
                    },
                    data: {
                        groupId: data.groupId
                    }
                });
            }
        });

        return await this.getGroupRelations(data.groupId, actorId);
    }

    private async getExistingGroup(id: number) {
        const group = await this.prismaService.rbacPermissionGroup.findFirst({
            where: {
                id,
                deletedAt: null
            }
        });
        if (!group) {
            throw new BusinessException(AdminErrorCodes.RBAC.NOT_FOUND);
        }
        return group;
    }

    private async ensureCodeAvailable(code: string, excludeId?: number) {
        const existing = await this.prismaService.rbacPermissionGroup.findFirst({
            where: {
                code,
                ...(excludeId ? { id: { not: excludeId } } : {})
            }
        });
        if (existing) {
            throw new BusinessException(AdminErrorCodes.RBAC.CODE_EXISTS);
        }
    }

    private async ensurePermissionsExist(permissionIds: number[]) {
        if (permissionIds.length === 0) {
            return;
        }
        const count = await this.prismaService.rbacPermission.count({
            where: {
                id: {
                    in: permissionIds
                },
                deletedAt: null
            }
        });
        if (count !== permissionIds.length) {
            throw new BusinessException(ErrorCodes.PERMISSION.NOT_FOUND);
        }
    }

    private async ensureMenusExist(menuIds: number[]) {
        if (menuIds.length === 0) {
            return;
        }
        const count = await this.prismaService.rbacMenu.count({
            where: {
                id: {
                    in: menuIds
                }
            }
        });
        if (count !== menuIds.length) {
            throw new BusinessException(ErrorCodes.MENU.NOT_FOUND);
        }
    }

    private async getMeta(actorId: string) {
        const permissions = await this.authzService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.PERMISSION_CREATE,
            RBAC_PERMISSIONS.PERMISSION_UPDATE,
            RBAC_PERMISSIONS.PERMISSION_DELETE
        ]);
        return {
            viewerCanCreateGroup: permissions.get(RBAC_PERMISSIONS.PERMISSION_CREATE) ?? false,
            viewerCanUpdateGroup: permissions.get(RBAC_PERMISSIONS.PERMISSION_UPDATE) ?? false,
            viewerCanDeleteGroup: permissions.get(RBAC_PERMISSIONS.PERMISSION_DELETE) ?? false,
            viewerCanAssignGroup: permissions.get(RBAC_PERMISSIONS.PERMISSION_UPDATE) ?? false
        };
    }

    private withCapabilities(
        record: RbacPermissionGroupRecord,
        meta: Awaited<ReturnType<SystemRbacPermissionGroupsService['getMeta']>>
    ) {
        return {
            ...record,
            permissionCount: record._count?.permissions ?? 0,
            menuCount: record._count?.menus ?? 0,
            viewerCanUpdate: meta.viewerCanUpdateGroup,
            viewerCanDelete: meta.viewerCanDeleteGroup,
            viewerCanAssign: meta.viewerCanAssignGroup
        };
    }

    private buildGroupKeywordWhere(keyword?: string): Prisma.RbacPermissionGroupWhereInput {
        const normalizedKeyword = keyword?.trim();
        if (!normalizedKeyword) {
            return {};
        }
        return {
            OR: [
                { code: { contains: normalizedKeyword } },
                { name: { contains: normalizedKeyword } },
                { description: { contains: normalizedKeyword } }
            ]
        };
    }
}
