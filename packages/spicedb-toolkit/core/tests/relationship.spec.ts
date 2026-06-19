import { describe, expect, it, vi } from 'vitest';
import type { SpiceDbClient } from '../src/client/index.js';
import { createRelationshipService } from '../src/relationship/index.js';

/**
 * 构造 readRelationships stream 响应，便于断言分页游标和关系转换。
 */
const createReadResponse = (objectId: string, cursor: string, zedToken = `zed-${objectId}`) => ({
  readAt: { token: zedToken },
  afterResultCursor: { token: cursor },
  relationship: {
    resource: {
      objectType: 'document',
      objectId,
    },
    relation: 'viewer',
    subject: {
      object: {
        objectType: 'user',
        objectId: `user-${objectId}`,
      },
      optionalRelation: '',
    },
  },
});

describe('relationship service', () => {
  it('should pass cursor pagination to readRelationships and trim the lookahead row', async () => {
    const readRelationships = vi.fn().mockResolvedValue([
      createReadResponse('1', 'cursor-1'),
      createReadResponse('2', 'cursor-2'),
      createReadResponse('3', 'cursor-3'),
    ]);
    const service = createRelationshipService({
      promises: {
        readRelationships,
      },
    } as unknown as SpiceDbClient);

    const result = await service.readRelationships({
      filter: {
        resourceType: 'document',
      },
      pageSize: 2,
      cursor: 'incoming-cursor',
    });

    expect(readRelationships).toHaveBeenCalledTimes(1);
    expect(readRelationships.mock.calls[0][0].optionalLimit).toBe(3);
    expect(readRelationships.mock.calls[0][0].optionalCursor?.token).toBe('incoming-cursor');
    expect(result.relationships.map((relationship) => relationship.resource.id)).toStrictEqual(['1', '2']);
    expect(result.readAt).toBe('zed-1');
    expect(result.cursor).toBe('cursor-2');
    expect(result.hasMore).toBe(true);
  });

  it('should report no next page when readRelationships returns fewer rows than the page size', async () => {
    const readRelationships = vi.fn().mockResolvedValue([createReadResponse('1', 'cursor-1')]);
    const service = createRelationshipService({
      promises: {
        readRelationships,
      },
    } as unknown as SpiceDbClient);

    const result = await service.readRelationships({
      filter: {
        resourceType: 'document',
      },
      pageSize: 2,
    });

    expect(result.relationships.map((relationship) => relationship.resource.id)).toStrictEqual(['1']);
    expect(result.cursor).toBeUndefined();
    expect(result.hasMore).toBe(false);
  });

  it('should not request more than the SpiceDB maximum page size', async () => {
    const readRelationships = vi.fn().mockResolvedValue([createReadResponse('1', 'cursor-1')]);
    const service = createRelationshipService({
      promises: {
        readRelationships,
      },
    } as unknown as SpiceDbClient);

    await service.readRelationships({
      filter: {
        resourceType: 'document',
      },
      pageSize: 1000,
    });

    expect(readRelationships.mock.calls[0][0].optionalLimit).toBe(1000);
  });

  it('should trace the full readRelationships SpiceDB RPC round trip', async () => {
    const readRelationships = vi.fn().mockResolvedValue([createReadResponse('1', 'cursor-1')]);
    const onTrace = vi.fn();
    const service = createRelationshipService(
      {
        promises: {
          readRelationships,
        },
      } as unknown as SpiceDbClient,
      {
        tracing: {
          onTrace,
        },
      }
    );

    const result = await service.readRelationships({
      filter: {
        resourceType: 'document',
      },
    });

    expect(readRelationships).toHaveBeenCalledTimes(1);
    expect(result.trace).toMatchObject({
      operation: 'ReadRelationships',
      status: 'success',
      count: 1,
    });
    expect(onTrace).toHaveBeenCalledWith(result.trace);
  });
});
