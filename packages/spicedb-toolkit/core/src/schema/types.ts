import type {
  ParsedObjectDefinition,
  ParsedSchema,
  ResolvedReference,
  Resolver,
  parse as officialParse,
} from '@authzed/spicedb-parser-js';

export type SpiceDbParseError = NonNullable<ReturnType<typeof officialParse>['error']>;

export interface SchemaParseResult {
  schema?: ParsedSchema;
  resolver?: Resolver;
  parseError?: SpiceDbParseError;
  error?: SchemaError;
  errors: SchemaError[];
  isValid: boolean;
}

export interface SchemaError {
  message: string;
  line?: number;
  column?: number;
}

export interface SchemaDiffResult {
  added: ParsedObjectDefinition[];
  removed: ParsedObjectDefinition[];
  modified: ModifiedDefinition[];
  hasChanges: boolean;
  textDiff: string;
}

export interface ModifiedDefinition {
  name: string;
  addedRelations: string[];
  removedRelations: string[];
  changedRelations: string[];
  addedPermissions: string[];
  removedPermissions: string[];
  changedPermissions: string[];
}

export interface SchemaAnalysisResult {
  schema?: ParsedSchema;
  resolver?: Resolver;
  resolvedReferences: ResolvedReference[];
  parseError?: SpiceDbParseError;
  error?: SchemaError;
  errors: SchemaError[];
  isValid: boolean;
}
