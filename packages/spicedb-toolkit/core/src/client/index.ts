import { v1 } from '@authzed/authzed-node';

export interface SpiceDbClientOptions {
  endpoint: string;
  token: string;
  insecure?: boolean;
  tlsCert?: Buffer | string;
  preconnect?: boolean;
}

export interface SpiceDbClient {
  promises: ReturnType<typeof v1.NewClient>['promises'];
  raw: ReturnType<typeof v1.NewClient>;
}

export function createSpiceDbClient(options: SpiceDbClientOptions): SpiceDbClient {
  const { endpoint, token, insecure, tlsCert } = options;

  let client: ReturnType<typeof v1.NewClient>;

  if (tlsCert) {
    const certBuffer = typeof tlsCert === 'string' ? Buffer.from(tlsCert) : tlsCert;
    client = v1.NewClientWithCustomCert(token, endpoint, certBuffer);
  } else if (insecure ?? isLocalhost(endpoint)) {
    // AuthZed's INSECURE_LOCALHOST_ALLOWED only attaches authorization metadata
    // when the endpoint literally starts with "localhost:". The project commonly
    // uses 127.0.0.1 host ports in containers, so always keep credentials on
    // explicit insecure channels.
    client = v1.NewClient(token, endpoint, v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS);
  } else {
    client = v1.NewClient(token, endpoint, v1.ClientSecurity.SECURE);
  }

  return {
    promises: client.promises,
    raw: client,
  };
}

export function clientOptionsFromEnv(prefix = 'SPICEDB_'): Partial<SpiceDbClientOptions> {
  const env = process.env;
  const options: Partial<SpiceDbClientOptions> = {};

  const endpoint = env[`${prefix}ENDPOINT`];
  if (endpoint) options.endpoint = endpoint;

  const token = env[`${prefix}TOKEN`];
  if (token) options.token = token;

  const insecure = env[`${prefix}INSECURE`];
  if (insecure !== undefined) {
    options.insecure = insecure === 'true' || insecure === '1';
  }

  const tlsCert = env[`${prefix}TLS_CERT`];
  if (tlsCert) options.tlsCert = tlsCert;

  return options;
}

function isLocalhost(endpoint: string): boolean {
  const host = endpoint.split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
