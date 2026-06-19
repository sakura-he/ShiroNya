import { parseSchema } from './parse.js';
import type {
  ParsedExpression,
  ParsedObjectDefinition,
  ParsedSchema,
  TextRange,
  TypeRef,
} from '@authzed/spicedb-parser-js';
import type { SchemaDiffResult, ModifiedDefinition } from './types.js';

export function diffSchema(localContent: string, remoteContent: string): SchemaDiffResult {
  const local = parseSchema(localContent);
  const remote = parseSchema(remoteContent);
  const localDefs = new Map(getObjectDefinitions(local.schema).map((d) => [d.name, d]));
  const remoteDefs = new Map(getObjectDefinitions(remote.schema).map((d) => [d.name, d]));

  const added: ParsedObjectDefinition[] = [];
  const removed: ParsedObjectDefinition[] = [];
  const modified: ModifiedDefinition[] = [];

  // Find added definitions (in local but not in remote)
  for (const [name, def] of localDefs) {
    if (!remoteDefs.has(name)) {
      added.push(def);
    }
  }

  // Find removed definitions (in remote but not in local)
  for (const [name, def] of remoteDefs) {
    if (!localDefs.has(name)) {
      removed.push(def);
    }
  }

  // Find modified definitions
  for (const [name, localDef] of localDefs) {
    const remoteDef = remoteDefs.get(name);
    if (!remoteDef) continue;

    const localRelNames = new Set(localDef.relations.map((r) => r.name));
    const remoteRelNames = new Set(remoteDef.relations.map((r) => r.name));
    const localPermNames = new Set(localDef.permissions.map((p) => p.name));
    const remotePermNames = new Set(remoteDef.permissions.map((p) => p.name));
    const remoteRelations = new Map(remoteDef.relations.map((r) => [r.name, r]));
    const remotePermissions = new Map(remoteDef.permissions.map((p) => [p.name, p]));

    const addedRelations = [...localRelNames].filter((r) => !remoteRelNames.has(r));
    const removedRelations = [...remoteRelNames].filter((r) => !localRelNames.has(r));
    const changedRelations = localDef.relations
      .filter((relation) => {
        const remoteRelation = remoteRelations.get(relation.name);
        return (
          remoteRelation &&
          normalizeList(relation.allowedTypes.types.map(formatTypeRef)) !==
            normalizeList(remoteRelation.allowedTypes.types.map(formatTypeRef))
        );
      })
      .map((relation) => relation.name);
    const addedPermissions = [...localPermNames].filter((p) => !remotePermNames.has(p));
    const removedPermissions = [...remotePermNames].filter((p) => !localPermNames.has(p));
    const changedPermissions = localDef.permissions
      .filter((permission) => {
        const remotePermission = remotePermissions.get(permission.name);
        return (
          remotePermission &&
          expressionToString(permission.expr, localContent) !==
            expressionToString(remotePermission.expr, remoteContent)
        );
      })
      .map((permission) => permission.name);

    if (
      addedRelations.length > 0 ||
      removedRelations.length > 0 ||
      changedRelations.length > 0 ||
      addedPermissions.length > 0 ||
      removedPermissions.length > 0 ||
      changedPermissions.length > 0
    ) {
      modified.push({
        name,
        addedRelations,
        removedRelations,
        changedRelations,
        addedPermissions,
        removedPermissions,
        changedPermissions,
      });
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;
  const textDiff = generateTextDiff(localContent, remoteContent);

  return { added, removed, modified, hasChanges, textDiff };
}

function normalizeList(values: string[]): string {
  return [...values].sort().join('|');
}

function getObjectDefinitions(schema: ParsedSchema | undefined): ParsedObjectDefinition[] {
  return schema?.definitions.filter((def): def is ParsedObjectDefinition => def.kind === 'objectDef') ?? [];
}

function formatTypeRef(typeRef: TypeRef): string {
  const suffix = typeRef.wildcard
    ? ':*'
    : typeRef.relationName
      ? `#${typeRef.relationName}`
      : '';
  const caveat = typeRef.withCaveat ? ` with ${typeRef.withCaveat.path}` : '';
  const expiration = typeRef.withExpiration ? ' with expiration' : '';

  return `${typeRef.path}${suffix}${caveat}${expiration}`;
}

function expressionToString(expression: ParsedExpression, content: string): string {
  return sliceRange(content, expression.range);
}

function sliceRange(content: string, range: TextRange): string {
  return content.slice(range.startIndex.offset, range.endIndex.offset).trim();
}

function generateTextDiff(local: string, remote: string): string {
  const localLines = local.split('\n');
  const remoteLines = remote.split('\n');

  const lines: string[] = [];
  lines.push('--- remote');
  lines.push('+++ local');
  lines.push('');

  const maxLen = Math.max(localLines.length, remoteLines.length);
  for (let i = 0; i < maxLen; i++) {
    const localLine = localLines[i];
    const remoteLine = remoteLines[i];

    if (localLine === remoteLine) {
      if (localLine !== undefined) lines.push(`  ${localLine}`);
    } else {
      if (remoteLine !== undefined) lines.push(`- ${remoteLine}`);
      if (localLine !== undefined) lines.push(`+ ${localLine}`);
    }
  }

  return lines.join('\n');
}
