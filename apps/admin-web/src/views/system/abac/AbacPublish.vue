<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>ABAC 发布</template>
            <template #subtitle>Cerbos Admin API 发布中心</template>
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
                header-title="发布记录"
                :columns="columns"
                :data="releases"
                :pagination="false"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1080 }"
                bordered
                @refresh="refresh"
            >
                <template #form-search>
                    <a-form
                        :model="publishForm"
                        layout="horizontal"
                        class="abac-publish-form"
                    >
                        <a-row :gutter="12">
                            <a-col
                                :xs="24"
                                :sm="14"
                                :md="12"
                                :lg="10"
                            >
                                <a-form-item
                                    field="reason"
                                    label="发布原因"
                                >
                                    <a-input
                                        v-model="reason"
                                        allow-clear
                                        placeholder="发布原因"
                                    />
                                </a-form-item>
                            </a-col>
                            <a-col
                                :xs="24"
                                :sm="10"
                                :md="12"
                                :lg="14"
                            >
                                <a-form-item label=" ">
                                    <a-space wrap>
                                        <a-button
                                            type="primary"
                                            size="small"
                                            :loading="previewing"
                                            @click="preview"
                                        >
                                            <template #icon>
                                                <icon-eye />
                                            </template>
                                            预览发布
                                        </a-button>
                                        <a-button
                                            status="success"
                                            size="small"
                                            :loading="publishing"
                                            @click="publish"
                                        >
                                            <template #icon>
                                                <icon-send />
                                            </template>
                                            发布
                                        </a-button>
                                    </a-space>
                                </a-form-item>
                            </a-col>
                        </a-row>
                    </a-form>
                    <a-descriptions
                        v-if="publishPreview"
                        class="publish-preview"
                        :column="{ xs: 1, md: 4 }"
                        bordered
                    >
                        <a-descriptions-item label="是否变更">
                            <a-tag :color="publishPreview.changed ? 'orange' : 'green'">
                                {{ publishPreview.changed ? "是" : "否" }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="策略数">
                            {{ publishPreview.policies.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="策略包哈希">
                            <a-typography-text code>
                                {{ publishPreview.bundleHash }}
                            </a-typography-text>
                        </a-descriptions-item>
                        <a-descriptions-item label="生效版本">
                            {{ publishPreview.activeRelease?.revision ?? "-" }}
                        </a-descriptions-item>
                    </a-descriptions>
                </template>
                <template #revision="{ record }">
                    <a-typography-text code>{{ record.revision }}</a-typography-text>
                </template>
                <template #status="{ record }">
                    <a-tag :color="statusColor(record.status)">
                        {{ releaseStatusLabel(record.status) }}
                    </a-tag>
                </template>
                <template #action="{ record }">
                    <a-popconfirm
                        content="确认回滚？"
                        @ok="rollback(record.revision)"
                    >
                        <a-link
                            status="warning"
                            :disabled="record.status === 'active'"
                        >
                            回滚
                        </a-link>
                    </a-popconfirm>
                </template>
            </GiTable>
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getAbacHealthApi,
        getAbacReleasesApi,
        previewAbacPublishApi,
        publishAbacApi,
        rollbackAbacReleaseApi,
        type AbacReleaseDto,
    } from "@/api/abac";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, onMounted, ref, watch } from "vue";
    import { tableOptions, useAbacTarget } from "./abacShared";

    defineOptions({ name: "AbacPublish" });

    const targetApp = useAbacTarget();
    const loading = ref(false);
    const previewing = ref(false);
    const publishing = ref(false);
    const health = ref<Record<string, any> | null>(null);
    const publishPreview = ref<any>(null);
    const releases = ref<AbacReleaseDto[]>([]);
    const reason = ref("");
    const publishForm = computed(() => ({ reason: reason.value }));
    const operationTips = [
        "先点预览发布确认是否变更、策略数量和策略包哈希；没有变化时可以不发布。",
        "发布会把当前数据库编译结果写入 Cerbos Admin API，成功后成为生效发布，运行时只使用生效版本。",
        "回滚会把历史版本恢复为生效状态；发布原因会进入发布记录，方便排查权限变更。",
    ];

    const columns: ProColumns[] = [
        { title: "版本号", dataIndex: "revision", slotName: "revision", width: 260 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 130 },
        { title: "策略数", dataIndex: "policyCount", width: 110 },
        { title: "策略包哈希", dataIndex: "bundleHash", width: 280 },
        { title: "发布时间", dataIndex: "publishedAt", width: 210 },
        { title: "错误信息", dataIndex: "errorMessage", width: 220 },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 100,
            fixed: "right",
        },
    ];

    function statusColor(status: string) {
        if (status === "active") return "green";
        if (status === "failed") return "red";
        if (status === "rolled_back") return "orange";
        return "gray";
    }

    function releaseStatusLabel(status: string) {
        const labels: Record<string, string> = {
            pending: "待发布",
            active: "生效中",
            superseded: "已被替换",
            failed: "发布失败",
            rolled_back: "已回滚",
        };
        return labels[status] ?? status;
    }

    async function refresh() {
        loading.value = true;
        try {
            const [healthResponse, releaseResponse] = await Promise.all([
                getAbacHealthApi(targetApp.value),
                getAbacReleasesApi(targetApp.value),
            ]);
            health.value = healthResponse.data;
            releases.value = releaseResponse.data.releases;
        } finally {
            loading.value = false;
        }
    }

    async function preview() {
        previewing.value = true;
        try {
            const response = await previewAbacPublishApi(targetApp.value);
            publishPreview.value = response.data;
        } finally {
            previewing.value = false;
        }
    }

    async function publish() {
        publishing.value = true;
        try {
            const response = await publishAbacApi(targetApp.value, reason.value || undefined);
            if (!response.data.published) {
                Message.error(response.data.errorMessage || "发布失败");
                return;
            }
            Message.success("发布成功");
            await refresh();
            await preview();
        } finally {
            publishing.value = false;
        }
    }

    async function rollback(revision: string) {
        const response = await rollbackAbacReleaseApi(targetApp.value, revision);
        if (!response.data.rolledBack) {
            Message.error(response.data.reason || "回滚失败");
            return;
        }
        Message.success("回滚成功");
        await refresh();
    }

    watch(targetApp, () => {
        publishPreview.value = null;
        void refresh();
    });

    onMounted(() => {
        void refresh();
    });
</script>

<style scoped lang="scss">
    .abac-publish-form {
        :deep(.arco-form-item) {
            margin-bottom: 0;
        }
    }

    .publish-preview {
        margin-top: 12px;
    }
</style>
