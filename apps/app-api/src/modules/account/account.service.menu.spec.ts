import { PrismaService } from '@app/prisma-app';
import { createAppApiAccountNavigationRedisKey } from '@app/common/constants';
import { MenuStatusEnum, MenuTypeEnum, RbacStatus } from '@app/prisma-app/generated/client';
import { RedisToken } from '@nestjs-redis/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../better-auth/better-auth-session.type';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../system/rbac/rbac-graph.service';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import { AccountService } from './account.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
    AuthService: class AuthService {}
}));

jest.mock('better-auth/api', () => ({
    APIError: class APIError extends Error {
        constructor(
            public readonly status: string,
            public readonly body?: Record<string, unknown>
        ) {
            super(typeof body?.message === 'string' ? body.message : status);
        }
    }
}));

jest.mock('@app/common', () => ({
    BusinessException: class BusinessException extends Error {
        constructor(public readonly payload?: unknown) {
            super('BusinessException');
        }
    },
    ErrorCodes: {
        USER: {
            RESET_TOKEN_INVALID: { code: 4001, message: '重置 token 无效' },
            OLD_PASSWORD_ERROR: { code: 4002, message: '原密码错误' }
        }
    }
}));

const mockPrismaService = {
    rbacMenu: {
        findMany: jest.fn()
    },
    rbacPermission: {
        findMany: jest.fn()
    }
};

const mockAuthService = {};
const mockRbacAuthorizationService = {
    getGrantedCodes: jest.fn(),
    checkPermissions: jest.fn()
};
const mockRbacGraphService = {
    getUserEffectiveState: jest.fn()
};
const mockAdminUserStateService = {
    getCompositeStateVersion: jest.fn()
};
const mockRedis = {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn()
};
const REDIS_PROVIDER_TOKEN = RedisToken('DEFAULT_REDIS');

const mockSession: BetterAuthSession = {
    session: {
        id: 'session_1',
        userId: 'user_1',
        token: 'token_1',
        expiresAt: new Date('2026-03-13T00:00:00.000Z'),
        createdAt: new Date('2026-03-13T00:00:00.000Z'),
        updatedAt: new Date('2026-03-13T00:00:00.000Z')
    },
    user: {
        id: 'user_1',
        email: 'admin@example.com',
        name: '管理员',
        username: 'admin',
        displayUsername: '管理员',
        image: null,
        phoneNumber: null,
        phoneNumberVerified: false,
        banned: false,
        role: 'user'
    },
    profile: null,
    roles: [
        {
            id: 1,
            code: 'super_admin',
            name: '超级管理员'
        }
    ]
} as BetterAuthSession;

/**
 * 创建模拟菜单记录，便于覆盖目录、页面和按钮类型。
 */
function createMockMenu(
    id: number,
    permission: string,
    type: MenuTypeEnum = MenuTypeEnum.Catalog,
    pid: number | null = null
) {
    return {
        id,
        pid,
        title: `菜单${id}`,
        requiredPermissionCode: permission,
        type,
        status: MenuStatusEnum.ENABLE,
        order: id,
        path: permission,
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
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

describe('AccountService.getAccountNavigation', () => {
    let service: AccountService;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockAdminUserStateService.getCompositeStateVersion.mockResolvedValue('state_v1');
        mockRedis.get.mockResolvedValue(null);
        mockRbacAuthorizationService.getGrantedCodes.mockResolvedValue([]);
        mockRbacAuthorizationService.checkPermissions.mockResolvedValue(new Map());
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            userId: 'user_1',
            roleIds: [],
            permissionIds: [],
            permissionCodes: [],
            visibleMenuIds: [],
            isSuperAdmin: false
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccountService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: AuthService, useValue: mockAuthService },
                { provide: RbacAuthorizationService, useValue: mockRbacAuthorizationService },
                { provide: SystemRbacGraphService, useValue: mockRbacGraphService },
                { provide: AdminUserStateService, useValue: mockAdminUserStateService },
                { provide: REDIS_PROVIDER_TOKEN, useValue: mockRedis }
            ]
        }).compile();

        service = module.get<AccountService>(AccountService);
    });

    it('数据库没有启用菜单时，应直接返回空数组', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [],
            permissionCodes: []
        });

        const result = await service.getAccountNavigation(mockSession);

        expect(result.menus).toEqual([]);
        expect(result.permissions).toEqual([]);
        expect(result.userStateVersion).toBe('state_v1');
        expect(mockPrismaService.rbacMenu.findMany).not.toHaveBeenCalled();
    });

    it('应返回全部启用的非按钮菜单', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [1, 2, 3],
            permissionCodes: ['system.user.view', 'system.dict.create', 'system.menu.view']
        });
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([
            createMockMenu(1, 'system.user.view'),
            createMockMenu(2, 'system.dict.create', MenuTypeEnum.Button),
            createMockMenu(3, 'system.menu.view')
        ]);

        const result = await service.getAccountNavigation(mockSession);

        expect(mockPrismaService.rbacMenu.findMany).toHaveBeenCalledWith({
            where: {
                status: MenuStatusEnum.ENABLE
            },
            orderBy: [{ order: 'asc' }, { id: 'asc' }]
        });
        expect(result.menus.map((item) => item.requiredPermissionCode)).toEqual([
            'system.user.view',
            'system.menu.view'
        ]);
        expect(result.permissions).toEqual(['system.user.view', 'system.dict.create', 'system.menu.view']);
    });

    it('导航菜单应自动补齐可见页面的父级目录', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [79],
            permissionCodes: ['system.user.detail']
        });
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([
            createMockMenu(151, 'system.catalog', MenuTypeEnum.Catalog),
            createMockMenu(79, 'system.user.detail', MenuTypeEnum.Page, 151)
        ]);

        const result = await service.getAccountNavigation(mockSession);

        expect(result.menus.map((item) => item.id)).toEqual([151, 79]);
        expect(result.permissions).toEqual(['system.user.detail']);
    });

    it('导航缓存缺少父级菜单时应丢弃缓存并重新构建', async () => {
        mockRedis.get.mockResolvedValue(
            JSON.stringify({
                menus: [createMockMenu(79, 'system.user.detail', MenuTypeEnum.Page, 151)],
                permissions: ['system.user.detail']
            })
        );
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [79],
            permissionCodes: ['system.user.detail']
        });
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([
            createMockMenu(151, 'system.catalog', MenuTypeEnum.Catalog),
            createMockMenu(79, 'system.user.detail', MenuTypeEnum.Page, 151)
        ]);

        const result = await service.getAccountNavigation(mockSession);

        expect(mockRedis.del).toHaveBeenCalledWith(createAppApiAccountNavigationRedisKey('user_1', 'state_v1'));
        expect(result.menus.map((item) => item.id)).toEqual([151, 79]);
    });

    it('组合导航应保留按钮权限并只执行一次 RBAC effective 读取', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [1, 2],
            permissionCodes: ['system.user.view', 'system.dict.create']
        });
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([
            createMockMenu(1, 'system.user.view'),
            createMockMenu(2, 'system.dict.create', MenuTypeEnum.Button)
        ]);

        const result = await service.getAccountNavigation(mockSession);

        expect(mockRbacGraphService.getUserEffectiveState).toHaveBeenCalledTimes(1);
        expect(mockRbacGraphService.getUserEffectiveState).toHaveBeenCalledWith('user_1');
        expect(mockRbacAuthorizationService.getGrantedCodes).not.toHaveBeenCalled();
        expect(result.menus.map((item) => item.requiredPermissionCode)).toEqual(['system.user.view']);
        expect(result.permissions).toEqual(['system.user.view', 'system.dict.create']);
        expect(result.userStateVersion).toBe('state_v1');
    });

    it('组合导航命中版本化缓存时不应再次访问 RBAC 读模型', async () => {
        mockRedis.get.mockResolvedValue(
            JSON.stringify({
                menus: [createMockMenu(1, 'system.user.view')],
                permissions: ['system.user.view', 'system.dict.create', 'rbac.menu.create']
            })
        );

        const result = await service.getAccountNavigation(mockSession);

        expect(mockRedis.get).toHaveBeenCalledWith(createAppApiAccountNavigationRedisKey('user_1', 'state_v1'));
        expect(mockRbacGraphService.getUserEffectiveState).not.toHaveBeenCalled();
        expect(mockRbacAuthorizationService.getGrantedCodes).not.toHaveBeenCalled();
        expect(result.permissions).toEqual(['system.user.view', 'system.dict.create', 'rbac.menu.create']);
        expect(result.userStateVersion).toBe('state_v1');
    });
});

describe('AccountService.checkAccountPermissionsBatch', () => {
    let service: AccountService;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockAdminUserStateService.getCompositeStateVersion.mockResolvedValue('state_v1');

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccountService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: AuthService, useValue: mockAuthService },
                { provide: RbacAuthorizationService, useValue: mockRbacAuthorizationService },
                { provide: SystemRbacGraphService, useValue: mockRbacGraphService },
                { provide: AdminUserStateService, useValue: mockAdminUserStateService }
            ]
        }).compile();

        service = module.get<AccountService>(AccountService);
    });

    it('应返回不存在权限点、禁用权限、RBAC 拒绝和允许命中结果', async () => {
        mockPrismaService.rbacPermission.findMany.mockResolvedValue([
            {
                id: 1,
                code: 'system.dict.create',
                status: RbacStatus.ENABLE
            },
            {
                id: 2,
                code: 'system.dict.delete',
                status: RbacStatus.DISABLE
            },
            {
                id: 3,
                code: 'system.dict.update',
                status: RbacStatus.ENABLE
            }
        ]);
        mockRbacAuthorizationService.getGrantedCodes.mockResolvedValue(['system.dict.create']);

        const result = await service.checkAccountPermissionsBatch(mockSession, [
            'system.dict.create',
            'system.dict.delete',
            'system.dict.missing',
            'system.dict.update'
        ]);

        expect(mockRbacAuthorizationService.getGrantedCodes).toHaveBeenCalledWith('user_1');
        expect(mockRbacAuthorizationService.checkPermissions).not.toHaveBeenCalled();
        expect(result.results).toEqual([
            {
                permission: 'system.dict.create',
                allowed: true,
                permissionId: 1,
                permissionStatus: RbacStatus.ENABLE,
                reason: 'rbac_allowed'
            },
            {
                permission: 'system.dict.delete',
                allowed: false,
                permissionId: 2,
                permissionStatus: RbacStatus.DISABLE,
                reason: 'permission_disabled'
            },
            {
                permission: 'system.dict.missing',
                allowed: false,
                permissionId: null,
                permissionStatus: null,
                reason: 'permission_not_found'
            },
            {
                permission: 'system.dict.update',
                allowed: false,
                permissionId: 3,
                permissionStatus: RbacStatus.ENABLE,
                reason: 'rbac_denied'
            }
        ]);
        expect(result.checkedAt).toEqual(expect.any(String));
    });
});
