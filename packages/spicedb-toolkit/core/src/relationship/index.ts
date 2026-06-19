import { v1 } from '@authzed/authzed-node';
import type { SpiceDbClient } from '../client/index.js';
import { SpiceDbToolkitError, wrapGrpcError } from '../common/errors.js';
import { buildConsistency } from '../common/consistency.js';
import { attachSpiceDbTrace, traceSpiceDbRpc } from '../common/tracing.js';
import type { SpiceDbTracingOptions } from '../common/tracing.js';
import { createRelationshipProto } from '../helpers.js';
import type {
  WriteRelationshipsInput,
  WriteRelationshipsResult,
  DeleteRelationshipsInput,
  DeleteRelationshipsResult,
  ReadRelationshipsInput,
  ReadRelationshipsResult,
  TouchRelationshipsInput,
  RelationshipInput,
  RelationshipOutput,
  ExportBulkRelationshipsInput,
  ImportBulkRelationshipsInput,
  RelationshipFilter,
} from './types.js';

export interface RelationshipService {
  writeRelationships(input: WriteRelationshipsInput): Promise<WriteRelationshipsResult>;
  deleteRelationships(input: DeleteRelationshipsInput): Promise<DeleteRelationshipsResult>;
  readRelationships(input: ReadRelationshipsInput): Promise<ReadRelationshipsResult>;
  touchRelationships(input: TouchRelationshipsInput): Promise<WriteRelationshipsResult>;
  importBulkRelationships(input: ImportBulkRelationshipsInput): Promise<void>;
  exportBulkRelationships(input: ExportBulkRelationshipsInput): Promise<RelationshipOutput[]>;
}

export interface RelationshipServiceOptions {
  tracing?: SpiceDbTracingOptions;
}

export function createRelationshipService(client: SpiceDbClient, options: RelationshipServiceOptions = {}): RelationshipService {
  return {
    async writeRelationships(input) {
      try {
        const updates = input.updates.map((u) =>
          v1.RelationshipUpdate.create({
            operation: operationToProto(u.operation),
            relationship: createRelationshipProto(u.relationship),
          })
        );

        const request = v1.WriteRelationshipsRequest.create({ updates });
        const { value: response, trace } = await traceSpiceDbRpc(
          'WriteRelationships',
          input.updates.length,
          options.tracing,
          () => client.promises.writeRelationships(request)
        );

        return { writtenAt: response.writtenAt?.token, trace };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    async deleteRelationships(input) {
      try {
        const request = v1.DeleteRelationshipsRequest.create({
          relationshipFilter: buildFilter(input.filter),
        });

        const { value: response, trace } = await traceSpiceDbRpc(
          'DeleteRelationships',
          1,
          options.tracing,
          () => client.promises.deleteRelationships(request)
        );
        return { deletedAt: response.deletedAt?.token, trace };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    /**
     * 按过滤器读取 relationships，并通过多取一条记录判断是否还有下一页。
     */
    async readRelationships(input) {
      try {
        const pageWindow = createPageWindow(input.pageSize);
        const request = v1.ReadRelationshipsRequest.create({
          relationshipFilter: buildFilter(input.filter),
          consistency: buildConsistency(input.consistency),
          optionalLimit: pageWindow.requestLimit,
          optionalCursor: buildCursor(input.cursor),
        });

        const { value: responses, trace } = await traceSpiceDbRpc(
          'ReadRelationships',
          undefined,
          options.tracing,
          () => client.promises.readRelationships(request),
          { resolveCount: (value) => value.length }
        );
        const visibleResponses = trimPage(responses, pageWindow.visibleLimit);
        const hasMore = resolveHasMore(responses, visibleResponses, pageWindow);

        const relationships: RelationshipOutput[] = visibleResponses.map((r) => ({
          resource: {
            type: r.relationship?.resource?.objectType ?? '',
            id: r.relationship?.resource?.objectId ?? '',
          },
          relation: r.relationship?.relation ?? '',
          subject: {
            type: r.relationship?.subject?.object?.objectType ?? '',
            id: r.relationship?.subject?.object?.objectId ?? '',
            relation: r.relationship?.subject?.optionalRelation || undefined,
          },
          caveat: r.relationship?.optionalCaveat
            ? {
                name: r.relationship.optionalCaveat.caveatName,
                context: r.relationship.optionalCaveat.context
                  ? (v1.PbStruct.toJson(r.relationship.optionalCaveat.context) as Record<string, unknown>)
                  : undefined,
              }
            : undefined,
        }));

        return {
          relationships,
          readAt: visibleResponses[0]?.readAt?.token,
          cursor: hasMore ? visibleResponses[visibleResponses.length - 1]?.afterResultCursor?.token : undefined,
          hasMore,
          trace,
        };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    async touchRelationships(input) {
      try {
        const updates = input.relationships.map((rel) =>
          v1.RelationshipUpdate.create({
            operation: v1.RelationshipUpdate_Operation.TOUCH,
            relationship: createRelationshipProto(rel),
          })
        );

        const request = v1.WriteRelationshipsRequest.create({ updates });
        const { value: response, trace } = await traceSpiceDbRpc(
          'WriteRelationships',
          input.relationships.length,
          options.tracing,
          () => client.promises.writeRelationships(request)
        );

        return { writtenAt: response.writtenAt?.token, trace };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    async importBulkRelationships(input) {
      try {
        const relationships = input.relationships.map(createRelationshipProto);
        // importBulkRelationships is a client-streaming RPC
        // Use writeRelationships with TOUCH operations as the standard approach
        const updates = relationships.map((rel) =>
          v1.RelationshipUpdate.create({
            operation: v1.RelationshipUpdate_Operation.TOUCH,
            relationship: rel,
          })
        );
        const request = v1.WriteRelationshipsRequest.create({ updates });
        await traceSpiceDbRpc(
          'WriteRelationships',
          input.relationships.length,
          options.tracing,
          () => client.promises.writeRelationships(request)
        );
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    async exportBulkRelationships(input) {
      try {
        const filter = input.filter
          ? buildFilter(input.filter)
          : v1.RelationshipFilter.create({ resourceType: '' });

        const request = v1.ExportBulkRelationshipsRequest.create({
          optionalRelationshipFilter: filter,
        });

        const { value: responses, trace } = await traceSpiceDbRpc(
          'ExportBulkRelationships',
          undefined,
          options.tracing,
          () => client.promises.exportBulkRelationships(request),
          { resolveCount: (value) => value.reduce((total, resp) => total + (resp.relationships?.length ?? 0), 0) }
        );

        const allRelationships: RelationshipOutput[] = [];
        for (const resp of responses) {
          for (const rel of resp.relationships ?? []) {
            allRelationships.push({
              resource: {
                type: rel.resource?.objectType ?? '',
                id: rel.resource?.objectId ?? '',
              },
              relation: rel.relation ?? '',
              subject: {
                type: rel.subject?.object?.objectType ?? '',
                id: rel.subject?.object?.objectId ?? '',
                relation: rel.subject?.optionalRelation || undefined,
              },
            });
          }
        }

        return attachSpiceDbTrace(allRelationships, trace);
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },
  };
}

function operationToProto(op: string): v1.RelationshipUpdate_Operation {
  switch (op) {
    case 'create':
      return v1.RelationshipUpdate_Operation.CREATE;
    case 'touch':
      return v1.RelationshipUpdate_Operation.TOUCH;
    case 'delete':
      return v1.RelationshipUpdate_Operation.DELETE;
    default:
      return v1.RelationshipUpdate_Operation.CREATE;
  }
}

function buildFilter(filter: RelationshipFilter) {
  return v1.RelationshipFilter.create({
    resourceType: filter.resourceType,
    optionalResourceId: filter.resourceId ?? '',
    optionalRelation: filter.relation ?? '',
    optionalSubjectFilter: filter.subjectFilter
      ? v1.SubjectFilter.create({
          subjectType: filter.subjectFilter.type,
          optionalSubjectId: filter.subjectFilter.id ?? '',
          optionalRelation: filter.subjectFilter.relation
            ? v1.SubjectFilter_RelationFilter.create({
                relation: filter.subjectFilter.relation,
              })
            : undefined,
        })
      : undefined,
  });
}

/**
 * SpiceDB 当前稳定接口拒绝超过 1000 的 stream limit。
 */
const SPICEDB_MAX_PAGE_SIZE = 1000;

/**
 * 根据业务请求页大小生成 SpiceDB stream limit，多取一条用于判断 hasMore。
 */
function createPageWindow(pageSize?: number): { requestLimit: number; visibleLimit?: number; usesLookahead: boolean } {
  if (pageSize === undefined) {
    return { requestLimit: 0, usesLookahead: false };
  }

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new SpiceDbToolkitError('pageSize must be a positive integer', 'INVALID_ARGUMENT');
  }
  if (pageSize > SPICEDB_MAX_PAGE_SIZE) {
    throw new SpiceDbToolkitError(`pageSize must be less than or equal to ${SPICEDB_MAX_PAGE_SIZE}`, 'INVALID_ARGUMENT');
  }

  const requestLimit = Math.min(pageSize + 1, SPICEDB_MAX_PAGE_SIZE);
  return {
    requestLimit,
    visibleLimit: pageSize,
    usesLookahead: requestLimit > pageSize,
  };
}

/**
 * 将字符串 cursor 转成 Authzed Cursor proto；空字符串表示不指定游标。
 */
function buildCursor(cursor?: string): v1.Cursor | undefined {
  return cursor ? v1.Cursor.create({ token: cursor }) : undefined;
}

/**
 * 将多取的一条记录裁掉，保证调用方收到的记录数不超过 pageSize。
 */
function trimPage<T>(items: T[], visibleLimit?: number): T[] {
  return visibleLimit === undefined ? items : items.slice(0, visibleLimit);
}

/**
 * 根据是否成功多取一条记录判断下一页；达到 SpiceDB limit 上限时保守返回游标。
 */
function resolveHasMore(
  responses: Array<{ afterResultCursor?: { token?: string } }>,
  visibleResponses: Array<{ afterResultCursor?: { token?: string } }>,
  pageWindow: { visibleLimit?: number; usesLookahead: boolean }
): boolean {
  if (pageWindow.visibleLimit === undefined || visibleResponses.length === 0) {
    return false;
  }

  if (pageWindow.usesLookahead) {
    return responses.length > pageWindow.visibleLimit;
  }

  return responses.length === pageWindow.visibleLimit && Boolean(visibleResponses[visibleResponses.length - 1]?.afterResultCursor?.token);
}

export type {
  WriteRelationshipsInput,
  WriteRelationshipsResult,
  DeleteRelationshipsInput,
  DeleteRelationshipsResult,
  ReadRelationshipsInput,
  ReadRelationshipsResult,
  TouchRelationshipsInput,
  RelationshipInput,
  RelationshipOutput,
  RelationshipFilter,
  RelationshipOperation,
  ExportBulkRelationshipsInput,
  ImportBulkRelationshipsInput,
} from './types.js';
