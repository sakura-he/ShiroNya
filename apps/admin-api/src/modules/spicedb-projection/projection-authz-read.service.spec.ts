import { PrismaService } from '@app/prisma-admin';
import { ProjectionAuthzReadService } from './projection-authz-read.service';
import { BaseRelationProjectionService } from './base-relation-projection.service';
import { AdminSpiceDbAuthorizationService } from '../spicedb/admin-spicedb-authorization.service';
import { ProjectionHealthGateService } from './projection-health-gate.service';
import { AuthzProjectionInvalidationService } from './authz-projection-invalidation.service';

const mockPrismaService = {
    rbacRole: {
        findMany: jest.fn()
    },
    task: {
        findMany: jest.fn()
    },
    authzResourceRoleBinding: {
        count: jest.fn()
    },
    authzObjectSubjectBinding: {
        findMany: jest.fn()
    }
};

const mockBaseRelationProjectionService = {
    getBatchUserEffectiveRoleIds: jest.fn()
};

const mockSpiceDbAuthorizationService = {
    lookupUserEffectiveRoleIds: jest.fn(),
    lookupUserVisibleTaskIds: jest.fn(),
    checkTaskPermissions: jest.fn(),
    checkTaskManagerPermission: jest.fn()
};

const mockProjectionHealthGateService = {
    canUseProjectionReadModel: jest.fn()
};

const mockInvalidationService = {
    getProjectionCacheVersion: jest.fn()
};

const mockRedis = {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn()
};

function createService(redis?: typeof mockRedis) {
    return new ProjectionAuthzReadService(
        mockPrismaService as unknown as PrismaService,
        mockBaseRelationProjectionService as unknown as BaseRelationProjectionService,
        mockSpiceDbAuthorizationService as unknown as AdminSpiceDbAuthorizationService,
        mockProjectionHealthGateService as unknown as ProjectionHealthGateService,
        mockInvalidationService as unknown as AuthzProjectionInvalidationService,
        redis as any
    );
}

describe('ProjectionAuthzReadService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProjectionHealthGateService.canUseProjectionReadModel.mockResolvedValue(true);
        mockInvalidationService.getProjectionCacheVersion.mockResolvedValue('projection-v1');
        mockBaseRelationProjectionService.getBatchUserEffectiveRoleIds.mockResolvedValue(new Map([['user_1', [2]]]));
        mockPrismaService.rbacRole.findMany.mockResolvedValue([{ id: 2, code: 'ops' }]);
        mockPrismaService.authzResourceRoleBinding.count.mockResolvedValue(0);
        mockPrismaService.task.findMany.mockResolvedValue([{ id: 1, userId: 'user_1' }]);
        mockPrismaService.authzObjectSubjectBinding.findMany.mockResolvedValue([]);
        mockSpiceDbAuthorizationService.lookupUserVisibleTaskIds.mockResolvedValue([99]);
        mockSpiceDbAuthorizationService.lookupUserEffectiveRoleIds.mockResolvedValue([3]);
        mockSpiceDbAuthorizationService.checkTaskPermissions.mockResolvedValue([]);
        mockSpiceDbAuthorizationService.checkTaskManagerPermission.mockResolvedValue(false);
        mockRedis.get.mockResolvedValue(null);
        mockRedis.setEx.mockResolvedValue('OK');
        mockRedis.del.mockResolvedValue(1);
    });

    it('健康门禁失败时应回退 SpiceDB，且不读取 Redis 投影缓存', async () => {
        mockProjectionHealthGateService.canUseProjectionReadModel.mockResolvedValue(false);
        const service = createService(mockRedis);

        await expect(service.getVisibleTaskIdsByUserId('user_1')).resolves.toEqual([99]);

        expect(mockSpiceDbAuthorizationService.lookupUserVisibleTaskIds).toHaveBeenCalledWith('user_1');
        expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('健康门禁失败时读取有效角色也应回退 SpiceDB', async () => {
        mockProjectionHealthGateService.canUseProjectionReadModel.mockResolvedValue(false);
        const service = createService(mockRedis);

        await expect(service.getEffectiveRoleIdsByUserId('user_1')).resolves.toEqual([3]);

        expect(mockSpiceDbAuthorizationService.lookupUserEffectiveRoleIds).toHaveBeenCalledWith('user_1');
        expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('Redis 命中合法投影缓存时应直接返回，不回源投影表或 SpiceDB', async () => {
        mockRedis.get.mockResolvedValue(JSON.stringify([7, 8]));
        const service = createService(mockRedis);

        await expect(service.getVisibleTaskIdsByUserId('user_1')).resolves.toEqual([7, 8]);

        expect(mockBaseRelationProjectionService.getBatchUserEffectiveRoleIds).not.toHaveBeenCalled();
        expect(mockSpiceDbAuthorizationService.lookupUserVisibleTaskIds).not.toHaveBeenCalled();
    });

    it('Redis 脏缓存应删除并回源投影读模型', async () => {
        mockRedis.get.mockResolvedValueOnce(JSON.stringify({ bad: true })).mockResolvedValueOnce(null);
        mockPrismaService.task.findMany.mockResolvedValue([{ id: 1 }]);
        mockPrismaService.authzObjectSubjectBinding.findMany.mockResolvedValue([{ resourceId: '2' }]);
        const service = createService(mockRedis);

        await expect(service.getVisibleTaskIdsByUserId('user_1')).resolves.toEqual([1, 2]);

        expect(mockRedis.del).toHaveBeenCalled();
        expect(mockRedis.setEx).toHaveBeenCalledWith(
            expect.stringContaining('visible-task-ids'),
            60,
            JSON.stringify([1, 2])
        );
    });

    it('应通过 creator 和对象例外关系计算 task 按钮权限', async () => {
        mockPrismaService.task.findMany.mockResolvedValue([
            { id: 1, userId: 'user_1' },
            { id: 2, userId: 'other' }
        ]);
        mockPrismaService.authzObjectSubjectBinding.findMany.mockResolvedValue([
            {
                resourceId: '2',
                relation: 'runner'
            }
        ]);
        const service = createService();

        await expect(
            service.checkTaskPermissionsFromReadModel([1, 2], ['view', 'update', 'run'], 'user_1')
        ).resolves.toEqual([
            {
                taskId: 1,
                permissions: {
                    view: true,
                    update: true,
                    run: false
                }
            },
            {
                taskId: 2,
                permissions: {
                    view: true,
                    update: false,
                    run: true
                }
            }
        ]);
    });

    it('task manager 权限命中时应批量放行对应 task 权限', async () => {
        mockPrismaService.authzResourceRoleBinding.count.mockImplementation(({ where }: any) =>
            Promise.resolve(where.resourceId.in.includes('updater') ? 1 : 0)
        );
        mockPrismaService.task.findMany.mockResolvedValue([{ id: 1, userId: 'other' }]);
        const service = createService();

        await expect(service.checkTaskPermissionsFromReadModel([1], ['update', 'delete'], 'user_1')).resolves.toEqual([
            {
                taskId: 1,
                permissions: {
                    update: true,
                    delete: false
                }
            }
        ]);
    });
});
