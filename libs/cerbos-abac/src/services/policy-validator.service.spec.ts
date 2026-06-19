import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Policy } from '@cerbos/core';
import { CerbosAbacPolicyValidatorService } from './policy-validator.service';

type MockExecutor = (params: {
    binary: string;
    args: string[];
    cwd?: string;
    timeoutMs: number;
}) => Promise<{ stdout: string; stderr: string }>;

type MockRemoteExecutor = (params: { localPolicyFile: string; timeoutMs: number }) => Promise<{
    stdout: string;
    stderr: string;
}>;

function createValidator(executor: MockExecutor, remoteExecutor?: MockRemoteExecutor) {
    class TestPolicyValidator extends CerbosAbacPolicyValidatorService {
        constructor() {
            super({
                appName: 'admin-api',
                cerbosEnvPrefix: 'ADMIN_',
                unboundRuntimeMode: 'ALLOW',
                runtimeBindingCacheTtlSeconds: 300
            });
        }

        protected runCerbosCompile(params: Parameters<MockExecutor>[0]) {
            return executor(params);
        }

        protected runRemoteCerbosCompile(params: Parameters<MockRemoteExecutor>[0]) {
            if (!remoteExecutor) {
                return super.runRemoteCerbosCompile(params);
            }
            return remoteExecutor(params);
        }
    }

    return new TestPolicyValidator();
}

describe('CerbosAbacPolicyValidatorService', () => {
    const originalAdminCliBin = process.env.ADMIN_CERBOS_CLI_BIN;
    const originalAbacCliBin = process.env.CERBOS_ABAC_CLI_BIN;
    const originalCerbosCliBin = process.env.CERBOS_CLI_BIN;
    const originalAbacCliRemote = process.env.CERBOS_ABAC_CLI_REMOTE;

    beforeEach(() => {
        delete process.env.ADMIN_CERBOS_CLI_BIN;
        delete process.env.CERBOS_ABAC_CLI_BIN;
        delete process.env.CERBOS_CLI_BIN;
        delete process.env.CERBOS_ABAC_CLI_REMOTE;
    });

    afterAll(() => {
        restoreEnv('ADMIN_CERBOS_CLI_BIN', originalAdminCliBin);
        restoreEnv('CERBOS_ABAC_CLI_BIN', originalAbacCliBin);
        restoreEnv('CERBOS_CLI_BIN', originalCerbosCliBin);
        restoreEnv('CERBOS_ABAC_CLI_REMOTE', originalAbacCliRemote);
    });

    it('validates a full Cerbos policy with cerbos compile', async () => {
        const policy: Policy = {
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {
                resource: 'abac_manual_user',
                version: 'default',
                rules: [
                    {
                        name: 'allow_user',
                        effect: 'EFFECT_ALLOW',
                        roles: ['*'],
                        actions: ['system.user.read']
                    } as any
                ]
            }
        };
        let writtenPolicy: unknown = null;
        const executor = jest.fn(async ({ args }) => {
            const tempDir = args[args.length - 1];
            writtenPolicy = JSON.parse(await readFile(join(tempDir, 'policy.json'), 'utf8'));
            return { stdout: '{"ok":true}', stderr: '' };
        });

        const result = await createValidator(executor).validatePolicy(policy);

        expect(result.valid).toBe(true);
        expect(result.policy).toEqual(policy);
        expect(writtenPolicy).toEqual(policy);
        expect(executor).toHaveBeenCalledWith({
            binary: 'cerbos',
            args: ['compile', '--skip-tests', '--output=json', '--color=never', expect.any(String)],
            cwd: expect.any(String),
            timeoutMs: 10000
        });
    });

    it('returns CLI stderr as validation errors', async () => {
        const error = new Error('Command failed') as Error & { stderr?: string };
        error.stderr = 'invalid resource policy';
        const executor = jest.fn(async () => {
            throw error;
        });

        const result = await createValidator(executor).validatePolicy({
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {}
        });

        expect(result.valid).toBe(false);
        expect(result.errors.join('\n')).toContain('invalid resource policy');
    });

    it('uses the app-scoped CLI binary when configured', async () => {
        process.env.ADMIN_CERBOS_CLI_BIN = 'C:\\tools\\cerbos.exe';
        const executor = jest.fn(async () => ({ stdout: '', stderr: '' }));

        await createValidator(executor).validatePolicy({
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {}
        });

        expect(executor).toHaveBeenCalledWith(expect.objectContaining({ binary: 'C:\\tools\\cerbos.exe' }));
    });

    it('returns ENOENT as validation error when local cerbos CLI is missing', async () => {
        const error = new Error('spawn cerbos ENOENT') as Error & { code?: string };
        error.code = 'ENOENT';
        const executor = jest.fn(async () => {
            throw error;
        });

        const result = await createValidator(executor).validatePolicy({
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {
                resource: 'abac_manual_user',
                version: 'default',
                rules: [
                    {
                        name: 'allow_user',
                        effect: 'EFFECT_ALLOW',
                        roles: ['*'],
                        actions: ['system.user.read']
                    }
                ]
            }
        });

        expect(result.valid).toBe(false);
        expect(result.errors.join('\n')).toContain('spawn cerbos ENOENT');
        expect(result.policy).toBeNull();
    });

    it('validates through remote Cerbos CLI when configured', async () => {
        process.env.CERBOS_ABAC_CLI_REMOTE = 'deploy@example-host';
        const localExecutor = jest.fn(async () => ({ stdout: '', stderr: '' }));
        const remoteExecutor = jest.fn(async () => ({ stdout: '{"ok":true}', stderr: '' }));
        const policy = {
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {
                resource: 'abac_manual_user',
                version: 'default',
                rules: [
                    {
                        name: 'allow_user',
                        effect: 'EFFECT_ALLOW',
                        roles: ['*'],
                        actions: ['system.user.read']
                    }
                ]
            }
        };

        const result = await createValidator(localExecutor, remoteExecutor).validatePolicy(policy);

        expect(result.valid).toBe(true);
        expect(localExecutor).not.toHaveBeenCalled();
        expect(remoteExecutor).toHaveBeenCalledWith({
            localPolicyFile: expect.stringContaining('policy.json'),
            timeoutMs: 10000
        });
        expect(result.policy).toEqual({
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {
                resource: 'abac_manual_user',
                version: 'default',
                rules: [
                    {
                        name: 'allow_user',
                        effect: 'EFFECT_ALLOW',
                        roles: ['*'],
                        actions: ['system.user.read']
                    }
                ]
            }
        });
    });
});

function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[key];
        return;
    }
    process.env[key] = value;
}
