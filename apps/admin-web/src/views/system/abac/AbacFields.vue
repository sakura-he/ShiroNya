<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>ABAC 字段管理</template>
            <template #subtitle>内置策略字段注册表</template>
        </a-page-header>

        <a-tabs
            v-model:active-key="category"
            class="abac-field-tabs"
            @change="handleCategoryChange"
        >
            <a-tab-pane
                key="USER_BASE"
                title="用户字段"
            />
            <a-tab-pane
                key="USER_EXTENSION"
                title="用户扩展字段"
            />
        </a-tabs>

        <a-alert
            type="info"
            show-icon
            style="margin-bottom: 12px"
        >
            <template #title>操作提示</template>
            <a-space
                direction="vertical"
                fill
                size="mini"
            >
                <a-typography-text
                    v-for="item in operationTips"
                    :key="item"
                >
                    {{ item }}
                </a-typography-text>
            </a-space>
        </a-alert>

        <a-card :bordered="true">
            <GiTable
                row-key="id"
                header-title="字段"
                :columns="columns"
                :request="requestFields"
                :pagination="fieldTablePagination"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1280 }"
                :action-ref="setFieldTableAction"
                bordered
            >
                <template #form-search>
                    <a-form
                        :model="searchForm"
                        layout="horizontal"
                        class="abac-field-search"
                    >
                        <a-row :gutter="12">
                            <a-col
                                :xs="24"
                                :sm="12"
                                :md="8"
                                :lg="7"
                            >
                                <a-form-item label="关键词">
                                    <a-input
                                        v-model="keyword"
                                        allow-clear
                                        placeholder="字段 Key / 名称"
                                        @press-enter="reloadFieldTable()"
                                    />
                                </a-form-item>
                            </a-col>
                            <a-col
                                :xs="24"
                                :sm="12"
                                :md="7"
                                :lg="5"
                            >
                                <a-form-item label="状态">
                                    <a-select
                                        v-model="status"
                                        allow-clear
                                        placeholder="全部"
                                        :options="statusOptions"
                                        :trigger-props="{
                                            autoFitPopupWidth: false,
                                            autoFitPopupMinWidth: true,
                                        }"
                                        @change="reloadFieldTable()"
                                    />
                                </a-form-item>
                            </a-col>
                            <a-col
                                :xs="24"
                                :sm="12"
                                :md="4"
                                :lg="5"
                            >
                                <a-form-item label=" ">
                                    <a-space wrap>
                                        <a-button
                                            type="primary"
                                            size="small"
                                            @click="reloadFieldTable()"
                                        >
                                            查询
                                        </a-button>
                                        <a-button
                                            size="small"
                                            @click="resetSearch"
                                        >
                                            重置
                                        </a-button>
                                    </a-space>
                                </a-form-item>
                            </a-col>
                        </a-row>
                    </a-form>
                </template>

                <template #custom-extra>
                    <a-button
                        v-if="category === 'USER_EXTENSION'"
                        type="primary"
                        size="small"
                        @click="openCreate"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        新增扩展字段
                    </a-button>
                </template>

                <template #key="{ record }">
                    <a-typography-text code>{{ record.key }}</a-typography-text>
                </template>
                <template #source="{ record }">
                    <a-tag>{{ sourceLabel(record.source) }}</a-tag>
                </template>
                <template #dataType="{ record }">
                    <a-tag color="arcoblue">{{ dataTypeLabel(record.dataType) }}</a-tag>
                </template>
                <template #operators="{ record }">
                    <a-space wrap>
                        <a-tag
                            v-for="operator in record.operators"
                            :key="operator"
                        >
                            {{ operatorLabel(operator) }}
                        </a-tag>
                    </a-space>
                </template>
                <template #status="{ record }">
                    <a-switch
                        :model-value="record.status === 'ENABLE'"
                        size="small"
                        @change="(checked) => toggleStatus(record, Boolean(checked))"
                    />
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <a-link @click="openEdit(record)">编辑</a-link>
                        <a-popconfirm
                            v-if="!record.locked && !record.builtin"
                            content="确认删除？"
                            @ok="remove(record)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
            </GiTable>
        </a-card>

        <a-modal
            v-model:visible="modalVisible"
            title="字段"
            :ok-loading="saving"
            @ok="save"
        >
            <a-form
                :model="form"
                layout="vertical"
            >
                <a-form-item label="字段 Key">
                    <a-input
                        v-model="form.key"
                        :disabled="isLockedForm"
                        placeholder="ext.departmentId"
                    />
                </a-form-item>
                <a-form-item label="显示名称">
                    <a-input v-model="form.label" />
                </a-form-item>
                <a-form-item label="字段描述">
                    <a-textarea
                        v-model="form.description"
                        :auto-size="{ minRows: 2, maxRows: 4 }"
                    />
                </a-form-item>
                <a-form-item label="数据类型">
                    <a-select
                        v-model="form.dataType"
                        :disabled="isLockedForm"
                        :options="dataTypeOptions"
                        :trigger-props="{
                            autoFitPopupWidth: false,
                            autoFitPopupMinWidth: true,
                        }"
                        @change="resetOperators"
                    />
                </a-form-item>
                <a-form-item label="操作符">
                    <a-select
                        v-model="form.operators"
                        multiple
                        allow-clear
                        :options="operatorOptions"
                        :trigger-props="{
                            autoFitPopupWidth: false,
                            autoFitPopupMinWidth: true,
                        }"
                    />
                </a-form-item>
                <a-form-item label="状态">
                    <a-switch
                        :model-value="form.status === 'ENABLE'"
                        @update:model-value="form.status = $event ? 'ENABLE' : 'DISABLE'"
                    />
                </a-form-item>
            </a-form>
        </a-modal>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        deleteAbacFieldApi,
        getAbacFieldRegistryApi,
        saveAbacFieldApi,
        type AbacFieldCategory,
        type AbacFieldDataType,
        type AbacFieldDto,
        type AbacStatus,
    } from "@/api/abac";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, reactive, ref, watch } from "vue";
    import { tableOptions, useAbacTarget } from "./abacShared";

    defineOptions({ name: "AbacFields" });

    type FieldForm = {
        id?: string;
        key: string;
        label: string;
        description: string;
        category: AbacFieldCategory;
        dataType: AbacFieldDataType;
        operators: string[];
        status: AbacStatus;
        locked?: boolean;
        builtin?: boolean;
    };

    const targetApp = useAbacTarget();
    const saving = ref(false);
    const modalVisible = ref(false);
    const category = ref<AbacFieldCategory>("USER_BASE");
    const keyword = ref("");
    const status = ref<AbacStatus | undefined>();
    const fieldTableAction = ref<ActionType | null>(null);
    const form = reactive<FieldForm>({
        key: "ext.",
        label: "",
        description: "",
        category: "USER_EXTENSION",
        dataType: "string",
        operators: ["EQ", "NE", "IN", "NOT_IN", "EMPTY", "NOT_EMPTY"],
        status: "ENABLE",
    });
    const searchForm = computed(() => ({
        category: category.value,
        keyword: keyword.value,
        status: status.value,
    }));
    const isLockedForm = computed(() => Boolean(form.locked || form.builtin));
    const operationTips = [
        "用户字段 Key 直接写 Better Auth 会话中的字段名，例如 session.user.createdAt；后端运行时会把 req.session 放到 request.principal.attr.session。",
        "用户扩展字段 Key 写 ext.xxx；业务接口可以通过 AbacPermission 的 ext 选项传入扩展数据，策略表达式会使用 request.principal.attr.ext.xxx。",
        "字段表维护白名单、数据类型和操作符；字段 Key 会按当前字段名生成 Cerbos 条件表达式。",
    ];
    const fieldTablePagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };

    const statusOptions = [
        { label: "启用", value: "ENABLE" },
        { label: "停用", value: "DISABLE" },
    ];
    const dataTypeOptions: Array<{ label: string; value: AbacFieldDataType }> = [
        { label: "字符串", value: "string" },
        { label: "数字", value: "number" },
        { label: "布尔", value: "boolean" },
        { label: "数组", value: "array" },
        { label: "对象", value: "object" },
        { label: "日期", value: "date" },
    ];
    const operatorLabels: Record<string, string> = {
        EQ: "等于",
        NE: "不等于",
        GT: "大于",
        GTE: "大于等于",
        LT: "小于",
        LTE: "小于等于",
        IN: "属于",
        NOT_IN: "不属于",
        CONTAINS: "包含",
        NOT_CONTAINS: "不包含",
        EMPTY: "为空",
        NOT_EMPTY: "不为空",
    };
    const defaultOperators: Record<AbacFieldDataType, string[]> = {
        string: ["EQ", "NE", "IN", "NOT_IN", "EMPTY", "NOT_EMPTY"],
        number: ["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "EMPTY", "NOT_EMPTY"],
        boolean: ["EQ", "NE"],
        array: ["CONTAINS", "NOT_CONTAINS", "EMPTY", "NOT_EMPTY"],
        object: ["EMPTY", "NOT_EMPTY"],
        date: ["EQ", "NE", "GT", "GTE", "LT", "LTE", "EMPTY", "NOT_EMPTY"],
    };
    const operatorOptions = computed(() =>
        Object.keys(operatorLabels).map((operator) => ({
            label: operatorLabels[operator],
            value: operator,
        })),
    );
    const columns: ProColumns[] = [
        { title: "字段 Key", dataIndex: "key", slotName: "key", width: 260 },
        { title: "显示名称", dataIndex: "label", width: 180 },
        { title: "来源", dataIndex: "source", slotName: "source", width: 170 },
        { title: "数据类型", dataIndex: "dataType", slotName: "dataType", width: 110 },
        { title: "操作符", dataIndex: "operators", slotName: "operators", width: 260 },
        { title: "引用", dataIndex: "usageCount", width: 90 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 90 },
        { title: "更新于", dataIndex: "updatedAt", width: 190 },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 120,
            fixed: "right",
            align: "center",
            hideInSearch: true,
        },
    ];

    watch(targetApp, () => {
        void reloadFieldTable();
    });

    function setFieldTableAction(action: ActionType) {
        fieldTableAction.value = action;
    }

    async function requestFields(params: GiTableRequestParams): Promise<RequestData<AbacFieldDto>> {
        const fieldResponse = await getAbacFieldRegistryApi(targetApp.value, {
            category: category.value,
            keyword: keyword.value || undefined,
            status: status.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        return {
            data: fieldResponse.data.fields,
            total: fieldResponse.data.pagination?.total,
            success: true,
        };
    }

    async function reloadFieldTable(resetPageIndex = true) {
        await fieldTableAction.value?.reload(resetPageIndex);
    }

    function handleCategoryChange() {
        void reloadFieldTable();
    }

    function resetSearch() {
        keyword.value = "";
        status.value = undefined;
        void reloadFieldTable();
    }

    function openCreate() {
        Object.assign(form, createEmptyForm());
        modalVisible.value = true;
    }

    function openEdit(record: AbacFieldDto) {
        Object.assign(form, {
            id: record.id,
            key: record.key,
            label: record.label,
            description: record.description ?? "",
            category: record.category ?? category.value,
            dataType: record.dataType,
            operators: [...record.operators],
            status: record.status ?? "ENABLE",
            locked: record.locked,
            builtin: record.builtin,
        });
        modalVisible.value = true;
    }

    async function save() {
        if (!form.key.trim()) {
            Message.warning("字段 Key 不能为空");
            return false;
        }
        saving.value = true;
        try {
            const response = await saveAbacFieldApi(targetApp.value, {
                id: form.id,
                key: form.key,
                label: form.label,
                description: form.description,
                category: form.category,
                dataType: form.dataType,
                operators: form.operators,
                status: form.status,
            });
            if (!response.data.saved) {
                Message.warning(response.data.reason || "保存失败");
                return false;
            }
            Message.success("字段已保存");
            modalVisible.value = false;
            await reloadFieldTable();
            return true;
        } finally {
            saving.value = false;
        }
    }

    async function toggleStatus(record: AbacFieldDto, enabled: boolean) {
        const response = await saveAbacFieldApi(targetApp.value, {
            ...record,
            status: enabled ? "ENABLE" : "DISABLE",
        });
        if (!response.data.saved) {
            Message.warning(response.data.reason || "状态更新失败");
        }
        await reloadFieldTable(false);
    }

    async function remove(record: AbacFieldDto) {
        if (!record.id) return;
        const response = await deleteAbacFieldApi(targetApp.value, record.id);
        if (!response.data.deleted) {
            Message.warning(response.data.reason || "删除失败");
            return;
        }
        Message.success("字段已删除");
        await reloadFieldTable(false);
    }

    function resetOperators() {
        form.operators = [...defaultOperators[form.dataType]];
    }

    function sourceLabel(source: string | undefined) {
        const labels: Record<string, string> = {
            SESSION_DISCOVERED: "会话字段",
            CUSTOM: "自定义字段",
            SYSTEM_BUILTIN: "系统内置",
        };
        return source ? (labels[source] ?? source) : "-";
    }

    function dataTypeLabel(dataType: AbacFieldDataType) {
        return dataTypeOptions.find((option) => option.value === dataType)?.label ?? dataType;
    }

    function operatorLabel(operator: string) {
        return operatorLabels[operator] ?? operator;
    }

    function createEmptyForm(): FieldForm {
        return {
            id: undefined,
            key: "ext.",
            label: "",
            description: "",
            category: "USER_EXTENSION",
            dataType: "string",
            operators: [...defaultOperators.string],
            status: "ENABLE",
            locked: false,
            builtin: false,
        };
    }
</script>

<style scoped lang="scss">
    .abac-field-tabs {
        margin-bottom: 12px;
    }

    .abac-field-search {
        width: 100%;
    }
</style>
