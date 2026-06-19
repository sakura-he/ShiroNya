export { SpiceDbToolkitError, wrapGrpcError, isPermissionDenied, isNotFound, isSchemaError, isUnavailable } from './errors.js';
export { fullyConsistent, atLeastAsFresh, atExactSnapshot, minimizeLatency } from './consistency.js';
export type { ConsistencyOption } from './consistency.js';
export type {
  SpiceDbOperationStatus,
  SpiceDbOperationTrace,
  SpiceDbTraceCarrier,
  SpiceDbTracingEnabled,
  SpiceDbTracingOptions,
} from './tracing.js';
export {
  attachSpiceDbTrace,
  attachSpiceDbTraceToError,
  emitSpiceDbOperationTrace,
  finishSpiceDbOperationTrace,
  getSpiceDbTrace,
  isSpiceDbNativeCheckDebugEnabled,
  isSpiceDbTracingEnabled,
  readSpiceDbErrorCode,
  startSpiceDbOperationTrace,
  traceSpiceDbRpc,
} from './tracing.js';
