import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { SpiceDbService } from '../src/service.js';

// Mock @spicedb-toolkit/core
vi.mock('@spicedb-toolkit/core', () => ({
  createSpiceDbToolkit: vi.fn(() => ({
    permission: {
      checkPermission: vi.fn().mockResolvedValue({ allowed: true }),
      checkBulkPermissions: vi.fn().mockResolvedValue({
        results: [{ allowed: true }, { allowed: false }],
      }),
      lookupResources: vi.fn().mockResolvedValue({ resources: [] }),
      lookupSubjects: vi.fn().mockResolvedValue({ subjects: [] }),
    },
    relationship: {
      writeRelationships: vi.fn().mockResolvedValue({ writtenAt: 'token_1' }),
      readRelationships: vi.fn().mockResolvedValue({ relationships: [] }),
      deleteRelationships: vi.fn().mockResolvedValue({ deletedAt: 'token_2' }),
      touchRelationships: vi.fn().mockResolvedValue({ writtenAt: 'token_3' }),
    },
    schema: {
      read: vi.fn().mockResolvedValue({ schemaText: 'definition user {}' }),
      write: vi.fn().mockResolvedValue({}),
    },
  })),
  loadConfig: vi.fn().mockResolvedValue({
    client: { endpoint: 'localhost:50051', token: 'test' },
  }),
}));

describe('SpiceDbService', () => {
  it('should check permission with config option', async () => {
    const service = new SpiceDbService({
      config: { client: { endpoint: 'localhost:50051', token: 'test' } },
    });

    const result = await service.checkPermission({
      resource: { type: 'document', id: 'doc1' },
      permission: 'view',
      subject: { type: 'user', id: 'alice' },
    });

    expect(result.allowed).toBe(true);
  });

  it('should check bulk permissions', async () => {
    const service = new SpiceDbService({
      config: { client: { endpoint: 'localhost:50051', token: 'test' } },
    });

    const result = await service.checkBulkPermissions({
      items: [
        {
          resource: { type: 'document', id: 'doc1' },
          permission: 'view',
          subject: { type: 'user', id: 'alice' },
        },
        {
          resource: { type: 'document', id: 'doc1' },
          permission: 'edit',
          subject: { type: 'user', id: 'alice' },
        },
      ],
    });

    expect(result.results).toHaveLength(2);
  });

  it('should read schema', async () => {
    const service = new SpiceDbService({
      config: { client: { endpoint: 'localhost:50051', token: 'test' } },
    });

    const schema = await service.readSchema();
    expect(schema).toBe('definition user {}');
  });

  it('should write relationships', async () => {
    const service = new SpiceDbService({
      config: { client: { endpoint: 'localhost:50051', token: 'test' } },
    });

    const result = await service.writeRelationships({
      updates: [{
        operation: 'touch',
        relationship: {
          resource: { type: 'document', id: 'doc1' },
          relation: 'viewer',
          subject: { type: 'user', id: 'bob' },
        },
      }],
    });

    expect(result.writtenAt).toBe('token_1');
  });

  it('should throw if no config is provided', async () => {
    const service = new SpiceDbService({});

    await expect(service.checkPermission({
      resource: { type: 'document', id: 'doc1' },
      permission: 'view',
      subject: { type: 'user', id: 'alice' },
    })).rejects.toThrow('No configuration provided');
  });

  it('should load config from file when configFile is set', async () => {
    const service = new SpiceDbService({ configFile: true });

    const result = await service.checkPermission({
      resource: { type: 'document', id: 'doc1' },
      permission: 'view',
      subject: { type: 'user', id: 'alice' },
    });

    expect(result.allowed).toBe(true);
  });
});
