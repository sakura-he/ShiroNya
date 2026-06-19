import { v1 } from '@authzed/authzed-node';
import type { SpiceDbClient } from '../client/index.js';
import { wrapGrpcError } from '../common/errors.js';
import { traceSpiceDbRpc } from '../common/tracing.js';
import type { SpiceDbOperationTrace, SpiceDbTracingOptions } from '../common/tracing.js';

export interface ReadSchemaResult {
  schemaText: string;
  trace?: SpiceDbOperationTrace;
}

export interface SchemaServiceOptions {
  tracing?: SpiceDbTracingOptions;
}

export async function readSchemaFromSpiceDb(
  client: SpiceDbClient,
  options: SchemaServiceOptions = {}
): Promise<ReadSchemaResult> {
  try {
    const request = v1.ReadSchemaRequest.create({});
    const { value: response, trace } = await traceSpiceDbRpc(
      'ReadSchema',
      1,
      options.tracing,
      () => client.promises.readSchema(request)
    );

    return {
      schemaText: response.schemaText ?? '',
      trace,
    };
  } catch (err) {
    throw wrapGrpcError(err);
  }
}
