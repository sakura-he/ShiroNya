import type { ConsistencyOption } from '../common/consistency.js';
import type { SpiceDbOperationTrace } from '../common/tracing.js';

export interface RelationshipInput {
  resource: { type: string; id: string };
  relation: string;
  subject: { type: string; id: string; relation?: string };
  caveat?: { name: string; context?: Record<string, unknown> };
}

export interface RelationshipOutput {
  resource: { type: string; id: string };
  relation: string;
  subject: { type: string; id: string; relation?: string };
  caveat?: { name: string; context?: Record<string, unknown> };
}

export type RelationshipOperation = 'create' | 'touch' | 'delete';

export interface WriteRelationshipsInput {
  updates: Array<{
    operation: RelationshipOperation;
    relationship: RelationshipInput;
  }>;
}

export interface WriteRelationshipsResult {
  writtenAt?: string;
  trace?: SpiceDbOperationTrace;
}

export interface DeleteRelationshipsInput {
  filter: RelationshipFilter;
}

export interface DeleteRelationshipsResult {
  deletedAt?: string;
  trace?: SpiceDbOperationTrace;
}

export interface ReadRelationshipsInput {
  filter: RelationshipFilter;
  consistency?: ConsistencyOption;
  pageSize?: number;
  cursor?: string;
}

export interface ReadRelationshipsResult {
  relationships: RelationshipOutput[];
  readAt?: string;
  cursor?: string;
  hasMore: boolean;
  trace?: SpiceDbOperationTrace;
}

export interface RelationshipFilter {
  resourceType: string;
  resourceId?: string;
  relation?: string;
  subjectFilter?: {
    type: string;
    id?: string;
    relation?: string;
  };
}

export interface TouchRelationshipsInput {
  relationships: RelationshipInput[];
}

export interface ImportBulkRelationshipsInput {
  relationships: RelationshipInput[];
}

export interface ExportBulkRelationshipsInput {
  filter?: RelationshipFilter;
  consistency?: ConsistencyOption;
}
