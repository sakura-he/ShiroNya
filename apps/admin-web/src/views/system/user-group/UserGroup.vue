<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="metadataModalVisible"
            :title="metadataModalTitle"
            width="760px"
            unmount-on-close
            :confirm-loading="metadataSubmitting"
            @before-ok="onMetadataModalBeforeOk"
            @cancel="handleMetadataModalCancel"
        >
            <form-create
                v-model="metadataFormData"
                v-model:api="metadataFormApi"
                :rule="metadataFormRules"
                :option="metadataFormOptions"
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
                        :column="4"
                    >
                        <a-descriptions-item label="用户组 Resource">
                            <SpiceDBObjectText
                                type="user_group"
                                :id="currentRelations.group.id"
                                :label="currentRelations.group.name"
                                copyable
                            />
                        </a-descriptions-item>
                        <a-descriptions-item label="成员">
                            {{ currentRelations.memberUserIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="继承角色">
                            {{ currentRelations.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="可见菜单">
                            {{ currentRelations.visibleMenuIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="编码">
                            {{ currentRelations.group.code }}
                        </a-descriptions-item>
                        <a-descriptions-item label="状态">
                            <a-tag
                                :color="
                                    currentRelations.group.status === UserGroupStatusEnum.ENABLE
                                        ? 'arcoblue'
                                        : 'red'
                                "
                            >
                                {{
                                    currentRelations.group.status === UserGroupStatusEnum.ENABLE
                                        ? "启用"
                                        : "禁用"
                                }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item
                            label="备注"
                            :span="2"
                        >
                            {{ currentRelations.group.description || "-" }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="members">
                        <a-tab-pane
                            key="members"
                            title="成员分配"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        direction="vertical"
                                        size="mini"
                                    >
                                        <span>用户组成员</span>
                                        <a-typography-text
                                            type="secondary"
                                            code
                                        >
                                            user_group:{{
                                                currentRelations.group.id
                                            }}#member@user:&lt;userId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="currentRelations.group.viewerCanAssignMember"
                                        type="primary"
                                        size="small"
                                        :loading="memberSaving"
                                        @click="saveMembers"
                                    >
                                        保存成员
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="selectedMemberKeys"
                                    header-title="可分配后台用户"
                                    :columns="memberColumns"
                                    :request="getMemberTableData"
                                    row-key="id"
                                    :pagination="relationTablePagination"
                                    :row-selection="memberRowSelection"
                                    :search="false"
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 360, minWidth: 920 }"
                                    :scrollbar="true"
                                    :bordered="true"
                                    :action-ref="setMemberTableAction"
                                    @selection-change="reloadMemberTable"
                                >
                                    <template #form-search>
                                        <form-create
                                            v-model="memberSearchFormData"
                                            :rule="memberSearchRules"
                                            :option="memberSearchFormOptions"
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
                                            {{ record.assigned ? "已加入" : "未加入" }}
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
                            key="roles"
                            title="继承角色"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        direction="vertical"
                                        size="mini"
                                    >
                                        <span>继承角色</span>
                                        <a-typography-text
                                            type="secondary"
                                            code
                                        >
                                            role:&lt;roleId&gt;#assignee@user_group:{{
                                                currentRelations.group.id
                                            }}
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="currentRelations.group.viewerCanAssignRole"
                                        type="primary"
                                        size="small"
                                        :loading="roleSaving"
                                        @click="saveRoles"
                                    >
                                        保存角色
                                    </a-button>
                                </template>
                                <GiTable
                                    v-model:selectedKeys="selectedRoleKeys"
                                    header-title="可继承角色"
                                    :columns="roleColumns"
                                    :request="getInheritedRoleTableData"
                                    row-key="id"
                                    :pagination="relationTablePagination"
                                    :row-selection="roleRowSelection"
                                    :search="false"
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 360, minWidth: 780 }"
                                    :scrollbar="true"
                                    :bordered="true"
                                    :action-ref="setInheritedRoleTableAction"
                                    @selection-change="reloadInheritedRoleTable"
                                >
                                    <template #form-search>
                                        <form-create
                                            v-model="inheritedRoleSearchFormData"
                                            :rule="inheritedRoleSearchRules"
                                            :option="inheritedRoleSearchFormOptions"
                                        />
                                    </template>
                                    <template #roleEntity="{ record }">
                                        <SpiceDBObjectText
                                            type="role"
                                            :id="record.id"
                                            copyable
                                        />
                                    </template>
                                    <template #roleStatus="{ record }">
                                        <a-tag
                                            :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'"
                                        >
                                            {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                        </a-tag>
                                    </template>
                                    <template #roleAssigned="{ record }">
                                        <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                            {{ record.assigned ? "已继承" : "未继承" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>

                        <a-tab-pane
                            key="menus"
                            title="菜单授权"
                        >
                            <a-card
                                title="可见菜单"
                                :bordered="true"
                            >
                                <GiTable
                                    header-title="可见菜单"
                                    :columns="menuColumns"
                                    :request="getMenuRelationTableData"
                                    row-key="id"
                                    :pagination="relationTablePagination"
                                    :search="false"
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 360, minWidth: 920 }"
                                    :scrollbar="true"
                                    :bordered="true"
                                    :action-ref="setMenuRelationTableAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            v-model="menuSearchFormData"
                                            :rule="menuSearchRules"
                                            :option="menuSearchFormOptions"
                                        />
                                    </template>
                                    <template #menuEntity="{ record }">
                                        <SpiceDBObjectText
                                            type="menu"
                                            :id="record.id"
                                            copyable
                                        />
                                    </template>
                                    <template #menuStatus="{ record }">
                                        <a-tag
                                            :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'"
                                        >
                                            {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                        </a-tag>
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>
                    </a-tabs>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>用户组关系管理</template>
            <template #subtitle>
                维护 user_group.member 成员关系；role.assignee@user_group#active_member 在角色页维护
            </template>
        </a-page-header>

        <main>
            <a-card :bordered="true">
                <GiTable
                    header-title="用户组 Resource 列表"
                    :columns="groupColumns"
                    row-key="id"
                    :request="getGroupTableData"
                    :pagination="groupPagination"
                    :search="false"
                    :options="groupTableOptions"
                    :scroll="{ x: '100%', y: '100%', minWidth: 1080 }"
                    :scrollbar="true"
                    :stripe="true"
                    :bordered="true"
                    :columns-state="groupColumnsState"
                    :action-ref="setGroupTableAction"
                >
                    <template #form-search>
                        <form-create
                            v-model="searchFormData"
                            :rule="searchFormRules"
                            :option="searchFormOptions"
                        />
                    </template>
                    <template #custom-extra>
                        <a-button
                            v-if="groupMeta.viewerCanCreateUserGroup"
                            type="primary"
                            size="small"
                            @click="openCreateGroup"
                        >
                            <template #icon>
                                <icon-plus />
                            </template>
                            创建用户组
                        </a-button>
                    </template>
                    <template #groupEntity="{ record }">
                        <SpiceDBObjectText
                            type="user_group"
                            :id="record.id"
                            copyable
                        />
                    </template>
                    <template #status="{ record }">
                        <a-tag
                            :color="
                                record.status === UserGroupStatusEnum.ENABLE ? 'arcoblue' : 'red'
                            "
                        >
                            {{ record.status === UserGroupStatusEnum.ENABLE ? "启用" : "禁用" }}
                        </a-tag>
                    </template>
                    <template #memberCount="{ record }">
                        {{ record.memberUserIds?.length ?? 0 }}
                    </template>
                    <template #roleCount="{ record }">
                        {{ record.roleIds?.length ?? 0 }}
                    </template>
                    <template #action="{ record }">
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-link @click="openRelationDrawer(record)">编辑关系</a-link>
                            <a-link
                                v-if="record.viewerCanUpdate"
                                @click="openEditGroup(record)"
                            >
                                编辑
                            </a-link>
                            <a-popconfirm
                                v-if="record.viewerCanDelete"
                                content="确定要删除该用户组吗? 删除前会清理 SpiceDB 成员、角色和启用状态。"
                                @ok="deleteUserGroup(record)"
                            >
                                <a-link status="danger">删除</a-link>
                            </a-popconfirm>
                        </a-space>
                    </template>
                </GiTable>
            </a-card>
        </main>
    </GiPageLayout>
</template>

<script setup lang="tsx">
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
        type UpdateUserGroupDto,
        type UserGroupAssignableRoleDto,
        type UserGroupAssignableUserDto,
        type UserGroupFormDto,
        type UserGroupRecordDto,
        type UserGroupRelationMenuDto,
        type UserGroupRelationsDto,
        UserGroupStatusEnum,
        updateUserGroupApi,
    } from "@/api/user-group";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import { Message } from "@arco-design/web-vue";
    import {
        GiTable,
        type ActionType,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { clearFormCreateValidate } from "@/utils/apiValidation";
    import { cloneDeep } from "es-toolkit";
    import { computed, nextTick, ref, shallowRef } from "vue";

    defineOptions({
        name: "UserGroup",
    });

    type GiTableRequestParams = {
        current?: number;
        pageSize?: number;
    };

    type MetadataFormState = {
        name: string;
        code: string;
        description: string | null;
        status: UserGroupStatusEnum;
    };

    const groupTableAction = ref<ActionType | null>(null);
    const memberTableAction = ref<ActionType | null>(null);
    const inheritedRoleTableAction = ref<ActionType | null>(null);
    const menuRelationTableAction = ref<ActionType | null>(null);
    const metadataFormApi = shallowRef<FormCreateApi | null>(null);
    const metadataModalVisible = ref(false);
    const relationDrawerVisible = ref(false);
    const metadataSubmitting = ref(false);
    const relationLoading = ref(false);
    const memberSaving = ref(false);
    const roleSaving = ref(false);
    const currentGroupId = ref<number | null>(null);
    const currentRelations = ref<UserGroupRelationsDto | null>(null);
    const selectedMemberKeys = ref<string[]>([]);
    const selectedRoleKeys = ref<number[]>([]);
    const groupMeta = ref({
        viewerCanCreateUserGroup: false,
    });

    const memberRowSelection = {
        type: "checkbox",
        showCheckedAll: true,
    } as const;

    const roleRowSelection = {
        type: "checkbox",
        showCheckedAll: true,
    } as const;

    const metadataFormInit: MetadataFormState = {
        name: "",
        code: "",
        description: null,
        status: UserGroupStatusEnum.ENABLE,
    };

    const metadataFormData = ref<MetadataFormState>(cloneDeep(metadataFormInit));

    const searchFormData = ref({
        name: "",
        code: "",
        status: undefined as UserGroupStatusEnum | undefined,
    });
    const memberSearchFormData = ref({
        keyword: "",
        assigned: undefined as boolean | undefined,
        banned: undefined as boolean | undefined,
    });
    const inheritedRoleSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const menuSearchFormData = ref({
        keyword: "",
        type: undefined as string | undefined,
        status: undefined as string | undefined,
    });

    const groupPagination = {
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

    const groupTableOptions = {
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

    const groupColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-user-group-spicedb-columns",
    } as const;

    const metadataFormOptions: FormCreateOptions = {
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

    const searchFormRules: FormCreateRule[] = [
        {
            field: "name",
            title: "用户组名称",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索用户组名称",
            },
        },
        {
            field: "code",
            title: "用户组编码",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索用户组编码",
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
                    { label: "启用", value: UserGroupStatusEnum.ENABLE },
                    { label: "禁用", value: UserGroupStatusEnum.DISABLE },
                ],
            },
        },
    ];

    const memberSearchRules: FormCreateRule[] = [
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
            title: "成员状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选成员状态",
                options: [
                    { label: "已加入", value: true },
                    { label: "未加入", value: false },
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

    const inheritedRoleSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "角色",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 名称 / 编码 / 备注",
            },
        },
        {
            field: "status",
            title: "角色状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选角色状态",
                options: [
                    { label: "启用", value: "ENABLE" },
                    { label: "禁用", value: "DISABLE" },
                ],
            },
        },
    ];

    const menuSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "菜单",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 标题 / 所需权限",
            },
        },
        {
            field: "type",
            title: "类型",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "筛选菜单类型",
                options: [
                    { label: "目录", value: "Catalog" },
                    { label: "页面", value: "Page" },
                    { label: "按钮", value: "Button" },
                ],
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
                placeholder: "筛选菜单状态",
                options: [
                    { label: "启用", value: "ENABLE" },
                    { label: "禁用", value: "DISABLE" },
                ],
            },
        },
    ];

    const groupColumns: ProColumns[] = [
        {
            title: "用户组 Resource",
            dataIndex: "id",
            slotName: "groupEntity",
            width: 220,
            fixed: "left",
            hideInSearch: true,
        },
        {
            title: "用户组名称",
            dataIndex: "name",
            width: 160,
            hideInSearch: true,
        },
        {
            title: "编码",
            dataIndex: "code",
            width: 180,
            hideInSearch: true,
        },
        {
            title: "成员数",
            dataIndex: "memberUserIds",
            slotName: "memberCount",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
        {
            title: "角色数",
            dataIndex: "roleIds",
            slotName: "roleCount",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
        {
            title: "状态",
            dataIndex: "status",
            slotName: "status",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
        {
            title: "备注",
            dataIndex: "description",
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

    const memberColumns: ProColumns[] = [
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
            width: 160,
        },
        {
            title: "姓名",
            dataIndex: "name",
            width: 160,
        },
        {
            title: "邮箱",
            dataIndex: "email",
            width: 220,
        },
        {
            title: "账号状态",
            dataIndex: "banned",
            slotName: "banned",
            width: 100,
            align: "center",
        },
        {
            title: "成员状态",
            dataIndex: "assigned",
            slotName: "assigned",
            width: 100,
            align: "center",
        },
    ];

    const roleColumns: ProColumns[] = [
        {
            title: "角色 Resource",
            dataIndex: "id",
            slotName: "roleEntity",
            width: 240,
            fixed: "left",
        },
        {
            title: "角色名称",
            dataIndex: "name",
            width: 160,
        },
        {
            title: "编码",
            dataIndex: "code",
            width: 180,
        },
        {
            title: "状态",
            dataIndex: "status",
            slotName: "roleStatus",
            width: 100,
            align: "center",
        },
        {
            title: "继承状态",
            dataIndex: "assigned",
            slotName: "roleAssigned",
            width: 100,
            align: "center",
        },
        {
            title: "备注",
            dataIndex: "description",
        },
    ];

    const menuColumns: ProColumns[] = [
        {
            title: "菜单 Resource",
            dataIndex: "id",
            slotName: "menuEntity",
            width: 240,
            fixed: "left",
        },
        {
            title: "菜单标题",
            dataIndex: "title",
            width: 180,
        },
        {
            title: "所需权限",
            dataIndex: "requiredPermissionCode",
            width: 260,
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 120,
            align: "center",
        },
        {
            title: "状态",
            dataIndex: "status",
            slotName: "menuStatus",
            width: 100,
            align: "center",
        },
    ];

    const metadataModalTitle = computed(() =>
        currentGroupId.value ? "编辑用户组元数据" : "创建用户组",
    );

    const relationDrawerTitle = computed(() => {
        if (!currentRelations.value) {
            return "用户组 SpiceDB 关系";
        }
        return `${currentRelations.value.group.name} 的 SpiceDB 关系`;
    });

    const metadataFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "用户组名称",
            type: "input",
            props: { allowClear: true, placeholder: "请输入用户组名称" },
            validate: [{ required: true, message: "请输入用户组名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "code",
            title: "用户组编码",
            type: "input",
            props: { allowClear: true, placeholder: "请输入用户组编码" },
            validate: [{ required: true, message: "请输入用户组编码", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "status",
            title: "状态",
            type: "switch",
            props: {
                checkedValue: UserGroupStatusEnum.ENABLE,
                uncheckedValue: UserGroupStatusEnum.DISABLE,
                checkedText: "启用",
                uncheckedText: "禁用",
            },
            col: { span: 24 },
        },
        {
            field: "description",
            title: "备注",
            type: "textarea",
            props: {
                allowClear: true,
                autoSize: { minRows: 3, maxRows: 5 },
                placeholder: "请输入备注",
            },
            col: { span: 24 },
        },
    ]);

    const searchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshGroupTable, resetSearch),
    );
    const memberSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshMemberTable, resetMemberSearch),
    );
    const inheritedRoleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshInheritedRoleTable, resetInheritedRoleSearch),
    );
    const menuSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshMenuRelationTable, resetMenuSearch),
    );

    /**
     * 保存 GiTable action 实例，供搜索和写操作后刷新。
     */
    function setGroupTableAction(action: ActionType) {
        groupTableAction.value = action;
    }

    /**
     * 保存成员分配表格 action 实例，供筛选和关系重载后刷新。
     */
    function setMemberTableAction(action: ActionType) {
        memberTableAction.value = action;
    }

    /**
     * 保存继承角色表格 action 实例，供筛选和关系重载后刷新。
     */
    function setInheritedRoleTableAction(action: ActionType) {
        inheritedRoleTableAction.value = action;
    }

    /**
     * 保存菜单授权表格 action 实例，供筛选和关系重载后刷新。
     */
    function setMenuRelationTableAction(action: ActionType) {
        menuRelationTableAction.value = action;
    }

    /**
     * 构造搜索表单按钮行为。
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
     * 将 GiTable 请求参数转换为用户组分页接口参数。
     */
    async function getGroupTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupRecordDto>> {
        const response = await queryUserGroupListApi({
            ...searchFormData.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        groupMeta.value = response.data.meta ?? {
            viewerCanCreateUserGroup: false,
        };

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 查询后端成员分配表格数据，支持关键字、成员状态和账号状态筛选。
     */
    async function getMemberTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupAssignableUserDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserGroupRelationMembersApi({
            groupId: currentRelations.value.group.id,
            ...memberSearchFormData.value,
            draftUserIds: normalizeStringIds(selectedMemberKeys.value),
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
     * 查询后端继承角色表格数据，支持关键字和角色状态筛选。
     */
    async function getInheritedRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupAssignableRoleDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserGroupRelationRolesApi({
            groupId: currentRelations.value.group.id,
            ...inheritedRoleSearchFormData.value,
            draftRoleIds: normalizeNumberIds(selectedRoleKeys.value),
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
     * 查询后端菜单授权表格数据，支持关键字、菜单类型和状态筛选。
     */
    async function getMenuRelationTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupRelationMenuDto>> {
        if (!currentRelations.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserGroupRelationMenusApi({
            groupId: currentRelations.value.group.id,
            ...menuSearchFormData.value,
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
     * 刷新用户组表格并回到第一页。
     */
    function refreshGroupTable() {
        groupTableAction.value?.setPageInfo?.({ current: 1 });
        void groupTableAction.value?.reload();
    }

    /**
     * 刷新成员分配表格并回到第一页。
     */
    function refreshMemberTable() {
        memberTableAction.value?.setPageInfo?.({ current: 1 });
        void memberTableAction.value?.reload();
    }

    /**
     * 仅重载成员分配表格当前页，供勾选后刷新筛选命中状态。
     */
    function reloadMemberTable() {
        void nextTick(() => memberTableAction.value?.reload());
    }

    /**
     * 刷新继承角色表格并回到第一页。
     */
    function refreshInheritedRoleTable() {
        inheritedRoleTableAction.value?.setPageInfo?.({ current: 1 });
        void inheritedRoleTableAction.value?.reload();
    }

    /**
     * 仅重载继承角色分配表格当前页，供勾选后刷新筛选命中状态。
     */
    function reloadInheritedRoleTable() {
        void nextTick(() => inheritedRoleTableAction.value?.reload());
    }

    /**
     * 刷新菜单授权表格并回到第一页。
     */
    function refreshMenuRelationTable() {
        menuRelationTableAction.value?.setPageInfo?.({ current: 1 });
        void menuRelationTableAction.value?.reload();
    }

    /**
     * 重置搜索条件并刷新列表。
     */
    function resetSearch() {
        searchFormData.value = {
            name: "",
            code: "",
            status: undefined,
        };
        refreshGroupTable();
    }

    /**
     * 重置成员分配表格筛选条件。
     */
    function resetMemberSearch() {
        memberSearchFormData.value = {
            keyword: "",
            assigned: undefined,
            banned: undefined,
        };
        refreshMemberTable();
    }

    /**
     * 重置继承角色表格筛选条件。
     */
    function resetInheritedRoleSearch() {
        inheritedRoleSearchFormData.value = {
            keyword: "",
            status: undefined,
        };
        refreshInheritedRoleTable();
    }

    /**
     * 重置菜单授权表格筛选条件。
     */
    function resetMenuSearch() {
        menuSearchFormData.value = {
            keyword: "",
            type: undefined,
            status: undefined,
        };
        refreshMenuRelationTable();
    }

    /**
     * 当前关系数据更新后刷新所有已挂载的关系表格。
     */
    async function reloadRelationTables() {
        await Promise.all([
            memberTableAction.value?.reload(),
            inheritedRoleTableAction.value?.reload(),
            menuRelationTableAction.value?.reload(),
        ]);
    }

    /**
     * 规整字符串 ID 数组，避免空值被提交给 SpiceDB。
     */
    function normalizeStringIds(ids: unknown): string[] {
        if (!Array.isArray(ids)) {
            return [];
        }
        return ids.map((id) => String(id).trim()).filter(Boolean);
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

    function clearMetadataFormValidationState() {
        const formEl = metadataFormApi.value?.formEl?.();
        const form =
            formEl && "clearValidate" in formEl
                ? formEl
                : ((formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.proxy ??
                  (formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.exposed);
        (form as { clearValidate?: () => void } | undefined)?.clearValidate?.();
    }

    /**
     * 打开创建用户组弹窗。
     */
    function openCreateGroup() {
        currentGroupId.value = null;
        metadataFormData.value = cloneDeep(metadataFormInit);
        metadataModalVisible.value = true;
        void nextTick(clearMetadataFormValidationState);
    }

    /**
     * 打开编辑用户组元数据弹窗。
     */
    function openEditGroup(record: UserGroupRecordDto) {
        currentGroupId.value = record.id;
        metadataFormData.value = {
            name: record.name,
            code: record.code,
            description: record.description ?? null,
            status: record.status,
        };
        metadataModalVisible.value = true;
        void nextTick(clearMetadataFormValidationState);
    }

    /**
     * 在用户组元数据弹窗确认前校验并提交表单。
     */
    async function onMetadataModalBeforeOk() {
        if (!metadataFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            await metadataFormApi.value.validate();
            metadataSubmitting.value = true;
            const payload: UpdateUserGroupDto = {
                ...cloneDeep(metadataFormData.value),
                description: metadataFormData.value.description?.trim() || null,
            };

            if (currentGroupId.value) {
                await updateUserGroupApi(currentGroupId.value, payload);
                if (currentRelations.value?.group.id === currentGroupId.value) {
                    await loadUserGroupRelations(currentGroupId.value);
                }
            } else {
                await createUserGroupApi(payload as UserGroupFormDto);
            }
            Message.success("操作成功");
            await groupTableAction.value?.reload();
            return true;
        } catch {
            return false;
        } finally {
            metadataSubmitting.value = false;
        }
    }

    /**
     * 关闭用户组元数据弹窗并清理临时状态。
     */
    function handleMetadataModalCancel() {
        currentGroupId.value = null;
        metadataFormData.value = cloneDeep(metadataFormInit);
        clearFormCreateValidate(metadataFormApi.value);
    }

    /**
     * 删除用户组并刷新列表和关系抽屉状态。
     */
    async function deleteUserGroup(record: UserGroupRecordDto) {
        await deleteUserGroupApi(record.id);
        Message.success("删除成功");
        await groupTableAction.value?.reload();
        if (currentRelations.value?.group.id === record.id) {
            currentRelations.value = null;
            relationDrawerVisible.value = false;
        }
    }

    /**
     * 打开用户组关系抽屉并加载当前关系视图。
     */
    async function openRelationDrawer(record: UserGroupRecordDto) {
        currentRelations.value = null;
        relationDrawerVisible.value = true;
        await focusUserGroup(record);
    }

    /**
     * 将用户组作为当前关系焦点。
     */
    async function focusUserGroup(record: UserGroupRecordDto) {
        await loadUserGroupRelations(record.id);
    }

    /**
     * 加载用户组 SpiceDB 关系视图，并同步可勾选表格状态。
     */
    async function loadUserGroupRelations(groupId: number) {
        relationLoading.value = true;
        try {
            const response = await getUserGroupRelationsApi(groupId);
            currentRelations.value = response.data;
            selectedMemberKeys.value = [...response.data.memberUserIds];
            selectedRoleKeys.value = [...response.data.roleIds];
            await reloadRelationTables();
        } finally {
            relationLoading.value = false;
        }
    }

    /**
     * 保存用户组成员关系。
     */
    async function saveMembers() {
        if (!currentRelations.value) {
            return;
        }

        memberSaving.value = true;
        try {
            await assignUserGroupMembersApi({
                groupId: currentRelations.value.group.id,
                userIds: normalizeStringIds(selectedMemberKeys.value),
            });
            Message.success("成员关系已更新");
            await Promise.all([
                loadUserGroupRelations(currentRelations.value.group.id),
                groupTableAction.value?.reload(),
            ]);
        } finally {
            memberSaving.value = false;
        }
    }

    /**
     * 保存用户组继承角色关系。
     */
    async function saveRoles() {
        if (!currentRelations.value) {
            return;
        }

        roleSaving.value = true;
        try {
            await assignUserGroupRolesApi({
                groupId: currentRelations.value.group.id,
                roleIds: normalizeNumberIds(selectedRoleKeys.value),
            });
            Message.success("角色关系已更新");
            await Promise.all([
                loadUserGroupRelations(currentRelations.value.group.id),
                groupTableAction.value?.reload(),
            ]);
        } finally {
            roleSaving.value = false;
        }
    }
</script>
