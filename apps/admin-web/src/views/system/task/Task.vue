<template>
    <GiPageLayout class="task-page-layout">
        <a-modal
            v-model:visible="showTaskDetailModal"
            :title="taskModalTitle"
            width="min(760px, 92vw)"
            unmount-on-close
            :confirm-loading="taskSubmitting"
            :footer="taskModalType === TaskModalType.DETAIL ? false : undefined"
            @before-ok="handleOk"
            @cancel="handleCancel"
        >
            <form-create
                v-model="taskDetailFormData"
                v-model:api="taskDetailFormApi"
                :rule="taskDetailFormRules"
                :option="taskDetailFormOptions"
            />
        </a-modal>

        <a-drawer
            v-model:visible="showTaskLogDrawer"
            width="min(1080px, 92vw)"
            :footer="false"
            unmount-on-close
        >
            <template #title>
                任务日志
                <a-tag
                    v-if="currentLogTask"
                    color="arcoblue"
                    class="tw:ml-2"
                >
                    {{ currentLogTask.name }}
                </a-tag>
            </template>

            <GiTable
                header-title="执行记录"
                row-key="id"
                :columns="taskLogColumns"
                :request="getTaskLogTableData"
                :pagination="{ defaultCurrent: 1, defaultPageSize: 10 }"
                :options="{ reload: true, density: true, setting: true }"
                :action-ref="setTaskLogTableAction"
                :scroll="{ x: '100%', minWidth: 1200 }"
            >
                <template #logStatus="{ record }">
                    <a-tag :color="record.status === TaskLogStatus.SUCCESS ? 'green' : 'red'">
                        {{ record.status === TaskLogStatus.SUCCESS ? "成功" : "失败" }}
                    </a-tag>
                </template>
                <template #logDetail="{ record }">
                    <a-button
                        size="mini"
                        type="text"
                        @click="showLogDetail(record)"
                    >
                        查看
                    </a-button>
                </template>
            </GiTable>
        </a-drawer>

        <a-modal
            v-model:visible="showLogDetailModal"
            title="执行日志详情"
            width="min(720px, 92vw)"
            :footer="false"
        >
            <a-descriptions
                v-if="currentLogRecord"
                bordered
                :column="1"
            >
                <a-descriptions-item label="状态">
                    <a-tag
                        :color="currentLogRecord.status === TaskLogStatus.SUCCESS ? 'green' : 'red'"
                    >
                        {{ currentLogRecord.status === TaskLogStatus.SUCCESS ? "成功" : "失败" }}
                    </a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="触发来源">
                    {{ formatTriggerSource(currentLogRecord.triggeredBy) }}
                </a-descriptions-item>
                <a-descriptions-item label="开始时间">
                    {{ formatDateTime(currentLogRecord.startedAt) }}
                </a-descriptions-item>
                <a-descriptions-item label="结束时间">
                    {{ formatDateTime(currentLogRecord.finishedAt) }}
                </a-descriptions-item>
                <a-descriptions-item label="耗时">
                    {{ formatDuration(currentLogRecord.durationMs) }}
                </a-descriptions-item>
                <a-descriptions-item label="日志摘要">
                    <pre class="task-log-text">{{ currentLogRecord.log || "-" }}</pre>
                </a-descriptions-item>
                <a-descriptions-item
                    v-if="currentLogRecord.error"
                    label="错误详情"
                >
                    <pre class="task-log-text task-log-text--error">{{
                        currentLogRecord.error
                    }}</pre>
                </a-descriptions-item>
            </a-descriptions>
        </a-modal>

        <a-page-header :show-back="false">
            <template #title>任务管理</template>
            <template #subtitle>调度、运行和追踪后台任务</template>
        </a-page-header>

        <main class="task-page-main">
            <a-card
                class="task-table-card"
                :bordered="true"
            >
                <GiTable
                    header-title="任务列表"
                    :columns="cols"
                    row-key="id"
                    :disabled-column-keys="taskTablePinColumns"
                    :scroll="{ x: '100%', y: '100%', minWidth: 1850 }"
                    :scrollbar="true"
                    :stripe="true"
                    :bordered="true"
                    :request="getTaskTableData"
                    :pagination="taskTablePagination"
                    :options="taskTableOptions"
                    :columns-state="taskColumnsState"
                    :action-ref="setTaskTableAction"
                >
                    <template #custom-extra>
                        <a-button
                            v-if="taskMeta.viewerCanCreateTask"
                            type="primary"
                            size="small"
                            @click="createTask"
                        >
                            <template #icon>
                                <icon-plus class="tw:text-[16px]" />
                            </template>
                            <template #default>创建新任务</template>
                        </a-button>
                    </template>

                    <template #form-search>
                        <form-create
                            v-model="taskTableSearchFormData"
                            v-model:api="taskTableSearchFormApi"
                            :rule="taskTableSearchRules"
                            :option="taskTableSearchFormOptions"
                        />
                    </template>

                    <template #status="{ record }">
                        <template v-if="record.viewerCanUpdate">
                            <a-switch
                                v-bind="switchOptions"
                                :model-value="record.status"
                                :loading="statusUpdatingIds.has(record.id)"
                                :before-change="(newValue: string | number | boolean) => updateTaskStatus(record, newValue)"
                            />
                        </template>
                        <a-tag
                            v-else
                            :color="record.status === TaskStatusEnum.ENABLE ? 'green' : 'gray'"
                        >
                            {{ getTaskStatusLabel(record.status) }}
                        </a-tag>
                    </template>

                    <template #strategy="{ record }">
                        <a-tag :color="getStrategyColor(record.strategy)">
                            {{ getStrategyLabel(record.strategy) }}
                        </a-tag>
                    </template>

                    <template #runtime="{ record }">
                        <a-space
                            direction="vertical"
                            size="mini"
                        >
                            <a-tag :color="record.runtime?.isRunning ? 'green' : 'gray'">
                                {{ record.runtime?.isRunning ? "已注册运行" : "未运行" }}
                            </a-tag>
                            <span class="task-muted">
                                下次：{{ formatDateTime(record.nextRunAt) }}
                            </span>
                        </a-space>
                    </template>

                    <template #lastRun="{ record }">
                        <a-space
                            direction="vertical"
                            size="mini"
                        >
                            <a-tag
                                :color="
                                    record.lastStatus === TaskLogStatus.SUCCESS
                                        ? 'green'
                                        : record.lastStatus === TaskLogStatus.FAILED
                                          ? 'red'
                                          : 'gray'
                                "
                            >
                                {{ getLastStatusLabel(record.lastStatus) }}
                            </a-tag>
                            <span class="task-muted">
                                {{ formatDateTime(record.lastFinishedAt) }}
                            </span>
                            <span class="task-muted">
                                {{ formatDuration(record.lastDurationMs) }}
                            </span>
                        </a-space>
                    </template>

                    <template #action="{ record }">
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-button
                                v-if="record.viewerCanUpdate"
                                size="mini"
                                type="primary"
                                @click="editTask(record)"
                            >
                                修改
                            </a-button>
                            <a-button
                                size="mini"
                                @click="showTaskDetail(record)"
                            >
                                详情
                            </a-button>
                            <a-button
                                v-if="record.viewerCanRun"
                                size="mini"
                                :loading="runningTaskIds.has(record.id)"
                                @click="runTask(record)"
                            >
                                <template #icon>
                                    <icon-play-arrow />
                                </template>
                                <template #default>运行一次</template>
                            </a-button>
                            <a-button
                                v-if="record.viewerCanViewLog"
                                size="mini"
                                @click="openTaskLogs(record)"
                            >
                                日志
                            </a-button>
                            <a-popconfirm
                                v-if="record.viewerCanDelete"
                                content="确定要删除该任务和执行日志吗?"
                                @ok="deleteTask(record)"
                            >
                                <a-button
                                    size="mini"
                                    status="danger"
                                    type="primary"
                                >
                                    删除
                                </a-button>
                            </a-popconfirm>
                        </a-space>
                    </template>
                </GiTable>
            </a-card>
        </main>
    </GiPageLayout>
</template>

<script setup lang="tsx">
    import {
        createTask as createTaskApi,
        deleteTask as deleteTaskApi,
        getTaskHandlerOption,
        queryTaskList,
        queryTaskLogList,
        getTaskStatusOption,
        getTaskStrategyOption,
        runTaskOnce,
        TaskLogStatus,
        type TaskForm,
        type TaskLogRecord,
        type TaskMutationPayload,
        type TaskOption,
        type TaskRecord,
        type TaskStatus,
        type TaskStrategy,
        TaskStatus as TaskStatusEnum,
        TaskStrategy as TaskStrategyEnum,
        updateTask as updateTaskApi,
        updateTaskStatusApi,
    } from "@/api/task";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import dayjs from "dayjs";
    import { computed, nextTick, ref, shallowRef } from "vue";

    defineOptions({
        name: "Task",
    });

    enum TaskModalType {
        CREATE = 1,
        MODIFY,
        DETAIL,
    }

    const cols: ProColumns[] = [
        { dataIndex: "id", title: "ID", width: 70, align: "center", fixed: "left" },
        { dataIndex: "name", title: "任务名称", width: 180, fixed: "left" },
        { dataIndex: "cron", title: "CRON表达式", align: "center", width: 150 },
        { dataIndex: "handler", title: "Handler", width: 220, ellipsis: true, tooltip: true },
        { dataIndex: "strategy", slotName: "strategy", title: "策略", width: 110, align: "center" },
        { dataIndex: "status", slotName: "status", title: "状态", width: 110, align: "center" },
        { dataIndex: "runtime", slotName: "runtime", title: "调度状态", width: 170 },
        { dataIndex: "lastRun", slotName: "lastRun", title: "最近执行", width: 170 },
        { dataIndex: "remark", title: "任务说明", width: 220, ellipsis: true, tooltip: true },
        { dataIndex: "createdAt", title: "创建时间", width: 170 },
        { dataIndex: "updatedAt", title: "更新时间", width: 170 },
        { slotName: "action", title: "操作", width: 280, fixed: "right" },
    ];

    const taskLogColumns: ProColumns[] = [
        { dataIndex: "id", title: "ID", width: 80, align: "center" },
        { dataIndex: "status", slotName: "logStatus", title: "状态", width: 90, align: "center" },
        {
            dataIndex: "triggeredBy",
            title: "触发来源",
            width: 110,
            render: ({ record }) => formatTriggerSource(record.triggeredBy as string),
        },
        { dataIndex: "log", title: "摘要", width: 260, ellipsis: true, tooltip: true },
        {
            dataIndex: "durationMs",
            title: "耗时",
            width: 100,
            render: ({ record }) => formatDuration(record.durationMs as number | null),
        },
        {
            dataIndex: "startedAt",
            title: "开始时间",
            width: 170,
            render: ({ record }) => formatDateTime(record.startedAt as string),
        },
        {
            dataIndex: "finishedAt",
            title: "结束时间",
            width: 170,
            render: ({ record }) => formatDateTime(record.finishedAt as string | null),
        },
        { slotName: "logDetail", title: "详情", width: 80, fixed: "right" },
    ];

    const taskLastStatusOptions = [
        { label: "成功", value: TaskLogStatus.SUCCESS },
        { label: "失败", value: TaskLogStatus.FAILED },
        { label: "未执行", value: "NONE" },
    ];
    const taskRuntimeStatusOptions = [
        { label: "已注册运行", value: "RUNNING" },
        { label: "未运行", value: "STOPPED" },
    ];
    const taskTableSearchFormApi = shallowRef<FormCreateApi | null>(null);
    const taskDetailFormApi = shallowRef<FormCreateApi | null>(null);
    const taskTableAction = ref<ActionType | null>(null);
    const taskLogTableAction = ref<ActionType | null>(null);
    const taskSubmitting = ref(false);
    const showTaskDetailModal = ref(false);
    const showTaskLogDrawer = ref(false);
    const showLogDetailModal = ref(false);
    const taskModalType = ref<TaskModalType>(TaskModalType.CREATE);
    const taskStatusOptions = ref<TaskOption[]>([]);
    const taskStrategyOptions = ref<TaskOption[]>([]);
    const taskHandlerOptions = ref<TaskOption[]>([]);
    const currentLogTask = ref<TaskRecord | null>(null);
    const currentLogRecord = ref<TaskLogRecord | null>(null);
    const runningTaskIds = ref(new Set<number>());
    const statusUpdatingIds = ref(new Set<number>());
    const taskMeta = ref({
        viewerCanCreateTask: false,
    });
    const switchOptions = ref<{
        checkedValue: TaskStatus;
        uncheckedValue: TaskStatus;
        checkedText: string;
        uncheckedText: string;
    }>({
        checkedValue: TaskStatusEnum.ENABLE,
        uncheckedValue: TaskStatusEnum.DISABLE,
        checkedText: "启用",
        uncheckedText: "禁用",
    });

    const taskTableSearchFormData = ref({
        name: "",
        cron: "",
        handler: "",
        status: "",
        strategy: "",
        lastStatus: "",
        runtimeStatus: "",
        createdAt: [],
        lastFinishedAt: [],
    });

    const taskDetailFormData = ref<TaskForm>(getEmptyTaskForm());

    const taskTablePagination = {
        defaultCurrent: 1,
        defaultPageSize: 10,
        current: 1,
        pageSize: 10,
    };
    const taskTableOptions = {
        reload: true,
        density: true,
        setting: { draggable: true, checkable: true, checkedReset: true, showListItemOption: true },
    };
    const taskColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-task-columns",
    } as const;
    const taskTablePinColumns = ["id", "status", "action"];

    const taskTableSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(handleSubmit, handleReset),
    );
    const taskDetailFormOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
            labelColProps: { span: 6 },
            wrapperColProps: { span: 18 },
        },
        row: { gutter: 12 },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    }));

    const taskTableSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "任务名称",
            type: "input",
            props: { allowClear: true, placeholder: "请输入任务名称" },
        },
        {
            field: "cron",
            title: "CRON表达式",
            type: "input",
            props: { allowClear: true, placeholder: "请输入 CRON 片段" },
        },
        {
            field: "handler",
            title: "Handler",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "请选择 Handler",
                options: taskHandlerOptions.value,
            },
        },
        {
            field: "status",
            title: "状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "请选择状态",
                options: taskStatusOptions.value,
            },
        },
        {
            field: "strategy",
            title: "策略",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "请选择策略",
                options: taskStrategyOptions.value,
            },
        },
        {
            field: "lastStatus",
            title: "最近执行状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "请选择最近执行状态",
                options: taskLastStatusOptions,
            },
        },
        {
            field: "runtimeStatus",
            title: "运行态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "请选择运行态",
                options: taskRuntimeStatusOptions,
            },
        },
        {
            field: "createdAt",
            title: "创建时间",
            type: "datePicker",
            props: {
                range: true,
                showTime: true,
                valueFormat: "YYYY-MM-DD HH:mm:ss",
                placeholder: ["开始时间", "结束时间"],
            },
        },
        {
            field: "lastFinishedAt",
            title: "最近执行时间",
            type: "datePicker",
            props: {
                range: true,
                showTime: true,
                valueFormat: "YYYY-MM-DD HH:mm:ss",
                placeholder: ["开始时间", "结束时间"],
            },
        },
    ]);

    const taskDetailFormRules = computed<FormCreateRule[]>(() => {
        const detail = taskModalType.value === TaskModalType.DETAIL;
        return [
            {
                field: "name",
                title: "任务名称",
                type: "input",
                props: { allowClear: true, placeholder: "请输入任务名称", disabled: detail },
                validate: [{ required: true, message: "请输入任务名称", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "cron",
                title: "CRON表达式",
                type: "input",
                props: { allowClear: true, placeholder: "如 0 */5 * * * *", disabled: detail },
                validate: [{ required: true, message: "请输入 CRON 表达式", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "handler",
                title: "Handler",
                type: "select",
                props: {
                    triggerProps: {
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    },
                    allowClear: true,
                    allowSearch: true,
                    placeholder: "请选择 Handler",
                    disabled: detail,
                    options: taskHandlerOptions.value,
                },
                validate: [{ required: true, message: "请选择 Handler", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "strategy",
                title: "执行策略",
                type: "select",
                props: {
                    triggerProps: {
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    },
                    allowClear: true,
                    placeholder: "请选择执行策略",
                    disabled: detail,
                    options: taskStrategyOptions.value,
                },
                validate: [{ required: true, message: "请选择执行策略", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "status",
                title: "状态",
                type: "switch",
                props: {
                    disabled: detail,
                    checkedValue: switchOptions.value.checkedValue,
                    uncheckedValue: switchOptions.value.uncheckedValue,
                    checkedText: switchOptions.value.checkedText,
                    uncheckedText: switchOptions.value.uncheckedText,
                },
                col: { span: 24 },
            },
            {
                field: "remark",
                title: "任务说明",
                type: "textarea",
                props: {
                    allowClear: true,
                    placeholder: "请输入任务说明",
                    autoSize: { minRows: 3, maxRows: 5 },
                    disabled: detail,
                },
                col: { span: 24 },
            },
            {
                field: "options",
                title: "执行选项",
                type: "textarea",
                props: {
                    allowClear: true,
                    placeholder: '{ "waitForCompletion": true }',
                    autoSize: { minRows: 3, maxRows: 6 },
                    disabled: detail,
                },
                validate: [{ validator: validateOptionalJsonObject, trigger: "blur" }],
                col: { span: 24 },
            },
            {
                field: "params",
                title: "执行参数",
                type: "textarea",
                props: {
                    allowClear: true,
                    placeholder: '["参数1", 2]',
                    autoSize: { minRows: 3, maxRows: 6 },
                    disabled: detail,
                },
                validate: [{ validator: validateOptionalJsonArray, trigger: "blur" }],
                col: { span: 24 },
            },
        ];
    });

    const taskModalTitle = computed(() => {
        switch (taskModalType.value) {
            case TaskModalType.CREATE:
                return "创建任务";
            case TaskModalType.MODIFY:
                return "修改任务";
            case TaskModalType.DETAIL:
                return "任务详情";
            default:
                return "";
        }
    });

    void initializeTaskPage();

    // 绑定任务表格操作实例，供创建、更新、删除后刷新列表。
    function setTaskTableAction(action: ActionType) {
        taskTableAction.value = action;
    }

    // 绑定任务日志表格操作实例，供手动执行任务后刷新日志。
    function setTaskLogTableAction(action: ActionType) {
        taskLogTableAction.value = action;
    }

    // 刷新任务列表，保持当前分页上下文。
    function refreshTable() {
        void taskTableAction.value?.reload();
    }

    // 拉取任务列表数据，并返回 GiTable 需要的分页结构。
    async function getTaskTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<TaskRecord>> {
        const response = await queryTaskList({
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
            ...buildTaskTableFilterParams(),
        });
        taskMeta.value = response.data.meta;
        return {
            data: response.data.records,
            total: response.data.pagination.total,
            success: true,
        };
    }

    // 拉取当前任务的执行日志列表。
    async function getTaskLogTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<TaskLogRecord>> {
        const response = await queryTaskLogList({
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
            taskId: currentLogTask.value?.id,
        });
        return {
            data: response.data.records,
            total: response.data.pagination.total,
            success: true,
        };
    }

    // 将搜索表单转换为后端查询参数，跳过空值。
    function buildTaskTableFilterParams() {
        const filters: Record<string, unknown> = {};
        Object.entries(taskTableSearchFormData.value).forEach(([key, value]) => {
            if (value === "" || value === null || value === undefined) {
                return;
            }
            if (Array.isArray(value) && value.length === 0) {
                return;
            }
            filters[key] = value;
        });
        return filters;
    }

    // 打开创建任务弹窗并重置表单。
    function createTask() {
        taskModalType.value = TaskModalType.CREATE;
        showTaskDetailModal.value = true;
        taskDetailFormData.value = getEmptyTaskForm();
        clearTaskDetailFormValidation();
    }

    // 打开任务详情弹窗并回显只读数据。
    function showTaskDetail(record: TaskRecord) {
        taskModalType.value = TaskModalType.DETAIL;
        showTaskDetailModal.value = true;
        taskDetailFormData.value = toTaskForm(record);
        clearTaskDetailFormValidation();
    }

    // 打开编辑任务弹窗并回显可编辑数据。
    function editTask(record: TaskRecord) {
        taskModalType.value = TaskModalType.MODIFY;
        showTaskDetailModal.value = true;
        taskDetailFormData.value = toTaskForm(record);
        clearTaskDetailFormValidation();
    }

    // 删除指定任务并刷新任务列表。
    async function deleteTask(record: TaskRecord) {
        try {
            await deleteTaskApi(record.id);
            Message.success("删除成功");
            refreshTable();
        } catch {
            Message.error("删除失败");
        }
    }

    // 关闭任务弹窗并重置表单校验状态。
    function handleCancel() {
        showTaskDetailModal.value = false;
        clearTaskDetailFormValidation();
    }

    // 提交创建或更新任务表单。
    async function handleOk() {
        if (!taskDetailFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            await taskDetailFormApi.value.validate();
        } catch {
            return false;
        }

        taskSubmitting.value = true;
        try {
            const data = buildTaskSubmitData(taskDetailFormData.value);
            if (taskModalType.value === TaskModalType.MODIFY) {
                await updateTaskApi(data);
            } else if (taskModalType.value === TaskModalType.CREATE) {
                await createTaskApi(data);
            }
            Message.success(taskModalType.value === TaskModalType.MODIFY ? "更新成功" : "创建成功");
            showTaskDetailModal.value = false;
            taskDetailFormData.value = getEmptyTaskForm();
            clearTaskDetailFormValidation();
            refreshTable();
            return true;
        } catch {
            Message.error("操作失败");
            return false;
        } finally {
            taskSubmitting.value = false;
        }
    }

    // 手动执行一次任务，并刷新列表和当前日志抽屉。
    async function runTask(record: TaskRecord) {
        runningTaskIds.value = new Set([...runningTaskIds.value, record.id]);
        try {
            await runTaskOnce(record.id);
            Message.success("任务执行成功");
            refreshTable();
            if (currentLogTask.value?.id === record.id) {
                void taskLogTableAction.value?.reload();
            }
        } catch {
            Message.error("任务执行失败");
        } finally {
            const nextIds = new Set(runningTaskIds.value);
            nextIds.delete(record.id);
            runningTaskIds.value = nextIds;
        }
    }

    // 判断开关传回的值是否为后端任务状态枚举。
    function isTaskStatus(value: string | number | boolean): value is TaskStatus {
        return value === TaskStatusEnum.ENABLE || value === TaskStatusEnum.DISABLE;
    }

    // 切换任务启停状态，并在失败时阻止开关状态变更。
    async function updateTaskStatus(record: TaskRecord, newValue: string | number | boolean) {
        if (!isTaskStatus(newValue)) {
            Message.error("任务状态值无效");
            return false;
        }

        statusUpdatingIds.value = new Set([...statusUpdatingIds.value, record.id]);
        try {
            await updateTaskStatusApi({ id: record.id, status: newValue });
            Message.success("更新成功");
            refreshTable();
            return true;
        } catch {
            Message.error("更新失败");
            return false;
        } finally {
            const nextIds = new Set(statusUpdatingIds.value);
            nextIds.delete(record.id);
            statusUpdatingIds.value = nextIds;
        }
    }

    // 打开指定任务的执行日志抽屉。
    function openTaskLogs(record: TaskRecord) {
        currentLogTask.value = record;
        showTaskLogDrawer.value = true;
        void taskLogTableAction.value?.reload(true);
    }

    // 打开单条执行日志详情弹窗。
    function showLogDetail(record: TaskLogRecord) {
        currentLogRecord.value = record;
        showLogDetailModal.value = true;
    }

    // 重置搜索条件并刷新到第一页。
    function handleReset() {
        taskTableSearchFormData.value = {
            name: "",
            cron: "",
            handler: "",
            status: "",
            strategy: "",
            lastStatus: "",
            runtimeStatus: "",
            createdAt: [],
            lastFinishedAt: [],
        };
        void taskTableAction.value?.reload(true);
    }

    // 提交搜索条件并刷新到第一页。
    function handleSubmit() {
        void taskTableAction.value?.reload(true);
    }

    // 初始化状态、策略和 Handler 选项，并同步表单组件的动态选项。
    async function initializeTaskPage() {
        const [statusRes, strategyRes, handlerRes] = await Promise.allSettled([
            getTaskStatusOption(),
            getTaskStrategyOption(),
            getTaskHandlerOption(),
        ]);
        if (statusRes.status === "rejected" || strategyRes.status === "rejected") {
            Message.error("任务基础选项加载失败");
            return;
        }

        const statusOptions = statusRes.value.data;
        const strategyOptions = strategyRes.value.data;
        // Handler 清单受任务资源权限约束；无可见任务时允许页面继续展示空列表。
        const handlerOptions = handlerRes.status === "fulfilled" ? handlerRes.value.data : [];
        taskStatusOptions.value = statusOptions;
        taskStrategyOptions.value = strategyOptions;
        taskHandlerOptions.value = handlerOptions;
        const checked = statusOptions.find((item) => item.isEnabled) ?? statusOptions[0];
        const unchecked = statusOptions.find((item) => !item.isEnabled) ?? statusOptions[1];
        switchOptions.value = {
            checkedValue: (checked?.value as TaskStatus) ?? TaskStatusEnum.ENABLE,
            uncheckedValue: (unchecked?.value as TaskStatus) ?? TaskStatusEnum.DISABLE,
            checkedText: checked?.label ?? "启用",
            uncheckedText: unchecked?.label ?? "禁用",
        };
        taskTableSearchFormApi.value?.updateRule?.("handler", {
            props: { options: handlerOptions },
        });
        taskTableSearchFormApi.value?.updateRule?.("status", { props: { options: statusOptions } });
        taskTableSearchFormApi.value?.updateRule?.("strategy", {
            props: { options: strategyOptions },
        });
    }

    // 构造搜索表单的提交和重置按钮配置。
    function buildSearchFormOptions(onSubmit: () => void, onReset: () => void): FormCreateOptions {
        return {
            form: {
                layout: "horizontal",
                labelAlign: "right",
                autoLabelWidth: true,
            },
            row: { gutter: 12 },
            submitBtn: {
                show: true,
                type: "primary",
                size: "small",
                innerText: "查询",
                click: onSubmit,
            },
            resetBtn: {
                show: true,
                type: "secondary",
                size: "small",
                innerText: "重置",
                click: onReset,
            },
        };
    }

    // 清理任务弹窗表单校验状态，避免创建、编辑和详情模式之间残留错误提示。
    function clearTaskDetailFormValidation() {
        void nextTick(() => {
            const formEl = taskDetailFormApi.value?.formEl?.();
            const form =
                formEl && "clearValidate" in formEl
                    ? formEl
                    : ((formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.proxy ??
                      (formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.exposed);
            (form as { clearValidate?: () => void } | undefined)?.clearValidate?.();
        });
    }

    // 生成新建任务时使用的空表单默认值。
    function getEmptyTaskForm(): TaskForm {
        return {
            name: undefined,
            cron: undefined,
            remark: undefined,
            options: undefined,
            params: undefined,
            handler: undefined,
            strategy: TaskStrategyEnum.AUTO,
            status: TaskStatusEnum.ENABLE,
        };
    }

    // 将后端任务记录转换为弹窗表单数据。
    function toTaskForm(record: TaskRecord): TaskForm {
        return {
            id: record.id,
            name: record.name,
            cron: record.cron,
            remark: record.remark,
            options: stringifyJsonForForm(record.options),
            params: stringifyJsonForForm(record.params),
            handler: record.handler,
            strategy: record.strategy,
            status: record.status,
        };
    }

    // 构造任务提交数据，只提交任务配置字段，避免把只读展示字段透传到后端。
    function buildTaskSubmitData(form: TaskForm): TaskMutationPayload {
        return {
            ...(form.id !== undefined ? { id: form.id } : {}),
            name: form.name === "" ? undefined : form.name,
            cron: form.cron === "" ? undefined : form.cron,
            handler: form.handler === "" ? undefined : form.handler,
            strategy: form.strategy,
            status: form.status,
            remark: form.remark === "" ? null : form.remark,
            options: form.options ? (JSON.parse(form.options) as Record<string, unknown>) : null,
            params: form.params ? (JSON.parse(form.params) as unknown[]) : null,
        };
    }

    // 将 JSON 字段格式化为适合文本域编辑的字符串。
    function stringifyJsonForForm(value: unknown) {
        if (value === null || value === undefined) {
            return undefined;
        }
        return JSON.stringify(value, null, 2);
    }

    // 校验执行选项必须是合法 JSON 对象。
    function validateOptionalJsonObject(
        _rule: unknown,
        value: unknown,
        callback: (message?: string) => void,
    ) {
        if (!value) {
            callback();
            return;
        }
        try {
            const parsed = JSON.parse(String(value));
            callback(
                parsed && typeof parsed === "object" && !Array.isArray(parsed)
                    ? undefined
                    : "执行选项必须是 JSON 对象",
            );
        } catch {
            callback("执行选项必须是合法 JSON");
        }
    }

    // 校验执行参数必须是合法 JSON 数组。
    function validateOptionalJsonArray(
        _rule: unknown,
        value: unknown,
        callback: (message?: string) => void,
    ) {
        if (!value) {
            callback();
            return;
        }
        try {
            callback(
                Array.isArray(JSON.parse(String(value))) ? undefined : "执行参数必须是 JSON 数组",
            );
        } catch {
            callback("执行参数必须是合法 JSON");
        }
    }

    // 获取任务策略中文标签。
    function getStrategyLabel(strategy: TaskStrategy) {
        return taskStrategyOptions.value.find((item) => item.value === strategy)?.label ?? strategy;
    }

    // 获取任务状态中文标签。
    function getTaskStatusLabel(status: TaskStatus) {
        return taskStatusOptions.value.find((item) => item.value === status)?.label ?? status;
    }

    // 获取任务策略对应的标签颜色。
    function getStrategyColor(strategy: TaskStrategy) {
        if (strategy === TaskStrategyEnum.AUTO) return "arcoblue";
        if (strategy === TaskStrategyEnum.ONCE_AUTO) return "orange";
        return "gray";
    }

    // 获取最近执行状态中文标签。
    function getLastStatusLabel(status?: TaskLogStatus | null) {
        if (status === TaskLogStatus.SUCCESS) return "成功";
        if (status === TaskLogStatus.FAILED) return "失败";
        return "未执行";
    }

    // 格式化日期时间，空值显示为短横线。
    function formatDateTime(value?: string | null) {
        if (!value) {
            return "-";
        }
        const parsed = dayjs(value);
        return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : String(value);
    }

    // 格式化毫秒耗时为易读文本。
    function formatDuration(value?: number | null) {
        if (value === null || value === undefined) {
            return "-";
        }
        if (value < 1000) {
            return `${value}ms`;
        }
        return `${(value / 1000).toFixed(2)}s`;
    }

    // 将任务触发来源转换为中文展示。
    function formatTriggerSource(source?: string | null) {
        const map: Record<string, string> = {
            SCHEDULE: "定时触发",
            MANUAL: "手动触发",
            ONCE_AUTO: "启动执行一次",
            RESTORE: "启动恢复",
        };
        return source ? (map[source] ?? source) : "-";
    }
</script>

<style scoped lang="scss">
    .task-page-layout :deep(.gi-page-layout__scroll-content) {
        display: flex;
        flex-direction: column;
    }

    .task-page-layout :deep(.gi-table) {
        flex: auto;
        min-height: 0;
    }

    .task-page-main {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
    }

    .task-table-card {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .task-table-card :deep(.arco-card-body) {
        display: flex;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .task-muted {
        color: var(--color-text-3);
        font-size: 12px;
    }

    .task-log-text {
        max-width: 100%;
        margin: 0;
        white-space: pre-wrap;
        word-break: break-all;
        font-family:
            "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.6;
    }

    .task-log-text {
        max-height: 260px;
        overflow: auto;
        padding: 8px;
        border-radius: 6px;
        background: var(--color-fill-2);
    }

    .task-log-text--error {
        color: rgb(var(--red-7));
    }
</style>
