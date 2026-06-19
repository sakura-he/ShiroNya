import { AsyncLocalStorage } from 'node:async_hooks';
import type { SpiceDbOperationTrace } from '@spicedb-toolkit/core';
import { isAdminApiDevtoolsDebugEnabled } from '../../common/utils/admin-devtools-debug';

const SPICEDB_DEBUG_TRACES = Symbol('shiro.admin.spicedb.debug.traces');
const spiceDbDebugTraceStorage = new AsyncLocalStorage<SpiceDbOperationTrace[]>();

export type AdminDebuggableValue<T> = T & {
    [SPICEDB_DEBUG_TRACES]?: SpiceDbOperationTrace[];
};

export type AdminSpiceDbDebugPayload = {
    count: number;
    totalMs: number;
    operations: Array<{
        operation: string;
        durationMs: number;
        count?: number;
        status: 'success' | 'error';
        errorCode?: string;
        nativeDebug?: unknown;
    }>;
};

export function runWithSpiceDbDebugTraceStore<T>(callback: () => T): T {
    if (!isAdminApiDevtoolsDebugEnabled()) {
        return callback();
    }

    return spiceDbDebugTraceStorage.run([], callback);
}

export function isSpiceDbDebugTraceStoreActive(): boolean {
    return isAdminApiDevtoolsDebugEnabled() && Boolean(spiceDbDebugTraceStorage.getStore());
}

export function recordSpiceDbDebugTrace(trace?: SpiceDbOperationTrace): void {
    if (!trace || !isAdminApiDevtoolsDebugEnabled()) {
        return;
    }

    spiceDbDebugTraceStorage.getStore()?.push(trace);
}

export function collectCurrentSpiceDbDebugTraces(): SpiceDbOperationTrace[] {
    if (!isAdminApiDevtoolsDebugEnabled()) {
        return [];
    }

    return [...(spiceDbDebugTraceStorage.getStore() ?? [])];
}

export function attachSpiceDbDebugTraces<T>(value: T, traces: Array<SpiceDbOperationTrace | undefined>): T {
    if (!isAdminApiDevtoolsDebugEnabled()) {
        return value;
    }

    const normalizedTraces = traces.filter((trace): trace is SpiceDbOperationTrace => Boolean(trace));
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || normalizedTraces.length === 0) {
        return value;
    }

    const target = value as AdminDebuggableValue<object>;
    const currentTraces = target[SPICEDB_DEBUG_TRACES] ?? [];
    Object.defineProperty(target, SPICEDB_DEBUG_TRACES, {
        value: [...currentTraces, ...normalizedTraces],
        enumerable: false,
        configurable: true
    });

    return value;
}

export function collectSpiceDbDebugTraces(value: unknown): SpiceDbOperationTrace[] {
    if (!isAdminApiDevtoolsDebugEnabled()) {
        return [];
    }

    const traces: SpiceDbOperationTrace[] = [];
    collectFromValue(value, traces, new WeakSet<object>());
    return traces;
}

export function buildSpiceDbDebugPayload(traces: SpiceDbOperationTrace[]): AdminSpiceDbDebugPayload | undefined {
    const uniqueTraces = [...new Set(traces)];
    if (uniqueTraces.length === 0) {
        return undefined;
    }

    const operations = uniqueTraces.map((trace) => ({
        operation: trace.operation,
        durationMs: trace.durationMs,
        count: trace.count,
        status: trace.status,
        errorCode: trace.errorCode,
        ...(trace.nativeDebug !== undefined ? { nativeDebug: trace.nativeDebug } : {})
    }));

    return {
        count: operations.length,
        totalMs: roundMs(operations.reduce((total, operation) => total + operation.durationMs, 0)),
        operations
    };
}

function collectFromValue(value: unknown, traces: SpiceDbOperationTrace[], seen: WeakSet<object>): void {
    if (!value || typeof value !== 'object' || seen.has(value)) {
        return;
    }

    seen.add(value);
    const directTrace = readDirectTrace(value);
    if (directTrace) {
        traces.push(directTrace);
    }

    const ownTraces = (value as AdminDebuggableValue<object>)[SPICEDB_DEBUG_TRACES] ?? [];
    traces.push(...ownTraces);

    if (Array.isArray(value)) {
        for (const item of value) {
            collectFromValue(item, traces, seen);
        }
        return;
    }

    for (const entry of Object.values(value as Record<string, unknown>)) {
        collectFromValue(entry, traces, seen);
    }
}

function roundMs(value: number): number {
    return Math.round(value * 100) / 100;
}

function readDirectTrace(value: object): SpiceDbOperationTrace | undefined {
    const trace = (value as { trace?: unknown }).trace;
    if (!trace || typeof trace !== 'object') {
        return undefined;
    }

    const candidate = trace as Partial<SpiceDbOperationTrace>;
    return typeof candidate.operation === 'string' &&
        (candidate.status === 'success' || candidate.status === 'error') &&
        typeof candidate.durationMs === 'number'
        ? (trace as SpiceDbOperationTrace)
        : undefined;
}
