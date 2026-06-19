import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type SpiceDbToolkitConfig } from '@spicedb-toolkit/core';

const CONFIG_NOT_FOUND_PREFIX = 'Config file not found.';
const WRAPPER_ACTIVE_ENV = 'SPICEDB_TOOLKIT_ZED_WRAPPER_ACTIVE';
const WRAPPER_BINARY_ENV = 'SPICEDB_TOOLKIT_ZED_BINARY';
const WRAPPER_CONFIG_ENV = 'SPICEDB_TOOLKIT_CONFIG';

export interface PreparedZedExecution {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cleanupPaths: string[];
}

export interface ResolveCertificateResult {
  certificatePath?: string;
  cleanupPaths: string[];
}

export interface RunWrappedZedOptions {
  argv0?: string;
  env?: NodeJS.ProcessEnv;
}

/** Loads the optional toolkit config and treats a missing file as a non-fatal case. */
export async function loadOptionalToolkitConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<SpiceDbToolkitConfig | undefined> {
  try {
    return await loadConfig(env[WRAPPER_CONFIG_ENV]);
  } catch (error) {
    if (isConfigNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

/** Detects the specific load-config error that means no project config exists in the current directory. */
export function isConfigNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(CONFIG_NOT_FOUND_PREFIX);
}

/** Prepares the wrapped zed invocation by combining config-derived settings with the original argv. */
export async function prepareZedExecution(
  rawArgv: string[],
  options: RunWrappedZedOptions = {}
): Promise<PreparedZedExecution> {
  const env = options.env ?? process.env;

  if (env[WRAPPER_ACTIVE_ENV] === '1') {
    throw new Error(
      'Recursive zed wrapper invocation detected. Set cli.zedBinary or SPICEDB_TOOLKIT_ZED_BINARY to the official zed binary.'
    );
  }

  const config = await loadOptionalToolkitConfig(env);
  const certificate = resolveConfiguredCertificatePath(config, rawArgv, env);
  const command = resolveUnderlyingZedBinary(
    config,
    options.argv0 ?? process.argv[1] ?? '',
    env
  );
  const forwardedEnv = buildForwardedEnvironment(config, rawArgv, env, certificate.certificatePath);

  return {
    command,
    args: rawArgv,
    env: forwardedEnv,
    cleanupPaths: certificate.cleanupPaths,
  };
}

/** Runs the wrapped zed process and forwards its exit code back to the caller. */
export async function runWrappedZed(
  rawArgv: string[],
  options: RunWrappedZedOptions = {}
): Promise<number> {
  const prepared = await prepareZedExecution(rawArgv, options);

  try {
    return await spawnZedProcess(prepared);
  } finally {
    cleanupTemporaryPaths(prepared.cleanupPaths);
  }
}

/** Builds the final child-process environment while preserving explicit user overrides. */
export function buildForwardedEnvironment(
  config: SpiceDbToolkitConfig | undefined,
  rawArgv: string[],
  existingEnv: NodeJS.ProcessEnv,
  certificatePath?: string
): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...existingEnv,
    [WRAPPER_ACTIVE_ENV]: '1',
  };

  if (config?.client.endpoint && !hasOverride(existingEnv, rawArgv, 'ZED_ENDPOINT', '--endpoint')) {
    nextEnv.ZED_ENDPOINT = config.client.endpoint;
  }

  if (config?.client.token && !hasOverride(existingEnv, rawArgv, 'ZED_TOKEN', '--token')) {
    nextEnv.ZED_TOKEN = config.client.token;
  }

  if (
    config?.client.insecure &&
    !hasOverride(existingEnv, rawArgv, 'ZED_INSECURE', '--insecure')
  ) {
    nextEnv.ZED_INSECURE = 'true';
  }

  if (
    certificatePath &&
    !hasOverride(existingEnv, rawArgv, 'ZED_CERTIFICATE_PATH', '--certificate-path')
  ) {
    nextEnv.ZED_CERTIFICATE_PATH = certificatePath;
  }

  return nextEnv;
}

/** Resolves the TLS certificate path expected by zed from toolkit config values. */
export function resolveConfiguredCertificatePath(
  config: SpiceDbToolkitConfig | undefined,
  rawArgv: string[],
  env: NodeJS.ProcessEnv = process.env
): ResolveCertificateResult {
  if (!config || config.client.insecure) {
    return { cleanupPaths: [] };
  }

  if (env.ZED_CERTIFICATE_PATH || hasFlag(rawArgv, '--certificate-path')) {
    return { cleanupPaths: [] };
  }

  const tlsCert = config.client.tlsCert;
  if (!tlsCert) {
    return { cleanupPaths: [] };
  }

  if (typeof tlsCert === 'string') {
    const filePath = path.resolve(process.cwd(), tlsCert);
    if (existsSync(filePath)) {
      return {
        certificatePath: filePath,
        cleanupPaths: [],
      };
    }
  }

  return materializeCertificateFile(tlsCert);
}

/** Resolves the official zed binary using explicit overrides first and PATH lookup as a fallback. */
export function resolveUnderlyingZedBinary(
  config: SpiceDbToolkitConfig | undefined,
  wrapperArgv0: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configuredBinary = env[WRAPPER_BINARY_ENV] || config?.cli?.zedBinary;
  if (configuredBinary) {
    return resolveBinarySpecifier(configuredBinary);
  }

  const locatedBinary = findInstalledZedBinary(wrapperArgv0);
  if (locatedBinary) {
    return locatedBinary;
  }

  throw new Error(
    'Unable to locate the official zed binary. Set cli.zedBinary or SPICEDB_TOOLKIT_ZED_BINARY to continue.'
  );
}

/** Resolves a user-supplied binary specifier into either an absolute path or a command name. */
export function resolveBinarySpecifier(binary: string): string {
  if (!looksLikeFilesystemPath(binary)) {
    return binary;
  }

  const resolved = path.isAbsolute(binary) ? binary : path.resolve(process.cwd(), binary);
  if (!existsSync(resolved)) {
    throw new Error(`Configured zed binary does not exist: ${resolved}`);
  }

  return resolved;
}

/** Searches PATH for installed zed binaries and skips this wrapper if it appears in the results. */
export function findInstalledZedBinary(wrapperArgv0: string): string | undefined {
  const locatorCommand = process.platform === 'win32' ? 'where' : 'which';
  const locatorArgs = process.platform === 'win32' ? ['zed'] : ['-a', 'zed'];
  const result = spawnSync(locatorCommand, locatorArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }

  const candidates = parseLocatorOutput(result.stdout);
  return pickUnderlyingZedBinary(candidates, wrapperArgv0);
}

/** Selects the first candidate that is not the current wrapper shim or script. */
export function pickUnderlyingZedBinary(
  candidates: string[],
  wrapperArgv0: string
): string | undefined {
  return candidates.find((candidate) => !isWrapperBinaryCandidate(candidate, wrapperArgv0));
}

/** Parses the output of where/which into a stable, de-duplicated candidate list. */
export function parseLocatorOutput(output: string): string[] {
  const results: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    const candidate = line.trim();
    if (candidate && !results.includes(candidate)) {
      results.push(candidate);
    }
  }

  return results;
}

/** Detects whether a discovered zed candidate actually points back at this wrapper package. */
export function isWrapperBinaryCandidate(candidate: string, wrapperArgv0: string): boolean {
  const candidatePath = normalizePath(candidate);
  const wrapperPath = normalizePath(wrapperArgv0);

  if (candidatePath && wrapperPath && candidatePath === wrapperPath) {
    return true;
  }

  const realCandidatePath = getRealPathIfExists(candidate);
  const realWrapperPath = getRealPathIfExists(wrapperArgv0);
  if (realCandidatePath && realWrapperPath && realCandidatePath === realWrapperPath) {
    return true;
  }

  if (!existsSync(candidate)) {
    return false;
  }

  try {
    const contents = readFileSync(candidate, 'utf8');
    return (
      contents.includes('@spicedb-toolkit/cli') ||
      contents.includes('/dist/run.js') ||
      contents.includes('\\dist\\run.js')
    );
  } catch {
    return false;
  }
}

/** Spawns the resolved zed process and mirrors stdio so the wrapper stays transparent. */
export function spawnZedProcess(prepared: PreparedZedExecution): Promise<number> {
  return new Promise((resolve, reject) => {
    const useShell = shouldUseShellForBinary(prepared.command);
    const child = spawn(prepared.command, prepared.args, {
      stdio: 'inherit',
      env: prepared.env,
      shell: useShell,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
        return;
      }

      resolve(signal ? 1 : 0);
    });
  });
}

/** Enables cmd.exe only for Windows script shims that cannot be spawned directly. */
export function shouldUseShellForBinary(
  command: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

/** Creates a temporary certificate file when config provides raw certificate bytes instead of a path. */
export function materializeCertificateFile(certificate: Buffer | string): ResolveCertificateResult {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), 'spicedb-toolkit-zed-'));
  const certificatePath = path.join(tempDirectory, 'ca.crt');
  const bytes = typeof certificate === 'string' ? Buffer.from(certificate) : certificate;

  writeFileSync(certificatePath, bytes);

  return {
    certificatePath,
    cleanupPaths: [tempDirectory],
  };
}

/** Removes any temporary directories or files created while preparing the wrapped zed execution. */
export function cleanupTemporaryPaths(pathsToDelete: string[]): void {
  for (const targetPath of pathsToDelete) {
    rmSync(targetPath, {
      recursive: true,
      force: true,
    });
  }
}

/** Checks whether the user already provided a value through argv or environment variables. */
export function hasOverride(
  env: NodeJS.ProcessEnv,
  rawArgv: string[],
  envName: string,
  flagName: string
): boolean {
  return Boolean(env[envName]) || hasFlag(rawArgv, flagName);
}

/** Detects the presence of a flag in either --flag value or --flag=value form. */
export function hasFlag(rawArgv: string[], flagName: string): boolean {
  return rawArgv.some((argument) => argument === flagName || argument.startsWith(`${flagName}=`));
}

/** Normalizes a path for stable comparisons across platforms and shell shims. */
export function normalizePath(targetPath: string): string {
  return targetPath ? path.normalize(targetPath) : '';
}

/** Returns the real path only when the target exists and can be resolved safely. */
export function getRealPathIfExists(targetPath: string): string | undefined {
  if (!targetPath || !existsSync(targetPath)) {
    return undefined;
  }

  try {
    return normalizePath(realpathSync(targetPath));
  } catch {
    return undefined;
  }
}

/** Detects whether a binary override should be treated as a filesystem path instead of a command name. */
export function looksLikeFilesystemPath(value: string): boolean {
  return (
    value.startsWith('.') ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.includes('/') ||
    value.includes('\\')
  );
}
