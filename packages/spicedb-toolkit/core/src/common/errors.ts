import type { SpiceDbOperationTrace } from './tracing.js';

export class SpiceDbToolkitError extends Error {
  public readonly code: string;
  public readonly grpcCode?: number;
  public readonly details?: unknown;
  public readonly trace?: SpiceDbOperationTrace;

  constructor(
    message: string,
    options: string | { code: string; grpcCode?: number; details?: unknown; cause?: unknown; trace?: SpiceDbOperationTrace },
    cause?: unknown
  ) {
    super(message, { cause: cause ?? (typeof options === 'object' ? options.cause : undefined) });
    this.name = 'SpiceDbToolkitError';
    if (typeof options === 'string') {
      this.code = options;
    } else {
      this.code = options.code;
      this.grpcCode = options.grpcCode;
      this.details = options.details;
      this.trace = options.trace;
    }
  }
}

export function wrapGrpcError(err: unknown): SpiceDbToolkitError {
  if (err instanceof SpiceDbToolkitError) return err;

  const grpcErr = err as { code?: number; message?: string; details?: string };
  const code = typeof grpcErr.code === 'number' ? grpcErr.code : undefined;
  const message = grpcErr.message ?? 'Unknown SpiceDB error';

  return new SpiceDbToolkitError(message, {
    code: code !== undefined ? grpcCodeToString(code) : 'UNKNOWN',
    grpcCode: code,
    details: grpcErr.details,
    cause: err,
    trace: typeof err === 'object' && err !== null ? (err as { trace?: SpiceDbOperationTrace }).trace : undefined,
  });
}

export function isPermissionDenied(err: unknown): boolean {
  return err instanceof SpiceDbToolkitError && (err.grpcCode === 7 || err.code === 'PERMISSION_DENIED');
}

export function isNotFound(err: unknown): boolean {
  return err instanceof SpiceDbToolkitError && (err.grpcCode === 5 || err.code === 'NOT_FOUND');
}

export function isSchemaError(err: unknown): boolean {
  return err instanceof SpiceDbToolkitError && err.code === 'INVALID_ARGUMENT';
}

export function isUnavailable(err: unknown): boolean {
  return err instanceof SpiceDbToolkitError && (err.grpcCode === 14 || err.code === 'UNAVAILABLE');
}

function grpcCodeToString(code: number): string {
  const codeMap: Record<number, string> = {
    0: 'OK',
    1: 'CANCELLED',
    2: 'UNKNOWN',
    3: 'INVALID_ARGUMENT',
    4: 'DEADLINE_EXCEEDED',
    5: 'NOT_FOUND',
    6: 'ALREADY_EXISTS',
    7: 'PERMISSION_DENIED',
    8: 'RESOURCE_EXHAUSTED',
    9: 'FAILED_PRECONDITION',
    10: 'ABORTED',
    11: 'OUT_OF_RANGE',
    12: 'UNIMPLEMENTED',
    13: 'INTERNAL',
    14: 'UNAVAILABLE',
    15: 'DATA_LOSS',
    16: 'UNAUTHENTICATED',
  };
  return codeMap[code] ?? 'UNKNOWN';
}
