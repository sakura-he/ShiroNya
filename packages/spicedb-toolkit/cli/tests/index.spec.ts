import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildForwardedEnvironment,
  cleanupTemporaryPaths,
  hasFlag,
  materializeCertificateFile,
  parseLocatorOutput,
  pickUnderlyingZedBinary,
  resolveBinarySpecifier,
  resolveConfiguredCertificatePath,
  shouldUseShellForBinary,
} from '../src/index.js';
import type { SpiceDbToolkitConfig } from '@spicedb-toolkit/core';

const cleanupTargets: string[] = [];

afterEach(() => {
  cleanupTemporaryPaths(cleanupTargets.splice(0, cleanupTargets.length));
});

describe('buildForwardedEnvironment', () => {
  it('injects config-derived zed env vars when the user did not override them', () => {
    const config: SpiceDbToolkitConfig = {
      client: {
        endpoint: 'spicedb.example.com:50051',
        token: 'token-1',
        insecure: true,
      },
    };

    const env = buildForwardedEnvironment(config, ['schema', 'read'], {}, undefined);

    expect(env.ZED_ENDPOINT).toBe('spicedb.example.com:50051');
    expect(env.ZED_TOKEN).toBe('token-1');
    expect(env.ZED_INSECURE).toBe('true');
    expect(env.SPICEDB_TOOLKIT_ZED_WRAPPER_ACTIVE).toBe('1');
  });

  it('keeps explicit argv and environment overrides intact', () => {
    const config: SpiceDbToolkitConfig = {
      client: {
        endpoint: 'ignored.example.com:50051',
        token: 'ignored-token',
        insecure: true,
      },
    };

    const env = buildForwardedEnvironment(
      config,
      ['schema', 'read', '--endpoint', 'cli.example.com:50051', '--token=cli-token', '--insecure'],
      {
        ZED_ENDPOINT: 'env.example.com:50051',
      },
      undefined
    );

    expect(env.ZED_ENDPOINT).toBe('env.example.com:50051');
    expect(env.ZED_TOKEN).toBeUndefined();
    expect(env.ZED_INSECURE).toBeUndefined();
  });
});

describe('resolveConfiguredCertificatePath', () => {
  it('reuses an existing file path from config without creating temp files', () => {
    const tempDirectory = fsMkdtemp();
    const certificatePath = path.join(tempDirectory, 'ca.crt');
    cleanupTargets.push(tempDirectory);

    awaitableWriteFile(certificatePath, 'certificate-data');

    const config: SpiceDbToolkitConfig = {
      client: {
        endpoint: 'secure.example.com:443',
        token: 'token-1',
        tlsCert: certificatePath,
      },
    };

    const result = resolveConfiguredCertificatePath(config, ['schema', 'read']);

    expect(result.certificatePath).toBe(certificatePath);
    expect(result.cleanupPaths).toStrictEqual([]);
  });

  it('materializes inline certificate content into a temp file', () => {
    const config: SpiceDbToolkitConfig = {
      client: {
        endpoint: 'secure.example.com:443',
        token: 'token-1',
        tlsCert: 'inline-certificate-data',
      },
    };

    const result = resolveConfiguredCertificatePath(config, ['schema', 'read']);
    cleanupTargets.push(...result.cleanupPaths);

    expect(result.certificatePath).toBeDefined();
    expect(existsSync(result.certificatePath!)).toBe(true);
    expect(readFileSync(result.certificatePath!, 'utf8')).toBe('inline-certificate-data');
  });
});

describe('binary helpers', () => {
  it('picks the first candidate that is not the wrapper itself', () => {
    const selected = pickUnderlyingZedBinary(
      ['/workspace/node_modules/.bin/zed', '/usr/local/bin/zed'],
      '/workspace/node_modules/.bin/zed'
    );

    expect(selected).toBe('/usr/local/bin/zed');
  });

  it('treats relative filesystem overrides as absolute paths', () => {
    const tempDirectory = fsMkdtemp();
    const binaryPath = path.join(tempDirectory, 'zed');
    cleanupTargets.push(tempDirectory);

    awaitableWriteFile(binaryPath, 'binary');

    const previousCwd = process.cwd();
    process.chdir(tempDirectory);

    try {
      expect(resolveBinarySpecifier('./zed')).toBe(binaryPath);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe('small helpers', () => {
  it('detects both split and inline flag forms', () => {
    expect(hasFlag(['--endpoint', 'localhost:50051'], '--endpoint')).toBe(true);
    expect(hasFlag(['--token=abc'], '--token')).toBe(true);
    expect(hasFlag(['schema', 'read'], '--token')).toBe(false);
  });

  it('deduplicates command locator output', () => {
    expect(parseLocatorOutput('a\nb\na\n')).toStrictEqual(['a', 'b']);
  });

  it('uses the command shell for Windows cmd shims only', () => {
    expect(shouldUseShellForBinary('C:\\tools\\zed.cmd', 'win32')).toBe(true);
    expect(shouldUseShellForBinary('C:\\tools\\zed.exe', 'win32')).toBe(false);
    expect(shouldUseShellForBinary('/usr/local/bin/zed', 'linux')).toBe(false);
  });

  it('creates and later cleans up temp certificate directories', () => {
    const result = materializeCertificateFile(Buffer.from('abc'));

    expect(existsSync(result.certificatePath!)).toBe(true);

    cleanupTemporaryPaths(result.cleanupPaths);

    expect(existsSync(result.certificatePath!)).toBe(false);
  });
});

/** Creates a temporary directory for file-system based unit tests. */
function fsMkdtemp(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'spicedb-toolkit-cli-test-'));
}

/** Writes a small test fixture file using synchronous I/O to keep tests deterministic. */
function awaitableWriteFile(filePath: string, contents: string): void {
  writeFileSync(filePath, contents);
}
