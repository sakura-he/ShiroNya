<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="modalVisible"
            :title="modalTitle"
            :confirm-loading="submitting"
            width="680px"
            unmount-on-close
            @before-ok="submitGroup"
        >
            <form-create
                :model-value="form"
                v-model:api="groupFormApi"
                :rule="groupFormRules"
                :option="groupFormOptions"
                @update:model-value="syncGroupForm"
            />
        </a-modal>

        <a-drawer
            v-model:visible="drawerVisible"
            :title="drawerTitle"
            width="1120px"
            unmount-on-close
            :footer="false"
        >
            <a-spin
                :loading="drawerLoading"
                class="tw:w-full"
            >
                <a-space
                    v-if="relations"
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-alert
                        type="info"
                        show-icon
                    >
                        用户组用于批量授权：先把用户加入组，再给组分配角色，组内用户会自动获得这些角色的权限。勾选只是草稿，点击保存后才生效。
                    </a-alert>

                    <a-descriptions
                        bordered
                        :column="4"
                    >
                        <a-descriptions-item label="用户组 ID">
                            {{ relations.group.id }}
                        </a-descriptions-item>
                        <a-descriptions-item label="编码">
                            {{ relations.group.code }}
                        </a-descriptions-item>
                        <a-descriptions-item label="组成员">
                            {{ relations.memberUserIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="组角色">
                            {{ relations.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="可见菜单">
                            {{ relations.visibleMenuIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="状态">
                            <StatusTag :status="relations.group.status" />
                        </a-descriptions-item>
                        <a-descriptions-item
                            label="描述"
                            :span="2"
                        >
                            {{ relations.group.description || "-" }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="members">
                        <a-tab-pane
                            key="members"
                            title="管理成员"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>哪些用户属于这个用户组</span>
                                        <a-typography-text code>
                                            rbac:group:{{ relations.group.id }} ->
                                            user:&lt;userId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.group.viewerCanAssignMember"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasMemberChanges"
                                        @click="saveMembers"
                                    >
                                        保存组成员
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftUserIds"
                                    row-key="id"
                                    :columns="userColumns"
                                    :request="requestMembers"
                                    :pagination="relationPagination"
                                    :row-selection="rowSelection"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 340, minWidth: 820 }"
                                    :scrollbar="true"
                                    :action-ref="setMemberAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationMemberFilters"
                                            :rule="relationMemberSearchRules"
                                            :option="relationMemberSearchOptions"
                                            @update:model-value="syncRelationMemberFilters"
                                        />
                                    </template>
                                    <template #banned="{ record }">
                                        <a-tag :color="record.banned ? 'red' : 'green'">
                                            {{ record.banned ? "禁用" : "正常" }}
                                        </a-tag>
                                    </template>
                                    <template #assigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "当前已保存" : "无保存关系" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>

                        <a-tab-pane
                            key="roles"
                            title="分配组角色"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>这个用户组拥有的角色</span>
                                        <a-typography-text code>
                                            rbac:group:{{ relations.group.id }} ->
                                            role:&lt;roleId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.group.viewerCanAssignRole"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasRoleChanges"
                                        @click="saveRoles"
                                    >
                                        保存组角色
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftRoleIds"
                                    row-key="id"
                                    :columns="roleColumns"
                                    :request="requestRoles"
                                    :pagination="relationPagination"
                                    :row-selection="rowSelection"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 340, minWidth: 760 }"
                                    :scrollbar="true"
                                    :action-ref="setRoleAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationRoleFilters"
                                            :rule="relationRoleSearchRules"
                                            :option="relationRoleSearchOptions"
                                            @update:model-value="syncRelationRoleFilters"
                                        />
                                    </template>
                                    <template #status="{ record }">
                                        <StatusTag :status="record.status" />
                                    </template>
                                    <template #assigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "当前已保存" : "无保存关系" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>

                        <a-tab-pane
                            key="menus"
                            title="查看可见菜单"
                        >
                            <a-card
                                title="组内用户通过组角色可见的菜单"
                                :bordered="true"
                            >
                                <GiTable
                                    row-key="id"
                                    :columns="menuColumns"
                                    :request="requestMenus"
                                    :pagination="relationPagination"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 340, minWidth: 900 }"
                                    :scrollbar="true"
                                    :action-ref="setMenuAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationMenuFilters"
                                            :rule="relationMenuSearchRules"
                                            :option="relationMenuSearchOptions"
                                            @update:model-value="syncRelationMenuFilters"
                                        />
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                    </a-tabs>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>用户组</template>
            <template #subtitle>用用户组批量维护成员，并把角色授予组内用户</template>
        </a-page-header>

        <a-card :bordered="true">
            <GiTable
                row-key="id"
                header-title="用户组"
                :columns="columns"
                :request="requestGroups"
                :pagination="pagination"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 980 }"
                :action-ref="setTableAction"
                bordered
            >
                <template #custom-extra>
                    <a-button
                        v-if="meta.viewerCanCreateUserGroup"
                        type="primary"
                        size="small"
                        @click="openCreate"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        创建用户组
                    </a-button>
                </template>
                <template #form-search>
                    <form-create
                        :model-value="groupFilters"
                        :rule="groupSearchRules"
                        :option="groupSearchOptions"
                        @update:model-value="syncGroupFilters"
                    />
                </template>
                <template #status="{ record }">
                    <StatusTag :status="record.status" />
                </template>
                <template #action="{ record }">
                    <a-space
                        size="mini"
                        wrap
                    >
                        <a-link @click="openRelations(record)">配置成员/角色</a-link>
                        <a-link
                            v-if="record.viewerCanUpdate"
                            @click="openEdit(record)"
                        >
                            编辑
                        </a-link>
                        <a-popconfirm
                            v-if="record.viewerCanDelete"
                            content="确定软删除该用户组吗?"
                            @ok="removeGroup(record)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
            </GiTable>
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { RbacStatus, type RbacUserGroupDto } from "@/api/rbac/common";
    import {
        assignUserGroupMembersApi,
        assignUserGroupRolesApi,
        createUserGroupApi,
        deleteUserGroupApi,
        queryUserGroupListApi,
        getUserGroupRelationMembersApi,
        getUserGroupRelationMenusApi,
        getUserGroupRelationRolesApi,
        getUserGroupRelationsApi,
        type UserGroupRelationsDto,
        updateUserGroupApi,
    } from "@/api/user-group";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
    } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { computed, nextTick, reactive, ref, shallowRef } from "vue";
    import StatusTag from "../components/StatusTag.vue";

    defineOptions({ name: "RbacUserGroup" });

    const tableAction = shallowRef<ActionType>();
    const memberAction = shallowRef<ActionType>();
    const roleAction = shallowRef<ActionType>();
    const menuAction = shallowRef<ActionType>();
    const groupFormApi = shallowRef<FormCreateApi | null>(null);
    const meta = reactive({ viewerCanCreateUserGroup: false });
    const modalVisible = ref(false);
    const submitting = ref(false);
    const editingId = ref<number | null>(null);
    const drawerVisible = ref(false);
    const drawerLoading = ref(false);
    const saving = ref(false);
    const relations = ref<UserGroupRelationsDto | null>(null);
    const draftUserIds = ref<string[]>([]);
    const draftRoleIds = ref<number[]>([]);

    const form = reactive({
        code: "",
        name: "",
        description: "",
        sort: 0,
        status: RbacStatus.ENABLE,
    });
    const groupFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
    }>({
        name: "",
        code: "",
        status: undefined,
    });
    const relationMemberFilters = reactive<{
        id: string;
        username: string;
        name: string;
        email: string;
        banned?: boolean;
        assigned?: boolean;
    }>({
        id: "",
        username: "",
        name: "",
        email: "",
        banned: undefined,
        assigned: undefined,
    });
    const relationRoleFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
        assigned?: boolean;
    }>({
        name: "",
        code: "",
        status: RbacStatus.ENABLE,
        assigned: undefined,
    });
    const relationMenuFilters = reactive<{
        title: string;
        requiredPermissionCode: string;
        path: string;
        status?: RbacStatus;
    }>({
        title: "",
        requiredPermissionCode: "",
        path: "",
        status: undefined,
    });

    const modalTitle = computed(() => (editingId.value ? "编辑用户组" : "创建用户组"));
    const drawerTitle = computed(() =>
        relations.value ? `配置用户组 - ${relations.value.group.name}` : "配置用户组",
    );
    const pagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };
    const relationPagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };
    const tableOptions = { reload: true, density: true, setting: true };
    const rowSelection = { type: "checkbox", showCheckedAll: true } as const;
    const groupFormOptions: FormCreateOptions = {
        form: { layout: "vertical" },
        row: { gutter: 12 },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };
    const statusOptions = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const relationAssignedOptions = [
        { label: "已保存", value: true },
        { label: "未保存", value: false },
    ];
    const bannedOptions = [
        { label: "正常", value: false },
        { label: "禁用", value: true },
    ];
    const groupFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "用户组名称",
            type: "input",
            props: { allowClear: true, placeholder: "例如 运营组" },
            validate: [{ required: true, message: "请输入用户组名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "code",
            title: "用户组编码",
            type: "input",
            props: { allowClear: true, placeholder: "例如 ops" },
            validate: [{ required: true, message: "请输入用户组编码", trigger: "change" }],
            col: { span: 24 },
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
                allowClear: false,
                options: statusOptions,
            },
            col: { span: 24 },
        },
        {
            field: "sort",
            title: "排序",
            type: "inputNumber",
            props: { min: 0, precision: 0, class: "tw:w-full" },
            col: { span: 24 },
        },
        {
            field: "description",
            title: "描述",
            type: "textarea",
            props: { allowClear: true, autoSize: { minRows: 3, maxRows: 5 } },
            col: { span: 24 },
        },
    ]);
    const groupSearchOptions = computed<FormCreateOptions>(() => ({
        form: { layout: "horizontal", labelAlign: "right", autoLabelWidth: true },
        row: { gutter: 12 },
        submitBtn: {
            show: true,
            type: "primary",
            size: "small",
            innerText: "查询",
            click: searchGroups,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetGroupFilters,
        },
    }));
    const groupSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "名称",
            type: "input",
            props: { allowClear: true, placeholder: "按用户组名称筛选" },
        },
        {
            field: "code",
            title: "编码",
            type: "input",
            props: { allowClear: true, placeholder: "按用户组编码筛选" },
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
                placeholder: "全部",
                options: statusOptions,
            },
        },
    ]);
    const relationMemberSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationMembers, resetRelationMemberFilters),
    );
    const relationRoleSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationRoles, resetRelationRoleFilters),
    );
    const relationMenuSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationMenus, resetRelationMenuFilters),
    );
    const relationMemberSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("id", "用户 ID", "按用户 ID 筛选"),
        createInputSearchRule("username", "用户名", "按用户名筛选"),
        createInputSearchRule("name", "名称", "按名称筛选"),
        createInputSearchRule("email", "邮箱", "按邮箱筛选"),
        createSelectSearchRule("banned", "状态", bannedOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);
    const relationRoleSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按角色名称筛选"),
        createInputSearchRule("code", "编码", "按角色编码筛选"),
        createSelectSearchRule("status", "状态", statusOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);
    const relationMenuSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("title", "标题", "按菜单标题筛选"),
        createInputSearchRule("requiredPermissionCode", "所需权限", "按权限编码筛选"),
        createInputSearchRule("path", "路径", "按路由路径筛选"),
        createSelectSearchRule("status", "状态", statusOptions, "全部"),
    ]);

    const columns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "排序", dataIndex: "sort", width: 90 },
        { title: "描述", dataIndex: "description", ellipsis: true, tooltip: true },
        { title: "操作", dataIndex: "action", slotName: "action", fixed: "right", width: 180 },
    ];

    const userColumns: ProColumns[] = [
        { title: "用户 ID", dataIndex: "id", width: 240 },
        { title: "用户名", dataIndex: "username", width: 160 },
        { title: "名称", dataIndex: "name", width: 160 },
        { title: "邮箱", dataIndex: "email", width: 220, ellipsis: true, tooltip: true },
        { title: "状态", dataIndex: "banned", slotName: "banned", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];

    const roleColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];

    const menuColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "标题", dataIndex: "title", width: 180 },
        { title: "类型", dataIndex: "type", width: 120 },
        { title: "所需权限", dataIndex: "requiredPermissionCode", width: 260 },
        { title: "路径", dataIndex: "path", ellipsis: true, tooltip: true },
        { title: "状态", dataIndex: "status", width: 120 },
    ];
    const hasMemberChanges = computed(
        () => !isSameStringSet(draftUserIds.value, relations.value?.memberUserIds ?? []),
    );
    const hasRoleChanges = computed(
        () => !isSameNumberSet(draftRoleIds.value, relations.value?.roleIds ?? []),
    );

    function setTableAction(action: ActionType) {
        tableAction.value = action;
    }
    function setMemberAction(action: ActionType) {
        memberAction.value = action;
    }
    function setRoleAction(action: ActionType) {
        roleAction.value = action;
    }
    function setMenuAction(action: ActionType) {
        menuAction.value = action;
    }

    function createRelationSearchOptions(
        onSubmit: () => void,
        onReset: () => void,
    ): FormCreateOptions {
        return {
            form: { layout: "horizontal", labelAlign: "right", autoLabelWidth: true },
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

    function createInputSearchRule(
        field: string,
        title: string,
        placeholder: string,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "input",
            props: { allowClear: true, placeholder },
        };
    }

    function createSelectSearchRule(
        field: string,
        title: string,
        options: Array<{ label: string; value: string | boolean }>,
        placeholder: string,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder,
                options,
            },
        };
    }

    async function requestGroups(params: GiTableRequestParams) {
        const response = await queryUserGroupListApi({
            page: params.current,
            pageSize: params.pageSize,
            name: groupFilters.name || undefined,
            code: groupFilters.code || undefined,
            status: groupFilters.status,
        });
        Object.assign(meta, response.data.meta ?? {});
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    function toRelationParams<T extends Record<string, unknown>>(
        params: GiTableRequestParams,
        extra: T,
    ) {
        return {
            ...extra,
            page: params.current,
            pageSize: params.pageSize,
        } as T & { page: number | undefined; pageSize: number | undefined };
    }

    function searchRelationMembers() {
        void memberAction.value?.reload(true);
    }
    function searchRelationRoles() {
        void roleAction.value?.reload(true);
    }
    function searchRelationMenus() {
        void menuAction.value?.reload(true);
    }
    function syncRelationMemberFilters(value: Partial<typeof relationMemberFilters>) {
        Object.assign(relationMemberFilters, value);
    }
    function syncRelationRoleFilters(value: Partial<typeof relationRoleFilters>) {
        Object.assign(relationRoleFilters, value);
    }
    function syncRelationMenuFilters(value: Partial<typeof relationMenuFilters>) {
        Object.assign(relationMenuFilters, value);
    }
    function resetRelationMemberFilters() {
        relationMemberFilters.id = "";
        relationMemberFilters.username = "";
        relationMemberFilters.name = "";
        relationMemberFilters.email = "";
        relationMemberFilters.banned = undefined;
        relationMemberFilters.assigned = undefined;
        searchRelationMembers();
    }
    function resetRelationRoleFilters() {
        relationRoleFilters.name = "";
        relationRoleFilters.code = "";
        relationRoleFilters.status = RbacStatus.ENABLE;
        relationRoleFilters.assigned = undefined;
        searchRelationRoles();
    }
    function resetRelationMenuFilters() {
        relationMenuFilters.title = "";
        relationMenuFilters.requiredPermissionCode = "";
        relationMenuFilters.path = "";
        relationMenuFilters.status = undefined;
        searchRelationMenus();
    }

    async function requestMembers(params: GiTableRequestParams) {
        const response = await getUserGroupRelationMembersApi(
            toRelationParams(params, {
                groupId: relations.value!.group.id,
                draftUserIds: draftUserIds.value,
                id: relationMemberFilters.id || undefined,
                username: relationMemberFilters.username || undefined,
                name: relationMemberFilters.name || undefined,
                email: relationMemberFilters.email || undefined,
                banned: relationMemberFilters.banned,
                assigned: relationMemberFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    async function requestRoles(params: GiTableRequestParams) {
        const response = await getUserGroupRelationRolesApi(
            toRelationParams(params, {
                groupId: relations.value!.group.id,
                draftRoleIds: draftRoleIds.value,
                name: relationRoleFilters.name || undefined,
                code: relationRoleFilters.code || undefined,
                status: relationRoleFilters.status,
                assigned: relationRoleFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    async function requestMenus(params: GiTableRequestParams) {
        const response = await getUserGroupRelationMenusApi(
            toRelationParams(params, {
                groupId: relations.value!.group.id,
                title: relationMenuFilters.title || undefined,
                requiredPermissionCode: relationMenuFilters.requiredPermissionCode || undefined,
                path: relationMenuFilters.path || undefined,
                status: relationMenuFilters.status,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    function resetForm(record?: RbacUserGroupDto) {
        editingId.value = record?.id ?? null;
        form.code = record?.code ?? "";
        form.name = record?.name ?? "";
        form.description = record?.description ?? "";
        form.sort = record?.sort ?? 0;
        form.status = record?.status ?? RbacStatus.ENABLE;
    }

    function openCreate() {
        resetForm();
        modalVisible.value = true;
        clearGroupFormValidation();
    }

    function openEdit(record: any) {
        resetForm(record);
        modalVisible.value = true;
        clearGroupFormValidation();
    }

    function syncGroupForm(value: Partial<typeof form>) {
        Object.assign(form, value);
    }

    function syncGroupFilters(value: Partial<typeof groupFilters>) {
        Object.assign(groupFilters, value);
    }

    function searchGroups() {
        void tableAction.value?.reload(true);
    }

    function resetGroupFilters() {
        groupFilters.name = "";
        groupFilters.code = "";
        groupFilters.status = undefined;
        searchGroups();
    }

    function clearGroupFormValidation() {
        void nextTick(() => {
            const formEl = groupFormApi.value?.formEl?.();
            const formInstance =
                formEl && "clearValidate" in formEl
                    ? formEl
                    : ((formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.proxy ??
                      (formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.exposed);
            (formInstance as { clearValidate?: () => void } | undefined)?.clearValidate?.();
        });
    }

    async function submitGroup() {
        try {
            await groupFormApi.value?.validate();
        } catch {
            return false;
        }
        submitting.value = true;
        try {
            if (editingId.value) {
                await updateUserGroupApi(editingId.value, form);
            } else {
                await createUserGroupApi(form);
            }
            Message.success("用户组已保存");
            await tableAction.value?.reload();
            return true;
        } finally {
            submitting.value = false;
        }
    }

    async function removeGroup(record: any) {
        await deleteUserGroupApi(record.id);
        Message.success("用户组已删除");
        await tableAction.value?.reload();
    }

    async function openRelations(record: any) {
        relations.value = null;
        drawerVisible.value = true;
        drawerLoading.value = true;
        try {
            const response = await getUserGroupRelationsApi(record.id);
            relations.value = response.data;
            draftUserIds.value = [...response.data.memberUserIds];
            draftRoleIds.value = [...response.data.roleIds];
        } finally {
            drawerLoading.value = false;
        }
    }

    async function refreshRelations() {
        if (!relations.value) return;
        const response = await getUserGroupRelationsApi(relations.value.group.id);
        relations.value = response.data;
        draftUserIds.value = [...response.data.memberUserIds];
        draftRoleIds.value = [...response.data.roleIds];
    }

    async function saveMembers() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignUserGroupMembersApi({
                groupId: relations.value.group.id,
                userIds: draftUserIds.value,
            });
            Message.success("组成员已保存");
            await refreshRelations();
            await memberAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }

    async function saveRoles() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignUserGroupRolesApi({
                groupId: relations.value.group.id,
                roleIds: draftRoleIds.value,
            });
            Message.success("组角色已保存");
            await refreshRelations();
            await roleAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }

    function isSameNumberSet(left: number[], right: number[]) {
        if (left.length !== right.length) {
            return false;
        }
        const rightSet = new Set(right);
        return left.every((item) => rightSet.has(item));
    }

    function isSameStringSet(left: string[], right: string[]) {
        if (left.length !== right.length) {
            return false;
        }
        const rightSet = new Set(right);
        return left.every((item) => rightSet.has(item));
    }
</script>
