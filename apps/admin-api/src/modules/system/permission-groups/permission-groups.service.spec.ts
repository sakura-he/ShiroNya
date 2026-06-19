import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacPermissionGroupsService } from './permission-groups.service';

function createGroupRecord(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-05-26T00:00:00.000Z');
    return {
        id: 1,
        code: 'system.user',
        name: '系统用户',
        description: null,
        sort: 10,
        status: RbacStatus.ENABLE,
        createdBy: 'operator_1',
        updatedBy: 'operator_1',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...overrides
    };
}

describe('SystemRbacPermissionGroupsService', () => {
    let prismaService: any;
    let authzService: any;
    let service: SystemRbacPermissionGroupsService;

    beforeEach(() => {
        prismaService = {
            $transaction: jest.fn((handler: (tx: any) => Promise<unknown>) => handler(prismaService)),
            rbacPermissionGroup: {
                findManyAndCount: jest.fn(),
                findFirst: jest.fn(),
                create: jest.fn(),
                update: jest.fn()
            },
            rbacPermission: {
                count: jest.fn(),
                findMany: jest.fn(),
                updateMany: jest.fn()
            },
            rbacMenu: {
                count: jest.fn(),
                findMany: jest.fn(),
                updateMany: jest.fn()
            }
        };
        authzService = {
            assertPermission: jest.fn().mockResolvedValue(undefined),
            checkPermissions: jest.fn().mockImplementation(async (_actorId: string, codes: string[]) => {
                return new Map(codes.map((code) => [code, true]));
            })
        };
        service = new SystemRbacPermissionGroupsService(
            prismaService as PrismaService,
            authzService as RbacAuthorizationService
        );
    });

    it('权限分组列表应返回权限和菜单数量', async () => {
        prismaService.rbacPermissionGroup.findManyAndCount.mockResolvedValue([
            [
                {
                    ...createGroupRecord(),
                    _count: {
                        permissions: 3,
                        menus: 2
                    }
                }
            ],
            { total: 1, page: 1, pageSize: 10 }
        ]);

        const result = await service.getGroupList({ page: 1, pageSize: 10 }, 'operator_1');

        expect(result.records).toHaveLength(1);
        expect(result.records[0]).toMatchObject({
            permissionCount: 3,
            menuCount: 2,
            viewerCanAssign: true
        });
        expect(prismaService.rbacPermissionGroup.findManyAndCount).toHaveBeenCalledWith({
            where: {
                deletedAt: null
            },
            include: {
                _count: {
                    select: {
                        permissions: true,
                        menus: true
                    }
                }
            },
            take: 10,
            skip: 0,
            orderBy: [{ sort: 'asc' }, { id: 'asc' }]
        });
    });

    it('分配分组关系时应先清理当前分组现有归属再写入目标归属', async () => {
        prismaService.rbacPermissionGroup.findFirst.mockResolvedValue(createGroupRecord());
        prismaService.rbacPermission.count.mockResolvedValue(2);
        prismaService.rbacMenu.count.mockResolvedValue(1);
        prismaService.rbacPermission.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
        prismaService.rbacMenu.findMany.mockResolvedValue([{ id: 20 }]);

        const result = await service.assignRelations(
            {
                groupId: 1,
                permissionIds: [10, 11, 11],
                menuIds: [20]
            },
            'operator_1'
        );

        expect(prismaService.rbacPermission.updateMany).toHaveBeenCalledWith({
            where: {
                groupId: 1,
                id: {
                    notIn: [10, 11]
                }
            },
            data: {
                groupId: null
            }
        });
        expect(prismaService.rbacPermission.updateMany).toHaveBeenCalledWith({
            where: {
                id: {
                    in: [10, 11]
                },
                deletedAt: null
            },
            data: {
                groupId: 1
            }
        });
        expect(prismaService.rbacMenu.updateMany).toHaveBeenCalledWith({
            where: {
                id: {
                    in: [20]
                }
            },
            data: {
                groupId: 1
            }
        });
        expect(result).toMatchObject({
            permissionIds: [10, 11],
            menuIds: [20]
        });
    });
});
