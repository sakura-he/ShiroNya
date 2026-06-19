import 'reflect-metadata';
import { RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY } from '@app/rbac-core';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';

describe('RbacGuard', () => {
    function createContext(args: {
        handler?: Function;
        controller?: Function;
        session?: { user?: { id?: string }; session?: { userId?: string } };
    }): ExecutionContext {
        const request = {
            session: args.session
        };

        return {
            getHandler: () => args.handler ?? (() => null),
            getClass: () => args.controller ?? class DemoController {},
            switchToHttp: () => ({
                getRequest: () => request
            })
        } as unknown as ExecutionContext;
    }

    function createGuard(checkPermission = jest.fn().mockResolvedValue(true)): RbacGuard {
        return new RbacGuard(new Reflector(), { checkPermission } as any);
    }

    it('没有 RBAC 权限声明时直接放行', async () => {
        const checkPermission = jest.fn();
        const guard = createGuard(checkPermission);

        await expect(guard.canActivate(createContext({}))).resolves.toBe(true);

        expect(checkPermission).not.toHaveBeenCalled();
    });

    it('有权限声明时用 session userId 调用 RBAC 授权服务', async () => {
        const handler = () => null;
        Reflect.defineMetadata(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, ['system.user.view'], handler);
        const checkPermission = jest.fn().mockResolvedValue(true);
        const guard = createGuard(checkPermission);

        await expect(
            guard.canActivate(
                createContext({
                    handler,
                    session: {
                        user: {
                            id: 'user_1'
                        }
                    }
                })
            )
        ).resolves.toBe(true);

        expect(checkPermission).toHaveBeenCalledWith(
            'user_1',
            'system.user.view',
            expect.objectContaining({
                cache: expect.objectContaining({
                    grantedStates: expect.any(Map),
                    permissionChecks: expect.any(Map),
                    superAdminStates: expect.any(Map)
                })
            })
        );
    });

    it('有权限声明但缺少 session 时返回 401', async () => {
        const handler = () => null;
        Reflect.defineMetadata(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, ['system.user.view'], handler);
        const guard = createGuard();

        await expect(guard.canActivate(createContext({ handler }))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('RBAC 授权服务返回 false 时返回 403', async () => {
        const handler = () => null;
        Reflect.defineMetadata(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, ['system.user.delete'], handler);
        const guard = createGuard(jest.fn().mockResolvedValue(false));

        await expect(
            guard.canActivate(
                createContext({
                    handler,
                    session: {
                        user: {
                            id: 'user_1'
                        }
                    }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('合并 class 与 handler 权限并去重，默认 all 语义逐个检查', async () => {
        class DemoController {}

        const handler = () => null;
        Reflect.defineMetadata(
            RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY,
            ['system.user.view', 'system.shared'],
            DemoController
        );
        Reflect.defineMetadata(
            RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY,
            ['system.user.update', 'system.shared'],
            handler
        );
        const checkPermission = jest.fn().mockResolvedValue(true);
        const guard = createGuard(checkPermission);

        await expect(
            guard.canActivate(
                createContext({
                    controller: DemoController,
                    handler,
                    session: {
                        session: {
                            userId: 'user_2'
                        }
                    }
                })
            )
        ).resolves.toBe(true);

        expect(checkPermission.mock.calls.map((call) => call.slice(0, 2))).toEqual([
            ['user_2', 'system.user.view'],
            ['user_2', 'system.shared'],
            ['user_2', 'system.user.update']
        ]);
    });
});
