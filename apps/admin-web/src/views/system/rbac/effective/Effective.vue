<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>RBAC Effective</template>
            <template #subtitle>试算、写入和查看 RBAC effective 读模型</template>
            <template #extra>
                <a-space size="small">
                    <a-button
                        size="small"
                        :loading="overviewLoading"
                        @click="loadOverview"
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
            <a-card
                title="模型概览"
                :bordered="true"
                :loading="overviewLoading"
            >
                <a-row :gutter="[12, 12]">
                    <a-col
                        v-for="item in overviewItems"
                        :key="item.label"
                        :xs="12"
                        :md="6"
                        :lg="4"
                    >
                        <a-statistic
                            :title="item.label"
                            :value="item.value"
                        />
                    </a-col>
                </a-row>
            </a-card>

            <a-card
                title="用户 Effective 状态"
                :bordered="true"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-space
                        wrap
                        size="small"
                    >
                        <a-input
                            v-model="queryUserId"
                            allow-clear
                            placeholder="输入后台用户 ID"
                            style="width: 360px; max-width: 100%"
                        />
                        <a-button
                            type="primary"
                            :loading="queryLoading"
                            :disabled="!queryUserId.trim()"
                            @click="queryUserState"
                        >
                            查询
                        </a-button>
                    </a-space>

                    <a-descriptions
                        v-if="userState"
                        bordered
                        :column="4"
                    >
                        <a-descriptions-item label="用户 ID">
                            {{ userState.userId }}
                        </a-descriptions-item>
                        <a-descriptions-item label="超级管理员">
                            <a-tag :color="userState.isSuperAdmin ? 'gold' : 'gray'">
                                {{ userState.isSuperAdmin ? "是" : "否" }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="有效角色">
                            {{ userState.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效权限">
                            {{ userState.permissionIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="可见菜单">
                            {{ userState.visibleMenuIds.length }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-card
                        v-if="userState"
                        title="Effective ID 明细"
                        :bordered="true"
                    >
                        <a-descriptions
                            bordered
                            :column="1"
                        >
                            <a-descriptions-item label="角色">
                                <IdTags
                                    prefix="role"
                                    :ids="userState.roleIds"
                                />
                            </a-descriptions-item>
                            <a-descriptions-item label="权限">
                                <IdTags
                                    prefix="permission"
                                    :ids="userState.permissionIds"
                                />
                            </a-descriptions-item>
                            <a-descriptions-item label="菜单">
                                <IdTags
                                    prefix="menu"
                                    :ids="userState.visibleMenuIds"
                                />
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-card>
                </a-space>
            </a-card>

            <a-card
                title="手动 Rebuild"
                :bordered="true"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-textarea
                        v-model="rebuildUserIdsText"
                        placeholder="可选：输入用户 ID，多个 ID 使用换行或逗号分隔；留空则重建全部用户"
                        :auto-size="{ minRows: 3, maxRows: 6 }"
                    />
                    <a-space
                        wrap
                        size="small"
                    >
                        <a-button
                            type="primary"
                            :loading="previewLoading"
                            @click="previewRebuild"
                        >
                            试算重建
                        </a-button>
                        <a-popconfirm
                            content="确定写入 RBAC effective 读模型吗？"
                            @ok="applyRebuild"
                        >
                            <a-button
                                status="warning"
                                :loading="applyLoading"
                            >
                                应用重建
                            </a-button>
                        </a-popconfirm>
                    </a-space>

                    <a-descriptions
                        v-if="summary"
                        bordered
                        :column="5"
                    >
                        <a-descriptions-item label="用户">
                            {{ summary.userCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效角色">
                            {{ summary.effectiveRoleCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效权限">
                            {{ summary.effectivePermissionCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="可见菜单">
                            {{ summary.visibleMenuCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="超级管理员">
                            {{ summary.superAdminUserCount }}
                        </a-descriptions-item>
                        <a-descriptions-item
                            v-if="summary.version"
                            label="版本"
                            :span="5"
                        >
                            <a-typography-text code>
                                {{ summary.version }}
                            </a-typography-text>
                        </a-descriptions-item>
                    </a-descriptions>

                    <GiTable
                        v-if="summary"
                        row-key="userId"
                        header-title="样本用户"
                        :columns="sampleColumns"
                        :data="summary.sample"
                        :pagination="false"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', y: 360, minWidth: 880 }"
                        bordered
                    >
                        <template #isSuperAdmin="{ record }">
                            <a-tag :color="record.isSuperAdmin ? 'gold' : 'gray'">
                                {{ record.isSuperAdmin ? "是" : "否" }}
                            </a-tag>
                        </template>
                        <template #roleCount="{ record }">
                            {{ record.roleIds.length }}
                        </template>
                        <template #permissionCount="{ record }">
                            {{ record.permissionIds.length }}
                        </template>
                        <template #menuCount="{ record }">
                            {{ record.visibleMenuIds.length }}
                        </template>
                    </GiTable>
                </a-space>
            </a-card>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        applyRbacRebuildApi,
        getRbacEffectiveOverviewApi,
        previewRbacRebuildApi,
        queryRbacUserEffectiveStateApi,
        type RbacEffectiveStateDto,
        type RbacRebuildSummaryDto,
    } from "@/api/rbac/effective";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, defineComponent, h, onMounted, ref } from "vue";

    defineOptions({ name: "RbacEffective" });

    type RbacEffectiveOverview = {
        sources: {
            roleCount: number;
            groupCount: number;
            permissionCount: number;
            userRoleCount: number;
            groupMemberCount: number;
            groupRoleCount: number;
            rolePermissionCount: number;
            menuCount: number;
        };
        effective: {
            effectiveRoleCount: number;
            effectivePermissionCount: number;
            visibleMenuCount: number;
        };
    };

    const IdTags = defineComponent({
        name: "RbacIdTags",
        props: {
            prefix: {
                type: String,
                required: true,
            },
            ids: {
                type: Array as () => Array<string | number>,
                required: true,
            },
        },
        setup(props) {
            return () => {
                if (props.ids.length === 0) {
                    return h("span", "-");
                }
                return h(
                    "div",
                    { class: "rbac-id-tags" },
                    props.ids.map((id) =>
                        h(
                            "span",
                            {
                                class: "rbac-id-tag",
                                key: `${props.prefix}:${id}`,
                            },
                            `${props.prefix}:${id}`,
                        ),
                    ),
                );
            };
        },
    });

    const overview = ref<RbacEffectiveOverview | null>(null);
    const overviewLoading = ref(false);
    const queryUserId = ref("");
    const queryLoading = ref(false);
    const userState = ref<RbacEffectiveStateDto | null>(null);
    const rebuildUserIdsText = ref("");
    const previewLoading = ref(false);
    const applyLoading = ref(false);
    const summary = ref<RbacRebuildSummaryDto | null>(null);
    const tableOptions = { reload: false, density: true, setting: true };

    const overviewItems = computed(() => {
        const sources = overview.value?.sources;
        const effective = overview.value?.effective;
        return [
            { label: "角色", value: sources?.roleCount ?? 0 },
            { label: "用户组", value: sources?.groupCount ?? 0 },
            { label: "权限", value: sources?.permissionCount ?? 0 },
            { label: "用户角色", value: sources?.userRoleCount ?? 0 },
            { label: "组成员", value: sources?.groupMemberCount ?? 0 },
            { label: "组角色", value: sources?.groupRoleCount ?? 0 },
            { label: "角色权限", value: sources?.rolePermissionCount ?? 0 },
            { label: "菜单声明", value: sources?.menuCount ?? 0 },
            { label: "Effective 角色", value: effective?.effectiveRoleCount ?? 0 },
            { label: "Effective 权限", value: effective?.effectivePermissionCount ?? 0 },
            { label: "可见菜单", value: effective?.visibleMenuCount ?? 0 },
        ];
    });

    const sampleColumns: ProColumns[] = [
        { title: "用户 ID", dataIndex: "userId", width: 260 },
        { title: "超级管理员", dataIndex: "isSuperAdmin", slotName: "isSuperAdmin", width: 120 },
        { title: "角色数", dataIndex: "roleCount", slotName: "roleCount", width: 100 },
        { title: "权限数", dataIndex: "permissionCount", slotName: "permissionCount", width: 100 },
        { title: "菜单数", dataIndex: "menuCount", slotName: "menuCount", width: 100 },
    ];

    function parseUserIds() {
        const userIds = rebuildUserIdsText.value
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean);
        return userIds.length > 0 ? userIds : undefined;
    }

    async function loadOverview() {
        overviewLoading.value = true;
        try {
            const response = await getRbacEffectiveOverviewApi();
            overview.value = response.data as RbacEffectiveOverview;
        } finally {
            overviewLoading.value = false;
        }
    }

    async function queryUserState() {
        const userId = queryUserId.value.trim();
        if (!userId) return;
        queryLoading.value = true;
        try {
            const response = await queryRbacUserEffectiveStateApi({ userId });
            userState.value = response.data;
        } finally {
            queryLoading.value = false;
        }
    }

    async function previewRebuild() {
        previewLoading.value = true;
        try {
            const response = await previewRbacRebuildApi({ userIds: parseUserIds() });
            summary.value = response.data;
            Message.success("RBAC effective 重建试算已生成");
        } finally {
            previewLoading.value = false;
        }
    }

    async function applyRebuild() {
        applyLoading.value = true;
        try {
            const response = await applyRbacRebuildApi({ userIds: parseUserIds() });
            summary.value = response.data;
            Message.success("RBAC effective 读模型已写入");
            await loadOverview();
        } finally {
            applyLoading.value = false;
        }
    }

    onMounted(() => {
        void loadOverview();
    });
</script>

<style scoped>
    .rbac-id-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .rbac-id-tag {
        display: inline-flex;
        max-width: 100%;
        padding: 1px 8px;
        overflow: hidden;
        color: var(--color-text-2);
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
        font-size: 12px;
        line-height: 22px;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: var(--color-fill-2);
        border-radius: 4px;
    }
</style>
