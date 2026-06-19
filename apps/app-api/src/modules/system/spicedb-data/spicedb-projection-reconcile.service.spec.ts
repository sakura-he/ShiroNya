import { PrismaService } from '@app/prisma-app';
import { BaseRelationProjectionService } from '../../spicedb-projection/base-relation-projection.service';
import { SpiceDbProjectionReconcileService } from './spicedb-projection-reconcile.service';

const reconcileResult = {
    userGroupMembers: {
        desiredCount: 0,
        currentCount: 0,
        missingCount: 0,
        staleCount: 0
    },
    userRoles: {
        desiredCount: 0,
        currentCount: 0,
        missingCount: 0,
        staleCount: 0
    },
    userGroupRoles: {
        desiredCount: 0,
        currentCount: 0,
        missingCount: 0,
        staleCount: 0
    },
    menuRoles: {
        desiredCount: 0,
        currentCount: 0,
        missingCount: 0,
        staleCount: 0
    },
    total: {
        desiredCount: 0,
        currentCount: 0,
        missingCount: 0,
        staleCount: 0
    }
};

const mockPrismaService = {
    spiceDbProjectionReconcileRun: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn()
    }
};

const mockProjectionService = {
    inspectFullSync: jest.fn(),
    reconcileFromSpiceDb: jest.fn(),
    rebuildFromSpiceDb: jest.fn()
};

const mockInvalidationService = {
    invalidateBroadProjectionReadModel: jest.fn()
};

describe('SpiceDbProjectionReconcileService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPrismaService.spiceDbProjectionReconcileRun.create.mockResolvedValue({});
        mockPrismaService.spiceDbProjectionReconcileRun.update.mockResolvedValue({});
        mockProjectionService.inspectFullSync.mockResolvedValue(reconcileResult);
        mockProjectionService.reconcileFromSpiceDb.mockResolvedValue(reconcileResult);
        mockProjectionService.rebuildFromSpiceDb.mockResolvedValue(reconcileResult);
        mockInvalidationService.invalidateBroadProjectionReadModel.mockResolvedValue(undefined);
    });

    /**
     * 创建带可选 Redis 客户端的 reconcile service，便于覆盖锁分支。
     */
    function createService(redis?: unknown) {
        return new SpiceDbProjectionReconcileService(
            mockPrismaService as unknown as PrismaService,
            mockProjectionService as unknown as BaseRelationProjectionService,
            mockInvalidationService as any,
            redis as any
        );
    }

    /**
     * 创建 node-redis 风格 mock，默认可以成功抢锁和释放锁。
     */
    function createRedisMock(setResult: 'OK' | null = 'OK') {
        return {
            set: jest.fn().mockResolvedValue(setResult),
            eval: jest.fn().mockResolvedValue(1)
        };
    }

    it('scheduled reconcile 抢到 Redis 锁时应执行 dry-run 并释放锁', async () => {
        const redis = createRedisMock();
        const service = createService(redis);

        await service.runScheduledDriftCheck();

        expect(redis.set).toHaveBeenCalledWith('lock:app-api:spicedb:projection-reconcile', expect.any(String), {
            expiration: {
                type: 'PX',
                value: 4 * 60 * 1000
            },
            condition: 'NX'
        });
        expect(mockProjectionService.inspectFullSync).toHaveBeenCalledWith(null);
        expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("get"'), {
            keys: ['lock:app-api:spicedb:projection-reconcile'],
            arguments: [expect.any(String)]
        });
    });

    it('scheduled reconcile 抢不到 Redis 锁时应跳过且不执行投影扫描', async () => {
        const redis = createRedisMock(null);
        const service = createService(redis);

        await service.runScheduledDriftCheck();

        expect(mockProjectionService.inspectFullSync).not.toHaveBeenCalled();
        expect(mockPrismaService.spiceDbProjectionReconcileRun.create).not.toHaveBeenCalled();
        expect(redis.eval).not.toHaveBeenCalled();
    });

    it('manual reconcile 在 Redis 锁不可用时应返回明确业务错误', async () => {
        const service = createService();

        await expect(service.runManualReconcile('dry_run', '人工巡检')).rejects.toMatchObject({
            bizContext: expect.objectContaining({
                reason: 'reconcile_lock_unavailable'
            })
        });
        expect(mockProjectionService.inspectFullSync).not.toHaveBeenCalled();
    });
});
