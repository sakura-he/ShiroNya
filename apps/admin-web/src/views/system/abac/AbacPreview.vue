<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>ABAC 编译预览</template>
            <template #subtitle>Cerbos 资源策略 JSON</template>
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

        <a-space
            direction="vertical"
            fill
            size="large"
        >
            <a-alert
                type="info"
                show-icon
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

            <a-descriptions
                v-if="preview"
                :column="{ xs: 1, md: 3 }"
                bordered
            >
                <a-descriptions-item label="策略包哈希">
                    <a-typography-text code>{{ preview.bundleHash }}</a-typography-text>
                </a-descriptions-item>
                <a-descriptions-item label="策略数">
                    {{ preview.policies.length }}
                </a-descriptions-item>
                <a-descriptions-item label="生成时间">
                    {{ preview.generatedAt }}
                </a-descriptions-item>
            </a-descriptions>

            <a-card :bordered="true">
                <GiTable
                    row-key="policyId"
                    header-title="策略"
                    :columns="columns"
                    :data="preview?.policies ?? []"
                    :pagination="false"
                    :search="false"
                    :options="tableOptions"
                    :scroll="{ x: '100%', y: '100%', minWidth: 980 }"
                    bordered
                    @refresh="refresh"
                >
                    <template #policyId="{ record }">
                        <a-typography-text code>{{ record.policyId }}</a-typography-text>
                    </template>
                    <template #sourceType="{ record }">
                        <a-tag :color="record.sourceType === 'BUILTIN_MAIN' ? 'green' : 'purple'">
                            {{ sourceTypeLabel(record.sourceType) }}
                        </a-tag>
                    </template>
                    <template #action="{ record }">
                        <a-link @click="selectPolicy(record)">查看</a-link>
                    </template>
                </GiTable>
            </a-card>

            <a-card v-if="selectedPolicy">
                <template #title>{{ selectedPolicy.policyId }}</template>
                <CodeViewer
                    :value="stringifyJson(selectedPolicy.policy)"
                    language="json"
                    readonly
                    height="420px"
                />
            </a-card>

            <a-alert
                v-if="preview?.warnings?.length"
                type="warning"
                show-icon
            >
                <template #title>警告</template>
                <div
                    v-for="warning in preview.warnings"
                    :key="warning"
                >
                    {{ warning }}
                </div>
            </a-alert>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getAbacCompilePreviewApi,
        getAbacHealthApi,
        type AbacCompileResponse,
        type AbacCompiledPolicy,
    } from "@/api/abac";
    import { CodeViewer } from "@/components/CodeViewer";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { computed, onMounted, ref, watch } from "vue";
    import { stringifyJson, tableOptions, useAbacTarget } from "./abacShared";

    defineOptions({ name: "AbacPreview" });

    const targetApp = useAbacTarget();
    const loading = ref(false);
    const health = ref<Record<string, any> | null>(null);
    const preview = ref<AbacCompileResponse | null>(null);
    const selectedPolicyId = ref("");
    const operationTips = [
        "预览只读取数据库并编译，不会发布到 Cerbos；可以先检查生成的策略、策略包哈希和警告。",
        "后端编译时会读取字段白名单、权限码和策略组，组装成内置 ABAC Cerbos 资源策略。",
        "字段 Key 直接进入表达式，例如 session.user.createdAt 会生成 request.principal.attr.session.user.createdAt。",
    ];

    const columns: ProColumns[] = [
        { title: "Policy ID", dataIndex: "policyId", slotName: "policyId", width: 280 },
        { title: "来源", dataIndex: "sourceType", slotName: "sourceType", width: 160 },
        { title: "资源", dataIndex: "resourceName", width: 240 },
        { title: "规则数", dataIndex: "ruleCount", width: 100 },
        { title: "Actions", dataIndex: "actionCount", width: 100 },
        { title: "内容哈希", dataIndex: "contentHash", width: 280 },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 90,
            fixed: "right",
        },
    ];

    const selectedPolicy = computed(() => {
        const policies = preview.value?.policies ?? [];
        return (
            policies.find((item) => item.policyId === selectedPolicyId.value) ?? policies[0] ?? null
        );
    });

    function selectPolicy(record: AbacCompiledPolicy) {
        selectedPolicyId.value = record.policyId;
    }

    function sourceTypeLabel(sourceType: string) {
        const labels: Record<string, string> = {
            BUILTIN_MAIN: "内置主策略",
        };
        return labels[sourceType] ?? sourceType;
    }

    async function refresh() {
        loading.value = true;
        try {
            const [healthResponse, previewResponse] = await Promise.all([
                getAbacHealthApi(targetApp.value),
                getAbacCompilePreviewApi(targetApp.value),
            ]);
            health.value = healthResponse.data;
            preview.value = previewResponse.data;
            selectedPolicyId.value = previewResponse.data.policies[0]?.policyId ?? "";
        } finally {
            loading.value = false;
        }
    }

    watch(targetApp, () => {
        void refresh();
    });

    onMounted(() => {
        void refresh();
    });
</script>

<style scoped lang="scss">
    .json-viewer {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 360px;
    }
</style>
