import { PrismaService } from '@app/prisma-app';
import { MenuStatusEnum, MenuTypeEnum, RbacPermissionKind, RbacStatus } from '@app/prisma-app/generated/client';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemMenusService } from './menus.service';

const mockPrismaService = {
    $transaction: jest.fn((handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return handlerOrQueries(mockPrismaService);
        }
        return Promise.all(handlerOrQueries as Promise<unknown>[]);
    }),
    rbacMenu: {
        findMany: jest.fn(),
        findManyAndCount: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    rbacPermission: {
        findFirst: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn()
    },
    rbacRolePermission: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacUserVisibleMenu: {
        findMany: jest.fn(),
        deleteMany: jest.fn()
    },
    rbacRole: {
        findMany: jest.fn(),
        count: jest.fn()
    },
    betterAuthUser: {
        findManyAndCount: jest.fn()
    }
};

const mockRbacAuthorizationService = {
    assertPermission: jest.fn(),
    checkPermission: jest.fn(),
    checkPermissions: jest.fn()
};

const mockAdminUserStateService = {
    bumpMenuStateVersion: jest.fn()
};

const mockRbacGraphService = {
    applyRebuild: jest.fn(),
    getAffectedUserIdsByMenuPermissionCodes: jest.fn(),
    getAffectedUserIdsByRoleIds: jest.fn()
};

const mockRbacAssignmentService = {
    replaceMenuViewerRoles: jest.fn()
};

const mockAuthzObjectExceptionService = {
    cleanupDeletedResource: jest.fn()
};

function createMenu(id = 10) {
    return {
        id,
        pid: null,
        title: '系统管理',
        requiredPermissionCode: 'system.menu.view',
        type: MenuTypeEnum.Page,
        status: MenuStatusEnum.ENABLE,
        order: 1,
        path: '/system/menu',
        icon: null,
        description: null,
        componentPath: null,
        layout: 'LAYOUT_SIDE',
        pageType: 'PAGE',
        isResident: false,
        isCache: false,
        isMenuVisible: true,
        showChildren: true,
        isTabVisible: true,
        componentName: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt: new Date('2026-04-27T00:00:00.000Z')
    };
}

describe('SystemMenusService', () => {
    let service: SystemMenusService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
        mockRbacAuthorizationService.checkPermission.mockResolvedValue(true);
        mockRbacAuthorizationService.checkPermissions.mockResolvedValue(
            new Map([
                [RBAC_PERMISSIONS.SYSTEM_MENU_UPDATE, true],
                [RBAC_PERMISSIONS.SYSTEM_MENU_DELETE, true],
                [RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE, true]
            ])
        );
        mockAdminUserStateService.bumpMenuStateVersion.mockResolvedValue(undefined);
        mockRbacGraphService.applyRebuild.mockResolvedValue(undefined);
        mockRbacGraphService.getAffectedUserIdsByMenuPermissionCodes.mockResolvedValue([]);
        mockRbacGraphService.getAffectedUserIdsByRoleIds.mockResolvedValue([]);
        mockRbacAssignmentService.replaceMenuViewerRoles.mockResolvedValue(null);
        mockAuthzObjectExceptionService.cleanupDeletedResource.mockResolvedValue(undefined);

        service = new SystemMenusService(
            mockPrismaService as unknown as PrismaService,
            mockAdminUserStateService as unknown as AdminUserStateService,
            mockRbacAuthorizationService as unknown as RbacAuthorizationService,
            mockRbacAssignmentService as unknown as SystemRbacAssignmentsService,
            mockRbacGraphService as unknown as SystemRbacGraphService,
            mockAuthzObjectExceptionService as unknown as AuthzObjectExceptionService
        );
    });

    it('findAll 应按 RBAC 菜单源表筛选并保持菜单树稳定排序', async () => {
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([]);

        await service.findAll(
            {
                name: '系统',
                status: MenuStatusEnum.ENABLE,
                type: MenuTypeEnum.Page,
                createdAt: ['2026-04-01T00:00:00.000Z', '2026-04-28T23:59:59.000Z']
            },
            'operator_1'
        );

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_MENU_VIEW
        );
        expect(mockPrismaService.rbacMenu.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { title: { contains: '系统' } },
                    { requiredPermissionCode: { contains: '系统' } },
                    { path: { contains: '系统' } },
                    { componentPath: { contains: '系统' } }
                ],
                status: MenuStatusEnum.ENABLE,
                type: MenuTypeEnum.Page,
                createdAt: {
                    gte: new Date('2026-04-01T00:00:00.000Z'),
                    lte: new Date('2026-04-28T23:59:59.000Z')
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
    });

    it('创建菜单时，应要求菜单声明的 RBAC 所需权限已存在', async () => {
        const menu = createMenu();
        const permission = {
            id: 100,
            code: menu.requiredPermissionCode
        };
        mockPrismaService.rbacMenu.findFirst.mockResolvedValue(null);
        mockPrismaService.rbacMenu.create.mockResolvedValue(menu);
        mockPrismaService.rbacPermission.count.mockResolvedValue(1);
        mockRbacGraphService.getAffectedUserIdsByMenuPermissionCodes.mockResolvedValue(['u1']);

        await expect(
            service.createMenu(
                {
                    title: menu.title,
                    requiredPermissionCode: menu.requiredPermissionCode,
                    type: MenuTypeEnum.Page,
                    status: MenuStatusEnum.ENABLE,
                    order: 1,
                    path: menu.path,
                    pid: null
                } as never,
                'operator_1'
            )
        ).resolves.toBe(menu);

        expect(mockPrismaService.rbacPermission.count).toHaveBeenCalledWith({
            where: {
                code: menu.requiredPermissionCode,
                deletedAt: null,
                status: RbacStatus.ENABLE
            }
        });
        expect(mockRbacGraphService.getAffectedUserIdsByMenuPermissionCodes).toHaveBeenCalledWith([
            menu.requiredPermissionCode
        ]);
        expect(mockRbacGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
        expect(mockAdminUserStateService.bumpMenuStateVersion).toHaveBeenCalledWith();
    });

    it('删除菜单时，应清理对象例外授权和 RBAC 菜单读模型关系', async () => {
        const menu = createMenu();
        mockPrismaService.rbacMenu.findUnique.mockResolvedValue(menu);
        mockPrismaService.rbacPermission.findFirst.mockResolvedValue({
            id: 100,
            code: menu.requiredPermissionCode
        });
        mockPrismaService.rbacRolePermission.findMany.mockResolvedValue([]);
        mockPrismaService.rbacMenu.delete.mockResolvedValue(menu);
        mockRbacGraphService.getAffectedUserIdsByMenuPermissionCodes.mockResolvedValue(['u1']);

        await expect(service.deleteMenu(menu.id, 'operator_1')).resolves.toBe(menu);

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_MENU_DELETE
        );
        expect(mockAuthzObjectExceptionService.cleanupDeletedResource).toHaveBeenCalledWith('menu', String(menu.id));
        expect(mockPrismaService.rbacUserVisibleMenu.deleteMany).toHaveBeenCalledWith({
            where: {
                menuId: menu.id
            }
        });
        expect(mockPrismaService.rbacMenu.delete).toHaveBeenCalledWith({
            where: {
                id: menu.id
            }
        });
        expect(mockRbacGraphService.getAffectedUserIdsByMenuPermissionCodes).toHaveBeenCalledWith([
            menu.requiredPermissionCode
        ]);
        expect(mockRbacGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
    });
});
