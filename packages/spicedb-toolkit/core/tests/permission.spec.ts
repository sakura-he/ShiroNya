import { v1 } from '@authzed/authzed-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpiceDbClient } from '../src/client/index.js';
import { createPermissionService } from '../src/permission/index.js';

const otelMocks = vi.hoisted(() => {
  const mockSpan = {
    setAttribute: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  };

  return {
    mockSpan,
    mockStartActiveSpan: vi.fn((_name: string, _options: unknown, callback: (span: typeof mockSpan) => unknown) =>
      callback(mockSpan)
    ),
  };
});

vi.mock('@opentelemetry/api', () => ({
  SpanKind: {
    CLIENT: 2,
  },
  SpanStatusCode: {
    ERROR: 2,
  },
  trace: {
    getTracer: vi.fn(() => ({
      startActiveSpan: otelMocks.mockStartActiveSpan,
    })),
  },
}));

/**
 * 构造 lookupResources stream 响应，便于断言分页游标和权限状态转换。
 */
const createLookupResourceResponse = (resourceId: string, cursor: string, zedToken = `zed-${resourceId}`) => ({
  lookedUpAt: { token: zedToken },
  resourceObjectId: resourceId,
  permissionship: v1.LookupPermissionship.HAS_PERMISSION,
  afterResultCursor: { token: cursor },
});

describe('permission service', () => {
  beforeEach(() => {
    otelMocks.mockStartActiveSpan.mockClear();
    otelMocks.mockSpan.setAttribute.mockClear();
    otelMocks.mockSpan.recordException.mockClear();
    otelMocks.mockSpan.setStatus.mockClear();
    otelMocks.mockSpan.end.mockClear();
  });

  it('should parse checkBulkPermissions item oneof responses in input order', async () => {
    const checkBulkPermissions = vi.fn().mockResolvedValue({
      checkedAt: { token: 'zed-token' },
      pairs: [
        {
          response: {
            oneofKind: 'item',
            item: {
              permissionship: v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
            },
          },
        },
        {
          response: {
            oneofKind: 'item',
            item: {
              permissionship: v1.CheckPermissionResponse_Permissionship.NO_PERMISSION,
            },
          },
        },
      ],
    });
    const bulkCheckPermission = vi.fn();
    const service = createPermissionService({
      promises: {
        checkBulkPermissions,
        bulkCheckPermission,
      },
    } as unknown as SpiceDbClient);

    const result = await service.checkBulkPermissions({
      items: [
        {
          resource: { type: 'role', id: '2' },
          permission: 'update',
          subject: { type: 'user', id: 'admin' },
        },
        {
          resource: { type: 'role', id: '4' },
          permission: 'update',
          subject: { type: 'user', id: 'admin' },
        },
      ],
    });

    expect(bulkCheckPermission).not.toHaveBeenCalled();
    expect(checkBulkPermissions).toHaveBeenCalledTimes(1);
    expect(checkBulkPermissions.mock.calls[0][0].items.map((item: any) => item.resource?.objectId)).toStrictEqual([
      '2',
      '4',
    ]);
    expect(checkBulkPermissions.mock.calls[0][0].withTracing).toBe(false);
    expect(result.results).toStrictEqual([
      { allowed: true, checkedAt: 'zed-token' },
      { allowed: false, checkedAt: 'zed-token' },
    ]);
    expect(result.checkedAt).toBe('zed-token');
    expect(result.trace).toMatchObject({
      operation: 'CheckBulkPermissions',
      status: 'success',
      count: 2,
    });
    expect(result.trace?.durationMs).toEqual(expect.any(Number));
    expect(otelMocks.mockStartActiveSpan).toHaveBeenCalledWith(
      'spicedb.checkBulkPermissions',
      expect.objectContaining({
        kind: 2,
        attributes: expect.objectContaining({
          'db.system': 'spicedb',
          'db.operation.name': 'CheckBulkPermissions',
          'spicedb.bulk.item_count': 2,
          'spicedb.permission': 'update',
          'spicedb.resource.count': 2,
          'spicedb.subject': 'user:admin',
        }),
      }),
      expect.any(Function)
    );
    expect(otelMocks.mockSpan.setAttribute).toHaveBeenCalledWith('spicedb.bulk.result_count', 2);
    expect(otelMocks.mockSpan.setAttribute).toHaveBeenCalledWith('spicedb.bulk.allowed_count', 1);
    expect(otelMocks.mockSpan.setAttribute).toHaveBeenCalledWith('spicedb.bulk.denied_count', 1);
    expect(otelMocks.mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('should omit checkBulkPermissions trace when tracing is disabled', async () => {
    const checkBulkPermissions = vi.fn().mockResolvedValue({
      checkedAt: { token: 'zed-token' },
      pairs: [
        {
          response: {
            oneofKind: 'item',
            item: {
              permissionship: v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
            },
          },
        },
      ],
    });
    const service = createPermissionService(
      {
        promises: {
          checkBulkPermissions,
        },
      } as unknown as SpiceDbClient,
      {
        tracing: {
          enabled: false,
        },
      }
    );

    const result = await service.checkBulkPermissions({
      items: [
        {
          resource: { type: 'role', id: '2' },
          permission: 'update',
          subject: { type: 'user', id: 'admin' },
        },
      ],
    });

    expect(result.results).toStrictEqual([{ allowed: true, checkedAt: 'zed-token' }]);
    expect(result.trace).toBeUndefined();
  });

  it('should throw when a checkBulkPermissions pair contains an item error', async () => {
    const service = createPermissionService({
      promises: {
        checkBulkPermissions: vi.fn().mockResolvedValue({
          pairs: [
            {
              response: {
                oneofKind: 'error',
                error: {
                  message: 'invalid permission',
                },
              },
            },
          ],
        }),
      },
    } as unknown as SpiceDbClient);

    await expect(
      service.checkBulkPermissions({
        items: [
          {
            resource: { type: 'role', id: '2' },
            permission: 'missing',
            subject: { type: 'user', id: 'admin' },
          },
        ],
      })
    ).rejects.toMatchObject({
      message: 'invalid permission',
      trace: {
        operation: 'CheckBulkPermissions',
        status: 'error',
        count: 1,
        errorCode: 'ITEM_ERROR',
      },
    });
  });

  it('should reject empty checkBulkPermissions input', async () => {
    const checkBulkPermissions = vi.fn();
    const service = createPermissionService({
      promises: {
        checkBulkPermissions,
      },
    } as unknown as SpiceDbClient);

    await expect(service.checkBulkPermissions({ items: [] })).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(service.checkBulkPermissions({ items: [] })).rejects.toMatchObject({
      trace: undefined,
    });
    expect(checkBulkPermissions).not.toHaveBeenCalled();
  });

  it('should request and return native SpiceDB debug trace for permission checks only when enabled', async () => {
    const nativeDebug = {
      schemaUsed: 'definition user {}',
      check: {
        permission: 'view',
        traceOperationId: 'trace-1',
      },
    };
    const checkPermission = vi.fn().mockResolvedValue({
      checkedAt: { token: 'zed-token' },
      permissionship: v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
      debugTrace: nativeDebug,
    });
    const onTrace = vi.fn();
    const service = createPermissionService(
      {
        promises: {
          checkPermission,
        },
      } as unknown as SpiceDbClient,
      {
        tracing: {
          nativeCheckDebug: true,
          onTrace,
        },
      }
    );

    const result = await service.checkPermission({
      resource: { type: 'document', id: 'doc1' },
      permission: 'view',
      subject: { type: 'user', id: 'alice' },
    });

    expect(checkPermission).toHaveBeenCalledTimes(1);
    expect(checkPermission.mock.calls[0][0].withTracing).toBe(true);
    expect(result.nativeDebug).toBe(nativeDebug);
    expect(result.trace?.nativeDebug).toBe(nativeDebug);
    expect(otelMocks.mockStartActiveSpan).toHaveBeenCalledWith(
      'spicedb.checkPermission',
      expect.objectContaining({
        kind: 2,
        attributes: expect.objectContaining({
          'db.system': 'spicedb',
          'db.operation.name': 'CheckPermission',
          'spicedb.resource': 'document:doc1',
          'spicedb.permission': 'view',
          'spicedb.subject': 'user:alice',
        }),
      }),
      expect.any(Function)
    );
    expect(otelMocks.mockSpan.setAttribute).toHaveBeenCalledWith('spicedb.allowed', true);
    expect(otelMocks.mockSpan.end).toHaveBeenCalledTimes(1);
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'CheckPermission',
      status: 'success',
      nativeDebug,
    }));
  });

  it('should reject checkBulkPermissions response count mismatch', async () => {
    const checkBulkPermissions = vi.fn().mockResolvedValue({
      checkedAt: { token: 'zed-token' },
      pairs: [],
    });
    const service = createPermissionService({
      promises: {
        checkBulkPermissions,
      },
    } as unknown as SpiceDbClient);

    await expect(
      service.checkBulkPermissions({
        items: [
          {
            resource: { type: 'role', id: '2' },
            permission: 'update',
            subject: { type: 'user', id: 'admin' },
          },
        ],
      })
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      trace: {
        operation: 'CheckBulkPermissions',
        status: 'error',
        count: 1,
        errorCode: 'INVALID_RESPONSE',
      },
    });
  });

  it('should pass cursor pagination to lookupResources and trim the lookahead row', async () => {
    const lookupResources = vi.fn().mockResolvedValue([
      createLookupResourceResponse('1', 'cursor-1'),
      createLookupResourceResponse('2', 'cursor-2'),
      createLookupResourceResponse('3', 'cursor-3'),
    ]);
    const service = createPermissionService({
      promises: {
        lookupResources,
      },
    } as unknown as SpiceDbClient);

    const result = await service.lookupResources({
      resourceType: 'document',
      permission: 'view',
      subject: {
        type: 'user',
        id: 'alice',
      },
      pageSize: 2,
      cursor: 'incoming-cursor',
    });

    expect(lookupResources).toHaveBeenCalledTimes(1);
    expect(lookupResources.mock.calls[0][0].optionalLimit).toBe(3);
    expect(lookupResources.mock.calls[0][0].optionalCursor?.token).toBe('incoming-cursor');
    expect(result.resources.map((resource) => resource.id)).toStrictEqual(['1', '2']);
    expect(result.lookedUpAt).toBe('zed-1');
    expect(result.cursor).toBe('cursor-2');
    expect(result.hasMore).toBe(true);
  });

  it('should not request lookupResources beyond the SpiceDB maximum page size', async () => {
    const lookupResources = vi.fn().mockResolvedValue([createLookupResourceResponse('1', 'cursor-1')]);
    const service = createPermissionService({
      promises: {
        lookupResources,
      },
    } as unknown as SpiceDbClient);

    await service.lookupResources({
      resourceType: 'document',
      permission: 'view',
      subject: {
        type: 'user',
        id: 'alice',
      },
      pageSize: 1000,
    });

    expect(lookupResources.mock.calls[0][0].optionalLimit).toBe(1000);
  });

  it('should read resolved subject fields from lookupSubjects responses', async () => {
    const lookupSubjects = vi.fn().mockResolvedValue([
      {
        lookedUpAt: { token: 'zed-subject' },
        afterResultCursor: { token: 'subject-cursor' },
        subject: {
          subjectObjectId: 'alice',
          permissionship: v1.LookupPermissionship.HAS_PERMISSION,
        },
      },
    ]);
    const service = createPermissionService({
      promises: {
        lookupSubjects,
      },
    } as unknown as SpiceDbClient);

    const result = await service.lookupSubjects({
      resource: {
        type: 'document',
        id: 'doc1',
      },
      permission: 'view',
      subjectType: 'user',
      cursor: 'incoming-cursor',
    });

    expect(lookupSubjects).toHaveBeenCalledTimes(1);
    expect(lookupSubjects.mock.calls[0][0].optionalCursor?.token).toBe('incoming-cursor');
    expect(result.subjects).toStrictEqual([
      {
        id: 'alice',
        permissionship: 'has_permission',
      },
    ]);
    expect(result.lookedUpAt).toBe('zed-subject');
    expect(result.cursor).toBe('subject-cursor');
    expect(result.hasMore).toBe(false);
  });
});
