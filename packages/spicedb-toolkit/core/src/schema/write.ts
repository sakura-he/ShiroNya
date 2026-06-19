import { v1 } from '@authzed/authzed-node';
import type { SpiceDbClient } from '../client/index.js';
import { wrapGrpcError } from '../common/errors.js';
import { traceSpiceDbRpc } from '../common/tracing.js';
import type { SpiceDbOperationTrace, SpiceDbTracingOptions } from '../common/tracing.js';

export interface WriteSchemaResult {
  writtenAt?: string;
  trace?: SpiceDbOperationTrace;
}

export interface SchemaWriteOptions {
  tracing?: SpiceDbTracingOptions;
}

export async function writeSchemaToSpiceDb(
  client: SpiceDbClient,
  schema: string,
  options: SchemaWriteOptions = {}
): Promise<WriteSchemaResult> {
  try {
    const request = v1.WriteSchemaRequest.create({ schema });
    const { value: response, trace } = await traceSpiceDbRpc(
      'WriteSchema',
      1,
      options.tracing,
      () => client.promises.writeSchema(request)
    );

    return {
      writtenAt: response.writtenAt?.token,
      trace,
    };
  } catch (err) {
    throw wrapGrpcError(err);
  }
}
