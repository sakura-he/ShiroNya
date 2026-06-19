import { describe, it, expect } from 'vitest';
import {
  createRelationshipProto,
  formatRelationship,
} from '../src/helpers.js';

describe('formatRelationship', () => {
  it('should format a basic relationship', () => {
    const result = formatRelationship({
      resource: { type: 'document', id: 'doc1' },
      relation: 'viewer',
      subject: { type: 'user', id: 'alice' },
    });
    expect(result).toBe('document:doc1#viewer@user:alice');
  });

  it('should format a relationship with subject relation', () => {
    const result = formatRelationship({
      resource: { type: 'document', id: 'doc1' },
      relation: 'viewer',
      subject: { type: 'group', id: 'eng', relation: 'member' },
    });
    expect(result).toBe('document:doc1#viewer@group:eng#member');
  });

  it('should format an official relationship proto', () => {
    const relationship = createRelationshipProto({
      resource: { type: 'document', id: 'doc1' },
      relation: 'viewer',
      subject: { type: 'user', id: 'alice' },
    });
    expect(formatRelationship(relationship)).toBe('document:doc1#viewer@user:alice');
  });
});

describe('createRelationshipProto', () => {
  it('should create an official SpiceDB relationship proto', () => {
    const relationship = createRelationshipProto({
      resource: { type: 'document', id: 'doc1' },
      relation: 'viewer',
      subject: { type: 'user', id: 'alice' },
    });

    expect(relationship.resource?.objectType).toBe('document');
    expect(relationship.resource?.objectId).toBe('doc1');
    expect(relationship.relation).toBe('viewer');
    expect(relationship.subject?.object?.objectType).toBe('user');
    expect(relationship.subject?.object?.objectId).toBe('alice');
  });
});
