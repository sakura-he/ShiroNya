import { BusinessException, createRuntimeLogger, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma, Task, TaskLogStatus, TaskStatus, TaskStrategy } from '@app/prisma-admin/generated/client';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, type CronJobParams, validateCronExpression } from 'cron';
import dayjs from 'dayjs';
import { ClearChunksTaskService } from '../../../tasks/clear_chunks_task';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import {
    AdminSpiceDbAuthorizationService,
    type TaskPermission
} from '../../spicedb/admin-spicedb-authorization.service';
import { ProjectionAuthzReadService } from '../../spicedb-projection/projection-authz-read.service';
import { QueryTaskListDto, QueryTaskLogListDto, TaskDto, UpdateTaskDto } from './dto/task.dto';

type TaskHandler = (...params: unknown[]) => unknown | Promise<unknown>;

type TaskRunTrigger = {
    source: 'SCHEDULE' | 'MANUAL' | 'ONCE_AUTO';
    actorId?: string;
};

type CronTaskOptions = {
    timeZone?: string;
    utcOffset?: number;
    waitForCompletion?: boolean;
    unrefTimeout?: boolean;
    threshold?: number;
};

type TaskRuntimeView = {
    name: string;
    isRunning: boolean;
    isCallbackRunning: boolean;
    next: string | null;
    last: Date | null;
    prev: Array<string | null>;
};

type TaskListRecord = Task & {
    runtime: TaskRuntimeView | null;
    nextRunAt: string | null;
};

/**
 * 定时任务服务，负责任务持久化、CronJob 生命周期和执行日志。
 */
@Injectable()
export class SystemTasksService implements OnModuleInit {
    private readonly logger = createRuntimeLogger(SystemTasksService.name, {
        module: 'task',
        domain: 'task',
        resource: { type: 'task' }
    });
    private readonly handlers = new Map<string, TaskHandler>();

    /**
     * 注入任务持久化、调度器、任务处理器和对象级 AuthZ 依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly schedulerRegistry: SchedulerRegistry,
        private readonly clearChunksTaskService: ClearChunksTaskService,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        private readonly projectionAuthzReadService: ProjectionAuthzReadService,
        private readonly authzObjectExceptionService: AuthzObjectExceptionService
    ) {
        this.handlers.set('ClearMergeFilesChunksTask', this.clearChunksTaskService.clearMergeFilesChunksTask);
    }

    /**
     * 模块启动后从数据库恢复已配置任务，保证进程重启后 ENABLE 任务继续生效。
     */
    async onModuleInit() {
        await this.restoreCronJobs();
    }

    /**
     * 分页获取任务列表，并带上调度器状态和当前用户对本页任务的按钮能力。
     */
    async getTaskList(query: QueryTaskListDto, actorId: string) {
        const where = await this.buildAuthorizedTaskListWhere(query, actorId);
        if (query.runtimeStatus) {
            return await this.getRuntimeFilteredTaskList(query, where, actorId);
        }

        const [records, pagination] = await this.prismaService.task.findManyAndCount({
            take: query.pageSize,
            skip: this.buildTaskListSkip(query),
            where,
            orderBy: {
                createdAt: 'desc'
            }
        });
        const runtimeRecords = records.map((record) => this.withRuntimeStatus(record));

        return {
            records: await this.attachViewerTaskCapabilities(runtimeRecords, actorId),
            meta: await this.buildTaskListMeta(actorId),
            pagination
        };
    }

    /**
     * 分页查询任务执行日志。
     */
    async getTaskLogList(query: QueryTaskLogListDto, actorId: string) {
        const taskIdFilter = await this.buildAuthorizedTaskLogTaskIdFilter(query.taskId, actorId);
        const [records, pagination] = await this.prismaService.taskLog.findManyAndCount({
            take: query.pageSize,
            skip: (query.page - 1) * query.pageSize,
            where: {
                taskId: taskIdFilter,
                status: query.status as TaskLogStatus | undefined
            },
            include: {
                task: {
                    select: {
                        id: true,
                        name: true,
                        handler: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return {
            records,
            pagination
        };
    }

    /**
     * 返回当前已注册任务处理器列表，供可进入任务模块的用户筛选或编辑配置。
     */
    async getTaskHandlers(actorId: string) {
        await this.spiceDbAuthorizationService.upsertTaskManagerBase();
        await this.assertCanReadTaskHandlerOptions(actorId);
        return [...this.handlers.keys()].map((name) => ({
            label: name,
            value: name
        }));
    }

    /**
     * 手动执行一次指定任务，并记录执行日志。
     */
    async runTask(taskId: number, actorId: string) {
        const task = await this.getTaskOrThrow(taskId);
        await this.assertTaskPermission(task.id, 'run', actorId);
        return await this.executeTask(task, {
            source: 'MANUAL',
            actorId
        });
    }

    /**
     * 获取指定任务的当前运行状态。
     */
    async getJobStatus(name: string | undefined, actorId: string) {
        if (!name) {
            return null;
        }

        const task = await this.prismaService.task.findUnique({
            where: {
                name
            },
            select: {
                id: true
            }
        });
        if (!task) {
            return null;
        }

        await this.assertTaskPermission(task.id, 'view', actorId);
        return this.buildRegisteredJobStatus(name);
    }

    /**
     * 获取全部任务的当前运行状态。
     */
    async getAllJobStatus(actorId: string) {
        const visibleTaskIds = await this.projectionAuthzReadService.getVisibleTaskIdsByUserId(actorId);
        if (visibleTaskIds.length === 0) {
            return [];
        }
        const visibleTasks = await this.prismaService.task.findMany({
            where: {
                id: {
                    in: visibleTaskIds
                }
            },
            select: {
                name: true
            }
        });
        const visibleTaskNames = new Set(visibleTasks.map((task) => task.name));
        const jobs: ReturnType<typeof this.buildJobStatus>[] = [];
        this.schedulerRegistry.getCronJobs().forEach((value, key) => {
            if (!visibleTaskNames.has(key)) {
                return;
            }
            jobs.push(this.buildJobStatus(key, value));
        });
        return jobs;
    }

    /**
     * 创建新的定时任务，并只写入任务对象基础关系，具体角色绑定交给独立 AuthZ 策略维护。
     */
    async createTask(userId: string, task: TaskDto) {
        this.validateTaskConfig(task);
        await this.spiceDbAuthorizationService.upsertTaskManagerBase();
        await this.spiceDbAuthorizationService.assertTaskManagerPermission('create', userId);
        await this.ensureTaskNameAvailable(task.name);
        const taskData = await this.prismaService.task.create({
            data: {
                userId,
                ...this.toTaskCreateData(task)
            }
        });

        try {
            await this.spiceDbAuthorizationService.upsertTaskBase(taskData.id, userId);
            this.registerCronJob(taskData);
        } catch (error) {
            await this.rollbackCreatedTask(taskData.id, error);
            throw error;
        }
        return this.withRuntimeStatus(taskData);
    }

    /**
     * 更新定时任务配置，并在新配置可注册后替换现有 CronJob。
     */
    async updateTask(task: UpdateTaskDto, actorId: string) {
        const { id, ...rest } = task;
        const oldTaskData = await this.getTaskOrThrow(id);
        await this.assertTaskPermission(oldTaskData.id, 'update', actorId);
        const nextTaskData = {
            ...oldTaskData,
            ...rest
        };
        this.validateTaskConfig(nextTaskData);
        await this.ensureTaskNameAvailable(nextTaskData.name, id);

        const newJob = this.createCronJob(nextTaskData);
        const oldJob = this.getRegisteredCronJob(oldTaskData.name);

        const taskData = await this.prismaService.task.update({
            where: { id },
            data: this.toTaskUpdateData(rest)
        });

        this.replaceCronJob(oldTaskData.name, taskData, newJob, oldJob);
        return this.withRuntimeStatus(taskData);
    }

    /**
     * 删除指定任务，并从调度器移除。
     */
    async deleteTask(id: number, actorId: string) {
        const task = await this.prismaService.task.findFirst({
            where: {
                id
            }
        });
        if (!task) {
            throw new BusinessException(ErrorCodes.TASK.NOT_FOUND);
        }

        await this.assertTaskPermission(task.id, 'delete', actorId);
        await this.authzObjectExceptionService.cleanupDeletedResource('task', String(task.id));
        await this.spiceDbAuthorizationService.cleanupTask(task.id);
        await this.prismaService.taskLog.deleteMany({
            where: {
                taskId: task.id
            }
        });
        await this.prismaService.task.delete({
            where: {
                id: task.id
            }
        });
        this.deleteCronJobIfExists(task.name);
        return null;
    }

    /**
     * 切换任务启停状态，并同步更新数据库状态字段。
     */
    async switchJobStatus(taskId: number, status: TaskStatus, actorId: string) {
        const task = await this.getTaskOrThrow(taskId);
        await this.assertTaskPermission(task.id, 'update', actorId);
        const job = this.getRegisteredCronJob(task.name) ?? this.registerCronJob(task);

        if (status === TaskStatus.ENABLE && task.strategy !== TaskStrategy.MANUAL) {
            job.start();
        } else {
            await Promise.resolve(job.stop());
        }

        await this.prismaService.task.update({
            where: {
                id: taskId
            },
            data: {
                status
            }
        });
    }

    /**
     * 校验指定的任务处理器是否已注册。
     */
    hasCronHandler(handlerName: string) {
        if (this.handlers.has(handlerName)) {
            return true;
        }
        throw new BusinessException(ErrorCodes.TASK.HANDLER_NOT_FOUND, {
            handlerName
        });
    }

    /**
     * 构造任务列表数据库筛选条件。
     */
    private buildTaskListWhere(query: QueryTaskListDto): Prisma.TaskWhereInput {
        return {
            name: query.name
                ? {
                      contains: query.name
                  }
                : undefined,
            cron: query.cron
                ? {
                      contains: query.cron
                  }
                : undefined,
            handler: query.handler
                ? {
                      contains: query.handler
                  }
                : undefined,
            strategy: query.strategy as TaskStrategy | undefined,
            status: query.status as TaskStatus | undefined,
            lastStatus: this.buildLastStatusFilter(query.lastStatus),
            createdAt: query.createdAt ? this.buildDateRangeFilter(query.createdAt) : undefined,
            lastFinishedAt: query.lastFinishedAt ? this.buildDateRangeFilter(query.lastFinishedAt) : undefined
        };
    }

    /**
     * 校验用户是否可读取任务处理器选项，避免无任务权限用户枚举内部 handler。
     */
    private async assertCanReadTaskHandlerOptions(actorId: string): Promise<void> {
        const canCreate = await this.projectionAuthzReadService.checkTaskManagerPermissionFromReadModel(
            'create',
            actorId
        );
        if (canCreate) {
            return;
        }

        const visibleTaskIds = await this.projectionAuthzReadService.getVisibleTaskIdsByUserId(actorId);
        if (visibleTaskIds.length > 0) {
            return;
        }

        // 既不能创建任务、也没有任何可见任务时，不允许读取 handler 清单。
        await this.spiceDbAuthorizationService.assertTaskManagerPermission('create', actorId);
    }

    /**
     * 构造带对象级 AuthZ 限制的任务列表筛选条件。
     */
    private async buildAuthorizedTaskListWhere(
        query: QueryTaskListDto,
        actorId: string
    ): Promise<Prisma.TaskWhereInput> {
        const visibleTaskIds = await this.projectionAuthzReadService.getVisibleTaskIdsByUserId(actorId);
        return {
            ...this.buildTaskListWhere(query),
            id: {
                in: visibleTaskIds
            }
        };
    }

    /**
     * 构造任务日志查询的任务 ID 过滤条件，并在指定 taskId 时先做对象级校验。
     */
    private async buildAuthorizedTaskLogTaskIdFilter(taskId: number | undefined, actorId: string) {
        if (taskId) {
            await this.assertTaskPermission(taskId, 'view', actorId);
            return taskId;
        }

        return {
            in: await this.projectionAuthzReadService.getVisibleTaskIdsByUserId(actorId)
        };
    }

    /**
     * 构造任务列表分页偏移量。
     */
    private buildTaskListSkip(query: Pick<QueryTaskListDto, 'page' | 'pageSize'>) {
        return query.page && query.pageSize ? (query.page - 1) * query.pageSize : undefined;
    }

    /**
     * 构造最近执行状态筛选，支持筛出从未执行过的任务。
     */
    private buildLastStatusFilter(lastStatus?: TaskLogStatus | 'NONE') {
        if (lastStatus === 'NONE') {
            return null;
        }
        return lastStatus as TaskLogStatus | undefined;
    }

    /**
     * 按调度器运行态过滤任务列表，并重新计算分页信息。
     */
    private async getRuntimeFilteredTaskList(query: QueryTaskListDto, where: Prisma.TaskWhereInput, actorId: string) {
        const records = await this.prismaService.task.findMany({
            where,
            orderBy: {
                createdAt: 'desc'
            }
        });
        const runtimeRecords = records
            .map((record) => this.withRuntimeStatus(record))
            .filter((record) => this.matchRuntimeStatus(record, query.runtimeStatus));
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? runtimeRecords.length;
        const pagedRecords = query.pageSize
            ? runtimeRecords.slice((page - 1) * pageSize, page * pageSize)
            : runtimeRecords;

        return {
            records: await this.attachViewerTaskCapabilities(pagedRecords, actorId),
            meta: await this.buildTaskListMeta(actorId),
            pagination: {
                total: runtimeRecords.length,
                totalPages: pageSize ? Math.ceil(runtimeRecords.length / pageSize) : 0,
                pageSize,
                page
            }
        };
    }

    /**
     * 为当前页任务批量合并 update/delete/run/view 能力，避免前端逐按钮请求权限。
     */
    private async attachViewerTaskCapabilities(records: TaskListRecord[], actorId: string) {
        if (records.length === 0) {
            return records.map((record) => this.withViewerTaskCapabilities(record));
        }

        const taskPermissions = await this.projectionAuthzReadService.checkTaskPermissionsFromReadModel(
            records.map((record) => record.id),
            ['update', 'delete', 'run', 'view'],
            actorId
        );
        const permissionIndex = new Map(taskPermissions.map((item) => [item.taskId, item.permissions]));

        return records.map((record) => {
            const permissions = permissionIndex.get(record.id) ?? {};
            return this.withViewerTaskCapabilities(record, {
                viewerCanUpdate: permissions.update === true,
                viewerCanDelete: permissions.delete === true,
                viewerCanRun: permissions.run === true,
                viewerCanViewLog: permissions.view === true
            });
        });
    }

    /**
     * 为单条任务记录补充 viewerCan 字段，缺失权限时统一视为不可操作。
     */
    private withViewerTaskCapabilities(
        record: TaskListRecord,
        capabilities: {
            viewerCanUpdate?: boolean;
            viewerCanDelete?: boolean;
            viewerCanRun?: boolean;
            viewerCanViewLog?: boolean;
        } = {}
    ) {
        return {
            ...record,
            viewerCanUpdate: capabilities.viewerCanUpdate === true,
            viewerCanDelete: capabilities.viewerCanDelete === true,
            viewerCanRun: capabilities.viewerCanRun === true,
            viewerCanViewLog: capabilities.viewerCanViewLog === true
        };
    }

    /**
     * 构造任务列表元信息，当前只包含任务管理资源的创建权限。
     */
    private async buildTaskListMeta(actorId: string) {
        return {
            viewerCanCreateTask: await this.projectionAuthzReadService.checkTaskManagerPermissionFromReadModel(
                'create',
                actorId
            )
        };
    }

    /**
     * 判断任务运行态是否匹配筛选条件。
     */
    private matchRuntimeStatus(record: ReturnType<typeof this.withRuntimeStatus>, runtimeStatus?: string) {
        if (!runtimeStatus) {
            return true;
        }
        const isRunning = Boolean(record.runtime?.isRunning);
        return runtimeStatus === 'RUNNING' ? isRunning : !isRunning;
    }

    /**
     * 校验任务名称唯一，避免数据库唯一键和 CronJob 注册名冲突。
     */
    private async ensureTaskNameAvailable(name: string, excludeId?: number) {
        const existingTask = await this.prismaService.task.findFirst({
            where: {
                name,
                id: excludeId
                    ? {
                          not: excludeId
                      }
                    : undefined
            },
            select: {
                id: true
            }
        });
        if (existingTask) {
            throw new BusinessException(ErrorCodes.TASK.NAME_ALREADY_EXISTS, {
                taskName: name
            });
        }
    }

    /**
     * 从数据库恢复任务到进程内调度器。
     */
    private async restoreCronJobs() {
        const tasks = await this.prismaService.task.findMany({
            orderBy: {
                id: 'asc'
            }
        });
        let registeredCount = 0;

        for (const task of tasks) {
            try {
                this.registerCronJob(task);
                registeredCount += 1;
            } catch (error) {
                await this.recordRestoreFailure(task, error);
                // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查恢复失败的根因
                this.logger.error('恢复定时任务失败', {
                    taskId: task.id,
                    taskName: task.name,
                    error
                });
            }
        }

        this.logger.info.title('定时任务恢复完成', {
            total: tasks.length,
            registered: registeredCount
        });
    }

    /**
     * 根据任务配置创建并注册 CronJob 实例。
     */
    private registerCronJob(task: Task) {
        this.deleteCronJobIfExists(task.name);
        const job = this.createCronJob(task);
        this.schedulerRegistry.addCronJob(task.name, job);

        if (task.status === TaskStatus.ENABLE && task.strategy === TaskStrategy.ONCE_AUTO) {
            void this.safeHandleScheduledTick(task.id, task.strategy);
        } else if (this.shouldAutoStart(task)) {
            job.start();
        }
        return job;
    }

    /**
     * 回滚任务创建失败后的数据库记录和 SpiceDB task 关系。
     */
    private async rollbackCreatedTask(taskId: number, cause: unknown): Promise<void> {
        try {
            await this.spiceDbAuthorizationService.cleanupTask(taskId);
        } catch (cleanupError) {
            // 保留完整 detail 调用：cleanupError / cause 含 error stack，便于追溯回滚失败链路
            this.logger.warn('回滚任务 AuthZ 关系失败', {
                taskId,
                cleanupError,
                cause
            });
        }
        await this.prismaService.task.delete({
            where: {
                id: taskId
            }
        });
    }

    /**
     * 根据任务配置创建 CronJob，但不立即注册到调度器。
     */
    private createCronJob(
        task: Pick<Task, 'id' | 'name' | 'cron' | 'handler' | 'strategy' | 'status' | 'params' | 'options'>
    ) {
        const { cron, strategy, name } = task;
        const options = this.normalizeCronOptions(task.options);

        const jobParams = {
            cronTime: cron,
            onTick: () => {
                void this.safeHandleScheduledTick(task.id, strategy);
            },
            start: false,
            runOnInit: false,
            waitForCompletion: options.waitForCompletion ?? false,
            unrefTimeout: options.unrefTimeout,
            threshold: options.threshold,
            name
        } satisfies CronJobParams<null, null>;

        if (options.timeZone) {
            return CronJob.from({
                ...jobParams,
                timeZone: options.timeZone
            });
        }

        if (options.utcOffset !== undefined) {
            return CronJob.from({
                ...jobParams,
                utcOffset: options.utcOffset
            });
        }

        return CronJob.from(jobParams);
    }

    /**
     * 安全处理调度器触发，避免自动任务失败产生未处理 Promise。
     */
    private async safeHandleScheduledTick(taskId: number, strategy: TaskStrategy) {
        try {
            await this.handleScheduledTick(taskId, strategy);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查定时任务执行失败
            this.logger.error('定时任务执行失败', {
                taskId,
                strategy,
                error
            });
        }
    }

    /**
     * 处理调度器触发，执行前重新读取数据库任务配置，避免闭包内配置继续运行。
     */
    private async handleScheduledTick(taskId: number, strategy: TaskStrategy) {
        const task = await this.prismaService.task.findUnique({
            where: {
                id: taskId
            }
        });
        if (!task || task.status !== TaskStatus.ENABLE) {
            return;
        }

        if (strategy !== TaskStrategy.AUTO) {
            const job = this.getRegisteredCronJob(task.name);
            if (job) {
                await Promise.resolve(job.stop());
            }
            await this.prismaService.task.update({
                where: {
                    id: task.id
                },
                data: {
                    status: TaskStatus.DISABLE
                }
            });
        }

        await this.executeTask(task, {
            source: strategy === TaskStrategy.ONCE_AUTO ? 'ONCE_AUTO' : 'SCHEDULE'
        });
    }

    /**
     * 执行任务处理器，并记录成功或失败日志。
     */
    private async executeTask(task: Task, trigger: TaskRunTrigger) {
        const handler = this.handlers.get(task.handler);
        if (!handler) {
            throw new BusinessException(ErrorCodes.TASK.HANDLER_NOT_FOUND, {
                handlerName: task.handler
            });
        }

        const startedAt = new Date();
        try {
            const result = await handler(...this.normalizeTaskParams(task.params));
            await this.recordTaskRun(task, {
                status: TaskLogStatus.SUCCESS,
                trigger,
                startedAt,
                message: this.buildSuccessMessage(result)
            });
            return result ?? null;
        } catch (error) {
            await this.recordTaskRun(task, {
                status: TaskLogStatus.FAILED,
                trigger,
                startedAt,
                message: this.getErrorMessage(error),
                error: this.getErrorStack(error)
            });
            throw new BusinessException(ErrorCodes.TASK.RUN_FAILED, {
                taskId: task.id,
                taskName: task.name,
                error: this.getErrorMessage(error)
            });
        }
    }

    /**
     * 记录单次任务执行结果，并回写任务最近运行摘要。
     */
    private async recordTaskRun(
        task: Task,
        input: {
            status: TaskLogStatus;
            trigger: TaskRunTrigger;
            startedAt: Date;
            message?: string | null;
            error?: string | null;
        }
    ) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - input.startedAt.getTime();
        const message = input.message ? input.message.slice(0, 500) : null;

        await this.prismaService.$transaction([
            this.prismaService.taskLog.create({
                data: {
                    taskId: task.id,
                    status: input.status,
                    log: message,
                    triggeredBy: input.trigger.source,
                    actorId: input.trigger.actorId,
                    error: input.error ?? null,
                    startedAt: input.startedAt,
                    finishedAt,
                    durationMs
                }
            }),
            this.prismaService.task.update({
                where: {
                    id: task.id
                },
                data: {
                    lastStatus: input.status,
                    lastMessage: message,
                    lastStartedAt: input.startedAt,
                    lastFinishedAt: finishedAt,
                    lastDurationMs: durationMs
                }
            })
        ]);
    }

    /**
     * 记录启动恢复失败，帮助管理员在日志页定位坏配置。
     */
    private async recordRestoreFailure(task: Task, error: unknown) {
        const now = new Date();
        const message = `任务恢复失败: ${this.getErrorMessage(error)}`.slice(0, 500);
        await this.prismaService.taskLog.create({
            data: {
                taskId: task.id,
                status: TaskLogStatus.FAILED,
                log: message,
                triggeredBy: 'RESTORE',
                error: this.getErrorStack(error),
                startedAt: now,
                finishedAt: now,
                durationMs: 0
            }
        });
    }

    /**
     * 将请求 DTO 转换为 Prisma 创建载荷。
     */
    private toTaskCreateData(task: TaskDto): Omit<Prisma.TaskUncheckedCreateInput, 'userId'> {
        return {
            name: task.name,
            cron: task.cron,
            handler: task.handler,
            remark: task.remark ?? null,
            options: this.toPrismaJson(task.options),
            params: this.toPrismaJson(task.params),
            strategy: task.strategy as TaskStrategy,
            status: task.status as TaskStatus
        };
    }

    /**
     * 将请求 DTO 转换为 Prisma 更新载荷，避免把 undefined 写入数据库。
     */
    private toTaskUpdateData(task: Omit<UpdateTaskDto, 'id'>): Prisma.TaskUncheckedUpdateInput {
        const data: Prisma.TaskUncheckedUpdateInput = {};

        if (task.name !== undefined) data.name = task.name;
        if (task.cron !== undefined) data.cron = task.cron;
        if (task.handler !== undefined) data.handler = task.handler;
        if (task.remark !== undefined) data.remark = task.remark;
        if (task.options !== undefined) data.options = this.toPrismaJson(task.options);
        if (task.params !== undefined) data.params = this.toPrismaJson(task.params);
        if (task.strategy !== undefined) data.strategy = task.strategy as TaskStrategy;
        if (task.status !== undefined) data.status = task.status as TaskStatus;

        return data;
    }

    /**
     * 校验任务配置中 handler、cron 和策略组合是否可运行。
     */
    private validateTaskConfig(task: Pick<Task, 'handler' | 'cron' | 'strategy' | 'status'> | TaskDto) {
        this.hasCronHandler(task.handler);
        const result = validateCronExpression(task.cron);
        if (!result.valid) {
            throw new BusinessException(ErrorCodes.TASK.INVALID_CRON, {
                cron: task.cron,
                error: result.error?.message
            });
        }
    }

    /**
     * 判断任务是否应在注册后启动。
     */
    private shouldAutoStart(task: Pick<Task, 'status' | 'strategy'>) {
        return task.status === TaskStatus.ENABLE && task.strategy === TaskStrategy.AUTO;
    }

    /**
     * 替换调度器中的 CronJob，失败时尽量恢复现有任务。
     */
    private replaceCronJob(oldName: string, taskData: Task, newJob: CronJob, oldJob?: CronJob) {
        this.deleteCronJobIfExists(oldName);

        try {
            this.schedulerRegistry.addCronJob(taskData.name, newJob);
            if (taskData.status === TaskStatus.ENABLE && taskData.strategy === TaskStrategy.ONCE_AUTO) {
                void this.safeHandleScheduledTick(taskData.id, taskData.strategy);
            } else if (this.shouldAutoStart(taskData)) {
                newJob.start();
            }
        } catch (error) {
            if (oldJob) {
                this.schedulerRegistry.addCronJob(oldName, oldJob);
            }
            throw error;
        }
    }

    /**
     * 按任务 ID 查询任务，不存在时抛业务异常。
     */
    private async getTaskOrThrow(id: number) {
        const task = await this.prismaService.task.findUnique({
            where: {
                id
            }
        });
        if (!task) {
            throw new BusinessException(ErrorCodes.TASK.NOT_FOUND);
        }
        return task;
    }

    /**
     * 获取已注册 CronJob，不存在时返回 undefined。
     */
    private getRegisteredCronJob(name: string) {
        if (!this.schedulerRegistry.doesExist('cron', name)) {
            return undefined;
        }
        return this.schedulerRegistry.getCronJob(name);
    }

    /**
     * 幂等删除已注册 CronJob，避免未注册任务删除时报 500。
     */
    private deleteCronJobIfExists(name: string) {
        if (this.schedulerRegistry.doesExist('cron', name)) {
            this.schedulerRegistry.deleteCronJob(name);
        }
    }

    /**
     * 为任务记录补充调度器运行态。
     */
    private withRuntimeStatus(task: Task) {
        return {
            ...task,
            runtime: this.buildRegisteredJobStatus(task.name),
            nextRunAt: this.getNextRunAt(task.name)
        };
    }

    /**
     * 从调度器读取指定任务运行态，不包含对象级权限判断。
     */
    private buildRegisteredJobStatus(name?: string) {
        if (!name || !this.schedulerRegistry.doesExist('cron', name)) {
            return null;
        }

        const job = this.schedulerRegistry.getCronJob(name);
        return this.buildJobStatus(name, job);
    }

    /**
     * 断言当前用户拥有指定任务对象权限。
     */
    private async assertTaskPermission(taskId: number, permission: TaskPermission, actorId: string): Promise<void> {
        await this.spiceDbAuthorizationService.assertTaskPermission(taskId, permission, actorId);
    }

    /**
     * 获取任务下一次运行时间；未注册或无下一次时间时返回 null。
     */
    private getNextRunAt(name: string) {
        const job = this.getRegisteredCronJob(name);
        if (!job) {
            return null;
        }

        try {
            return job.nextDate().toISO();
        } catch {
            return null;
        }
    }

    /**
     * 构造前端可读的 CronJob 运行态。
     */
    private buildJobStatus(name: string, job: CronJob) {
        return {
            name,
            isRunning: job.isActive,
            isCallbackRunning: job.isCallbackRunning,
            next: job.nextDate().toISO(),
            last: job.lastDate(),
            prev: job.nextDates().map((date) => date.toISO())
        };
    }

    /**
     * 把 DTO 中的 JSON 值转换为 Prisma 可写入的 JSON 值。
     */
    private toPrismaJson(value: unknown) {
        if (value === undefined || value === null) {
            return Prisma.JsonNull;
        }
        return value as Prisma.InputJsonValue;
    }

    /**
     * 规范化任务执行参数，数据库中必须是数组。
     */
    private normalizeTaskParams(params: unknown): unknown[] {
        if (Array.isArray(params)) {
            return params;
        }
        if (params === null || params === undefined) {
            return [];
        }
        throw new BusinessException(ErrorCodes.PARAM.INVALID, {
            reason: '任务参数必须是数组'
        });
    }

    /**
     * 规范化 Cron 运行选项，拒绝数据库中不可表达的函数配置。
     */
    private normalizeCronOptions(options: unknown): CronTaskOptions {
        if (options === null || options === undefined || typeof options !== 'object' || Array.isArray(options)) {
            return {};
        }
        return options as CronTaskOptions;
    }

    /**
     * 解析列表查询时间范围。
     */
    private buildDateRangeFilter(range: string[]) {
        return {
            gte: dayjs(range[0]).toDate(),
            lte: dayjs(range[1]).toDate()
        };
    }

    /**
     * 从处理器返回值生成成功日志摘要。
     */
    private buildSuccessMessage(result: unknown) {
        if (result === undefined || result === null) {
            return '任务执行成功';
        }
        if (typeof result === 'string') {
            return result;
        }
        try {
            return JSON.stringify(result);
        } catch {
            return '任务执行成功，结果无法序列化';
        }
    }

    /**
     * 提取错误消息。
     */
    private getErrorMessage(error: unknown) {
        return error instanceof Error ? error.message : String(error);
    }

    /**
     * 提取错误堆栈。
     */
    private getErrorStack(error: unknown) {
        if (error instanceof Error) {
            return error.stack ?? error.message;
        }
        return String(error);
    }
}
