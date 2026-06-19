export { parseSchema, analyzeSchema, SchemaResolver } from './parse.js';
export { readSchemaFromSpiceDb, type ReadSchemaResult, type SchemaServiceOptions } from './read.js';
export { writeSchemaToSpiceDb, type WriteSchemaResult, type SchemaWriteOptions } from './write.js';
export { diffSchema } from './diff.js';
export type {
  SchemaParseResult,
  SchemaError,
  SchemaDiffResult,
  ModifiedDefinition,
  SchemaAnalysisResult,
} from './types.js';
export type {
  ParsedObjectDefinition,
  ParsedPermission,
  ParsedRelation,
  ParsedSchema,
  Resolver,
} from '@authzed/spicedb-parser-js';
