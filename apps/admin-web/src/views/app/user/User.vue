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
            title="重置应用用户密码"
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
            v-model:visible="disableUserModalVisible"
            title="禁用应用用户"
            width="520px"
            unmount-on-close
            :confirm-loading="disableUserSubmitting"
            @before-ok="onDisableUserBeforeOk"
            @cancel="handleDisableUserCancel"
        >
            <form-create
                v-model="disableUserFormData"
                v-model:api="disableUserFormApi"
                :rule="disableUserFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-modal
            v-model:visible="deleteUserModalVisible"
            :title="deleteUserModalTitle"
            width="520px"
            unmount-on-close
            :confirm-loading="deleteUserSubmitting"
            @before-ok="onDeleteUserBeforeOk"
            @cancel="handleDeleteUserCancel"
        >
            <form-create
                v-model="deleteUserFormData"
                v-model:api="deleteUserFormApi"
                :rule="deleteUserFormRules"
                :option="modalFormOptions"
            />
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
                        <a-descriptions-item label="状态">
                            <a-tag :color="getStatusColor(detailUser)">
                                {{ getStatusLabel(detailUser) }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="姓名">
                            {{ detailUser.name || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="昵称">
                            {{ detailUser.nickname || "-" }}
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
                        <a-descriptions-item label="头像">
                            {{ detailUser.avatar || detailUser.image || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="创建时间">
                            {{ formatDateTime(detailUser.createdAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="更新时间">
                            {{ formatDateTime(detailUser.updatedAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁原因">
                            {{ detailUser.banReason || "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="封禁过期">
                            {{ formatDateTime(detailUser.banExpires) }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-descriptions
                        bordered
                        :column="3"
                    >
                        <a-descriptions-item label="App Profile ID">
                            {{ detailUser.profile?.id ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Profile 状态">
                            {{ detailUser.profile?.status ?? detailUser.status }}
                        </a-descriptions-item>
                        <a-descriptions-item label="等级">
                            {{ detailUser.profile?.level ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="经验">
                            {{ detailUser.profile?.exp ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="性别">
                            {{ detailUser.profile?.gender ?? 0 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Profile 更新时间">
                            {{ formatDateTime(detailUser.profile?.updatedAt) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="分配角色">
                            <a-space
                                v-if="detailUser.roleIds.length"
                                wrap
                                size="mini"
                            >
                                <a-tag
                                    v-for="roleId in detailUser.roleIds"
                                    :key="roleId"
                                    color="arcoblue"
                                >
                                    {{ getRoleLabel(roleId) }}
                                </a-tag>
                            </a-space>
                            <span v-else>-</span>
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
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>应用用户</template>
            <template #subtitle>通过 admin-api 控制面调用 app-api 内部管理 API</template>
        </a-page-header>

        <a-space
            direction="vertical"
            fill
            size="large"
        >
            <a-card :bordered="true">
                <GiTable
                    row-key="id"
                    header-title="应用用户列表"
                    :columns="columns"
                    :request="requestUsers"
                    :pagination="pagination"
                    :search="false"
                    :options="tableOptions"
                    :columns-state="columnsState"
                    :scroll="{ x: '100%', y: '100%', minWidth: 1480 }"
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
                            v-if="listMeta.viewerCanCreateUser"
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
                    <template #status="{ record }">
                        <a-tag :color="getStatusColor(record)">
                            {{ getStatusLabel(record) }}
                        </a-tag>
                    </template>
                    <template #roles="{ record }">
                        <a-space
                            v-if="record.roleIds.length"
                            wrap
                            size="mini"
                        >
                            <a-tag
                                v-for="roleId in record.roleIds"
                                :key="roleId"
                                color="arcoblue"
                            >
                                {{ getRoleLabel(roleId) }}
                            </a-tag>
                        </a-space>
                        <span v-else>-</span>
                    </template>
                    <template #createdAt="{ record }">
                        {{ formatDateTime(record.createdAt) }}
                    </template>
                    <template #updatedAt="{ record }">
                        {{ formatDateTime(record.updatedAt) }}
                    </template>
                    <template #action="{ record }">
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-link
                                v-if="record.viewerCanViewUserDetail"
                                @click="openUserDetail(record)"
                            >
                                详情
                            </a-link>
                            <a-link
                                v-if="record.viewerCanUpdateUser"
                                @click="openEditUser(record)"
                            >
                                编辑
                            </a-link>
                            <a-link
                                v-if="record.viewerCanUpdateUserStatus && isUserEnabled(record)"
                                status="danger"
                                @click="openDisableUser(record)"
                            >
                                禁用
                            </a-link>
                            <a-popconfirm
                                v-if="record.viewerCanUpdateUserStatus && !isUserEnabled(record)"
                                :content="buildEnableConfirmContent(record)"
                                @ok="enableUser(record)"
                            >
                                <a-link>启用</a-link>
                            </a-popconfirm>
                            <a-link
                                v-if="record.viewerCanResetUserPassword"
                                @click="openResetPassword(record)"
                            >
                                重置密码
                            </a-link>
                            <a-link
                                v-if="record.viewerCanSoftDeleteUser"
                                status="warning"
                                @click="openDeleteUser(record, DeleteUserMode.SOFT)"
                            >
                                软删除
                            </a-link>
                            <a-link
                                v-if="record.viewerCanDeleteUser"
                                status="danger"
                                @click="openDeleteUser(record, DeleteUserMode.HARD)"
                            >
                                删除
                            </a-link>
                        </a-space>
                    </template>
                </GiTable>
            </a-card>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { Message } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import {
        applyApiFieldErrorsToFormCreate,
        clearApiFieldErrorsFromFormCreate,
        clearFormCreateValidate,
    } from "@/utils/apiValidation";
    import { FormCreatePasswordInput } from "@/components/FormCreatePasswordInput";
    import { cloneDeep } from "es-toolkit";
    import dayjs from "dayjs";
    import {
        computed,
        defineComponent,
        h,
        markRaw,
        nextTick,
        onMounted,
        ref,
        resolveComponent,
        shallowRef,
        type PropType,
    } from "vue";
    import {
        createAppApiUserApi,
        deleteAppApiUserApi,
        getAppApiRoleListApi,
        getAppApiUserDetailApi,
        queryAppApiUserListApi,
        resetAppApiUserPasswordApi,
        softDeleteAppApiUserApi,
        updateAppApiUserApi,
        updateAppApiUserStatusApi,
        type AppApiRoleRecordDto,
        type AppApiUserListMetaDto,
        type AppApiUserQueryDto,
        type AppApiUserRecordDto,
        type UpdateAppApiUserDto,
    } from "@/api/app-user";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import {
        PASSWORD_MAX_LENGTH,
        PASSWORD_MIN_LENGTH,
        PASSWORD_POLICY_MESSAGE,
    } from "@/utils/passwordPolicy";

    defineOptions({ name: "app.user.view" });

    type EditableUserField = "name" | "email" | "phoneNumber" | "nickname" | "avatar" | "roleIds";

    type AppApiUserForm = {
        name: string;
        email: string;
        phoneNumber: string | null;
        password: string;
        nickname: string | null;
        avatar: string | null;
        status: number;
        roleIds: number[];
    };

    type EditableUserSnapshot = Pick<
        AppApiUserForm,
        "name" | "email" | "phoneNumber" | "nickname" | "avatar" | "roleIds"
    >;

    type ResetPasswordFormState = {
        password: string;
    };

    type DisableUserFormState = {
        banReason: string;
    };

    type DeleteUserFormState = {
        deleteReason: string;
    };

    type UserSearchFormState = {
        id: string;
        name: string;
        nickname: string;
        email: string;
        phoneNumber: string;
        status?: number;
        roleId?: number;
        emailVerified?: boolean;
        phoneNumberVerified?: boolean;
        createdAtRange: string[];
        updatedAtRange: string[];
    };

    type SelectOptionValue = string | number | boolean;

    enum UserModalType {
        ADD = "ADD",
        EDIT = "EDIT",
    }

    enum DeleteUserMode {
        SOFT = "SOFT",
        HARD = "HARD",
    }

    const EditableTextInput = defineComponent({
        name: "AppEditableTextInput",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: [String, null] as PropType<string | null>,
                default: "",
            },
            displayValue: {
                type: [String, null] as PropType<string | null>,
                default: null,
            },
            placeholder: {
                type: String,
                default: "",
            },
            editDisabled: {
                type: Boolean,
                default: false,
            },
            showUnlock: {
                type: Boolean,
                default: false,
            },
            field: {
                type: String as PropType<EditableUserField>,
                required: true,
            },
        },
        emits: ["update:modelValue", "toggleEdit"],
        setup(props, { attrs, emit }) {
            const TextInput = resolveComponent("a-input");
            const InputGroup = resolveComponent("a-input-group");
            const Button = resolveComponent("a-button");
            const EditIcon = resolveComponent("icon-edit");
            return () => {
                const inputValue =
                    props.editDisabled &&
                    (props.modelValue === "" ||
                        props.modelValue === null ||
                        props.modelValue === undefined)
                        ? (props.displayValue ?? "")
                        : props.modelValue;
                const inputNode = h(TextInput, {
                    ...attrs,
                    "style": "flex:1;min-width:0;",
                    "modelValue": inputValue ?? "",
                    "placeholder": props.placeholder,
                    "disabled": props.editDisabled,
                    "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
                });

                if (!props.showUnlock) {
                    return inputNode;
                }

                return h(InputGroup, { style: "width:100%;" }, [
                    inputNode,
                    h(
                        Button,
                        {
                            type: props.editDisabled ? "secondary" : "primary",
                            title: props.editDisabled ? "开启编辑" : "关闭编辑",
                            onClick: (event: MouseEvent) => {
                                event.stopPropagation();
                                emit("toggleEdit", props.field);
                            },
                        },
                        { icon: () => h(EditIcon) },
                    ),
                ]);
            };
        },
    });

    const EditableRoleSelect = defineComponent({
        name: "AppEditableRoleSelect",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: Array as PropType<number[]>,
                default: () => [],
            },
            displayValue: {
                type: Array as PropType<number[]>,
                default: () => [],
            },
            options: {
                type: Array as PropType<
                    Array<{ label: string; value: number; disabled?: boolean }>
                >,
                default: () => [],
            },
            loading: {
                type: Boolean,
                default: false,
            },
            placeholder: {
                type: String,
                default: "",
            },
            editDisabled: {
                type: Boolean,
                default: false,
            },
            showUnlock: {
                type: Boolean,
                default: false,
            },
            field: {
                type: String as PropType<EditableUserField>,
                required: true,
            },
        },
        emits: ["update:modelValue", "toggleEdit"],
        setup(props, { attrs, emit }) {
            const Select = resolveComponent("a-select");
            const InputGroup = resolveComponent("a-input-group");
            const Button = resolveComponent("a-button");
            const EditIcon = resolveComponent("icon-edit");
            return () => {
                const selectValue =
                    props.editDisabled &&
                    props.modelValue.length === 0 &&
                    props.displayValue.length > 0
                        ? props.displayValue
                        : props.modelValue;
                const selectNode = h(Select, {
                    ...attrs,
                    "style": "flex:1;min-width:0;",
                    "triggerProps": {
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    },
                    "modelValue": selectValue,
                    "options": props.options,
                    "loading": props.loading,
                    "placeholder": props.placeholder,
                    "disabled": props.editDisabled,
                    "multiple": true,
                    "allowClear": true,
                    "allowSearch": true,
                    "onUpdate:modelValue": (value: number[]) => emit("update:modelValue", value),
                });

                if (!props.showUnlock) {
                    return selectNode;
                }

                return h(InputGroup, { style: "width:100%;" }, [
                    selectNode,
                    h(
                        Button,
                        {
                            type: props.editDisabled ? "secondary" : "primary",
                            title: props.editDisabled ? "开启编辑" : "关闭编辑",
                            onClick: (event: MouseEvent) => {
                                event.stopPropagation();
                                emit("toggleEdit", props.field);
                            },
                        },
                        { icon: () => h(EditIcon) },
                    ),
                ]);
            };
        },
    });

    const editableTextInputComponent = markRaw(EditableTextInput);
    const passwordInputComponent = markRaw(FormCreatePasswordInput);
    const editableRoleSelectComponent = markRaw(EditableRoleSelect);

    const tableAction = shallowRef<ActionType>();
    const userFormApi = shallowRef<FormCreateApi | null>(null);
    const resetPasswordFormApi = shallowRef<FormCreateApi | null>(null);
    const disableUserFormApi = shallowRef<FormCreateApi | null>(null);
    const deleteUserFormApi = shallowRef<FormCreateApi | null>(null);
    const roleLoading = ref(false);
    const roleOptions = ref<AppApiRoleRecordDto[]>([]);
    const userModalVisible = ref(false);
    const userSubmitting = ref(false);
    const currentUserModalType = ref<UserModalType>(UserModalType.ADD);
    const editingUserId = ref<string | null>(null);
    const editingUserSnapshot = ref<EditableUserSnapshot | null>(null);
    const unlockedEditFields = ref<EditableUserField[]>([]);
    const detailDrawerVisible = ref(false);
    const detailLoading = ref(false);
    const detailUser = ref<AppApiUserRecordDto | null>(null);
    const resetPasswordModalVisible = ref(false);
    const resetPasswordSubmitting = ref(false);
    const resetPasswordTargetUser = ref<AppApiUserRecordDto | null>(null);
    const disableUserModalVisible = ref(false);
    const disableUserSubmitting = ref(false);
    const disableUserTargetUser = ref<AppApiUserRecordDto | null>(null);
    const deleteUserModalVisible = ref(false);
    const deleteUserSubmitting = ref(false);
    const deleteUserTargetUser = ref<AppApiUserRecordDto | null>(null);
    const deleteUserMode = ref<DeleteUserMode>(DeleteUserMode.SOFT);

    const listMeta = ref<AppApiUserListMetaDto>({
        viewerCanCreateUser: false,
        viewerCanViewUserDetail: false,
        viewerCanUpdateUser: false,
        viewerCanUpdateUserStatus: false,
        viewerCanSoftDeleteUser: false,
        viewerCanDeleteUser: false,
        viewerCanResetUserPassword: false,
    });

    const userSearchFormData = ref<UserSearchFormState>(createEmptyUserSearchForm());
    const userFormData = ref<AppApiUserForm>(createEmptyUserForm());
    const resetPasswordFormData = ref<ResetPasswordFormState>({ password: "" });
    const disableUserFormData = ref<DisableUserFormState>({ banReason: "" });
    const deleteUserFormData = ref<DeleteUserFormState>({ deleteReason: "" });

    const pagination = {
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
    const columnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-app-user-columns",
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

    const userModalTitle = computed(() =>
        currentUserModalType.value === UserModalType.ADD ? "创建应用用户" : "编辑应用用户",
    );
    const deleteUserModalTitle = computed(() =>
        deleteUserMode.value === DeleteUserMode.SOFT ? "软删除应用用户" : "删除应用用户",
    );
    const detailDrawerTitle = computed(() =>
        detailUser.value
            ? `应用用户详情 - ${detailUser.value.name || detailUser.value.id}`
            : "应用用户详情",
    );
    const roleLabelById = computed(
        () => new Map(roleOptions.value.map((role) => [role.id, `${role.name}（${role.code}）`])),
    );
    const roleSelectOptions = computed(() =>
        roleOptions.value.map((role) => ({
            label: `${role.name}（${role.code}）`,
            value: role.id,
            disabled: role.status !== "ENABLE",
        })),
    );
    const roleFilterOptions = computed(() =>
        roleOptions.value.map((role) => ({
            label: `${role.name}（${role.code}）`,
            value: role.id,
        })),
    );

    const detailBetterAuthColumns = [
        { title: "Better Auth 字段", dataIndex: "field", width: 220 },
        { title: "值", dataIndex: "value", ellipsis: true, tooltip: true },
    ];
    const detailBetterAuthRows = computed(() => {
        const user = detailUser.value;
        if (!user) {
            return [];
        }

        return [
            { field: "id", value: user.id },
            { field: "name", value: user.name || "-" },
            { field: "email", value: user.email || "-" },
            { field: "emailVerified", value: formatBoolean(user.emailVerified) },
            { field: "image", value: user.image || "-" },
            { field: "banned", value: formatBoolean(user.banned) },
            { field: "banReason", value: user.banReason || "-" },
            { field: "banExpires", value: formatDateTime(user.banExpires) },
            { field: "phoneNumber", value: user.phoneNumber || "-" },
            { field: "phoneNumberVerified", value: formatBoolean(user.phoneNumberVerified) },
            { field: "createdAt", value: formatDateTime(user.createdAt) },
            { field: "updatedAt", value: formatDateTime(user.updatedAt) },
        ];
    });

    const columns: ProColumns[] = [
        {
            title: "用户 ID",
            dataIndex: "id",
            width: 240,
            fixed: "left",
            ellipsis: true,
            tooltip: true,
        },
        { title: "姓名", dataIndex: "name", width: 150 },
        { title: "昵称", dataIndex: "nickname", width: 150 },
        { title: "邮箱", dataIndex: "email", width: 220, ellipsis: true, tooltip: true },
        { title: "手机号", dataIndex: "phoneNumber", width: 150 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100, align: "center" },
        { title: "分配角色", dataIndex: "roleIds", slotName: "roles", width: 260 },
        { title: "创建时间", dataIndex: "createdAt", slotName: "createdAt", width: 180 },
        { title: "更新时间", dataIndex: "updatedAt", slotName: "updatedAt", width: 180 },
        {
            title: "操作",
            dataIndex: "action",
            slotName: "action",
            fixed: "right",
            width: 340,
            align: "center",
            hideInSetting: true,
        },
    ];

    const userSearchRules = computed<FormCreateRule[]>(() => [
        createInputSearchRule("id", "用户 ID", "搜索用户 ID"),
        createInputSearchRule("name", "姓名", "搜索姓名"),
        createInputSearchRule("nickname", "昵称", "搜索昵称"),
        createInputSearchRule("email", "邮箱", "搜索邮箱"),
        createInputSearchRule("phoneNumber", "手机号", "搜索手机号"),
        createSelectSearchRule(
            "status",
            "状态",
            [
                { label: "启用", value: 1 },
                { label: "禁用", value: 0 },
            ],
            "选择状态",
        ),
        createSelectSearchRule("roleId", "分配角色", roleFilterOptions.value, "选择分配角色"),
        createSelectSearchRule(
            "emailVerified",
            "邮箱验证",
            [
                { label: "已验证", value: true },
                { label: "未验证", value: false },
            ],
            "选择邮箱验证状态",
        ),
        createSelectSearchRule(
            "phoneNumberVerified",
            "手机验证",
            [
                { label: "已验证", value: true },
                { label: "未验证", value: false },
            ],
            "选择手机验证状态",
        ),
        createDateRangeSearchRule("createdAtRange", "创建时间"),
        createDateRangeSearchRule("updatedAtRange", "更新时间"),
    ]);
    const userSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshUserTable, resetSearch),
    );
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

    const disableUserFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "banReason",
            title: "禁用原因",
            type: "textarea",
            props: {
                allowClear: true,
                autoSize: { minRows: 3, maxRows: 5 },
                placeholder: "请输入禁用原因",
            },
            validate: [{ required: true, message: "请输入禁用原因", trigger: "change" }],
            col: { span: 24 },
        },
    ]);

    const deleteUserFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "deleteReason",
            title: "删除原因",
            type: "textarea",
            props: {
                allowClear: true,
                autoSize: { minRows: 3, maxRows: 5 },
                placeholder: "请输入删除原因",
            },
            validate: [{ required: true, message: "请输入删除原因", trigger: "change" }],
            col: { span: 24 },
        },
    ]);

    const userFormRules = computed<FormCreateRule[]>(() => {
        const isCreate = currentUserModalType.value === UserModalType.ADD;
        const rules: FormCreateRule[] = [
            {
                field: "name",
                title: "姓名",
                type: "editableTextInput",
                component: editableTextInputComponent,
                props: buildEditableTextProps("name", "请输入姓名", isCreate),
                validate: [{ required: true, message: "请输入姓名", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "email",
                title: "邮箱",
                type: "editableTextInput",
                component: editableTextInputComponent,
                props: buildEditableTextProps("email", "请输入邮箱", isCreate),
                validate: [
                    { required: true, message: "请输入邮箱", trigger: "change" },
                    { type: "email", message: "请输入正确邮箱", trigger: "change" },
                ],
                col: { span: 24 },
            },
        ];

        if (isCreate) {
            rules.push({
                field: "password",
                title: "密码",
                type: "passwordInput",
                component: passwordInputComponent,
                props: {
                    allowClear: true,
                    placeholder: "请输入初始密码",
                },
                validate: [
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
                ],
                col: { span: 24 },
            });
        }

        rules.push(
            {
                field: "phoneNumber",
                title: "手机号",
                type: "editableTextInput",
                component: editableTextInputComponent,
                props: buildEditableTextProps("phoneNumber", "请输入手机号", isCreate),
                col: { span: 24 },
            },
            {
                field: "nickname",
                title: "昵称",
                type: "editableTextInput",
                component: editableTextInputComponent,
                props: buildEditableTextProps("nickname", "请输入昵称", isCreate),
                col: { span: 24 },
            },
            {
                field: "avatar",
                title: "头像地址",
                type: "editableTextInput",
                component: editableTextInputComponent,
                props: buildEditableTextProps("avatar", "请输入头像 URL", isCreate),
                col: { span: 24 },
            },
            {
                field: "roleIds",
                title: "分配角色",
                type: "editableRoleSelect",
                component: editableRoleSelectComponent,
                props: buildEditableRoleProps(isCreate),
                col: { span: 24 },
            },
        );

        if (isCreate) {
            rules.splice(-1, 0, {
                field: "status",
                title: "状态",
                type: "select",
                props: {
                    triggerProps: {
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    },
                    placeholder: "选择状态",
                    options: [
                        { label: "启用", value: 1 },
                        { label: "禁用", value: 0 },
                    ],
                },
                validate: [{ required: true, message: "请选择状态", trigger: "change" }],
                col: { span: 24 },
            });
        }

        return rules;
    });

    function createEmptyUserSearchForm(): UserSearchFormState {
        return {
            id: "",
            name: "",
            nickname: "",
            email: "",
            phoneNumber: "",
            status: undefined,
            roleId: undefined,
            emailVerified: undefined,
            phoneNumberVerified: undefined,
            createdAtRange: [],
            updatedAtRange: [],
        };
    }

    function createEmptyUserForm(): AppApiUserForm {
        return {
            name: "",
            email: "",
            phoneNumber: null,
            password: "",
            nickname: null,
            avatar: null,
            status: 1,
            roleIds: [],
        };
    }

    function buildEditableTextProps(
        field: EditableUserField,
        placeholder: string,
        isCreate: boolean,
    ) {
        return {
            allowClear: true,
            field,
            placeholder,
            displayValue: isCreate
                ? null
                : ((editingUserSnapshot.value?.[field] ?? null) as string | null),
            showUnlock: !isCreate,
            editDisabled: !isCreate && isEditFieldDisabled(field),
            onToggleEdit: toggleEditField,
        };
    }

    function buildEditableRoleProps(isCreate: boolean) {
        return {
            field: "roleIds" as const,
            loading: roleLoading.value,
            placeholder: "选择 app-api 角色",
            options: roleSelectOptions.value,
            displayValue: isCreate ? [] : (editingUserSnapshot.value?.roleIds ?? []),
            showUnlock: !isCreate,
            editDisabled: !isCreate && isEditFieldDisabled("roleIds"),
            onToggleEdit: toggleEditField,
        };
    }

    function isEditFieldDisabled(field: EditableUserField) {
        return !unlockedEditFields.value.includes(field);
    }

    function toggleEditField(field: EditableUserField) {
        if (unlockedEditFields.value.includes(field)) {
            unlockedEditFields.value = unlockedEditFields.value.filter((item) => item !== field);
            return;
        }

        unlockedEditFields.value = [...unlockedEditFields.value, field];
    }

    function createEditableSnapshot(user: AppApiUserRecordDto): EditableUserSnapshot {
        return {
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber ?? null,
            nickname: user.nickname ?? null,
            avatar: user.avatar ?? null,
            roleIds: [...user.roleIds],
        };
    }

    function syncUserFormApiValues() {
        userFormApi.value?.setValue({
            name: userFormData.value.name,
            email: userFormData.value.email,
            phoneNumber: userFormData.value.phoneNumber,
            nickname: userFormData.value.nickname,
            avatar: userFormData.value.avatar,
            roleIds: userFormData.value.roleIds,
            password: userFormData.value.password,
            status: userFormData.value.status,
        });
    }

    function setTableAction(action: ActionType) {
        tableAction.value = action;
    }

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
        options: Array<{ label: string; value: SelectOptionValue }>,
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

    function createDateRangeSearchRule(field: string, title: string): FormCreateRule {
        return {
            field,
            title,
            type: "datePicker",
            props: {
                range: true,
                showTime: true,
                valueFormat: "YYYY-MM-DD HH:mm:ss",
                placeholder: ["开始时间", "结束时间"],
            },
        };
    }

    function buildUserListFilterParams(): AppApiUserQueryDto {
        const search = userSearchFormData.value;
        const filters: AppApiUserQueryDto = {};
        const textFields: Array<
            keyof Pick<UserSearchFormState, "id" | "name" | "nickname" | "email" | "phoneNumber">
        > = ["id", "name", "nickname", "email", "phoneNumber"];

        textFields.forEach((field) => {
            const value = search[field].trim();
            if (value) {
                filters[field] = value;
            }
        });

        if (search.status !== undefined) {
            filters.status = search.status;
        }
        if (search.roleId !== undefined) {
            filters.roleId = search.roleId;
        }
        if (search.emailVerified !== undefined) {
            filters.emailVerified = search.emailVerified;
        }
        if (search.phoneNumberVerified !== undefined) {
            filters.phoneNumberVerified = search.phoneNumberVerified;
        }
        if (Array.isArray(search.createdAtRange) && search.createdAtRange.length > 0) {
            [filters.createdAtStart, filters.createdAtEnd] = search.createdAtRange;
        }
        if (Array.isArray(search.updatedAtRange) && search.updatedAtRange.length > 0) {
            [filters.updatedAtStart, filters.updatedAtEnd] = search.updatedAtRange;
        }

        return filters;
    }

    async function requestUsers(
        params: GiTableRequestParams,
    ): Promise<RequestData<AppApiUserRecordDto>> {
        const response = await queryAppApiUserListApi({
            ...buildUserListFilterParams(),
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        listMeta.value = response.data.meta;
        return {
            data: response.data.records,
            total: response.data.pagination.total,
            success: true,
        };
    }

    function refreshUserTable() {
        tableAction.value?.setPageInfo?.({ current: 1 });
        void tableAction.value?.reload();
    }

    function reloadCurrentUserTable() {
        void tableAction.value?.reload();
    }

    function resetSearch() {
        userSearchFormData.value = createEmptyUserSearchForm();
        refreshUserTable();
    }

    function resetUserForm() {
        userFormData.value = createEmptyUserForm();
        editingUserId.value = null;
        editingUserSnapshot.value = null;
        unlockedEditFields.value = [];
        clearFormCreateValidate(userFormApi.value);
    }

    function handleUserModalCancel() {
        resetUserForm();
    }

    function handleResetPasswordCancel() {
        resetPasswordTargetUser.value = null;
        resetPasswordFormData.value = { password: "" };
        clearFormCreateValidate(resetPasswordFormApi.value);
    }

    function resetDisableUserFormFields() {
        disableUserFormData.value = { banReason: "" };
        disableUserFormApi.value?.setValue?.({ banReason: "" });
        clearFormCreateValidate(disableUserFormApi.value);
    }

    function resetDisableUserForm() {
        disableUserTargetUser.value = null;
        resetDisableUserFormFields();
    }

    function handleDisableUserCancel() {
        resetDisableUserForm();
    }

    function resetDeleteUserFormFields() {
        deleteUserFormData.value = { deleteReason: "" };
        deleteUserFormApi.value?.setValue?.({ deleteReason: "" });
        clearFormCreateValidate(deleteUserFormApi.value);
    }

    function resetDeleteUserForm() {
        deleteUserTargetUser.value = null;
        resetDeleteUserFormFields();
    }

    function handleDeleteUserCancel() {
        resetDeleteUserForm();
    }

    function openCreateUser() {
        currentUserModalType.value = UserModalType.ADD;
        resetUserForm();
        userModalVisible.value = true;
        void ensureRoleOptions();
        void nextTick(() => clearFormCreateValidate(userFormApi.value));
    }

    async function openEditUser(record: AppApiUserRecordDto) {
        currentUserModalType.value = UserModalType.EDIT;
        editingUserId.value = record.id;
        editingUserSnapshot.value = createEditableSnapshot(record);
        unlockedEditFields.value = [];
        void ensureRoleOptions();
        userFormData.value = {
            name: record.name,
            email: record.email,
            phoneNumber: record.phoneNumber ?? null,
            nickname: record.nickname ?? null,
            avatar: record.avatar ?? null,
            roleIds: [...record.roleIds],
            password: "",
            status: record.status,
        };
        userModalVisible.value = true;
        await nextTick();
        syncUserFormApiValues();
        clearFormCreateValidate(userFormApi.value);
    }

    async function openUserDetail(record: AppApiUserRecordDto) {
        detailUser.value = null;
        detailDrawerVisible.value = true;
        await refreshUserDetail(record.id);
    }

    async function refreshUserDetail(userId: string) {
        detailLoading.value = true;
        try {
            const response = await getAppApiUserDetailApi(userId);
            detailUser.value = response.data;
        } finally {
            detailLoading.value = false;
        }
    }

    function openResetPassword(record: AppApiUserRecordDto) {
        resetPasswordTargetUser.value = record;
        resetPasswordFormData.value = { password: "" };
        resetPasswordModalVisible.value = true;
        void nextTick(() => {
            clearApiFieldErrorsFromFormCreate(resetPasswordFormApi.value);
            clearFormCreateValidate(resetPasswordFormApi.value);
        });
    }

    function openDisableUser(record: AppApiUserRecordDto) {
        resetDisableUserFormFields();
        disableUserTargetUser.value = record;
        disableUserModalVisible.value = true;
        void nextTick(resetDisableUserFormFields);
    }

    function openDeleteUser(record: AppApiUserRecordDto, mode: DeleteUserMode) {
        resetDeleteUserFormFields();
        deleteUserTargetUser.value = record;
        deleteUserMode.value = mode;
        deleteUserModalVisible.value = true;
        void nextTick(resetDeleteUserFormFields);
    }

    function normalizeRequiredText(value: string | null) {
        return (value ?? "").trim();
    }

    function getFormApiData<T extends object>(api: FormCreateApi | null, fallback: T): T {
        const formData = (
            api as (FormCreateApi & { formData?: () => Partial<T> }) | null
        )?.formData?.();
        return {
            ...fallback,
            ...(formData ?? {}),
        };
    }

    function normalizeNullableText(value: string | null) {
        const normalized = (value ?? "").trim();
        return normalized.length > 0 ? normalized : null;
    }

    function normalizeRoleIds(value: number[]) {
        return [
            ...new Set(value.map((item) => Number(item)).filter((item) => Number.isFinite(item))),
        ].sort((left, right) => left - right);
    }

    function isSameRoleIds(left: number[], right: number[]) {
        const normalizedLeft = normalizeRoleIds(left);
        const normalizedRight = normalizeRoleIds(right);
        return (
            normalizedLeft.length === normalizedRight.length &&
            normalizedLeft.every((item, index) => item === normalizedRight[index])
        );
    }

    function buildChangedUserPayload(): UpdateAppApiUserDto {
        const snapshot = editingUserSnapshot.value;
        if (!snapshot) {
            return {};
        }

        const current = userFormData.value;
        const payload: UpdateAppApiUserDto = {};
        const name = normalizeRequiredText(current.name);
        const email = normalizeRequiredText(current.email);
        const phoneNumber = normalizeNullableText(current.phoneNumber);
        const nickname = normalizeNullableText(current.nickname);
        const avatar = normalizeNullableText(current.avatar);

        if (name !== normalizeRequiredText(snapshot.name)) payload.name = name;
        if (email !== normalizeRequiredText(snapshot.email)) payload.email = email;
        if (phoneNumber !== normalizeNullableText(snapshot.phoneNumber))
            payload.phoneNumber = phoneNumber;
        if (nickname !== normalizeNullableText(snapshot.nickname)) payload.nickname = nickname;
        if (avatar !== normalizeNullableText(snapshot.avatar)) payload.avatar = avatar;
        if (!isSameRoleIds(current.roleIds, snapshot.roleIds))
            payload.roleIds = normalizeRoleIds(current.roleIds);

        return payload;
    }

    function validateChangedUserPayload(payload: UpdateAppApiUserDto) {
        if (payload.name !== undefined && payload.name.trim().length === 0) {
            Message.error("姓名不能为空");
            return false;
        }
        if (payload.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
            Message.error("请输入正确邮箱");
            return false;
        }
        return true;
    }

    async function onUserModalBeforeOk() {
        if (!userFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            userSubmitting.value = true;
            if (currentUserModalType.value === UserModalType.ADD) {
                await userFormApi.value.validate();
                await createAppApiUserApi(cloneDeep(userFormData.value));
            } else {
                if (!editingUserId.value) {
                    Message.error("缺少用户 ID");
                    return false;
                }
                const payload = buildChangedUserPayload();
                if (Object.keys(payload).length === 0) {
                    Message.info("没有需要更新的字段");
                    resetUserForm();
                    return true;
                }
                if (!validateChangedUserPayload(payload)) {
                    return false;
                }
                await updateAppApiUserApi(editingUserId.value, payload);
                if (detailUser.value?.id === editingUserId.value) {
                    await refreshUserDetail(editingUserId.value);
                }
            }
            Message.success("操作成功");
            resetUserForm();
            reloadCurrentUserTable();
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
            await resetAppApiUserPasswordApi(
                resetPasswordTargetUser.value.id,
                resetPasswordFormData.value.password,
            );
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

    async function onDisableUserBeforeOk() {
        if (!disableUserFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }
        if (!disableUserTargetUser.value) {
            Message.error("请选择需要禁用的用户");
            return false;
        }

        const targetUserId = disableUserTargetUser.value.id;
        try {
            await disableUserFormApi.value.validate();
            const formData = getFormApiData(disableUserFormApi.value, disableUserFormData.value);
            const banReason = normalizeRequiredText(formData.banReason);
            if (!banReason) {
                Message.error("请输入禁用原因");
                return false;
            }
            disableUserSubmitting.value = true;
            await updateAppApiUserStatusApi(targetUserId, 0, banReason);
            Message.success("用户已禁用");
            reloadCurrentUserTable();
            if (detailUser.value?.id === targetUserId) {
                await refreshUserDetail(targetUserId);
            }
            resetDisableUserForm();
            return true;
        } catch {
            return false;
        } finally {
            disableUserSubmitting.value = false;
        }
    }

    async function onDeleteUserBeforeOk() {
        if (!deleteUserFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }
        if (!deleteUserTargetUser.value) {
            Message.error("请选择需要删除的用户");
            return false;
        }

        const targetUserId = deleteUserTargetUser.value.id;
        try {
            await deleteUserFormApi.value.validate();
            const formData = getFormApiData(deleteUserFormApi.value, deleteUserFormData.value);
            const deleteReason = normalizeRequiredText(formData.deleteReason);
            if (!deleteReason) {
                Message.error("请输入删除原因");
                return false;
            }
            deleteUserSubmitting.value = true;
            const deleteAction =
                deleteUserMode.value === DeleteUserMode.SOFT
                    ? softDeleteAppApiUserApi
                    : deleteAppApiUserApi;
            await deleteAction(targetUserId, deleteReason);
            Message.success(
                deleteUserMode.value === DeleteUserMode.SOFT ? "用户已软删除" : "用户已删除",
            );
            reloadCurrentUserTable();
            if (detailUser.value?.id === targetUserId) {
                detailUser.value = null;
                detailDrawerVisible.value = false;
            }
            resetDeleteUserForm();
            return true;
        } catch {
            return false;
        } finally {
            deleteUserSubmitting.value = false;
        }
    }

    async function enableUser(record: AppApiUserRecordDto) {
        await updateAppApiUserStatusApi(record.id, 1);
        Message.success("用户状态已更新");
        reloadCurrentUserTable();
        if (detailUser.value?.id === record.id) {
            await refreshUserDetail(record.id);
        }
    }

    function isUserEnabled(record: Pick<AppApiUserRecordDto, "status" | "banned">) {
        return record.status === 1 && !record.banned;
    }

    function buildEnableConfirmContent(record: AppApiUserRecordDto) {
        return `确定要启用 ${record.name || record.id} 吗？`;
    }

    function getStatusLabel(record: Pick<AppApiUserRecordDto, "status" | "banned">) {
        if (record.banned) {
            return "已封禁";
        }
        return record.status === 1 ? "启用" : "禁用";
    }

    function getStatusColor(record: Pick<AppApiUserRecordDto, "status" | "banned">) {
        return isUserEnabled(record) ? "green" : "red";
    }

    function getRoleLabel(roleId: number) {
        return roleLabelById.value.get(roleId) ?? `角色 ${roleId}`;
    }

    function formatBoolean(value?: boolean | null) {
        if (value === undefined || value === null) {
            return "-";
        }
        return value ? "true" : "false";
    }

    function formatDateTime(value?: string | null) {
        if (!value) {
            return "-";
        }
        const date = dayjs(value);
        return date.isValid() ? date.format("YYYY-MM-DD HH:mm:ss") : String(value);
    }

    async function ensureRoleOptions() {
        if (roleOptions.value.length || roleLoading.value) {
            return;
        }
        await loadRoleOptions();
    }

    async function loadRoleOptions() {
        roleLoading.value = true;
        try {
            const response = await getAppApiRoleListApi();
            roleOptions.value = response.data.records;
        } finally {
            roleLoading.value = false;
        }
    }

    onMounted(() => {
        void loadRoleOptions();
    });
</script>
