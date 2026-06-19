import type { ExecutionContext } from '@nestjs/common';
import { CerbosAbacRuntimeService } from './runtime.service';
import type { PrismaLike } from '../types';

function createHttpContext(request: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request
        })
    } as ExecutionContext;
}

function createRuntime(input: {
    permission: Record<string, unknown> | null;
    allowed?: boolean;
    unboundRuntimeMode?: 'ALLOW' | 'DENY';
    redis?: any;
}) {
    const cerbosService = {
        isAllowed: jest.fn().mockResolvedValue(input.allowed ?? true)
    };
    const prisma = {
        cerbosAbacPermission: {
            findUnique: jest.fn().mockResolvedValue(input.permission)
        }
    } as unknown as PrismaLike;
    const runtime = new CerbosAbacRuntimeService(
        prisma,
        cerbosService as any,
        {
            envPrefix: 'ADMIN_',
            userFromContext: async () => ({
                id: 'user-1',
                roles: ['user'],
                session: {}
            })
        },
        {
            appName: 'admin-api',
            cerbosEnvPrefix: 'ADMIN_',
            unboundRuntimeMode: input.unboundRuntimeMode ?? 'ALLOW',
            runtimeBindingCacheTtlSeconds: 300
        },
        input.redis
    );

    return { runtime, cerbosService, prisma };
}

describe('CerbosAbacRuntimeService', () => {
    it('passes request session and decorator ext to Cerbos principal attributes', async () => {
        const session = {
            user: {
                id: 'user-1',
                name: 'Admin'
            }
        };
        const { runtime, cerbosService } = createRuntime({
            permission: {
                code: 'system.user.update',
                bindType: 'BUILTIN',
                status: 'ENABLE',
                deletedAt: null
            }
        });

        const allowed = await runtime.check({
            code: 'system.user.update',
            context: createHttpContext({
                session,
                params: { id: 'resource-1' }
            }),
            options: {
                ext: () => ({ departmentId: 'dept-1' }),
                resourceAttr: { ownerId: 'user-1' }
            }
        });

        expect(allowed).toBe(true);
        expect(cerbosService.isAllowed).toHaveBeenCalledWith({
            principalId: 'user-1',
            roles: ['user', '*'],
            principalAttr: {
                session,
                ext: {
                    departmentId: 'dept-1'
                }
            },
            resourceKind: 'abac_builtin_permission',
            resourceId: 'resource-1',
            resourceAttr: {
                ownerId: 'user-1'
            },
            action: 'system.user.update'
        });
    });

    it('treats unbound permission rows according to runtime mode', async () => {
        const { runtime, cerbosService } = createRuntime({
            permission: {
                code: 'system.order.approve',
                bindType: 'UNBOUND',
                status: 'ENABLE',
                deletedAt: null
            },
            unboundRuntimeMode: 'DENY'
        });

        const result = await runtime.checkByRawInput({
            code: 'system.order.approve',
            principalId: 'user-1',
            roles: ['user']
        });

        expect(result).toEqual({
            allowed: false,
            bound: false,
            bindType: 'UNBOUND',
            resourceKind: null,
            reason: 'ABAC 未绑定，按配置拒绝'
        });
        expect(cerbosService.isAllowed).not.toHaveBeenCalled();
    });

    it('caches permission binding by code in Redis', async () => {
        const cache = new Map<string, string>();
        const redis = {
            get: jest.fn(async (key: string) => cache.get(key) ?? null),
            set: jest.fn(async (key: string, value: string) => {
                cache.set(key, value);
            }),
            del: jest.fn()
        };
        const { runtime, prisma } = createRuntime({
            permission: {
                code: 'system.order.approve',
                bindType: 'BUILTIN',
                status: 'ENABLE',
                deletedAt: null
            },
            redis
        });

        await runtime.checkByRawInput({
            code: 'system.order.approve',
            principalId: 'user-1',
            roles: ['user']
        });
        await runtime.checkByRawInput({
            code: 'system.order.approve',
            principalId: 'user-1',
            roles: ['user']
        });

        expect(prisma.cerbosAbacPermission.findUnique).toHaveBeenCalledTimes(1);
        expect(redis.set).toHaveBeenCalledWith(
            'cerbos-abac:admin-api:runtime-binding:system.order.approve',
            expect.stringContaining('"bound":true'),
            { EX: 300 }
        );
    });

    it('invalidates cached binding keys', async () => {
        const redis = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
        };
        const { runtime } = createRuntime({
            permission: null,
            redis
        });

        await runtime.invalidateBindingCache(['system.order.approve', ' system.order.approve ', '']);

        expect(redis.del).toHaveBeenCalledWith(['cerbos-abac:admin-api:runtime-binding:system.order.approve']);
    });
});
