import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { SPICEDB_PERMISSION_METADATA_KEY, SPICEDB_RESOLVERS_METADATA_KEY } from '../src/constant.js';

// We need reflect-metadata to test decorators
describe('SpiceDbPermission decorator', () => {
  it('should set metadata with string permission', async () => {
    const { SpiceDbPermission } = await import('../src/decorators.js');

    class TestController {
      @(SpiceDbPermission('view') as MethodDecorator)
      getDocument() {}
    }

    const metadata = Reflect.getMetadata(SPICEDB_PERMISSION_METADATA_KEY, TestController.prototype.getDocument);
    expect(metadata).toStrictEqual({ permission: 'view' });
  });

  it('should set metadata with array of permissions', async () => {
    const { SpiceDbPermission } = await import('../src/decorators.js');

    class TestController {
      @(SpiceDbPermission(['view', 'edit']) as MethodDecorator)
      getDocument() {}
    }

    const metadata = Reflect.getMetadata(SPICEDB_PERMISSION_METADATA_KEY, TestController.prototype.getDocument);
    expect(metadata.permissions).toStrictEqual(['view', 'edit']);
    expect(metadata.mode).toBe('OR');
  });

  it('should set metadata with full config object', async () => {
    const { SpiceDbPermission } = await import('../src/decorators.js');

    class TestController {
      @(SpiceDbPermission({
        permission: 'edit',
        resourceType: 'document',
        resourceId: 'doc1',
      }) as MethodDecorator)
      editDocument() {}
    }

    const metadata = Reflect.getMetadata(SPICEDB_PERMISSION_METADATA_KEY, TestController.prototype.editDocument);
    expect(metadata.permission).toBe('edit');
    expect(metadata.resourceType).toBe('document');
    expect(metadata.resourceId).toBe('doc1');
  });
});

describe('SpiceDbResolvers decorator', () => {
  it('should set resolvers metadata', async () => {
    const { SpiceDbResolvers } = await import('../src/decorators.js');

    const subjectFn = () => ({ type: 'user', id: '1' });

    class TestController {
      @(SpiceDbResolvers({ subject: subjectFn }) as MethodDecorator)
      handler() {}
    }

    const metadata = Reflect.getMetadata(SPICEDB_RESOLVERS_METADATA_KEY, TestController.prototype.handler);
    expect(metadata.subject).toBe(subjectFn);
  });
});
