<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="userModalVisible"
            :title="userModalTitle"
            width="760px"
            unmount-on-close
            :confirm-loading="userSubmitting"
            @before-ok="onUserModalBeforeOk"
            @cancel="handleUserModalCancel"
        >
            <form-create
                v-model="userFormData"
                v-model:api="userFormApi"
                :rule="userFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-modal
            v-model:visible="resetPasswordModalVisible"
            title="重置用户密码"
            width="520px"
            unmount-on-close
            :confirm-loading="resetPasswordSubmitting"
            @before-ok="onResetPasswordBeforeOk"
            @cancel="handleResetPasswordCancel"
        >
            <form-create
                v-model="resetPasswordFormData"
                v-model:api="resetPasswordFormApi"
                :rule="resetPasswordFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-drawer
            v-model:visible="sessionDrawerVisible"
            :title="sessionDrawerTitle"
            width="900px"
            unmount-on-close
            :footer="false"
        >
            <a-space
                direction="vertical"
                fill
                size="large"
            >
                <a-space>
                    <a-popconfirm
                        v-if="currentSessionUser?.viewerCanRevokeSession"
                        content="确定要撤销该用户的全部会话吗？"
                        @ok="revokeCurrentUserSessions"
                    >
                        <a-button
                            type="primary"
                            status="danger"
                            size="small"
                            :loading="sessionRevoking"
                            :disabled="!currentSessionUser"
                        >
                            撤销全部会话
                        </a-button>
                    </a-popconfirm>
                </a-space>
                <GiTable
                    header-title="会话列表"
                    row-key="id"
                    :columns="sessionColumns"
                    :request="getSessionTableData"
                    :pagination="{ pageSize: 10 }"
                    :search="false"
                    :options="relationTableOptions"
                    :columns-state="sessionColumnsState"
                    :scroll="{ x: '100%', minWidth: 900 }"
                    :action-ref="setSessionTableAction"
                />
            </a-space>
        </a-drawer>

        <a-drawer
            v-model:visible="relationDrawerVisible"
            :title="relationDrawerTitle"
            width="960px"
            unmount-on-close
            :footer="false"
        >
            <a-spin
                :loading="currentRelationUserId ? isRelationLoading(currentRelationUserId) : false"
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
                        :column="2"
                    >
                        <a-descriptions-item label="用户 Resource">
                            <SpiceDBObjectText
                                type="user"
                                :id="currentRelations.user.id"
                                copyable
                            />
                        </a-descriptions-item>
                        <a-descriptions-item label="有效角色">
                            {{ currentRelations.user.effectiveRoleIds?.length ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="直接角色">
                            {{ currentRelations.user.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="用户组继承">
                            {{ currentRelations.userGroupIds.length }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="roles">
                        <a-tab-pane
                            key="roles"
                            title="角色关系"
                        >
                            <a-space
                                direction="vertical"
                                fill
                                size="large"
                            >
                                <a-card
                                    title="直接角色"
                                    :bordered="true"
                                >
                                    <GiTable
                                        header-title="直接角色"
                                        :columns="userRoleColumns"
                                        :request="getDirectRoleTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 300, minWidth: 720 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setDirectRoleTableAction"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="directRoleSearchFormData"
                                                :rule="roleRelationSearchRules"
                                                :option="directRoleSearchFormOptions"
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
                                                :color="
                                                    record.status === 'ENABLE' ? 'arcoblue' : 'red'
                                                "
                                            >
                                                {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>

                                <a-card
                                    title="有效角色"
                                    :bordered="true"
                                >
                                    <GiTable
                                        header-title="有效角色"
                                        :columns="userRoleColumns"
                                        :request="getEffectiveRoleTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 300, minWidth: 720 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setEffectiveRoleTableAction"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="effectiveRoleSearchFormData"
                                                :rule="roleRelationSearchRules"
                                                :option="effectiveRoleSearchFormOptions"
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
                                                :color="
                                                    record.status === 'ENABLE' ? 'arcoblue' : 'red'
                                                "
                                            >
                                                {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>

                                <a-card
                                    title="继承角色"
                                    :bordered="true"
                                >
                                    <GiTable
                                        header-title="继承角色"
                                        :columns="userRoleColumns"
                                        :request="getInheritedRoleTableData"
                                        row-key="id"
                                        :pagination="relationTablePagination"
                                        :search="false"
                                        :options="relationTableOptions"
                                        :scroll="{ x: '100%', y: 300, minWidth: 720 }"
                                        :scrollbar="true"
                                        :bordered="true"
                                        :action-ref="setInheritedRoleTableAction"
                                    >
                                        <template #form-search>
                                            <form-create
                                                v-model="inheritedRoleSearchFormData"
                                                :rule="roleRelationSearchRules"
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
                                                :color="
                                                    record.status === 'ENABLE' ? 'arcoblue' : 'red'
                                                "
                                            >
                                                {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                            </a-tag>
                                        </template>
                                    </GiTable>
                                </a-card>
                            </a-space>
                        </a-tab-pane>

                        <a-tab-pane
                            key="groups"
                            title="用户组路径"
                        >
                            <a-card
                                title="当前用户组"
                                :bordered="true"
                            >
                                <GiTable
                                    header-title="当前用户组"
                                    :columns="userGroupRelationColumns"
                                    :request="getUserGroupRelationTableData"
                                    row-key="id"
                                    :pagination="relationTablePagination"
                                    :search="false"
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 360, minWidth: 780 }"
                                    :scrollbar="true"
                                    :bordered="true"
                                    :action-ref="setUserGroupRelationTableAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            v-model="userGroupRelationSearchFormData"
                                            :rule="userGroupRelationSearchRules"
                                            :option="userGroupRelationSearchFormOptions"
                                        />
                                    </template>
                                    <template #groupEntity="{ record }">
                                        <SpiceDBObjectText
                                            type="user_group"
                                            :id="record.id"
                                            copyable
                                        />
                                    </template>
                                    <template #groupStatus="{ record }">
                                        <a-tag
                                            :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'"
                                        >
                                            {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                        </a-tag>
                                    </template>
                                    <template #roleCount="{ record }">
                                        {{ record.roleIds?.length ?? 0 }}
                                    </template>
                                </GiTable>
                            </a-card>
                        </a-tab-pane>

                        <a-tab-pane
                            key="menus"
                            title="可见菜单"
                        >
                            <a-card
                                title="当前可见菜单"
                                :bordered="true"
                            >
                                <GiTable
                                    header-title="当前可见菜单"
                                    :columns="userVisibleMenuColumns"
                                    :request="getVisibleMenuTableData"
                                    row-key="id"
                                    :pagination="relationTablePagination"
                                    :search="false"
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 360, minWidth: 780 }"
                                    :scrollbar="true"
                                    :bordered="true"
                                    :action-ref="setVisibleMenuTableAction"
                                >
                                    <template #form-search>
                                        <form-create
                                            v-model="visibleMenuSearchFormData"
                                            :rule="visibleMenuSearchRules"
                                            :option="visibleMenuSearchFormOptions"
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
                <a-empty
                    v-else
                    description="正在加载关系"
                />
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>用户关系管理</template>
            <template #subtitle>
                以 SpiceDB user、role.assigned 和 menu.view 为中心查询用户关系
            </template>
        </a-page-header>

        <a-card :bordered="true">
            <GiTable
                header-title="用户 Resource 列表"
                :columns="userColumns"
                row-key="id"
                v-model:expandedKeys="expandedUserKeys"
                :expandable="userExpandable"
                :request="getUserTableData"
                :pagination="GiTablePagination"
                :search="false"
                :options="GiTableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1320 }"
                :scrollbar="true"
                :stripe="true"
                :bordered="true"
                :columns-state="userColumnsState"
                :action-ref="setUserTableAction"
                @expand="onUserExpand"
            >
                <template #form-search>
                    <form-create
                        v-model="userSearchFormData"
                        :rule="userSearchRules"
                        :option="userSearchFormOptions"
                    />
                </template>
                <template #custom-extra>
                    <a-button
                        v-if="userMeta.viewerCanCreateUser"
                        type="primary"
                        size="small"
                        @click="openCreateUser"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        创建用户
                    </a-button>
                </template>
                <template #banned="{ record }">
                    <a-tag :color="record.banned ? 'red' : 'green'">
                        {{ record.banned ? "已封禁" : "正常" }}
                    </a-tag>
                </template>
                <template #userEntity="{ record }">
                    <SpiceDBObjectText
                        type="user"
                        :id="record.id"
                        copyable
                    />
                </template>
                <template #directRoles="{ record }">
                    <a-space wrap>
                        <SpiceDBObjectText
                            v-for="role in resolveRoles(record.roleIds)"
                            :key="role.id"
                            :label="role.name"
                            type="role"
                            :id="role.id"
                        />
                        <span v-if="!record.roleIds?.length">-</span>
                    </a-space>
                </template>
                <template #effectiveRoles="{ record }">
                    <a-space wrap>
                        <SpiceDBObjectText
                            v-for="role in resolveRoles(record.effectiveRoleIds || [])"
                            :key="role.id"
                            :label="role.name"
                            type="role"
                            :id="role.id"
                        />
                        <span v-if="!record.effectiveRoleIds?.length">-</span>
                    </a-space>
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <ShiroAuth :permissions="UserPermissions.detail">
                            <a-link @click="openUserDetailTab(record)">详情</a-link>
                        </ShiroAuth>
                        <ShiroAuth :permissions="UserPermissions.detail">
                            <a-link @click="openRelationDrawer(record.id)">查看关系</a-link>
                        </ShiroAuth>
                        <a-link
                            v-if="record.viewerCanViewSession"
                            @click="openSessionDrawer(record)"
                        >
                            会话
                        </a-link>
                        <a-link
                            v-if="record.viewerCanUpdate"
                            @click="openEditUser(record)"
                        >
                            编辑
                        </a-link>
                        <a-link
                            v-if="record.viewerCanResetPassword"
                            @click="openResetPassword(record)"
                        >
                            重置密码
                        </a-link>
                        <a-popconfirm
                            v-if="record.viewerCanDelete"
                            content="确定要删除该用户吗?"
                            @ok="deleteUser(record)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
                <template #expand-row="{ record }">
                    <a-spin
                        :loading="isRelationLoading(record.id)"
                        class="tw:w-full"
                    >
                        <template
                            v-for="relation in [getUserRelation(record.id)]"
                            :key="record.id"
                        >
                            <a-row
                                v-if="relation"
                                :gutter="[12, 12]"
                                align="center"
                            >
                                <a-col
                                    :xs="24"
                                    :md="6"
                                >
                                    <a-space
                                        direction="vertical"
                                        size="mini"
                                    >
                                        <a-typography-text type="secondary">
                                            关系焦点
                                        </a-typography-text>
                                        <a-typography-title :heading="6">
                                            {{ relation.user.username || relation.user.name }}
                                        </a-typography-title>
                                    </a-space>
                                </a-col>
                                <a-col
                                    :xs="12"
                                    :md="4"
                                >
                                    <a-statistic
                                        title="直接角色"
                                        :value="relation.user.roleIds.length"
                                    />
                                </a-col>
                                <a-col
                                    :xs="12"
                                    :md="4"
                                >
                                    <a-statistic
                                        title="继承角色"
                                        :value="relation.inheritedRoleIds.length"
                                    />
                                </a-col>
                                <a-col
                                    :xs="12"
                                    :md="4"
                                >
                                    <a-statistic
                                        title="可见菜单"
                                        :value="relation.visibleMenuIds.length"
                                    />
                                </a-col>
                                <a-col
                                    :xs="12"
                                    :md="6"
                                >
                                    <a-space
                                        wrap
                                        size="small"
                                    >
                                        <SpiceDBObjectText
                                            type="user"
                                            :id="relation.user.id"
                                            copyable
                                        />
                                    </a-space>
                                </a-col>
                            </a-row>
                            <a-empty
                                v-else
                                description="正在加载关系"
                            />
                        </template>
                    </a-spin>
                </template>
            </GiTable>
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="tsx">
    import { queryRoleListApi, type DetailRoleDto } from "@/api/role";
    import {
        createUserApi,
        type CreateUserFormDto,
        deleteUserApi,
        queryUserList,
        getUserRelationMenusApi,
        getUserRelationRolesApi,
        getUserRelationUserGroupsApi,
        getUserRelationsApi,
        queryUserSessionsApi,
        resetUserPasswordApi,
        revokeUserSessionsApi,
        type UpdateUserFormDto,
        type UserDetailFormDto,
        type UserGroupRelationDto,
        type UserMenuRelationDto,
        type UserRoleRelationDto,
        type UserRelationsDto,
        type UserSessionRecordDto,
        updateUserApi,
    } from "@/api/user";
    import { FormCreatePasswordInput } from "@/components/FormCreatePasswordInput";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import ShiroAuth from "@/components/ShiroAuth.vue";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import {
        applyApiFieldErrorsToFormCreate,
        clearApiFieldErrorsFromFormCreate,
        clearFormCreateValidate,
    } from "@/utils/apiValidation";
    import { hasPermission } from "@/utils/permission";
    import {
        PASSWORD_MAX_LENGTH,
        PASSWORD_MIN_LENGTH,
        PASSWORD_POLICY_MESSAGE,
    } from "@/utils/passwordPolicy";
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
    import { cloneDeep } from "es-toolkit";
    import { computed, markRaw, nextTick, reactive, ref, shallowRef } from "vue";
    import { useRoute, useRouter } from "vue-router";

    defineOptions({
        name: "User",
    });

    type GiTableRequestParams = {
        current?: number;
        pageSize?: number;
    };

    type UserFormState = Omit<CreateUserFormDto, "password"> & {
        id?: string;
        password?: string | null;
    };

    type ResetPasswordFormState = {
        password: string;
    };

    const passwordInputComponent = markRaw(FormCreatePasswordInput);

    enum UserModalType {
        ADD = "ADD",
        EDIT = "EDIT",
    }

    const UserPermissions = {
        detail: "system.user.detail",
    };

    const userTableAction = ref<ActionType | null>(null);
    const route = useRoute();
    const router = useRouter();
    const sessionTableAction = ref<ActionType | null>(null);
    const directRoleTableAction = ref<ActionType | null>(null);
    const effectiveRoleTableAction = ref<ActionType | null>(null);
    const inheritedRoleTableAction = ref<ActionType | null>(null);
    const userGroupRelationTableAction = ref<ActionType | null>(null);
    const visibleMenuTableAction = ref<ActionType | null>(null);
    const userFormApi = shallowRef<FormCreateApi | null>(null);
    const resetPasswordFormApi = shallowRef<FormCreateApi | null>(null);
    const userModalVisible = ref(false);
    const resetPasswordModalVisible = ref(false);
    const sessionDrawerVisible = ref(false);
    const relationDrawerVisible = ref(false);
    const userSubmitting = ref(false);
    const resetPasswordSubmitting = ref(false);
    const sessionRevoking = ref(false);
    const currentUserModalType = ref<UserModalType>(UserModalType.ADD);
    const roleList = ref<DetailRoleDto[]>([]);
    const resetPasswordTargetUser = ref<UserDetailFormDto | null>(null);
    const currentSessionUser = ref<UserDetailFormDto | null>(null);
    const currentRelationUserId = ref<string | null>(null);
    const expandedUserKeys = ref<Array<string | number>>([]);
    const userMeta = ref({
        viewerCanCreateUser: false,
    });
    const relationByUserId = reactive<Record<string, UserRelationsDto | undefined>>({});
    const relationLoadingByUserId = reactive<Record<string, boolean | undefined>>({});
    const canViewUserDetail = computed(() => hasPermission(UserPermissions.detail));

    const userExpandable = computed(() =>
        canViewUserDetail.value
            ? {
                  width: 48,
                  fixed: true,
              }
            : undefined,
    );

    const userSearchFormData = ref({
        username: "",
        name: "",
        email: "",
        phoneNumber: "",
        banned: undefined as boolean | undefined,
    });
    const directRoleSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const effectiveRoleSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const inheritedRoleSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const userGroupRelationSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const visibleMenuSearchFormData = ref({
        keyword: "",
        type: undefined as string | undefined,
        status: undefined as string | undefined,
    });

    const resetPasswordFormData = ref<ResetPasswordFormState>({
        password: "",
    });

    const userFormDataInit: UserFormState = {
        username: "",
        name: "",
        password: "",
        remark: null,
        phoneNumber: null,
        email: null,
        image: null,
        banned: false,
    };

    const userFormData = ref<UserFormState>(cloneDeep(userFormDataInit));

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

    const userColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-user-spicedb-columns",
    } as const;

    const sessionColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-user-session-columns",
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

    const userSearchRules: FormCreateRule[] = [
        {
            field: "username",
            title: "用户名",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索用户名",
            },
        },
        {
            field: "name",
            title: "姓名",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索姓名",
            },
        },
        {
            field: "email",
            title: "邮箱",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索邮箱",
            },
        },
        {
            field: "phoneNumber",
            title: "手机号",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索手机号",
            },
        },
        {
            field: "banned",
            title: "封禁",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                placeholder: "选择封禁状态",
                options: [
                    { label: "正常", value: false },
                    { label: "已封禁", value: true },
                ],
            },
        },
    ];

    const roleRelationSearchRules: FormCreateRule[] = [
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

    const userGroupRelationSearchRules: FormCreateRule[] = [
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
                    { label: "启用", value: "ENABLE" },
                    { label: "禁用", value: "DISABLE" },
                ],
            },
        },
    ];

    const visibleMenuSearchRules: FormCreateRule[] = [
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

    const userColumns: ProColumns[] = [
        {
            title: "用户 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "userEntity",
            width: 240,
            fixed: "left",
            hideInSearch: true,
        },
        {
            title: "用户名",
            dataIndex: "username",
            valueType: "text",
            width: 160,
            hideInSearch: true,
        },
        {
            title: "姓名",
            dataIndex: "name",
            valueType: "text",
            width: 140,
            hideInSearch: true,
        },
        {
            title: "直接角色",
            dataIndex: "roleIds",
            valueType: "text",
            slotName: "directRoles",
            width: 240,
            hideInSearch: true,
        },
        {
            title: "有效角色",
            dataIndex: "effectiveRoleIds",
            valueType: "text",
            slotName: "effectiveRoles",
            width: 260,
            hideInSearch: true,
        },
        {
            title: "邮箱",
            dataIndex: "email",
            valueType: "text",
            width: 220,
            hideInSearch: true,
        },
        {
            title: "封禁",
            dataIndex: "banned",
            valueType: "text",
            slotName: "banned",
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

    const userRoleColumns: ProColumns[] = [
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

    const userGroupRelationColumns: ProColumns[] = [
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

    const userVisibleMenuColumns: ProColumns[] = [
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

    const sessionColumns: ProColumns[] = [
        {
            title: "会话 ID",
            dataIndex: "id",
            ellipsis: true,
            tooltip: true,
            width: 220,
        },
        {
            title: "IP",
            dataIndex: "ipAddress",
            width: 150,
        },
        {
            title: "User Agent",
            dataIndex: "userAgent",
            ellipsis: true,
            tooltip: true,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
        },
        {
            title: "过期时间",
            dataIndex: "expiresAt",
            width: 180,
        },
    ];

    const userModalTitle = computed(() =>
        currentUserModalType.value === UserModalType.ADD ? "创建用户" : "编辑用户",
    );

    const sessionDrawerTitle = computed(() => {
        if (!currentSessionUser.value) {
            return "用户会话";
        }
        return `${currentSessionUser.value.username || currentSessionUser.value.name} 的会话`;
    });

    const currentRelations = computed(() =>
        currentRelationUserId.value ? getUserRelation(currentRelationUserId.value) : undefined,
    );

    const relationDrawerTitle = computed(() => {
        if (!currentRelations.value) {
            return "用户 SpiceDB 关系";
        }
        return `${currentRelations.value.user.username || currentRelations.value.user.name} 的 SpiceDB 关系`;
    });

    const resetPasswordFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "password",
            title: "新密码",
            type: "passwordInput",
            component: passwordInputComponent,
            props: {
                allowClear: true,
                placeholder: "请输入新密码",
            },
            validate: [
                { required: true, message: "请输入新密码", trigger: "change" },
                { min: PASSWORD_MIN_LENGTH, message: PASSWORD_POLICY_MESSAGE, trigger: "change" },
                { max: PASSWORD_MAX_LENGTH, message: PASSWORD_POLICY_MESSAGE, trigger: "change" },
            ],
            col: { span: 24 },
        },
    ]);

    const userFormRules = computed<FormCreateRule[]>(() => {
        const isCreate = currentUserModalType.value === UserModalType.ADD;
        return [
            {
                field: "username",
                title: "用户名",
                type: "input",
                props: { allowClear: true, placeholder: "请输入用户名" },
                validate: [{ required: true, message: "请输入用户名", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "name",
                title: "姓名",
                type: "input",
                props: { allowClear: true, placeholder: "请输入姓名" },
                validate: [{ required: true, message: "请输入姓名", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "password",
                title: "密码",
                type: "passwordInput",
                component: passwordInputComponent,
                props: {
                    allowClear: true,
                    placeholder: isCreate ? "请输入初始密码" : "留空则不修改密码",
                },
                validate: isCreate
                    ? [
                          { required: true, message: "请输入初始密码", trigger: "change" },
                          {
                              min: PASSWORD_MIN_LENGTH,
                              message: PASSWORD_POLICY_MESSAGE,
                              trigger: "change",
                          },
                          {
                              max: PASSWORD_MAX_LENGTH,
                              message: PASSWORD_POLICY_MESSAGE,
                              trigger: "change",
                          },
                      ]
                    : [],
                col: { span: 24 },
            },
            {
                field: "email",
                title: "邮箱",
                type: "input",
                props: { allowClear: true, placeholder: "请输入邮箱" },
                col: { span: 24 },
            },
            {
                field: "phoneNumber",
                title: "手机号",
                type: "input",
                props: { allowClear: true, placeholder: "请输入手机号" },
                col: { span: 24 },
            },
            {
                field: "image",
                title: "头像地址",
                type: "input",
                props: { allowClear: true, placeholder: "请输入头像 URL" },
                col: { span: 24 },
            },
            {
                field: "banned",
                title: "封禁",
                type: "switch",
                props: {
                    checkedValue: true,
                    uncheckedValue: false,
                    checkedText: "已封禁",
                    uncheckedText: "正常",
                },
                col: { span: 24 },
            },
            {
                field: "remark",
                title: "备注",
                type: "textarea",
                props: {
                    allowClear: true,
                    autoSize: { minRows: 3, maxRows: 5 },
                    placeholder: "请输入备注",
                },
                col: { span: 24 },
            },
        ];
    });

    const userSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshUserTable, resetSearch),
    );
    const directRoleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshDirectRoleTable, resetDirectRoleSearch),
    );
    const effectiveRoleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshEffectiveRoleTable, resetEffectiveRoleSearch),
    );
    const inheritedRoleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshInheritedRoleTable, resetInheritedRoleSearch),
    );
    const userGroupRelationSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshUserGroupRelationTable, resetUserGroupRelationSearch),
    );
    const visibleMenuSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshVisibleMenuTable, resetVisibleMenuSearch),
    );

    /**
     * 保存 GiTable action 实例，供外部筛选和写操作后刷新。
     */
    function setUserTableAction(action: ActionType) {
        userTableAction.value = action;
    }

    /**
     * 保存会话表格 action 实例，供打开抽屉和撤销会话后刷新。
     */
    function setSessionTableAction(action: ActionType) {
        sessionTableAction.value = action;
    }

    /**
     * 保存直接角色只读表格 action 实例，供筛选和关系重载后刷新。
     */
    function setDirectRoleTableAction(action: ActionType) {
        directRoleTableAction.value = action;
    }

    /**
     * 保存有效角色只读表格 action 实例，供筛选和关系重载后刷新。
     */
    function setEffectiveRoleTableAction(action: ActionType) {
        effectiveRoleTableAction.value = action;
    }

    /**
     * 保存继承角色只读表格 action 实例，供筛选和关系重载后刷新。
     */
    function setInheritedRoleTableAction(action: ActionType) {
        inheritedRoleTableAction.value = action;
    }

    /**
     * 保存用户组关系表格 action 实例，供筛选和关系重载后刷新。
     */
    function setUserGroupRelationTableAction(action: ActionType) {
        userGroupRelationTableAction.value = action;
    }

    /**
     * 保存可见菜单表格 action 实例，供筛选和关系重载后刷新。
     */
    function setVisibleMenuTableAction(action: ActionType) {
        visibleMenuTableAction.value = action;
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
     * 将 GiTable 请求参数转换成用户分页接口参数。
     */
    async function getUserTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserDetailFormDto>> {
        const response = await queryUserList({
            ...userSearchFormData.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        userMeta.value = response.data.meta ?? {
            viewerCanCreateUser: false,
        };

        return {
            data: response.data.records,
            success: true,
            total: response.data.pagination.total,
        };
    }

    /**
     * 查询后端用户会话表格数据。
     */
    async function getSessionTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserSessionRecordDto>> {
        if (!currentSessionUser.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await queryUserSessionsApi({
            id: currentSessionUser.value.id,
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
     * 查询后端直接角色表格数据，支持搜索和角色状态筛选。
     */
    async function getDirectRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserRoleRelationDto>> {
        return queryRoleRelationTable("direct", params, directRoleSearchFormData.value);
    }

    /**
     * 查询后端有效角色表格数据，支持搜索和角色状态筛选。
     */
    async function getEffectiveRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserRoleRelationDto>> {
        return queryRoleRelationTable("effective", params, effectiveRoleSearchFormData.value);
    }

    /**
     * 查询后端继承角色表格数据，支持搜索和角色状态筛选。
     */
    async function getInheritedRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserRoleRelationDto>> {
        return queryRoleRelationTable("inherited", params, inheritedRoleSearchFormData.value);
    }

    /**
     * 查询后端用户组关系表格数据，支持搜索和用户组状态筛选。
     */
    async function getUserGroupRelationTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserGroupRelationDto>> {
        if (!currentRelationUserId.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationUserGroupsApi({
            userId: currentRelationUserId.value,
            ...userGroupRelationSearchFormData.value,
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
     * 查询后端可见菜单表格数据，支持搜索、菜单类型和菜单状态筛选。
     */
    async function getVisibleMenuTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<UserMenuRelationDto>> {
        if (!currentRelationUserId.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationMenusApi({
            userId: currentRelationUserId.value,
            ...visibleMenuSearchFormData.value,
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
     * 按通用角色字段查询后端角色关系数据。
     */
    async function queryRoleRelationTable(
        relation: "direct" | "effective" | "inherited",
        params: GiTableRequestParams,
        searchData: { keyword: string; status?: string },
    ): Promise<RequestData<UserRoleRelationDto>> {
        if (!currentRelationUserId.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getUserRelationRolesApi({
            userId: currentRelationUserId.value,
            relation,
            ...searchData,
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
     * 刷新用户表格并回到第一页。
     */
    function refreshUserTable() {
        userTableAction.value?.setPageInfo?.({ current: 1 });
        void userTableAction.value?.reload();
    }

    /**
     * 刷新直接角色表格并回到第一页。
     */
    function refreshDirectRoleTable() {
        directRoleTableAction.value?.setPageInfo?.({ current: 1 });
        void directRoleTableAction.value?.reload();
    }

    /**
     * 刷新有效角色表格并回到第一页。
     */
    function refreshEffectiveRoleTable() {
        effectiveRoleTableAction.value?.setPageInfo?.({ current: 1 });
        void effectiveRoleTableAction.value?.reload();
    }

    /**
     * 刷新继承角色表格并回到第一页。
     */
    function refreshInheritedRoleTable() {
        inheritedRoleTableAction.value?.setPageInfo?.({ current: 1 });
        void inheritedRoleTableAction.value?.reload();
    }

    /**
     * 刷新用户组关系表格并回到第一页。
     */
    function refreshUserGroupRelationTable() {
        userGroupRelationTableAction.value?.setPageInfo?.({ current: 1 });
        void userGroupRelationTableAction.value?.reload();
    }

    /**
     * 刷新可见菜单表格并回到第一页。
     */
    function refreshVisibleMenuTable() {
        visibleMenuTableAction.value?.setPageInfo?.({ current: 1 });
        void visibleMenuTableAction.value?.reload();
    }

    /**
     * 重置搜索条件并刷新用户表格。
     */
    function resetSearch() {
        userSearchFormData.value = {
            username: "",
            name: "",
            email: "",
            phoneNumber: "",
            banned: undefined,
        };
        refreshUserTable();
    }

    /**
     * 重置直接角色表格筛选条件。
     */
    function resetDirectRoleSearch() {
        directRoleSearchFormData.value = {
            keyword: "",
            status: undefined,
        };
        refreshDirectRoleTable();
    }

    /**
     * 重置有效角色表格筛选条件。
     */
    function resetEffectiveRoleSearch() {
        effectiveRoleSearchFormData.value = {
            keyword: "",
            status: undefined,
        };
        refreshEffectiveRoleTable();
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
     * 重置用户组关系表格筛选条件。
     */
    function resetUserGroupRelationSearch() {
        userGroupRelationSearchFormData.value = {
            keyword: "",
            status: undefined,
        };
        refreshUserGroupRelationTable();
    }

    /**
     * 重置可见菜单表格筛选条件。
     */
    function resetVisibleMenuSearch() {
        visibleMenuSearchFormData.value = {
            keyword: "",
            type: undefined,
            status: undefined,
        };
        refreshVisibleMenuTable();
    }

    /**
     * 关系数据更新后刷新所有已挂载的用户关系表格。
     */
    async function reloadUserRelationTables() {
        await Promise.all([
            directRoleTableAction.value?.reload(),
            effectiveRoleTableAction.value?.reload(),
            inheritedRoleTableAction.value?.reload(),
            userGroupRelationTableAction.value?.reload(),
            visibleMenuTableAction.value?.reload(),
        ]);
    }

    /**
     * 根据角色 ID 数组解析角色元数据，用于表格标签展示。
     */
    function resolveRoles(roleIds: number[] = []) {
        const roleIndex = new Map(roleList.value.map((role) => [role.id, role]));
        return roleIds.map((roleId) => roleIndex.get(roleId)).filter(Boolean) as DetailRoleDto[];
    }

    /**
     * 统一把表格行键转换为用户关系缓存键。
     */
    function toUserRelationKey(userId: unknown) {
        return String(userId);
    }

    /**
     * 读取指定用户的已缓存关系视图。
     */
    function getUserRelation(userId: unknown) {
        return relationByUserId[toUserRelationKey(userId)];
    }

    /**
     * 判断指定用户关系视图是否正在加载。
     */
    function isRelationLoading(userId: unknown) {
        return relationLoadingByUserId[toUserRelationKey(userId)] === true;
    }

    /**
     * 清理指定用户的展开行关系缓存和临时状态。
     */
    function clearUserRelationState(userId: unknown) {
        const relationKey = toUserRelationKey(userId);
        delete relationByUserId[relationKey];
        delete relationLoadingByUserId[relationKey];
        expandedUserKeys.value = expandedUserKeys.value.filter(
            (expandedKey) => toUserRelationKey(expandedKey) !== relationKey,
        );
        if (currentRelationUserId.value === relationKey) {
            currentRelationUserId.value = null;
            relationDrawerVisible.value = false;
        }
    }

    /**
     * 打开用户详情独立标签页，并把当前完整路由作为返回来源。
     */
    function openUserDetailTab(record: UserDetailFormDto) {
        if (!canViewUserDetail.value) {
            Message.warning("当前账号无权查看用户详情");
            return;
        }

        void router.push({
            name: "system.user.detail",
            params: {
                id: record.id,
            },
            state: {
                from: route.fullPath,
                title: record.username || record.name || record.id,
            },
        });
    }

    /**
     * 打开创建用户弹窗。
     */
    async function openCreateUser() {
        currentUserModalType.value = UserModalType.ADD;
        userFormData.value = cloneDeep(userFormDataInit);
        userModalVisible.value = true;
        await nextTick();
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    /**
     * 打开编辑用户弹窗，仅装载用户元数据。
     */
    async function openEditUser(record: UserDetailFormDto) {
        currentUserModalType.value = UserModalType.EDIT;
        userFormData.value = {
            id: record.id,
            username: record.username,
            name: record.name,
            email: record.email,
            phoneNumber: record.phoneNumber,
            image: record.image,
            remark: record.remark,
            banned: record.banned,
            password: null,
        };
        userModalVisible.value = true;
        await nextTick();
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    /**
     * 打开重置用户密码弹窗。
     */
    function openResetPassword(record: UserDetailFormDto) {
        resetPasswordTargetUser.value = record;
        resetPasswordFormData.value = {
            password: "",
        };
        resetPasswordModalVisible.value = true;
        void nextTick(() => {
            clearApiFieldErrorsFromFormCreate(resetPasswordFormApi.value);
            clearFormCreateValidate(resetPasswordFormApi.value);
        });
    }

    /**
     * 打开用户会话抽屉并加载会话列表。
     */
    async function openSessionDrawer(record: UserDetailFormDto) {
        currentSessionUser.value = record;
        sessionDrawerVisible.value = true;
        sessionTableAction.value?.setPageInfo?.({ current: 1 });
        await nextTick();
        await sessionTableAction.value?.reload();
    }

    /**
     * 在用户弹窗确认前校验并提交 FormCreate 表单。
     */
    async function onUserModalBeforeOk() {
        if (!userFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        let changedUserId: string | null = null;

        try {
            await userFormApi.value.validate();
            userSubmitting.value = true;
            if (currentUserModalType.value === UserModalType.ADD) {
                await createUserApi(cloneDeep(userFormData.value) as CreateUserFormDto);
            } else {
                const payload = cloneDeep(userFormData.value) as UpdateUserFormDto;
                await updateUserApi(payload.id, payload);
                changedUserId = payload.id;
            }
            Message.success("操作成功");
            await userTableAction.value?.reload();
            if (changedUserId && relationByUserId[changedUserId]) {
                await loadUserRelations(changedUserId, true);
            }
            return true;
        } catch {
            return false;
        } finally {
            userSubmitting.value = false;
        }
    }

    /**
     * 在重置密码弹窗确认前校验并提交新密码。
     */
    async function onResetPasswordBeforeOk() {
        if (!resetPasswordFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }
        if (!resetPasswordTargetUser.value) {
            Message.error("请选择需要重置密码的用户");
            return false;
        }

        try {
            clearApiFieldErrorsFromFormCreate(resetPasswordFormApi.value);
            await resetPasswordFormApi.value.validate();
            resetPasswordSubmitting.value = true;
            await resetUserPasswordApi({
                id: resetPasswordTargetUser.value.id,
                password: resetPasswordFormData.value.password,
            });
            Message.success("密码已重置");
            return true;
        } catch (error) {
            await nextTick();
            await applyApiFieldErrorsToFormCreate(resetPasswordFormApi.value, error);
            return false;
        } finally {
            resetPasswordSubmitting.value = false;
        }
    }

    /**
     * 关闭用户弹窗并重置表单状态。
     */
    function handleUserModalCancel() {
        userFormData.value = cloneDeep(userFormDataInit);
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    /**
     * 关闭重置密码弹窗并清理临时状态。
     */
    function handleResetPasswordCancel() {
        resetPasswordTargetUser.value = null;
        resetPasswordFormData.value = {
            password: "",
        };
        clearFormCreateValidate(resetPasswordFormApi.value);
    }

    /**
     * 撤销当前抽屉用户的全部会话并刷新列表。
     */
    async function revokeCurrentUserSessions() {
        if (!currentSessionUser.value) {
            Message.error("请选择需要撤销会话的用户");
            return;
        }

        sessionRevoking.value = true;
        try {
            await revokeUserSessionsApi(currentSessionUser.value.id);
            Message.success("用户会话已撤销");
            sessionTableAction.value?.setPageInfo?.({ current: 1 });
            await sessionTableAction.value?.reload();
        } finally {
            sessionRevoking.value = false;
        }
    }

    /**
     * 删除用户并刷新列表。
     */
    async function deleteUser(record: UserDetailFormDto) {
        await deleteUserApi(record.id);
        Message.success("删除成功");
        await userTableAction.value?.reload();
        clearUserRelationState(record.id);
    }

    /**
     * 表格展开行打开时按需加载用户关系视图。
     */
    async function onUserExpand(rowKey: string | number, record: Record<string, unknown>) {
        if (!canViewUserDetail.value) {
            return;
        }

        const isExpanding = !expandedUserKeys.value
            .map((expandedKey) => toUserRelationKey(expandedKey))
            .includes(toUserRelationKey(rowKey));

        if (!isExpanding) {
            return;
        }

        await loadUserRelations((record as UserDetailFormDto).id);
    }

    /**
     * 从操作列展开指定用户关系行并加载关系视图。
     */
    async function expandUserRelation(record: UserDetailFormDto) {
        if (!canViewUserDetail.value) {
            Message.warning("当前账号无权查看用户关系");
            return;
        }

        const relationKey = toUserRelationKey(record.id);
        const expandedKeys = expandedUserKeys.value.map((expandedKey) =>
            toUserRelationKey(expandedKey),
        );

        if (!expandedKeys.includes(relationKey)) {
            expandedUserKeys.value = [...expandedUserKeys.value, record.id];
        }

        await loadUserRelations(record.id);
    }

    /**
     * 打开完整用户关系抽屉，并确保抽屉数据已经加载。
     */
    async function openRelationDrawer(userId: string) {
        if (!canViewUserDetail.value) {
            Message.warning("当前账号无权查看用户关系");
            return;
        }

        currentRelationUserId.value = userId;
        relationDrawerVisible.value = true;
        await loadUserRelations(userId);
    }

    /**
     * 加载用户 SpiceDB 关系视图，并按用户维度缓存展开行数据。
     */
    async function loadUserRelations(userId: string, force = false) {
        const relationKey = toUserRelationKey(userId);
        if (!force && relationByUserId[relationKey]) {
            if (currentRelationUserId.value === relationKey) {
                await reloadUserRelationTables();
            }
            return;
        }
        if (relationLoadingByUserId[relationKey]) {
            return;
        }

        try {
            relationLoadingByUserId[relationKey] = true;
            const response = await getUserRelationsApi(userId);
            relationByUserId[relationKey] = response.data;
            if (currentRelationUserId.value === relationKey) {
                await reloadUserRelationTables();
            }
        } finally {
            relationLoadingByUserId[relationKey] = false;
        }
    }

    /**
     * 加载角色选项，供表格标签和分配表单复用。
     */
    async function loadRoleOptions() {
        const response = await queryRoleListApi({});
        roleList.value = response.data.records;
    }

    /**
     * 初始化用户关系页面依赖数据。
     */
    async function initPage() {
        await loadRoleOptions();
    }

    void initPage();
</script>
