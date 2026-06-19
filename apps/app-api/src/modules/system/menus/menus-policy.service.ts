import { PrismaService } from '@app/prisma-app';
import { BusinessException, ErrorCodes } from '@app/common';
import { Injectable } from '@nestjs/common';
import { MenuStatusEnum, RbacStatus } from '@app/prisma-app/generated/client';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';

@Injectable()
export class SystemMenusPolicyService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly rbacGraphService: SystemRbacGraphService
    ) {}

    async getRoleMenuIds(roleCode: string): Promise<number[]> {
        const role = await this.getRoleByCode(roleCode);
        const permissionIds = await this.getRoleMenuPermissionIds(role.id);
        if (permissionIds.length === 0) {
            return [];
        }

        const menus = await this.prismaService.rbacMenu.findMany({
            where: {
                status: MenuStatusEnum.ENABLE,
                requiredPermission: {
                    id: {
                        in: permissionIds
                    }
                }
            },
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        });
        return menus.map((menu) => menu.id);
    }

    async assignMenusByIds(roleCode: string, menuIds: number[]): Promise<void> {
        const role = await this.getRoleByCode(roleCode);
        const uniqueMenuIds = [...new Set(menuIds)].filter((id) => Number.isInteger(id) && id > 0);
        const [allMenuPermissionIds, selectedPermissionIds] = await Promise.all([
            this.getAllMenuPermissionIds(),
            this.getMenuPermissionIds(uniqueMenuIds)
        ]);

        if (selectedPermissionIds.length !== uniqueMenuIds.length) {
            throw new BusinessException(ErrorCodes.APP_MENU.NOT_FOUND);
        }

        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacRolePermission.deleteMany({
                where: {
                    roleId: role.id,
                    permissionId: {
                        in: allMenuPermissionIds
                    }
                }
            });

            if (selectedPermissionIds.length > 0) {
                await tx.rbacRolePermission.createMany({
                    data: selectedPermissionIds.map((permissionId) => ({
                        roleId: role.id,
                        permissionId,
                        createdBy: 'app-user-admin-grpc'
                    })),
                    skipDuplicates: true
                });
            }
        });

        await this.rebuildRoleUsers(role.id);
    }

    async removeRoleFromPolicy(roleCode: string): Promise<void> {
        const role = await this.getRoleByCode(roleCode);
        const allMenuPermissionIds = await this.getAllMenuPermissionIds();
        await this.prismaService.rbacRolePermission.deleteMany({
            where: {
                roleId: role.id,
                permissionId: {
                    in: allMenuPermissionIds
                }
            }
        });
        await this.rebuildRoleUsers(role.id);
    }

    private async getRoleByCode(roleCode: string) {
        const role = await this.prismaService.rbacRole.findFirst({
            where: {
                code: roleCode,
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true,
                code: true
            }
        });
        if (!role) {
            throw new BusinessException(ErrorCodes.APP_ROLE.NOT_FOUND);
        }
        return role;
    }

    private async getRoleMenuPermissionIds(roleId: number): Promise<number[]> {
        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                roleId,
                permission: {
                    requiredByMenu: {
                        isNot: null
                    }
                }
            },
            select: {
                permissionId: true
            }
        });
        return rows.map((row) => row.permissionId);
    }

    private async getMenuPermissionIds(menuIds: number[]): Promise<number[]> {
        if (menuIds.length === 0) {
            return [];
        }

        const menus = await this.prismaService.rbacMenu.findMany({
            where: {
                id: {
                    in: menuIds
                },
                status: MenuStatusEnum.ENABLE
            },
            select: {
                requiredPermission: {
                    select: {
                        id: true
                    }
                }
            }
        });
        return menus.map((menu) => menu.requiredPermission.id);
    }

    private async getAllMenuPermissionIds(): Promise<number[]> {
        const menus = await this.prismaService.rbacMenu.findMany({
            select: {
                requiredPermission: {
                    select: {
                        id: true
                    }
                }
            }
        });
        return [...new Set(menus.map((menu) => menu.requiredPermission.id))];
    }

    private async rebuildRoleUsers(roleId: number): Promise<void> {
        const userIds = await this.rbacGraphService.getAffectedUserIdsByRoleIds([roleId]);
        await this.rbacGraphService.applyRebuild(userIds);
    }
}
