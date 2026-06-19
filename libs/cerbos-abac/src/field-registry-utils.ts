import type {
    CerbosAbacFieldCategory,
    CerbosAbacFieldDataType,
    CerbosAbacFieldDefinition,
    CerbosAbacOperator,
    CerbosAbacValueType
} from './types';
import { toISOStringValue } from './utils';

const STRING_OPERATORS: CerbosAbacOperator[] = ['EQ', 'NE', 'IN', 'NOT_IN', 'EMPTY', 'NOT_EMPTY'];
const NUMBER_OPERATORS: CerbosAbacOperator[] = [
    'EQ',
    'NE',
    'GT',
    'GTE',
    'LT',
    'LTE',
    'IN',
    'NOT_IN',
    'EMPTY',
    'NOT_EMPTY'
];
const ARRAY_OPERATORS: CerbosAbacOperator[] = ['CONTAINS', 'NOT_CONTAINS', 'EMPTY', 'NOT_EMPTY'];
const BOOLEAN_OPERATORS: CerbosAbacOperator[] = ['EQ', 'NE'];
const DATE_OPERATORS: CerbosAbacOperator[] = ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'EMPTY', 'NOT_EMPTY'];
const OBJECT_OPERATORS: CerbosAbacOperator[] = ['EMPTY', 'NOT_EMPTY'];

const VALID_OPERATORS = new Set<CerbosAbacOperator>([
    ...STRING_OPERATORS,
    ...NUMBER_OPERATORS,
    ...ARRAY_OPERATORS,
    ...BOOLEAN_OPERATORS,
    ...DATE_OPERATORS,
    ...OBJECT_OPERATORS
]);

export function defaultOperatorsForDataType(dataType: CerbosAbacFieldDataType): CerbosAbacOperator[] {
    if (dataType === 'number') return [...NUMBER_OPERATORS];
    if (dataType === 'array') return [...ARRAY_OPERATORS];
    if (dataType === 'boolean') return [...BOOLEAN_OPERATORS];
    if (dataType === 'date') return [...DATE_OPERATORS];
    if (dataType === 'object') return [...OBJECT_OPERATORS];
    return [...STRING_OPERATORS];
}

export function normalizeFieldDataType(value: unknown): CerbosAbacFieldDataType {
    const normalized = String(value ?? 'string').trim().toLowerCase();
    if (
        normalized === 'number' ||
        normalized === 'boolean' ||
        normalized === 'array' ||
        normalized === 'object' ||
        normalized === 'date'
    ) {
        return normalized;
    }
    return 'string';
}

export function toDbFieldDataType(value: unknown) {
    return normalizeFieldDataType(value).toUpperCase();
}

export function normalizeOperators(value: unknown, dataType: CerbosAbacFieldDataType): CerbosAbacOperator[] {
    const fallback = defaultOperatorsForDataType(dataType);
    if (!Array.isArray(value)) {
        return fallback;
    }
    const operators = value
        .map((item) => String(item).trim())
        .filter((item): item is CerbosAbacOperator => VALID_OPERATORS.has(item as CerbosAbacOperator));
    return operators.length ? [...new Set(operators)] : fallback;
}

export function deriveFieldCategory(
    valueType: Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'>,
    key: string
): CerbosAbacFieldCategory {
    if (valueType === 'RESOURCE_ATTR') return 'RESOURCE';
    if (valueType === 'REQUEST_CONTEXT') return 'REQUEST_CONTEXT';
    return key.startsWith('ext.') ? 'USER_EXTENSION' : 'USER_BASE';
}

export function deriveCerbosPath(
    valueType: Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'>,
    key: string
): string {
    if (valueType === 'RESOURCE_ATTR') return `request.resource.attr.${key}`;
    if (valueType === 'REQUEST_CONTEXT') return `request.auxData.${key}`;
    return `request.principal.attr.${key}`;
}

export function inferFieldDataType(value: unknown): CerbosAbacFieldDataType {
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (value && typeof value === 'object') return 'object';
    return 'string';
}

export function humanizeFieldKey(key: string): string {
    return key
        .split('.')
        .map((part) => part.replace(/([a-z])([A-Z])/g, '$1 $2'))
        .join(' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mapFieldRow(row: any): CerbosAbacFieldDefinition {
    const valueType = row.valueType as Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'>;
    const dataType = normalizeFieldDataType(row.dataType);
    const key = String(row.key);
    return {
        id: row.id,
        key,
        label: row.label,
        description: row.description ?? null,
        category: row.category,
        source: row.source,
        valueType,
        cerbosPath: deriveCerbosPath(valueType, key),
        dataType,
        operators: normalizeOperators(row.operators, dataType),
        status: row.status,
        builtin: Boolean(row.builtin),
        locked: Boolean(row.locked),
        usageCount: Number(row.usageCount ?? 0),
        discoveredAt: toISOStringValue(row.discoveredAt),
        lastSeenAt: toISOStringValue(row.lastSeenAt),
        updatedAt: toISOStringValue(row.updatedAt)
    };
}
