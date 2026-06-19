import { Prisma } from '../generated/client';

export type WithISODate<T> = T extends Date
    ? string
    : T extends Array<infer R>
      ? Array<WithISODate<R>>
      : T extends object
        ? { [K in keyof T]: WithISODate<T[K]> }
        : T;

/**
 * 类型断言工具函数 - 将 Prisma 返回值标记为已序列化日期的类型
 */
export function asPrismaISODate<T>(data: T): WithISODate<T> {
    return transformDates(data);
}

/**
 * 递归将 Date 转成 ISO 字符串，同时保留 null/undefined 字段以避免结构信息丢失
 */
function transformDates<T>(obj: T): WithISODate<T> {
    if (obj === null || obj === undefined) {
        return obj as WithISODate<T>;
    }

    if (obj instanceof Date) {
        return obj.toISOString() as WithISODate<T>;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => transformDates(item)) as WithISODate<T>;
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        // 递归转换 Date 字段并保留 null，避免破坏前端依赖的结构字段（如 pid: null）
        for (const [key, value] of Object.entries(obj)) {
            result[key] = transformDates(value);
        }
        return result as WithISODate<T>;
    }

    return obj as WithISODate<T>;
}

export const dateToISODateStringExtension = Prisma.defineExtension({
    name: 'dateToIsoString',
    query: {
        $allModels: {
            async $allOperations({ args, query }) {
                const result = await query(args);
                return transformDates(result);
            }
        }
    }
});
