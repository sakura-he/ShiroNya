import { createHash } from 'node:crypto';

export function createCerbosAbacId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value: unknown): string {
    return JSON.stringify(sortJson(value));
}

export function sortJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJson);
    }
    if (isRecord(value)) {
        return Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = sortJson(value[key]);
                return acc;
            }, {});
    }
    return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toISOStringValue(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function safeCodeSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}
