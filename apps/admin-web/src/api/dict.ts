import { request } from "@/api/index";

export const DictStatus = {
    ENABLE: 1,
    DISABLE: 2,
} as const;
export type DictStatus = (typeof DictStatus)[keyof typeof DictStatus];

export interface DictRecord {
    id: number;
    category: string;
    name: string;
    value: string;
    description: string | null;
    status: number;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    itemCount?: number;
}

export interface DictItemRecord {
    id: number;
    dictId: number;
    key: string;
    value: string;
    description: string | null;
    status: number;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
    dict?: DictRecord;
}

export interface DictPageResponse<T> {
    records: T[];
    pagination: {
        total: number;
        totalPages: number;
        pageSize: number;
        page: number;
    };
}

export interface DictStatusOption {
    label: string;
    value: number;
    isEnabled: boolean;
}

export interface DictCategoryOption {
    label: string;
    value: string;
    count: number;
}

export interface DictCategoryRecord {
    id: number;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export type DictCategoryForm = {
    name?: string;
};

export type DictForm = {
    id?: number;
    category?: string;
    name?: string;
    value?: string;
    description?: string | null;
    status?: number;
    sortOrder?: number;
};

export type DictItemForm = {
    id?: number;
    dictId?: number;
    key?: string;
    value?: string;
    description?: string | null;
    status?: number;
    sortOrder?: number;
};

/**
 * 查询字典状态选项。
 */
export function getDictStatusOptions() {
    return request.get<DictStatusOption[]>("/dict/get_status_options");
}

/**
 * 查询字典分类下拉选项。
 */
export function queryDictCategoryOptions(params: Record<string, unknown> = {}) {
    return request.post<DictCategoryOption[]>("/dict/query_category_options", params);
}

/**
 * 创建字典分类。
 */
export function createDictCategory(data: DictCategoryForm) {
    return request.post<DictCategoryRecord>("/dict/create_category", data);
}

/**
 * 删除空字典分类。
 */
export function deleteDictCategory(name: string) {
    return request.post<null>("/dict/delete_category", { name });
}

/**
 * 分页查询字典主表。
 */
export function queryDictList(params: Record<string, unknown>) {
    return request.post<DictPageResponse<DictRecord>>("/dict/query_dict_list", params);
}

/**
 * 创建字典主记录。
 */
export function createDict(data: DictForm) {
    return request.post<DictRecord>("/dict/create_dict", data);
}

/**
 * 更新字典主记录。
 */
export function updateDict(data: DictForm) {
    return request.post<DictRecord>("/dict/update_dict", data);
}

/**
 * 更新字典状态。
 */
export function updateDictStatus(data: { id: number; status: number; cascadeItems?: boolean }) {
    return request.post<null>("/dict/update_dict_status", data);
}

/**
 * 删除字典主记录。
 */
export function deleteDict(id: number) {
    return request.post<null>("/dict/delete_dict", { id });
}

/**
 * 分页查询字典项。
 */
export function queryDictItemList(params: Record<string, unknown>) {
    return request.post<DictPageResponse<DictItemRecord>>("/dict/query_item_list", params);
}

/**
 * 创建字典项。
 */
export function createDictItem(data: DictItemForm) {
    return request.post<DictItemRecord>("/dict/create_item", data);
}

/**
 * 更新字典项。
 */
export function updateDictItem(data: DictItemForm) {
    return request.post<DictItemRecord>("/dict/update_item", data);
}

/**
 * 更新字典项状态。
 */
export function updateDictItemStatus(data: { id: number; status: number }) {
    return request.post<null>("/dict/update_item_status", data);
}

/**
 * 删除字典项。
 */
export function deleteDictItem(id: number) {
    return request.post<null>("/dict/delete_item", { id });
}
