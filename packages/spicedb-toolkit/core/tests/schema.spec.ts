import { describe, it, expect } from 'vitest';
import { analyzeSchema, parseSchema, diffSchema } from '../src/schema/index.js';

describe('parseSchema', () => {
  it('should parse empty schema without errors', () => {
    const result = parseSchema('');
    expect(result.errors).toStrictEqual([]);
    expect(result.schema?.definitions).toStrictEqual([]);
  });

  it('should return the official parsed schema and resolver', () => {
    const result = parseSchema('definition user {}');
    expect(result.schema?.kind).toBe('schema');
    expect(result.resolver?.listDefinitions().map((def) => def.definition.name)).toStrictEqual([
      'user',
    ]);
  });

  it('should expose definitions from the official parser AST directly', () => {
    const result = parseSchema(`definition user {}

definition group {
  relation member: user
}

definition document {
  relation viewer: user | group#member
  permission view = viewer + group->member
}`);

    expect(result.isValid).toBe(true);
    expect(result.schema?.definitions.map((def) => def.kind)).toStrictEqual([
      'objectDef',
      'objectDef',
      'objectDef',
    ]);
    expect(result.resolver?.lookupDefinition('document')?.listRelationsAndPermissionNames()).toStrictEqual([
      'viewer',
      'view',
    ]);
  });

  it('should report parser errors', () => {
    const result = parseSchema('definition document { relation viewer: }');
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].line).toBeDefined();
  });
});

describe('analyzeSchema', () => {
  it('should expose official resolver references without custom semantic errors', () => {
    const result = analyzeSchema(`definition user {}

definition document {
  relation viewer: missing
  permission view = nope
}`);

    expect(result.isValid).toBe(true);
    expect(result.errors).toStrictEqual([]);
    expect(result.resolvedReferences.some((ref) => ref.kind === 'type')).toBe(true);
    expect(result.resolvedReferences.some((ref) => ref.kind === 'expression')).toBe(true);
  });
});

describe('diffSchema', () => {
  it('should detect no changes for identical schemas', () => {
    const schema = 'definition user {}';
    const result = diffSchema(schema, schema);
    expect(result.hasChanges).toBe(false);
    expect(result.added).toStrictEqual([]);
    expect(result.removed).toStrictEqual([]);
    expect(result.modified).toStrictEqual([]);
  });

  it('should detect text differences', () => {
    const local = 'definition user {}';
    const remote = 'definition user {}\ndefinition document {}';
    const result = diffSchema(local, remote);
    // Text diff should show differences
    expect(result.textDiff).toBeDefined();
  });

  it('should detect relation target and permission expression changes', () => {
    const local = `definition user {}
definition group {
  relation member: user
}
definition document {
  relation viewer: user | group#member
  permission view = viewer
}`;
    const remote = `definition user {}
definition group {
  relation member: user
}
definition document {
  relation viewer: user
  permission view = viewer + group->member
}`;

    const result = diffSchema(local, remote);

    expect(result.hasChanges).toBe(true);
    expect(result.modified).toStrictEqual([
      {
        name: 'document',
        addedRelations: [],
        removedRelations: [],
        changedRelations: ['viewer'],
        addedPermissions: [],
        removedPermissions: [],
        changedPermissions: ['view'],
      },
    ]);
  });
});
