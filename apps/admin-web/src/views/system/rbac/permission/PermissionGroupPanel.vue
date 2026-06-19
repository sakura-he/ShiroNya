<template>
    <a-space
        direction="vertical"
        fill
        size="large"
    >
        <a-alert
            type="info"
            show-icon
        >
            分组只用于后台管理页归类，不参与运行时判权；一个权限或菜单只能属于一个分组，保存后会自动改写归属。
        </a-alert>

        <div class="permission-group-board">
            <a-card
                :bordered="true"
                class="permission-group-board__tree"
                :body-style="groupTreeBodyStyle"
            >
                <template #title>分组</template>
                <template #extra>
                    <a-button
                        v-if="groupMeta.viewerCanCreateGroup"
                        type="primary"
                        size="mini"
                        @click="openCreateGroup"
                    >
                        新建
                    </a-button>
                </template>

                <a-input-search
                    v-model="groupKeyword"
                    allow-clear
                    placeholder="搜索分组名称 / 编码"
                    class="permission-group-search"
                />

                <a-spin
                    :loading="loading"
                    class="permission-group-tree-spin"
                >
                    <a-scrollbar
                        v-if="groupTreeData.length"
                        outer-class="permission-group-tree-scrollbar"
                        class="permission-group-tree-scrollbar"
                    >
                        <a-tree
                            v-model:selected-keys="selectedGroupKeys"
                            :data="groupTreeData"
                            block-node
                            @select="handleGroupSelect"
                        >
                            <template #title="{ title }">
                                <span class="permission-group-tree-title">{{ title }}</span>
                            </template>
                            <template #extra="{ permissionCount, menuCount }">
                                <a-space
                                    size="mini"
                                    class="permission-group-tree-extra"
                                >
                                    <a-tag
                                        size="small"
                                        color="arcoblue"
                                    >
                                        权 {{ permissionCount ?? 0 }}
                                    </a-tag>
                                    <a-tag
                                        size="small"
                                        color="green"
                                    >
                                        菜 {{ menuCount ?? 0 }}
                                    </a-tag>
                                </a-space>
                            </template>
                        </a-tree>
                    </a-scrollbar>
                    <a-empty
                        v-else
                        description="暂无分组"
                    />
                </a-spin>
            </a-card>

            <a-card
                :bordered="true"
                class="permission-group-board__detail"
            >
                <template #title>
                    {{ selectedGroup ? `编辑 ${selectedGroup.name}` : "新增分组" }}
                </template>
                <template #extra>
                    <a-space>
                        <a-button
                            v-if="selectedGroup"
                            size="small"
                            @click="openCreateGroup"
                        >
                            新建分组
                        </a-button>
                        <a-popconfirm
                            v-if="selectedGroup?.viewerCanDelete"
                            content="确定删除该分组吗？分组下的权限和菜单会变为未分组。"
                            @ok="deleteCurrentGroup"
                        >
                            <a-button
                                size="small"
                                status="danger"
                            >
                                删除分组
                            </a-button>
                        </a-popconfirm>
                        <a-button
                            type="primary"
                            size="small"
                            :loading="savingGroup"
                            :disabled="!canSaveGroup"
                            @click="saveGroup"
                        >
                            保存分组
                        </a-button>
                    </a-space>
                </template>

                <a-spin :loading="relationsLoading">
                    <form-create
                        :model-value="groupForm"
                        :rule="groupFormRules"
                        :option="groupFormOptions"
                        @update:model-value="syncGroupForm"
                    />

                    <a-divider />

                    <a-space
                        direction="vertical"
                        fill
                    >
                        <a-alert
                            type="info"
                            show-icon
                        >
                            右侧保存只维护当前分组归属；角色真正获得哪些权限仍在角色页授权。
                        </a-alert>

                        <form-create
                            :model-value="groupRelationModel"
                            :rule="groupRelationRules"
                            :option="groupFormOptions"
                            @update:model-value="syncGroupRelationForm"
                        />

                        <div class="permission-group-actions">
                            <a-button
                                type="primary"
                                :loading="savingRelations"
                                :disabled="!canSaveRelations"
                                @click="saveRelations"
                            >
                                保存归属
                            </a-button>
                        </div>
                    </a-space>
                </a-spin>
            </a-card>
        </div>
    </a-space>
</template>

<script setup lang="ts">
    import {
        RbacStatus,
        type RbacMenuDto,
        type RbacPermissionDto,
        type RbacPermissionGroupDto,
    } from "@/api/rbac/common";
    import { queryMenuListApi } from "@/api/menu";
    import {
        assignRbacPermissionGroupRelationsApi,
        createRbacPermissionGroupApi,
        deleteRbacPermissionGroupApi,
        queryRbacPermissionGroupListApi,
        getRbacPermissionGroupRelationsApi,
        type RbacPermissionGroupListMeta,
        updateRbacPermissionGroupApi,
    } from "@/api/rbac/permission-group";
    import { queryRbacPermissionListApi } from "@/api/rbac/permission";
    import PathSegments from "@/components/PathSegments.vue";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { Message, type TreeNodeData } from "@arco-design/web-vue";
    import {
        computed,
        defineComponent,
        h,
        markRaw,
        onMounted,
        reactive,
        ref,
        resolveComponent,
        type CSSProperties,
        type PropType,
    } from "vue";

    type GroupTreeNode = {
        key: number;
        title: string;
        permissionCount: number;
        menuCount: number;
    };
    type PermissionOption = {
        value: number;
        label: string;
        permission: RbacPermissionDto;
    };
    type MenuOption = {
        value: number;
        label: string;
        menu: RbacMenuDto;
    };

    const emit = defineEmits<{
        changed: [];
    }>();

    const loading = ref(false);
    const relationsLoading = ref(false);
    const savingGroup = ref(false);
    const savingRelations = ref(false);
    const groupKeyword = ref("");
    const selectedGroupId = ref<number | null>(null);
    const groups = ref<RbacPermissionGroupDto[]>([]);
    const permissions = ref<RbacPermissionDto[]>([]);
    const menus = ref<RbacMenuDto[]>([]);
    const groupPermissionIds = ref<number[]>([]);
    const groupMenuIds = ref<number[]>([]);
    const groupMeta = reactive<RbacPermissionGroupListMeta>({});
    const groupForm = reactive({
        code: "",
        name: "",
        description: "",
        sort: 0,
        status: RbacStatus.ENABLE,
    });

    const groupTreeBodyStyle: CSSProperties = {
        height: "620px",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };
    const selectVirtualListProps = {
        height: 320,
        threshold: 40,
    };
    const groupStatusOptions = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const groupFormOptions: FormCreateOptions = {
        form: { layout: "vertical" },
        row: { gutter: 12 },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };
    const groupFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "name",
            title: "分组名称",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "例如 系统用户",
            },
            validate: [{ required: true, message: "请输入分组名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "code",
            title: "分组编码",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "例如 system.user",
            },
            validate: [{ required: true, message: "请输入分组编码", trigger: "change" }],
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
                allowSearch: true,
                placeholder: "请选择状态",
                options: groupStatusOptions,
            },
            col: { span: 24 },
        },
        {
            field: "sort",
            title: "排序",
            type: "inputNumber",
            props: {
                min: 0,
                precision: 0,
                class: "tw:w-full",
                placeholder: "请输入排序",
            },
            col: { span: 24 },
        },
        {
            field: "description",
            title: "描述",
            type: "textarea",
            props: {
                allowClear: true,
                placeholder: "请输入描述",
                autoSize: { minRows: 2, maxRows: 4 },
            },
            col: { span: 24 },
        },
    ]);

    const selectedGroup = computed(
        () => groups.value.find((group) => group.id === selectedGroupId.value) ?? null,
    );
    const selectedGroupKeys = computed<Array<string | number>>({
        get: () => (selectedGroupId.value ? [selectedGroupId.value] : []),
        set: (keys) => {
            selectedGroupId.value = keys[0] ? Number(keys[0]) : null;
        },
    });
    const filteredGroups = computed(() => {
        const keyword = groupKeyword.value.trim().toLowerCase();
        if (!keyword) {
            return groups.value;
        }
        return groups.value.filter((group) =>
            [group.name, group.code, group.description]
                .filter(Boolean)
                .some((text) => String(text).toLowerCase().includes(keyword)),
        );
    });
    const groupTreeData = computed<GroupTreeNode[]>(() =>
        filteredGroups.value.map((group) => ({
            key: group.id,
            title: `${group.name} / ${group.code}`,
            permissionCount: group.permissionCount ?? 0,
            menuCount: group.menuCount ?? 0,
        })),
    );
    const permissionOptions = computed<PermissionOption[]>(() =>
        permissions.value.map((permission) => ({
            value: permission.id,
            label: formatPermissionOptionLabel(permission),
            permission,
        })),
    );
    const menuOptions = computed<MenuOption[]>(() =>
        menus.value.map((menu) => ({
            value: menu.id,
            label: formatMenuOptionLabel(menu),
            menu,
        })),
    );
    const canSaveGroup = computed(() =>
        selectedGroup.value ? selectedGroup.value.viewerCanUpdate : groupMeta.viewerCanCreateGroup,
    );
    const canAssignRelations = computed(() =>
        selectedGroup.value
            ? Boolean(selectedGroup.value.viewerCanAssign)
            : Boolean(groupMeta.viewerCanAssignGroup),
    );
    const canSaveRelations = computed(() =>
        Boolean(selectedGroup.value && selectedGroup.value.viewerCanAssign),
    );
    const groupRelationModel = computed(() => ({
        permissionIds: groupPermissionIds.value,
        menuIds: groupMenuIds.value,
    }));
    const groupRelationRules = computed<FormCreateRule[]>(() => [
        {
            field: "permissionIds",
            title: "分组权限",
            type: "permissionGroupPermissionSelect",
            component: permissionRelationSelectComponent,
            props: {
                options: permissionOptions.value,
                disabled: !canAssignRelations.value,
                selectedGroupId: selectedGroup.value?.id,
                virtualListProps: selectVirtualListProps,
                getGroupName,
            },
            col: { span: 24 },
        },
        {
            field: "menuIds",
            title: "分组菜单",
            type: "permissionGroupMenuSelect",
            component: menuRelationSelectComponent,
            props: {
                options: menuOptions.value,
                disabled: !canAssignRelations.value,
                selectedGroupId: selectedGroup.value?.id,
                virtualListProps: selectVirtualListProps,
                getGroupName,
            },
            col: { span: 24 },
        },
    ]);

    const PermissionRelationSelect = defineComponent({
        name: "PermissionGroupPermissionSelect",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: Array as PropType<number[]>,
                default: () => [],
            },
            options: {
                type: Array as PropType<PermissionOption[]>,
                default: () => [],
            },
            disabled: {
                type: Boolean,
                default: false,
            },
            selectedGroupId: {
                type: Number,
                default: undefined,
            },
            virtualListProps: {
                type: Object as PropType<typeof selectVirtualListProps>,
                default: () => selectVirtualListProps,
            },
            getGroupName: {
                type: Function as PropType<(groupId?: number | null) => string>,
                required: true,
            },
        },
        emits: ["update:modelValue"],
        setup(componentProps, { attrs, emit }) {
            const Select = resolveComponent("a-select");
            const Space = resolveComponent("a-space");
            const Tag = resolveComponent("a-tag");
            const TypographyText = resolveComponent("a-typography-text");

            return () =>
                h(
                    Select,
                    {
                        ...attrs,
                        "triggerProps": {
                            autoFitPopupWidth: false,
                            autoFitPopupMinWidth: true,
                        },
                        "modelValue": componentProps.modelValue,
                        "multiple": true,
                        "allowClear": true,
                        "allowSearch": true,
                        "placeholder": "选择归入当前分组的权限",
                        "disabled": componentProps.disabled,
                        "options": componentProps.options,
                        "virtualListProps": componentProps.virtualListProps,
                        "onUpdate:modelValue": (value: number[]) =>
                            emit("update:modelValue", value),
                    },
                    {
                        option: ({ data }: { data: PermissionOption }) =>
                            h(Space, { size: "mini", wrap: true }, () => [
                                h(TypographyText, { code: true }, () => data.permission.code),
                                h("span", data.permission.name),
                                data.permission.groupId &&
                                data.permission.groupId !== componentProps.selectedGroupId
                                    ? h(Tag, { size: "small", color: "orange" }, () =>
                                          componentProps.getGroupName(data.permission.groupId),
                                      )
                                    : null,
                            ]),
                    },
                );
        },
    });

    const MenuRelationSelect = defineComponent({
        name: "PermissionGroupMenuSelect",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: Array as PropType<number[]>,
                default: () => [],
            },
            options: {
                type: Array as PropType<MenuOption[]>,
                default: () => [],
            },
            disabled: {
                type: Boolean,
                default: false,
            },
            selectedGroupId: {
                type: Number,
                default: undefined,
            },
            virtualListProps: {
                type: Object as PropType<typeof selectVirtualListProps>,
                default: () => selectVirtualListProps,
            },
            getGroupName: {
                type: Function as PropType<(groupId?: number | null) => string>,
                required: true,
            },
        },
        emits: ["update:modelValue"],
        setup(componentProps, { attrs, emit }) {
            const Select = resolveComponent("a-select");
            const Space = resolveComponent("a-space");
            const Tag = resolveComponent("a-tag");
            const TypographyText = resolveComponent("a-typography-text");

            return () =>
                h(
                    Select,
                    {
                        ...attrs,
                        "triggerProps": {
                            autoFitPopupWidth: false,
                            autoFitPopupMinWidth: true,
                        },
                        "modelValue": componentProps.modelValue,
                        "multiple": true,
                        "allowClear": true,
                        "allowSearch": true,
                        "placeholder": "选择归入当前分组的菜单",
                        "disabled": componentProps.disabled,
                        "options": componentProps.options,
                        "virtualListProps": componentProps.virtualListProps,
                        "onUpdate:modelValue": (value: number[]) =>
                            emit("update:modelValue", value),
                    },
                    {
                        option: ({ data }: { data: MenuOption }) =>
                            h(Space, { direction: "vertical", size: "mini", fill: true }, () => [
                                h(Space, { size: "mini", wrap: true }, () => [
                                    h("span", data.menu.title),
                                    h(
                                        TypographyText,
                                        { code: true },
                                        () => data.menu.requiredPermissionCode || "-",
                                    ),
                                    data.menu.groupId &&
                                    data.menu.groupId !== componentProps.selectedGroupId
                                        ? h(Tag, { size: "small", color: "orange" }, () =>
                                              componentProps.getGroupName(data.menu.groupId),
                                          )
                                        : null,
                                ]),
                                data.menu.path ? h(PathSegments, { path: data.menu.path }) : null,
                            ]),
                    },
                );
        },
    });

    const permissionRelationSelectComponent = markRaw(PermissionRelationSelect);
    const menuRelationSelectComponent = markRaw(MenuRelationSelect);

    onMounted(() => {
        void initializePanel();
    });

    async function initializePanel() {
        loading.value = true;
        try {
            await Promise.all([loadGroups(), loadResources()]);
            const firstGroup = groups.value[0];
            if (firstGroup) {
                await selectGroup(firstGroup.id);
            } else {
                openCreateGroup();
            }
        } finally {
            loading.value = false;
        }
    }

    async function loadGroups() {
        const response = await queryRbacPermissionGroupListApi();
        groups.value = response.data.records;
        Object.assign(groupMeta, response.data.meta ?? {});
    }

    async function loadResources() {
        const [permissionResponse, menuResponse] = await Promise.all([
            queryRbacPermissionListApi(),
            queryMenuListApi(),
        ]);
        permissions.value = permissionResponse.data.records;
        menus.value = menuResponse.data.records;
    }

    async function handleGroupSelect(keys: Array<string | number>, data: { node?: TreeNodeData }) {
        const id = keys[0] ? Number(keys[0]) : Number(data.node?.key);
        if (!Number.isInteger(id) || id <= 0) {
            return;
        }
        await selectGroup(id);
    }

    async function selectGroup(id: number) {
        selectedGroupId.value = id;
        const group = groups.value.find((item) => item.id === id);
        if (group) {
            applyGroupForm(group);
        }
        await loadGroupRelations(id);
    }

    async function loadGroupRelations(id: number) {
        relationsLoading.value = true;
        try {
            const response = await getRbacPermissionGroupRelationsApi(id);
            applyGroupForm(response.data.group);
            groupPermissionIds.value = [...response.data.permissionIds];
            groupMenuIds.value = [...response.data.menuIds];
        } finally {
            relationsLoading.value = false;
        }
    }

    function openCreateGroup() {
        selectedGroupId.value = null;
        groupPermissionIds.value = [];
        groupMenuIds.value = [];
        applyGroupForm();
    }

    function applyGroupForm(group?: RbacPermissionGroupDto) {
        groupForm.code = group?.code ?? "";
        groupForm.name = group?.name ?? "";
        groupForm.description = group?.description ?? "";
        groupForm.sort = group?.sort ?? 0;
        groupForm.status = group?.status ?? RbacStatus.ENABLE;
    }

    function syncGroupForm(value: Partial<typeof groupForm>) {
        Object.assign(groupForm, value);
    }

    function syncGroupRelationForm(value: { permissionIds?: number[]; menuIds?: number[] }) {
        groupPermissionIds.value = value.permissionIds ?? [];
        groupMenuIds.value = value.menuIds ?? [];
    }

    function validateGroupForm() {
        if (!groupForm.name.trim()) {
            Message.warning("请输入分组名称");
            return false;
        }
        if (!groupForm.code.trim()) {
            Message.warning("请输入分组编码");
            return false;
        }
        return true;
    }

    async function saveGroup() {
        if (!validateGroupForm()) {
            return;
        }
        savingGroup.value = true;
        try {
            const isCreating = !selectedGroup.value;
            const pendingPermissionIds = [...groupPermissionIds.value];
            const pendingMenuIds = [...groupMenuIds.value];
            const payload = {
                code: groupForm.code.trim(),
                name: groupForm.name.trim(),
                description: groupForm.description,
                sort: groupForm.sort,
                status: groupForm.status,
            };
            const response = selectedGroup.value
                ? await updateRbacPermissionGroupApi(selectedGroup.value.id, payload)
                : await createRbacPermissionGroupApi(payload);
            const nextGroup = response.data as RbacPermissionGroupDto;
            if (isCreating && canAssignRelations.value) {
                await assignRbacPermissionGroupRelationsApi({
                    groupId: nextGroup.id,
                    permissionIds: pendingPermissionIds,
                    menuIds: pendingMenuIds,
                });
            }
            await loadGroups();
            if (isCreating) {
                await loadResources();
            }
            await selectGroup(nextGroup.id);
            Message.success("分组已保存");
            emit("changed");
        } finally {
            savingGroup.value = false;
        }
    }

    async function deleteCurrentGroup() {
        if (!selectedGroup.value) {
            return;
        }
        await deleteRbacPermissionGroupApi(selectedGroup.value.id);
        Message.success("分组已删除");
        await Promise.all([loadGroups(), loadResources()]);
        const firstGroup = groups.value[0];
        if (firstGroup) {
            await selectGroup(firstGroup.id);
        } else {
            openCreateGroup();
        }
        emit("changed");
    }

    async function saveRelations() {
        if (!selectedGroup.value) {
            return;
        }
        savingRelations.value = true;
        try {
            await assignRbacPermissionGroupRelationsApi({
                groupId: selectedGroup.value.id,
                permissionIds: groupPermissionIds.value,
                menuIds: groupMenuIds.value,
            });
            await Promise.all([
                loadGroups(),
                loadResources(),
                loadGroupRelations(selectedGroup.value.id),
            ]);
            Message.success("分组归属已保存");
            emit("changed");
        } finally {
            savingRelations.value = false;
        }
    }

    function getGroupName(groupId?: number | null) {
        if (!groupId) {
            return "未分组";
        }
        const group = groups.value.find((item) => item.id === groupId);
        return group ? group.name : `分组 ${groupId}`;
    }

    function formatPermissionOptionLabel(permission: RbacPermissionDto) {
        return `${permission.name}（${permission.code}）`;
    }

    function formatMenuOptionLabel(menu: RbacMenuDto) {
        return `${menu.title}（${menu.requiredPermissionCode}）`;
    }
</script>

<style scoped>
    .permission-group-board {
        display: grid;
        grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
    }

    .permission-group-board__tree,
    .permission-group-board__detail {
        min-width: 0;
    }

    .permission-group-board__detail :deep(.arco-spin),
    .permission-group-board__detail :deep(.arco-spin-children),
    .permission-group-board__detail :deep(.arco-form) {
        width: 100%;
    }

    .permission-group-search {
        flex: 0 0 auto;
        margin-bottom: 12px;
    }

    .permission-group-tree-spin {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        flex-direction: column;
    }

    .permission-group-tree-spin :deep(.arco-spin-children) {
        display: flex;
        height: 100%;
        min-height: 0;
        min-width: 0;
        flex-direction: column;
    }

    :deep(.permission-group-tree-scrollbar) {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
        min-width: 0;
    }

    :deep(.permission-group-tree-scrollbar .arco-scrollbar-container) {
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow: auto;
    }

    .permission-group-tree-title {
        white-space: nowrap;
    }

    .permission-group-tree-extra {
        white-space: nowrap;
    }

    .permission-group-actions {
        display: flex;
        justify-content: flex-end;
    }

    @media (max-width: 1024px) {
        .permission-group-board {
            grid-template-columns: 1fr;
        }
    }
</style>
