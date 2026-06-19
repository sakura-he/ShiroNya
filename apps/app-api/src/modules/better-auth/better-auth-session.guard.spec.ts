import 'reflect-metadata';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '@app/common';
import { BetterAuthSessionGuard } from './better-auth-session.guard';
import type { BetterAuthSession } from './better-auth-session.type';

jest.mock('@thallesp/nestjs-better-auth', () => ({
    AuthService: class AuthService {}
}));

function createSession(role: string | null = 'user'): BetterAuthSession {
    return {
        user: {
            id: 'user_1',
            role
        },
        session: {
            userId: 'user_1'
        },
        roles: [],
        profile: null
    } as BetterAuthSession;
}

function createExecutionContext(input: {
    handler?: (...args: any[]) => any;
    controller?: new (...args: any[]) => any;
    request?: Record<string, unknown>;
}): ExecutionContext {
    const request = input.request ?? {
        headers: {}
    };

    return {
        getHandler: () => input.handler ?? (() => null),
        getClass: () => input.controller ?? class MockController {},
        switchToHttp: () => ({
            getRequest: () => request
        })
    } as unknown as ExecutionContext;
}

describe('BetterAuthSessionGuard', () => {
    it('Better Auth @Public 路由不应解析 session', async () => {
        const handler = () => null;
        Reflect.defineMetadata('PUBLIC', true, handler);
        const authService = {
            api: {
                getSession: jest.fn()
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({ handler }))).resolves.toBe(true);
        expect(authService.api.getSession).not.toHaveBeenCalled();
    });

    it('@app/common Public 路由也应视为公开路由', async () => {
        const handler = () => null;
        Reflect.defineMetadata(PUBLIC_KEY, true, handler);
        const authService = {
            api: {
                getSession: jest.fn()
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({ handler }))).resolves.toBe(true);
        expect(authService.api.getSession).not.toHaveBeenCalled();
    });

    it('受保护路由应解析 session 并写回 request', async () => {
        const session = createSession();
        const request = {
            headers: {
                authorization: 'Bearer token_1'
            }
        };
        const authService = {
            api: {
                getSession: jest.fn().mockResolvedValue(session)
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({ request }))).resolves.toBe(true);
        expect(authService.api.getSession).toHaveBeenCalledTimes(1);
        expect(request).toMatchObject({
            session,
            user: session.user
        });
    });

    it('受保护路由缺少 session 时应返回 401', async () => {
        const authService = {
            api: {
                getSession: jest.fn().mockResolvedValue(null)
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('受保护路由遇到已封禁账号时应返回 401', async () => {
        const session = createSession();
        session.user.banned = true;
        session.user.banExpires = null;
        const authService = {
            api: {
                getSession: jest.fn().mockResolvedValue(session)
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('Better Auth 权限类 metadata 不再参与 admin 授权', async () => {
        const handler = () => null;
        Reflect.defineMetadata('ROLES', ['admin'], handler);
        Reflect.defineMetadata('ORG_ROLES', ['owner'], handler);
        Reflect.defineMetadata('USER_HAS_PERMISSION', { permissions: { user: ['update'] } }, handler);
        Reflect.defineMetadata('MEMBER_HAS_PERMISSION', { permissions: { org: ['update'] } }, handler);
        const session = createSession('user');
        const authService = {
            api: {
                getSession: jest.fn().mockResolvedValue(session),
                getActiveMemberRole: jest.fn(),
                getActiveMember: jest.fn(),
                userHasPermission: jest.fn(),
                hasPermission: jest.fn()
            }
        };
        const guard = new BetterAuthSessionGuard(new Reflector(), authService as any);

        await expect(guard.canActivate(createExecutionContext({ handler }))).resolves.toBe(true);
        expect(authService.api.getActiveMemberRole).not.toHaveBeenCalled();
        expect(authService.api.getActiveMember).not.toHaveBeenCalled();
        expect(authService.api.userHasPermission).not.toHaveBeenCalled();
        expect(authService.api.hasPermission).not.toHaveBeenCalled();
    });
});
