import { PrismaService } from '@app/prisma-admin';
import { RbacPermissionKind, RbacStatus } from '@app/prisma-admin/generated/client';
import { AdminErrorCodes } from '../../../common/constants/index';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { SystemRbacPermissionDiscoveryService } from '../discovery/discovery.service';
import { SystemRbacPermissionsService } from './permissions.service';

function createPermissionRecord(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-05-21T00:00:00.000Z');
    return {
        id: 1,
        code: 'user.read',
        name: '用户读取',
        description: null,
        kind: RbacPermissionKind.ACTION,
        sort: 1,
        isBuiltin: false,
        status: RbacStatus.ENABLE,
        createdBy: 'operator_1',
        updatedBy: 'operator_1',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...overrides
    };
}

describe('SystemRbacPermissionsService', () => {
    let prismaService: any;
    let authzService: any;
    let graphService: any;
    let discoveryService: any;
    let service: SystemRbacPermissionsService;

    beforeEach(() => {
        prismaService = {
            $transaction: jest.fn((handler: (tx: any) => Promise<unknown>) => handler(prismaService)),
            rbacPermission: {
                findManyAndCount: jest.fn(),
                findMany: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn()
            },
            rbacRolePermission: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
                createMany: jest.fn()
            },
            rbacMenu: {
                count: jest.fn(),
                findMany: jest.fn()
            },
            rbacPermissionGroup: {
                count: jest.fn()
            },
            rbacEffectiveUserPermission: {
                findMany: jest.fn(),
                deleteMany: jest.fn()
            }
        };
        authzService = {
            assertPermission: jest.fn().mockResolvedValue(undefined),
            checkPermissions: jest.fn().mockImplementation(async (_actorId: string, codes: string[]) => {
                return new Map(codes.map((code) => [code, true]));
            })
        };
        graphService = {
            applyRebuild: jest.fn().mockResolvedValue({ userCount: 0 }),
            getCurrentSuperAdminUserIds: jest.fn().mockResolvedValue([]),
            getAffectedUserIdsByPermissionIds: jest.fn().mockResolvedValue([]),
            getAffectedUserIdsByRoleIds: jest.fn().mockResolvedValue([])
        };
        discoveryService = {
            getCandidates: jest.fn().mockReturnValue({
                tree: [
                    {
                        key: 'module:DemoModule',
                        title: 'DemoModule',
                        type: 'module'
                    }
                ],
                actions: [
                    {
                        permissionCode: 'user.read',
                        moduleName: 'DemoModule',
                        className: 'DemoController',
                        methodName: 'read',
                        sourceKind: 'controller',
                        name: '用户读取',
                        kind: 'ACTION'
                    },
                    {
                        permissionCode: 'user.create',
                        moduleName: 'DemoModule',
                        className: 'DemoController',
                        methodName: 'create',
                        sourceKind: 'controller',
                        name: '用户创建',
                        kind: 'ACTION'
                    }
                ]
            })
        };
        service = new SystemRbacPermissionsService(
            prismaService as PrismaService,
            authzService as RbacAuthorizationService,
            graphService as SystemRbacGraphService,
            discoveryService as SystemRbacPermissionDiscoveryService
        );
    });

    it('创建权限时 code 已存在应抛业务异常', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(createPermissionRecord());

        await expect(
            service.createPermission(
                {
                    code: 'user.read',
                    name: '用户读取',
                    kind: RbacPermissionKind.ACTION,
                    status: RbacStatus.ENABLE
                },
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.CODE_EXISTS.code
        });
        expect(prismaService.rbacPermission.create).not.toHaveBeenCalled();
    });

    it('权限 code 格式非法时应拒绝创建', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(null);

        await expect(
            service.createPermission(
                {
                    code: 'User.Read',
                    name: '用户读取',
                    kind: RbacPermissionKind.ACTION,
                    status: RbacStatus.ENABLE
                } as any,
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.CODE_INVALID.code
        });
        expect(prismaService.rbacPermission.create).not.toHaveBeenCalled();
    });

    it('创建权限后应重建 effective 读模型以同步超级管理员权限集', async () => {
        const created = createPermissionRecord({ code: 'system.demo.view' });
        prismaService.rbacPermission.findFirst.mockResolvedValue(null);
        prismaService.rbacPermission.create.mockResolvedValue(created);
        graphService.getCurrentSuperAdminUserIds.mockResolvedValue(['root']);

        await expect(
            service.createPermission(
                {
                    code: 'system.demo.view',
                    name: '示例查看',
                    kind: RbacPermissionKind.ACTION,
                    status: RbacStatus.ENABLE
                },
                'operator_1'
            )
        ).resolves.toEqual(created);

        expect(graphService.getCurrentSuperAdminUserIds).toHaveBeenCalledWith();
        expect(graphService.applyRebuild).toHaveBeenCalledWith(['root']);
    });

    it('删除权限应确认没有菜单声明依赖后软删除并清理角色、effective 关系', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(createPermissionRecord());
        prismaService.rbacMenu.count.mockResolvedValue(0);
        prismaService.rbacPermission.update.mockResolvedValue(createPermissionRecord({ deletedAt: new Date() }));
        graphService.getAffectedUserIdsByPermissionIds.mockResolvedValue(['u1']);
        graphService.getCurrentSuperAdminUserIds.mockResolvedValue(['root']);

        await expect(service.deletePermission(1, 'operator_1')).resolves.toBeNull();

        expect(prismaService.rbacMenu.count).toHaveBeenCalledWith({
            where: { requiredPermissionCode: 'user.read' }
        });
        expect(prismaService.rbacRolePermission.deleteMany).toHaveBeenCalledWith({
            where: { permissionId: 1 }
        });
        expect(prismaService.rbacEffectiveUserPermission.deleteMany).toHaveBeenCalledWith({
            where: { permissionId: 1 }
        });
        expect(prismaService.rbacPermission.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: {
                deletedAt: expect.any(Date),
                updatedBy: 'operator_1'
            }
        });
        expect(graphService.getAffectedUserIdsByPermissionIds).toHaveBeenCalledWith([1]);
        expect(graphService.applyRebuild).toHaveBeenCalledWith(['u1', 'root']);
    });

    it('删除权限时如果仍被菜单声明为所需权限，应拒绝删除', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(createPermissionRecord());
        prismaService.rbacMenu.count.mockResolvedValue(1);

        await expect(service.deletePermission(1, 'operator_1')).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID.code
        });
        expect(prismaService.rbacRolePermission.deleteMany).not.toHaveBeenCalled();
        expect(prismaService.rbacPermission.update).not.toHaveBeenCalled();
    });

    it('内置权限禁止删除', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(createPermissionRecord({ isBuiltin: true }));

        await expect(service.deletePermission(1, 'operator_1')).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.BUILTIN_DELETE_FORBIDDEN.code
        });
        expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('声明面板应标出已入库、未入库和未分配权限', async () => {
        prismaService.rbacPermission.findMany.mockResolvedValue([
            createPermissionRecord({ code: 'user.read', name: '用户读取' }),
            createPermissionRecord({ id: 2, code: 'orphan.permission', name: '未分配权限' })
        ]);

        const result = await service.getDeclarationBoard('operator_1');

        expect(result.declarations).toEqual([
            expect.objectContaining({
                permissionCode: 'user.read',
                databaseState: 'EXISTS',
                permission: expect.objectContaining({
                    code: 'user.read',
                    viewerCanUpdate: true
                })
            }),
            expect.objectContaining({
                permissionCode: 'user.create',
                databaseState: 'MISSING',
                permission: null
            })
        ]);
        expect(result.unassignedPermissions).toEqual([
            expect.objectContaining({
                code: 'orphan.permission',
                name: '未分配权限'
            })
        ]);
        expect(discoveryService.getCandidates).toHaveBeenCalledWith();
    });

    it('权限关系应从菜单 requiredPermissionCode 反查声明该权限的菜单', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(createPermissionRecord());
        prismaService.rbacRolePermission.findMany.mockResolvedValue([{ roleId: 10 }]);
        prismaService.rbacMenu.findMany.mockResolvedValue([{ id: 20 }]);
        prismaService.rbacEffectiveUserPermission.findMany.mockResolvedValue([{ userId: 'user_1' }]);

        const result = await service.getPermissionRelations(1, 'operator_1');

        expect(prismaService.rbacMenu.findMany).toHaveBeenCalledWith({
            where: {
                requiredPermissionCode: 'user.read'
            },
            select: {
                id: true
            }
        });
        expect(result.menuIds).toEqual([20]);
        expect(result.roleIds).toEqual([10]);
        expect(result.effectiveUserIds).toEqual(['user_1']);
    });
});
