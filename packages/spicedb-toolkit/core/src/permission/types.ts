import type { ConsistencyOption } from '../common/consistency.js';
import type { SpiceDbOperationTrace } from '../common/tracing.js';

export interface CheckPermissionInput {
  resource: { type: string; id: string };
  permission: string;
  subject: { type: string; id: string; relation?: string };
  context?: Record<string, unknown>;
  consistency?: ConsistencyOption;
}

export interface CheckPermissionResult {
  allowed: boolean;
  checkedAt?: string;
  trace?: SpiceDbOperationTrace;
  nativeDebug?: unknown;
}

export interface CheckBulkPermissionsInput {
  items: CheckPermissionInput[];
  consistency?: ConsistencyOption;
}

export interface CheckBulkPermissionsResult {
  results: CheckPermissionResult[];
  checkedAt?: string;
  trace?: SpiceDbOperationTrace;
  nativeDebug?: unknown;
}

export interface ExpandPermissionInput {
  resource: { type: string; id: string };
  permission: string;
  consistency?: ConsistencyOption;
}

export interface ExpandPermissionResult {
  tree: unknown; // Raw SpiceDB permission tree node
  expandedAt?: string;
  trace?: SpiceDbOperationTrace;
}

export interface LookupResourcesInput {
  resourceType: string;
  permission: string;
  subject: { type: string; id: string; relation?: string };
  context?: Record<string, unknown>;
  consistency?: ConsistencyOption;
  pageSize?: number;
  cursor?: string;
}

export interface LookupResourcesResult {
  resources: Array<{
    id: string;
    permissionship: 'has_permission' | 'conditional_permission';
  }>;
  lookedUpAt?: string;
  cursor?: string;
  hasMore: boolean;
  trace?: SpiceDbOperationTrace;
}

export interface LookupSubjectsInput {
  resource: { type: string; id: string };
  permission: string;
  subjectType: string;
  subjectRelation?: string;
  context?: Record<string, unknown>;
  consistency?: ConsistencyOption;
  pageSize?: number;
  cursor?: string;
}

export interface LookupSubjectsResult {
  subjects: Array<{
    id: string;
    permissionship: 'has_permission' | 'conditional_permission';
  }>;
  lookedUpAt?: string;
  cursor?: string;
  hasMore: boolean;
  trace?: SpiceDbOperationTrace;
}
