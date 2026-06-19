import { ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Task, TaskLogStatus, TaskStatus, TaskStrategy } from '@app/prisma-admin/generated/client';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ClearChunksTaskService } from '../../../tasks/clear_chunks_task';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { ProjectionAuthzReadService } from '../../spicedb-projection/projection-authz-read.service';
import { TaskDto } from './dto/task.dto';
import { SystemTasksService } from './tasks.service';

const mockPrismaService = {
    $transaction: jest.fn(),
    task: {
        findMany: jest.fn(),
        findManyAndCount: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    taskLog: {
        findManyAndCount: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn()
    }
};

const mockSchedulerRegistry = {
    doesExist: jest.fn(),
    getCronJob: jest.fn(),
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
    getCronJobs: jest.fn()
};

const mockClearChunksTaskService = {
    clearMergeFilesChunksTask: jest.fn()
};

const mockSpiceDbAuthorizationService = {
    upsertTaskBase: jest.fn(),
    upsertTaskManagerBase: jest.fn(),
    cleanupTask: jest.fn(),
    assertTaskManagerPermission: jest.fn(),
    assertTaskPermission: jest.fn()
};

const mockProjectionAuthzReadService = {
    getVisibleTaskIdsByUserId: jest.fn(),
    checkTaskPermissionsFromReadModel: jest.fn(),
    checkTaskManagerPermissionFromReadModel: jest.fn()
};

const mockAuthzObjectExceptionService = {
    cleanupDeletedResource: jest.fn()
};

/**
 * 构造默认任务记录，供 SystemTasksService 单测复用。
 */
function createTaskRecord(overrides: Partial<Task> = {}): Task {
    const now = new Date('2026-05-03T00:00:00.000Z');
    return {
        id: 1,
        userId: 'user-1',
        name: '清理文件切片',
        remark: null,
        cron: '*/5 * * * * *',
        options: null,
        params: [],
        handler: 'ClearMergeFilesChunksTask',
        strategy: TaskStrategy.MANUAL,
        status: TaskStatus.ENABLE,
        lastStatus: null,
        lastMessage: null,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastDurationMs: null,
        createdAt: now,
        updatedAt: now,
        ...overrides
    } as Task;
}

/**
 * 构造创建任务 DTO，保持测试用例只覆盖关心字段。
 */
function createTaskDto(overrides: Partial<TaskDto> = {}): TaskDto {
    return {
        name: '清理文件切片',
        cron: '*/5 * * * * *',
        handler: 'ClearMergeFilesChunksTask',
        remark: null,
        options: null,
        params: [],
        strategy: TaskStrategy.MANUAL,
        status: TaskStatus.ENABLE,
        ...overrides
    } as TaskDto;
}

describe('SystemTasksService', () => {
    let service: SystemTasksService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSchedulerRegistry.doesExist.mockReturnValue(false);
        mockSchedulerRegistry.getCronJobs.mockReturnValue(new Map());
        mockPrismaService.$transaction.mockResolvedValue([]);
        mockPrismaService.taskLog.create.mockReturnValue({ kind: 'create-task-log' });
        mockPrismaService.task.update.mockReturnValue({ kind: 'update-task' });
        mockSpiceDbAuthorizationService.upsertTaskBase.mockResolvedValue(undefined);
        mockSpiceDbAuthorizationService.upsertTaskManagerBase.mockResolvedValue(undefined);
        mockSpiceDbAuthorizationService.cleanupTask.mockResolvedValue(undefined);
        mockSpiceDbAuthorizationService.assertTaskManagerPermission.mockResolvedValue(undefined);
        mockSpiceDbAuthorizationService.assertTaskPermission.mockResolvedValue(undefined);
        mockProjectionAuthzReadService.getVisibleTaskIdsByUserId.mockResolvedValue([1]);
        mockProjectionAuthzReadService.checkTaskPermissionsFromReadModel.mockResolvedValue([]);
        mockProjectionAuthzReadService.checkTaskManagerPermissionFromReadModel.mockResolvedValue(false);
        service = new SystemTasksService(
            mockPrismaService as unknown as PrismaService,
            mockSchedulerRegistry as unknown as SchedulerRegistry,
            mockClearChunksTaskService as unknown as ClearChunksTaskService,
            mockSpiceDbAuthorizationService as any,
            mockProjectionAuthzReadService as unknown as ProjectionAuthzReadService,
            mockAuthzObjectExceptionService as unknown as AuthzObjectExceptionService
        );
    });

    it('创建任务时遇到重复名称应抛业务异常，且不写入数据库', async () => {
        mockPrismaService.task.findFirst.mockResolvedValue({ id: 99 });

        await expect(service.createTask('user-1', createTaskDto())).rejects.toMatchObject({
            bizCode: ErrorCodes.TASK.NAME_ALREADY_EXISTS.code
        });
        expect(mockPrismaService.task.create).not.toHaveBeenCalled();
        expect(mockSchedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('查询任务列表时应返回当前页任务按钮能力和任务管理资源创建能力', async () => {
        const task = createTaskRecord();
        mockPrismaService.task.findManyAndCount.mockResolvedValue([
            [task],
            {
                total: 1,
                totalPages: 1,
                page: 1,
                pageSize: 10
            }
        ]);
        mockProjectionAuthzReadService.checkTaskPermissionsFromReadModel.mockResolvedValue([
            {
                taskId: task.id,
                permissions: {
                    update: true,
                    delete: false,
                    run: true,
                    view: true
                }
            }
        ]);
        mockProjectionAuthzReadService.checkTaskManagerPermissionFromReadModel.mockResolvedValue(true);

        await expect(service.getTaskList({ page: 1, pageSize: 10 } as any, 'actor-1')).resolves.toMatchObject({
            records: [
                {
                    id: task.id,
                    viewerCanUpdate: true,
                    viewerCanDelete: false,
                    viewerCanRun: true,
                    viewerCanViewLog: true
                }
            ],
            meta: {
                viewerCanCreateTask: true
            },
            pagination: {
                total: 1
            }
        });
        expect(mockProjectionAuthzReadService.getVisibleTaskIdsByUserId).toHaveBeenCalledWith('actor-1');
        expect(mockPrismaService.task.findManyAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: {
                        in: [1]
                    }
                })
            })
        );
        expect(mockProjectionAuthzReadService.checkTaskPermissionsFromReadModel).toHaveBeenCalledWith(
            [task.id],
            ['update', 'delete', 'run', 'view'],
            'actor-1'
        );
        expect(mockProjectionAuthzReadService.checkTaskManagerPermissionFromReadModel).toHaveBeenCalledWith(
            'create',
            'actor-1'
        );
    });

    it('创建任务成功后应写入任务创建人与 task_manager 继承关系', async () => {
        const task = createTaskRecord();
        mockPrismaService.task.findFirst.mockResolvedValue(null);
        mockPrismaService.task.create.mockResolvedValue(task);

        await service.createTask('user-1', createTaskDto());

        expect(mockSpiceDbAuthorizationService.upsertTaskBase).toHaveBeenCalledWith(task.id, 'user-1');
    });

    it('读取任务处理器选项时，用户只要有可见任务即可访问', async () => {
        mockProjectionAuthzReadService.checkTaskManagerPermissionFromReadModel.mockResolvedValue(false);
        mockProjectionAuthzReadService.getVisibleTaskIdsByUserId.mockResolvedValue([1]);

        await expect(service.getTaskHandlers('actor-1')).resolves.toEqual([
            {
                label: 'ClearMergeFilesChunksTask',
                value: 'ClearMergeFilesChunksTask'
            }
        ]);
        expect(mockSpiceDbAuthorizationService.assertTaskManagerPermission).not.toHaveBeenCalled();
    });

    it('读取任务处理器选项时，无创建权限且无可见任务应拒绝', async () => {
        mockProjectionAuthzReadService.checkTaskManagerPermissionFromReadModel.mockResolvedValue(false);
        mockProjectionAuthzReadService.getVisibleTaskIdsByUserId.mockResolvedValue([]);
        mockSpiceDbAuthorizationService.assertTaskManagerPermission.mockRejectedValue(new Error('permission denied'));

        await expect(service.getTaskHandlers('actor-1')).rejects.toThrow('permission denied');

        expect(mockSpiceDbAuthorizationService.assertTaskManagerPermission).toHaveBeenCalledWith('create', 'actor-1');
    });

    it('手动执行任务成功时应调用 Handler 并写入成功日志', async () => {
        const task = createTaskRecord({
            params: ['file-1', 2]
        });
        const result = {
            cleared: 2
        };
        mockPrismaService.task.findUnique.mockResolvedValue(task);
        mockClearChunksTaskService.clearMergeFilesChunksTask.mockResolvedValue(result);

        await expect(service.runTask(task.id, 'actor-1')).resolves.toEqual(result);

        expect(mockSpiceDbAuthorizationService.assertTaskPermission).toHaveBeenCalledWith(task.id, 'run', 'actor-1');
        expect(mockClearChunksTaskService.clearMergeFilesChunksTask).toHaveBeenCalledWith('file-1', 2);
        expect(mockPrismaService.taskLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                taskId: task.id,
                status: TaskLogStatus.SUCCESS,
                log: JSON.stringify(result),
                triggeredBy: 'MANUAL',
                actorId: 'actor-1',
                error: null
            })
        });
        expect(mockPrismaService.task.update).toHaveBeenCalledWith({
            where: {
                id: task.id
            },
            data: expect.objectContaining({
                lastStatus: TaskLogStatus.SUCCESS,
                lastMessage: JSON.stringify(result)
            })
        });
    });

    it('手动执行任务失败时应写入失败日志并抛任务执行失败', async () => {
        const task = createTaskRecord();
        mockPrismaService.task.findUnique.mockResolvedValue(task);
        mockClearChunksTaskService.clearMergeFilesChunksTask.mockRejectedValue(new Error('boom'));

        await expect(service.runTask(task.id, 'actor-1')).rejects.toMatchObject({
            bizCode: ErrorCodes.TASK.RUN_FAILED.code
        });

        expect(mockSpiceDbAuthorizationService.assertTaskPermission).toHaveBeenCalledWith(task.id, 'run', 'actor-1');
        expect(mockPrismaService.taskLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                taskId: task.id,
                status: TaskLogStatus.FAILED,
                log: 'boom',
                triggeredBy: 'MANUAL',
                actorId: 'actor-1',
                error: expect.stringContaining('boom')
            })
        });
        expect(mockPrismaService.task.update).toHaveBeenCalledWith({
            where: {
                id: task.id
            },
            data: expect.objectContaining({
                lastStatus: TaskLogStatus.FAILED,
                lastMessage: 'boom'
            })
        });
    });

    it('删除任务时，应同步清理对象例外授权、任务基础关系和任务日志', async () => {
        const task = createTaskRecord();
        mockPrismaService.task.findFirst.mockResolvedValue(task);
        mockPrismaService.taskLog.deleteMany.mockResolvedValue({ count: 2 });
        mockPrismaService.task.delete.mockResolvedValue(task);

        await expect(service.deleteTask(task.id, 'actor-1')).resolves.toBeNull();

        expect(mockSpiceDbAuthorizationService.assertTaskPermission).toHaveBeenCalledWith(task.id, 'delete', 'actor-1');
        expect(mockAuthzObjectExceptionService.cleanupDeletedResource).toHaveBeenCalledWith('task', String(task.id));
        expect(mockSpiceDbAuthorizationService.cleanupTask).toHaveBeenCalledWith(task.id);
        expect(mockPrismaService.taskLog.deleteMany).toHaveBeenCalledWith({
            where: {
                taskId: task.id
            }
        });
        expect(mockPrismaService.task.delete).toHaveBeenCalledWith({
            where: {
                id: task.id
            }
        });
    });
});
