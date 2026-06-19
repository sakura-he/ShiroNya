import { ADMIN_API_RBAC_CACHE_NAMESPACE, createRbacEffectivePermissionCodesCacheKey } from '@app/common/constants';
import { SystemRbacEffectivePermissionCacheService } from './rbac-effective-permission-cache.service';

describe('SystemRbacEffectivePermissionCacheService', () => {
    let cache: {
        get: jest.Mock;
        set: jest.Mock;
        del: jest.Mock;
    };
    let adminUserStateService: {
        getUserVersion: jest.Mock;
    };
    let service: SystemRbacEffectivePermissionCacheService;

    beforeEach(() => {
        cache = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
        };
        adminUserStateService = {
            getUserVersion: jest.fn().mockResolvedValue('user_v1')
        };
        service = new SystemRbacEffectivePermissionCacheService(cache as any, adminUserStateService as any);
    });

    it('按 userId 和 userVersion 读取 effective permission codes', async () => {
        cache.get.mockResolvedValue({
            codes: ['rbac.role.create', 'rbac.role.update']
        });

        await expect(service.getPermissionCodes('user:1')).resolves.toEqual(['rbac.role.create', 'rbac.role.update']);

        expect(cache.get).toHaveBeenCalledWith(
            createRbacEffectivePermissionCodesCacheKey(ADMIN_API_RBAC_CACHE_NAMESPACE, 'user:1', 'user_v1')
        );
    });

    it('写入 effective permission codes 时使用毫秒 TTL', async () => {
        await service.setPermissionCodes('u1', ['rbac.role.create']);

        expect(cache.set).toHaveBeenCalledWith(
            createRbacEffectivePermissionCodesCacheKey(ADMIN_API_RBAC_CACHE_NAMESPACE, 'u1', 'user_v1'),
            {
                codes: ['rbac.role.create']
            },
            300_000
        );
    });

    it('缓存结构异常时删除脏 key 并返回 miss', async () => {
        cache.get.mockResolvedValue({
            codes: [1, 'rbac.role.create']
        });

        await expect(service.getPermissionCodes('u1')).resolves.toBeNull();

        expect(cache.del).toHaveBeenCalledWith(
            createRbacEffectivePermissionCodesCacheKey(ADMIN_API_RBAC_CACHE_NAMESPACE, 'u1', 'user_v1')
        );
    });

    it('缓存异常不影响主授权链路回源', async () => {
        cache.get.mockRejectedValue(new Error('cache unavailable'));

        await expect(service.getPermissionCodes('u1')).resolves.toBeNull();
    });
});
