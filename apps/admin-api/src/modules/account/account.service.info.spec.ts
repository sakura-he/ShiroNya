import { PrismaService } from '@app/prisma-admin';
import { MenuStatusEnum, MenuTypeEnum } from '@app/prisma-admin/generated/client';
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
    }
};

const mockAuthService = {};
const mockRbacAuthorizationService = {
    getGrantedCodes: jest.fn()
};
const mockRbacGraphService = {
    getUserEffectiveState: jest.fn()
};
const mockAdminUserStateService = {
    getCompositeStateVersion: jest.fn()
};

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
        image: 'https://example.com/avatar.png',
        phoneNumber: '13800000000',
        phoneNumberVerified: true,
        banned: false,
        role: 'user'
    },
    profile: {
        id: 1,
        userId: 'user_1',
        remark: '备注',
        createdBy: 'operator_1',
        lastLoginAt: new Date('2026-03-12T00:00:00.000Z')
    },
    roles: [
        {
            id: 1,
            code: 'super_admin',
            name: '超级管理员'
        },
        {
            id: 2,
            code: 'test',
            name: '测试角色'
        }
    ]
} as BetterAuthSession;

/**
 * 创建模拟菜单记录，便于构造按钮与页面权限集合。
 */
function createMockMenu(id: number, permission: string, type: MenuTypeEnum = MenuTypeEnum.Catalog) {
    return {
        id,
        pid: null,
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

describe('AccountService.getAccountInfo', () => {
    let service: AccountService;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockAdminUserStateService.getCompositeStateVersion.mockResolvedValue('state_v1');
        mockRbacAuthorizationService.getGrantedCodes.mockResolvedValue([]);
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [],
            permissionCodes: []
        });

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

    it('数据库没有菜单时，应直接返回 session 派生出的用户信息与角色编码', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [],
            permissionCodes: []
        });

        const result = await service.getAccountInfo(mockSession);

        expect(result).toEqual({
            user: {
                ...mockSession.user,
                profile: mockSession.profile
            },
            permission: [],
            roles: ['super_admin', 'test']
        });
    });

    it('应返回全部启用菜单的权限点，并保留 session 中的 profile 数据', async () => {
        mockRbacGraphService.getUserEffectiveState.mockResolvedValue({
            visibleMenuIds: [1, 2, 3],
            permissionCodes: ['system.user.view', 'system.dict.create', 'system.role.view']
        });
        mockPrismaService.rbacMenu.findMany.mockResolvedValue([
            createMockMenu(1, 'system.user.view'),
            createMockMenu(2, 'system.dict.create', MenuTypeEnum.Button),
            createMockMenu(3, 'system.role.view')
        ]);

        const result = await service.getAccountInfo(mockSession);

        expect(result.permission).toEqual(['system.user.view', 'system.dict.create', 'system.role.view']);
        expect(result.roles).toEqual(['super_admin', 'test']);
        expect(result.user.profile).toEqual(mockSession.profile);
    });
});
