import { PrismaService } from '@app/prisma-app';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
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
            OLD_PASSWORD_ERROR: { code: 4002, message: '原密码错误' },
            PASSWORD_TOO_SHORT: { code: 4003, message: '请将密码设置为 8 到 128 个字符' },
            PASSWORD_TOO_LONG: { code: 4004, message: '请将密码设置为 8 到 128 个字符' }
        }
    }
}));

const mockPrismaService = {
    rbacMenu: {
        findMany: jest.fn()
    },
    rbacPermission: {
        findMany: jest.fn()
    },
    betterAuthUser: {
        findUnique: jest.fn()
    },
    betterAuthVerification: {
        deleteMany: jest.fn()
    }
};

const mockAuthContext = {
    internalAdapter: {
        createVerificationValue: jest.fn(),
        findVerificationValue: jest.fn()
    }
};

const mockAuthService = {
    instance: {
        $context: Promise.resolve(mockAuthContext)
    },
    api: {
        resetPassword: jest.fn(),
        changePassword: jest.fn()
    }
};
const mockRbacAuthorizationService = {
    getGrantedCodes: jest.fn()
};
const mockRbacGraphService = {
    getUserEffectiveState: jest.fn()
};
const mockAdminUserStateService = {
    getCompositeStateVersion: jest.fn()
};

describe('AccountService password flows', () => {
    let service: AccountService;

    beforeEach(async () => {
        jest.clearAllMocks();

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

    it('邮箱不存在时，请求重置密码应返回统一提示且不创建验证记录', async () => {
        mockPrismaService.betterAuthUser.findUnique.mockResolvedValue(null);

        const result = await service.requestPasswordReset('missing@example.com');

        expect(result).toEqual({
            message: '如果该邮箱已注册，您将收到重置密码的邮件'
        });
        expect(mockPrismaService.betterAuthVerification.deleteMany).not.toHaveBeenCalled();
    });

    it('邮箱存在时，应清理已有记录并创建 Better Auth 验证记录', async () => {
        const createVerificationValue = mockAuthContext.internalAdapter.createVerificationValue as jest.Mock;
        mockPrismaService.betterAuthUser.findUnique.mockResolvedValue({
            id: 'user_1',
            email: 'admin@example.com'
        });

        const result = await service.requestPasswordReset('admin@example.com');

        expect(mockPrismaService.betterAuthVerification.deleteMany).toHaveBeenCalledWith({
            where: {
                value: 'user_1',
                identifier: {
                    startsWith: 'reset-password:'
                }
            }
        });
        expect(createVerificationValue).toHaveBeenCalledWith(
            expect.objectContaining({
                value: 'user_1',
                identifier: expect.stringMatching(/^reset-password:/)
            })
        );
        expect(result.message).toBe('如果该邮箱已注册，您将收到重置密码的邮件');
    });

    it('重置 token 无效时，应抛出业务异常', async () => {
        const findVerificationValue = mockAuthContext.internalAdapter.findVerificationValue as jest.Mock;
        findVerificationValue.mockResolvedValue(null);

        await expect(service.verifyResetToken('invalid-token')).rejects.toThrow('BusinessException');
    });

    it('重置 token 过期时间为 ISO 字符串时，应正确校验有效性', async () => {
        const findVerificationValue = mockAuthContext.internalAdapter.findVerificationValue as jest.Mock;
        findVerificationValue.mockResolvedValue({
            identifier: 'reset-password:valid-token',
            value: 'user_1',
            expiresAt: '2999-01-01T00:00:00.000Z'
        });

        await expect(service.verifyResetToken('valid-token')).resolves.toEqual({
            valid: true
        });
    });

    it('原密码错误时，应把 Better Auth 错误映射成业务异常', async () => {
        mockAuthService.api.changePassword.mockRejectedValue(
            new APIError('BAD_REQUEST', {
                message: '密码错误',
                code: 'INVALID_PASSWORD'
            })
        );

        await expect(
            service.changePassword(
                {} as never,
                {
                    cookie: 'admin-api.session=session_token'
                },
                'wrong-password',
                'new-password-123'
            )
        ).rejects.toThrow('BusinessException');
    });

    it('修改密码不符合 Better Auth 长度限制时，应返回中文密码策略提示', async () => {
        mockAuthService.api.changePassword.mockRejectedValue(
            new APIError('BAD_REQUEST', {
                message: 'Password too short',
                code: 'PASSWORD_TOO_SHORT'
            })
        );

        await expect(
            service.changePassword(
                {} as never,
                {
                    cookie: 'admin-api.session=session_token'
                },
                'old-password-123',
                '123'
            )
        ).rejects.toMatchObject({
            payload: { code: 4003, message: '请将密码设置为 8 到 128 个字符' }
        });
    });

    it('重置密码不符合 Better Auth 长度限制时，应返回中文密码策略提示', async () => {
        mockAuthService.api.resetPassword.mockRejectedValue(
            new APIError('BAD_REQUEST', {
                message: 'Password too long',
                code: 'PASSWORD_TOO_LONG'
            })
        );

        await expect(service.resetPassword('valid-token', 'x'.repeat(129))).rejects.toMatchObject({
            payload: { code: 4004, message: '请将密码设置为 8 到 128 个字符' }
        });
    });
});
