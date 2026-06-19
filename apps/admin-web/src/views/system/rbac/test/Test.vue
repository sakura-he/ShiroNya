<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>测试台</template>
            <template #subtitle>验证 RBAC permissionCode / code 的后端守卫结果</template>
            <template #extra>
                <a-button
                    size="small"
                    :loading="loading"
                    @click="loadOverview"
                >
                    <template #icon>
                        <icon-refresh />
                    </template>
                    刷新
                </a-button>
            </template>
        </a-page-header>

        <a-space
            direction="vertical"
            fill
            size="large"
        >
            <a-card :bordered="true">
                <a-descriptions
                    v-if="overview"
                    bordered
                    :column="4"
                >
                    <a-descriptions-item label="用户 ID">
                        <a-typography-text code>{{ overview.user.id }}</a-typography-text>
                    </a-descriptions-item>
                    <a-descriptions-item label="有效角色">
                        {{ overview.effectiveState.roleIds.length }}
                    </a-descriptions-item>
                    <a-descriptions-item label="有效权限">
                        {{ overview.effectiveState.permissionIds.length }}
                    </a-descriptions-item>
                    <a-descriptions-item label="超级管理员">
                        <a-tag :color="overview.effectiveState.isSuperAdmin ? 'gold' : 'gray'">
                            {{ overview.effectiveState.isSuperAdmin ? "是" : "否" }}
                        </a-tag>
                    </a-descriptions-item>
                </a-descriptions>
            </a-card>

            <a-card :bordered="true">
                <GiTable
                    row-key="code"
                    header-title="测试接口"
                    :columns="columns"
                    :request="requestPermissions"
                    :pagination="false"
                    :search="false"
                    :options="{ reload: false, density: false, setting: false }"
                    :scroll="{ x: '100%', y: '100%', minWidth: 980 }"
                    bordered
                >
                    <template #code="{ record }">
                        <a-typography-text code>{{ record.code }}</a-typography-text>
                    </template>
                    <template #method="{ record }">
                        <a-tag :color="record.method === 'GET' ? 'arcoblue' : 'green'">
                            {{ record.method }}
                        </a-tag>
                    </template>
                    <template #exists="{ record }">
                        <a-tag :color="record.exists ? 'green' : 'red'">
                            {{ record.exists ? "存在" : "缺失" }}
                        </a-tag>
                    </template>
                    <template #enabled="{ record }">
                        <a-tag :color="record.enabled ? 'green' : 'red'">
                            {{ record.enabled ? "启用" : "禁用" }}
                        </a-tag>
                    </template>
                    <template #allowed="{ record }">
                        <a-tag :color="record.allowed ? 'green' : 'red'">
                            {{ record.allowed ? "允许" : "拒绝" }}
                        </a-tag>
                    </template>
                    <template #action="{ record }">
                        <a-button
                            size="small"
                            type="primary"
                            :loading="actionLoading === record.key"
                            @click="runAction(record.key)"
                        >
                            调用
                        </a-button>
                    </template>
                </GiTable>
            </a-card>

            <a-card
                title="多权限接口"
                :bordered="true"
            >
                <a-space
                    direction="vertical"
                    fill
                >
                    <a-typography-paragraph>
                        <a-typography-text code>POST /admin/rbac/test/multi</a-typography-text>
                    </a-typography-paragraph>
                    <a-button
                        type="primary"
                        :loading="actionLoading === 'multi'"
                        @click="runAction('multi')"
                    >
                        调用多权限接口
                    </a-button>
                </a-space>
            </a-card>

            <a-card
                v-if="resultText"
                title="最近一次结果"
                :bordered="true"
            >
                <a-typography-paragraph
                    code
                    copyable
                >
                    {{ resultText }}
                </a-typography-paragraph>
            </a-card>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getRbacTestOverviewApi,
        runRbacTestActionApi,
        type RbacTestActionKey,
        type RbacTestActionResultDto,
        type RbacTestOverviewDto,
        type RbacTestPermissionDto,
    } from "@/api/rbac/test";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type GiTableRequestParams, type ProColumns } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, ref } from "vue";

    defineOptions({ name: "RbacTest" });

    const loading = ref(false);
    const actionLoading = ref<RbacTestActionKey | "">("");
    const overview = ref<RbacTestOverviewDto | null>(null);
    const lastResult = ref<RbacTestActionResultDto | null>(null);

    const resultText = computed(() => {
        return lastResult.value ? JSON.stringify(lastResult.value, null, 2) : "";
    });

    const columns: ProColumns[] = [
        { title: "名称", dataIndex: "name", width: 160 },
        { title: "编码", dataIndex: "code", slotName: "code", width: 260 },
        { title: "方法", dataIndex: "method", slotName: "method", width: 90 },
        { title: "路径", dataIndex: "path", width: 220 },
        { title: "权限行", dataIndex: "exists", slotName: "exists", width: 100 },
        { title: "状态", dataIndex: "enabled", slotName: "enabled", width: 100 },
        { title: "当前裁决", dataIndex: "allowed", slotName: "allowed", width: 110 },
        { title: "操作", dataIndex: "action", slotName: "action", fixed: "right", width: 100 },
    ];

    async function loadOverview() {
        loading.value = true;
        try {
            const response = await getRbacTestOverviewApi();
            overview.value = response.data;
        } finally {
            loading.value = false;
        }
    }

    async function requestPermissions(_params: GiTableRequestParams) {
        if (!overview.value) {
            await loadOverview();
        }
        return {
            data: (overview.value?.permissions ?? []) as RbacTestPermissionDto[],
            total: overview.value?.permissions.length ?? 0,
            success: true,
        };
    }

    async function runAction(action: RbacTestActionKey) {
        actionLoading.value = action;
        try {
            const response = await runRbacTestActionApi(action);
            lastResult.value = response.data;
            Message.success("接口已通过 RBAC 守卫");
            await loadOverview();
        } finally {
            actionLoading.value = "";
        }
    }
</script>
