<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>Cerbos 手写策略</template>
            <template #subtitle>独立保存和校验完整 Cerbos 资源策略</template>
            <template #extra>
                <a-space wrap>
                    <a-tag color="arcoblue">{{ targetApp }}</a-tag>
                    <a-tag
                        v-if="health"
                        color="arcoblue"
                    >
                        {{ health.activeRelease?.revision ?? "未发布" }}
                    </a-tag>
                    <a-button
                        size="small"
                        :loading="loading"
                        @click="refresh"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                        刷新
                    </a-button>
                </a-space>
            </template>
        </a-page-header>

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
                header-title="手写策略"
                :columns="columns"
                :data="policies"
                :pagination="false"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1560 }"
                bordered
                @refresh="refresh"
            >
                <template #custom-extra>
                    <a-button
                        type="primary"
                        size="small"
                        @click="openCreate"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        新增手写策略
                    </a-button>
                </template>
                <template #id="{ record }">
                    <a-typography-text code>{{ record.id }}</a-typography-text>
                </template>
                <template #name="{ record }">
                    <a-typography-text>{{ record.name }}</a-typography-text>
                </template>
                <template #description="{ record }">
                    <a-typography-text type="secondary">
                        {{ record.description || "-" }}
                    </a-typography-text>
                </template>
                <template #resource="{ record }">
                    <a-typography-text code>{{ record.cerbosResource }}</a-typography-text>
                </template>
                <template #validateStatus="{ record }">
                    <a-tag :color="record.validateStatus === 'VALID' ? 'green' : 'red'">
                        {{ validationStatusLabel(record.validateStatus) }}
                    </a-tag>
                </template>
                <template #actions="{ record }">
                    <a-space wrap>
                        <a-tag
                            v-for="action in record.actionCodes"
                            :key="action"
                            color="purple"
                        >
                            {{ action }}
                        </a-tag>
                        <span v-if="!record.actionCodes.length">-</span>
                    </a-space>
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <a-link @click="openEdit(record)">编辑</a-link>
                        <a-popconfirm
                            content="确认删除？"
                            @ok="remove(record.id)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
            </GiTable>
        </a-card>

        <a-modal
            v-model:visible="modalVisible"
            title="手写策略"
            fullscreen
            :body-style="{ height: 'calc(100vh - 108px)', overflow: 'hidden' }"
            :ok-loading="saving"
            @ok="save"
        >
            <div class="manual-policy-editor">
                <a-form
                    :model="manualPolicyForm"
                    layout="vertical"
                    class="manual-policy-editor__meta"
                >
                    <a-grid
                        :cols="{ xs: 1, md: 2 }"
                        :col-gap="16"
                    >
                        <a-grid-item>
                            <a-form-item
                                label="名称"
                                required
                            >
                                <a-input
                                    v-model="editingPolicyName"
                                    placeholder="请输入手写策略名称"
                                    allow-clear
                                />
                            </a-form-item>
                        </a-grid-item>
                        <a-grid-item>
                            <a-form-item label="描述">
                                <a-textarea
                                    v-model="editingPolicyDescription"
                                    placeholder="可选，描述该策略的用途"
                                    :auto-size="{ minRows: 1, maxRows: 3 }"
                                    allow-clear
                                />
                            </a-form-item>
                        </a-grid-item>
                    </a-grid>
                </a-form>
                <div class="manual-policy-editor__main">
                    <div class="manual-policy-editor__label">Cerbos 策略 JSON</div>
                    <CodeViewer
                        v-model:value="contentText"
                        language="json"
                        :readonly="false"
                        height="100%"
                        class="manual-policy-editor__code"
                    />
                </div>
                <a-alert
                    v-if="validation"
                    class="manual-policy-editor__validation"
                    :type="validation.valid ? 'success' : 'error'"
                    show-icon
                >
                    <template #title>{{ validation.valid ? "校验通过" : "校验失败" }}</template>
                    <a-space
                        direction="vertical"
                        fill
                    >
                        <div
                            v-for="error in validation.errors"
                            :key="error"
                        >
                            {{ error }}
                        </div>
                        <div
                            v-for="warning in validation.warnings"
                            :key="warning"
                        >
                            {{ warning }}
                        </div>
                    </a-space>
                </a-alert>
            </div>
            <template #footer>
                <a-button
                    :loading="validating"
                    @click="validate"
                >
                    校验
                </a-button>
                <a-button @click="modalVisible = false">取消</a-button>
                <a-button
                    type="primary"
                    :loading="saving"
                    @click="save"
                >
                    保存
                </a-button>
            </template>
        </a-modal>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        deleteAbacManualPolicyApi,
        getAbacHealthApi,
        getAbacManualPoliciesApi,
        saveAbacManualPolicyApi,
        validateAbacManualPolicyApi,
        type AbacManualPolicyDto,
        type AbacManualValidation,
    } from "@/api/abac";
    import { CodeViewer } from "@/components/CodeViewer";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { onMounted, ref, watch } from "vue";
    import {
        parseJsonObject,
        showJsonError,
        stringifyJson,
        tableOptions,
        useAbacTarget,
    } from "./abacShared";

    defineOptions({ name: "AbacManualPolicies" });

    const targetApp = useAbacTarget();
    const loading = ref(false);
    const saving = ref(false);
    const validating = ref(false);
    const modalVisible = ref(false);
    const policies = ref<AbacManualPolicyDto[]>([]);
    const health = ref<Record<string, any> | null>(null);
    const manualPolicyForm = {};
    const contentText = ref("");
    const validation = ref<AbacManualValidation | null>(null);
    const editingPolicyId = ref<number | undefined>();
    const editingPolicyName = ref("");
    const editingPolicyDescription = ref("");
    const editingPolicyStatus = ref<AbacManualPolicyDto["status"]>("ENABLE");
    const operationTips = [
        "手写策略独立保存到 Cerbos 手写策略表，独立于数据库驱动的内置策略组。",
        "需要资源级手写 Cerbos 策略时，请在业务接口使用 @app/cerbos 的 @CerbosPolicy 直接声明 resource/action。",
        "resource、version、actions 均以后面的完整 Cerbos JSON 为准，保存后由后端解析到列表展示。",
    ];
    const defaultPolicy = {
        apiVersion: "api.cerbos.dev/v1",
        resourcePolicy: {
            resource: "manual_example_resource",
            version: "default",
            rules: [
                {
                    name: "allow_when_level_high",
                    actions: ["system.example.approve"],
                    roles: ["*"],
                    effect: "EFFECT_ALLOW",
                    condition: {
                        match: {
                            expr: "request.principal.attr.session.profile.level >= 10",
                        },
                    },
                },
            ],
        },
    };

    const columns: ProColumns[] = [
        { title: "ID", dataIndex: "id", slotName: "id", width: 90 },
        { title: "名称", dataIndex: "name", slotName: "name", width: 180 },
        { title: "描述", dataIndex: "description", slotName: "description", width: 240 },
        { title: "Resource", dataIndex: "cerbosResource", slotName: "resource", width: 260 },
        { title: "Version", dataIndex: "cerbosVersion", width: 120 },
        { title: "校验状态", dataIndex: "validateStatus", slotName: "validateStatus", width: 120 },
        { title: "Actions", dataIndex: "actionCodes", slotName: "actions", width: 320 },
        { title: "更新时间", dataIndex: "updatedAt", width: 210 },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 110,
            fixed: "right",
        },
    ];

    function openCreate() {
        editingPolicyId.value = undefined;
        editingPolicyName.value = "";
        editingPolicyDescription.value = "";
        editingPolicyStatus.value = "ENABLE";
        contentText.value = stringifyJson(defaultPolicy);
        validation.value = null;
        modalVisible.value = true;
    }

    function openEdit(record: AbacManualPolicyDto) {
        editingPolicyId.value = record.id;
        editingPolicyName.value = record.name;
        editingPolicyDescription.value = record.description ?? "";
        editingPolicyStatus.value = record.status;
        contentText.value = stringifyJson(record.content);
        validation.value = null;
        modalVisible.value = true;
    }

    async function refresh() {
        loading.value = true;
        try {
            const [healthResponse, policyResponse] = await Promise.all([
                getAbacHealthApi(targetApp.value),
                getAbacManualPoliciesApi(targetApp.value),
            ]);
            health.value = healthResponse.data;
            policies.value = policyResponse.data.policies;
        } finally {
            loading.value = false;
        }
    }

    async function validate() {
        let content: Record<string, unknown>;
        try {
            content = parseJsonObject(contentText.value);
        } catch (error) {
            showJsonError(error);
            return null;
        }
        validating.value = true;
        try {
            const response = await validateAbacManualPolicyApi(targetApp.value, content);
            validation.value = response.data;
            return response.data;
        } finally {
            validating.value = false;
        }
    }

    async function save() {
        const name = editingPolicyName.value.trim();
        if (!name) {
            Message.warning("请输入手写策略名称");
            return;
        }
        let content: Record<string, unknown>;
        try {
            content = parseJsonObject(contentText.value);
        } catch (error) {
            showJsonError(error);
            return;
        }
        saving.value = true;
        try {
            const response = await saveAbacManualPolicyApi(targetApp.value, {
                id: editingPolicyId.value,
                name,
                description: editingPolicyDescription.value.trim() || null,
                status: editingPolicyStatus.value,
                content,
            });
            validation.value = response.data.validation;
            if (!response.data.saved) {
                Message.warning(response.data.reason || "保存失败");
                return;
            }
            modalVisible.value = false;
            await refresh();
        } finally {
            saving.value = false;
        }
    }

    async function remove(id: number) {
        await deleteAbacManualPolicyApi(targetApp.value, id);
        await refresh();
    }

    function validationStatusLabel(status: string) {
        const labels: Record<string, string> = {
            VALID: "通过",
            INVALID: "失败",
            UNKNOWN: "未校验",
        };
        return labels[status] ?? status;
    }

    watch(targetApp, () => {
        void refresh();
    });

    onMounted(() => {
        void refresh();
    });
</script>

<style scoped lang="scss">
    .manual-policy-editor {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-height: 0;
    }

    .manual-policy-editor__main {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
        gap: 8px;
    }

    .manual-policy-editor__meta {
        flex: 0 0 auto;
    }

    .manual-policy-editor__meta :deep(.arco-form-item) {
        margin-bottom: 0;
    }

    .manual-policy-editor__label {
        flex: 0 0 auto;
        color: var(--color-text-2);
        font-size: 14px;
        line-height: 22px;
    }

    .manual-policy-editor__code {
        flex: 1;
        min-height: 0;
    }

    .manual-policy-editor__code :deep(.code-viewer__editor) {
        height: 100%;
        min-height: 0;
    }

    .manual-policy-editor__code :deep(.code-viewer__monaco) {
        height: 100%;
    }

    .manual-policy-editor__validation {
        flex: 0 0 auto;
        max-height: 180px;
        overflow: auto;
    }
</style>
