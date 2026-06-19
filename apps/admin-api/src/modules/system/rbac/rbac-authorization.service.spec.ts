import { ErrorCodes, runWithRequestContext } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { createRbacRequestCache } from '@app/rbac-core';
import { AdminErrorCodes } from '../../../common/constants/index';
import { RbacAuthorizationService } from './rbac-authorization.service';
import { SystemRbacEffectivePermissionCacheService } from './rbac-effective-permission-cache.service';

describe('RbacAuthorizationService', () => {
    let prismaService: any;
    let service: RbacAuthorizationService;

    beforeEach(() => {
        prismaService = {
            rbacEffectiveUserRole: {
                findFirst: jest.fn().mockResolvedValue(null)
            },
            rbacEffectiveUserPermission: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        permission: {
                            code: 'rbac.role.create'
                        }
                    }
                ])
            },
            rbacPermission: {
                findFirst: jest.fn().mockResolvedValue({ id: 1 }),
                findMany: jest.fn().mockResolvedValue([
                    {
                        code: 'rbac.role.create'
                    },
                    {
                        code: 'rbac.role.delete'
                    }
                ])
            }
        };
        service = new RbacAuthorizationService(prismaService as PrismaService);
    });

    it('用户 effective code set 命中时直接允许', async () => {
        await expect(service.checkPermission('u1', 'rbac.role.create')).resolves.toBe(true);

        expect(prismaService.rbacEffectiveUserPermission.findMany).toHaveBeenCalledTimes(1);
        expect(prismaService.rbacPermission.findFirst).not.toHaveBeenCalled();
    });

    it('用户没有 code 但目标权限存在时返回 false', async () => {
        await expect(service.checkPermission('u1', 'rbac.role.delete')).resolves.toBe(false);

        expect(prismaService.rbacPermission.findFirst).toHaveBeenCalledWith({
            where: {
                code: 'rbac.role.delete',
                deletedAt: null,
                status: 'ENABLE'
            },
            select: {
                id: true
            }
        });
    });

    it('目标 code 不存在或未启用时抛配置错误', async () => {
        prismaService.rbacPermission.findFirst.mockResolvedValue(null);

        await expect(service.checkPermission('u1', 'rbac.missing')).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID.code
        });
    });

    it('批量检查会去重并检查未命中的 code 配置', async () => {
        const result = await service.checkPermissions('u1', [
            'rbac.role.create',
            'rbac.role.delete',
            'rbac.role.create'
        ]);

        expect(result).toEqual(
            new Map([
                ['rbac.role.create', true],
                ['rbac.role.delete', false]
            ])
        );
        expect(prismaService.rbacPermission.findMany).toHaveBeenCalledWith({
            where: {
                code: {
                    in: ['rbac.role.delete']
                },
                deletedAt: null,
                status: 'ENABLE'
            },
            select: {
                code: true
            }
        });
        expect(prismaService.rbacPermission.findFirst).not.toHaveBeenCalled();
    });

    it('超级管理员获取权限全集时读取所有启用权限码，但单点检查只确认目标 code 配置', async () => {
        prismaService.rbacEffectiveUserRole.findFirst.mockResolvedValue({ roleId: 1 });

        await expect(service.getGrantedCodes('u1')).resolves.toEqual(['rbac.role.create', 'rbac.role.delete']);
        await expect(service.checkPermission('u1', 'rbac.role.delete')).resolves.toBe(true);

        expect(prismaService.rbacPermission.findMany).toHaveBeenCalledTimes(1);
        expect(prismaService.rbacPermission.findFirst).toHaveBeenCalledWith({
            where: {
                code: 'rbac.role.delete',
                deletedAt: null,
                status: 'ENABLE'
            },
            select: {
                id: true
            }
        });
    });

    it('请求缓存会让同一用户的并发权限检查只读取一次 effective 权限集合', async () => {
        const cache = createRbacRequestCache();

        await Promise.all([
            service.checkPermission('u1', 'rbac.role.create', { cache }),
            service.checkPermission('u1', 'rbac.role.delete', { cache }),
            service.checkPermission('u1', 'rbac.role.update', { cache })
        ]);

        expect(prismaService.rbacEffectiveUserPermission.findMany).toHaveBeenCalledTimes(1);
    });

    it('请求缓存会让同一 code 的并发检查只读取一次权限配置', async () => {
        const cache = createRbacRequestCache();

        await Promise.all([
            service.checkPermission('u1', 'rbac.role.delete', { cache }),
            service.checkPermission('u1', 'rbac.role.delete', { cache })
        ]);

        expect(prismaService.rbacPermission.findFirst).toHaveBeenCalledTimes(1);
    });

    it('HTTP 请求上下文内未显式传 cache 时也会复用同一个 RBAC 授权缓存', async () => {
        await runWithRequestContext({ requestId: 'req_1' }, async () => {
            await service.checkPermission('u1', 'rbac.role.create');
            await service.checkPermission('u1', 'rbac.role.delete');
        });

        expect(prismaService.rbacEffectiveUserRole.findFirst).toHaveBeenCalledTimes(1);
        expect(prismaService.rbacEffectiveUserPermission.findMany).toHaveBeenCalledTimes(1);
    });

    it('跨请求 effective 权限缓存命中时不再读取 effective 权限表', async () => {
        const effectivePermissionCache = {
            getPermissionCodes: jest.fn().mockResolvedValue(['rbac.role.create']),
            setPermissionCodes: jest.fn()
        };
        service = new RbacAuthorizationService(
            prismaService as PrismaService,
            effectivePermissionCache as unknown as SystemRbacEffectivePermissionCacheService
        );

        await expect(service.checkPermission('u1', 'rbac.role.create')).resolves.toBe(true);

        expect(effectivePermissionCache.getPermissionCodes).toHaveBeenCalledWith('u1');
        expect(prismaService.rbacEffectiveUserPermission.findMany).not.toHaveBeenCalled();
        expect(effectivePermissionCache.setPermissionCodes).not.toHaveBeenCalled();
    });

    it('effective 权限缓存未命中时读取 effective 表并写回缓存', async () => {
        const effectivePermissionCache = {
            getPermissionCodes: jest.fn().mockResolvedValue(null),
            setPermissionCodes: jest.fn().mockResolvedValue(undefined)
        };
        service = new RbacAuthorizationService(
            prismaService as PrismaService,
            effectivePermissionCache as unknown as SystemRbacEffectivePermissionCacheService
        );

        await expect(service.getGrantedCodes('u1')).resolves.toEqual(['rbac.role.create']);

        expect(prismaService.rbacEffectiveUserPermission.findMany).toHaveBeenCalledTimes(1);
        expect(effectivePermissionCache.setPermissionCodes).toHaveBeenCalledWith('u1', ['rbac.role.create']);
    });

    it('assertPermission 在 RBAC 拒绝时抛权限不足', async () => {
        await expect(service.assertPermission('u1', 'rbac.role.delete')).rejects.toMatchObject({
            bizCode: ErrorCodes.ROLE.PERMISSION_DENIED.code
        });
    });

    it('缺少 userId 或 code 是配置错误', async () => {
        await expect(service.checkPermission('', 'rbac.role.create')).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID.code
        });
        await expect(service.checkPermission('u1', '')).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID.code
        });
    });

    it('批量检查缺少有效 code 是配置错误', async () => {
        await expect(service.checkPermissions('u1', [' ', ''])).rejects.toMatchObject({
            bizCode: AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID.code
        });
    });
});
