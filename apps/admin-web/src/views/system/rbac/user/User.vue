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

        <a-modal
            v-model:visible="impersonateModalVisible"
            title="确认伪装用户"
            width="560px"
            ok-text="确认伪装"
            :confirm-loading="impersonateSubmitting"
            :ok-button-props="{ disabled: !impersonateRiskAccepted }"
            @before-ok="onImpersonateBeforeOk"
            @cancel="handleImpersonateCancel"
        >
            <a-space
                direction="vertical"
                fill
                size="large"
            >
                <a-alert
                    type="warning"
                    show-icon
                >
                    伪装后当前浏览器会切换为目标用户会话，权限、菜单和可访问页面都会按目标用户重新计算。
                </a-alert>
                <a-descriptions
                    bordered
                    :column="1"
                    size="small"
                >
                    <a-descriptions-item label="目标用户">
                        {{ impersonateTargetLabel }}
                    </a-descriptions-item>
                    <a-descriptions-item label="用户 ID">
                        {{ impersonateTargetUser?.id || "-" }}
                    </a-descriptions-item>
                </a-descriptions>
                <a-checkbox v-model="impersonateRiskAccepted">
                    我确认这是一次受控排障或验证操作，并会在完成后退出伪装。
                </a-checkbox>
            </a-space>
        </a-modal>

        <a-drawer
            v-model:visible="detailDrawerVisible"
            :title="detailDrawerTitle"
            width="940px"
            unmount-on-close
            :footer="false"
        >
            <a-spin
                :loading="detailLoading"
                class="tw:w-full"
            >
                <a-space
                    v-if="detailUser"
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-descriptions
                        bordered
                        :column="2"
                    >
                        <a-descriptions-item label="用户 ID">
                            {{ detailUser.id }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Better Auth 角色">
                            {{ detailUser.role || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="用户名">
                            {{ detailUser.username || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="展示名">
                            {{ detailUser.displayUsername || detailUser.name || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="邮箱">
                            <a-space
                                size="mini"
                                wrap
                            >
                                <span>{{ detailUser.email || "-" }}</span>
                                <a-tag :color="detailUser.emailVerified ? 'green' : 'gray'">
                                    {{ detailUser.emailVerified ? "已验证" : "未验证" }}
                                </a-tag>
                            </a-space>
                        </a-descriptions-item>
                        <a-descriptions-item label="手机号">
                            <a-space
                                size="mini"
                                wrap
                            >
                                <span>{{ detailUser.phoneNumber || "-" }}</span>
                                <a-tag :color="detailUser.phoneNumberVerified ? 'green' : 'gray'">
                                    {{ detailUser.phoneNumberVerified ? "已验证" : "未验证" }}
                                </a-tag>
                            </a-space>
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁状态">
                            <a-tag :color="detailUser.banned ? 'red' : 'green'">
                                {{ detailUser.banned ? "已封禁" : "正常" }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁原因">
                            {{ detailUser.banReason || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁到期">
                            {{ formatDate(detailUser.banExpires) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="最后登录">
                            {{ formatDate(detailUser.lastLoginAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="创建时间">
                            {{ formatDate(detailUser.createdAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="更新时间">
                            {{ formatDate(detailUser.updatedAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="备注">
                            {{ detailUser.remark || "-" }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-table
                        row-key="field"
                        size="small"
                        :columns="detailBetterAuthColumns"
                        :data="detailBetterAuthRows"
                        :pagination="false"
                        :scroll="{ x: 820 }"
                        bordered
                    />

                    <a-descriptions
                        bordered
                        :column="4"
                    >
                        <a-descriptions-item label="直接角色">
                            {{ detailUser.roleCount ?? detailUser.roleIds?.length ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="用户组">
                            {{ detailUser.groupCount ?? detailUser.userGroupIds?.length ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效角色">
                            {{
                                detailUser.effectiveRoleCount ??
                                detailUser.effectiveRoleIds?.length ??
                                0
                            }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效权限">
                            {{
                                detailUser.effectivePermissionCount ??
                                detailUser.effectivePermissionIds?.length ??
                                0
                            }}
                        </a-descriptions-item>
                        <a-descriptions-item label="可见菜单">
                            {{
                                detailUser.visibleMenuCount ??
                                detailUser.visibleMenuIds?.length ??
                                0
                            }}
                        </a-descriptions-item>
                        <a-descriptions-item label="账号绑定">
                            {{ detailUser.accountCount ?? detailUser.accounts?.length ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="全部会话">
                            {{ detailUser.sessionCount ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="有效会话">
                            {{ detailUser.activeSessionCount ?? 0 }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-descriptions
                        bordered
                        :column="1"
                    >
                        <a-descriptions-item label="所属用户组">
                            <a-space
                                v-if="detailUser.userGroups?.length"
                                wrap
                                size="mini"
                            >
                                <a-tag
                                    v-for="group in detailUser.userGroups"
                                    :key="group.id"
                                    color="arcoblue"
                                >
                                    {{ group.name }} / {{ group.code }}
                                </a-tag>
                            </a-space>
                            <span v-else>-</span>
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-table
                        row-key="id"
                        size="small"
                        :columns="detailAccountColumns"
                        :data="detailAccountRows"
                        :pagination="false"
                        :scroll="{ x: 820 }"
                        bordered
                    />

                    <a-table
                        row-key="id"
                        size="small"
                        :columns="detailSessionColumns"
                        :data="detailSessionRows"
                        :pagination="false"
                        :scroll="{ x: 820 }"
                        bordered
                    />
                </a-space>
            </a-spin>
        </a-drawer>

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
                <a-alert
                    type="info"
                    show-icon
                >
                    会话列表和撤销操作由 RBAC 用户会话权限控制，撤销会让该用户当前登录态失效。
                </a-alert>
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
                    :request="requestSessions"
                    :pagination="relationPagination"
                    :search="false"
                    :options="relationTableOptions"
                    :columns-state="sessionColumnsState"
                    :scroll="{ x: '100%', minWidth: 900 }"
                    :action-ref="setSessionAction"
                >
                    <template #action="{ record }">
                        <a-popconfirm
                            v-if="currentSessionUser?.viewerCanRevokeSession"
                            content="确定要撤销该会话吗？"
                            @ok="revokeSingleUserSession(record)"
                        >
                            <a-link status="danger">撤销</a-link>
                        </a-popconfirm>
                    </template>
                </GiTable>
            </a-space>
        </a-drawer>

        <a-drawer
            v-model:visible="drawerVisible"
            :title="drawerTitle"
            width="1040px"
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
                    <a-descriptions
                        bordered
                        :column="3"
                    >
                        <a-descriptions-item label="用户 ID">
                            {{ relations.user.id }}
                        </a-descriptions-item>
                        <a-descriptions-item label="用户名">
                            {{ relations.user.username || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="状态">
                            <a-tag :color="relations.user.banned ? 'red' : 'green'">
                                {{ relations.user.banned ? "已封禁" : "正常" }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="直接分配角色">
                            {{ relations.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="加入用户组">
                            {{ relations.groupIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="最终有效权限">
                            {{ relations.effectivePermissionIds.length }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-tabs default-active-key="roles">
                        <a-tab-pane
                            key="roles"
                            title="分配直接角色"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>这个用户直接拥有哪些角色</span>
                                        <a-typography-text code>
                                            rbac:user:{{ relations.user.id }} -> role:&lt;roleId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.user.viewerCanAssignRole"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasRoleChanges"
                                        @click="saveRoles"
                                    >
                                        保存直接角色
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
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 340, minWidth: 780 }"
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
                            key="groups"
                            title="加入用户组"
                        >
                            <a-card :bordered="true">
                                <template #title>
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>这个用户加入哪些用户组</span>
                                        <a-typography-text code>
                                            rbac:user:{{ relations.user.id }} ->
                                            group:&lt;groupId&gt;
                                        </a-typography-text>
                                    </a-space>
                                </template>
                                <template #extra>
                                    <a-button
                                        v-if="relations.user.viewerCanAssignUserGroup"
                                        type="primary"
                                        size="small"
                                        :loading="saving"
                                        :disabled="!hasGroupChanges"
                                        @click="saveGroups"
                                    >
                                        保存加入的用户组
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
                                    :options="relationTableOptions"
                                    :scroll="{ x: '100%', y: 340, minWidth: 760 }"
                                    :scrollbar="true"
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
                    </a-tabs>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>用户</template>
            <template #subtitle>维护后台账号，并为用户分配直接角色或加入用户组</template>
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
                用户页适合处理“某个人能做什么”：直接角色马上作用于这个用户；用户组会把组角色批量授予组内成员。
            </a-alert>

            <a-card :bordered="true">
                <GiTable
                    row-key="id"
                    header-title="用户列表"
                    :columns="columns"
                    :request="requestUsers"
                    :pagination="pagination"
                    :search="false"
                    :options="tableOptions"
                    :columns-state="columnsState"
                    :scroll="{ x: '100%', y: '100%', minWidth: 1540 }"
                    :scrollbar="true"
                    :action-ref="setTableAction"
                    bordered
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
                    <template #action="{ record }">
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-link
                                v-if="record.viewerCanViewDetail"
                                @click="openUserDetail(record)"
                            >
                                详情
                            </a-link>
                            <a-link @click="openRelations(record)">配置授权</a-link>
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
                            <a-link
                                v-if="
                                    record.viewerCanImpersonate &&
                                    !userStore.isImpersonating &&
                                    !record.banned &&
                                    record.id !== currentUserId
                                "
                                status="warning"
                                @click="openImpersonateConfirm(record)"
                            >
                                伪装
                            </a-link>
                            <a-popconfirm
                                v-if="record.viewerCanUpdate && !record.banned"
                                content="确定要封禁该用户吗？"
                                @ok="banUser(record)"
                            >
                                <a-link status="danger">封禁</a-link>
                            </a-popconfirm>
                            <a-link
                                v-if="record.viewerCanUpdate && record.banned"
                                @click="unbanUser(record)"
                            >
                                解封
                            </a-link>
                            <a-popconfirm
                                v-if="record.viewerCanDelete"
                                content="确定要删除该用户吗？"
                                @ok="deleteUser(record)"
                            >
                                <a-link status="danger">删除</a-link>
                            </a-popconfirm>
                        </a-space>
                    </template>
                </GiTable>
            </a-card>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { RbacStatus, type RbacUserDto } from "@/api/rbac/common";
    import {
        assignUserGroupsApi,
        assignUserRolesApi,
        banUserApi,
        createUserApi,
        deleteUserApi,
        getUserDetailApi,
        queryUserList,
        getUserRelationsApi,
        queryUserAssignableRolesApi,
        queryUserAssignableUserGroupsApi,
        queryUserSessionsApi,
        resetUserPasswordApi,
        revokeUserSessionApi,
        revokeUserSessionsApi,
        type CreateUserFormDto,
        type UserDetailDto,
        type UserRelationsDto,
        type UserSessionRecordDto,
        type UpdateUserFormDto,
        unbanUserApi,
        updateUserApi,
    } from "@/api/user";
    import { FormCreatePasswordInput } from "@/components/FormCreatePasswordInput";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { useUserStore } from "@/store";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import {
        applyApiFieldErrorsToFormCreate,
        clearApiFieldErrorsFromFormCreate,
        clearFormCreateValidate,
    } from "@/utils/apiValidation";
    import {
        PASSWORD_MAX_LENGTH,
        PASSWORD_MIN_LENGTH,
        PASSWORD_POLICY_MESSAGE,
    } from "@/utils/passwordPolicy";
    import { Message } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { cloneDeep } from "es-toolkit";
    import { computed, markRaw, nextTick, reactive, ref, shallowRef } from "vue";
    import StatusTag from "../components/StatusTag.vue";

    defineOptions({ name: "RbacUser" });

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

    const tableAction = shallowRef<ActionType>();
    const roleAction = shallowRef<ActionType>();
    const groupAction = shallowRef<ActionType>();
    const sessionAction = shallowRef<ActionType>();
    const userFormApi = shallowRef<FormCreateApi | null>(null);
    const resetPasswordFormApi = shallowRef<FormCreateApi | null>(null);

    const drawerVisible = ref(false);
    const drawerLoading = ref(false);
    const saving = ref(false);
    const userModalVisible = ref(false);
    const resetPasswordModalVisible = ref(false);
    const impersonateModalVisible = ref(false);
    const detailDrawerVisible = ref(false);
    const sessionDrawerVisible = ref(false);
    const userSubmitting = ref(false);
    const resetPasswordSubmitting = ref(false);
    const impersonateSubmitting = ref(false);
    const impersonateRiskAccepted = ref(false);
    const detailLoading = ref(false);
    const sessionRevoking = ref(false);
    const currentUserModalType = ref<UserModalType>(UserModalType.ADD);
    const relations = ref<UserRelationsDto | null>(null);
    const draftRoleIds = ref<number[]>([]);
    const draftGroupIds = ref<number[]>([]);
    const detailUser = ref<UserDetailDto | null>(null);
    const resetPasswordTargetUser = ref<RbacUserDto | null>(null);
    const impersonateTargetUser = ref<RbacUserDto | null>(null);
    const currentSessionUser = ref<RbacUserDto | null>(null);
    const userStore = useUserStore();
    const currentUserId = computed(() => userStore.session?.user?.id ?? "");
    const userMeta = ref({
        viewerCanCreateUser: false,
        viewerCanImpersonateUser: false,
    });

    const userSearchFormData = ref({
        username: "",
        name: "",
        email: "",
        phoneNumber: "",
        banned: undefined as boolean | undefined,
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
    const relationGroupFilters = reactive<{
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
    const resetPasswordFormData = ref<ResetPasswordFormState>({
        password: "",
    });

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
    const tableOptions = {
        reload: true,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };
    const relationTableOptions = { reload: true, density: true, setting: true };
    const rowSelection = { type: "checkbox", showCheckedAll: true } as const;
    const columnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-rbac-user-columns",
    } as const;
    const sessionColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-rbac-user-session-columns",
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

    const drawerTitle = computed(() =>
        relations.value
            ? `配置用户授权 - ${relations.value.user.name || relations.value.user.id}`
            : "配置用户授权",
    );
    const detailDrawerTitle = computed(() =>
        detailUser.value
            ? `用户详情 - ${detailUser.value.username || detailUser.value.name || detailUser.value.id}`
            : "用户详情",
    );
    const userModalTitle = computed(() =>
        currentUserModalType.value === UserModalType.ADD ? "创建用户" : "编辑用户",
    );
    const sessionDrawerTitle = computed(() => {
        if (!currentSessionUser.value) {
            return "用户会话";
        }
        return `${currentSessionUser.value.username || currentSessionUser.value.name} 的会话`;
    });
    const impersonateTargetLabel = computed(() => {
        const user = impersonateTargetUser.value;
        if (!user) {
            return "-";
        }
        return `${user.username || user.name || user.id} / ${user.name || "-"}`;
    });
    const detailBetterAuthColumns = [
        { title: "ShiroBetterAuthUser 字段", dataIndex: "field", width: 220 },
        { title: "值", dataIndex: "value", ellipsis: true, tooltip: true },
    ];
    const detailAccountColumns = [
        { title: "Provider", dataIndex: "providerId", width: 130 },
        { title: "Account ID", dataIndex: "accountId", width: 220, ellipsis: true, tooltip: true },
        { title: "Scope", dataIndex: "scope", width: 180, ellipsis: true, tooltip: true },
        { title: "Access 过期", dataIndex: "accessTokenExpiresAtText", width: 180 },
        { title: "Refresh 过期", dataIndex: "refreshTokenExpiresAtText", width: 180 },
        { title: "创建时间", dataIndex: "createdAtText", width: 180 },
    ];
    const detailSessionColumns = [
        { title: "会话 ID", dataIndex: "id", width: 220, ellipsis: true, tooltip: true },
        { title: "IP", dataIndex: "ipAddress", width: 150 },
        { title: "User Agent", dataIndex: "userAgent", width: 260, ellipsis: true, tooltip: true },
        { title: "创建时间", dataIndex: "createdAtText", width: 180 },
        { title: "过期时间", dataIndex: "expiresAtText", width: 180 },
        { title: "代入来源", dataIndex: "impersonatedBy", width: 160 },
    ];
    const betterAuthUserFields = [
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "role",
        "banned",
        "banReason",
        "banExpires",
        "createdAt",
        "updatedAt",
        "phoneNumber",
        "phoneNumberVerified",
        "username",
        "displayUsername",
    ] as const;
    const detailBetterAuthRows = computed(() => {
        const user = detailUser.value?.betterAuthUser;
        if (!user) {
            return [];
        }

        return betterAuthUserFields.map((field) => ({
            field,
            value: formatRawDetailValue(user[field]),
        }));
    });
    const detailAccountRows = computed(() =>
        (detailUser.value?.accounts ?? []).map((account) => ({
            ...account,
            scope: account.scope || "-",
            accessTokenExpiresAtText: formatDate(account.accessTokenExpiresAt),
            refreshTokenExpiresAtText: formatDate(account.refreshTokenExpiresAt),
            createdAtText: formatDate(account.createdAt),
        })),
    );
    const detailSessionRows = computed(() =>
        (detailUser.value?.recentSessions ?? []).map((session) => ({
            ...session,
            ipAddress: session.ipAddress || "-",
            userAgent: session.userAgent || "-",
            impersonatedBy: session.impersonatedBy || "-",
            createdAtText: formatDate(session.createdAt),
            expiresAtText: formatDate(session.expiresAt),
        })),
    );

    const columns: ProColumns[] = [
        {
            title: "用户 ID",
            dataIndex: "id",
            width: 260,
            fixed: "left",
            ellipsis: true,
            tooltip: true,
        },
        { title: "用户名", dataIndex: "username", width: 160 },
        { title: "姓名", dataIndex: "name", width: 150 },
        { title: "邮箱", dataIndex: "email", width: 220, ellipsis: true, tooltip: true },
        { title: "手机号", dataIndex: "phoneNumber", width: 150 },
        { title: "封禁", dataIndex: "banned", slotName: "banned", width: 100, align: "center" },
        { title: "直接角色", dataIndex: "roleCount", width: 100, align: "center" },
        { title: "用户组", dataIndex: "groupCount", width: 90, align: "center" },
        { title: "有效角色", dataIndex: "effectiveRoleCount", width: 100, align: "center" },
        { title: "有效权限", dataIndex: "effectivePermissionCount", width: 100, align: "center" },
        { title: "可见菜单", dataIndex: "visibleMenuCount", width: 100, align: "center" },
        {
            title: "操作",
            dataIndex: "action",
            slotName: "action",
            fixed: "right",
            width: 300,
            align: "center",
        },
    ];

    const roleColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];

    const groupColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "当前保存状态", dataIndex: "assigned", slotName: "assigned", width: 120 },
    ];

    const sessionColumns: ProColumns[] = [
        { title: "会话 ID", dataIndex: "id", ellipsis: true, tooltip: true, width: 220 },
        { title: "IP", dataIndex: "ipAddress", width: 150 },
        { title: "User Agent", dataIndex: "userAgent", ellipsis: true, tooltip: true },
        { title: "创建时间", dataIndex: "createdAt", width: 180 },
        { title: "过期时间", dataIndex: "expiresAt", width: 180 },
        { title: "操作", dataIndex: "action", slotName: "action", width: 100, align: "center" },
    ];

    const userSearchRules: FormCreateRule[] = [
        {
            field: "username",
            title: "用户名",
            type: "input",
            props: { allowClear: true, placeholder: "搜索用户名" },
        },
        {
            field: "name",
            title: "姓名",
            type: "input",
            props: { allowClear: true, placeholder: "搜索姓名" },
        },
        {
            field: "email",
            title: "邮箱",
            type: "input",
            props: { allowClear: true, placeholder: "搜索邮箱" },
        },
        {
            field: "phoneNumber",
            title: "手机号",
            type: "input",
            props: { allowClear: true, placeholder: "搜索手机号" },
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
    const relationRoleSearchOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(searchRelationRoles, resetRelationRoleFilters),
    );
    const relationGroupSearchOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(searchRelationGroups, resetRelationGroupFilters),
    );
    const relationAssignedOptions = [
        { label: "已保存", value: true },
        { label: "未保存", value: false },
    ];
    const relationStatusOptions = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const relationRoleSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按角色名称筛选"),
        createInputSearchRule("code", "编码", "按角色编码筛选"),
        createSelectSearchRule("status", "状态", relationStatusOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);
    const relationGroupSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("name", "名称", "按用户组名称筛选"),
        createInputSearchRule("code", "编码", "按用户组编码筛选"),
        createSelectSearchRule("status", "状态", relationStatusOptions, "全部"),
        createSelectSearchRule("assigned", "保存状态", relationAssignedOptions, "全部"),
    ]);

    function setTableAction(action: ActionType) {
        tableAction.value = action;
    }
    function setRoleAction(action: ActionType) {
        roleAction.value = action;
    }
    function setGroupAction(action: ActionType) {
        groupAction.value = action;
    }
    function setSessionAction(action: ActionType) {
        sessionAction.value = action;
    }

    const hasRoleChanges = computed(
        () => !isSameNumberSet(draftRoleIds.value, relations.value?.roleIds ?? []),
    );
    const hasGroupChanges = computed(
        () => !isSameNumberSet(draftGroupIds.value, relations.value?.groupIds ?? []),
    );

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

    async function requestUsers(params: GiTableRequestParams): Promise<RequestData<RbacUserDto>> {
        const response = await queryUserList({
            ...userSearchFormData.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        userMeta.value = {
            viewerCanCreateUser: response.data.meta?.viewerCanCreateUser ?? false,
            viewerCanImpersonateUser: response.data.meta?.viewerCanImpersonateUser ?? false,
        };
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    async function requestSessions(
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
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        } as T & { page: number; pageSize: number };
    }

    async function requestRoles(params: GiTableRequestParams) {
        const response = await queryUserAssignableRolesApi(
            toRelationParams(params, {
                userId: relations.value!.user.id,
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

    async function requestGroups(params: GiTableRequestParams) {
        const response = await queryUserAssignableUserGroupsApi(
            toRelationParams(params, {
                userId: relations.value!.user.id,
                draftGroupIds: draftGroupIds.value,
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

    function refreshUserTable() {
        tableAction.value?.setPageInfo?.({ current: 1 });
        void tableAction.value?.reload();
    }

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

    function searchRelationRoles() {
        void roleAction.value?.reload(true);
    }

    function searchRelationGroups() {
        void groupAction.value?.reload(true);
    }

    function syncRelationRoleFilters(value: Partial<typeof relationRoleFilters>) {
        Object.assign(relationRoleFilters, value);
    }

    function syncRelationGroupFilters(value: Partial<typeof relationGroupFilters>) {
        Object.assign(relationGroupFilters, value);
    }

    function resetRelationRoleFilters() {
        relationRoleFilters.name = "";
        relationRoleFilters.code = "";
        relationRoleFilters.status = RbacStatus.ENABLE;
        relationRoleFilters.assigned = undefined;
        searchRelationRoles();
    }

    function resetRelationGroupFilters() {
        relationGroupFilters.name = "";
        relationGroupFilters.code = "";
        relationGroupFilters.status = RbacStatus.ENABLE;
        relationGroupFilters.assigned = undefined;
        searchRelationGroups();
    }

    async function openCreateUser() {
        currentUserModalType.value = UserModalType.ADD;
        userFormData.value = cloneDeep(userFormDataInit);
        userModalVisible.value = true;
        await nextTick();
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    async function openEditUser(record: RbacUserDto) {
        currentUserModalType.value = UserModalType.EDIT;
        userFormData.value = {
            id: record.id,
            username: record.username ?? "",
            name: record.name,
            email: record.email ?? null,
            phoneNumber: record.phoneNumber ?? null,
            image: record.image ?? null,
            remark: record.remark ?? null,
            banned: record.banned ?? false,
            password: null,
        };
        userModalVisible.value = true;
        await nextTick();
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    function openResetPassword(record: RbacUserDto) {
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

    function openImpersonateConfirm(record: RbacUserDto) {
        impersonateTargetUser.value = record;
        impersonateRiskAccepted.value = false;
        impersonateModalVisible.value = true;
    }

    async function openSessionDrawer(record: RbacUserDto) {
        currentSessionUser.value = record;
        sessionDrawerVisible.value = true;
        sessionAction.value?.setPageInfo?.({ current: 1 });
        await nextTick();
        await sessionAction.value?.reload();
    }

    async function openUserDetail(record: RbacUserDto) {
        detailUser.value = null;
        detailDrawerVisible.value = true;
        await refreshUserDetail(record.id);
    }

    async function refreshUserDetail(userId: string) {
        detailLoading.value = true;
        try {
            const response = await getUserDetailApi(userId);
            detailUser.value = response.data;
        } finally {
            detailLoading.value = false;
        }
    }

    async function onUserModalBeforeOk() {
        if (!userFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            await userFormApi.value.validate();
            userSubmitting.value = true;
            if (currentUserModalType.value === UserModalType.ADD) {
                await createUserApi(cloneDeep(userFormData.value) as CreateUserFormDto);
            } else {
                const payload = cloneDeep(userFormData.value) as UpdateUserFormDto;
                if (!payload.id) {
                    Message.error("缺少用户 ID");
                    return false;
                }
                await updateUserApi(payload.id, payload);
                if (relations.value?.user.id === payload.id) {
                    await refreshRelations();
                }
                if (detailUser.value?.id === payload.id) {
                    await refreshUserDetail(payload.id);
                }
            }
            Message.success("操作成功");
            await tableAction.value?.reload();
            return true;
        } catch {
            return false;
        } finally {
            userSubmitting.value = false;
        }
    }

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

    async function onImpersonateBeforeOk() {
        if (!impersonateTargetUser.value) {
            Message.error("请选择需要伪装的用户");
            return false;
        }
        if (!impersonateRiskAccepted.value) {
            Message.warning("请先确认伪装风险");
            return false;
        }

        impersonateSubmitting.value = true;
        try {
            await userStore.impersonateUser(impersonateTargetUser.value.id);
            Message.success("已切换到目标用户会话");
            return true;
        } catch (error) {
            Message.error(error instanceof Error ? error.message : "伪装用户失败");
            return false;
        } finally {
            impersonateSubmitting.value = false;
        }
    }

    function handleUserModalCancel() {
        userFormData.value = cloneDeep(userFormDataInit);
        clearApiFieldErrorsFromFormCreate(userFormApi.value);
        clearFormCreateValidate(userFormApi.value);
    }

    function handleResetPasswordCancel() {
        resetPasswordTargetUser.value = null;
        resetPasswordFormData.value = {
            password: "",
        };
        clearFormCreateValidate(resetPasswordFormApi.value);
    }

    function handleImpersonateCancel() {
        impersonateTargetUser.value = null;
        impersonateRiskAccepted.value = false;
    }

    async function revokeCurrentUserSessions() {
        if (!currentSessionUser.value) {
            Message.error("请选择需要撤销会话的用户");
            return;
        }

        sessionRevoking.value = true;
        try {
            await revokeUserSessionsApi(currentSessionUser.value.id);
            Message.success("用户会话已撤销");
            sessionAction.value?.setPageInfo?.({ current: 1 });
            await sessionAction.value?.reload();
        } finally {
            sessionRevoking.value = false;
        }
    }

    async function revokeSingleUserSession(record: UserSessionRecordDto) {
        await revokeUserSessionApi(record.token);
        Message.success("会话已撤销");
        await sessionAction.value?.reload();
        const detailUserId = detailUser.value?.id;
        if (detailUserId && detailUserId === currentSessionUser.value?.id) {
            await refreshUserDetail(detailUserId);
        }
    }

    async function banUser(record: RbacUserDto) {
        await banUserApi({ id: record.id });
        Message.success("用户已封禁");
        await tableAction.value?.reload();
        if (detailUser.value?.id === record.id) {
            await refreshUserDetail(record.id);
        }
        if (relations.value?.user.id === record.id) {
            await refreshRelations();
        }
    }

    async function unbanUser(record: RbacUserDto) {
        await unbanUserApi(record.id);
        Message.success("用户已解封");
        await tableAction.value?.reload();
        if (detailUser.value?.id === record.id) {
            await refreshUserDetail(record.id);
        }
        if (relations.value?.user.id === record.id) {
            await refreshRelations();
        }
    }

    async function deleteUser(record: RbacUserDto) {
        await deleteUserApi(record.id);
        Message.success("删除成功");
        await tableAction.value?.reload();
        if (relations.value?.user.id === record.id) {
            relations.value = null;
            drawerVisible.value = false;
        }
        if (detailUser.value?.id === record.id) {
            detailUser.value = null;
            detailDrawerVisible.value = false;
        }
    }

    async function openRelations(record: RbacUserDto) {
        relations.value = null;
        drawerVisible.value = true;
        drawerLoading.value = true;
        try {
            const response = await getUserRelationsApi(record.id);
            relations.value = response.data;
            draftRoleIds.value = [...response.data.roleIds];
            draftGroupIds.value = [...response.data.groupIds];
        } finally {
            drawerLoading.value = false;
        }
    }

    async function refreshRelations() {
        if (!relations.value) return;
        const response = await getUserRelationsApi(relations.value.user.id);
        relations.value = response.data;
        draftRoleIds.value = [...response.data.roleIds];
        draftGroupIds.value = [...response.data.groupIds];
    }

    async function saveRoles() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignUserRolesApi({
                userId: relations.value.user.id,
                roleIds: draftRoleIds.value,
            });
            Message.success("直接角色已保存");
            await refreshRelations();
            await roleAction.value?.reload();
            await tableAction.value?.reload();
        } finally {
            saving.value = false;
        }
    }

    async function saveGroups() {
        if (!relations.value) return;
        saving.value = true;
        try {
            await assignUserGroupsApi({
                userId: relations.value.user.id,
                groupIds: draftGroupIds.value,
            });
            Message.success("加入的用户组已保存");
            await refreshRelations();
            await groupAction.value?.reload();
            await tableAction.value?.reload();
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

    function formatDate(value?: string | Date | null) {
        if (!value) {
            return "-";
        }
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const hh = String(date.getHours()).padStart(2, "0");
        const mi = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }

    function formatRawDetailValue(value: unknown) {
        if (value === null) {
            return "null";
        }
        if (value === undefined) {
            return "undefined";
        }
        if (value instanceof Date) {
            return formatDate(value);
        }
        if (typeof value === "boolean") {
            return value ? "true" : "false";
        }
        return String(value);
    }
</script>
