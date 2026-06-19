<template>
    <GiPageLayout
        size="300px"
        min="240px"
        max="460px"
        :left-scrollable="false"
        :content-scrollable="true"
    >
        <template #left>
            <a-space
                align="center"
                class="tw:mb-2"
            >
                <a-typography-text bold>菜单树</a-typography-text>
                <a-button
                    size="small"
                    :loading="menuLoading"
                    @click="loadMenus"
                >
                    <template #icon>
                        <icon-refresh />
                    </template>
                </a-button>
                <a-button
                    v-if="menuMeta.viewerCanCreateMenu"
                    size="small"
                    type="primary"
                    @click="openAddRootMenu"
                >
                    根菜单
                </a-button>
            </a-space>

            <a-scrollbar
                :outer-style="{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }"
                :style="{ height: '100%', overflowX: 'hidden', overflowY: 'auto' }"
                disable-horizontal
            >
                <a-tree
                    v-model:selected-keys="treeSelectedKeys"
                    :data="menuTree"
                    :field-names="menuTreeFieldNames"
                    block-node
                    :animation="true"
                    @select="handleMenuSelect"
                    :show-line="true"
                >
                    <template #title="{ title }">
                        <span>{{ title }}</span>
                    </template>
                    <template #extra="{ type }">
                        <a-tag
                            type="secondary"
                            size="small"
                        >
                            {{ type }}
                        </a-tag>
                    </template>
                </a-tree>
            </a-scrollbar>
        </template>

        <template #header>
            <a-page-header
                title="菜单资源管理"
                subtitle="维护 admin 导航菜单元数据和菜单所需权限"
                :show-back="false"
            >
                <template #extra>
                    <a-space>
                        <a-button
                            v-if="canAddChild"
                            size="small"
                            @click="openAddChildMenu"
                        >
                            <template #icon>
                                <icon-plus />
                            </template>
                            添加子节点
                        </a-button>
                        <a-button
                            v-if="isDetailMode && selectedMenu?.viewerCanUpdate"
                            size="small"
                            type="primary"
                            @click="openEditMenu"
                        >
                            编辑元数据
                        </a-button>
                        <a-popconfirm
                            v-if="isDetailMode && selectedMenu?.viewerCanDelete"
                            content="确定要删除该菜单吗？已被角色引用的菜单会被后端拒绝删除。"
                            @ok="deleteSelectedMenu"
                        >
                            <a-button
                                size="small"
                                status="danger"
                            >
                                删除菜单
                            </a-button>
                        </a-popconfirm>
                        <a-button
                            v-if="isEditingMode"
                            size="small"
                            @click="cancelEditing"
                        >
                            取消
                        </a-button>
                        <a-button
                            v-if="isEditingMode && canSaveMenu"
                            size="small"
                            type="primary"
                            :loading="menuSubmitting"
                            @click="submitMenuForm"
                        >
                            保存
                        </a-button>
                    </a-space>
                </template>
            </a-page-header>
        </template>

        <a-alert
            class="menu-rule-alert"
            type="info"
            show-icon
        >
            菜单只声明“所需权限”；角色授予该权限后，用户才会在导航中看到对应菜单。
        </a-alert>

        <a-tabs v-model:active-key="activeTab">
            <a-tab-pane
                key="metadata"
                title="元数据"
            >
                <a-alert
                    v-if="!selectedMenu && !isEditingMode"
                    type="info"
                    show-icon
                >
                    从左侧选择一个菜单，或点击“根菜单”创建新的目录。
                </a-alert>
                <a-space
                    v-else
                    direction="vertical"
                    fill
                    size="large"
                >
                    <form-create
                        v-model="menuFormData"
                        v-model:api="menuFormApi"
                        :rule="menuFormRules"
                        :option="menuFormOptions"
                    />
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="roles"
                title="可见角色"
                :disabled="!selectedMenu"
            >
                <a-space
                    v-if="selectedMenu"
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-alert
                        type="info"
                        show-icon
                    >
                        这里保存的是角色对“{{
                            selectedMenu.requiredPermissionCode
                        }}”的授权，菜单本身不会授予权限。
                    </a-alert>
                    <a-card :bordered="true">
                        <template #title>
                            <a-space
                                direction="vertical"
                                size="mini"
                            >
                                <span>可见角色</span>
                                <a-typography-text
                                    type="secondary"
                                    code
                                >
                                    requiredPermissionCode:
                                    {{ selectedMenu.requiredPermissionCode }}
                                </a-typography-text>
                            </a-space>
                        </template>
                        <template #extra>
                            <a-button
                                v-if="selectedMenu.viewerCanAssignRole"
                                type="primary"
                                size="small"
                                :loading="roleSaving"
                                @click="saveMenuRoles"
                            >
                                保存可见角色
                            </a-button>
                        </template>
                        <GiTable
                            v-model:selectedKeys="selectedRoleKeys"
                            header-title="可见角色"
                            :columns="menuRoleColumns"
                            row-key="id"
                            :request="getMenuRoleTableData"
                            :pagination="relationTablePagination"
                            :row-selection="roleRowSelection"
                            :search="false"
                            :options="relationTableOptions"
                            :scroll="{ x: '100%', y: '100%', minWidth: 720 }"
                            :scrollbar="true"
                            :bordered="true"
                            :action-ref="setMenuRoleTableAction"
                            @selection-change="reloadMenuRoleTable"
                        >
                            <template #form-search>
                                <form-create
                                    v-model="menuRoleSearchFormData"
                                    :rule="menuRoleSearchRules"
                                    :option="menuRoleSearchFormOptions"
                                />
                            </template>
                            <template #roleEntity="{ record }">
                                <SpiceDBObjectText
                                    type="role"
                                    :id="record.id"
                                    copyable
                                />
                            </template>
                            <template #status="{ record }">
                                <a-tag :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'">
                                    {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                                </a-tag>
                            </template>
                            <template #assigned="{ record }">
                                <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                    {{ record.assigned ? "已授权" : "未授权" }}
                                </a-tag>
                            </template>
                        </GiTable>
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="users"
                title="可见用户"
                :disabled="!selectedMenu"
            >
                <a-card
                    v-if="selectedMenu"
                    title="当前可见用户"
                    :bordered="true"
                >
                    <GiTable
                        header-title="当前可见用户"
                        :columns="menuVisibleUserColumns"
                        row-key="id"
                        :request="getMenuVisibleUserTableData"
                        :pagination="relationTablePagination"
                        :search="false"
                        :options="relationTableOptions"
                        :scroll="{ x: '100%', y: '100%', minWidth: 720 }"
                        :scrollbar="true"
                        :bordered="true"
                        :action-ref="setMenuVisibleUserTableAction"
                    >
                        <template #form-search>
                            <form-create
                                v-model="menuVisibleUserSearchFormData"
                                :rule="menuVisibleUserSearchRules"
                                :option="menuVisibleUserSearchFormOptions"
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
            </a-tab-pane>
        </a-tabs>
    </GiPageLayout>
</template>

<script setup lang="tsx">
    import {
        assignMenuRolesApi,
        createMenu,
        deleteMenu,
        queryAllMenus,
        getMenuRelationRolesApi,
        getMenuRelationsApi,
        getMenuVisibleUsersApi,
        type MenuRelationRoleDto,
        type MenuRelationUserDto,
        type MenuRelationsDto,
        updateMenu,
    } from "@/api/menu";
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import IconSelector from "@/components/IconSelector.vue";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import { clearFormCreateValidate } from "@/utils/apiValidation";
    import { flat2treeByMap } from "@/utils/treeCover";
    import { Message, type TreeNodeData } from "@arco-design/web-vue";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { cloneDeep } from "es-toolkit";
    import {
        computed,
        defineComponent,
        h,
        markRaw,
        nextTick,
        ref,
        resolveComponent,
        shallowRef,
        type PropType,
        type VNode,
        watch,
    } from "vue";

    defineOptions({
        name: "Menu",
    });

    type SelectOption = {
        label: string;
        value: string | number | boolean | null;
    };

    type MenuAssignableRole = MenuRelationRoleDto & {
        assigned: boolean;
    };

    type MenuRecord = {
        id: number;
        pid?: number | null;
        title: string;
        type: MenuType;
        description?: string | null;
        requiredPermissionCode: string;
        path?: string | null;
        componentPath?: string | null;
        componentName?: string | null;
        icon?: string | null;
        iconName?: string | null;
        order?: number | null;
        status?: MenuStatus;
        layout?: MenuLayout;
        pageType?: PageType;
        isResident?: boolean;
        isCache?: boolean;
        isMenuVisible?: boolean;
        isTabVisible?: boolean;
        showChildren?: boolean;
        viewerCanUpdate?: boolean;
        viewerCanDelete?: boolean;
        viewerCanAssignRole?: boolean;
        children?: MenuRecord[];
        [key: string]: any;
    };

    type MenuTreeSwitcherStatus = {
        loading?: boolean;
        expanded?: boolean;
        isLeaf?: boolean;
    };

    type MenuTreeRecord = Omit<MenuRecord, "icon" | "children"> & {
        icon?: () => VNode;
        iconName?: string | null;
        switcherIcon?: (status?: MenuTreeSwitcherStatus) => VNode;
        children?: MenuTreeRecord[];
    };

    type ParentTreeNode = {
        key: number;
        title: string;
        type: MenuType;
        disabled?: boolean;
        children?: ParentTreeNode[];
    };

    enum MenuMode {
        ADD = "ADD",
        DETAIL = "DETAIL",
        EDIT = "EDIT",
    }

    enum MenuType {
        Catalog = "Catalog",
        Page = "Page",
        Button = "Button",
    }

    enum MenuStatus {
        ENABLE = "ENABLE",
        DISABLE = "DISABLE",
    }

    enum MenuLayout {
        LAYOUT_DEFAULT = "LAYOUT_DEFAULT",
        LAYOUT_SIDE = "LAYOUT_SIDE",
        LAYOUT_TOP = "LAYOUT_TOP",
    }

    enum PageType {
        PAGE = "PAGE",
        LINK = "LINK",
        IFRAME = "IFRAME",
    }

    const MenuParentTreeSelect = defineComponent({
        name: "MenuParentTreeSelect",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: [Number, String],
                default: null,
            },
            data: {
                type: Array as PropType<ParentTreeNode[]>,
                default: () => [],
            },
            allowClear: {
                type: Boolean,
                default: true,
            },
            disabled: {
                type: Boolean,
                default: false,
            },
            placeholder: {
                type: String,
                default: "请选择父级节点",
            },
        },
        emits: ["update:modelValue"],
        setup(props, { attrs, emit }) {
            const TreeSelect = resolveComponent("a-tree-select");
            const updateValue = (value: unknown) => {
                if (value === undefined || value === null || value === "") {
                    emit("update:modelValue", null);
                    return;
                }
                emit("update:modelValue", Number(value));
            };

            return () =>
                h(TreeSelect, {
                    ...attrs,
                    "modelValue": props.modelValue ?? undefined,
                    "data": props.data,
                    "fieldNames": {
                        key: "key",
                        title: "title",
                        children: "children",
                    },
                    "allowClear": props.allowClear,
                    "allowSearch": true,
                    "disabled": props.disabled,
                    "placeholder": props.placeholder,
                    "treeProps": {
                        blockNode: true,
                        showLine: true,
                    },
                    "onUpdate:modelValue": updateValue,
                    "onClear": () => updateValue(null),
                });
        },
    });

    const activeTab = ref("metadata");
    const menuFormApi = shallowRef<FormCreateApi | null>(null);
    const menuRoleTableAction = ref<ActionType | null>(null);
    const menuVisibleUserTableAction = ref<ActionType | null>(null);
    const menuMode = ref<MenuMode>(MenuMode.DETAIL);
    const menuSubmitting = ref(false);
    const menuLoading = ref(false);
    const roleSaving = ref(false);
    const relationLoading = ref(false);
    const menuList = ref<MenuRecord[]>([]);
    const menuTree = ref<MenuTreeRecord[]>([]);
    const selectedMenu = ref<MenuRecord | null>(null);
    const menuRelations = ref<MenuRelationsDto | null>(null);
    const menuMeta = ref({
        viewerCanCreateMenu: false,
    });
    const treeSelectedKeys = ref<Array<string | number>>([]);
    const selectedRoleKeys = ref<number[]>([]);
    const menuRoleSearchFormData = ref({
        keyword: "",
        status: undefined as string | undefined,
    });
    const menuVisibleUserSearchFormData = ref({
        keyword: "",
        banned: undefined as boolean | undefined,
    });

    const relationTablePagination = {
        defaultCurrent: 1,
        defaultPageSize: 10,
        current: 1,
        pageSize: 10,
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

    const menuTreeNodeIconSize = "1em";

    const roleRowSelection = {
        type: "checkbox",
        showCheckedAll: true,
    } as const;

    const menuTreeFieldNames = {
        key: "id",
        title: "title",
        children: "children",
    };

    const menuFormData = ref<Record<string, any>>({});
    const menuIconSelectorComponent = markRaw(IconSelector);
    const menuParentTreeSelectComponent = markRaw(MenuParentTreeSelect);

    const menuRoleSearchRules: FormCreateRule[] = [
        {
            field: "keyword",
            title: "角色",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "搜索 ID / 名称 / 编码 / 描述",
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

    const menuVisibleUserSearchRules: FormCreateRule[] = [
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

    const menuRoleColumns: ProColumns[] = [
        {
            title: "角色 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "roleEntity",
            width: 120,
            fixed: "left",
            hideInSearch: true,
        },
        {
            title: "角色名称",
            dataIndex: "name",
            valueType: "text",
            width: 180,
            hideInSearch: true,
        },
        {
            title: "角色编码",
            dataIndex: "code",
            valueType: "text",
            width: 180,
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
            title: "授权状态",
            dataIndex: "assigned",
            valueType: "text",
            slotName: "assigned",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
        {
            title: "描述",
            dataIndex: "description",
            valueType: "text",
            hideInSearch: true,
        },
    ];

    const menuVisibleUserColumns: ProColumns[] = [
        {
            title: "用户 Resource",
            dataIndex: "id",
            valueType: "text",
            slotName: "userEntity",
            width: 220,
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
            width: 160,
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
            title: "账号状态",
            dataIndex: "banned",
            valueType: "text",
            slotName: "banned",
            width: 100,
            align: "center",
            hideInSearch: true,
        },
    ];

    const isDetailMode = computed(() => menuMode.value === MenuMode.DETAIL);
    const isEditingMode = computed(
        () => menuMode.value === MenuMode.ADD || menuMode.value === MenuMode.EDIT,
    );
    const canAddChild = computed(
        () =>
            menuMeta.value.viewerCanCreateMenu &&
            isDetailMode.value &&
            selectedMenu.value &&
            selectedMenu.value.type !== MenuType.Button,
    );
    const canSaveMenu = computed(
        () =>
            (menuMode.value === MenuMode.ADD && menuMeta.value.viewerCanCreateMenu) ||
            (menuMode.value === MenuMode.EDIT && selectedMenu.value?.viewerCanUpdate === true),
    );

    const editorTitle = computed(() => {
        if (menuMode.value === MenuMode.ADD) {
            return "新增菜单 Resource";
        }
        if (menuMode.value === MenuMode.EDIT) {
            return `编辑 ${selectedMenu.value?.title ?? "菜单"}`;
        }
        return selectedMenu.value ? selectedMenu.value.title : "菜单 Resource 详情";
    });

    const editorSubtitle = computed(() => {
        if (menuMode.value === MenuMode.ADD) {
            return "创建后写入 rbac_menu，并确保所需权限存在";
        }
        if (menuMode.value === MenuMode.EDIT) {
            return "这里只编辑菜单元数据和所需权限；角色授权可在 RBAC 角色页维护";
        }
        return selectedMenu.value ? "查看菜单元数据、可见角色和命中用户" : "请选择菜单";
    });

    const menuFormOptions = computed<FormCreateOptions>(() => ({
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
        submitBtn: false,
        resetBtn: false,
    }));

    const menuRoleSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshMenuRoleTable, resetMenuRoleSearch),
    );
    const menuVisibleUserSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(refreshMenuVisibleUserTable, resetMenuVisibleUserSearch),
    );

    const menuFormRules = computed<FormCreateRule[]>(() => {
        const mode = menuMode.value;
        const disabled = mode === MenuMode.DETAIL;
        const type = menuFormData.value.type as MenuType | undefined;
        const rules: FormCreateRule[] = [];

        if (mode !== MenuMode.ADD) {
            rules.push(createInputRule("id", "菜单 ID", "menu:<id>", true));
        }

        rules.push(
            createSelectRule(
                "type",
                "节点类型",
                resolveTypeOptions(),
                disabled || mode === MenuMode.EDIT,
            ),
        );

        if (shouldShowParentField(type)) {
            rules.push(
                createParentTreeSelectRule(
                    "pid",
                    "父级节点",
                    resolveParentTreeData(type),
                    disabled,
                    type === MenuType.Page || type === MenuType.Button,
                ),
            );
        }

        if (!type) {
            return rules;
        }

        rules.push(
            createInputRule("title", "节点名称", "请输入节点名称", disabled, true),
            createTextareaRule("description", "节点描述", "请输入节点描述", disabled),
            createInputRule(
                "requiredPermissionCode",
                "所需权限",
                "例如 system.menu.view",
                disabled,
                true,
            ),
        );

        if (type === MenuType.Catalog || type === MenuType.Page) {
            rules.push(createInputRule("path", "路由路径", "请输入路由路径", disabled));
        }

        if (type === MenuType.Page) {
            rules.push(
                createInputRule("componentPath", "组件路径", "请输入组件路径", disabled, true),
                createInputRule("componentName", "组件名称", "请输入组件名称", disabled, true),
                createSelectRule("layout", "布局", resolveLayoutOptions(), disabled, true),
                createSelectRule("pageType", "页面类型", resolvePageTypeOptions(), disabled, true),
                createSwitchRule("isResident", "常驻标签", disabled),
                createSwitchRule("isCache", "页面缓存", disabled),
                createSwitchRule("isTabVisible", "标签可见", disabled),
            );
        }

        if (type === MenuType.Catalog) {
            rules.push(createSwitchRule("showChildren", "显示子节点", disabled));
        }

        rules.push(
            createIconSelectorRule("icon", "图标名称", disabled),
            createNumberRule("order", "排序", disabled),
        );

        if (type === MenuType.Catalog || type === MenuType.Page) {
            rules.push(createSwitchRule("isMenuVisible", "菜单可见", disabled));
        }

        rules.push(createStatusRule(disabled));

        return rules;
    });

    /**
     * 创建文本输入 FormCreate 规则。
     */
    function createInputRule(
        field: string,
        title: string,
        placeholder: string,
        disabled: boolean,
        required = false,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "input",
            props: {
                allowClear: true,
                placeholder,
                disabled,
            },
            validate: required
                ? [{ required: true, message: `请输入${title}`, trigger: "change" }]
                : [],
            col: { span: 12 },
        };
    }

    /**
     * 创建多行文本 FormCreate 规则。
     */
    function createTextareaRule(
        field: string,
        title: string,
        placeholder: string,
        disabled: boolean,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "textarea",
            props: {
                allowClear: true,
                autoSize: { minRows: 3, maxRows: 5 },
                placeholder,
                disabled,
            },
            col: { span: 24 },
        };
    }

    /**
     * 创建选择器 FormCreate 规则。
     */
    function createSelectRule(
        field: string,
        title: string,
        options: SelectOption[],
        disabled: boolean,
        required = false,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "select",
            props: {
                allowClear: !required,
                placeholder: `请选择${title}`,
                disabled,
                options,
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
            },
            validate: required
                ? [{ required: true, message: `请选择${title}`, trigger: "change" }]
                : [],
            col: { span: 12 },
        };
    }

    /**
     * 创建父级节点树选择规则，保留菜单树层级并禁用不可作为父级的节点。
     */
    function createParentTreeSelectRule(
        field: string,
        title: string,
        data: ParentTreeNode[],
        disabled: boolean,
        required = false,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "menuParentTreeSelect",
            component: menuParentTreeSelectComponent,
            props: {
                allowClear: !required,
                placeholder: required ? `请选择${title}` : "不选择则作为根节点",
                disabled,
                data,
            },
            validate: required
                ? [{ required: true, message: `请选择${title}`, trigger: "change" }]
                : [],
            col: { span: 12 },
        };
    }

    /**
     * 创建数字输入 FormCreate 规则。
     */
    function createNumberRule(field: string, title: string, disabled: boolean): FormCreateRule {
        return {
            field,
            title,
            type: "inputNumber",
            props: {
                disabled,
                precision: 0,
                placeholder: `请输入${title}`,
                class: "tw:w-full",
            },
            col: { span: 12 },
        };
    }

    /**
     * 创建图标选择器 FormCreate 规则，使用 IconSelector 直接回写菜单 icon 字段。
     */
    function createIconSelectorRule(
        field: string,
        title: string,
        disabled: boolean,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "iconSelector",
            component: menuIconSelectorComponent,
            props: {
                allowClear: true,
                disabled,
            },
            col: { span: 12 },
        };
    }

    /**
     * 创建布尔开关 FormCreate 规则。
     */
    function createSwitchRule(field: string, title: string, disabled: boolean): FormCreateRule {
        return {
            field,
            title,
            type: "switch",
            props: {
                disabled,
                checkedValue: true,
                uncheckedValue: false,
                checkedText: "是",
                uncheckedText: "否",
            },
            col: { span: 12 },
        };
    }

    /**
     * 创建菜单状态 FormCreate 规则。
     */
    function createStatusRule(disabled: boolean): FormCreateRule {
        return {
            field: "status",
            title: "状态",
            type: "switch",
            props: {
                disabled,
                checkedValue: MenuStatus.ENABLE,
                uncheckedValue: MenuStatus.DISABLE,
                checkedText: "启用",
                uncheckedText: "禁用",
            },
            col: { span: 12 },
        };
    }

    /**
     * 判断当前类型是否需要展示父级节点字段。
     */
    function shouldShowParentField(type?: MenuType) {
        return type === MenuType.Catalog || type === MenuType.Page || type === MenuType.Button;
    }

    /**
     * 根据当前编辑上下文生成允许选择的菜单类型。
     */
    function resolveTypeOptions(): SelectOption[] {
        if (menuMode.value !== MenuMode.ADD) {
            return [
                { label: "目录", value: MenuType.Catalog },
                { label: "页面", value: MenuType.Page },
                { label: "按钮", value: MenuType.Button },
            ];
        }

        if (!selectedMenu.value) {
            return [{ label: "目录", value: MenuType.Catalog }];
        }

        if (selectedMenu.value.type === MenuType.Catalog) {
            return [
                { label: "目录", value: MenuType.Catalog },
                { label: "页面", value: MenuType.Page },
            ];
        }

        if (selectedMenu.value.type === MenuType.Page) {
            return [{ label: "按钮", value: MenuType.Button }];
        }

        return [];
    }

    /**
     * 根据菜单类型生成合法父级节点类型。
     */
    function resolveParentTypes(type?: MenuType): MenuType[] {
        if (!type) {
            return [];
        }
        if (type === MenuType.Button) {
            return [MenuType.Page];
        }
        return [MenuType.Catalog];
    }

    /**
     * 当前编辑菜单及其后代不能作为自己的父级。
     */
    function resolveExcludedParentIds() {
        const selectedId = menuMode.value === MenuMode.EDIT ? selectedMenu.value?.id : undefined;
        if (!selectedId) {
            return new Set<number>();
        }

        const childrenByPid = new Map<number | null, MenuRecord[]>();
        for (const menu of menuList.value) {
            const children = childrenByPid.get(menu.pid ?? null) ?? [];
            children.push(menu);
            childrenByPid.set(menu.pid ?? null, children);
        }

        const excludedIds = new Set<number>([selectedId]);
        const stack = [...(childrenByPid.get(selectedId) ?? [])];
        while (stack.length > 0) {
            const current = stack.pop()!;
            excludedIds.add(current.id);
            stack.push(...(childrenByPid.get(current.id) ?? []));
        }
        return excludedIds;
    }

    /**
     * 根据菜单类型生成合法父级节点树。
     */
    function resolveParentTreeData(type?: MenuType): ParentTreeNode[] {
        const parentTypes =
            type === MenuType.Button ? [MenuType.Catalog, MenuType.Page] : [MenuType.Catalog];
        const selectableParentTypes = resolveParentTypes(type);
        const excludedIds = resolveExcludedParentIds();
        const childrenByPid = new Map<number | null, MenuRecord[]>();
        for (const menu of menuList.value) {
            if (!parentTypes.includes(menu.type)) {
                continue;
            }

            const children = childrenByPid.get(menu.pid ?? null) ?? [];
            children.push(menu);
            childrenByPid.set(menu.pid ?? null, children);
        }

        const buildNodes = (pid: number | null): ParentTreeNode[] => {
            const nodes: ParentTreeNode[] = [];
            const menus = [...(childrenByPid.get(pid) ?? [])].sort(
                (left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id - right.id,
            );
            for (const menu of menus) {
                const children = buildNodes(menu.id);
                const canSelect =
                    selectableParentTypes.includes(menu.type) && !excludedIds.has(menu.id);
                if (!canSelect && children.length === 0) {
                    continue;
                }

                nodes.push({
                    key: menu.id,
                    title: `${menu.title}（menu:${menu.id}）`,
                    type: menu.type,
                    disabled: !canSelect,
                    children,
                });
            }
            return nodes;
        };

        return buildNodes(null);
    }

    /**
     * 返回后台布局枚举选项。
     */
    function resolveLayoutOptions(): SelectOption[] {
        return [
            { label: "侧边布局", value: MenuLayout.LAYOUT_SIDE },
            { label: "顶部布局", value: MenuLayout.LAYOUT_TOP },
            { label: "默认布局", value: MenuLayout.LAYOUT_DEFAULT },
        ];
    }

    /**
     * 返回页面类型枚举选项。
     */
    function resolvePageTypeOptions(): SelectOption[] {
        return [
            { label: "内部页面", value: PageType.PAGE },
            { label: "外链", value: PageType.LINK },
            { label: "IFrame", value: PageType.IFRAME },
        ];
    }

    /**
     * 保存菜单角色 GiTable action 实例。
     */
    function setMenuRoleTableAction(action: ActionType) {
        menuRoleTableAction.value = action;
    }

    /**
     * 保存菜单可见用户表格 action 实例。
     */
    function setMenuVisibleUserTableAction(action: ActionType) {
        menuVisibleUserTableAction.value = action;
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
     * 为当前授权角色 GiTable 提供后端分页关系数据。
     */
    async function getMenuRoleTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<MenuAssignableRole>> {
        if (!selectedMenu.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getMenuRelationRolesApi({
            menuId: selectedMenu.value.id,
            ...menuRoleSearchFormData.value,
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
     * 为菜单可见用户 GiTable 提供后端分页关系数据。
     */
    async function getMenuVisibleUserTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<MenuRelationUserDto>> {
        if (!selectedMenu.value) {
            return { data: [], success: true, total: 0 };
        }
        const response = await getMenuVisibleUsersApi({
            menuId: selectedMenu.value.id,
            ...menuVisibleUserSearchFormData.value,
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
     * 刷新当前授权角色表格并回到第一页。
     */
    function refreshMenuRoleTable() {
        menuRoleTableAction.value?.setPageInfo?.({ current: 1 });
        void menuRoleTableAction.value?.reload();
    }

    /**
     * 仅重载菜单授权角色表格当前页，供勾选后刷新筛选命中状态。
     */
    function reloadMenuRoleTable() {
        void nextTick(() => menuRoleTableAction.value?.reload());
    }

    /**
     * 刷新菜单可见用户表格并回到第一页。
     */
    function refreshMenuVisibleUserTable() {
        menuVisibleUserTableAction.value?.setPageInfo?.({ current: 1 });
        void menuVisibleUserTableAction.value?.reload();
    }

    /**
     * 重置当前授权角色表格筛选条件。
     */
    function resetMenuRoleSearch() {
        menuRoleSearchFormData.value = {
            keyword: "",
            status: undefined,
        };
        refreshMenuRoleTable();
    }

    /**
     * 重置菜单可见用户表格筛选条件。
     */
    function resetMenuVisibleUserSearch() {
        menuVisibleUserSearchFormData.value = {
            keyword: "",
            banned: undefined,
        };
        refreshMenuVisibleUserTable();
    }

    /**
     * 加载菜单元数据，并重建左侧树。
     */
    async function loadMenus() {
        if (menuLoading.value) {
            return;
        }

        menuLoading.value = true;
        try {
            const response = await queryAllMenus({});
            menuMeta.value = response.data.meta ?? {
                viewerCanCreateMenu: false,
            };
            menuList.value = response.data.records;
            menuTree.value = attachMenuTreeNodeIcons(
                flat2treeByMap(response.data.records, {
                    fieldsPath: "order",
                    sequential: true,
                }),
            );
        } finally {
            menuLoading.value = false;
        }
    }

    /**
     * 将后端图标名转换成 Arco Tree 节点自己的业务图标。
     * 叶子节点额外覆盖空 switcherIcon，避免 show-line 默认文件图标和业务图标重复。
     */
    function attachMenuTreeNodeIcons(tree: MenuRecord[]): MenuTreeRecord[] {
        return tree.map((node) => {
            const iconName = resolveMenuIconName(node);
            const { icon: _rawIcon, children: rawChildren, ...nodeData } = node;
            const hasChildren = Array.isArray(rawChildren) && rawChildren.length > 0;
            const nextNode = {
                ...nodeData,
                iconName,
            } as MenuTreeRecord;

            if (iconName) {
                nextNode.icon = () =>
                    h(DynamicIcon, { icon: iconName, size: menuTreeNodeIconSize });
            } else {
                delete nextNode.icon;
            }

            if (!hasChildren) {
                nextNode.switcherIcon = renderLeafSwitcherPlaceholder;
            } else {
                delete nextNode.switcherIcon;
            }

            if (Array.isArray(rawChildren)) {
                nextNode.children = attachMenuTreeNodeIcons(rawChildren);
            }

            return nextNode;
        });
    }

    function renderLeafSwitcherPlaceholder() {
        return h("span", { "aria-hidden": "true" });
    }

    /**
     * 处理菜单树选择，并进入详情模式。
     */
    async function handleMenuSelect(
        selectedKeys: Array<string | number>,
        data: { selected?: boolean; selectedNodes: TreeNodeData[]; node?: TreeNodeData },
    ) {
        treeSelectedKeys.value = selectedKeys;
        if (!data.node) {
            return;
        }

        selectedMenu.value = restoreMenuIconField(data.node as MenuRecord);
        menuMode.value = MenuMode.DETAIL;
        activeTab.value = "metadata";
        menuFormData.value = cloneDeep(selectedMenu.value);
        await loadMenuRelations(selectedMenu.value.id);
    }

    /**
     * 将树节点用于渲染的 icon 函数还原为表单和后端 DTO 使用的图标名。
     */
    function restoreMenuIconField(menu: MenuRecord): MenuRecord {
        const restoredMenu = cloneDeep(menu);
        restoredMenu.icon = resolveMenuIconName(menu);
        delete restoredMenu.iconName;
        return restoredMenu;
    }

    /**
     * 菜单图标只接受非空字符串；Tree 节点里的 icon 函数不能进入表单 payload。
     */
    function resolveMenuIconName(menu: { icon?: unknown; iconName?: unknown }) {
        return normalizeMenuIconName(menu.iconName) ?? normalizeMenuIconName(menu.icon);
    }

    function normalizeMenuIconName(value: unknown) {
        if (typeof value !== "string") {
            return null;
        }
        const iconName = value.trim();
        return iconName.length > 0 ? iconName : null;
    }

    /**
     * 打开新增根菜单模式。
     */
    function openAddRootMenu() {
        selectedMenu.value = null;
        menuRelations.value = null;
        treeSelectedKeys.value = [];
        menuMode.value = MenuMode.ADD;
        activeTab.value = "metadata";
        menuFormData.value = createDefaultMenuForm(MenuType.Catalog, null);
        void nextTick(() => clearFormCreateValidate(menuFormApi.value));
    }

    /**
     * 打开新增子菜单模式。
     */
    function openAddChildMenu() {
        if (!selectedMenu.value) {
            return;
        }

        const childType =
            selectedMenu.value.type === MenuType.Page ? MenuType.Button : MenuType.Catalog;
        menuMode.value = MenuMode.ADD;
        activeTab.value = "metadata";
        menuFormData.value = createDefaultMenuForm(childType, selectedMenu.value.id);
        void nextTick(() => clearFormCreateValidate(menuFormApi.value));
    }

    /**
     * 打开当前菜单编辑模式。
     */
    function openEditMenu() {
        if (!selectedMenu.value) {
            return;
        }

        menuMode.value = MenuMode.EDIT;
        activeTab.value = "metadata";
        menuFormData.value = cloneDeep(selectedMenu.value);
        void nextTick(() => clearFormCreateValidate(menuFormApi.value));
    }

    /**
     * 取消新增或编辑，回到当前菜单详情。
     */
    function cancelEditing() {
        if (selectedMenu.value) {
            menuMode.value = MenuMode.DETAIL;
            menuFormData.value = cloneDeep(selectedMenu.value);
            return;
        }

        menuMode.value = MenuMode.DETAIL;
        menuFormData.value = {};
    }

    /**
     * 根据类型创建新增菜单默认表单值。
     */
    function createDefaultMenuForm(type: MenuType, pid: number | null) {
        const base = {
            type,
            pid,
            title: "",
            description: null,
            requiredPermissionCode: "",
            icon: "",
            order: 0,
            status: MenuStatus.ENABLE,
        };

        if (type === MenuType.Catalog) {
            return {
                ...base,
                path: "",
                isMenuVisible: true,
                showChildren: true,
            };
        }

        if (type === MenuType.Page) {
            return {
                ...base,
                path: "",
                componentPath: "",
                componentName: "",
                layout: MenuLayout.LAYOUT_SIDE,
                pageType: PageType.PAGE,
                isResident: false,
                isCache: true,
                isMenuVisible: true,
                isTabVisible: true,
            };
        }

        return base;
    }

    /**
     * 新增模式下切换类型时补齐该类型需要的显式默认字段。
     */
    function syncAddMenuTypeDefaults(nextType?: MenuType) {
        if (menuMode.value !== MenuMode.ADD || !nextType) {
            return;
        }

        const pid = selectedMenu.value?.id ?? null;
        menuFormData.value = {
            ...createDefaultMenuForm(nextType, pid),
            ...menuFormData.value,
            type: nextType,
            pid,
        };
    }

    /**
     * 在提交前按菜单类型裁剪并整理后端 DTO 字段。
     */
    function buildMenuPayload() {
        const data = cloneDeep(menuFormData.value);
        const type = data.type as MenuType;
        const base = {
            ...(menuMode.value === MenuMode.EDIT ? { id: Number(data.id) } : {}),
            type,
            pid: data.pid === undefined ? null : data.pid,
            title: data.title,
            description: normalizeNullableText(data.description),
            requiredPermissionCode: data.requiredPermissionCode,
            icon: normalizeNullableText(data.icon),
            order: data.order === undefined || data.order === null ? undefined : Number(data.order),
            status: data.status,
        };

        if (type === MenuType.Catalog) {
            return {
                ...base,
                path: normalizeNullableText(data.path),
                isMenuVisible: Boolean(data.isMenuVisible),
                showChildren: Boolean(data.showChildren),
            };
        }

        if (type === MenuType.Page) {
            return {
                ...base,
                pid: Number(data.pid),
                path: normalizeNullableText(data.path),
                componentPath: data.componentPath,
                componentName: data.componentName,
                layout: data.layout,
                pageType: data.pageType,
                isResident: Boolean(data.isResident),
                isCache: Boolean(data.isCache),
                isMenuVisible: Boolean(data.isMenuVisible),
                isTabVisible: Boolean(data.isTabVisible),
            };
        }

        return {
            ...base,
            pid: Number(data.pid),
        };
    }

    /**
     * 把空字符串整理为 null，匹配菜单 DTO 中的 nullable 字段。
     */
    function normalizeNullableText(value: unknown) {
        if (value === "") {
            return null;
        }
        return value ?? null;
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
     * 提交菜单新增或编辑表单。
     */
    async function submitMenuForm() {
        if (!menuFormApi.value) {
            Message.error("表单尚未初始化完成");
            return;
        }

        try {
            await menuFormApi.value.validate();
            menuSubmitting.value = true;
            const payload = buildMenuPayload();
            const response =
                menuMode.value === MenuMode.ADD
                    ? await createMenu(payload)
                    : await updateMenu(payload as any);
            Message.success("菜单已保存");
            await loadMenus();
            const savedMenu = response.data as MenuRecord;
            selectedMenu.value = savedMenu;
            treeSelectedKeys.value = [savedMenu.id];
            menuFormData.value = cloneDeep(savedMenu);
            menuMode.value = MenuMode.DETAIL;
            await loadMenuRelations(savedMenu.id);
        } finally {
            menuSubmitting.value = false;
        }
    }

    /**
     * 删除当前选中的菜单并刷新树。
     */
    async function deleteSelectedMenu() {
        if (!selectedMenu.value) {
            return;
        }

        await deleteMenu(selectedMenu.value.id);
        Message.success("菜单已删除");
        selectedMenu.value = null;
        menuRelations.value = null;
        menuFormData.value = {};
        treeSelectedKeys.value = [];
        await loadMenus();
    }

    /**
     * 加载当前菜单的 RBAC 关系视图。
     */
    async function loadMenuRelations(menuId: number) {
        relationLoading.value = true;
        try {
            const response = await getMenuRelationsApi(menuId);
            menuRelations.value = response.data;
            selectedMenu.value = restoreMenuIconField({
                ...(selectedMenu.value ?? {}),
                ...response.data.menu,
            } as MenuRecord);
            menuFormData.value = cloneDeep(selectedMenu.value);
            selectedRoleKeys.value = normalizeNumberIds(response.data.roleIds);
            await Promise.all([
                menuRoleTableAction.value?.reload(),
                menuVisibleUserTableAction.value?.reload(),
            ]);
        } finally {
            relationLoading.value = false;
        }
    }

    /**
     * 保存当前菜单可见角色集合。
     */
    async function saveMenuRoles() {
        if (!selectedMenu.value) {
            return;
        }

        roleSaving.value = true;
        try {
            await assignMenuRolesApi({
                menuId: selectedMenu.value.id,
                roleIds: normalizeNumberIds(selectedRoleKeys.value),
            });
            Message.success("可见角色已更新");
            await loadMenuRelations(selectedMenu.value.id);
        } finally {
            roleSaving.value = false;
        }
    }

    /**
     * 初始化菜单资源页面依赖数据。
     */
    async function initPage() {
        await loadMenus();
    }

    watch(
        () => menuFormData.value.type as MenuType | undefined,
        (nextType) => syncAddMenuTypeDefaults(nextType),
    );

    void initPage();
</script>

<style scoped>
    .menu-rule-alert {
        margin-bottom: 12px;
    }
</style>
