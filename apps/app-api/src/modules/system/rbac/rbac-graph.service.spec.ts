import { PrismaService } from '@app/prisma-app';
import { MenuStatusEnum, MenuTypeEnum, RbacStatus } from '@app/prisma-app/generated/client';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemRbacGraphService } from './rbac-graph.service';

describe('SystemRbacGraphService', () => {
    let prismaService: any;
    let adminUserStateService: any;
    let service: SystemRbacGraphService;

    beforeEach(() => {
        prismaService = {
            rbacEffectiveUserRole: {
                findMany: jest.fn()
            },
            rbacEffectiveUserPermission: {
                findMany: jest.fn()
            },
            rbacUserVisibleMenu: {
                findMany: jest.fn()
            },
            betterAuthUser: {
                findMany: jest.fn()
            },
            rbacRole: {
                findMany: jest.fn(),
                count: jest.fn()
            },
            rbacRoleInherit: {
                findMany: jest.fn()
            },
            rbacUserRole: {
                findMany: jest.fn()
            },
            rbacUserGroupMember: {
                findMany: jest.fn()
            },
            rbacUserGroup: {
                findMany: jest.fn()
            },
            rbacUserGroupRole: {
                findMany: jest.fn()
            },
            rbacRolePermission: {
                findMany: jest.fn()
            },
            rbacPermission: {
                findMany: jest.fn()
            },
            rbacMenu: {
                findMany: jest.fn()
            },
            $transaction: jest.fn()
        };
        adminUserStateService = {
            bumpUserStateVersion: jest.fn()
        };
        prismaService.rbacRole.findMany.mockResolvedValue([]);
        prismaService.rbacRoleInherit.findMany.mockResolvedValue([]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroup.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);
        prismaService.rbacRolePermission.findMany.mockResolvedValue([]);
        prismaService.rbacPermission.findMany.mockResolvedValue([]);
        prismaService.rbacMenu.findMany.mockResolvedValue([]);
        prismaService.rbacEffectiveUserRole.findMany.mockResolvedValue([]);
        prismaService.rbacEffectiveUserPermission.findMany.mockResolvedValue([]);
        prismaService.rbacUserVisibleMenu.findMany.mockResolvedValue([]);
        service = new SystemRbacGraphService(prismaService as PrismaService, adminUserStateService as AdminUserStateService);
    });

    beforeEach(() => {
        prismaService.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => {
            await callback({
                rbacEffectiveUserRole: {
                    deleteMany: jest.fn(),
                    createMany: jest.fn()
                },
                rbacEffectiveUserPermission: {
                    deleteMany: jest.fn(),
                    createMany: jest.fn()
                },
                rbacUserVisibleMenu: {
                    deleteMany: jest.fn(),
                    createMany: jest.fn()
                }
            });
        });
        adminUserStateService.bumpUserStateVersion.mockResolvedValue('state_v2');
    });

    it('applyRebuild 写完 effective 读模型后推进被重建用户的 user-state 版本', async () => {
        prismaService.betterAuthUser.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);

        await expect(service.applyRebuild(['u1', 'u2'])).resolves.toMatchObject({
            userCount: 2
        });

        expect(adminUserStateService.bumpUserStateVersion).toHaveBeenCalledTimes(2);
        expect(adminUserStateService.bumpUserStateVersion).toHaveBeenCalledWith('u1');
        expect(adminUserStateService.bumpUserStateVersion).toHaveBeenCalledWith('u2');
        expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('applyRebuild 没有目标用户时不推进 user-state 版本', async () => {
        prismaService.betterAuthUser.findMany.mockResolvedValue([]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);

        await expect(service.applyRebuild(['missing_user'])).resolves.toMatchObject({
            userCount: 0
        });

        expect(adminUserStateService.bumpUserStateVersion).not.toHaveBeenCalled();
        expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('角色继承只展开权限，不把父角色写入 effective role', async () => {
        prismaService.betterAuthUser.findMany.mockResolvedValue([{ id: 'u1' }]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([{ userId: 'u1', roleId: 1 }]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);
        prismaService.rbacRole.findMany.mockResolvedValue([
            { id: 1, isSuperAdmin: false },
            { id: 2, isSuperAdmin: false }
        ]);
        prismaService.rbacRoleInherit.findMany.mockResolvedValue([{ roleId: 1, parentRoleId: 2 }]);
        prismaService.rbacRolePermission.findMany.mockResolvedValue([
            { roleId: 1, permissionId: 10 },
            { roleId: 2, permissionId: 20 }
        ]);
        prismaService.rbacPermission.findMany.mockResolvedValue([
            { id: 10, code: 'system.admin.view' },
            { id: 20, code: 'system.user.view' }
        ]);
        prismaService.rbacMenu.findMany.mockResolvedValue([
            { id: 100, requiredPermissionCode: 'system.admin.view' },
            { id: 101, requiredPermissionCode: 'system.user.view' }
        ]);
        prismaService.rbacRole.count.mockResolvedValue(0);

        const result = await service.previewRebuild(['u1']);

        expect(result.sample[0]).toMatchObject({
            userId: 'u1',
            roleIds: [1],
            permissionIds: [10, 20],
            visibleMenuIds: [100, 101]
        });
        expect(result.sample[0].permissionCodes).toEqual(['system.admin.view', 'system.user.view']);
        expect(prismaService.rbacRolePermission.findMany).toHaveBeenCalledTimes(1);
    });

    it('批量重建应一次性展开直接角色、用户组角色、禁用组和超级管理员', async () => {
        prismaService.betterAuthUser.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([{ userId: 'u1', roleId: 1 }]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([
            { userId: 'u1', groupId: 10 },
            { userId: 'u2', groupId: 11 }
        ]);
        prismaService.rbacUserGroup.findMany.mockResolvedValue([{ id: 10 }]);
        prismaService.rbacUserGroupRole.findMany.mockResolvedValue([
            { groupId: 10, roleId: 2 },
            { groupId: 11, roleId: 3 }
        ]);
        prismaService.rbacRole.findMany.mockResolvedValue([
            { id: 1, isSuperAdmin: false },
            { id: 2, isSuperAdmin: true },
            { id: 3, isSuperAdmin: false }
        ]);
        prismaService.rbacRolePermission.findMany.mockResolvedValue([{ roleId: 1, permissionId: 10 }]);
        prismaService.rbacPermission.findMany.mockResolvedValue([
            { id: 10, code: 'system.user.view' },
            { id: 11, code: 'system.role.view' }
        ]);
        prismaService.rbacMenu.findMany.mockResolvedValue([
            { id: 100, requiredPermissionCode: 'system.user.view' },
            { id: 101, requiredPermissionCode: 'system.role.view' }
        ]);

        const result = await service.previewRebuild(['u1', 'u2']);

        expect(result.sample).toEqual([
            expect.objectContaining({
                userId: 'u1',
                roleIds: [1, 2],
                permissionIds: [10, 11],
                visibleMenuIds: [100, 101],
                isSuperAdmin: true
            }),
            expect.objectContaining({
                userId: 'u2',
                roleIds: [],
                permissionIds: [],
                visibleMenuIds: [],
                isSuperAdmin: false
            })
        ]);
        expect(prismaService.rbacRolePermission.findMany).toHaveBeenCalledTimes(1);
        expect(prismaService.rbacPermission.findMany).toHaveBeenCalledTimes(1);
        expect(prismaService.rbacMenu.findMany).toHaveBeenCalledTimes(1);
    });

    it('重建 visible menu 时应补齐页面菜单的父级目录', async () => {
        prismaService.betterAuthUser.findMany.mockResolvedValue([{ id: 'u1' }]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([{ userId: 'u1', roleId: 1 }]);
        prismaService.rbacRole.findMany.mockResolvedValue([{ id: 1, isSuperAdmin: false }]);
        prismaService.rbacRolePermission.findMany.mockResolvedValue([{ roleId: 1, permissionId: 10 }]);
        prismaService.rbacPermission.findMany.mockResolvedValue([{ id: 10, code: 'system.user.detail' }]);
        prismaService.rbacMenu.findMany.mockResolvedValue([
            {
                id: 151,
                pid: null,
                type: MenuTypeEnum.Catalog,
                requiredPermissionCode: 'system.catalog'
            },
            {
                id: 79,
                pid: 151,
                type: MenuTypeEnum.Page,
                requiredPermissionCode: 'system.user.detail'
            }
        ]);

        const result = await service.previewRebuild(['u1']);

        expect(result.sample[0]).toMatchObject({
            userId: 'u1',
            visibleMenuIds: [79, 151]
        });
    });

    it('getRoleEffectiveUserIds 只查 effective role 表，不触发 graph rebuild', async () => {
        prismaService.rbacEffectiveUserRole.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

        await expect(service.getRoleEffectiveUserIds(1)).resolves.toEqual(['u1', 'u2']);

        expect(prismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: 1,
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
        expect(prismaService.betterAuthUser.findMany).not.toHaveBeenCalled();
        expect(prismaService.rbacRolePermission.findMany).not.toHaveBeenCalled();
    });

    it('角色权限变化应包含依赖该角色的子角色用户', async () => {
        prismaService.rbacRole.findMany.mockResolvedValue([
            { id: 1, isSuperAdmin: false },
            { id: 2, isSuperAdmin: false }
        ]);
        prismaService.rbacRoleInherit.findMany.mockResolvedValue([{ roleId: 2, parentRoleId: 1 }]);
        prismaService.rbacRolePermission.findMany.mockResolvedValue([{ roleId: 1 }]);
        prismaService.rbacUserRole.findMany.mockResolvedValue([{ userId: 'u_parent', roleId: 1 }]);
        prismaService.rbacUserGroupRole.findMany.mockResolvedValue([{ groupId: 10, roleId: 2 }]);
        prismaService.rbacUserGroupMember.findMany.mockResolvedValue([{ groupId: 10, userId: 'u_child' }]);

        await expect(service.getAffectedUserIdsByPermissionIds([100])).resolves.toEqual(['u_child', 'u_parent']);
    });

    it('getUserEffectiveState 只读取 effective 读模型，不重新查询用户和展开整图', async () => {
        prismaService.rbacEffectiveUserRole.findMany.mockResolvedValue([
            { roleId: 2, role: { isSuperAdmin: true } },
            { roleId: 5, role: { isSuperAdmin: false } }
        ]);
        prismaService.rbacEffectiveUserPermission.findMany.mockResolvedValue([
            { permissionId: 10, permission: { code: 'system.user.view' } },
            { permissionId: 11, permission: { code: 'system.role.view' } }
        ]);
        prismaService.rbacUserVisibleMenu.findMany.mockResolvedValue([{ menuId: 20 }]);

        const state = await service.getUserEffectiveState('u1');

        expect(state).toEqual({
            userId: 'u1',
            roleIds: [2, 5],
            permissionIds: [10, 11],
            permissionCodes: ['system.user.view', 'system.role.view'],
            visibleMenuIds: [20],
            isSuperAdmin: true
        });
        expect(prismaService.betterAuthUser.findMany).not.toHaveBeenCalled();
        expect(prismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'u1',
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
        });
        expect(prismaService.rbacEffectiveUserPermission.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'u1',
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
        });
        expect(prismaService.rbacUserVisibleMenu.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'u1',
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
        });
    });
});
