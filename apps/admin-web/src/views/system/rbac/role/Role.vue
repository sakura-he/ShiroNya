<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="modalVisible"
            :title="modalTitle"
            :confirm-loading="submitting"
            width="720px"
            unmount-on-close
            @before-ok="submitRole"
        >
            <form-create
                :model-value="form"
                v-model:api="roleFormApi"
                :rule="roleFormRules"
                :option="roleFormOptions"
                @update:model-value="syncRoleForm"
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
                    <a-descriptions :column="4">
                        <a-descriptions-item label="角色 ID">
                            {{ relations.role.id }}
                        </a-descriptions-item>
                        <a-descriptions-item label="直接分配用户">
                            {{ relations.directUserIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="关联用户组">
                            {{ relations.userGroupIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="继承自角色">
                            {{ relations.parentRoleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="直接授权权限">
                            {{ relations.permissionIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="继承获得权限">
                            {{ relations.inheritedPermissionIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="最终有效权限">
                            {{ relations.effectivePermissionIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="拥有该角色的用户">
                            {{ relations.effectiveUserIds.length }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="users">
                        <a-tab-pane
                            key="users"
                            title="直接分配用户"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>这个角色直接分配给哪些用户</span>
                                        <a-typography-text code>
                                            rbac:role:{{
                                                relations.role.id
                                            }}#user@user:&lt;userId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.role.viewerCanAssignUser"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasUserChanges"
                                        @click="saveUsers"
                                    >
                                        保存直接用户
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftUserIds"
                                    row-key="id"
                                    :columns="userColumns"
                                    :request="requestUsers"
                                    :pagination="relationPagination"
                                    :row-selection="rowSelection"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 320, minWidth: 760 }"
                                    :action-ref="setUserAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationUserFilters"
                                            :rule="relationUserSearchRules"
                                            :option="relationUserSearchOptions"
                                            @update:model-value="syncRelationUserFilters"
                                        />
                                    </template>
                                    <template #assigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "当前已保存" : "无保存关系" }}
                                        </a-tag>
                                    </template>
                                    <template #banned="{ record }">
                                        <a-tag :color="record.banned ? 'red' : 'green'">
                                            {{ record.banned ? "禁用" : "正常" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                        <a-tab-pane
                            key="groups"
                            title="关联用户组"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>哪些用户组会获得这个角色</span>
                                        <a-typography-text code>
                                            rbac:group:&lt;groupId&gt;#role@role:{{
                                                relations.role.id
                                            }}
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.role.viewerCanAssignUserGroup"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasGroupChanges"
                                        @click="saveGroups"
                                    >
                                        保存关联用户组
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftGroupIds"
                                    row-key="id"
                                    :columns="groupColumns"
                                    :request="requestGroups"
                                    :pagination="relationPagination"
                                    :row-selection="rowSelection"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 320, minWidth: 720 }"
                                    :action-ref="setGroupAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationGroupFilters"
                                            :rule="relationGroupSearchRules"
                                            :option="relationGroupSearchOptions"
                                            @update:model-value="syncRelationGroupFilters"
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
                            key="parents"
                            title="继承权限"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>从其他角色继承权限</span>
                                        <a-typography-text code>
                                            rbac:role:{{ relations.role.id }} inherits
                                            role:&lt;parentRoleId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.role.viewerCanAssignParentRole"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasParentChanges"
                                        @click="saveParents"
                                    >
                                        保存继承角色
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftParentRoleIds"
                                    row-key="id"
                                    :columns="parentRoleColumns"
                                    :request="requestParents"
                                    :pagination="relationPagination"
                                    :row-selection="rowSelection"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 320, minWidth: 720 }"
                                    :action-ref="setParentAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationParentFilters"
                                            :rule="relationParentSearchRules"
                                            :option="relationParentSearchOptions"
                                            @update:model-value="syncRelationParentFilters"
                                        />
                                    </template>
                                    <template #status="{ record }">
                                        <StatusTag :status="record.status" />
                                    </template>
                                    <template #assigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "已继承权限" : "未继承" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                        <a-tab-pane
                            key="permissions"
                            title="直接授权权限"
                        >
                            <a-alert
                                class="role-permission-alert"
                                :type="relations.role.isSuperAdmin ? 'warning' : 'info'"
                                show-icon
                            >
                                <template v-if="relations.role.isSuperAdmin">
                                    超级管理员角色默认拥有全部启用权限，直接授权权限仅用于查看，不能编辑。
                                </template>
                                <template v-else>
                                    这里维护这个角色直接拥有的权限；继承权限只读展示，菜单可见性由最终有效权限和菜单所需权限自动匹配。
                                </template>
                            </a-alert>
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>这个角色直接拥有哪些权限</span>
                                        <a-typography-text code>
                                            rbac:role:{{ relations.role.id }} ->
                                            permission:&lt;permissionId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="canEditDirectPermissions"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasPermissionChanges"
                                        @click="savePermissions"
                                    >
                                        保存直接权限
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="draftPermissionIds"
                                    row-key="id"
                                    :columns="permissionColumns"
                                    :request="requestPermissions"
                                    :pagination="relationPagination"
                                    :row-selection="
                                        canEditDirectPermissions ? rowSelection : undefined
                                    "
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 320, minWidth: 860 }"
                                    :action-ref="setPermissionAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="relationPermissionFilters"
                                            :rule="relationPermissionSearchRules"
                                            :option="relationPermissionSearchOptions"
                                            @update:model-value="syncRelationPermissionFilters"
                                        />
                                    </template>
                                    <template #status="{ record }">
                                        <StatusTag :status="record.status" />
                                    </template>
                                    <template #assigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "当前已授权" : "无直接授权" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                        <a-tab-pane
                            key="effective"
                            title="查看有效用户"
                        >
                            <a-card
                                title="最终拥有该角色的用户"
                                :bordered="true"
                            >
                                <GiTable
                                    row-key="id"
                                    :columns="effectiveUserColumns"
                                    :request="requestEffectiveUsers"
                                    :pagination="relationPagination"
                                    :search="false"
                                    :options="tableOptions"
                                    :scroll="{ x: '100%', y: 320, minWidth: 720 }"
                                    :action-ref="setEffectiveUserAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            :model-value="effectiveUserFilters"
                                            :rule="effectiveUserSearchRules"
                                            :option="effectiveUserSearchOptions"
                                            @update:model-value="syncEffectiveUserFilters"
                                        />
                                    </template>
                                    <template #banned="{ record }">
                                        <a-tag :color="record.banned ? 'red' : 'green'">
                                            {{ record.banned ? "禁用" : "正常" }}
                                        </a-tag>
                                    </template>
                                    <template #effectiveRoleSources="{ record }">
                                        <a-space
                                            size="mini"
                                            wrap
                                        >
                                            <a-tag
                                                v-for="source in record.effectiveRoleSources ?? []"
                                                :key="source"
                                                :color="getEffectiveRoleSourceColor(source)"
                                            >
                                                {{ getEffectiveRoleSourceLabel(source) }}
                                            </a-tag>
                                            <a-typography-text
                                                v-if="record.effectiveRoleSourceRoleIds?.length"
                                                type="secondary"
                                            >
                                                角色
                                                {{ record.effectiveRoleSourceRoleIds.join(", ") }}
                                            </a-typography-text>
                                            <a-typography-text
                                                v-if="record.effectiveRoleSourceGroupIds?.length"
                                                type="secondary"
                                            >
                                                用户组
                                                {{ record.effectiveRoleSourceGroupIds.join(", ") }}
                                            </a-typography-text>
                                        </a-space>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                    </a-tabs>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>角色</template>
            <template #subtitle>从角色出发配置成员、用户组、继承角色和直接权限</template>
        </a-page-header>

        <a-alert
            class="role-rule-alert"
            type="info"
            show-icon
        >
            推荐在本页完成“角色 ->
            权限”的主授权流程；权限页只作为“这个权限授权给哪些角色”的反向维护入口。
        </a-alert>

        <a-tabs
            v-model:active-key="activeView"
            class="role-view-tabs"
        >
            <a-tab-pane
                key="list"
                title="角色配置"
            >
                <a-card :bordered="true">
                    <GiTable
                        row-key="id"
                        header-title="角色"
                        :columns="columns"
                        :request="requestRoles"
                        :pagination="pagination"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', y: '100%', minWidth: 980 }"
                        :action-ref="setTableAction"
                        bordered
                    >
                        <template #custom-extra>
                            <a-button
                                v-if="meta.viewerCanCreateRole"
                                type="primary"
                                size="small"
                                @click="openCreate"
                            >
                                <template #icon><icon-plus /></template>
                                创建角色
                            </a-button>
                        </template>
                        <template #form-search>
                            <form-create
                                :model-value="roleFilters"
                                :rule="roleSearchRules"
                                :option="roleSearchOptions"
                                @update:model-value="syncRoleFilters"
                            />
                        </template>
                        <template #status="{ record }">
                            <StatusTag :status="record.status" />
                        </template>
                        <template #flags="{ record }">
                            <a-space size="mini">
                                <a-tag
                                    v-if="record.isBuiltin"
                                    color="gray"
                                >
                                    内置
                                </a-tag>
                                <a-tag
                                    v-if="record.isSuperAdmin"
                                    color="gold"
                                >
                                    超级管理员
                                </a-tag>
                            </a-space>
                        </template>
                        <template #action="{ record }">
                            <a-space
                                size="mini"
                                wrap
                            >
                                <a-link @click="openRelations(record)">配置成员/权限</a-link>
                                <a-link
                                    v-if="record.viewerCanUpdate"
                                    @click="openEdit(record)"
                                >
                                    编辑
                                </a-link>
                                <a-popconfirm
                                    v-if="record.viewerCanDelete"
                                    content="确定软删除该角色吗?"
                                    @ok="removeRole(record)"
                                >
                                    <a-link status="danger">删除</a-link>
                                </a-popconfirm>
                            </a-space>
                        </template>
                    </GiTable>
                </a-card>
            </a-tab-pane>

            <a-tab-pane
                key="permissions"
                title="角色授权工作台"
            >
                <RolePermissionPanel @changed="handleRolePermissionChanged" />
            </a-tab-pane>
        </a-tabs>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        assignRoleParentRolesApi,
        assignRolePermissionsApi,
        assignRoleUserGroupsApi,
        assignRoleUsersApi,
        createRoleApi,
        deleteRoleApi,
        getRoleAssignableUserGroupsApi,
        getRoleAssignableUsersApi,
        getRoleEffectiveUsersApi,
        queryRoleListApi,
        getRoleRelationsApi,
        queryRoleAssignableParentsApi,
        queryRoleAssignablePermissionsApi,
        type RoleRelationsDto,
        updateRoleApi,
    } from "@/api/role";
    import { RbacStatus, type RbacRoleDto } from "@/api/rbac/common";
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
    import RolePermissionPanel from "./RolePermissionPanel.vue";
    import StatusTag from "../components/StatusTag.vue";

    defineOptions({ name: "RbacRole" });

    const tableAction = shallowRef<ActionType>();
    const userAction = shallowRef<ActionType>();
    const groupAction = shallowRef<ActionType>();
    const parentAction = shallowRef<ActionType>();
    const permissionAction = shallowRef<ActionType>();
    const effectiveUserAction = shallowRef<ActionType>();
    const roleFormApi = shallowRef<FormCreateApi | null>(null);
    const meta = reactive({ viewerCanCreateRole: false });
    const modalVisible = ref(false);
    const submitting = ref(false);
    const editingId = ref<number | null>(null);
    const drawerVisible = ref(false);
    const drawerLoading = ref(false);
    const saving = ref(false);
    const activeView = ref<"list" | "permissions">("list");
    const relations = ref<RoleRelationsDto | null>(null);
    const draftUserIds = ref<string[]>([]);
    const draftGroupIds = ref<number[]>([]);
    const draftParentRoleIds = ref<number[]>([]);
    const draftPermissionIds = ref<number[]>([]);

    const form = reactive({
        code: "",
        name: "",
        description: "",
        sort: 0,
        isBuiltin: false,
        isSuperAdmin: false,
        status: RbacStatus.ENABLE,
    });
    const roleFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
    }>({
        name: "",
        code: "",
        status: undefined,
    });
    const relationUserFilters = reactive<{
        id: string;
        username: string;
        name: string;
        banned?: boolean;
        assigned?: boolean;
    }>({
        id: "",
        username: "",
        name: "",
        banned: undefined,
        assigned: undefined,
    });
    const relationGroupFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
        assigned?: boolean;
    }>({
        name: "",
        code: "",
        status: undefined,
        assigned: undefined,
    });
    const relationParentFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
        assigned?: boolean;
    }>({
        name: "",
        code: "",
        status: undefined,
        assigned: undefined,
    });
    const relationPermissionFilters = reactive<{
        name: string;
        code: string;
        status?: RbacStatus;
        assigned?: boolean;
    }>({
        name: "",
        code: "",
        status: undefined,
        assigned: undefined,
    });
    const effectiveUserFilters = reactive<{
        id: string;
        username: string;
        name: string;
        banned?: boolean;
    }>({
        id: "",
        username: "",
        name: "",
        banned: undefined,
    });

    const modalTitle = computed(() => (editingId.value ? "编辑角色" : "创建角色"));
    const drawerTitle = computed(() =>
        relations.value ? `配置角色 - ${relations.value.role.name}` : "配置角色",
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
    const roleFormOptions: FormCreateOptions = {
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
    const roleFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "角色名称",
            type: "input",
            props: { allowClear: true, placeholder: "例如 超级管理员" },
            validate: [{ required: true, message: "请输入角色名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "code",
            title: "角色编码",
            type: "input",
            props: { allowClear: true, placeholder: "例如 super_admin" },
            validate: [{ required: true, message: "请输入角色编码", trigger: "change" }],
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
            field: "isBuiltin",
            title: "内置角色",
            type: "switch",
            props: {
                checkedValue: true,
                uncheckedValue: false,
                checkedText: "是",
                uncheckedText: "否",
            },
            col: { span: 24 },
        },
        {
            field: "isSuperAdmin",
            title: "超级管理员",
            type: "switch",
            props: {
                checkedValue: true,
                uncheckedValue: false,
                checkedText: "是",
                uncheckedText: "否",
            },
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
    const roleSearchOptions = computed<FormCreateOptions>(() => ({
        form: { layout: "horizontal", labelAlign: "right", autoLabelWidth: true },
        row: { gutter: 12 },
        submitBtn: {
            show: true,
            type: "primary",
            size: "small",
            innerText: "查询",
            click: searchRoles,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetRoleFilters,
        },
    }));
    const roleSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "名称",
            type: "input",
            props: { allowClear: true, placeholder: "按角色名称筛选" },
        },
        {
            field: "code",
            title: "编码",
            type: "input",
            props: { allowClear: true, placeholder: "按角色编码筛选" },
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
    const relationUserSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationUsers, resetRelationUserFilters),
    );
    const relationGroupSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationGroups, resetRelationGroupFilters),
    );
    const relationParentSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationParents, resetRelationParentFilters),
    );
    const relationPermissionSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchRelationPermissions, resetRelationPermissionFilters),
    );
    const effectiveUserSearchOptions = computed<FormCreateOptions>(() =>
        createRelationSearchOptions(searchEffectiveUsers, resetEffectiveUserFilters),
    );
    const relationUserSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("id", "用户 ID", "按用户 ID 筛选"),
        createInputSearchRule("username", "用户名", "按用户名筛选"),
        createInputSearchRule("name", "名称", "按名称筛选"),
        createSelectSearchRule("banned", "状态", bannedOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);
    const relationGroupSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按用户组名称筛选"),
        createInputSearchRule("code", "编码", "按用户组编码筛选"),
        createSelectSearchRule("status", "状态", statusOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);
    const relationParentSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按角色名称筛选"),
        createInputSearchRule("code", "编码", "按角色编码筛选"),
        createSelectSearchRule("status", "状态", statusOptions, "全部"),
        createSelectSearchRule("assigned", "继承状态", relationAssignedOptions, "全部"),
    ]);
    const relationPermissionSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按权限名称筛选"),
        createInputSearchRule("code", "编码", "按权限编码筛选"),
        createSelectSearchRule("status", "状态", statusOptions, "全部"),
        createSelectSearchRule("assigned", "授权状态", relationAssignedOptions, "全部"),
    ]);
    const effectiveUserSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("id", "用户 ID", "按用户 ID 筛选"),
        createInputSearchRule("username", "用户名", "按用户名筛选"),
        createInputSearchRule("name", "名称", "按名称筛选"),
        createSelectSearchRule("banned", "状态", bannedOptions, "全部"),
    ]);

    const columns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "标记", dataIndex: "flags", slotName: "flags", width: 180 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "排序", dataIndex: "sort", width: 90 },
        { title: "描述", dataIndex: "description", ellipsis: true, tooltip: true },
        { title: "操作", dataIndex: "action", slotName: "action", fixed: "right", width: 180 },
    ];
    const userColumns: ProColumns[] = [
        { title: "用户 ID", dataIndex: "id", width: 240 },
        { title: "用户名", dataIndex: "username", width: 160 },
        { title: "名称", dataIndex: "name", width: 160 },
        { title: "状态", dataIndex: "banned", slotName: "banned", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];
    const groupColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];
    const parentRoleColumns = groupColumns;
    const permissionColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 240 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];
    const effectiveUserColumns: ProColumns[] = [
        ...userColumns.filter((column) => column.dataIndex !== "assigned"),
        {
            title: "来源",
            dataIndex: "effectiveRoleSources",
            slotName: "effectiveRoleSources",
            width: 260,
        },
    ];
    const hasUserChanges = computed(
        () => !isSameStringSet(draftUserIds.value, relations.value?.directUserIds ?? []),
    );
    const hasGroupChanges = computed(
        () => !isSameNumberSet(draftGroupIds.value, relations.value?.userGroupIds ?? []),
    );
    const hasParentChanges = computed(
        () => !isSameNumberSet(draftParentRoleIds.value, relations.value?.parentRoleIds ?? []),
    );
    const hasPermissionChanges = computed(
        () => !isSameNumberSet(draftPermissionIds.value, relations.value?.permissionIds ?? []),
    );
    const canEditDirectPermissions = computed(
        () =>
            Boolean(relations.value?.role.viewerCanAssignPermission) &&
            !relations.value?.role.isSuperAdmin,
    );

    function setTableAction(action: ActionType) {
        tableAction.value = action;
    }
    function setUserAction(action: ActionType) {
        userAction.value = action;
    }
    function setGroupAction(action: ActionType) {
        groupAction.value = action;
    }
    function setParentAction(action: ActionType) {
        parentAction.value = action;
    }
    function setPermissionAction(action: ActionType) {
        permissionAction.value = action;
    }
    function setEffectiveUserAction(action: ActionType) {
        effectiveUserAction.value = action;
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

    async function requestRoles(params: GiTableRequestParams) {
        const response = await queryRoleListApi({
            page: params.current,
            pageSize: params.pageSize,
            name: roleFilters.name || undefined,
            code: roleFilters.code || undefined,
            status: roleFilters.status,
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

    function searchRelationUsers() {
        void userAction.value?.reload(true);
    }
    function searchRelationGroups() {
        void groupAction.value?.reload(true);
    }
    function searchRelationParents() {
        void parentAction.value?.reload(true);
    }
    function searchRelationPermissions() {
        void permissionAction.value?.reload(true);
    }
    function searchEffectiveUsers() {
        void effectiveUserAction.value?.reload(true);
    }
    function syncRelationUserFilters(value: Partial<typeof relationUserFilters>) {
        Object.assign(relationUserFilters, value);
    }
    function syncRelationGroupFilters(value: Partial<typeof relationGroupFilters>) {
        Object.assign(relationGroupFilters, value);
    }
    function syncRelationParentFilters(value: Partial<typeof relationParentFilters>) {
        Object.assign(relationParentFilters, value);
    }
    function syncRelationPermissionFilters(value: Partial<typeof relationPermissionFilters>) {
        Object.assign(relationPermissionFilters, value);
    }
    function syncEffectiveUserFilters(value: Partial<typeof effectiveUserFilters>) {
        Object.assign(effectiveUserFilters, value);
    }
    function resetRelationUserFilters() {
        relationUserFilters.id = "";
        relationUserFilters.username = "";
        relationUserFilters.name = "";
        relationUserFilters.banned = undefined;
        relationUserFilters.assigned = undefined;
        searchRelationUsers();
    }
    function resetRelationGroupFilters() {
        relationGroupFilters.name = "";
        relationGroupFilters.code = "";
        relationGroupFilters.status = undefined;
        relationGroupFilters.assigned = undefined;
        searchRelationGroups();
    }
    function resetRelationParentFilters() {
        relationParentFilters.name = "";
        relationParentFilters.code = "";
        relationParentFilters.status = undefined;
        relationParentFilters.assigned = undefined;
        searchRelationParents();
    }
    function resetRelationPermissionFilters() {
        relationPermissionFilters.name = "";
        relationPermissionFilters.code = "";
        relationPermissionFilters.status = undefined;
        relationPermissionFilters.assigned = undefined;
        searchRelationPermissions();
    }
    function resetEffectiveUserFilters() {
        effectiveUserFilters.id = "";
        effectiveUserFilters.username = "";
        effectiveUserFilters.name = "";
        effectiveUserFilters.banned = undefined;
        searchEffectiveUsers();
    }

    async function requestUsers(params: GiTableRequestParams) {
        const response = await getRoleAssignableUsersApi(
            toRelationParams(params, {
                roleId: relations.value!.role.id,
                draftUserIds: draftUserIds.value,
                id: relationUserFilters.id || undefined,
                username: relationUserFilters.username || undefined,
                name: relationUserFilters.name || undefined,
                banned: relationUserFilters.banned,
                assigned: relationUserFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }
    async function requestGroups(params: GiTableRequestParams) {
        const response = await getRoleAssignableUserGroupsApi(
            toRelationParams(params, {
                roleId: relations.value!.role.id,
                draftUserGroupIds: draftGroupIds.value,
                name: relationGroupFilters.name || undefined,
                code: relationGroupFilters.code || undefined,
                status: relationGroupFilters.status,
                assigned: relationGroupFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }
    async function requestParents(params: GiTableRequestParams) {
        const response = await queryRoleAssignableParentsApi(
            toRelationParams(params, {
                roleId: relations.value!.role.id,
                draftRoleIds: draftParentRoleIds.value,
                name: relationParentFilters.name || undefined,
                code: relationParentFilters.code || undefined,
                status: relationParentFilters.status,
                assigned: relationParentFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }
    async function requestPermissions(params: GiTableRequestParams) {
        const response = await queryRoleAssignablePermissionsApi(
            toRelationParams(params, {
                roleId: relations.value!.role.id,
                draftPermissionIds: draftPermissionIds.value,
                name: relationPermissionFilters.name || undefined,
                code: relationPermissionFilters.code || undefined,
                status: relationPermissionFilters.status,
                assigned: relationPermissionFilters.assigned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }
    async function requestEffectiveUsers(params: GiTableRequestParams) {
        const response = await getRoleEffectiveUsersApi(
            toRelationParams(params, {
                roleId: relations.value!.role.id,
                id: effectiveUserFilters.id || undefined,
                username: effectiveUserFilters.username || undefined,
                name: effectiveUserFilters.name || undefined,
                banned: effectiveUserFilters.banned,
            }),
        );
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    function resetForm(record?: RbacRoleDto) {
        editingId.value = record?.id ?? null;
        form.code = record?.code ?? "";
        form.name = record?.name ?? "";
        form.description = record?.description ?? "";
        form.sort = record?.sort ?? 0;
        form.isBuiltin = record?.isBuiltin ?? false;
        form.isSuperAdmin = record?.isSuperAdmin ?? false;
        form.status = (record?.status ?? RbacStatus.ENABLE) as RbacStatus;
    }

    function syncRoleFormApiValues() {
        roleFormApi.value?.setValue({
            code: form.code,
            name: form.name,
            description: form.description,
            sort: form.sort,
            isBuiltin: form.isBuiltin,
            isSuperAdmin: form.isSuperAdmin,
            status: form.status,
        });
    }

    function syncOpenedRoleForm() {
        void nextTick(() => {
            syncRoleFormApiValues();
            clearRoleFormValidation();
        });
    }

    function openCreate() {
        resetForm();
        modalVisible.value = true;
        syncOpenedRoleForm();
    }
    function openEdit(record: RbacRoleDto) {
        resetForm(record);
        modalVisible.value = true;
        syncOpenedRoleForm();
    }
    function syncRoleForm(value: Partial<typeof form>) {
        Object.assign(form, value);
    }
    function syncRoleFilters(value: Partial<typeof roleFilters>) {
        Object.assign(roleFilters, value);
    }
    function searchRoles() {
        void tableAction.value?.reload(true);
    }
    function resetRoleFilters() {
        roleFilters.name = "";
        roleFilters.code = "";
        roleFilters.status = undefined;
        searchRoles();
    }
    function clearRoleFormValidation() {
        void nextTick(() => {
            const formEl = roleFormApi.value?.formEl?.();
            const formInstance =
                formEl && "clearValidate" in formEl
                    ? formEl
                    : ((formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.proxy ??
                      (formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.exposed);
            (formInstance as { clearValidate?: () => void } | undefined)?.clearValidate?.();
        });
    }
    async function submitRole() {
        try {
            await roleFormApi.value?.validate();
        } catch {
            return false;
        }
        submitting.value = true;
        try {
            if (editingId.value) {
                await updateRoleApi(editingId.value, form);
            } else {
                await createRoleApi(form);
            }
            Message.success("角色已保存");
            await tableAction.value?.reload();
            return true;
        } finally {
            submitting.value = false;
        }
    }

    async function removeRole(record: RbacRoleDto) {
        await deleteRoleApi(record.id);
        Message.success("角色已删除");
        await tableAction.value?.reload();
    }

    async function openRelations(record: RbacRoleDto) {
        relations.value = null;
        drawerVisible.value = true;
        drawerLoading.value = true;
        try {
            const response = await getRoleRelationsApi(record.id);
            relations.value = response.data;
            draftUserIds.value = [...response.data.directUserIds];
            draftGroupIds.value = [...response.data.userGroupIds];
            draftParentRoleIds.value = [...response.data.parentRoleIds];
            draftPermissionIds.value = [...response.data.permissionIds];
        } finally {
            drawerLoading.value = false;
        }
    }

    async function refreshRelations() {
        if (!relations.value) return;
        const response = await getRoleRelationsApi(relations.value.role.id);
        relations.value = response.data;
        draftUserIds.value = [...response.data.directUserIds];
        draftGroupIds.value = [...response.data.userGroupIds];
        draftParentRoleIds.value = [...response.data.parentRoleIds];
        draftPermissionIds.value = [...response.data.permissionIds];
    }
    async function saveUsers() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignRoleUsersApi({
                roleId: relations.value.role.id,
                userIds: draftUserIds.value,
            });
            Message.success("直接用户已保存");
            await refreshRelations();
            await userAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }
    async function saveGroups() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignRoleUserGroupsApi({
                roleId: relations.value.role.id,
                userGroupIds: draftGroupIds.value,
            });
            Message.success("关联用户组已保存");
            await refreshRelations();
            await groupAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }
    async function saveParents() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignRoleParentRolesApi({
                roleId: relations.value.role.id,
                parentRoleIds: draftParentRoleIds.value,
            });
            Message.success("继承角色已保存");
            await refreshRelations();
            await parentAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }
    async function savePermissions() {
        if (!relations.value) return;
        if (relations.value.role.isSuperAdmin) {
            Message.info("超级管理员角色默认拥有全部权限，无需保存直接权限");
            return;
        }
        saving.value = true;
        try {
            await assignRolePermissionsApi({
                roleId: relations.value.role.id,
                permissionIds: draftPermissionIds.value,
            });
            Message.success("直接权限已保存");
            await refreshRelations();
            await permissionAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }

    async function handleRolePermissionChanged(roleId: number) {
        await tableAction.value?.reload();
        if (relations.value?.role.id !== roleId) {
            return;
        }
        await refreshRelations();
        await permissionAction.value?.reload();
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

    function getEffectiveRoleSourceLabel(source: string) {
        if (source === "DIRECT_ROLE") {
            return "直接角色";
        }
        if (source === "USER_GROUP_ROLE") {
            return "用户组角色";
        }
        return source;
    }

    function getEffectiveRoleSourceColor(source: string) {
        if (source === "DIRECT_ROLE") {
            return "arcoblue";
        }
        if (source === "USER_GROUP_ROLE") {
            return "purple";
        }
        return "gray";
    }
</script>

<style scoped>
    .role-rule-alert,
    .role-permission-alert {
        margin-bottom: 12px;
    }

    .role-view-tabs {
        min-width: 0;
    }
</style>
