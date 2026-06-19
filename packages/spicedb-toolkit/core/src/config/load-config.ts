import { createJiti } from 'jiti';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { clientOptionsFromEnv, type SpiceDbClientOptions } from '../client/index.js';
import { validateConfig, type SpiceDbToolkitConfig } from './config.js';

const DEFAULT_CONFIG_NAMES = ['spicedb.config.ts', 'spicedb.config.js', 'spicedb.config.mjs'];

export async function loadConfig(
  configFilePath?: string,
  options?: { skipValidation?: boolean }
): Promise<SpiceDbToolkitConfig> {
  const resolvedPath = resolveConfigPath(configFilePath);

  if (!resolvedPath) {
    throw new Error(
      `Config file not found. Searched for: ${DEFAULT_CONFIG_NAMES.join(', ')}` +
        (configFilePath ? ` and ${configFilePath}` : '')
    );
  }

  const jiti = createJiti(dirname(resolvedPath), {
    interopDefault: true,
  });

  const raw = await jiti.import(resolvedPath) as Record<string, unknown>;
  const config = (raw.default ?? raw) as SpiceDbToolkitConfig;

  // Merge env vars into client options
  const envOptions = clientOptionsFromEnv();
  const mergedClient: SpiceDbClientOptions = {
    ...config.client,
    ...stripUndefined(envOptions),
  };

  const merged: SpiceDbToolkitConfig = {
    ...config,
    client: mergedClient,
  };

  if (!options?.skipValidation) {
    validateConfig(merged);
  }

  return merged;
}

function resolveConfigPath(configFilePath?: string): string | undefined {
  if (configFilePath) {
    const abs = resolve(process.cwd(), configFilePath);
    return existsSync(abs) ? abs : undefined;
  }

  for (const name of DEFAULT_CONFIG_NAMES) {
    const abs = resolve(process.cwd(), name);
    if (existsSync(abs)) return abs;
  }

  return undefined;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
