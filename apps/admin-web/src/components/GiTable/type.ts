import type {
    PaginationProps,
    TableColumnData,
    TableData,
    TableInstance,
} from "@arco-design/web-vue";
import type { Ref, VNodeChild } from "vue";

export type GiTableRowKey = string | number;

export type ProColumnsValueType =
    | "digit"
    | "decimal"
    | "percent"
    | "money"
    | "textarea"
    | "select"
    | "option"
    | "date"
    | "dateRange"
    | "dateTimeRange"
    | "dateTime"
    | "time"
    | "text"
    | "index"
    | "indexBorder"
    | "checkbox"
    | "radio"
    | "radioButton"
    | "switch"
    | "progress"
    | "code"
    | "avatar"
    | "image"
    | "uploadFile";

export type GiTableRequestParams = {
    current?: number;
    pageSize?: number;
    [key: string]: unknown;
};

export interface RequestData<T> {
    data: T[];
    success?: boolean;
    total?: number;
    [key: string]: unknown;
}

export interface PageInfo {
    current: number;
    pageSize: number;
    total?: number;
}

export type ActionType = {
    reload: (resetPageIndex?: boolean) => Promise<void>;
    reloadAndRest?: () => Promise<void>;
    reset?: () => void;
    clearSelected: () => void;
    pageInfo?: Ref<PageInfo>;
    getSelected?: () => {
        selectedKeys: GiTableRowKey[];
        selectedRows: TableData[];
    };
    fullScreen?: () => void;
    setPageInfo?: (page: Partial<PageInfo>) => void;
    getPopupContainer?: () => HTMLElement | undefined;
};

export interface ProColumns extends Omit<
    TableColumnData,
    "dataIndex" | "title" | "render" | "children" | "filters"
> {
    dataIndex?: string;
    key?: string;
    order?: number;
    children?: ProColumns[];
    title?: string | VNodeChild | ((item: ProColumns) => VNodeChild);
    valueType?: ProColumnsValueType;
    render?: (data: { record: TableData; column: TableColumnData; rowIndex: number }) => VNodeChild;
    renderText?: (
        text: unknown,
        data: { record: TableData; rowIndex: number; action: ActionType },
    ) => unknown;
    hideInSearch?: boolean;
    hideInTable?: boolean;
    hideInForm?: boolean;
    hideInSetting?: boolean;
    disable?: boolean;
    copyable?: boolean;
    formSlotName?: string;
    formItemProps?: Record<string, unknown> | ((data: unknown) => Record<string, unknown>);
    fieldProps?: Record<string, unknown>;
    girdItemProps?: Record<string, unknown>;
    defaultValue?: unknown;
    valueEnum?: Record<string, unknown> | ((data: unknown) => Record<string, unknown>);
    renderFormItem?: (data: unknown) => VNodeChild | "hidden";
    filters?: boolean | TableColumnData["filterable"];
    onFilter?: boolean | ((value: unknown, record: TableData) => boolean);
    defaultFilteredValue?: string[];
    defaultSortOrder?: "ascend" | "descend" | "";
}

export interface GiTableOptions {
    reload?: boolean;
    density?: boolean;
    setting?:
        | boolean
        | {
              draggable?: boolean;
              checkable?: boolean;
              checkedReset?: boolean;
              showListItemOption?: boolean;
          };
    fullScreen?: boolean;
    border?: boolean;
    stripe?: boolean;
}

export interface GiTableColumnsState {
    persistenceType?: "localStorage" | "sessionStorage";
    persistenceKey?: string;
}

export interface TableSettingColumnItem {
    key: string;
    title: string;
    show: boolean;
    disabled: boolean;
    fixedLeft?: boolean;
    fixedRight?: boolean;
}

export type GiTableProps<T extends TableData = TableData> = {
    title?: string;
    headerTitle?: string;
    columns?: ProColumns[];
    data?: T[];
    request?: (params: GiTableRequestParams) => Promise<RequestData<T>>;
    actionRef?: (action: ActionType) => void;
    selectedKeys?: GiTableRowKey[];
    expandedKeys?: GiTableRowKey[];
    disabledColumnKeys?: string[];
    columnsState?: GiTableColumnsState;
    options?: false | GiTableOptions;
    search?: boolean | Record<string, unknown>;
    bordered?: TableInstance["$props"]["bordered"];
    hoverable?: TableInstance["$props"]["hoverable"];
    stripe?: TableInstance["$props"]["stripe"];
    size?: TableInstance["$props"]["size"];
    tableLayoutFixed?: TableInstance["$props"]["tableLayoutFixed"];
    loading?: TableInstance["$props"]["loading"];
    rowSelection?: TableInstance["$props"]["rowSelection"];
    expandable?: TableInstance["$props"]["expandable"];
    scroll?: TableInstance["$props"]["scroll"];
    pagination?: PaginationProps | boolean;
    pagePosition?: TableInstance["$props"]["pagePosition"];
    indentSize?: TableInstance["$props"]["indentSize"];
    rowKey?: TableInstance["$props"]["rowKey"];
    showHeader?: TableInstance["$props"]["showHeader"];
    virtualListProps?: TableInstance["$props"]["virtualListProps"];
    spanMethod?: TableInstance["$props"]["spanMethod"];
    spanAll?: TableInstance["$props"]["spanAll"];
    loadMore?: TableInstance["$props"]["loadMore"];
    filterIconAlignLeft?: TableInstance["$props"]["filterIconAlignLeft"];
    hideExpandButtonOnEmpty?: TableInstance["$props"]["hideExpandButtonOnEmpty"];
    rowClass?: TableInstance["$props"]["rowClass"];
    draggable?: TableInstance["$props"]["draggable"];
    rowNumber?: TableInstance["$props"]["rowNumber"];
    columnResizable?: TableInstance["$props"]["columnResizable"];
    summary?: TableInstance["$props"]["summary"];
    summaryText?: TableInstance["$props"]["summaryText"];
    summarySpanMethod?: TableInstance["$props"]["summarySpanMethod"];
    defaultSelectedKeys?: TableInstance["$props"]["defaultSelectedKeys"];
    defaultExpandedKeys?: TableInstance["$props"]["defaultExpandedKeys"];
    defaultExpandAllRows?: TableInstance["$props"]["defaultExpandAllRows"];
    stickyHeader?: TableInstance["$props"]["stickyHeader"];
    scrollbar?: TableInstance["$props"]["scrollbar"];
    showEmptyTree?: TableInstance["$props"]["showEmptyTree"];
};
