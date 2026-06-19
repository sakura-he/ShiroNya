import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  validateConfig,
  type SpiceDbToolkitConfig,
} from '../src/config/config.js';

describe('defineConfig', () => {
  it('should return the config object unchanged', () => {
    const config: SpiceDbToolkitConfig = {
      client: { endpoint: 'localhost:50051', token: 'test-token' },
    };
    const result = defineConfig(config);
    expect(result).toStrictEqual(config);
  });

  it('should support all optional fields', () => {
    const config: SpiceDbToolkitConfig = {
      client: { endpoint: 'spicedb:50051', token: 'mytoken', insecure: true },
      schema: { entry: './schema.zed', parser: 'official' },
      cli: { zedBinary: '/usr/local/bin/zed' },
      nestjs: { defaultGuardBehavior: 'deny' },
    };
    const result = defineConfig(config);
    expect(result.schema?.parser).toBe('official');
    expect(result.cli?.zedBinary).toBe('/usr/local/bin/zed');
    expect(result.nestjs?.defaultGuardBehavior).toBe('deny');
  });
});

describe('validateConfig', () => {
  it('should pass for valid config', () => {
    expect(() =>
      validateConfig({ client: { endpoint: 'localhost:50051', token: 'abc' } })
    ).not.toThrow();
  });

  it('should throw for null config', () => {
    expect(() => validateConfig(null)).toThrow('Config must be an object');
  });

  it('should throw for non-object', () => {
    expect(() => validateConfig('string')).toThrow('Config must be an object');
  });

  it('should throw for missing client', () => {
    expect(() => validateConfig({})).toThrow('Config must include a "client" object');
  });

  it('should throw for missing endpoint', () => {
    expect(() => validateConfig({ client: { token: 'abc' } })).toThrow(
      'client.endpoint must be a non-empty string'
    );
  });

  it('should throw for empty endpoint', () => {
    expect(() => validateConfig({ client: { endpoint: '', token: 'abc' } })).toThrow(
      'client.endpoint must be a non-empty string'
    );
  });

  it('should throw for missing token', () => {
    expect(() => validateConfig({ client: { endpoint: 'localhost:50051' } })).toThrow(
      'client.token must be a non-empty string'
    );
  });

  it('should throw for non-boolean insecure', () => {
    expect(() =>
      validateConfig({ client: { endpoint: 'x', token: 'y', insecure: 'yes' } })
    ).toThrow('client.insecure must be a boolean');
  });
});
