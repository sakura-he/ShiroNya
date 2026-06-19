<template>
    <GiPageLayout
        size="320px"
        min="260px"
        max="520px"
        :left-scrollable="false"
        :content-scrollable="true"
    >
        <template #left>
            <a-space
                direction="vertical"
                fill
                class="dict-left"
            >
                <div class="dict-left__header">
                    <a-typography-text bold>字典导航</a-typography-text>
                    <a-space>
                        <a-button
                            size="small"
                            :loading="reloadAllLoading"
                            @click="reloadAll"
                        >
                            <template #icon>
                                <icon-refresh />
                            </template>
                        </a-button>
                        <ShiroAuth :permissions="DictPermissions.create">
                            <a-button
                                size="small"
                                type="primary"
                                title="新增分类"
                                @click="openCreateCategory"
                            >
                                <template #icon>
                                    <icon-plus />
                                </template>
                            </a-button>
                        </ShiroAuth>
                    </a-space>
                </div>
                <form-create
                    v-model="navigationSearchFormData"
                    :rule="navigationSearchRules"
                    :option="navigationSearchFormOptions"
                />
                <a-scrollbar
                    :outer-style="{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }"
                    :style="{ height: '100%', overflowX: 'hidden', overflowY: 'auto' }"
                    disable-horizontal
                >
                    <a-tree
                        v-model:selected-keys="navigationSelectedKeys"
                        :data="dictNavigationNodes"
                        :field-names="dictNavigationFieldNames"
                        block-node
                        show-line
                        :animation="true"
                        @select="handleNavigationSelect"
                    >
                        <template #title="{ title, nodeType, status, count }">
                            <a-space
                                :size="8"
                                align="center"
                            >
                                <span>{{ title }}</span>
                                <a-tag
                                    size="small"
                                    :color="nodeType === 'category' ? 'green' : 'arcoblue'"
                                >
                                    {{ count ?? 0 }}
                                </a-tag>
                                <a-tag
                                    v-if="nodeType === 'dict'"
                                    size="small"
                                    :color="getStatusColor(status)"
                                >
                                    {{ getStatusLabel(status) }}
                                </a-tag>
                            </a-space>
                        </template>
                    </a-tree>
                </a-scrollbar>
            </a-space>
        </template>

        <template #header>
            <a-page-header
                title="字典管理"
                subtitle="维护后台下拉选项和枚举映射"
                :show-back="false"
            >
                <template #extra>
                    <a-space>
                        <a-button
                            size="small"
                            :loading="reloadAllLoading"
                            @click="reloadAll"
                        >
                            <template #icon>
                                <icon-refresh />
                            </template>
                            刷新
                        </a-button>
                    </a-space>
                </template>
            </a-page-header>
        </template>

        <a-modal
            v-model:visible="categoryModalVisible"
            title="新增分类"
            width="520px"
            unmount-on-close
            :confirm-loading="categorySubmitting"
            @before-ok="submitCategoryForm"
            @cancel="resetCategoryForm"
        >
            <form-create
                v-model="categoryFormData"
                v-model:api="categoryFormApi"
                :rule="categoryFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-modal
            v-model:visible="dictModalVisible"
            :title="dictModalTitle"
            width="680px"
            unmount-on-close
            :confirm-loading="dictSubmitting"
            @before-ok="submitDictForm"
            @cancel="resetDictForm"
        >
            <form-create
                v-model="dictFormData"
                v-model:api="dictFormApi"
                :rule="dictFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-modal
            v-model:visible="itemModalVisible"
            :title="itemModalTitle"
            width="680px"
            unmount-on-close
            :confirm-loading="itemSubmitting"
            @before-ok="submitItemForm"
            @cancel="resetItemForm"
        >
            <form-create
                v-model="itemFormData"
                v-model:api="itemFormApi"
                :rule="itemFormRules"
                :option="modalFormOptions"
            />
        </a-modal>

        <a-card
            v-if="rightView === 'category'"
            :bordered="true"
        >
            <template #title>
                <a-space>
                    <a-typography-text type="secondary">当前分类</a-typography-text>
                    <a-tag color="green">{{ selectedCategory }}</a-tag>
                </a-space>
            </template>
            <template #extra>
                <a-space size="small">
                    <ShiroAuth :permissions="DictPermissions.create">
                        <a-button
                            type="primary"
                            size="small"
                            @click="openCreateDict"
                        >
                            <template #icon>
                                <icon-plus />
                            </template>
                            创建字典
                        </a-button>
                    </ShiroAuth>
                    <ShiroAuth :permissions="DictPermissions.delete">
                        <a-popconfirm
                            content="仅空分类可删除，确定删除该分类吗？"
                            @ok="removeCategory"
                        >
                            <a-button
                                size="small"
                                status="danger"
                                :loading="categoryDeleting"
                                :disabled="!selectedCategory"
                            >
                                <template #icon>
                                    <icon-delete />
                                </template>
                                删除分类
                            </a-button>
                        </a-popconfirm>
                    </ShiroAuth>
                </a-space>
            </template>
            <GiTable
                header-title="分类字典"
                row-key="id"
                :columns="dictColumns"
                :request="getDictTableData"
                :pagination="tablePagination"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1180 }"
                :scrollbar="true"
                :stripe="true"
                :bordered="true"
                :action-ref="setDictTableAction"
            >
                <template #form-search>
                    <form-create
                        v-model="dictSearchFormData"
                        :rule="dictSearchRules"
                        :option="dictSearchFormOptions"
                    />
                </template>
                <template #status="{ record }">
                    <ShiroAuth :permissions="DictPermissions.update">
                        <a-switch
                            :model-value="record.status"
                            :checked-value="DictStatus.ENABLE"
                            :unchecked-value="DictStatus.DISABLE"
                            checked-text="启用"
                            unchecked-text="禁用"
                            :loading="dictStatusUpdatingIds.has(record.id)"
                            :before-change="(value: string | number | boolean) => changeDictStatus(record, value)"
                        />
                    </ShiroAuth>
                </template>
                <template #itemCount="{ record }">
                    <a-tag color="arcoblue">{{ record.itemCount ?? 0 }}</a-tag>
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <ShiroAuth :permissions="DictPermissions.update">
                            <a-button
                                size="mini"
                                type="primary"
                                @click="openEditDict(record)"
                            >
                                编辑
                            </a-button>
                        </ShiroAuth>
                        <ShiroAuth :permissions="DictPermissions.itemCreate">
                            <a-button
                                size="mini"
                                @click="openCreateItem(record)"
                            >
                                新增项
                            </a-button>
                        </ShiroAuth>
                        <ShiroAuth :permissions="DictPermissions.delete">
                            <a-popconfirm
                                content="确定要删除该字典和全部字典项吗？"
                                @ok="removeDict(record)"
                            >
                                <a-button
                                    size="mini"
                                    type="primary"
                                    status="danger"
                                >
                                    删除
                                </a-button>
                            </a-popconfirm>
                        </ShiroAuth>
                    </a-space>
                </template>
            </GiTable>
        </a-card>

        <a-card
            v-else-if="rightView === 'dict'"
            :bordered="true"
        >
            <template #title>
                <a-space>
                    <a-typography-text type="secondary">当前字典</a-typography-text>
                    <a-tag color="arcoblue">
                        {{ selectedDict?.category }} / {{ selectedDict?.value }}
                    </a-tag>
                </a-space>
            </template>
            <template #extra>
                <ShiroAuth :permissions="DictPermissions.itemCreate">
                    <a-button
                        size="small"
                        type="primary"
                        :disabled="!selectedDict"
                        @click="openCreateItem(selectedDict)"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        创建字典项
                    </a-button>
                </ShiroAuth>
            </template>
            <GiTable
                header-title="字典项管理"
                row-key="id"
                :columns="itemColumns"
                :request="getItemTableData"
                :pagination="tablePagination"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1200 }"
                :scrollbar="true"
                :stripe="true"
                :bordered="true"
                :action-ref="setItemTableAction"
            >
                <template #form-search>
                    <form-create
                        v-model="itemSearchFormData"
                        :rule="itemSearchRules"
                        :option="itemSearchFormOptions"
                    />
                </template>
                <template #status="{ record }">
                    <ShiroAuth :permissions="DictPermissions.itemUpdate">
                        <a-switch
                            :model-value="record.status"
                            :checked-value="DictStatus.ENABLE"
                            :unchecked-value="DictStatus.DISABLE"
                            checked-text="启用"
                            unchecked-text="禁用"
                            :loading="itemStatusUpdatingIds.has(record.id)"
                            :before-change="(value: string | number | boolean) => changeItemStatus(record, value)"
                        />
                    </ShiroAuth>
                </template>
                <template #dict="{ record }">
                    <a-space
                        direction="vertical"
                        size="mini"
                    >
                        <span>{{ record.dict?.name ?? "-" }}</span>
                        <a-typography-text type="secondary">
                            {{ record.dict?.category ?? "-" }} /
                            {{ record.dict?.value ?? "-" }}
                        </a-typography-text>
                    </a-space>
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <ShiroAuth :permissions="DictPermissions.itemUpdate">
                            <a-button
                                size="mini"
                                type="primary"
                                @click="openEditItem(record)"
                            >
                                编辑
                            </a-button>
                        </ShiroAuth>
                        <ShiroAuth :permissions="DictPermissions.itemDelete">
                            <a-popconfirm
                                content="确定要删除该字典项吗？"
                                @ok="removeItem(record)"
                            >
                                <a-button
                                    size="mini"
                                    type="primary"
                                    status="danger"
                                >
                                    删除
                                </a-button>
                            </a-popconfirm>
                        </ShiroAuth>
                    </a-space>
                </template>
            </GiTable>
        </a-card>

        <a-card
            v-else
            :bordered="true"
            :body-style="{
                minHeight: '360px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }"
        >
            <a-empty description="请选择左侧分类或字典" />
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="tsx">
    import {
        createDict,
        createDictCategory,
        createDictItem,
        deleteDict,
        deleteDictCategory,
        deleteDictItem,
        DictStatus,
        queryDictCategoryOptions,
        queryDictItemList,
        queryDictList,
        getDictStatusOptions,
        updateDict,
        updateDictItem,
        updateDictItemStatus,
        updateDictStatus,
        type DictCategoryForm,
        type DictCategoryOption,
        type DictForm,
        type DictItemForm,
        type DictItemRecord,
        type DictRecord,
        type DictStatusOption,
    } from "@/api/dict";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import ShiroAuth from "@/components/ShiroAuth.vue";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import { clearFormCreateValidate } from "@/utils/apiValidation";
    import { Message, type TreeNodeData } from "@arco-design/web-vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { cloneDeep } from "es-toolkit";
    import { computed, nextTick, ref, shallowRef } from "vue";

    defineOptions({
        name: "Dict",
    });

    type DictNavigationNode = {
        key: string;
        title: string;
        nodeType: "category" | "dict";
        status?: number;
        count?: number;
        dict?: DictRecord;
        children?: DictNavigationNode[];
    };

    enum DictModalMode {
        CREATE = "CREATE",
        EDIT = "EDIT",
    }

    const DictPermissions = {
        create: "system.dict.create",
        update: "system.dict.update",
        delete: "system.dict.delete",
        itemCreate: "system.dict-item.create",
        itemUpdate: "system.dict-item.update",
        itemDelete: "system.dict-item.delete",
    } as const;
    const MAX_OPTION_PAGE_SIZE = 100;

    const dictModalMode = ref<DictModalMode>(DictModalMode.CREATE);
    const itemModalMode = ref<DictModalMode>(DictModalMode.CREATE);
    const categoryModalVisible = ref(false);
    const dictModalVisible = ref(false);
    const itemModalVisible = ref(false);
    const categorySubmitting = ref(false);
    const categoryDeleting = ref(false);
    const dictSubmitting = ref(false);
    const itemSubmitting = ref(false);
    const reloadAllLoading = ref(false);
    const dictTableAction = ref<ActionType | null>(null);
    const itemTableAction = ref<ActionType | null>(null);
    const categoryFormApi = shallowRef<FormCreateApi | null>(null);
    const dictFormApi = shallowRef<FormCreateApi | null>(null);
    const itemFormApi = shallowRef<FormCreateApi | null>(null);
    const statusOptions = ref<DictStatusOption[]>([]);
    const categoryOptions = ref<DictCategoryOption[]>([]);
    const itemKeyOptions = ref<Array<{ label: string; value: string }>>([]);
    const dictNavigationRecords = ref<DictRecord[]>([]);
    const dictNavigationNodes = ref<DictNavigationNode[]>([]);
    const navigationSelectedKeys = ref<Array<string | number>>([]);
    const selectedCategory = ref("");
    const selectedDict = ref<DictRecord | null>(null);
    const dictStatusUpdatingIds = ref(new Set<number>());
    const itemStatusUpdatingIds = ref(new Set<number>());

    const dictNavigationFieldNames = {
        key: "key",
        title: "title",
        children: "children",
    };

    const tablePagination = {
        defaultCurrent: 1,
        defaultPageSize: 10,
        current: 1,
        pageSize: 10,
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

    const navigationSearchFormData = ref(createEmptyNavigationSearchForm());
    const dictSearchFormData = ref(createEmptyDictSearchForm());
    const itemSearchFormData = ref(createEmptyItemSearchForm());
    const categoryFormData = ref<DictCategoryForm>(createEmptyCategoryForm());
    const dictFormData = ref<DictForm>(createEmptyDictForm());
    const itemFormData = ref<DictItemForm>(createEmptyItemForm());

    const dictColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80, align: "center", fixed: "left" },
        { title: "分类", dataIndex: "category", width: 160 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "value", width: 180 },
        {
            title: "字典项",
            dataIndex: "itemCount",
            slotName: "itemCount",
            width: 100,
            align: "center",
        },
        { title: "状态", dataIndex: "status", slotName: "status", width: 120, align: "center" },
        { title: "排序", dataIndex: "sortOrder", width: 90, align: "center" },
        { title: "描述", dataIndex: "description", width: 240, ellipsis: true, tooltip: true },
        { title: "创建时间", dataIndex: "createdAt", width: 180 },
        { title: "更新时间", dataIndex: "updatedAt", width: 180 },
        { title: "操作", slotName: "action", width: 220, fixed: "right" },
    ];

    const itemColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80, align: "center", fixed: "left" },
        { title: "所属字典", dataIndex: "dict", slotName: "dict", width: 220 },
        { title: "键", dataIndex: "key", width: 180 },
        { title: "显示值", dataIndex: "value", width: 180 },
        { title: "状态", dataIndex: "status", slotName: "status", width: 120, align: "center" },
        { title: "排序", dataIndex: "sortOrder", width: 90, align: "center" },
        { title: "描述", dataIndex: "description", width: 260, ellipsis: true, tooltip: true },
        { title: "创建时间", dataIndex: "createdAt", width: 180 },
        { title: "更新时间", dataIndex: "updatedAt", width: 180 },
        { title: "操作", slotName: "action", width: 160, fixed: "right" },
    ];

    const modalFormOptions: FormCreateOptions = {
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
        },
        row: {
            gutter: 12,
        },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };

    const categorySelectOptions = computed(() =>
        categoryOptions.value.map((category) => ({
            label: `${category.label}（${category.count}）`,
            value: category.value,
        })),
    );
    const shouldLockDictCategory = computed(
        () => dictModalMode.value === DictModalMode.CREATE && Boolean(selectedCategory.value),
    );
    const rightView = computed(() => {
        if (selectedDict.value) return "dict";
        if (selectedCategory.value) return "category";
        return "empty";
    });
    const navigationSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(() => void loadDictNavigation(), resetNavigationSearch),
    );
    const dictSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(() => void submitDictSearch(), resetDictSearch),
    );
    const itemSearchFormOptions = computed<FormCreateOptions>(() =>
        buildSearchFormOptions(() => void refreshItemTable(), resetItemSearch),
    );

    const navigationSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "category",
            title: "分类",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "筛选分类",
                options: categorySelectOptions.value,
            },
        },
        {
            field: "keyword",
            title: "关键字",
            type: "input",
            props: { allowClear: true, placeholder: "搜索分类、名称、编码" },
        },
    ]);

    const dictSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "category",
            title: "分类",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: false,
                allowSearch: true,
                placeholder: "分类",
                options: categorySelectOptions.value,
            },
        },
        {
            field: "name",
            title: "名称",
            type: "input",
            props: { allowClear: true, placeholder: "名称" },
        },
        {
            field: "value",
            title: "编码",
            type: "input",
            props: { allowClear: true, placeholder: "编码" },
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
                placeholder: "状态",
                options: statusOptions.value,
            },
        },
        {
            field: "keyword",
            title: "关键字",
            type: "input",
            props: { allowClear: true, placeholder: "分类 / 名称 / 编码 / 描述" },
        },
    ]);

    const itemSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "key",
            title: "键",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "选择键",
                options: itemKeyOptions.value,
            },
        },
        {
            field: "value",
            title: "显示值",
            type: "input",
            props: { allowClear: true, placeholder: "显示值" },
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
                placeholder: "状态",
                options: statusOptions.value,
            },
        },
        {
            field: "keyword",
            title: "关键字",
            type: "input",
            props: { allowClear: true, placeholder: "键 / 显示值 / 描述" },
        },
    ]);

    const categoryFormRules: FormCreateRule[] = [
        {
            field: "name",
            title: "分类",
            type: "input",
            props: { allowClear: true, placeholder: "如 system" },
            validate: [{ required: true, message: "请输入分类", trigger: "change" }],
            col: { span: 24 },
        },
    ];

    const dictFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "category",
            title: "分类",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: !shouldLockDictCategory.value,
                allowSearch: true,
                disabled: shouldLockDictCategory.value,
                placeholder: "请选择分类",
                options: categorySelectOptions.value,
            },
            validate: [{ required: true, message: "请选择分类", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "name",
            title: "名称",
            type: "input",
            props: { allowClear: true, placeholder: "如 用户状态" },
            validate: [{ required: true, message: "请输入名称", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "value",
            title: "编码",
            type: "input",
            props: { allowClear: true, placeholder: "如 user_status" },
            validate: [{ required: true, message: "请输入编码", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "status",
            title: "状态",
            type: "switch",
            props: {
                checkedValue: DictStatus.ENABLE,
                uncheckedValue: DictStatus.DISABLE,
                checkedText: "启用",
                uncheckedText: "禁用",
            },
            col: { span: 24 },
        },
        {
            field: "sortOrder",
            title: "排序",
            type: "inputNumber",
            props: { precision: 0, class: "tw:w-full" },
            validate: [{ required: true, message: "请输入排序", trigger: "change" }],
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

    const itemFormRules = computed<FormCreateRule[]>(() => [
        {
            field: "dictId",
            title: "所属字典",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "请选择字典",
                options: dictSelectOptions.value,
            },
            validate: [{ required: true, message: "请选择字典", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "key",
            title: "键",
            type: "input",
            props: { allowClear: true, placeholder: "如 ENABLE" },
            validate: [{ required: true, message: "请输入键", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "value",
            title: "显示值",
            type: "input",
            props: { allowClear: true, placeholder: "如 启用" },
            validate: [{ required: true, message: "请输入显示值", trigger: "change" }],
            col: { span: 24 },
        },
        {
            field: "status",
            title: "状态",
            type: "switch",
            props: {
                checkedValue: DictStatus.ENABLE,
                uncheckedValue: DictStatus.DISABLE,
                checkedText: "启用",
                uncheckedText: "禁用",
            },
            col: { span: 24 },
        },
        {
            field: "sortOrder",
            title: "排序",
            type: "inputNumber",
            props: { precision: 0, class: "tw:w-full" },
            validate: [{ required: true, message: "请输入排序", trigger: "change" }],
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

    const dictSelectOptions = computed(() =>
        dictNavigationRecords.value.map((dict) => ({
            label: `${dict.name}（${dict.category}/${dict.value}）`,
            value: dict.id,
        })),
    );
    const dictModalTitle = computed(() =>
        dictModalMode.value === DictModalMode.CREATE ? "创建字典" : "编辑字典",
    );
    const itemModalTitle = computed(() =>
        itemModalMode.value === DictModalMode.CREATE ? "创建字典项" : "编辑字典项",
    );

    void initPage();

    /**
     * 保存字典表格 action 实例。
     */
    function setDictTableAction(action: ActionType) {
        dictTableAction.value = action;
    }

    /**
     * 保存字典项表格 action 实例。
     */
    function setItemTableAction(action: ActionType) {
        itemTableAction.value = action;
    }

    /**
     * 构造搜索表单按钮行为。
     */
    function buildSearchFormOptions(onSubmit: () => void, onReset: () => void): FormCreateOptions {
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

    /**
     * 分页加载当前分类下的字典主表。
     */
    async function getDictTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<DictRecord>> {
        const response = await queryDictList({
            ...buildCleanParams(dictSearchFormData.value),
            category: dictSearchFormData.value.category || selectedCategory.value,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        return {
            data: response.data.records,
            total: response.data.pagination.total,
            success: true,
        };
    }

    /**
     * 分页加载当前字典的字典项。
     */
    async function getItemTableData(
        params: GiTableRequestParams,
    ): Promise<RequestData<DictItemRecord>> {
        if (!selectedDict.value) {
            return { data: [], total: 0, success: true };
        }
        const response = await queryDictItemList({
            ...buildCleanParams(itemSearchFormData.value),
            dictId: selectedDict.value.id,
            page: Number(params.current ?? 1),
            pageSize: Number(params.pageSize ?? 10),
        });
        return {
            data: response.data.records,
            total: response.data.pagination.total,
            success: true,
        };
    }

    /**
     * 加载分类选项，供左侧导航和分类筛选 select 复用。
     */
    async function loadCategoryOptions() {
        const response = await queryDictCategoryOptions();
        categoryOptions.value = response.data;
    }

    /**
     * 通过分类选项和字典列表重建左侧导航树。
     */
    async function loadDictNavigation() {
        const records = await loadAllDictNavigationRecords(
            buildCleanParams(navigationSearchFormData.value),
        );
        dictNavigationRecords.value = records;
        dictNavigationNodes.value = toDictNavigationNodes(getNavigationCategoryOptions(), records);
    }

    /**
     * 分页拉取完整导航字典记录，避免字典超过单页上限后左侧树漏节点。
     */
    async function loadAllDictNavigationRecords(params: Record<string, unknown>) {
        const firstResponse = await queryDictList({
            ...params,
            page: 1,
            pageSize: MAX_OPTION_PAGE_SIZE,
        });
        const records = [...firstResponse.data.records];
        const totalPages = firstResponse.data.pagination.totalPages;

        for (let page = 2; page <= totalPages; page += 1) {
            // 字典数量超过单页上限时继续补齐，保证导航树数据完整。
            const response = await queryDictList({
                ...params,
                page,
                pageSize: MAX_OPTION_PAGE_SIZE,
            });
            records.push(...response.data.records);
        }

        return records;
    }

    /**
     * 加载当前字典的键选项，供字典项筛选下拉使用。
     */
    async function loadSelectedDictItemKeyOptions() {
        const dict = selectedDict.value;
        if (!dict) {
            itemKeyOptions.value = [];
            return;
        }

        const firstResponse = await queryDictItemList({
            dictId: dict.id,
            page: 1,
            pageSize: MAX_OPTION_PAGE_SIZE,
        });
        const records = [...firstResponse.data.records];
        const totalPages = firstResponse.data.pagination.totalPages;
        for (let page = 2; page <= totalPages; page += 1) {
            // 用户快速切换字典时，停止写入上次选中字典的键选项。
            if (selectedDict.value?.id !== dict.id) {
                return;
            }
            const response = await queryDictItemList({
                dictId: dict.id,
                page,
                pageSize: MAX_OPTION_PAGE_SIZE,
            });
            records.push(...response.data.records);
        }

        if (selectedDict.value?.id !== dict.id) {
            return;
        }
        const optionMap = new Map<string, { label: string; value: string }>();
        records.forEach((item) => {
            if (!optionMap.has(item.key)) {
                optionMap.set(item.key, {
                    label: `${item.key}（${item.value}）`,
                    value: item.key,
                });
            }
        });
        itemKeyOptions.value = [...optionMap.values()];
    }

    /**
     * 选中字典并只展示字典项管理页。
     */
    async function selectDict(dict: DictRecord) {
        setSelectedDictContext(dict);
        itemSearchFormData.value = createEmptyItemSearchForm();
        await loadSelectedDictItemKeyOptions();
        await nextTick();
        await refreshItemTable();
    }

    /**
     * 处理左侧导航选择。
     */
    async function handleNavigationSelect(
        _keys: Array<string | number>,
        data: { node?: TreeNodeData },
    ) {
        const node = data.node as unknown as DictNavigationNode | undefined;
        if (!node) {
            return;
        }
        if (node.nodeType === "dict" && node.dict) {
            await selectDict(node.dict);
            return;
        }
        if (node.nodeType === "category") {
            await selectCategory(node.title);
        }
    }

    /**
     * 打开新增分类弹窗。
     */
    function openCreateCategory() {
        categoryFormData.value = createEmptyCategoryForm();
        categoryModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(categoryFormApi.value));
    }

    /**
     * 打开创建字典弹窗，并优先沿用当前分类上下文。
     */
    function openCreateDict() {
        dictModalMode.value = DictModalMode.CREATE;
        dictFormData.value = createEmptyDictForm(selectedCategory.value);
        dictModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(dictFormApi.value));
    }

    /**
     * 打开编辑字典弹窗。
     */
    function openEditDict(record: DictRecord) {
        dictModalMode.value = DictModalMode.EDIT;
        dictFormData.value = cloneDeep(record);
        dictModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(dictFormApi.value));
    }

    /**
     * 打开创建字典项弹窗。
     */
    async function openCreateItem(dict?: DictRecord | null) {
        if (!dict) {
            Message.warning("请先选择一个字典");
            return;
        }
        setSelectedDictContext(dict);
        itemModalMode.value = DictModalMode.CREATE;
        itemFormData.value = createEmptyItemForm(dict.id);
        itemModalVisible.value = true;
        await loadSelectedDictItemKeyOptions();
        void nextTick(() => clearFormCreateValidate(itemFormApi.value));
    }

    /**
     * 打开编辑字典项弹窗。
     */
    function openEditItem(record: DictItemRecord) {
        itemModalMode.value = DictModalMode.EDIT;
        itemFormData.value = cloneDeep(record);
        itemModalVisible.value = true;
        void nextTick(() => clearFormCreateValidate(itemFormApi.value));
    }

    /**
     * 提交新增分类表单，调用后端分类接口真实落库。
     */
    async function submitCategoryForm() {
        if (!categoryFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }

        try {
            await categoryFormApi.value.validate();
            categorySubmitting.value = true;
            const response = await createDictCategory(categoryFormData.value);
            Message.success("分类已添加");
            await loadCategoryOptions();
            await loadDictNavigation();
            await selectCategory(response.data.name);
            resetCategoryForm();
            return true;
        } catch {
            return false;
        } finally {
            categorySubmitting.value = false;
        }
    }

    /**
     * 提交字典表单。
     */
    async function submitDictForm() {
        if (!dictFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }
        try {
            await dictFormApi.value.validate();
            dictSubmitting.value = true;
            const payload = toDictMutationPayload(dictFormData.value);
            const response =
                dictModalMode.value === DictModalMode.CREATE
                    ? await createDict(payload)
                    : await updateDict(payload);
            Message.success("字典已保存");
            await loadCategoryOptions();
            await loadDictNavigation();
            await selectDict(response.data);
            resetDictForm();
            return true;
        } catch {
            return false;
        } finally {
            dictSubmitting.value = false;
        }
    }

    /**
     * 提交字典项表单。
     */
    async function submitItemForm() {
        if (!itemFormApi.value) {
            Message.error("表单尚未初始化完成");
            return false;
        }
        try {
            await itemFormApi.value.validate();
            itemSubmitting.value = true;
            const payload = toDictItemMutationPayload(itemFormData.value);
            let savedItem: DictItemRecord;
            if (itemModalMode.value === DictModalMode.CREATE) {
                const response = await createDictItem(payload);
                savedItem = response.data;
            } else {
                const response = await updateDictItem(payload);
                savedItem = response.data;
            }
            Message.success("字典项已保存");
            await loadDictNavigation();
            syncSelectedDictById(savedItem.dictId);
            await loadSelectedDictItemKeyOptions();
            await nextTick();
            await refreshItemTable();
            resetItemForm();
            return true;
        } catch {
            return false;
        } finally {
            itemSubmitting.value = false;
        }
    }

    /**
     * 更新字典状态，并级联同步字典项状态。
     */
    async function changeDictStatus(record: DictRecord, status: string | number | boolean) {
        dictStatusUpdatingIds.value = new Set([...dictStatusUpdatingIds.value, record.id]);
        try {
            await updateDictStatus({ id: record.id, status: Number(status), cascadeItems: true });
            Message.success("状态已更新");
            await reloadAll();
            return true;
        } catch {
            return false;
        } finally {
            const nextIds = new Set(dictStatusUpdatingIds.value);
            nextIds.delete(record.id);
            dictStatusUpdatingIds.value = nextIds;
        }
    }

    /**
     * 更新字典项状态。
     */
    async function changeItemStatus(record: DictItemRecord, status: string | number | boolean) {
        itemStatusUpdatingIds.value = new Set([...itemStatusUpdatingIds.value, record.id]);
        try {
            await updateDictItemStatus({ id: record.id, status: Number(status) });
            Message.success("状态已更新");
            await reloadAll();
            return true;
        } catch {
            return false;
        } finally {
            const nextIds = new Set(itemStatusUpdatingIds.value);
            nextIds.delete(record.id);
            itemStatusUpdatingIds.value = nextIds;
        }
    }

    /**
     * 删除字典主记录。
     */
    async function removeDict(record: DictRecord) {
        await deleteDict(record.id);
        Message.success("字典已删除");
        if (selectedDict.value?.id === record.id) {
            await selectCategory(record.category);
        }
        await reloadAll();
    }

    /**
     * 删除当前空分类，并清空右侧分类上下文。
     */
    async function removeCategory() {
        if (!selectedCategory.value) {
            Message.warning("请先选择一个分类");
            return;
        }

        const category = selectedCategory.value;
        categoryDeleting.value = true;
        try {
            await deleteDictCategory(category);
            Message.success("分类已删除");
            selectedCategory.value = "";
            selectedDict.value = null;
            navigationSelectedKeys.value = [];
            itemKeyOptions.value = [];
            dictSearchFormData.value = createEmptyDictSearchForm();
            if (navigationSearchFormData.value.category === category) {
                // 删除当前筛选分类后清空左侧筛选，避免导航仍停留在空结果。
                navigationSearchFormData.value.category = "";
            }
            await loadCategoryOptions();
            await loadDictNavigation();
        } finally {
            categoryDeleting.value = false;
        }
    }

    /**
     * 删除字典项。
     */
    async function removeItem(record: DictItemRecord) {
        await deleteDictItem(record.id);
        Message.success("字典项已删除");
        await reloadAll();
    }

    /**
     * 刷新全部字典相关视图。
     */
    async function reloadAll() {
        if (reloadAllLoading.value) {
            return;
        }

        reloadAllLoading.value = true;
        try {
            await loadCategoryOptions();
            await loadDictNavigation();
            syncSelectedDictById(selectedDict.value?.id);
            await nextTick();
            if (rightView.value === "category") {
                refreshDictTable();
                return;
            }
            if (rightView.value === "dict") {
                await loadSelectedDictItemKeyOptions();
                await refreshItemTable();
            }
        } finally {
            reloadAllLoading.value = false;
        }
    }

    /**
     * 提交分类边界页搜索；分类变化时同步左侧导航选择。
     */
    async function submitDictSearch() {
        const category = dictSearchFormData.value.category;
        if (category && category !== selectedCategory.value) {
            await selectCategory(category);
            return;
        }
        refreshDictTable();
    }

    /**
     * 刷新字典表格并回到第一页。
     */
    function refreshDictTable() {
        dictTableAction.value?.setPageInfo?.({ current: 1 });
        void dictTableAction.value?.reload();
    }

    /**
     * 刷新字典项表格并回到第一页。
     */
    async function refreshItemTable() {
        itemTableAction.value?.setPageInfo?.({ current: 1 });
        await itemTableAction.value?.reload();
    }

    /**
     * 重置左侧导航搜索条件。
     */
    function resetNavigationSearch() {
        navigationSearchFormData.value = createEmptyNavigationSearchForm();
        void loadDictNavigation();
    }

    /**
     * 重置分类边界页搜索条件。
     */
    function resetDictSearch() {
        dictSearchFormData.value = createEmptyDictSearchForm(selectedCategory.value);
        refreshDictTable();
    }

    /**
     * 重置字典项搜索条件。
     */
    function resetItemSearch() {
        itemSearchFormData.value = createEmptyItemSearchForm();
        void refreshItemTable();
    }

    /**
     * 关闭新增分类弹窗时重置表单。
     */
    function resetCategoryForm() {
        categoryFormData.value = createEmptyCategoryForm();
        clearFormCreateValidate(categoryFormApi.value);
    }

    /**
     * 关闭字典弹窗时重置表单。
     */
    function resetDictForm() {
        dictFormData.value = createEmptyDictForm();
        clearFormCreateValidate(dictFormApi.value);
    }

    /**
     * 关闭字典项弹窗时重置表单。
     */
    function resetItemForm() {
        itemFormData.value = createEmptyItemForm(selectedDict.value?.id);
        clearFormCreateValidate(itemFormApi.value);
    }

    /**
     * 创建空导航搜索表单。
     */
    function createEmptyNavigationSearchForm() {
        return {
            category: "",
            keyword: "",
        };
    }

    /**
     * 创建空分类边界搜索表单。
     */
    function createEmptyDictSearchForm(category = "") {
        return {
            category,
            name: "",
            value: "",
            keyword: "",
            status: undefined as number | undefined,
        };
    }

    /**
     * 创建空字典项搜索表单。
     */
    function createEmptyItemSearchForm() {
        return {
            key: "",
            value: "",
            keyword: "",
            status: undefined as number | undefined,
        };
    }

    /**
     * 创建空分类表单。
     */
    function createEmptyCategoryForm(): DictCategoryForm {
        return {
            name: "",
        };
    }

    /**
     * 创建空字典表单。
     */
    function createEmptyDictForm(category = ""): DictForm {
        return {
            category,
            name: "",
            value: "",
            description: null,
            status: DictStatus.ENABLE,
            sortOrder: 0,
        };
    }

    /**
     * 创建空字典项表单。
     */
    function createEmptyItemForm(dictId?: number): DictItemForm {
        return {
            dictId,
            key: "",
            value: "",
            description: null,
            status: DictStatus.ENABLE,
            sortOrder: 0,
        };
    }

    /**
     * 提取字典主表可提交字段，避免把表格记录中的展示字段发送给后端。
     */
    function toDictMutationPayload(data: DictForm): DictForm {
        return {
            ...(data.id !== undefined ? { id: data.id } : {}),
            category: data.category,
            name: data.name,
            value: data.value,
            description:
                data.description === "" || data.description === undefined ? null : data.description,
            status: data.status,
            sortOrder: data.sortOrder,
        };
    }

    /**
     * 提取字典项可提交字段，避免把关联对象和时间字段发送给后端。
     */
    function toDictItemMutationPayload(data: DictItemForm): DictItemForm {
        return {
            ...(data.id !== undefined ? { id: data.id } : {}),
            dictId: data.dictId,
            key: data.key,
            value: data.value,
            description:
                data.description === "" || data.description === undefined ? null : data.description,
            status: data.status,
            sortOrder: data.sortOrder,
        };
    }

    /**
     * 依据导航筛选条件返回应展示的分类选项。
     */
    function getNavigationCategoryOptions() {
        const { category, keyword } = navigationSearchFormData.value;
        return categoryOptions.value.filter((option) => {
            const hitCategory = !category || option.value === category;
            const hitKeyword = !keyword || option.value.includes(keyword);
            return hitCategory && hitKeyword;
        });
    }

    /**
     * 把分类选项和字典列表转换成左侧分类导航节点。
     */
    function toDictNavigationNodes(
        categories: DictCategoryOption[],
        records: DictRecord[],
    ): DictNavigationNode[] {
        const categoryMap = new Map<string, { count: number; dicts: DictRecord[] }>();

        categories.forEach((category) => {
            categoryMap.set(category.value, {
                count: category.count,
                dicts: [],
            });
        });
        records.forEach((record) => {
            const category = categoryMap.get(record.category) ?? { count: 0, dicts: [] };
            category.dicts.push(record);
            categoryMap.set(record.category, category);
        });

        return [...categoryMap.entries()].map(([category, info]) => ({
            key: `category-${category}`,
            title: category,
            nodeType: "category",
            count: info.dicts.length || info.count,
            children: info.dicts.map((dict) => ({
                key: `dict-${dict.id}`,
                title: `${dict.name}（${dict.value}）`,
                nodeType: "dict",
                status: dict.status,
                count: dict.itemCount ?? 0,
                dict,
            })),
        }));
    }

    /**
     * 设置当前字典上下文，并同步左侧树的选中状态。
     */
    function setSelectedDictContext(dict: DictRecord | null) {
        selectedDict.value = dict;
        selectedCategory.value = dict?.category ?? selectedCategory.value;
        if (!dict) {
            itemKeyOptions.value = [];
        }
        navigationSelectedKeys.value = dict ? [`dict-${dict.id}`] : [];
    }

    /**
     * 设置当前分类上下文，并同步分类边界搜索条件。
     */
    async function selectCategory(category: string) {
        selectedDict.value = null;
        selectedCategory.value = category;
        itemKeyOptions.value = [];
        navigationSelectedKeys.value = [`category-${category}`];
        dictSearchFormData.value = createEmptyDictSearchForm(category);
        await nextTick();
        refreshDictTable();
    }

    /**
     * 根据最新导航数据修正当前选中字典，避免刷新后右侧展示过期记录。
     */
    function syncSelectedDictById(dictId?: number) {
        if (!dictId) {
            return;
        }
        const latestDict = dictNavigationRecords.value.find((dict) => dict.id === dictId);
        if (latestDict) {
            setSelectedDictContext(latestDict);
            return;
        }
        setSelectedDictContext(null);
    }

    /**
     * 删除空查询字段，避免后端收到无意义空字符串。
     */
    function buildCleanParams(data: Record<string, unknown>) {
        return Object.fromEntries(
            Object.entries(data).filter(
                ([, value]) => value !== "" && value !== null && value !== undefined,
            ),
        );
    }

    /**
     * 返回状态显示文本。
     */
    function getStatusLabel(status?: number | null) {
        return (
            statusOptions.value.find((item) => item.value === status)?.label ??
            String(status ?? "-")
        );
    }

    /**
     * 返回状态标签颜色。
     */
    function getStatusColor(status?: number | null) {
        return status === DictStatus.ENABLE ? "arcoblue" : "red";
    }

    /**
     * 初始化页面依赖数据。
     */
    async function initPage() {
        const response = await getDictStatusOptions();
        statusOptions.value = response.data;
        await loadCategoryOptions();
        await loadDictNavigation();
    }
</script>

<style scoped lang="scss">
    .dict-left {
        height: 100%;
        min-height: 0;
    }

    .dict-left__header {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
    }
</style>
