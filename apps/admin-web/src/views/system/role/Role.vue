<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="roleModalVisible"
            :title="roleModalTitle"
            width="820px"
            unmount-on-close
            :confirm-loading="roleSubmitting"
            @before-ok="onRoleModalBeforeOk"
            @cancel="handleRoleModalCancel"
        >
            <form-create
                v-model="roleFormData"
                v-model:api="roleFormApi"
                :rule="roleFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-drawer
            v-model:visible="relationDrawerVisible"
            :title="relationDrawerTitle"
            width="1120px"
            unmount-on-close
            :footer="false"
        >
            <a-spin
                :loading="relationLoading"
                class="tw:w-full"
            >
                <a-space
                    v-if="currentRelations"
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-descriptions
                        bordered
                        :column="3"
                    >
                        <a-descriptions-item label="角色 Resource">
                            <SpiceDBObjectText
                                type="role"
                                :id="currentRelations.role.id"
                                copyable
                            />
                        </a-descriptions-item>
                        <a-descriptions-item label="直接用户">
                            {{ currentRelations.directUserIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效用户">
                            {{ currentRelations.effectiveUserIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="用户组">
                            {{ currentRelations.userGroupIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="状态">
                            <a-tag
                                :color="
                                    currentRelations.role.status === RoleStatus.ENABLE
                                        ? 'arcoblue'
                                        : 'red'
                                "
                            >
                                {{
                                    currentRelations.role.status === RoleStatus.ENABLE
                                        ? "启用"
                                        : "禁用"
                                }}
                            </a-tag>
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="users">
                        <a-tab-pane
                            key="users"
                            title="用户分配"
                        >
                            <a-space
                                direction="vertical"
                                fill
                                size="large"
                            >
                                <a-card :bordered="true">
                                    <template #title>
                                        <a-space
                                            direction="vertical"
                                            size="mini"
                                        >
                                            <span>直接用户</span>
                                            <a-typography-text
                                                type="secondary"
                                                code
                                            >
                                                role:{{
                                                    currentRelations.role.id
                                                }}#assignee@user:&lt;userId&gt;
                                            </a-typography-text>
                                        </a-space>
                                    </template>
                                    <template #extra>
                                        <a-button
                                            v-if="currentRelations.role.viewerCanAssignUser"
                                            type="primary"
                                            size="small"
                                            :loading="directUserSaving"
                                            @click="saveDirectUsers"
                                        >
                                            保存直接用户
                                        </a-button>
                                    </template>
                                    <GiTable
                                        v-model:selectedKeys="directUserDraftIds"
                                        header-title="可分配后台用户"
                                        :columns="directUserColumns"
                                        :request="getDirectUserTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :row-selection="directUserRowSelection"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 320, minWidth: 760 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setDirectUserTableAction"
                                        @selection-change="reloadDirectUserTable"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="directUserSearchFormData"
                                                :rule="directUserSearchRules"
                                                :option="directUserSearchFormOptions"
                                            />
                                        </template>
                                        <template #userEntity="{ record }">
                                            <SpiceDBObjectText
                                                type="user"
                                                :id="record.id"
                                                copyable
                                            />
                                        </template>
                                        <template #assigned="{ record }">
                                            <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                                {{ record.assigned ? "已分配" : "未分配" }}
                                            </a-tag>
                                        </template>
                                        <template #banned="{ record }">
                                            <a-tag :color="record.banned ? 'red' : 'green'">
                                                {{ record.banned ? "禁用" : "正常" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>

                                <a-card :bordered="true">
                                    <template #title>
                                        <a-space
                                            direction="vertical"
                                            size="mini"
                                        >
                                            <span>用户组</span>
                                            <a-typography-text
                                                type="secondary"
                                                code
                                            >
                                                role:{{
                                                    currentRelations.role.id
                                                }}#assignee@user_group:&lt;groupId&gt;#active_member
                                            </a-typography-text>
                                        </a-space>
                                    </template>
                                    <template #extra>
                                        <a-button
                                            v-if="currentRelations.role.viewerCanAssignUserGroup"
                                            type="primary"
                                            size="small"
                                            :loading="userGroupSaving"
                                            @click="saveUserGroups"
                                        >
                                            保存用户组
                                        </a-button>
                                    </template>
                                    <GiTable
                                        v-model:selectedKeys="selectedUserGroupKeys"
                                        header-title="可分配用户组"
                                        :columns="userGroupColumns"
                                        :request="getUserGroupAssignmentTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :row-selection="userGroupRowSelection"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 320, minWidth: 680 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setUserGroupAssignmentTableAction"
                                        @selection-change="reloadUserGroupAssignmentTable"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="userGroupSearchFormData"
                                                :rule="userGroupSearchRules"
                                                :option="userGroupSearchFormOptions"
                                            />
                                        </template>
                                        <template #resource="{ record }">
                                            <SpiceDBObjectText
                                                type="user_group"
                                                :id="record.id"
                                                copyable
                                            />
                                        </template>
                                        <template #status="{ record }">
                                            <a-tag
                                                :color="
                                                    record.status === UserGroupStatusEnum.ENABLE
                                                        ? 'arcoblue'
                                                        : 'red'
                                                "
                                            >
                                                {{
                                                    record.status === UserGroupStatusEnum.ENABLE
                                                        ? "启用"
                                                        : "禁用"
                                                }}
                                            </a-tag>
                                        </template>
                                        <template #assigned="{ record }">
                                            <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                                {{ record.assigned ? "已分配" : "未分配" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>

                                <a-card
                                    title="有效用户"
                                    :bordered="true"
                                >
                                    <GiTable
                                        header-title="有效用户"
                                        :columns="effectiveUserColumns"
                                        :request="getEffectiveUserTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 320, minWidth: 680 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setEffectiveUserTableAction"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="effectiveUserSearchFormData"
                                                :rule="effectiveUserSearchRules"
                                                :option="effectiveUserSearchFormOptions"
                                            />
                                        </template>
                                        <template #userEntity="{ record }">
                                            <SpiceDBObjectText
                                                type="user"
                                                :id="record.id"
                                                copyable
                                            />
                                        </template>
                                        <template #banned="{ record }">
                                            <a-tag :color="record.banned ? 'red' : 'green'">
                                                {{ record.banned ? "禁用" : "正常" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>
                            </a-space>
                        </a-tab-pane>
                    </a-tabs>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>角色关系管理</template>
            <template #subtitle>维护 role.assigned、直接用户和用户组关系</template>
            <template #extra>
                <a-button
                    v-if="canOpenPermissionPage"
                    size="small"
                    @click="goPermissionPage"
                >
                    <template #icon>
                        <icon-lock />
                    </template>
                    权限管理
                </a-button>
            </template>
        </a-page-header>

        <a-card :bordered="true">
            <GiTable
                header-title="角色 Resource 列表"
                :columns="roleColumns"
                row-key="id"
                :request="getRoleTableData"
                :pagination="GiTablePagination"
                :search="false"
                :options="GiTableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 760 }"
                :scrollbar="true"
                :stripe="true"
                :bordered="true"
                :columns-state="roleColumnsState"
                :action-ref="setRoleTableAction"
            >
                <template #form-search>
                    <form-create
                        v-model="roleSearchFormData"
                        :rule="roleSearchRules"
                        :option="roleSearchFormOptions"
                    />
                </template>
                <template #custom-extra>
                    <a-button
                        v-if="roleMeta.viewerCanCreateRole"
                        type="primary"
                        size="small"
                        @click="openCreateRole"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        创建角色
                    </a-button>
                </template>
                <template #status="{ record }">
                    <a-tag :color="record.status === RoleStatus.ENABLE ? 'arcoblue' : 'red'">
                        {{ record.status === RoleStatus.ENABLE ? "启用" : "禁用" }}
                    </a-tag>
                </template>
                <template #roleEntity="{ record }">
                    <SpiceDBObjectText
                        type="role"
                        :id="record.id"
                        copyable
                    />
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <a-link @click="openRelationDrawer(record)">编辑关系</a-link>
                        <a-link
                            v-if="record.viewerCanUpdate"
                            @click="openEditRole(record)"
                        >
                            编辑
                        </a-link>
                        <a-popconfirm
                            v-if="record.viewerCanDelete"
                            content="确定要删除该角色吗?"
                            @ok="deleteRole(record)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
            </GiTable>
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="tsx">
    import {
        assignRoleUserGroupsApi,
        assignRoleUsersApi,
        createRoleApi,
        type CreateRoleDto,
        deleteRoleApi,
        type DetailRoleDto,
        getRoleAssignableUserGroupsApi,
        getRoleAssignableUsersApi,
        getRoleEffectiveUsersApi,
        queryRoleListApi,
        getRoleRelationsApi,
        type RoleAssignableUserDto,
        type RoleAssignableUserGroupDto,
        type RoleRelationUserDto,
        type RoleRelationsDto,
        updateRoleApi,
        type UpdateRoleDto,
    } from "@/api/role";
    import { UserGroupStatusEnum } from "@/api/user-group";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import { clearFormCreateValidate } from "@/utils/apiValidation";
    import { Message } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { cloneDeep } from "es-toolkit";
    import { computed, nextTick, ref, shallowRef } from "vue";
    import { useRouter } from "vue-router";

    defineOptions({
        name: "Role",
    });

    type GiTableRequestParams = {
        current?: number;
        pageSize?: number;
    };

    enum RoleStatus {
        DISABLE = "DISABLE",
        ENABLE = "ENABLE",
    }

    enum RoleModalType {
        ADD = "ADD",
        EDIT = "EDIT",
    }

    const router = useRouter();
    const roleTableAction = ref<ActionType | null>(null);
    const directUserTableAction = ref<ActionType | null>(null);
    const userGroupAssignmentTableAction = ref<ActionType | null>(null);
    const effectiveUserTableAction = ref<ActionType | null>(null);
    const roleFormApi = shallowRef<FormCreateApi | null>(null);
    const roleModalVisible = ref(false);
    const relationDrawerVisible = ref(false);
    const roleSubmitting = ref(false);
    const relationLoading = ref(false);
    const directUserSaving = ref(false);
    const userGroupSaving = ref(false);
    const currentRoleModalType = ref<RoleModalType>(RoleModalType.ADD);
    const currentRoleId = ref<number | null>(null);
    const currentRelations = ref<RoleRelationsDto | null>(null);
    const directUserDraftIds = ref<string[]>([]);
    const selectedUserGroupKeys = ref<number[]>([]);
    const roleMeta = ref({
        viewerCanCreateRole: false,
    });

    const checkboxRowSelection = {
        type: "checkbox",
        showCheckedAll: true,
    } as const;

    const userGroupRowSelection = checkboxRowSelection;
    const directUserRowSelection = checkboxRowSelection;

    const roleSearchFormData = ref({
        name: "",
        status: undefined as string | undefined,
    });
    const directUserSearchFormData = ref({
        keyword: "",
        assigned: undefined as boolean | undefined,
        banned: undefined as boolean | undefined,
    });
    const userGroupSearchFormData = ref({
        keyword: "",
        assigned: undefined as boolean | undefined,
        status: undefined as string | undefined,
    });
    const effectiveUserSearchFormData = ref({
        keyword: "",
        banned: undefined as boolean | undefined,
    });

    const roleFormDataInit: CreateRoleDto = {
        name: "",
        code: "",
        description: null,
        status: RoleStatus.ENABLE,
    };

    const roleFormData = ref<CreateRoleDto>(cloneDeep(roleFormDataInit));

    const GiTablePagination = {
        defaultCurrent: 1,
        defaultPageSize: 10,
        current: 1,
        pageSize: 10,
    };

    const relationTablePagination = {
        defaultCurrent: 1,
        defaultPageSize: 10,
        current: 1,
        pageSize: 10,
    };

    const GiTableOptions = {
        reload: true,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };

    const relationTableOptions = {
        reload: true,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };

    const roleColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-role-spicedb-columns",
    } as const;

    const modalFormOptions: FormCreateOptions = {
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
            labelColProps: {
                span: 6,
            },
            wrapperColProps: {
                span: 18,
            },
        },
        row: {
            gutter: 12,
        },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };

    const canOpenPermissionPage = computed(() => router.hasRoute("system.permission.view"));

    const roleModalTitle = computed(() =>
        currentRoleModalType.value === RoleModalType.ADD ? "创建角色" : "编辑角色",
    );

    const relationDrawerTitle = computed(() => {
        if (!currentRelations.value) {
            return "角色 SpiceDB 关系";
        }
        return `${currentRelations.value.role.name} 的 SpiceDB 关系`;
    });

    const roleSearchRules: FormCreateRule[] = [
        {
            field: "name",
            title: "角色名称",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索角色名称",
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
                placeholder: "选择状态",
                options: [
                    { label: "启用", value: RoleStatus.ENABLE },
                    { label: "禁用", value: RoleStatus.DISABLE },
                ],
            },
        },
    ];

    const directUserSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "用户",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 用户名 / 姓名 / 邮箱",
            },
        },
        {
            field: "assigned",
            title: "分配状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选分配状态",
                options: [
                    { label: "已分配", value: true },
                    { label: "未分配", value: false },
                ],
            },
        },
        {
            field: "banned",
            title: "账号状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选账号状态",
                options: [
                    { label: "正常", value: false },
                    { label: "禁用", value: true },
                ],
            },
        },
    ];

    const userGroupSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "用户组",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 名称 / 编码 / 备注",
            },
        },
        {
            field: "assigned",
            title: "分配状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选分配状态",
                options: [
                    { label: "已分配", value: true },
                    { label: "未分配", value: false },
                ],
            },
        },
        {
            field: "status",
            title: "用户组状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选用户组状态",
                options: [
                    { label: "启用", value: UserGroupStatusEnum.ENABLE },
                    { label: "禁用", value: UserGroupStatusEnum.DISABLE },
                ],
            },
        },
    ];

    const effectiveUserSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "用户",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 用户名 / 姓名 / 邮箱",
            },
        },
        {
            field: "banned",
            title: "账号状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选账号状态",
                options: [
                    { label: "正常", value: false },
                    { label: "禁用", value: true },
                ],
            },
        },
    ];

    const roleColumns: ProColumns[] = [
        {
            title: "角色 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "roleEntity",
            width: 140,
            fixed: "left",
            hideInSearch: true,
        },
        {
            title: "角色名称",
            dataIndex: "name",
            valueType: "text",
            hideInSearch: true,
        },
        {
            title: "角色编码",
            dataIndex: "code",
            valueType: "text",
            hideInSearch: true,
        },
        {
            title: "描述",
            dataIndex: "description",
            valueType: "text",
            hideInSearch: true,
        },
        {
            title: "状态",
            dataIndex: "status",
            valueType: "text",
            slotName: "status",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 170,
            fixed: "right",
            align: "center",
            hideInSearch: true,
            hideInSetting: true,
        },
    ];

    const directUserColumns: ProColumns[] = [
        {
            title: "用户 Resource",
            dataIndex: "id",
            slotName: "userEntity",
            width: 260,
            fixed: "left",
        },
        {
            title: "用户名",
            dataIndex: "username",
        },
        {
            title: "姓名",
            dataIndex: "name",
        },
        {
            title: "邮箱",
            dataIndex: "email",
        },
        {
            title: "账号状态",
            dataIndex: "banned",
            slotName: "banned",
            width: 100,
            align: "center",
        },
        {
            title: "分配状态",
            dataIndex: "assigned",
            slotName: "assigned",
            width: 100,
            align: "center",
        },
    ];

    const userGroupColumns: ProColumns[] = [
        {
            title: "用户组 Resource",
            dataIndex: "id",
            slotName: "resource",
            width: 220,
            fixed: "left",
        },
        {
            title: "用户组名称",
            dataIndex: "name",
        },
        {
            title: "编码",
            dataIndex: "code",
        },
        {
            title: "分配状态",
            dataIndex: "assigned",
            slotName: "assigned",
            width: 100,
            align: "center",
        },
        {
            title: "状态",
            dataIndex: "status",
            slotName: "status",
            width: 100,
            align: "center",
        },
        {
            title: "备注",
            dataIndex: "description",
        },
    ];

    const effectiveUserColumns: ProColumns[] = [
        {
            title: "用户 Resource",
            dataIndex: "id",
            slotName: "userEntity",
            width: 260,
            fixed: "left",
        },
        {
            title: "用户名",
            dataIndex: "username",
        },
        {
            title: "姓名",
            dataIndex: "name",
        },
        {
            title: "邮箱",
            dataIndex: "email",
        },
        {
            title: "账号状态",
            dataIndex: "banned",
            slotName: "banned",
            width: 100,
            align: "center",
        },
    ];

    const roleFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "角色名称",
            type: "input",
            props: { allowClear: true, placeholder: "请输入角色名称" },
            validate: [{ required: true, message: "请输入角色名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "code",
            title: "角色编码",
            type: "input",
            props: { allowClear: true, placeholder: "请输入角色编码" },
            validate: [{ required: true, message: "请输入角色编码", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "status",
            title: "状态",
            type: "switch",
            props: {
                checkedValue: RoleStatus.ENABLE,
                uncheckedValue: RoleStatus.DISABLE,
                checkedText: "启用",
                uncheckedText: "禁用",
            },
            col: { span: 24 },
        },
        {
            field: "description",
            title: "描述",
            type: "textarea",
            props: {
                allowClear: true,
                autoSize: { minRows: 3, maxRows: 5 },
                placeholder: "请输入描述",
            },
            col: { span: 24 },
        },
    ]);

    const roleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshRoleTable, resetSearch),
    );
    const directUserSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshDirectUserTable, resetDirectUserSearch),
    );
    const userGroupSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshUserGroupAssignmentTable, resetUserGroupSearch),
    );
    const effectiveUserSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshEffectiveUserTable, resetEffectiveUserSearch),
    );
    /**
     * 保存 GiTable action 实例，供外部筛选和写操作后刷新。
     */
    function setRoleTableAction(action: ActionType) {
        roleTableAction.value = action;
    }

    /**
     * 保存直接用户分配表格 action 实例，供筛选和关系重载后刷新。
     */
    function setDirectUserTableAction(action: ActionType) {
        directUserTableAction.value = action;
    }

    /**
     * 保存用户组分配表格 action 实例，供筛选和关系重载后刷新。
     */
    function setUserGroupAssignmentTableAction(action: ActionType) {
        userGroupAssignmentTableAction.value = action;
    }

    /**
     * 保存有效用户表格 action 实例，供关系重载后刷新。
     */
    function setEffectiveUserTableAction(action: ActionType) {
        effectiveUserTableAction.value = action;
    }

    /**
     * 构造 FormCreate 搜索表单按钮行为。
     */
    function buildSearchFormOptions(onSubmit: () => void, onReset: () => void): FormCreateOptions {
        return {
            form: {
                layout: "horizontal",
                labelAlign: "right",
                autoLabelWidth: true,
            },
            row: {
                gutter: 12,
            },
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

    /**
     * 将 GiTable 请求参数转换成角色分页接口参数。
     */
    async function getRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<DetailRoleDto>> {
        const response = await queryRoleListApi({
            ...roleSearchFormData.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        roleMeta.value = response.data.meta ?? {
            viewerCanCreateRole: false,
        };

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 查询后端直接用户分配表格数据，支持搜索、分配状态和账号状态筛选。
     */
    async function getDirectUserTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<RoleAssignableUserDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getRoleAssignableUsersApi({
            roleId: currentRelations.value.role.id,
            ...directUserSearchFormData.value,
            draftUserIds: [...directUserDraftIds.value],
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 查询后端用户组分配表格数据，支持搜索、分配状态和用户组状态筛选。
     */
    async function getUserGroupAssignmentTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<RoleAssignableUserGroupDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getRoleAssignableUserGroupsApi({
            roleId: currentRelations.value.role.id,
            ...userGroupSearchFormData.value,
            draftUserGroupIds: normalizeNumberIds(selectedUserGroupKeys.value),
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 查询后端有效用户表格数据，支持搜索和账号状态筛选。
     */
    async function getEffectiveUserTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<RoleRelationUserDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getRoleEffectiveUsersApi({
            roleId: currentRelations.value.role.id,
            ...effectiveUserSearchFormData.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 刷新角色表格并回到第一页。
     */
    function refreshRoleTable() {
        roleTableAction.value?.setPageInfo?.({ current: 1 });
        void roleTableAction.value?.reload();
    }

    /**
     * 刷新直接用户分配表格并回到第一页。
     */
    function refreshDirectUserTable() {
        directUserTableAction.value?.setPageInfo?.({ current: 1 });
        void directUserTableAction.value?.reload();
    }

    /**
     * 仅重载直接用户分配表格当前页，供勾选后刷新筛选命中状态。
     */
    function reloadDirectUserTable() {
        void nextTick(() => directUserTableAction.value?.reload());
    }

    /**
     * 刷新用户组分配表格并回到第一页。
     */
    function refreshUserGroupAssignmentTable() {
        userGroupAssignmentTableAction.value?.setPageInfo?.({ current: 1 });
        void userGroupAssignmentTableAction.value?.reload();
    }

    /**
     * 仅重载用户组分配表格当前页，供勾选后刷新筛选命中状态。
     */
    function reloadUserGroupAssignmentTable() {
        void nextTick(() => userGroupAssignmentTableAction.value?.reload());
    }

    /**
     * 刷新有效用户表格并回到第一页。
     */
    function refreshEffectiveUserTable() {
        effectiveUserTableAction.value?.setPageInfo?.({ current: 1 });
        void effectiveUserTableAction.value?.reload();
    }

    /**
     * 重置搜索条件并刷新角色表格。
     */
    function resetSearch() {
        roleSearchFormData.value = {
            name: "",
            status: undefined,
        };
        refreshRoleTable();
    }

    /**
     * 重置直接用户分配表格筛选条件。
     */
    function resetDirectUserSearch() {
        directUserSearchFormData.value = {
            keyword: "",
            assigned: undefined,
            banned: undefined,
        };
        refreshDirectUserTable();
    }

    /**
     * 重置用户组分配表格筛选条件。
     */
    function resetUserGroupSearch() {
        userGroupSearchFormData.value = {
            keyword: "",
            assigned: undefined,
            status: undefined,
        };
        refreshUserGroupAssignmentTable();
    }

    /**
     * 重置有效用户表格筛选条件。
     */
    function resetEffectiveUserSearch() {
        effectiveUserSearchFormData.value = {
            keyword: "",
            banned: undefined,
        };
        refreshEffectiveUserTable();
    }

    /**
     * 当前角色关系数据更新后刷新所有已挂载的关系表格。
     */
    async function reloadRelationTables() {
        await Promise.all([
            directUserTableAction.value?.reload(),
            userGroupAssignmentTableAction.value?.reload(),
            effectiveUserTableAction.value?.reload(),
        ]);
    }

    /**
     * 规整数字 ID 数组，避免选择控件混入字符串值。
     */
    function normalizeNumberIds(ids: unknown): number[] {
        if (!Array.isArray(ids)) {
            return [];
        }
        return ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    }

    /**
     * 打开创建角色弹窗。
     */
    function openCreateRole() {
        currentRoleModalType.value = RoleModalType.ADD;
        currentRoleId.value = null;
        roleFormData.value = cloneDeep(roleFormDataInit);
        roleModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(roleFormApi.value));
    }

    /**
     * 打开编辑角色弹窗，仅维护角色元数据。
     */
    function openEditRole(record: DetailRoleDto) {
        currentRoleModalType.value = RoleModalType.EDIT;
        currentRoleId.value = record.id;
        roleFormData.value = {
            name: record.name,
            code: record.code,
            description: record.description,
            status: record.status,
        };
        roleModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(roleFormApi.value));
    }

    /**
     * 在角色弹窗确认前校验并提交 FormCreate 表单。
     */
    async function onRoleModalBeforeOk() {
        if (!roleFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            await roleFormApi.value.validate();
            roleSubmitting.value = true;
            const payload = cloneDeep(roleFormData.value);

            if (currentRoleModalType.value === RoleModalType.ADD) {
                await createRoleApi(payload);
            } else if (currentRoleId.value) {
                await updateRoleApi(currentRoleId.value, payload as UpdateRoleDto);
            }
            Message.success("操作成功");
            await roleTableAction.value?.reload();
            return true;
        } catch {
            return false;
        } finally {
            roleSubmitting.value = false;
        }
    }

    /**
     * 关闭角色弹窗并重置临时状态。
     */
    function handleRoleModalCancel() {
        roleFormData.value = cloneDeep(roleFormDataInit);
        clearFormCreateValidate(roleFormApi.value);
    }

    /**
     * 删除角色并刷新列表。
     */
    async function deleteRole(record: DetailRoleDto) {
        await deleteRoleApi(record.id);
        Message.success("删除成功");
        await roleTableAction.value?.reload();
        if (currentRelations.value?.role.id === record.id) {
            currentRelations.value = null;
        }
    }

    /**
     * 打开角色关系抽屉并加载关系视图。
     */
    async function openRelationDrawer(record: DetailRoleDto) {
        currentRelations.value = null;
        relationDrawerVisible.value = true;
        await focusRole(record);
    }

    /**
     * 将角色作为当前关系焦点。
     */
    async function focusRole(record: DetailRoleDto) {
        await loadRoleRelations(record.id);
    }

    /**
     * 加载角色 SpiceDB 关系视图。
     */
    async function loadRoleRelations(roleId: number) {
        relationLoading.value = true;
        try {
            const relationResponse = await getRoleRelationsApi(roleId);
            currentRelations.value = relationResponse.data;
            directUserDraftIds.value = [...relationResponse.data.directUserIds];
            selectedUserGroupKeys.value = [...relationResponse.data.userGroupIds];
            await reloadRelationTables();
        } finally {
            relationLoading.value = false;
        }
    }

    /**
     * 保存角色直接用户分配关系。
     */
    async function saveDirectUsers() {
        if (!currentRelations.value) {
            return;
        }

        directUserSaving.value = true;
        try {
            await assignRoleUsersApi({
                roleId: currentRelations.value.role.id,
                userIds: [...directUserDraftIds.value],
            });
            Message.success("直接用户已更新");
            await loadRoleRelations(currentRelations.value.role.id);
        } finally {
            directUserSaving.value = false;
        }
    }

    /**
     * 保存角色用户组分配关系。
     */
    async function saveUserGroups() {
        if (!currentRelations.value) {
            return;
        }

        userGroupSaving.value = true;
        try {
            await assignRoleUserGroupsApi({
                roleId: currentRelations.value.role.id,
                userGroupIds: normalizeNumberIds(selectedUserGroupKeys.value),
            });
            Message.success("用户组关系已更新");
            await loadRoleRelations(currentRelations.value.role.id);
        } finally {
            userGroupSaving.value = false;
        }
    }

    /**
     * 跳转到独立权限管理页维护核心 manager 授权。
     */
    function goPermissionPage() {
        void router.push({ name: "system.permission.view" });
    }

    /**
     * 初始化角色关系页面依赖数据。
     */
    async function initPage() {
        roleMeta.value = {
            viewerCanCreateRole: false,
        };
    }

    void initPage();
</script>
