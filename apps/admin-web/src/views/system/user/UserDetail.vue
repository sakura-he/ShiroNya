<template>
    <GiPageLayout>
        <a-page-header
            :show-back="true"
            @back="backToSourceTab"
        >
            <template #title>用户详情</template>
            <template #subtitle>查看用户基础信息与 SpiceDB 可见关系</template>
            <template #extra>
                <a-space>
                    <a-button
                        size="small"
                        @click="backToSourceTab"
                    >
                        返回来源页
                    </a-button>
                    <a-button
                        size="small"
                        type="primary"
                        :loading="loading"
                        @click="reloadDetail"
                    >
                        刷新
                    </a-button>
                </a-space>
            </template>
        </a-page-header>

        <a-spin
            :loading="loading"
            class="tw:w-full"
        >
            <a-space
                v-if="relations"
                direction="vertical"
                fill
                size="large"
            >
                <a-card
                    title="基础信息"
                    :bordered="false"
                >
                    <a-descriptions
                        bordered
                        :column="{ xs: 1, sm: 1, md: 2, lg: 3 }"
                    >
                        <a-descriptions-item label="用户 Resource">
                            <SpiceDBObjectText
                                type="user"
                                :id="relations.user.id"
                                copyable
                            />
                        </a-descriptions-item>
                        <a-descriptions-item label="用户名">
                            {{ relations.user.username || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="姓名">
                            {{ relations.user.name || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="邮箱">
                            {{ relations.user.email || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="手机号">
                            {{ relations.user.phoneNumber || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁">
                            <a-tag :color="relations.user.banned ? 'red' : 'green'">
                                {{ relations.user.banned ? "已封禁" : "正常" }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="最近登录">
                            {{ relations.user.lastLoginAt || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="创建时间">
                            {{ relations.user.createdAt || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item
                            label="备注"
                            :span="3"
                        >
                            {{ relations.user.remark || "-" }}
                        </a-descriptions-item>
                    </a-descriptions>
                </a-card>

                <a-row :gutter="[16, 16]">
                    <a-col
                        :xs="24"
                        :md="6"
                    >
                        <a-card :bordered="false">
                            <a-statistic
                                title="直接角色"
                                :value="relations.user.roleIds.length"
                            />
                        </a-card>
                    </a-col>
                    <a-col
                        :xs="24"
                        :md="6"
                    >
                        <a-card :bordered="false">
                            <a-statistic
                                title="继承角色"
                                :value="relations.inheritedRoleIds.length"
                            />
                        </a-card>
                    </a-col>
                    <a-col
                        :xs="24"
                        :md="6"
                    >
                        <a-card :bordered="false">
                            <a-statistic
                                title="用户组"
                                :value="relations.userGroupIds.length"
                            />
                        </a-card>
                    </a-col>
                    <a-col
                        :xs="24"
                        :md="6"
                    >
                        <a-card :bordered="false">
                            <a-statistic
                                title="可见菜单"
                                :value="relations.visibleMenuIds.length"
                            />
                        </a-card>
                    </a-col>
                </a-row>

                <a-card
                    title="关系视图"
                    :bordered="false"
                >
                    <a-tabs default-active-key="roles">
                        <a-tab-pane
                            key="roles"
                            title="角色关系"
                        >
                            <GiTable
                                header-title="有效角色"
                                row-key="id"
                                :columns="roleColumns"
                                :request="getEffectiveRoleTableData"
                                :search="false"
                                :pagination="{ pageSize: 10 }"
                                :options="tableOptions"
                                :scroll="{ x: '100%', minWidth: 780 }"
                                :scrollbar="true"
                                :bordered="true"
                                :action-ref="setEffectiveRoleTableAction"
                            >
                                <template #roleEntity="{ record }">
                                    <SpiceDBObjectText
                                        type="role"
                                        :id="record.id"
                                        copyable
                                    />
                                </template>
                                <template #roleStatus="{ record }">
                                    <a-tag :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'">
                                        {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                    </a-tag>
                                </template>
                            </GiTable>
                        </a-tab-pane>

                        <a-tab-pane
                            key="groups"
                            title="用户组"
                        >
                            <GiTable
                                header-title="用户组路径"
                                row-key="id"
                                :columns="groupColumns"
                                :request="getUserGroupTableData"
                                :search="false"
                                :pagination="{ pageSize: 10 }"
                                :options="tableOptions"
                                :scroll="{ x: '100%', minWidth: 860 }"
                                :scrollbar="true"
                                :bordered="true"
                                :action-ref="setUserGroupTableAction"
                            >
                                <template #groupEntity="{ record }">
                                    <SpiceDBObjectText
                                        type="user_group"
                                        :id="record.id"
                                        copyable
                                    />
                                </template>
                                <template #groupStatus="{ record }">
                                    <a-tag :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'">
                                        {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                    </a-tag>
                                </template>
                                <template #roleCount="{ record }">
                                    {{ record.roleIds?.length ?? 0 }}
                                </template>
                            </GiTable>
                        </a-tab-pane>

                        <a-tab-pane
                            key="menus"
                            title="可见菜单"
                        >
                            <GiTable
                                header-title="可见菜单"
                                row-key="id"
                                :columns="menuColumns"
                                :request="getVisibleMenuTableData"
                                :search="false"
                                :pagination="{ pageSize: 10 }"
                                :options="tableOptions"
                                :scroll="{ x: '100%', minWidth: 920 }"
                                :scrollbar="true"
                                :bordered="true"
                                :action-ref="setVisibleMenuTableAction"
                            >
                                <template #menuEntity="{ record }">
                                    <SpiceDBObjectText
                                        type="menu"
                                        :id="record.id"
                                        copyable
                                    />
                                </template>
                                <template #menuStatus="{ record }">
                                    <a-tag :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'">
                                        {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                    </a-tag>
                                </template>
                            </GiTable>
                        </a-tab-pane>
                    </a-tabs>
                </a-card>
            </a-space>

            <a-empty
                v-else
                description="暂无用户详情"
            />
        </a-spin>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getUserRelationMenusApi,
        getUserRelationRolesApi,
        getUserRelationUserGroupsApi,
        getUserRelationsApi,
        type UserGroupRelationDto,
        type UserMenuRelationDto,
        type UserRelationsDto,
        type UserRoleRelationDto,
    } from "@/api/user";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import { Message } from "@arco-design/web-vue";
    import { computed, nextTick, ref, watch } from "vue";
    import { useRoute, useRouter } from "vue-router";

    defineOptions({
        name: "UserDetail",
    });

    const route = useRoute();
    const router = useRouter();
    const loading = ref(false);
    const relations = ref<UserRelationsDto | null>(null);
    const effectiveRoleTableAction = ref<ActionType | null>(null);
    const userGroupTableAction = ref<ActionType | null>(null);
    const visibleMenuTableAction = ref<ActionType | null>(null);

    const userId = computed(() => String(route.params.id || ""));
    const sourceFullPath = computed(() => {
        const from = history.state?.from;
        return typeof from === "string" ? from : undefined;
    });

    const tableOptions = {
        reload: false,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };

    const roleColumns: ProColumns[] = [
        {
            title: "角色 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "roleEntity",
            width: 220,
            fixed: "left",
        },
        {
            title: "角色名称",
            dataIndex: "name",
            valueType: "text",
            width: 180,
        },
        {
            title: "角色编码",
            dataIndex: "code",
            valueType: "text",
            width: 180,
        },
        {
            title: "状态",
            dataIndex: "status",
            valueType: "text",
            slotName: "roleStatus",
            width: 100,
            align: "center",
        },
        {
            title: "描述",
            dataIndex: "description",
            valueType: "text",
        },
    ];

    const groupColumns: ProColumns[] = [
        {
            title: "用户组 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "groupEntity",
            width: 220,
            fixed: "left",
        },
        {
            title: "用户组名称",
            dataIndex: "name",
            valueType: "text",
            width: 180,
        },
        {
            title: "编码",
            dataIndex: "code",
            valueType: "text",
            width: 180,
        },
        {
            title: "继承角色数",
            dataIndex: "roleIds",
            valueType: "text",
            slotName: "roleCount",
            width: 120,
            align: "center",
        },
        {
            title: "状态",
            dataIndex: "status",
            valueType: "text",
            slotName: "groupStatus",
            width: 100,
            align: "center",
        },
        {
            title: "备注",
            dataIndex: "description",
            valueType: "text",
        },
    ];

    const menuColumns: ProColumns[] = [
        {
            title: "菜单 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "menuEntity",
            width: 220,
            fixed: "left",
        },
        {
            title: "菜单标题",
            dataIndex: "title",
            valueType: "text",
            width: 180,
        },
        {
            title: "所需权限",
            dataIndex: "requiredPermissionCode",
            valueType: "text",
            width: 240,
        },
        {
            title: "类型",
            dataIndex: "type",
            valueType: "text",
            width: 100,
            align: "center",
        },
        {
            title: "状态",
            dataIndex: "status",
            valueType: "text",
            slotName: "menuStatus",
            width: 100,
            align: "center",
        },
    ];

    function setEffectiveRoleTableAction(action: ActionType) {
        effectiveRoleTableAction.value = action;
    }

    function setUserGroupTableAction(action: ActionType) {
        userGroupTableAction.value = action;
    }

    function setVisibleMenuTableAction(action: ActionType) {
        visibleMenuTableAction.value = action;
    }

    async function getEffectiveRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserRoleRelationDto>> {
        if (!relations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationRolesApi({
            userId: relations.value.user.id,
            relation: "effective",
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    async function getUserGroupTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupRelationDto>> {
        if (!relations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationUserGroupsApi({
            userId: relations.value.user.id,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    async function getVisibleMenuTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserMenuRelationDto>> {
        if (!relations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationMenusApi({
            userId: relations.value.user.id,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    async function reloadRelationTables() {
        await nextTick();
        await Promise.all([
            effectiveRoleTableAction.value?.reload?.(),
            userGroupTableAction.value?.reload?.(),
            visibleMenuTableAction.value?.reload?.(),
        ]);
    }

    /**
     * 读取当前路由用户 ID 对应的详情与关系视图。
     */
    async function loadDetail() {
        if (!userId.value) {
            Message.error("缺少用户 ID");
            return;
        }

        loading.value = true;
        try {
            const response = await getUserRelationsApi(userId.value);
            relations.value = response.data;
            await reloadRelationTables();
        } finally {
            loading.value = false;
        }
    }

    /**
     * 手动刷新当前用户详情。
     */
    function reloadDetail() {
        void loadDetail();
    }

    /**
     * 优先返回来源 tab；缺少来源信息时回退到用户管理页。
     */
    function backToSourceTab() {
        const from = sourceFullPath.value;
        if (typeof from === "string" && from) {
            void router.push(from);
            return;
        }

        void router.push({ name: "system.user.view" });
    }

    watch(userId, () => void loadDetail(), { immediate: true });
</script>
