import { request } from "@/api/index";

export const TaskStatus = {
    ENABLE: "ENABLE",
    DISABLE: "DISABLE",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskStrategy = {
    AUTO: "AUTO",
    ONCE_AUTO: "ONCE_AUTO",
    MANUAL: "MANUAL",
} as const;
export type TaskStrategy = (typeof TaskStrategy)[keyof typeof TaskStrategy];

export const TaskLogStatus = {
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
} as const;
export type TaskLogStatus = (typeof TaskLogStatus)[keyof typeof TaskLogStatus];

export interface TaskRuntime {
    name: string;
    isRunning: boolean;
    isCallbackRunning: boolean;
    next?: string | null;
    last?: string | null;
    prev: Array<string | null>;
}

export interface TaskForm {
    id?: number;
    name: string | undefined;
    cron: string | undefined;
    remark: string | null | undefined;
    options: string | null | undefined;
    params: string | null | undefined;
    handler: string | undefined;
    strategy: TaskStrategy | undefined;
    status: TaskStatus | undefined;
}

export interface TaskMutationPayload {
    id?: number;
    name: string | undefined;
    cron: string | undefined;
    remark: string | null | undefined;
    options: Record<string, unknown> | null | undefined;
    params: unknown[] | null | undefined;
    handler: string | undefined;
    strategy: TaskStrategy | undefined;
    status: TaskStatus | undefined;
}

export interface TaskRecord {
    id: number;
    userId: string;
    name: string;
    cron: string;
    remark: string | null;
    options: unknown;
    params: unknown;
    handler: string;
    strategy: TaskStrategy;
    status: TaskStatus;
    lastStatus?: TaskLogStatus | null;
    lastMessage?: string | null;
    lastStartedAt?: string | null;
    lastFinishedAt?: string | null;
    lastDurationMs?: number | null;
    createdAt: string;
    updatedAt: string;
    runtime?: TaskRuntime | null;
    nextRunAt?: string | null;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanRun?: boolean;
    viewerCanViewLog?: boolean;
}

export interface TaskLogRecord {
    id: number;
    taskId: number;
    log: string | null;
    status: TaskLogStatus;
    triggeredBy: string;
    actorId: string | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    createdAt: string;
    task?: {
        id: number;
        name: string;
        handler: string;
    };
}

export interface TaskPageResponse<T> {
    records: T[];
    meta: {
        viewerCanCreateTask: boolean;
    };
    pagination: {
        total: number;
        totalPages: number;
        pageSize: number;
        page: number;
    };
}

export interface TaskOption {
    label: string;
    value: string;
    isEnabled?: boolean;
}

// 获取任务分页列表，支持名称、Handler、状态、策略和创建时间筛选。
export function queryTaskList(params: Record<string, unknown>) {
    return request.post<TaskPageResponse<TaskRecord>>("/system/task/query_task_list", params);
}

// 获取任务执行日志分页列表。
export function queryTaskLogList(params: Record<string, unknown>) {
    return request.post<TaskPageResponse<TaskLogRecord>>(
        "/system/task/query_task_log_list",
        params,
    );
}

// 获取任务状态下拉选项。
export function getTaskStatusOption() {
    return request.get<TaskOption[]>("/system/task/get_task_status_option");
}

// 获取任务执行策略下拉选项。
export function getTaskStrategyOption() {
    return request.get<TaskOption[]>("/system/task/get_task_strategy_option");
}

// 获取后端已注册的任务 Handler 下拉选项。
export function getTaskHandlerOption() {
    return request.get<TaskOption[]>("/system/task/get_task_handler_option");
}

// 创建任务并同步注册到后端调度器。
export function createTask(data: TaskMutationPayload) {
    return request.post<TaskRecord>("/system/task/create_task", data);
}

// 更新任务配置并重建后端调度器中的 CronJob。
export function updateTask(data: TaskMutationPayload) {
    return request.post<TaskRecord>("/system/task/update_task", data);
}

// 删除任务及其执行日志。
export function deleteTask(id: number) {
    return request.post<null>("/system/task/delete_task", { id });
}

// 更新任务启停状态。
export function updateTaskStatusApi(data: { id: number; status: TaskStatus }) {
    return request.post<null>("/system/task/update_task_status", data);
}

// 手动执行一次指定任务。
export function runTaskOnce(id: number) {
    return request.post<null>("/system/task/run_task", { id });
}
