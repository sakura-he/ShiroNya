import { AuditLog } from '@app/common';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { TaskStatus, TaskStrategy } from '@app/prisma-app/generated/client';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import {
    CreateTaskDto,
    CreateTaskSchema,
    DeleteTaskDto,
    DeleteTaskSchema,
    QueryTaskListDto,
    QueryTaskListSchema,
    QueryTaskLogListDto,
    QueryTaskLogListSchema,
    RunTaskDto,
    RunTaskSchema,
    TaskListDto,
    TaskLogListDto,
    TaskNullDto,
    TaskOptionListDto,
    TaskRecordDto,
    TaskRuntimeDto,
    TaskRuntimeListDto,
    UpdateTaskDto,
    UpdateTaskSchema,
    UpdateTaskStatusDto,
    UpdateTaskStatusSchema
} from './dto/task.dto';
import { SystemTasksService } from './tasks.service';

/**
 * 任务控制器，所有写操作都绑定当前登录后台用户。
 */
@ApiTags('System/Task')
@RbacPermission('system.task.view')
@Controller('system/task')
export class SystemTasksController {
    constructor(private readonly taskService: SystemTasksService) {}

    /**
     * 返回任务状态选项。
     */
    @ApiBearerAuth('bearer')
    @Get('get_task_status_option')
    @ApiOkResByZod({ summary: '获取任务状态选项', type: TaskOptionListDto })
    async getTaskStatus() {
        return [
            {
                label: '启用',
                value: TaskStatus.ENABLE,
                isEnabled: true
            },
            {
                label: '禁用',
                value: TaskStatus.DISABLE,
                isEnabled: false
            }
        ];
    }

    /**
     * 返回任务执行策略选项。
     */
    @ApiBearerAuth('bearer')
    @Get('get_task_strategy_option')
    @ApiOkResByZod({ summary: '获取任务执行策略选项', type: TaskOptionListDto })
    async getTaskStrategy() {
        return [
            {
                label: '手动执行',
                value: TaskStrategy.MANUAL
            },
            {
                label: '自动执行',
                value: TaskStrategy.AUTO
            },
            {
                label: '执行一次',
                value: TaskStrategy.ONCE_AUTO
            }
        ];
    }

    /**
     * 返回当前可用任务处理器选项。
     */
    @ApiBearerAuth('bearer')
    @Get('get_task_handler_option')
    @ApiOkResByZod({ summary: '获取任务处理器选项', type: TaskOptionListDto })
    async getTaskHandlers(@Session() session: BetterAuthSession) {
        return await this.taskService.getTaskHandlers(session.user.id);
    }

    /**
     * 创建新任务并立即注册到调度器。
     */
    @ApiBearerAuth('bearer')
    @Post('create_task')
    @ApiOkResByZod({ summary: '创建任务', type: TaskRecordDto })
    @AuditLog({ module: 'system_task', action: 'create_task', summary: '创建任务', resourceType: 'task' })
    async createTask(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(CreateTaskSchema)) task: CreateTaskDto
    ) {
        return await this.taskService.createTask(session.user.id, task);
    }

    /**
     * 更新任务配置。
     */
    @ApiBearerAuth('bearer')
    @Post('update_task')
    @ApiOkResByZod({ summary: '更新任务', type: TaskRecordDto })
    @AuditLog({
        module: 'system_task',
        action: 'update_task',
        summary: '更新任务',
        resourceType: 'task',
        resourceIdPath: 'body.id'
    })
    async updateTask(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(UpdateTaskSchema)) task: UpdateTaskDto
    ) {
        return await this.taskService.updateTask(task, session.user.id);
    }

    /**
     * 删除指定任务。
     */
    @ApiBearerAuth('bearer')
    @Post('delete_task')
    @ApiOkResByZod({ summary: '删除任务', type: TaskNullDto })
    @AuditLog({
        module: 'system_task',
        action: 'delete_task',
        summary: '删除任务',
        resourceType: 'task',
        resourceIdPath: 'body.id'
    })
    async deleteTask(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(DeleteTaskSchema)) task: DeleteTaskDto
    ) {
        return await this.taskService.deleteTask(task.id, session.user.id);
    }

    /**
     * 更新任务启停状态。
     */
    @ApiBearerAuth('bearer')
    @Post('update_task_status')
    @ApiOkResByZod({ summary: '更新任务状态', type: TaskNullDto })
    @AuditLog({
        module: 'system_task',
        action: 'update_task_status',
        summary: '更新任务状态',
        resourceType: 'task',
        resourceIdPath: 'body.id'
    })
    async updateTaskStatus(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(UpdateTaskStatusSchema)) task: UpdateTaskStatusDto
    ) {
        await this.taskService.switchJobStatus(task.id, task.status as TaskStatus, session.user.id);
        return null;
    }

    /**
     * 分页获取任务列表。
     */
    @ApiBearerAuth('bearer')
    @Post('query_task_list')
    @ApiOkResByZod({ summary: '分页获取任务列表', type: TaskListDto })
    async getTaskList(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(QueryTaskListSchema)) query: QueryTaskListDto
    ) {
        return await this.taskService.getTaskList(query, session.user.id);
    }

    /**
     * 分页获取任务执行日志。
     */
    @ApiBearerAuth('bearer')
    @Post('query_task_log_list')
    @ApiOkResByZod({ summary: '分页获取任务执行日志', type: TaskLogListDto })
    async getTaskLogList(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(QueryTaskLogListSchema)) query: QueryTaskLogListDto
    ) {
        return await this.taskService.getTaskLogList(query, session.user.id);
    }

    /**
     * 查询所有定时任务的运行状态。
     */
    @ApiBearerAuth('bearer')
    @Get('get_all_job_status')
    @ApiOkResByZod({ summary: '查询所有定时任务运行状态', type: TaskRuntimeListDto })
    async getAllJobStatus(@Session() session: BetterAuthSession) {
        return await this.taskService.getAllJobStatus(session.user.id);
    }

    /**
     * 查询指定任务的运行状态。
     */
    @ApiBearerAuth('bearer')
    @Get('get_job_status')
    @ApiOkResByZod({ summary: '查询指定任务运行状态', type: TaskRuntimeDto })
    async getJobStatus(@Session() session: BetterAuthSession, @Query('name') name: string) {
        return await this.taskService.getJobStatus(name, session.user.id);
    }

    /**
     * 手动执行一次指定任务。
     */
    @ApiBearerAuth('bearer')
    @Post('run_task')
    @ApiOkResByZod({ summary: '手动执行一次任务', type: TaskNullDto })
    @AuditLog({
        module: 'system_task',
        action: 'run_task',
        summary: '执行任务',
        resourceType: 'task',
        resourceIdPath: 'body.id'
    })
    async runTask(@Session() session: BetterAuthSession, @Body(new ZodValidationPipe(RunTaskSchema)) task: RunTaskDto) {
        await this.taskService.runTask(task.id, session.user.id);
        return null;
    }
}
