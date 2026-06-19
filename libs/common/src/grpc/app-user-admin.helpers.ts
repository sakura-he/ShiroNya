import type {
    AdminFilterValueMessage,
    BoolValueMessage,
    Int32ListValueMessage,
    Int64ListValueMessage,
    PermissionEntryMessage,
    StringListValueMessage,
    StringPatchMessage,
    StringValueMessage
} from './app-user-admin.types';

/**
 * 将可空字符串包装成 gRPC wrapper。
 */
export function toStringValue(value: string | null | undefined): StringValueMessage | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    return { value };
}

/**
 * 将可空布尔包装成 gRPC wrapper。
 */
export function toBoolValue(value: boolean | null | undefined): BoolValueMessage | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    return { value };
}

/**
 * 将显式的字符串更新意图编码成 gRPC patch。
 */
export function toStringPatch(value: string | null | undefined): StringPatchMessage | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return { nullValue: 'NULL_VALUE' };
    }
    return { value };
}

/**
 * 解析 gRPC patch，区分“未传”“显式置空”“设置字符串”三种情况。
 */
export function fromStringPatch(patch: StringPatchMessage | null | undefined): {
    hasValue: boolean;
    value: string | null;
} {
    if (!patch) {
        return { hasValue: false, value: null };
    }
    if ('value' in patch && typeof patch.value === 'string') {
        return { hasValue: true, value: patch.value };
    }
    return { hasValue: true, value: null };
}

/**
 * 将资源权限对象转换成 gRPC 权限数组。
 */
export function permissionRecordToEntries(record: Record<string, string[]>): PermissionEntryMessage[] {
    const entries: PermissionEntryMessage[] = [];
    for (const [resource, actions] of Object.entries(record)) {
        entries.push({
            resource,
            actions
        });
    }
    return entries;
}

/**
 * 将 gRPC 权限数组还原成 Better Auth 需要的对象结构。
 */
export function permissionEntriesToRecord(entries: PermissionEntryMessage[]): Record<string, string[]> {
    const record: Record<string, string[]> = {};
    for (const entry of entries) {
        record[entry.resource] = entry.actions;
    }
    return record;
}

/**
 * 将业务角色列表包装成可选列表值。
 */
export function toInt32ListValue(values: number[] | undefined): Int32ListValueMessage | undefined {
    if (values === undefined) {
        return undefined;
    }
    return { values };
}

/**
 * 解析管理端筛选值的 oneof 结构。
 */
export function fromAdminFilterValue(value: AdminFilterValueMessage | null | undefined): unknown {
    if (!value) {
        return undefined;
    }
    if ('stringValue' in value) {
        return value.stringValue;
    }
    if ('numberValue' in value) {
        return Number(value.numberValue);
    }
    if ('boolValue' in value) {
        return value.boolValue;
    }
    if ('stringList' in value) {
        return value.stringList.values;
    }
    if ('numberList' in value) {
        return value.numberList.values.map((item) => Number(item));
    }
    return undefined;
}

/**
 * 将字符串数组包装成 gRPC 列表值。
 */
export function toStringListValue(values: string[]): StringListValueMessage {
    return { values };
}

/**
 * 将数字数组包装成 gRPC 列表值。
 */
export function toInt64ListValue(values: number[]): Int64ListValueMessage {
    return {
        values: values.map((item) => String(item))
    };
}

function upperFirst(value: string): string {
    return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function lowerFirst(value: string): string {
    return value ? `${value.slice(0, 1).toLowerCase()}${value.slice(1)}` : value;
}

function normalizeRpcScalar(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

/**
 * 将 admin HTTP DTO 转成 RBAC typed gRPC request。
 * null 统一编码成 clearXxx=true，app 端再还原成业务 DTO 的显式置空语义。
 */
export function toRbacGrpcRequest(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const source =
        value?.data && typeof value.data === 'object' && !Array.isArray(value.data)
            ? {
                  id: value.id,
                  ...(value.data as Record<string, unknown>)
              }
            : (value ?? {});
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(source)) {
        if (item === undefined) {
            continue;
        }
        if (item === null) {
            result[`clear${upperFirst(key)}`] = true;
            continue;
        }
        result[key] = Array.isArray(item)
            ? item.map((entry) => normalizeRpcScalar(entry))
            : normalizeRpcScalar(item);
    }

    return result;
}

/**
 * 将 RBAC typed gRPC request 还原成内部 service DTO。
 */
export function fromRbacGrpcRequest(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value ?? {})) {
        if (item === undefined) {
            continue;
        }
        if (key.startsWith('clear') && item === true) {
            result[lowerFirst(key.slice('clear'.length))] = null;
            continue;
        }
        result[key] = item;
    }
    return result;
}

/**
 * gRPC typed response 只输出 proto 声明过的 JSON 安全值，避免 Date/BigInt/Null 在 protobuf 层漂移。
 */
export function toRbacGrpcResponse<T = Record<string, unknown>>(value: unknown): T {
    if (value === null || value === undefined) {
        return { success: true } as T;
    }
    if (value instanceof Date) {
        return value.toISOString() as T;
    }
    if (typeof value === 'bigint') {
        return value.toString() as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => toRbacGrpcResponse(item)) as T;
    }
    if (typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (item === null || item === undefined) {
                continue;
            }
            result[key] = toRbacGrpcResponse(item);
        }
        return result as T;
    }
    return value as T;
}
