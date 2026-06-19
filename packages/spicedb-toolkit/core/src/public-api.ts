import type { SpiceDbClient } from './client/index.js';
import { createSpiceDbClient, type SpiceDbClientOptions } from './client/index.js';
import { createPermissionService, type PermissionService } from './permission/index.js';
import { createRelationshipService, type RelationshipService } from './relationship/index.js';
import { parseSchema, analyzeSchema, readSchemaFromSpiceDb, writeSchemaToSpiceDb, diffSchema } from './schema/index.js';
import type { SpiceDbToolkitConfig } from './config/config.js';

export interface SpiceDbToolkit {
  client: SpiceDbClient;
  permission: PermissionService;
  relationship: RelationshipService;
  schema: {
    parse: typeof parseSchema;
    analyze: typeof analyzeSchema;
    read: () => ReturnType<typeof readSchemaFromSpiceDb>;
    write: (schema: string) => ReturnType<typeof writeSchemaToSpiceDb>;
    diff: typeof diffSchema;
  };
}

export function createSpiceDbToolkit(config: SpiceDbToolkitConfig | SpiceDbClientOptions): SpiceDbToolkit {
  const toolkitConfig = 'client' in config ? (config as SpiceDbToolkitConfig) : undefined;
  const clientOptions = 'endpoint' in config && 'token' in config && !('client' in config)
    ? config as SpiceDbClientOptions
    : toolkitConfig!.client;

  const client = createSpiceDbClient(clientOptions);

  return {
    client,
    permission: createPermissionService(client, { tracing: toolkitConfig?.tracing }),
    relationship: createRelationshipService(client, { tracing: toolkitConfig?.tracing }),
    schema: {
      parse: parseSchema,
      analyze: analyzeSchema,
      read: () => readSchemaFromSpiceDb(client, { tracing: toolkitConfig?.tracing }),
      write: (schema: string) => writeSchemaToSpiceDb(client, schema, { tracing: toolkitConfig?.tracing }),
      diff: diffSchema,
    },
  };
}
