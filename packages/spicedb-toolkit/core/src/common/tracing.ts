export type SpiceDbOperationStatus = 'success' | 'error';

export interface SpiceDbOperationTrace {
  operation: string;
  status: SpiceDbOperationStatus;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  count?: number;
  errorCode?: string;
  nativeDebug?: unknown;
}

export interface SpiceDbTraceCarrier {
  trace?: SpiceDbOperationTrace;
}

export type SpiceDbTracingEnabled = boolean | (() => boolean);

export interface SpiceDbTracingOptions {
  enabled?: SpiceDbTracingEnabled;
  nativeCheckDebug?: SpiceDbTracingEnabled;
  onTrace?: (trace: SpiceDbOperationTrace) => void;
}

export type SpiceDbOperationTraceStart = {
  operation: string;
  count?: number;
  startedAt: number;
};

export function startSpiceDbOperationTrace(
  operation: string,
  count?: number,
  tracing?: SpiceDbTracingOptions
): SpiceDbOperationTraceStart | undefined {
  if (!isSpiceDbTracingEnabled(tracing)) {
    return undefined;
  }

  return {
    operation,
    count,
    startedAt: performance.now(),
  };
}

export function finishSpiceDbOperationTrace(
  started: SpiceDbOperationTraceStart | undefined,
  status: SpiceDbOperationStatus,
  errorCode?: string,
  count?: number,
  nativeDebug?: unknown
): SpiceDbOperationTrace | undefined {
  if (!started) {
    return undefined;
  }

  const finishedAt = performance.now();
  const trace: SpiceDbOperationTrace = {
    operation: started.operation,
    status,
    durationMs: roundDuration(finishedAt - started.startedAt),
    startedAt: roundDuration(started.startedAt),
    finishedAt: roundDuration(finishedAt),
    count: count ?? started.count,
    errorCode,
  };
  if (nativeDebug !== undefined) {
    trace.nativeDebug = nativeDebug;
  }
  return trace;
}

export async function traceSpiceDbRpc<T>(
  operation: string,
  count: number | undefined,
  tracing: SpiceDbTracingOptions | undefined,
  call: () => Promise<T>,
  options: {
    resolveCount?: (value: T) => number | undefined;
    resolveNativeDebug?: (value: T) => unknown;
  } = {}
): Promise<{ value: T; trace?: SpiceDbOperationTrace }> {
  const traceStart = startSpiceDbOperationTrace(operation, count, tracing);

  try {
    const value = await call();
    const trace = finishSpiceDbOperationTrace(
      traceStart,
      'success',
      undefined,
      options.resolveCount?.(value) ?? count,
      options.resolveNativeDebug?.(value)
    );
    emitSpiceDbOperationTrace(trace, tracing);
    return { value, trace };
  } catch (err) {
    const trace = finishSpiceDbOperationTrace(traceStart, 'error', readSpiceDbErrorCode(err), count);
    emitSpiceDbOperationTrace(trace, tracing);
    throw attachSpiceDbTraceToError(err, trace);
  }
}

export function getSpiceDbTrace(value: unknown): SpiceDbOperationTrace | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return (value as SpiceDbTraceCarrier).trace;
}

export function attachSpiceDbTrace<T extends object>(value: T, trace?: SpiceDbOperationTrace): T {
  if (!trace) {
    return value;
  }

  Object.defineProperty(value, 'trace', {
    value: trace,
    enumerable: true,
    configurable: true,
  });
  return value;
}

export function attachSpiceDbTraceToError<T>(error: T, trace?: SpiceDbOperationTrace): T {
  if (!trace || !error || typeof error !== 'object') {
    return error;
  }

  Object.defineProperty(error, 'trace', {
    value: trace,
    enumerable: true,
    configurable: true,
  });
  return error;
}

export function emitSpiceDbOperationTrace(trace: SpiceDbOperationTrace | undefined, tracing?: SpiceDbTracingOptions): void {
  if (!trace) {
    return;
  }

  tracing?.onTrace?.(trace);
}

export function isSpiceDbTracingEnabled(tracing?: SpiceDbTracingOptions): boolean {
  const enabled = tracing?.enabled;
  return resolveTracingFlag(enabled, true);
}

export function isSpiceDbNativeCheckDebugEnabled(tracing?: SpiceDbTracingOptions): boolean {
  return resolveTracingFlag(tracing?.nativeCheckDebug, false);
}

export function readSpiceDbErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return code === undefined ? undefined : String(code);
}

function resolveTracingFlag(enabled: SpiceDbTracingEnabled | undefined, defaultValue: boolean): boolean {
  if (typeof enabled === 'function') {
    return enabled();
  }

  return enabled ?? defaultValue;
}

function roundDuration(value: number): number {
  return Math.round(value * 100) / 100;
}
