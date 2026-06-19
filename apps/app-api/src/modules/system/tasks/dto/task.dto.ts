import { TaskLogStatus, TaskStatus, TaskStrategy } from '@app/prisma-app/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const TaskStatusSchema = z.enum(Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]]);
const TaskStrategySchema = z.enum(Object.values(TaskStrategy) as [TaskStrategy, ...TaskStrategy[]]);
const TaskLogStatusSchema = z.enum(Object.values(TaskLogStatus) as [TaskLogStatus, ...TaskLogStatus[]]);
const TaskRuntimeStatusSchema = z.enum(['RUNNING', 'STOPPED']);
const TaskDateRangeSchema = z.array(z.string().min(1)).length(2);

const TaskJsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(TaskJsonValueSchema),
        z.record(z.string(), TaskJsonValueSchema)
    ])
);

export const TaskOptionsSchema = z
    .object({
        timeZone: z.string().min(1).optional(),
        utcOffset: z.number().int().optional(),
        waitForCompletion: z.boolean().optional(),
        unrefTimeout: z.boolean().optional(),
        threshold: z.number().int().min(0).optional()
    })
    .strict();

const NullableJsonInputSchema = TaskJsonValueSchema.nullable().optional();

const TaskParamsSchema = NullableJsonInputSchema.refine(
    (value) => value === undefined || value === null || Array.isArray(value),
    {
        message: '任务参数必须是 JSON 数组'
    }
);

const TaskCreateOptionsSchema = NullableJsonInputSchema.pipe(TaskOptionsSchema.nullable().optional());

export const TaskSchema = z.object({
    name: z.string().trim().min(1),
    cron: z.string().trim().min(1),
    handler: z.string().trim().min(1),
    remark: z.string().trim().min(1).nullable().optional(),
    options: TaskCreateOptionsSchema,
    params: TaskParamsSchema,
    status: TaskStatusSchema,
    strategy: TaskStrategySchema
});
export class TaskDto extends createZodDto(TaskSchema) {}

export const CreateTaskSchema = TaskSchema;
export class CreateTaskDto extends createZodDto(CreateTaskSchema) {}

export const UpdateTaskSchema = TaskSchema.partial().extend({
    id: z.number().int().positive()
});
export class UpdateTaskDto extends createZodDto(UpdateTaskSchema) {}

export const DeleteTaskSchema = z.object({
    id: z.number().int().positive()
});
export class DeleteTaskDto extends createZodDto(DeleteTaskSchema) {}

export const UpdateTaskStatusSchema = z.object({
    id: z.number().int().positive(),
    status: TaskStatusSchema
});
export class UpdateTaskStatusDto extends createZodDto(UpdateTaskStatusSchema) {}

export const RunTaskSchema = z.object({
    id: z.number().int().positive()
});
export class RunTaskDto extends createZodDto(RunTaskSchema) {}

export const QueryTaskLogListSchema = z.object({
    taskId: z.number().int().positive().optional(),
    status: TaskLogStatusSchema.optional(),
    pageSize: z.number().int().min(1).max(100).default(10),
    page: z.number().int().min(1).default(1)
});
export class QueryTaskLogListDto extends createZodDto(QueryTaskLogListSchema) {}

export const QueryTaskListSchema = z
    .object({
        name: z.string().trim().optional(),
        cron: z.string().trim().min(1).optional(),
        status: TaskStatusSchema.optional(),
        strategy: TaskStrategySchema.optional(),
        lastStatus: z.union([TaskLogStatusSchema, z.literal('NONE')]).optional(),
        runtimeStatus: TaskRuntimeStatusSchema.optional(),
        handler: z.string().trim().min(1).optional(),
        createdAt: TaskDateRangeSchema.optional(),
        lastFinishedAt: TaskDateRangeSchema.optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional()
    })
    .refine(
        (data: { pageSize?: unknown; page?: unknown }) =>
            (data.pageSize === undefined && data.page === undefined) ||
            (data.pageSize !== undefined && data.page !== undefined),
        {
            message: 'Both pageSize and page must be provided together or omitted together.',
            path: ['pageSize', 'page']
        }
    );
export class QueryTaskListDto extends createZodDto(QueryTaskListSchema) {}

export type Pagination = {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

const TaskRuntimeSchema = z
    .object({
        name: z.string(),
        isRunning: z.boolean(),
        isCallbackRunning: z.boolean(),
        next: z.string().nullable().optional(),
        last: z.any().nullable(),
        prev: z.array(z.string().nullable())
    })
    .nullable();

const TaskRecordSchema = z.object({
    id: z.number(),
    userId: z.string(),
    name: z.string(),
    remark: z.string().nullable(),
    cron: z.string(),
    options: z.any().nullable(),
    params: z.any().nullable(),
    handler: z.string(),
    strategy: TaskStrategySchema,
    status: TaskStatusSchema,
    lastStatus: TaskLogStatusSchema.nullable().optional(),
    lastMessage: z.string().nullable().optional(),
    lastStartedAt: z.any().nullable().optional(),
    lastFinishedAt: z.any().nullable().optional(),
    lastDurationMs: z.number().nullable().optional(),
    createdAt: z.any(),
    updatedAt: z.any(),
    runtime: TaskRuntimeSchema.optional(),
    nextRunAt: z.string().nullable().optional(),
    viewerCanUpdate: z.boolean().optional(),
    viewerCanDelete: z.boolean().optional(),
    viewerCanRun: z.boolean().optional(),
    viewerCanViewLog: z.boolean().optional()
});

const TaskPaginationSchema = z.object({
    total: z.number(),
    totalPages: z.number(),
    pageSize: z.number(),
    page: z.number()
});

const TaskListMetaSchema = z.object({
    viewerCanCreateTask: z.boolean()
});

export const TaskListSchema = z.object({
    records: z.array(TaskRecordSchema),
    meta: TaskListMetaSchema,
    pagination: TaskPaginationSchema
});
export class TaskListDto extends createZodDto(TaskListSchema) {}
export class TaskRecordDto extends createZodDto(TaskRecordSchema) {}

const TaskLogRecordSchema = z.object({
    id: z.number(),
    taskId: z.number(),
    log: z.string().nullable(),
    status: TaskLogStatusSchema,
    triggeredBy: z.string(),
    actorId: z.string().nullable(),
    error: z.string().nullable(),
    startedAt: z.any(),
    finishedAt: z.any().nullable(),
    durationMs: z.number().nullable(),
    createdAt: z.any(),
    task: z
        .object({
            id: z.number(),
            name: z.string(),
            handler: z.string()
        })
        .optional()
});

export const TaskLogListSchema = z.object({
    records: z.array(TaskLogRecordSchema),
    pagination: TaskPaginationSchema
});
export class TaskLogListDto extends createZodDto(TaskLogListSchema) {}

export const TaskOptionItemSchema = z.object({
    label: z.string(),
    value: z.string(),
    isEnabled: z.boolean().optional()
});
export class TaskOptionListDto extends createZodDto(z.array(TaskOptionItemSchema)) {}
export const TaskRuntimeDto = createZodDto(TaskRuntimeSchema);
export class TaskRuntimeListDto extends createZodDto(z.array(TaskRuntimeSchema.unwrap())) {}
export class TaskNullDto extends createZodDto(z.null() as any) {}
