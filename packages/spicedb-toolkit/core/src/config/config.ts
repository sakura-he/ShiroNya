import type { SpiceDbClientOptions } from '../client/index.js';
import type { SpiceDbTracingOptions } from '../common/tracing.js';

export interface SpiceDbToolkitConfig {
  client: SpiceDbClientOptions;
  tracing?: SpiceDbTracingOptions;
  schema?: {
    entry?: string;
    parser?: 'official';
  };
  cli?: {
    zedBinary?: string;
  };
  nestjs?: {
    defaultGuardBehavior?: 'throw' | 'deny';
  };
}

export function defineConfig(config: SpiceDbToolkitConfig): SpiceDbToolkitConfig {
  return config;
}

export function validateConfig(config: unknown): asserts config is SpiceDbToolkitConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.client || typeof cfg.client !== 'object') {
    throw new Error('Config must include a "client" object');
  }

  const client = cfg.client as Record<string, unknown>;

  if (!client.endpoint || typeof client.endpoint !== 'string') {
    throw new Error('client.endpoint must be a non-empty string');
  }

  if (!client.token || typeof client.token !== 'string') {
    throw new Error('client.token must be a non-empty string');
  }

  if (client.insecure !== undefined && typeof client.insecure !== 'boolean') {
    throw new Error('client.insecure must be a boolean');
  }
}
