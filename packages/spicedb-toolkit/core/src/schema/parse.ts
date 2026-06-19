import { createRequire } from 'node:module';
import type {
  Resolver as OfficialResolver,
  parse as officialParse,
} from '@authzed/spicedb-parser-js';
import type { SchemaParseResult, SchemaAnalysisResult, SchemaError } from './types.js';

const requireParser =
  typeof module === 'object' && typeof module.require === 'function'
    ? module.require.bind(module)
    : createRequire(import.meta.url);
const officialParser = requireParser('@authzed/spicedb-parser-js') as typeof import('@authzed/spicedb-parser-js');
const parseSpiceDbSchema: typeof officialParse = officialParser.parse;
export const SchemaResolver = officialParser.Resolver as typeof OfficialResolver;

export function parseSchema(content: string): SchemaParseResult {
  const { schema, error } = parseSpiceDbSchema(content);
  const normalizedError = error ? normalizeParseError(error) : undefined;

  if (error) {
    return {
      schema,
      parseError: error,
      error: normalizedError,
      errors: normalizedError ? [normalizedError] : [],
      isValid: false,
    };
  }

  return {
    schema,
    resolver: schema ? new SchemaResolver(schema) : undefined,
    errors: [],
    isValid: true,
  };
}

export function analyzeSchema(content: string): SchemaAnalysisResult {
  const { schema, error } = parseSpiceDbSchema(content);
  const normalizedError = error ? normalizeParseError(error) : undefined;

  if (error) {
    return {
      schema,
      parseError: error,
      error: normalizedError,
      resolvedReferences: [],
      errors: normalizedError ? [normalizedError] : [],
      isValid: false,
    };
  }

  const resolver = new SchemaResolver(schema!);

  return {
    schema,
    resolver,
    resolvedReferences: resolver.resolvedReferences(),
    errors: [],
    isValid: true,
  };
}

function normalizeParseError(err: unknown): SchemaError {
  if (typeof err === 'string') return { message: err };
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const index = e.index as { line?: number; column?: number } | undefined;
    return {
      message: (e.message as string) ?? String(err),
      line: (e.line as number | undefined) ?? index?.line,
      column: (e.column as number | undefined) ?? index?.column,
    };
  }
  return { message: String(err) };
}
