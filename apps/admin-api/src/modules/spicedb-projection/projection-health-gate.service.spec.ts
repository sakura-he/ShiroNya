import { PrismaService } from '@app/prisma-admin';
import { ConfigService } from '@nestjs/config';
import { ProjectionHealthGateService } from './projection-health-gate.service';

const mockPrismaService = {
    spiceDbProjectionReconcileRun: {
        findFirst: jest.fn()
    },
    spiceDbProjectionCursor: {
        findMany: jest.fn()
    },
    spiceDbProjectionEventLog: {
        count: jest.fn()
    }
};

const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => defaultValue)
};

describe('ProjectionHealthGateService', () => {
    let service: ProjectionHealthGateService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPrismaService.spiceDbProjectionReconcileRun.findFirst.mockResolvedValue({
            status: 'succeeded',
            totalStats: {
                missingCount: 0,
                staleCount: 0
            }
        });
        mockPrismaService.spiceDbProjectionCursor.findMany.mockResolvedValue([{ lag: 0 }]);
        mockPrismaService.spiceDbProjectionEventLog.count.mockResolvedValue(0);
        service = new ProjectionHealthGateService(
            mockPrismaService as unknown as PrismaService,
            mockConfigService as unknown as ConfigService
        );
    });

    it('最近一次对账成功且无漂移/积压/DLQ 时允许使用投影读模型', async () => {
        await expect(service.canUseProjectionReadModel()).resolves.toBe(true);
    });

    it('没有对账快照时禁止使用投影读模型', async () => {
        mockPrismaService.spiceDbProjectionReconcileRun.findFirst.mockResolvedValue(null);

        await expect(service.getProjectionHealthGate()).resolves.toMatchObject({
            usable: false,
            reason: 'projection_reconcile_snapshot_missing'
        });
    });

    it('检测到漂移、DLQ 或 consumer lag 时应禁止使用投影读模型', async () => {
        mockPrismaService.spiceDbProjectionReconcileRun.findFirst.mockResolvedValue({
            status: 'succeeded',
            totalStats: {
                missingCount: 1,
                staleCount: 0
            }
        });
        await expect(service.getProjectionHealthGate()).resolves.toMatchObject({
            usable: false,
            reason: 'projection_drifted'
        });

        mockPrismaService.spiceDbProjectionReconcileRun.findFirst.mockResolvedValue({
            status: 'succeeded',
            totalStats: {
                missingCount: 0,
                staleCount: 0
            }
        });
        mockPrismaService.spiceDbProjectionEventLog.count.mockResolvedValue(1);
        await expect(service.getProjectionHealthGate()).resolves.toMatchObject({
            usable: false,
            reason: 'projection_dlq_unhandled'
        });

        mockPrismaService.spiceDbProjectionEventLog.count.mockResolvedValue(0);
        mockPrismaService.spiceDbProjectionCursor.findMany.mockResolvedValue([{ lag: 1000 }]);
        await expect(service.getProjectionHealthGate()).resolves.toMatchObject({
            usable: false,
            reason: 'projection_consumer_lagged'
        });
    });
});
