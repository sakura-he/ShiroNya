<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="databaseMenuModalVisible"
            :title="databaseMenuModalTitle"
            :confirm-loading="databaseMenuSubmitting"
            width="860px"
            unmount-on-close
            @before-ok="submitDatabaseMenu"
        >
            <MenuMetadataForm
                :form="databaseMenuForm"
                :disabled="false"
                :is-add-mode="!databaseEditingMenu"
                :is-parent-required="isDatabaseParentRequired"
                :menu-type-options="databaseMenuTypeOptions"
                :parent-menu-tree="databaseParentMenuTree"
                :permission-group-options="permissionGroupOptions"
                :permission-tree-data="permissionTreeData"
                :menu-id="databaseEditingMenu?.id"
                :show-menu-id="Boolean(databaseEditingMenu)"
            />
        </a-modal>

        <template #header>
            <a-page-header :show-back="false">
                <template #title>菜单</template>
                <template #subtitle>维护 rbac_menu 元数据、菜单所需权限和扁平数据库视图</template>
            </a-page-header>
        </template>

        <a-alert
            class="rbac-menu-rule-alert"
            type="info"
            show-icon
        >
            菜单只声明“所需权限”，角色在角色页授予权限；导航由用户 effective
            权限和菜单所需权限匹配生成。
        </a-alert>

        <a-tabs
            v-model:active-key="activeView"
            class="rbac-menu-binding-tabs"
        >
            <a-tab-pane
                key="menu"
                title="菜单视角"
            >
                <div class="rbac-menu-board">
                    <a-card
                        :bordered="true"
                        class="rbac-menu-board__tree"
                        :body-style="menuTreeCardBodyStyle"
                    >
                        <template #title>菜单树</template>
                        <template #extra>
                            <a-space>
                                <a-button
                                    type="text"
                                    size="mini"
                                    :loading="treeLoading"
                                    @click="loadMenus"
                                >
                                    <template #icon>
                                        <icon-refresh />
                                    </template>
                                </a-button>
                                <a-button
                                    v-if="meta.viewerCanCreateMenu"
                                    size="mini"
                                    type="primary"
                                    @click="openCreateRoot"
                                >
                                    根菜单
                                </a-button>
                            </a-space>
                        </template>

                        <a-spin
                            :loading="treeLoading"
                            class="rbac-menu-tree-spin"
                        >
                            <a-scrollbar
                                outer-class="rbac-menu-tree-scrollbar"
                                :outer-style="treeScrollbarOuterStyle"
                                :style="treeScrollbarStyle"
                            >
                                <a-tree
                                    v-model:selected-keys="treeSelectedKeys"
                                    :data="menuTree"
                                    :field-names="menuTreeFieldNames"
                                    block-node
                                    :animation="true"
                                    :show-line="true"
                                    @select="handleMenuSelect"
                                >
                                    <template #title="{ title }">
                                        <span>{{ title }}</span>
                                    </template>
                                    <template #extra="{ type }">
                                        <a-tag
                                            type="secondary"
                                            size="small"
                                            :color="getMenuTypeColor(type)"
                                        >
                                            {{ formatMenuType(type) }}
                                        </a-tag>
                                    </template>
                                </a-tree>
                            </a-scrollbar>
                        </a-spin>
                    </a-card>

                    <a-card
                        :bordered="true"
                        class="rbac-menu-board__detail"
                    >
                        <template #title>
                            <a-space
                                :size="8"
                                align="center"
                            >
                                <a-tag
                                    v-if="selectedMenu && isDetailMode"
                                    :color="getMenuTypeColor(selectedMenu.type)"
                                >
                                    {{ formatMenuType(selectedMenu.type) }}
                                </a-tag>
                                <span>{{ editorTitle }}</span>
                            </a-space>
                        </template>
                        <template #extra>
                            <a-space>
                                <a-button
                                    v-if="canAddChild"
                                    size="small"
                                    @click="openCreateChild"
                                >
                                    <template #icon>
                                        <icon-plus />
                                    </template>
                                    添加子节点
                                </a-button>
                                <a-button
                                    v-if="isDetailMode && selectedMenuCanUpdate"
                                    size="small"
                                    type="primary"
                                    @click="openEditMenu"
                                >
                                    编辑元数据
                                </a-button>
                                <a-popconfirm
                                    v-if="isDetailMode && selectedMenuCanDelete"
                                    content="确定删除该菜单吗？可见菜单读模型会一起清理。"
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
                                    @click="submitMenu"
                                >
                                    保存
                                </a-button>
                            </a-space>
                        </template>

                        <a-typography-text
                            type="secondary"
                            class="rbac-menu-editor-subtitle"
                        >
                            {{ editorSubtitle }}
                        </a-typography-text>

                        <a-alert
                            v-if="!selectedMenu && !isEditingMode"
                            type="info"
                            show-icon
                        >
                            从左侧选择一个菜单，或点击“根菜单”创建新的目录。
                        </a-alert>

                        <a-spin
                            v-else
                            :loading="detailLoading"
                            class="tw:w-full"
                        >
                            <a-space
                                direction="vertical"
                                fill
                                size="large"
                            >
                                <MenuMetadataForm
                                    :key="menuFormRenderKey"
                                    :form="menuForm"
                                    :disabled="isDetailMode"
                                    :is-add-mode="isAddMode"
                                    :is-parent-required="isParentRequired"
                                    :menu-type-options="menuTypeOptions"
                                    :parent-menu-tree="parentMenuTree"
                                    :permission-group-options="permissionGroupOptions"
                                    :permission-tree-data="permissionTreeData"
                                    :menu-id="selectedMenu?.id"
                                    :show-menu-id="Boolean(selectedMenu && !isAddMode)"
                                />
                            </a-space>
                        </a-spin>
                    </a-card>
                </div>
            </a-tab-pane>

            <a-tab-pane
                key="database"
                title="数据库视角"
            >
                <a-card
                    :bordered="true"
                    class="rbac-menu-database-card"
                >
                    <GiTable
                        row-key="id"
                        header-title="数据库菜单"
                        :columns="menuColumns"
                        :request="requestFlatMenus"
                        :pagination="relationPagination"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', y: '100%', minWidth: 1120 }"
                        :action-ref="setFlatMenuAction"
                        bordered
                    >
                        <template #custom-extra>
                            <a-button
                                v-if="meta.viewerCanCreateMenu"
                                type="primary"
                                size="small"
                                @click="openDatabaseCreateRoot"
                            >
                                <template #icon>
                                    <icon-plus />
                                </template>
                                新增根菜单
                            </a-button>
                        </template>
                        <template #form-search>
                            <form-create
                                :model-value="databaseFilters"
                                :rule="databaseSearchRules"
                                :option="databaseSearchOptions"
                                @update:model-value="syncDatabaseFilters"
                            />
                        </template>
                        <template #type="{ record }">
                            <a-tag :color="getMenuTypeColor(record.type)">
                                {{ formatMenuType(record.type) }}
                            </a-tag>
                        </template>
                        <template #group="{ record }">
                            <a-tag :color="record.groupId ? 'arcoblue' : 'gray'">
                                {{ getPermissionGroupName(record.groupId) }}
                            </a-tag>
                        </template>
                        <template #requiredPermissionCode="{ record }">
                            <a-typography-text code>
                                {{ record.requiredPermissionCode || "-" }}
                            </a-typography-text>
                        </template>
                        <template #path="{ record }">
                            <PathSegments :path="record.path" />
                        </template>
                        <template #status="{ record }">
                            <a-tag :color="record.status === 'ENABLE' ? 'arcoblue' : 'red'">
                                {{ record.status === "ENABLE" ? "启用" : "禁用" }}
                            </a-tag>
                        </template>
                        <template #action="{ record }">
                            <a-space
                                size="mini"
                                wrap
                            >
                                <a-link @click="openDatabaseRecord(record, false)">查看</a-link>
                                <a-link
                                    v-if="
                                        meta.viewerCanCreateMenu &&
                                        record.type !== RbacMenuType.Button
                                    "
                                    @click="openDatabaseCreateChild(record)"
                                >
                                    新增子菜单
                                </a-link>
                                <a-link
                                    v-if="record.viewerCanUpdate ?? meta.viewerCanUpdateMenu"
                                    @click="openDatabaseRecord(record, true)"
                                >
                                    编辑
                                </a-link>
                                <a-popconfirm
                                    v-if="record.viewerCanDelete ?? meta.viewerCanDeleteMenu"
                                    content="确定删除该菜单吗？"
                                    @ok="deleteMenuRecord(record)"
                                >
                                    <a-link status="danger">删除</a-link>
                                </a-popconfirm>
                            </a-space>
                        </template>
                    </GiTable>
                </a-card>
            </a-tab-pane>
        </a-tabs>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        RbacMenuLayoutType,
        RbacMenuType,
        RbacPageType,
        RbacStatus,
        type RbacMenuDto,
        type RbacPermissionDto,
        type RbacPermissionGroupDto,
    } from "@/api/rbac/common";
    import {
        createMenuApi,
        deleteMenuApi,
        getMenuDetailApi,
        queryMenuListApi,
        queryMenuTreeApi,
        type MenuDetailDto,
        type MenuPayload,
        updateMenuApi,
    } from "@/api/menu";
    import { queryRbacPermissionListApi } from "@/api/rbac/permission";
    import { queryRbacPermissionGroupListApi } from "@/api/rbac/permission-group";
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import PathSegments from "@/components/PathSegments.vue";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
    } from "@/components/GiTable";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { flat2treeByMap } from "@/utils/treeCover";
    import { Message, type TreeNodeData } from "@arco-design/web-vue";
    import {
        computed,
        h,
        nextTick,
        reactive,
        ref,
        shallowRef,
        type CSSProperties,
        type VNode,
        watch,
    } from "vue";
    import MenuMetadataForm from "./MenuMetadataForm.vue";
    import type {
        GroupSelectOption,
        ParentTreeNode,
        PermissionTreeNode,
        RbacMenuFormState,
        SelectOption,
    } from "./menu-form.types";

    defineOptions({ name: "RbacMenuBinding" });

    enum RbacMenuMode {
        ADD = "ADD",
        DETAIL = "DETAIL",
        EDIT = "EDIT",
    }

    type RbacMenuRecord = RbacMenuDto & {
        children?: RbacMenuRecord[];
        [key: string]: unknown;
    };

    type RbacMenuTreeSwitcherStatus = {
        loading?: boolean;
        expanded?: boolean;
        isLeaf?: boolean;
    };

    type RbacMenuTreeRecord = Omit<RbacMenuRecord, "icon" | "children"> & {
        icon?: () => VNode;
        iconName?: string | null;
        switcherIcon?: (status?: RbacMenuTreeSwitcherStatus) => VNode;
        children?: RbacMenuTreeRecord[];
    };

    const flatMenuAction = shallowRef<ActionType>();
    const meta = reactive({
        viewerCanCreateMenu: false,
        viewerCanUpdateMenu: false,
        viewerCanDeleteMenu: false,
    });
    const databaseFilters = reactive<{
        title: string;
        requiredPermissionCode: string;
        path: string;
        type?: RbacMenuType;
        status?: RbacStatus;
        groupId?: number;
    }>({
        title: "",
        requiredPermissionCode: "",
        path: "",
        type: undefined,
        status: undefined,
        groupId: undefined,
    });
    const treeLoading = ref(false);
    const detailLoading = ref(false);
    const menuSubmitting = ref(false);
    const activeView = ref<"menu" | "database">("menu");
    const menuMode = ref<RbacMenuMode>(RbacMenuMode.DETAIL);
    const menuList = ref<RbacMenuRecord[]>([]);
    const permissions = ref<RbacPermissionDto[]>([]);
    const permissionGroups = ref<RbacPermissionGroupDto[]>([]);
    const menuTree = ref<RbacMenuTreeRecord[]>([]);
    const treeSelectedKeys = ref<Array<string | number>>([]);
    const selectedMenu = ref<RbacMenuRecord | null>(null);
    const menuDetail = ref<MenuDetailDto | null>(null);
    const menuFormRenderKey = ref(0);
    const menuForm = reactive<RbacMenuFormState>(createDefaultMenuForm(RbacMenuType.Catalog, null));
    const databaseMenuForm = reactive<RbacMenuFormState>(
        createDefaultMenuForm(RbacMenuType.Catalog, null),
    );
    const databaseMenuModalVisible = ref(false);
    const databaseMenuSubmitting = ref(false);
    const databaseEditingMenu = ref<RbacMenuRecord | null>(null);
    const databaseParentMenu = ref<RbacMenuRecord | null>(null);

    const relationPagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };
    const tableOptions = { reload: true, density: true, setting: true };
    const menuTreeFieldNames = {
        key: "id",
        title: "title",
        children: "children",
    };
    const menuTreeNodeIconSize = "1em";
    const menuTreeCardBodyStyle: CSSProperties = {
        height: "620px",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };
    const treeScrollbarOuterStyle: CSSProperties = {
        flex: "1 1 auto",
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
    };
    const treeScrollbarStyle: CSSProperties = {
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflowX: "auto",
        overflowY: "auto",
    };
    const menuTypeFilterOptions: SelectOption[] = [
        { label: "目录", value: RbacMenuType.Catalog },
        { label: "页面", value: RbacMenuType.Page },
        { label: "按钮", value: RbacMenuType.Button },
    ];
    const allMenuTypeOptions: SelectOption[] = [...menuTypeFilterOptions];
    const statusFilterOptions = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const databaseSearchOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
        },
        row: { gutter: 12 },
        submitBtn: {
            show: true,
            type: "primary",
            size: "small",
            innerText: "查询",
            click: searchDatabaseMenus,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetDatabaseFilters,
        },
    }));
    const databaseSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "title",
            title: "标题",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按菜单标题筛选",
            },
        },
        {
            field: "requiredPermissionCode",
            title: "所需权限",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按权限编码筛选",
            },
        },
        {
            field: "path",
            title: "路径",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按路由路径筛选",
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
                allowSearch: true,
                placeholder: "全部",
                options: menuTypeFilterOptions,
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
                allowSearch: true,
                placeholder: "全部",
                options: statusFilterOptions,
            },
        },
        {
            field: "groupId",
            title: "分组",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "全部",
                options: permissionGroupOptions.value,
            },
        },
    ]);

    const isAddMode = computed(() => menuMode.value === RbacMenuMode.ADD);
    const isDetailMode = computed(() => menuMode.value === RbacMenuMode.DETAIL);
    const isEditingMode = computed(
        () => menuMode.value === RbacMenuMode.ADD || menuMode.value === RbacMenuMode.EDIT,
    );
    const currentMenuId = computed(() => selectedMenu.value?.id);
    const menuEditingId = computed(() =>
        menuMode.value === RbacMenuMode.EDIT ? selectedMenu.value?.id : undefined,
    );
    const selectedMenuCanUpdate = computed(() =>
        Boolean(
            selectedMenu.value && (selectedMenu.value.viewerCanUpdate ?? meta.viewerCanUpdateMenu),
        ),
    );
    const selectedMenuCanDelete = computed(() =>
        Boolean(
            selectedMenu.value && (selectedMenu.value.viewerCanDelete ?? meta.viewerCanDeleteMenu),
        ),
    );
    const canAddChild = computed(() =>
        Boolean(
            meta.viewerCanCreateMenu &&
            isDetailMode.value &&
            selectedMenu.value &&
            selectedMenu.value.type !== RbacMenuType.Button,
        ),
    );
    const canSaveMenu = computed(
        () =>
            (menuMode.value === RbacMenuMode.ADD && meta.viewerCanCreateMenu) ||
            (menuMode.value === RbacMenuMode.EDIT && selectedMenuCanUpdate.value),
    );
    const isParentRequired = computed(
        () => menuForm.type === RbacMenuType.Page || menuForm.type === RbacMenuType.Button,
    );
    const isDatabaseParentRequired = computed(
        () =>
            databaseMenuForm.type === RbacMenuType.Page ||
            databaseMenuForm.type === RbacMenuType.Button,
    );
    const menuTypeOptions = computed(() => resolveTypeOptions());
    const databaseMenuTypeOptions = computed(() =>
        databaseEditingMenu.value
            ? allMenuTypeOptions
            : resolveAddTypeOptions(databaseParentMenu.value),
    );
    const parentMenuTree = computed(() =>
        resolveParentTreeData(menuForm.type, menuEditingId.value),
    );
    const databaseParentMenuTree = computed(() =>
        resolveParentTreeData(databaseMenuForm.type, databaseEditingMenu.value?.id),
    );
    const databaseMenuModalTitle = computed(() => {
        if (databaseEditingMenu.value) {
            return `编辑 ${databaseEditingMenu.value.title}`;
        }
        if (databaseParentMenu.value) {
            return `新增 ${databaseParentMenu.value.title} 子菜单`;
        }
        return "新增根菜单";
    });
    const permissionGroupOptions = computed<GroupSelectOption[]>(() =>
        permissionGroups.value.map((group) => ({
            label: `${group.name} / ${group.code}`,
            value: group.id,
        })),
    );
    const permissionTreeData = computed<PermissionTreeNode[]>(() => buildPermissionTreeData());
    const editorTitle = computed(() => {
        if (menuMode.value === RbacMenuMode.ADD) return "新增菜单";
        if (menuMode.value === RbacMenuMode.EDIT) {
            return `编辑 ${selectedMenu.value?.title ?? "菜单"}`;
        }
        return selectedMenu.value?.title ?? "菜单";
    });
    const editorSubtitle = computed(() => {
        if (menuMode.value === RbacMenuMode.ADD) {
            return "创建后写入 rbac_menu，菜单通过所需权限参与导航读模型";
        }
        if (menuMode.value === RbacMenuMode.EDIT) {
            return "编辑菜单元数据和所需权限；角色授权在角色页维护";
        }
        return selectedMenu.value ? "查看菜单元数据和所需权限" : "请选择菜单";
    });

    const menuColumns: ProColumns[] = [
        { title: "标题", dataIndex: "title", width: 220, fixed: "left" },
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "父级", dataIndex: "pid", width: 90 },
        { title: "类型", dataIndex: "type", slotName: "type", width: 110 },
        { title: "分组", dataIndex: "groupId", slotName: "group", width: 150 },
        {
            title: "所需权限",
            dataIndex: "requiredPermissionCode",
            slotName: "requiredPermissionCode",
            width: 300,
        },
        { title: "路径", dataIndex: "path", slotName: "path", width: 260 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 100 },
        { title: "排序", dataIndex: "order", width: 90 },
        { title: "操作", dataIndex: "operation", slotName: "action", fixed: "right", width: 180 },
    ];

    function setFlatMenuAction(action: ActionType) {
        flatMenuAction.value = action;
    }

    function createDefaultMenuForm(type: RbacMenuType, pid: number | null): RbacMenuFormState {
        return {
            pid: pid ?? undefined,
            title: "",
            description: "",
            type,
            groupId: undefined,
            requiredPermissionCode: "",
            path: "",
            componentPath: "",
            componentName: "",
            icon: "",
            order: 0,
            layout: RbacMenuLayoutType.LAYOUT_SIDE,
            pageType: RbacPageType.PAGE,
            isResident: false,
            isCache: type === RbacMenuType.Page,
            isMenuVisible: true,
            isTabVisible: true,
            showChildren: true,
            status: RbacStatus.ENABLE,
        };
    }

    function getDefaultChildType(parent?: RbacMenuDto | null) {
        if (!parent) return RbacMenuType.Catalog;
        if (parent.type === RbacMenuType.Page) return RbacMenuType.Button;
        return RbacMenuType.Catalog;
    }

    function resetMenuForm(record?: RbacMenuDto, parent?: RbacMenuDto | null) {
        assignMenuForm(menuForm, record, parent);
        menuFormRenderKey.value += 1;
    }

    function resetDatabaseMenuForm(record?: RbacMenuDto, parent?: RbacMenuDto | null) {
        assignMenuForm(databaseMenuForm, record, parent);
    }

    function assignMenuForm(
        target: RbacMenuFormState,
        record?: RbacMenuDto,
        parent?: RbacMenuDto | null,
    ) {
        const defaults = createDefaultMenuForm(
            record?.type ?? getDefaultChildType(parent),
            parent?.id ?? record?.pid ?? null,
        );
        Object.assign(target, {
            ...defaults,
            title: record?.title ?? "",
            description: record?.description ?? "",
            groupId: record?.groupId ?? undefined,
            requiredPermissionCode: record?.requiredPermissionCode ?? "",
            path: record?.path ?? "",
            componentPath: record?.componentPath ?? "",
            componentName: record?.componentName ?? "",
            icon: record?.icon ?? "",
            order: record?.order ?? 0,
            layout: record?.layout ?? defaults.layout,
            pageType: record?.pageType ?? defaults.pageType,
            isResident: record?.isResident ?? defaults.isResident,
            isCache: record?.isCache ?? defaults.isCache,
            isMenuVisible: record?.isMenuVisible ?? defaults.isMenuVisible,
            isTabVisible: record?.isTabVisible ?? defaults.isTabVisible,
            showChildren: record?.showChildren ?? defaults.showChildren,
            status: record?.status ?? defaults.status,
        });
    }

    function openCreateRoot() {
        selectedMenu.value = null;
        menuDetail.value = null;
        treeSelectedKeys.value = [];
        activeView.value = "menu";
        menuMode.value = RbacMenuMode.ADD;
        resetMenuForm(undefined, null);
    }

    function openCreateChild() {
        if (!selectedMenu.value || selectedMenu.value.type === RbacMenuType.Button) {
            return;
        }
        activeView.value = "menu";
        menuMode.value = RbacMenuMode.ADD;
        resetMenuForm(undefined, selectedMenu.value);
    }

    function openEditMenu() {
        if (!selectedMenu.value) {
            return;
        }
        activeView.value = "menu";
        menuMode.value = RbacMenuMode.EDIT;
        resetMenuForm(selectedMenu.value);
    }

    function cancelEditing() {
        menuMode.value = RbacMenuMode.DETAIL;
        if (selectedMenu.value) {
            resetMenuForm(selectedMenu.value);
            return;
        }
        resetMenuForm(undefined, null);
    }

    async function openDatabaseRecord(record: RbacMenuDto, edit: boolean) {
        if (edit) {
            openDatabaseEditMenu(record);
            return;
        }
        activeView.value = "menu";
        await selectMenu(record);
    }

    function openDatabaseEditMenu(record: RbacMenuDto) {
        databaseEditingMenu.value = record as RbacMenuRecord;
        databaseParentMenu.value = null;
        resetDatabaseMenuForm(record);
        databaseMenuModalVisible.value = true;
    }

    function openDatabaseCreateRoot() {
        activeView.value = "database";
        databaseEditingMenu.value = null;
        databaseParentMenu.value = null;
        resetDatabaseMenuForm(undefined, null);
        databaseMenuModalVisible.value = true;
    }

    function openDatabaseCreateChild(record: RbacMenuDto) {
        if (record.type === RbacMenuType.Button) {
            return;
        }
        activeView.value = "database";
        databaseEditingMenu.value = null;
        databaseParentMenu.value = record as RbacMenuRecord;
        resetDatabaseMenuForm(undefined, record);
        databaseMenuModalVisible.value = true;
    }

    function buildMenuPayload(form: RbacMenuFormState = menuForm): MenuPayload {
        const type = form.type;
        return {
            pid: form.pid ?? null,
            title: form.title.trim(),
            description: normalizeNullableText(form.description),
            type,
            groupId: form.groupId ?? null,
            requiredPermissionCode: form.requiredPermissionCode.trim(),
            path:
                type === RbacMenuType.Catalog || type === RbacMenuType.Page
                    ? normalizeNullableText(form.path)
                    : null,
            componentPath:
                type === RbacMenuType.Page ? normalizeNullableText(form.componentPath) : null,
            componentName:
                type === RbacMenuType.Page ? normalizeNullableText(form.componentName) : null,
            icon: normalizeNullableText(form.icon),
            order: form.order ?? null,
            layout: type === RbacMenuType.Page ? form.layout : undefined,
            pageType: type === RbacMenuType.Page ? form.pageType : undefined,
            isResident: type === RbacMenuType.Page ? form.isResident : undefined,
            isCache: type === RbacMenuType.Page ? form.isCache : undefined,
            isMenuVisible:
                type === RbacMenuType.Catalog || type === RbacMenuType.Page
                    ? form.isMenuVisible
                    : undefined,
            isTabVisible: type === RbacMenuType.Page ? form.isTabVisible : undefined,
            showChildren: type === RbacMenuType.Catalog ? form.showChildren : undefined,
            status: form.status,
        };
    }

    function validateMenuForm(form: RbacMenuFormState = menuForm, editingId?: number) {
        if (!form.title.trim()) {
            Message.warning("请输入菜单标题");
            return false;
        }
        if (!form.requiredPermissionCode.trim()) {
            Message.warning("请输入所需权限");
            return false;
        }
        if (form.type === RbacMenuType.Page && !form.pid) {
            Message.warning("页面必须选择目录父级");
            return false;
        }
        if (form.type === RbacMenuType.Button && !form.pid) {
            Message.warning("按钮必须选择页面父级");
            return false;
        }
        if (form.pid) {
            const parent = findMenu(form.pid);
            if (!parent || !canSelectParentMenu(parent, form.type, editingId)) {
                Message.warning("当前父级节点不符合菜单类型规则");
                return false;
            }
        }
        if (form.type === RbacMenuType.Page) {
            if (!form.componentPath.trim()) {
                Message.warning("请输入组件路径");
                return false;
            }
            if (!form.componentName.trim()) {
                Message.warning("请输入组件名称");
                return false;
            }
        }
        return true;
    }

    async function submitMenu() {
        if (!validateMenuForm(menuForm, menuEditingId.value)) {
            return;
        }

        menuSubmitting.value = true;
        try {
            const payload = buildMenuPayload();
            const response =
                menuMode.value === RbacMenuMode.EDIT && selectedMenu.value
                    ? await updateMenuApi(selectedMenu.value.id, payload)
                    : await createMenuApi(payload);
            Message.success("菜单已保存");
            menuMode.value = RbacMenuMode.DETAIL;
            await loadMenus();
            await flatMenuAction.value?.reload();
            await selectMenu(response.data);
        } finally {
            menuSubmitting.value = false;
        }
    }

    async function submitDatabaseMenu() {
        const editingMenu = databaseEditingMenu.value;
        if (!validateMenuForm(databaseMenuForm, editingMenu?.id)) {
            return false;
        }

        databaseMenuSubmitting.value = true;
        try {
            const payload = buildMenuPayload(databaseMenuForm);
            const response = editingMenu
                ? await updateMenuApi(editingMenu.id, payload)
                : await createMenuApi(payload);
            Message.success("菜单已保存");
            databaseMenuModalVisible.value = false;
            await loadMenus();
            if (selectedMenu.value?.id === response.data.id) {
                await refreshMenuDetail();
            }
            await flatMenuAction.value?.reload();
            return true;
        } finally {
            databaseMenuSubmitting.value = false;
        }
    }

    async function deleteSelectedMenu() {
        if (!selectedMenu.value) {
            return;
        }
        await deleteMenuRecord(selectedMenu.value);
    }

    async function deleteMenuRecord(record: RbacMenuDto) {
        await deleteMenuApi(record.id);
        Message.success("菜单已删除");
        if (selectedMenu.value?.id === record.id) {
            clearCurrentMenu();
        }
        await loadMenus();
        await flatMenuAction.value?.reload();
    }

    function clearCurrentMenu() {
        selectedMenu.value = null;
        menuDetail.value = null;
        treeSelectedKeys.value = [];
        menuMode.value = RbacMenuMode.DETAIL;
        resetMenuForm(undefined, null);
    }

    function findMenu(id: number) {
        return menuList.value.find((menu) => menu.id === id);
    }

    function resolveTypeOptions(): SelectOption[] {
        if (menuMode.value !== RbacMenuMode.ADD) {
            return [
                { label: "目录", value: RbacMenuType.Catalog },
                { label: "页面", value: RbacMenuType.Page },
                { label: "按钮", value: RbacMenuType.Button },
            ];
        }

        return resolveAddTypeOptions(selectedMenu.value);
    }

    function resolveAddTypeOptions(parent?: RbacMenuDto | null): SelectOption[] {
        if (!parent) {
            return [{ label: "目录", value: RbacMenuType.Catalog }];
        }

        if (parent.type === RbacMenuType.Catalog) {
            return [
                { label: "目录", value: RbacMenuType.Catalog },
                { label: "页面", value: RbacMenuType.Page },
            ];
        }

        if (parent.type === RbacMenuType.Page) {
            return [{ label: "按钮", value: RbacMenuType.Button }];
        }

        return [];
    }

    function resolveParentTypes(type?: RbacMenuType): RbacMenuType[] {
        if (!type) {
            return [];
        }
        if (type === RbacMenuType.Button) {
            return [RbacMenuType.Page];
        }
        return [RbacMenuType.Catalog];
    }

    function resolveExcludedParentIds(editingId?: number) {
        if (!editingId) {
            return new Set<number>();
        }

        const childrenByPid = new Map<number | null, RbacMenuRecord[]>();
        for (const menu of menuList.value) {
            const children = childrenByPid.get(menu.pid ?? null) ?? [];
            children.push(menu);
            childrenByPid.set(menu.pid ?? null, children);
        }

        const excludedIds = new Set<number>([editingId]);
        const stack = [...(childrenByPid.get(editingId) ?? [])];
        while (stack.length > 0) {
            const current = stack.pop()!;
            excludedIds.add(current.id);
            stack.push(...(childrenByPid.get(current.id) ?? []));
        }
        return excludedIds;
    }

    function canSelectParentMenu(menu: RbacMenuDto, type?: RbacMenuType, editingId?: number) {
        return (
            resolveParentTypes(type).includes(menu.type) &&
            !resolveExcludedParentIds(editingId).has(menu.id)
        );
    }

    function resolveParentTreeData(type?: RbacMenuType, editingId?: number): ParentTreeNode[] {
        const parentTypes =
            type === RbacMenuType.Button
                ? [RbacMenuType.Catalog, RbacMenuType.Page]
                : [RbacMenuType.Catalog];
        const selectableParentTypes = resolveParentTypes(type);
        const excludedIds = resolveExcludedParentIds(editingId);
        const childrenByPid = new Map<number | null, RbacMenuRecord[]>();

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

    async function loadMenus() {
        treeLoading.value = true;
        try {
            await loadPermissionResources();
            const response = await queryMenuTreeApi();
            Object.assign(meta, response.data.meta ?? {});
            menuList.value = response.data.records as RbacMenuRecord[];
            menuTree.value = attachMenuTreeNodeIcons(
                flat2treeByMap(response.data.records, {
                    fieldsPath: "order",
                    sequential: true,
                }),
            );

            if (currentMenuId.value) {
                const nextSelectedMenu = menuList.value.find(
                    (menu) => menu.id === currentMenuId.value,
                );
                if (nextSelectedMenu) {
                    selectedMenu.value = nextSelectedMenu;
                    treeSelectedKeys.value = [nextSelectedMenu.id];
                    if (menuMode.value === RbacMenuMode.DETAIL) {
                        resetMenuForm(nextSelectedMenu);
                    }
                }
            }
        } finally {
            treeLoading.value = false;
        }
    }

    function attachMenuTreeNodeIcons(tree: RbacMenuRecord[]): RbacMenuTreeRecord[] {
        return tree.map((node) => {
            const iconName = resolveMenuIconName(node);
            const { icon: _rawIcon, children: rawChildren, ...nodeData } = node;
            const hasChildren = Array.isArray(rawChildren) && rawChildren.length > 0;
            const nextNode = {
                ...nodeData,
                iconName,
            } as RbacMenuTreeRecord;

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

    function handleMenuSelect(
        selectedKeys: Array<string | number>,
        data: { selected?: boolean; selectedNodes: TreeNodeData[]; node?: TreeNodeData },
    ) {
        treeSelectedKeys.value = selectedKeys;
        if (!data.node) {
            return;
        }
        void selectMenu(restoreMenuIconField(data.node as unknown as RbacMenuTreeRecord));
    }

    function restoreMenuIconField(menu: RbacMenuTreeRecord | RbacMenuRecord): RbacMenuRecord {
        const { icon: _renderIcon, iconName: _iconName, children: _children, ...menuData } = menu;
        return {
            ...menuData,
            icon: resolveMenuIconName(menu),
        } as RbacMenuRecord;
    }

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

    async function selectMenu(record: RbacMenuDto) {
        treeSelectedKeys.value = [record.id];
        activeView.value = "menu";
        menuMode.value = RbacMenuMode.DETAIL;
        menuDetail.value = null;
        detailLoading.value = true;
        try {
            const response = await getMenuDetailApi(record.id);
            menuDetail.value = response.data;
            selectedMenu.value = response.data.menu as RbacMenuRecord;
            resetMenuForm(response.data.menu);
            await nextTick();
        } finally {
            detailLoading.value = false;
        }
    }

    async function requestFlatMenus(params: GiTableRequestParams) {
        const response = await queryMenuListApi({
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
            title: databaseFilters.title || undefined,
            requiredPermissionCode: databaseFilters.requiredPermissionCode || undefined,
            path: databaseFilters.path || undefined,
            type: databaseFilters.type,
            status: databaseFilters.status,
            groupId: databaseFilters.groupId,
        });
        Object.assign(meta, response.data.meta ?? {});
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    async function searchDatabaseMenus() {
        await flatMenuAction.value?.reload(true);
    }

    function syncDatabaseFilters(value: Partial<typeof databaseFilters>) {
        Object.assign(databaseFilters, value);
    }

    async function resetDatabaseFilters() {
        databaseFilters.title = "";
        databaseFilters.requiredPermissionCode = "";
        databaseFilters.path = "";
        databaseFilters.type = undefined;
        databaseFilters.status = undefined;
        databaseFilters.groupId = undefined;
        await searchDatabaseMenus();
    }

    async function loadPermissionResources() {
        const [groupResponse, permissionResponse] = await Promise.all([
            queryRbacPermissionGroupListApi(),
            queryRbacPermissionListApi(),
        ]);
        permissionGroups.value = groupResponse.data.records;
        permissions.value = permissionResponse.data.records;
    }

    function buildPermissionTreeData(): PermissionTreeNode[] {
        const groupNodes = new Map<number, PermissionTreeNode>();
        const roots: PermissionTreeNode[] = [];

        for (const group of permissionGroups.value) {
            const node = {
                key: `group:${group.id}`,
                title: `${group.name} / ${group.code}`,
                disabled: true,
                children: [],
            };
            groupNodes.set(group.id, node);
            roots.push(node);
        }

        for (const permission of [...permissions.value].sort(sortPermissions)) {
            const node: PermissionTreeNode = {
                key: permission.code,
                title: `${permission.name} / ${permission.code}`,
            };
            const groupId = permission.groupId ?? undefined;
            const groupNode = groupId ? groupNodes.get(groupId) : undefined;
            if (groupNode) {
                groupNode.children = [...(groupNode.children ?? []), node];
            } else {
                roots.push(node);
            }
        }

        return roots;
    }

    function sortPermissions(left: RbacPermissionDto, right: RbacPermissionDto) {
        return left.sort - right.sort || left.id - right.id;
    }

    function getPermissionGroupName(groupId?: number | null) {
        if (!groupId) {
            return "未分组";
        }
        const group = permissionGroups.value.find((item) => item.id === groupId);
        return group ? group.name : `分组 ${groupId}`;
    }

    async function refreshMenuDetail() {
        if (!menuDetail.value) return;
        const response = await getMenuDetailApi(menuDetail.value.menu.id);
        menuDetail.value = response.data;
        selectedMenu.value = response.data.menu as RbacMenuRecord;
        resetMenuForm(response.data.menu);
    }

    function formatMenuType(type?: string) {
        if (type === "Catalog") return "目录";
        if (type === "Page") return "页面";
        if (type === "Button") return "按钮";
        return type ?? "-";
    }

    function getMenuTypeColor(type?: string) {
        if (type === "Catalog") return "arcoblue";
        if (type === "Page") return "green";
        if (type === "Button") return "orange";
        return "gray";
    }

    function normalizeNullableText(value: unknown) {
        if (typeof value !== "string") return null;
        const text = value.trim();
        return text.length > 0 ? text : null;
    }

    watch(
        () => menuForm.type,
        () => {
            if (!menuTypeOptions.value.some((option) => option.value === menuForm.type)) {
                const [firstOption] = menuTypeOptions.value;
                if (firstOption) {
                    menuForm.type = firstOption.value;
                }
                return;
            }

            if (!menuForm.pid) return;
            const parent = findMenu(menuForm.pid);
            if (!parent || !canSelectParentMenu(parent, menuForm.type, menuEditingId.value)) {
                menuForm.pid = undefined;
            }
        },
    );

    watch(
        () => databaseMenuForm.type,
        () => {
            if (!databaseMenuForm.pid) return;
            const parent = findMenu(databaseMenuForm.pid);
            if (
                !parent ||
                !canSelectParentMenu(parent, databaseMenuForm.type, databaseEditingMenu.value?.id)
            ) {
                databaseMenuForm.pid = undefined;
            }
        },
    );

    void loadMenus();
</script>

<style scoped>
    .rbac-menu-board {
        display: grid;
        grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
    }

    .rbac-menu-board__tree,
    .rbac-menu-board__detail,
    .rbac-menu-database-card {
        min-width: 0;
    }

    .rbac-menu-editor-subtitle {
        display: block;
        margin-bottom: 16px;
    }

    .rbac-menu-rule-alert {
        margin-bottom: 12px;
    }

    .rbac-menu-tree-spin {
        display: flex;
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
        min-width: 0;
        width: 100%;
        flex-direction: column;
    }

    .rbac-menu-tree-spin :deep(.arco-spin-children) {
        display: flex;
        height: 100%;
        min-height: 0;
        min-width: 0;
        flex-direction: column;
    }

    :deep(.rbac-menu-tree-scrollbar) {
        height: 100%;
        min-width: 0;
        min-height: 0;
    }

    :deep(.rbac-menu-tree-scrollbar .arco-scrollbar-container) {
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow-x: auto;
        overflow-y: auto;
    }

    :deep(.rbac-menu-tree-scrollbar .arco-tree) {
        display: inline-block;
        width: max-content;
        min-width: 100%;
    }

    :deep(.rbac-menu-tree-scrollbar .arco-tree-node) {
        width: max-content;
        min-width: 100%;
    }

    .rbac-menu-filter-select {
        width: 140px;
    }

    @media (max-width: 1024px) {
        .rbac-menu-board {
            grid-template-columns: 1fr;
        }
    }
</style>
