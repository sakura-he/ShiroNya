import { v1 } from '@authzed/authzed-node';
import { type Attributes, type Span, SpanKind, SpanStatusCode, trace as otelTrace } from '@opentelemetry/api';
import type { SpiceDbClient } from '../client/index.js';
import { SpiceDbToolkitError, wrapGrpcError } from '../common/errors.js';
import { buildConsistency } from '../common/consistency.js';
import {
  attachSpiceDbTraceToError,
  emitSpiceDbOperationTrace,
  finishSpiceDbOperationTrace,
  isSpiceDbNativeCheckDebugEnabled,
  readSpiceDbErrorCode,
  startSpiceDbOperationTrace,
  traceSpiceDbRpc,
} from '../common/tracing.js';
import type { SpiceDbOperationTrace, SpiceDbTracingOptions } from '../common/tracing.js';
import type {
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
} from './types.js';

export interface PermissionService {
  checkPermission(input: CheckPermissionInput): Promise<CheckPermissionResult>;
  checkBulkPermissions(input: CheckBulkPermissionsInput): Promise<CheckBulkPermissionsResult>;
  expandPermissionTree(input: ExpandPermissionInput): Promise<ExpandPermissionResult>;
  lookupResources(input: LookupResourcesInput): Promise<LookupResourcesResult>;
  lookupSubjects(input: LookupSubjectsInput): Promise<LookupSubjectsResult>;
}

export interface PermissionServiceOptions {
  tracing?: SpiceDbTracingOptions;
}

const spiceDbOtelTracer = otelTrace.getTracer('@spicedb-toolkit/core');

type TraceableCheckPermissionResult = CheckPermissionResult | CheckBulkPermissionsResult;

export function createPermissionService(client: SpiceDbClient, options: PermissionServiceOptions = {}): PermissionService {
  return {
    async checkPermission(input) {
      return withSpiceDbCheckSpan(
        'spicedb.checkPermission',
        buildCheckPermissionSpanAttributes(input),
        async (span) => {
          let traceStart: ReturnType<typeof startSpiceDbOperationTrace> = undefined;
          try {
            const request = v1.CheckPermissionRequest.create({
              consistency: buildConsistency(input.consistency),
              resource: v1.ObjectReference.create({
                objectType: input.resource.type,
                objectId: input.resource.id,
              }),
              permission: input.permission,
              subject: v1.SubjectReference.create({
                object: v1.ObjectReference.create({
                  objectType: input.subject.type,
                  objectId: input.subject.id,
                }),
                optionalRelation: input.subject.relation ?? '',
              }),
              context: input.context ? v1.PbStruct.fromJson(input.context as any) : undefined,
              withTracing: isSpiceDbNativeCheckDebugEnabled(options.tracing),
            });

            traceStart = startSpiceDbOperationTrace('CheckPermission', 1, options.tracing);
            const response = await client.promises.checkPermission(request);
            const trace = finishSpiceDbOperationTrace(
              traceStart,
              'success',
              undefined,
              1,
              response.debugTrace
            );
            emitSpiceDbOperationTrace(trace, options.tracing);

            const result: CheckPermissionResult = {
              allowed: response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
              checkedAt: (response as any).checkedAt?.token,
              trace,
            };
            if (response.debugTrace) {
              result.nativeDebug = response.debugTrace;
            }
            recordCheckPermissionSpanResult(span, result);
            return result;
          } catch (err) {
            const trace = finishSpiceDbOperationTrace(traceStart, 'error', readSpiceDbErrorCode(err));
            emitSpiceDbOperationTrace(trace, options.tracing);
            throw wrapGrpcError(attachSpiceDbTraceToError(err, trace));
          }
        }
      );
    },

    /**
     * 使用稳定版 CheckBulkPermissions RPC 批量检查权限，并按 oneof 响应提取每条结果。
     */
    async checkBulkPermissions(input) {
      if (input.items.length === 0) {
        throw new SpiceDbToolkitError('checkBulkPermissions requires at least one item', 'INVALID_ARGUMENT');
      }

      return withSpiceDbCheckSpan(
        'spicedb.checkBulkPermissions',
        buildCheckBulkPermissionsSpanAttributes(input),
        async (span) => {
          let traceStart: ReturnType<typeof startSpiceDbOperationTrace> = undefined;
          try {
            const items = input.items.map((item) =>
              v1.CheckBulkPermissionsRequestItem.create({
                resource: v1.ObjectReference.create({
                  objectType: item.resource.type,
                  objectId: item.resource.id,
                }),
                permission: item.permission,
                subject: v1.SubjectReference.create({
                  object: v1.ObjectReference.create({
                    objectType: item.subject.type,
                    objectId: item.subject.id,
                  }),
                  optionalRelation: item.subject.relation ?? '',
                }),
                context: item.context ? v1.PbStruct.fromJson(item.context as any) : undefined,
              })
            );

            const request = v1.CheckBulkPermissionsRequest.create({
              items,
              consistency: buildConsistency(input.consistency),
              withTracing: isSpiceDbNativeCheckDebugEnabled(options.tracing),
            });
            traceStart = startSpiceDbOperationTrace('CheckBulkPermissions', input.items.length, options.tracing);
            const response = await client.promises.checkBulkPermissions(request);
            const responseTrace = finishSpiceDbOperationTrace(traceStart, 'success', undefined, input.items.length);
            const pairs = response.pairs ?? [];
            if (pairs.length !== input.items.length) {
              throw attachSpiceDbTraceToError(
                new SpiceDbToolkitError(
                  `checkBulkPermissions response count mismatch: expected ${input.items.length}, got ${pairs.length}`,
                  'INVALID_RESPONSE'
                ),
                markTraceAsError(responseTrace, 'INVALID_RESPONSE')
              );
            }

            const results: CheckPermissionResult[] = pairs.map((pair: any) => {
              if (pair.response?.oneofKind === 'error') {
                // 单项检查失败必须暴露为错误，避免调用方把无法判断的权限误当作拒绝。
                throw attachSpiceDbTraceToError(
                  new SpiceDbToolkitError(
                    pair.response.error?.message ?? 'SpiceDB bulk permission check item failed',
                    'ITEM_ERROR'
                  ),
                  markTraceAsError(responseTrace, 'ITEM_ERROR')
                );
              }
              const resp = pair.response?.oneofKind === 'item' ? pair.response.item : undefined;
              const result: CheckPermissionResult = {
                allowed: resp?.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
                checkedAt: response.checkedAt?.token,
              };
              if (resp?.debugTrace) {
                result.nativeDebug = resp.debugTrace;
              }
              return result;
            });

            const nativeDebug = collectNativeCheckDebug(results);
            const successTrace = nativeDebug === undefined
              ? responseTrace
              : responseTrace
                ? { ...responseTrace, nativeDebug }
                : undefined;
            emitSpiceDbOperationTrace(successTrace, options.tracing);

            const result = {
              results,
              checkedAt: (response as any).checkedAt?.token,
              trace: successTrace,
              nativeDebug,
            };
            recordCheckBulkPermissionsSpanResult(span, result);
            return result;
          } catch (err) {
            const trace =
              (err as { trace?: ReturnType<typeof finishSpiceDbOperationTrace> })?.trace ??
              finishSpiceDbOperationTrace(traceStart, 'error', readSpiceDbErrorCode(err), input.items.length);
            emitSpiceDbOperationTrace(trace, options.tracing);
            throw wrapGrpcError(
              attachSpiceDbTraceToError(err, trace)
            );
          }
        }
      );
    },

    async expandPermissionTree(input) {
      try {
        const request = v1.ExpandPermissionTreeRequest.create({
          consistency: buildConsistency(input.consistency),
          resource: v1.ObjectReference.create({
            objectType: input.resource.type,
            objectId: input.resource.id,
          }),
          permission: input.permission,
        });

        const { value: response, trace } = await traceSpiceDbRpc(
          'ExpandPermissionTree',
          1,
          options.tracing,
          () => client.promises.expandPermissionTree(request)
        );

        return {
          tree: response.treeRoot,
          expandedAt: response.expandedAt?.token,
          trace,
        };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    /**
     * 分页查找拥有权限的资源，并通过多取一条记录判断是否还有下一页。
     */
    async lookupResources(input) {
      try {
        const pageWindow = createPageWindow(input.pageSize);
        const request = v1.LookupResourcesRequest.create({
          consistency: buildConsistency(input.consistency),
          resourceObjectType: input.resourceType,
          permission: input.permission,
          subject: v1.SubjectReference.create({
            object: v1.ObjectReference.create({
              objectType: input.subject.type,
              objectId: input.subject.id,
            }),
            optionalRelation: input.subject.relation ?? '',
          }),
          context: input.context ? v1.PbStruct.fromJson(input.context as any) : undefined,
          optionalLimit: pageWindow.requestLimit,
          optionalCursor: buildCursor(input.cursor),
        });

        const { value: responses, trace } = await traceSpiceDbRpc(
          'LookupResources',
          undefined,
          options.tracing,
          () => client.promises.lookupResources(request),
          { resolveCount: (value) => (value as any[]).length }
        );
        const visibleResponses = trimPage(responses as any[], pageWindow.visibleLimit);
        const hasMore = resolveHasMore(responses as any[], visibleResponses, pageWindow);

        const resources = visibleResponses.map((r: any) => ({
          id: r.resourceObjectId,
          permissionship: r.permissionship === v1.LookupPermissionship.HAS_PERMISSION
            ? 'has_permission' as const
            : 'conditional_permission' as const,
        }));

        return {
          resources,
          lookedUpAt: visibleResponses[0]?.lookedUpAt?.token,
          cursor: hasMore ? visibleResponses[visibleResponses.length - 1]?.afterResultCursor?.token : undefined,
          hasMore,
          trace,
        };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },

    /**
     * 查找拥有权限的主体；LookupSubjects 的 limit 当前在 SpiceDB 中未实现，因此只透传 cursor。
     */
    async lookupSubjects(input) {
      try {
        const request = v1.LookupSubjectsRequest.create({
          consistency: buildConsistency(input.consistency),
          resource: v1.ObjectReference.create({
            objectType: input.resource.type,
            objectId: input.resource.id,
          }),
          permission: input.permission,
          subjectObjectType: input.subjectType,
          optionalSubjectRelation: input.subjectRelation ?? '',
          context: input.context ? v1.PbStruct.fromJson(input.context as any) : undefined,
          optionalCursor: buildCursor(input.cursor),
        });

        const { value: responses, trace } = await traceSpiceDbRpc(
          'LookupSubjects',
          undefined,
          options.tracing,
          () => client.promises.lookupSubjects(request),
          { resolveCount: (value) => (value as any[]).length }
        );

        const subjects = (responses as any[]).map((r: any) => ({
          id: r.subject?.subjectObjectId ?? r.subjectObjectId ?? '',
          permissionship: (r.subject?.permissionship ?? r.permissionship) === v1.LookupPermissionship.HAS_PERMISSION
            ? 'has_permission' as const
            : 'conditional_permission' as const,
        }));

        return {
          subjects,
          lookedUpAt: (responses as any)[0]?.lookedUpAt?.token,
          cursor: (responses as any[]).at(-1)?.afterResultCursor?.token,
          hasMore: false,
          trace,
        };
      } catch (err) {
        throw wrapGrpcError(err);
      }
    },
  };
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

export type { CheckPermissionInput, CheckPermissionResult, CheckBulkPermissionsInput, CheckBulkPermissionsResult, ExpandPermissionInput, ExpandPermissionResult, LookupResourcesInput, LookupResourcesResult, LookupSubjectsInput, LookupSubjectsResult } from './types.js';

async function withSpiceDbCheckSpan<T>(
  name: string,
  attributes: Attributes,
  callback: (span: Span) => Promise<T>
): Promise<T> {
  return spiceDbOtelTracer.startActiveSpan(
    name,
    {
      kind: SpanKind.CLIENT,
      attributes,
    },
    async (span) => {
      try {
        return await callback(span);
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

function buildCheckPermissionSpanAttributes(input: CheckPermissionInput): Attributes {
  return removeUndefinedAttributes({
    'db.system': 'spicedb',
    'db.operation.name': 'CheckPermission',
    'spicedb.operation': 'CheckPermission',
    'spicedb.resource': formatSpiceDbResource(input.resource),
    'spicedb.resource.type': input.resource.type,
    'spicedb.resource.id': input.resource.id,
    'spicedb.permission': input.permission,
    'spicedb.subject': formatSpiceDbSubject(input.subject),
    'spicedb.subject.type': input.subject.type,
    'spicedb.subject.id': input.subject.id,
    'spicedb.subject.relation': input.subject.relation,
  });
}

function buildCheckBulkPermissionsSpanAttributes(input: CheckBulkPermissionsInput): Attributes {
  const resources = uniqueSpanAttributeValues(input.items.map((item) => formatSpiceDbResource(item.resource)));
  const subjects = uniqueSpanAttributeValues(input.items.map((item) => formatSpiceDbSubject(item.subject)));
  const permissions = uniqueSpanAttributeValues(input.items.map((item) => item.permission));

  return removeUndefinedAttributes({
    'db.system': 'spicedb',
    'db.operation.name': 'CheckBulkPermissions',
    'spicedb.operation': 'CheckBulkPermissions',
    'spicedb.bulk.item_count': input.items.length,
    'spicedb.resource': resources.length === 1 ? resources[0] : undefined,
    'spicedb.resource.count': resources.length,
    'spicedb.permission': permissions.length === 1 ? permissions[0] : undefined,
    'spicedb.permission.count': permissions.length,
    'spicedb.permissions': permissions,
    'spicedb.subject': subjects.length === 1 ? subjects[0] : undefined,
    'spicedb.subject.count': subjects.length,
  });
}

function recordCheckPermissionSpanResult(span: Span, result: CheckPermissionResult): void {
  span.setAttribute('spicedb.allowed', result.allowed);
  recordNativeTraceDuration(span, result);
}

function recordCheckBulkPermissionsSpanResult(span: Span, result: CheckBulkPermissionsResult): void {
  const allowedCount = result.results.filter((item) => item.allowed).length;
  span.setAttribute('spicedb.bulk.result_count', result.results.length);
  span.setAttribute('spicedb.bulk.allowed_count', allowedCount);
  span.setAttribute('spicedb.bulk.denied_count', result.results.length - allowedCount);
  recordNativeTraceDuration(span, result);
}

function recordNativeTraceDuration(span: Span, result: TraceableCheckPermissionResult): void {
  if (typeof result.trace?.durationMs === 'number') {
    span.setAttribute('spicedb.native.duration_ms', result.trace.durationMs);
  }
}

function formatSpiceDbResource(resource: CheckPermissionInput['resource']): string {
  return `${resource.type}:${resource.id}`;
}

function formatSpiceDbSubject(subject: CheckPermissionInput['subject']): string {
  return subject.relation ? `${subject.type}:${subject.id}#${subject.relation}` : `${subject.type}:${subject.id}`;
}

function uniqueSpanAttributeValues(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function removeUndefinedAttributes(attributes: Record<string, Attributes[string] | undefined>): Attributes {
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)) as Attributes;
}

function markTraceAsError(trace: SpiceDbOperationTrace | undefined, errorCode: string): SpiceDbOperationTrace | undefined {
  return trace
    ? {
        ...trace,
        status: 'error',
        errorCode,
      }
    : undefined;
}

function collectNativeCheckDebug(results: CheckPermissionResult[]): unknown {
  const debugItems = results.map((result, index) => ({
    index,
    debug: result.nativeDebug,
  })).filter((item) => item.debug !== undefined);

  return debugItems.length > 0 ? { items: debugItems } : undefined;
}
