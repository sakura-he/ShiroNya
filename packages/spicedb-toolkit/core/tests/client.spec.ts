import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clientOptionsFromEnv } from '../src/client/index.js';

describe('clientOptionsFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should read from SPICEDB_ prefixed env vars', () => {
    process.env.SPICEDB_ENDPOINT = 'spicedb.example.com:443';
    process.env.SPICEDB_TOKEN = 'my-secret-token';
    process.env.SPICEDB_INSECURE = 'false';

    const options = clientOptionsFromEnv();
    expect(options.endpoint).toBe('spicedb.example.com:443');
    expect(options.token).toBe('my-secret-token');
    expect(options.insecure).toBe(false);
  });

  it('should support custom prefix', () => {
    process.env.AUTHZ_ENDPOINT = 'custom:50051';
    process.env.AUTHZ_TOKEN = 'custom-token';

    const options = clientOptionsFromEnv('AUTHZ_');
    expect(options.endpoint).toBe('custom:50051');
    expect(options.token).toBe('custom-token');
  });

  it('should parse INSECURE=true', () => {
    process.env.SPICEDB_ENDPOINT = 'localhost:50051';
    process.env.SPICEDB_TOKEN = 'token';
    process.env.SPICEDB_INSECURE = 'true';

    const options = clientOptionsFromEnv();
    expect(options.insecure).toBe(true);
  });

  it('should handle missing env vars gracefully', () => {
    delete process.env.SPICEDB_ENDPOINT;
    delete process.env.SPICEDB_TOKEN;

    const options = clientOptionsFromEnv();
    expect(options.endpoint).toBeUndefined();
    expect(options.token).toBeUndefined();
  });
});
