<!--
  Modified from lin-97/gi-demo src/components/GiTable/GiTable.vue (Apache-2.0).
  Changes: aligned with ShiroAdmin request/actionRef table contract and removed vue-draggable-plus.
-->
<template>
    <div class="gi-table" :class="{ 'gi-table--fullscreen': isFullscreen }">
        <div v-if="$slots['form-search']" class="gi-table__search">
            <slot name="form-search" />
        </div>

        <a-row justify="space-between" align="center" class="gi-table__toolbar">
            <a-space wrap>
                <slot name="custom-title">
                    <div v-if="tableTitle" class="gi-table__title">
                        {{ tableTitle }}
                    </div>
                </slot>
            </a-space>

            <a-space v-if="showToolbar" wrap>
                <slot name="custom-extra" />

                <a-tooltip v-if="showStripeToggle" content="斑马纹">
                    <a-switch v-model="stripe" size="small" type="round" />
                </a-tooltip>

                <a-tooltip v-if="showReloadButton" content="刷新">
                    <a-button size="mini" class="gi-table__tool-button" :loading="refreshButtonLoading"
                        @click="handleRefresh">
                        <template #icon>
                            <icon-refresh :size="18" />
                        </template>
                    </a-button>
                </a-tooltip>

                <a-tooltip v-if="showFullscreenButton" content="全屏">
                    <a-button size="mini" class="gi-table__tool-button" @click="toggleFullscreen">
                        <template #icon>
                            <icon-fullscreen v-if="!isFullscreen" :size="18" />
                            <icon-fullscreen-exit v-else :size="18" />
                        </template>
                    </a-button>
                </a-tooltip>

                <a-tooltip v-if="showBorderButton" content="显示边框">
                    <a-button size="mini" class="gi-table__tool-button" @click="toggleBorder">
                        <template #icon>
                            <icon-interaction :size="18" />
                        </template>
                    </a-button>
                </a-tooltip>

                <a-dropdown v-if="showDensityButton" @select="handleSizeChange">
                    <a-tooltip content="表格尺寸">
                        <a-button size="mini" class="gi-table__tool-button">
                            <template #icon>
                                <icon-zoom-in :size="18" />
                            </template>
                        </a-button>
                    </a-tooltip>
                    <template #content>
                        <a-doption v-for="item in TABLE_SIZE_OPTIONS" :key="item.value" :value="item.value"
                            :active="item.value === size">
                            {{ item.label }}
                        </a-doption>
                    </template>
                </a-dropdown>

                <a-popover v-if="showSettingColumnBtn" trigger="click" position="br"
                    :content-style="{ minWidth: '190px', padding: '6px 8px 10px' }">
                    <a-button size="mini" class="gi-table__tool-button">
                        <template #icon>
                            <icon-settings :size="18" />
                        </template>
                    </a-button>
                    <template #content>
                        <div class="gi-table__draggable">
                            <div v-for="item in currentSettingColumns" :key="item.key" class="gi-table__draggable-item"
                                :class="{ 'is-disabled': item.disabled }" :draggable="isColumnDraggable(item)"
                                @dragstart="handleColumnDragStart(item)" @dragover.prevent
                                @drop="handleColumnDrop(item)">
                                <div class="gi-table__draggable-item-move">
                                    <icon-drag-dot-vertical />
                                </div>
                                <div class="gi-table__draggable-item-check">
                                    <a-checkbox :model-value="item.show" :disabled="item.disabled"
                                        @change="setColumnShow(item.key, Boolean($event))">
                                        {{ item.title }}
                                    </a-checkbox>
                                </div>
                                <div class="gi-table__draggable-item-fixed">
                                    <span class="gi-table__pin-btn" :class="{ 'is-active': item.fixedLeft }"
                                        @click.stop="toggleFixedLeft(item.key)">
                                        <icon-pushpin />
                                    </span>
                                    <span class="gi-table__pin-btn gi-table__pin-btn--right"
                                        :class="{ 'is-active': item.fixedRight }"
                                        @click.stop="toggleFixedRight(item.key)">
                                        <icon-pushpin />
                                    </span>
                                </div>
                            </div>
                        </div>
                        <a-divider :margin="6" />
                        <a-row justify="center">
                            <a-button type="primary" size="mini" long @click="resetSettingColumns">
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                <template #default>重置</template>
                            </a-button>
                        </a-row>
                    </template>
                </a-popover>
            </a-space>
        </a-row>

        <div class="gi-table__container">
            <a-table ref="tableRef" v-bind="tableProps" v-model:selected-keys="innerSelectedKeys"
                v-model:expanded-keys="innerExpandedKeys" :stripe="stripe" :size="size" :bordered="computedBordered"
                :loading="computedLoading" :pagination="computedPagination" :columns="visibleColumns" :data="tableData"
                @page-change="handlePageChange" @page-size-change="handlePageSizeChange" @select="handleSelect"
                @select-all="handleSelectAll">
                <template v-for="key in tableSlotKeys" :key="key" #[key]="scope">
                    <slot :name="key" v-bind="scope" />
                </template>
            </a-table>
        </div>
    </div>
</template>

<script setup lang="ts" generic="T extends TableData">
import type {
    DropdownInstance,
    TableColumnData,
    TableData,
    TableInstance,
} from "@arco-design/web-vue";
import type {
    ActionType,
    GiTableOptions,
    GiTableProps,
    GiTableRequestParams,
    GiTableRowKey,
    PageInfo,
    ProColumns,
    RequestData,
    TableSettingColumnItem,
} from "./type";
import { computed, onMounted, ref, useAttrs, useSlots, watch } from "vue";

defineOptions({ name: "GiTable" });

const props = withDefaults(defineProps<GiTableProps<T>>(), {
    title: "",
    headerTitle: "",
    size: "medium",
    disabledColumnKeys: () => [],
    data: () => [],
    options: () => ({
        reload: true,
        density: true,
        setting: true,
        fullScreen: true,
        border: true,
        stripe: true,
    }),
});

const emit = defineEmits<{
    (event: "refresh"): void;
    (event: "load", data: RequestData<T>): void;
    (event: "page-change", current: number): void;
    (event: "page-size-change", pageSize: number): void;
    (event: "selection-change", selectedKeys: GiTableRowKey[]): void;
    (event: "update:selectedKeys", selectedKeys: GiTableRowKey[]): void;
    (event: "update:expandedKeys", expandedKeys: GiTableRowKey[]): void;
}>();

defineSlots<{
    "th": (props: { column: TableColumnData }) => void;
    "thead": () => void;
    "empty": (props: { column: TableColumnData }) => void;
    "summary-cell": (props: { column: TableColumnData; record: T; rowIndex: number }) => void;
    "pagination-right": () => void;
    "pagination-left": () => void;
    "td": (props: { column: TableColumnData; record: T; rowIndex: number }) => void;
    "tr": (props: { record: T; rowIndex: number }) => void;
    "tbody": () => void;
    "drag-handle-icon": () => void;
    "footer": () => void;
    "expand-row": (props: { record: T }) => void;
    "expand-icon": (props: { record: T; expanded?: boolean }) => void;
    "columns": () => void;
    "custom-title": () => void;
    "custom-extra": () => void;
    "form-search": () => void;
    [propsName: string]: (props: {
        key: string;
        record: T;
        column: TableColumnData;
        rowIndex: number;
    }) => void;
}>();

const attrs = useAttrs();
const slots = useSlots();
const tableRef = ref<TableInstance>();
const requestLoading = ref(false);
const internalData = ref<T[]>([]);
const stripe = ref(Boolean(props.stripe ?? true));
const size = ref<TableInstance["$props"]["size"]>(props.size ?? "medium");
const isBordered = ref(Boolean(props.bordered ?? true));
const isFullscreen = ref(false);
const settingColumnList = ref<TableSettingColumnItem[]>([]);
const draggingColumnKey = ref<string | null>(null);
const innerSelectedKeys = ref<GiTableRowKey[]>(props.selectedKeys ?? []);
const innerExpandedKeys = ref<GiTableRowKey[]>(props.expandedKeys ?? []);

const TABLE_SIZE_OPTIONS = [
    { label: "迷你", value: "mini" },
    { label: "小型", value: "small" },
    { label: "中等", value: "medium" },
    { label: "大型", value: "large" },
] as const;

const DEFAULT_GI_TABLE_OPTIONS: GiTableOptions = {
    reload: true,
    density: true,
    setting: true,
    fullScreen: true,
    border: true,
    stripe: true,
};

const pageInfo = ref<PageInfo>({
    current: getInitialCurrentPage(),
    pageSize: getInitialPageSize(),
    total: getInitialTotal(),
});

const tableTitle = computed(() => props.headerTitle || props.title);
const tableData = computed(() => (props.request ? internalData.value : (props.data ?? [])));
const computedLoading = computed(() => props.loading ?? requestLoading.value);
const refreshButtonLoading = computed(() => Boolean(computedLoading.value));
const computedBordered = computed(() => ({ cell: isBordered.value }));
const showToolbar = computed(() => props.options !== false);
// 合并 GiTable 默认工具栏配置，避免传入局部 options 时误关列设置能力。
const normalizedOptions = computed<GiTableOptions>(() => {
    if (props.options === false) {
        return {};
    }

    return {
        ...DEFAULT_GI_TABLE_OPTIONS,
        ...(typeof props.options === "object" && props.options ? props.options : {}),
    };
});
const showReloadButton = computed(() => normalizedOptions.value.reload !== false);
const showDensityButton = computed(() => normalizedOptions.value.density !== false);
const showFullscreenButton = computed(() => normalizedOptions.value.fullScreen !== false);
const showBorderButton = computed(() => normalizedOptions.value.border !== false);
const showStripeToggle = computed(() => normalizedOptions.value.stripe !== false);
const showSettingColumnBtn = computed(() => {
    const setting = normalizedOptions.value.setting;
    return Boolean(setting && props.columns?.some((column) => !column.hideInTable));
});
const tableSlotKeys = computed(() =>
    Object.keys(slots).filter(
        (key) => !["custom-title", "custom-extra", "form-search"].includes(key),
    ),
);

const tableProps = computed(() => {
    const {
        title,
        headerTitle,
        request,
        actionRef,
        columns,
        data,
        selectedKeys,
        expandedKeys,
        disabledColumnKeys,
        columnsState,
        options,
        search,
        pagination,
        loading,
        bordered,
        ...restProps
    } = props;

    return {
        ...attrs,
        ...restProps,
    };
});

const computedPagination = computed(() => {
    if (props.pagination === false) {
        return false;
    }

    const paginationProps =
        typeof props.pagination === "object" && props.pagination ? props.pagination : {};

    return {
        showTotal: true,
        showPageSize: true,
        showJumper: true,
        showSizeChanger: true,
        ...paginationProps,
        current: pageInfo.value.current,
        pageSize: pageInfo.value.pageSize,
        total: pageInfo.value.total ?? paginationProps.total,
        size: size.value,
    };
});

const initialSettingColumns = computed<TableSettingColumnItem[]>(() => {
    const columns = props.columns ?? [];
    return columns
        .filter((column) => !column.hideInTable)
        .map((column, index) => {
            const key = getColumnKey(column, index);
            const fixed = column.fixed;
            return {
                key,
                title: getColumnTitle(column),
                show: true,
                disabled:
                    props.disabledColumnKeys.includes(key) ||
                    Boolean(column.hideInSetting || column.disable),
                fixedLeft: fixed === "left",
                fixedRight: fixed === "right",
            };
        });
});

const currentSettingColumns = computed(() => {
    const isValid = isColumnStructureMatch(
        settingColumnList.value,
        initialSettingColumns.value,
    );
    return isValid ? settingColumnList.value : initialSettingColumns.value;
});

const columnMap = computed(() => {
    const columns = props.columns ?? [];
    return new Map(
        columns
            .filter((column) => !column.hideInTable)
            .map((column, index) => [getColumnKey(column, index), column]),
    );
});

const visibleColumns = computed(() => {
    const shownColumns = currentSettingColumns.value.filter((item) => item.show);
    const leftFixed = shownColumns.filter((item) => item.fixedLeft);
    const rightFixed = shownColumns.filter((item) => item.fixedRight);
    const noFixed = shownColumns.filter((item) => !item.fixedLeft && !item.fixedRight);

    return [...leftFixed, ...noFixed, ...rightFixed]
        .map((item) => {
            const column = columnMap.value.get(item.key);
            if (!column) {
                return null;
            }

            return normalizeColumn(column, item);
        })
        .filter(Boolean) as TableColumnData[];
});

const action: ActionType = {
    pageInfo,
    reload,
    reloadAndRest,
    reset,
    clearSelected,
    getSelected,
    fullScreen: toggleFullscreen,
    setPageInfo,
    getPopupContainer,
};

// 获取初始页码，让外部传入的分页配置能延续 ProTable 的默认行为。
function getInitialCurrentPage() {
    if (typeof props.pagination !== "object" || !props.pagination) {
        return 1;
    }

    return Number(props.pagination.current ?? props.pagination.defaultCurrent ?? 1);
}

// 获取初始分页大小，用于 request 首次请求和分页切换。
function getInitialPageSize() {
    if (typeof props.pagination !== "object" || !props.pagination) {
        return 10;
    }

    return Number(props.pagination.pageSize ?? props.pagination.defaultPageSize ?? 10);
}

// 获取初始总数，静态表格和服务端表格都可以共享分页状态。
function getInitialTotal() {
    if (typeof props.pagination !== "object" || !props.pagination) {
        return undefined;
    }

    return props.pagination.total;
}

// 根据列配置生成稳定 key，避免列设置在刷新后错位。
function getColumnKey(column: ProColumns, index?: number) {
    if (column.key) {
        return String(column.key);
    }

    if (column.dataIndex) {
        return String(column.dataIndex);
    }

    if (typeof column.title === "string" && column.title) {
        return column.title;
    }

    return `__column_${index ?? 0}__`;
}

// 提取列标题文本，列设置面板只展示可读字符串。
function getColumnTitle(column: ProColumns) {
    if (typeof column.title === "string") {
        return column.title;
    }

    return column.dataIndex || column.key || "未命名列";
}

// 判断持久化列设置是否还匹配当前列结构。
function isColumnStructureMatch(
    userColumns: TableSettingColumnItem[],
    initialColumns: TableSettingColumnItem[],
) {
    if (userColumns.length === 0 || userColumns.length !== initialColumns.length) {
        return false;
    }

    const initialKeys = new Set(initialColumns.map((item) => item.key));
    const userKeys = new Set(userColumns.map((item) => item.key));
    return (
        initialKeys.size === userKeys.size && [...initialKeys].every((key) => userKeys.has(key))
    );
}

// 获取列设置的浏览器存储对象。
function getColumnStorage() {
    if (!props.columnsState?.persistenceKey || typeof window === "undefined") {
        return undefined;
    }

    return props.columnsState.persistenceType === "sessionStorage"
        ? window.sessionStorage
        : window.localStorage;
}

// 读取持久化列设置，结构不匹配时回到当前列定义。
function readPersistedSettingColumns() {
    const storage = getColumnStorage();
    const key = props.columnsState?.persistenceKey;
    if (!storage || !key) {
        return undefined;
    }

    const rawValue = storage.getItem(key);
    if (!rawValue) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(rawValue) as TableSettingColumnItem[];
        return Array.isArray(parsed) ? parsed : undefined;
    } catch {
        storage.removeItem(key);
        return undefined;
    }
}

// 保存列设置，供用户下次打开页面继续使用。
function persistSettingColumns(columns: TableSettingColumnItem[]) {
    const storage = getColumnStorage();
    const key = props.columnsState?.persistenceKey;
    if (!storage || !key || !columns.length) {
        return;
    }

    storage.setItem(key, JSON.stringify(columns));
}

// 初始化或修复列设置状态。
function syncSettingColumns() {
    const persistedColumns = readPersistedSettingColumns();
    const nextColumns =
        persistedColumns &&
            isColumnStructureMatch(persistedColumns, initialSettingColumns.value)
            ? persistedColumns
            : initialSettingColumns.value;

    settingColumnList.value = nextColumns.map((item) => ({ ...item }));
}

// 将 ProColumns 的扩展字段剥离为 Arco Table 可消费的列配置。
function normalizeColumn(column: ProColumns, setting: TableSettingColumnItem) {
    const {
        order,
        valueType,
        hideInSearch,
        hideInTable,
        hideInForm,
        hideInSetting,
        disable,
        copyable,
        formSlotName,
        formItemProps,
        fieldProps,
        girdItemProps,
        defaultValue,
        valueEnum,
        renderFormItem,
        renderText,
        filters,
        onFilter,
        defaultFilteredValue,
        defaultSortOrder,
        ...restColumn
    } = column;

    const fixed = setting.fixedRight ? "right" : setting.fixedLeft ? "left" : undefined;
    return {
        ...restColumn,
        fixed,
    } as TableColumnData;
}

// 触发表格请求，并把 RequestData 映射为 Arco Table 数据和分页总数。
async function loadTableData() {
    if (!props.request) {
        internalData.value = props.data ?? [];
        return;
    }

    requestLoading.value = true;
    try {
        const requestParams = buildRequestParams();
        const response = await props.request(requestParams);
        if (response.success !== false) {
            internalData.value = response.data;
            pageInfo.value.total = response.total ?? response.data.length;
        }
        emit("load", response);
    } finally {
        requestLoading.value = false;
    }
}

// 构造 GiTable request 使用的分页参数。
function buildRequestParams(): GiTableRequestParams {
    if (props.pagination === false) {
        return {};
    }

    return {
        current: pageInfo.value.current,
        pageSize: pageInfo.value.pageSize,
    };
}

// 供外部 actionRef 调用的刷新方法。
async function reload(resetPageIndex = false) {
    if (resetPageIndex) {
        pageInfo.value.current = 1;
    }

    await loadTableData();
}

// 刷新并回到第一页，同时清空选择状态。
async function reloadAndRest() {
    clearSelected();
    pageInfo.value.current = 1;
    await loadTableData();
}

// 重置表格分页和选择状态。
function reset() {
    pageInfo.value.current = getInitialCurrentPage();
    pageInfo.value.pageSize = getInitialPageSize();
    clearSelected();
}

// 清空选中行并同步 v-model:selectedKeys。
function clearSelected() {
    innerSelectedKeys.value = [];
    emit("update:selectedKeys", []);
    emit("selection-change", []);
}

// 从行数据中解析 rowKey，支持字符串 rowKey 和函数 rowKey 两种写法。
function resolveRecordKey(record: TableData) {
    const rowKey = props.rowKey as unknown as
        | string
        | ((record: TableData) => GiTableRowKey)
        | undefined;
    if (typeof rowKey === "function") {
        return rowKey(record);
    }

    return rowKey ? record[rowKey as string] : record.key;
}

// 返回当前选中的 key 与行数据，供 actionRef.getSelected 调用。
function getSelected() {
    const selectedKeySet = new Set(innerSelectedKeys.value);
    const selectedRows = tableData.value.filter((record) => {
        const key = resolveRecordKey(record);
        return selectedKeySet.has(key);
    });

    return {
        selectedKeys: innerSelectedKeys.value,
        selectedRows,
    };
}

// 设置分页信息，供外部刷新前调整页码。
function setPageInfo(page: Partial<PageInfo>) {
    pageInfo.value = {
        ...pageInfo.value,
        ...page,
    };
}

// 同步外部受控分页配置，支持静态数据表格使用父组件维护的 current/pageSize/total。
function syncPaginationFromProps() {
    if (typeof props.pagination !== "object" || !props.pagination) {
        return;
    }

    pageInfo.value = {
        current: Number(props.pagination.current ?? pageInfo.value.current),
        pageSize: Number(props.pagination.pageSize ?? pageInfo.value.pageSize),
        total: props.pagination.total ?? pageInfo.value.total,
    };
}

// 返回弹层挂载容器，保持 action API 完整。
function getPopupContainer() {
    return tableRef.value?.$el as HTMLElement | undefined;
}

// 处理表格尺寸变更。
const handleSizeChange: DropdownInstance["onSelect"] = (value) => {
    if (value) {
        size.value = value as TableInstance["$props"]["size"];
    }
};

// 处理工具栏刷新按钮点击。
function handleRefresh() {
    emit("refresh");
    void reload();
}

// 切换全屏状态。
function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
}

// 切换表格单元格边框。
function toggleBorder() {
    isBordered.value = !isBordered.value;
}

// 根据列设置决定当前项是否允许拖拽。
function isColumnDraggable(item: TableSettingColumnItem) {
    const setting = normalizedOptions.value.setting;
    if (typeof setting === "object" && setting.draggable === false) {
        return false;
    }

    return !item.disabled;
}

// 开始拖拽列设置项。
function handleColumnDragStart(item: TableSettingColumnItem) {
    if (!isColumnDraggable(item)) {
        return;
    }

    draggingColumnKey.value = item.key;
}

// 完成列拖拽排序。
function handleColumnDrop(target: TableSettingColumnItem) {
    const sourceKey = draggingColumnKey.value;
    draggingColumnKey.value = null;
    if (!sourceKey || sourceKey === target.key || target.disabled) {
        return;
    }

    const nextColumns = currentSettingColumns.value.map((item) => ({ ...item }));
    const sourceIndex = nextColumns.findIndex((item) => item.key === sourceKey);
    const targetIndex = nextColumns.findIndex((item) => item.key === target.key);
    if (sourceIndex < 0 || targetIndex < 0) {
        return;
    }

    const [sourceColumn] = nextColumns.splice(sourceIndex, 1);
    nextColumns.splice(targetIndex, 0, sourceColumn);
    settingColumnList.value = nextColumns;
}

// 切换列显示状态。
function setColumnShow(key: string, show: boolean) {
    settingColumnList.value = currentSettingColumns.value.map((item) =>
        item.key === key && !item.disabled ? { ...item, show } : { ...item },
    );
}

// 重置列设置为当前列定义。
function resetSettingColumns() {
    settingColumnList.value = initialSettingColumns.value.map((item) => ({ ...item }));
}

// 切换列固定到左侧。
function toggleFixedLeft(key: string) {
    settingColumnList.value = currentSettingColumns.value.map((item) =>
        item.key === key
            ? { ...item, fixedLeft: !item.fixedLeft, fixedRight: false }
            : { ...item },
    );
}

// 切换列固定到右侧。
function toggleFixedRight(key: string) {
    settingColumnList.value = currentSettingColumns.value.map((item) =>
        item.key === key
            ? { ...item, fixedRight: !item.fixedRight, fixedLeft: false }
            : { ...item },
    );
}

// 处理页码变化并重新请求表格数据。
function handlePageChange(current: number) {
    pageInfo.value.current = current;
    emit("page-change", current);
    void reload();
}

// 处理每页条数变化并重新请求表格数据。
function handlePageSizeChange(pageSize: number) {
    pageInfo.value.pageSize = pageSize;
    pageInfo.value.current = 1;
    emit("page-size-change", pageSize);
    void reload();
}

// 同步单行选择变化。
function handleSelect(rowKeys: GiTableRowKey[]) {
    innerSelectedKeys.value = rowKeys;
    emit("update:selectedKeys", rowKeys);
    emit("selection-change", rowKeys);
}

// 同步全选变化。
function handleSelectAll(checked: boolean) {
    const rowSelection = props.rowSelection;
    if (!rowSelection) {
        return;
    }

    if (!checked) {
        clearSelected();
        return;
    }

    const selectedKeys = tableData.value
        .filter((record) => !(record.disabled ?? false))
        .map((record) => resolveRecordKey(record))
        .filter(
            (key): key is GiTableRowKey => typeof key === "string" || typeof key === "number",
        );

    innerSelectedKeys.value = selectedKeys;
    emit("update:selectedKeys", selectedKeys);
    emit("selection-change", selectedKeys);
}

watch(
    () => props.selectedKeys,
    (selectedKeys) => {
        innerSelectedKeys.value = selectedKeys ?? [];
    },
);

watch(
    () => props.expandedKeys,
    (expandedKeys) => {
        innerExpandedKeys.value = expandedKeys ?? [];
    },
);

watch(
    () => props.pagination,
    () => {
        syncPaginationFromProps();
    },
    { deep: true },
);

watch(
    innerExpandedKeys,
    (expandedKeys) => {
        emit("update:expandedKeys", expandedKeys);
    },
    { deep: true },
);

watch(
    () => props.data,
    (data) => {
        if (!props.request) {
            internalData.value = data ?? [];
            pageInfo.value.total = data?.length;
        }
    },
    { immediate: true },
);

watch(
    initialSettingColumns,
    () => {
        syncSettingColumns();
    },
    { immediate: true, deep: true },
);

watch(
    settingColumnList,
    (columns) => {
        persistSettingColumns(columns);
    },
    { deep: true },
);

onMounted(() => {
    props.actionRef?.(action);
    if (props.request) {
        void loadTableData();
    }
});

defineExpose({
    tableRef,
    action,
});
</script>

<style lang="scss" scoped>
.gi-table {
     
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    background: var(--color-bg-2);

    &--fullscreen {
        position: fixed;
        inset: 0;
        z-index: 1001;
        padding: 16px;
    }

    &__search {
        flex: none;
        margin-bottom: 12px;
    }

    &__toolbar {
        flex: none;
        gap: 8px;
        margin-bottom: 12px;
    }

    &__container {
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    &__title {
        font-size: var(--font-size-body-3);
        font-weight: 600;
        line-height: 1.5;
        color: var(--color-text-2);
    }

    &__tool-button {
        background-color: transparent;
        border: 0 !important;

        &:hover {
            background: var(--color-secondary-hover) !important;
        }

        &:active {
            background: var(--color-secondary-active) !important;
        }
    }

    &__draggable {
        box-sizing: border-box;
        max-height: 250px;
        padding: 1px 0;
        overflow: hidden auto;
    }

    &__draggable-item {
        display: flex;
        align-items: center;
        cursor: pointer;

        &:hover {
            background-color: var(--color-fill-2);
        }

        &.is-disabled {
            cursor: default;
        }

        &-move {
            padding: 0 2px;
            color: var(--color-text-3);
            cursor: move;
        }

        &-fixed {
            display: flex;
            flex-shrink: 0;
            gap: 4px;
            align-items: center;
            margin-left: auto;
        }

        &-check {
            flex: 1;
            min-width: 0;
            font-size: 12px;
        }
    }

    &__pin-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px;
        font-size: 14px;
        color: var(--color-text-3);
        cursor: pointer;
        transition: color 0.2s;

        &:hover {
            color: var(--color-text-2);
        }

        &.is-active {
            color: rgb(var(--primary-6));
        }

        &--right {
            transform: scaleX(-1);
        }
    }
}
</style>
