// Core facade
export { createSpiceDbToolkit, type SpiceDbToolkit } from './public-api.js';

// Client
export { createSpiceDbClient, clientOptionsFromEnv, type SpiceDbClient, type SpiceDbClientOptions } from './client/index.js';

// Config
export { defineConfig, validateConfig, type SpiceDbToolkitConfig } from './config/config.js';
export { loadConfig } from './config/load-config.js';

// Permission
export { createPermissionService, type PermissionService, type PermissionServiceOptions } from './permission/index.js';
export type {
  CheckPermissionInput,
  CheckPermissionResult,
  CheckBulkPermissionsInput,
  CheckBulkPermissionsResult,
  ExpandPermissionInput,
  ExpandPermissionResult,
  LookupResourcesInput,
  LookupResourcesResult,
  LookupSubjectsInput,
  LookupSubjectsResult,
} from './permission/types.js';

// Relationship
export { createRelationshipService, type RelationshipService, type RelationshipServiceOptions } from './relationship/index.js';
export type {
  RelationshipInput,
  RelationshipOutput,
  RelationshipOperation,
  RelationshipFilter,
  WriteRelationshipsInput,
  WriteRelationshipsResult,
  DeleteRelationshipsInput,
  DeleteRelationshipsResult,
  ReadRelationshipsInput,
  ReadRelationshipsResult,
  TouchRelationshipsInput,
  ImportBulkRelationshipsInput,
  ExportBulkRelationshipsInput,
} from './relationship/types.js';

// Schema
export {
  parseSchema,
  analyzeSchema,
  SchemaResolver,
  readSchemaFromSpiceDb,
  writeSchemaToSpiceDb,
  diffSchema,
} from './schema/index.js';
export type {
  SchemaParseResult,
  SchemaError,
  SchemaDiffResult,
  ModifiedDefinition,
  SchemaAnalysisResult,
  ReadSchemaResult,
  WriteSchemaResult,
  ParsedObjectDefinition,
  ParsedPermission,
  ParsedRelation,
  ParsedSchema,
  Resolver,
} from './schema/index.js';

// Common
export {
  SpiceDbToolkitError,
  wrapGrpcError,
  isPermissionDenied,
  isNotFound,
  isSchemaError,
  isUnavailable,
} from './common/errors.js';
export {
  fullyConsistent,
  atLeastAsFresh,
  atExactSnapshot,
  minimizeLatency,
  type ConsistencyOption,
} from './common/consistency.js';
export type {
  SpiceDbOperationStatus,
  SpiceDbOperationTrace,
  SpiceDbTraceCarrier,
  SpiceDbTracingEnabled,
  SpiceDbTracingOptions,
} from './common/tracing.js';
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
} from './common/tracing.js';

// Helpers
export { readSchemaFile, createRelationshipProto, formatRelationship, type RelationshipParts } from './helpers.js';
