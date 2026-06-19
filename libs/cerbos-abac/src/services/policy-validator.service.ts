import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import type { Policy } from '@cerbos/core';
import { CERBOS_ABAC_MODULE_OPTIONS } from '../constants';
import type { CerbosAbacPolicyValidation, NormalizedCerbosAbacModuleOptions } from '../types';
import { isRecord, sha256, stableStringify } from '../utils';

const execFileAsync = promisify(execFile);
const DEFAULT_CERBOS_CLI_TIMEOUT_MS = 10_000;

type CerbosCompileParams = {
    binary: string;
    args: string[];
    cwd?: string;
    timeoutMs: number;
};

type CerbosCompileOutput = {
    stdout: string;
    stderr: string;
};

type RemoteCerbosCompileParams = {
    localPolicyFile: string;
    timeoutMs: number;
};

@Injectable()
export class CerbosAbacPolicyValidatorService {
    constructor(@Inject(CERBOS_ABAC_MODULE_OPTIONS) private readonly options: NormalizedCerbosAbacModuleOptions) {}

    async validatePolicy(policy: unknown): Promise<CerbosAbacPolicyValidation> {
        const serialized = stableStringify(policy) ?? JSON.stringify(policy) ?? String(policy);
        const hash = sha256(serialized);
        if (!isRecord(policy)) {
            return {
                valid: false,
                errors: ['必须提交完整 Cerbos policy 对象'],
                warnings: [],
                hash,
                policy: null
            };
        }

        const tempDir = await mkdtemp(join(tmpdir(), `cerbos-abac-${this.options.appName}-`));
        try {
            const policyFile = join(tempDir, 'policy.json');
            await writeFile(policyFile, JSON.stringify(policy, null, 2), 'utf8');
            const args = ['compile', '--skip-tests', '--output=json', '--color=never', tempDir];
            const timeoutMs = this.getCliTimeoutMs();
            const output = this.getRemoteTarget()
                ? await this.runRemoteCerbosCompile({
                      localPolicyFile: policyFile,
                      timeoutMs
                  })
                : await this.runCerbosCompile({
                      binary: this.getCliBinary(),
                      args,
                      cwd: tempDir,
                      timeoutMs
                  });
            return {
                valid: true,
                errors: [],
                warnings: this.collectMessages(output.stderr),
                hash,
                policy: policy as unknown as Policy,
                stdout: output.stdout,
                stderr: output.stderr
            };
        } catch (error) {
            const stdout = this.readErrorText(error, 'stdout');
            const stderr = this.readErrorText(error, 'stderr');
            const message = error instanceof Error ? error.message : String(error);
            return {
                valid: false,
                errors: this.collectErrorMessages(stderr, stdout, message),
                warnings: [],
                hash,
                policy: null,
                stdout,
                stderr
            };
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    }

    protected async runCerbosCompile({ binary, args, cwd, timeoutMs }: CerbosCompileParams): Promise<CerbosCompileOutput> {
        const { stdout, stderr } = await execFileAsync(binary, args, {
            cwd,
            ...this.createExecOptions(timeoutMs)
        });
        return {
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? '')
        };
    }

    protected async runRemoteCerbosCompile({
        localPolicyFile,
        timeoutMs
    }: RemoteCerbosCompileParams): Promise<CerbosCompileOutput> {
        const target = this.getRemoteTarget();
        if (!target) {
            throw new Error('缺少 Cerbos CLI 远端目标配置');
        }
        const remoteBinary = this.getRemoteBinary();
        const remoteBaseDir = this.getRemoteBaseDir().replace(/\/+$/, '');
        const remoteDir = `${remoteBaseDir}/${this.options.appName}-${randomUUID()}`;
        const remotePolicyFile = `${remoteDir}/policy.json`;
        const ssh = this.getSshBinary();
        const scp = this.getScpBinary();
        await execFileAsync(ssh, [target, `mkdir -p ${quoteShell(remoteDir)}`], this.createExecOptions(timeoutMs));
        try {
            await execFileAsync(scp, [localPolicyFile, `${target}:${remotePolicyFile}`], this.createExecOptions(timeoutMs));
            const { stdout, stderr } = await execFileAsync(
                ssh,
                [
                    target,
                    `${quoteShell(remoteBinary)} compile --skip-tests --output=json --color=never ${quoteShell(remoteDir)}`
                ],
                this.createExecOptions(timeoutMs)
            );
            return {
                stdout: String(stdout ?? ''),
                stderr: String(stderr ?? '')
            };
        } finally {
            await execFileAsync(ssh, [target, `rm -rf ${quoteShell(remoteDir)}`], this.createExecOptions(timeoutMs)).catch(
                () => undefined
            );
        }
    }

    private getCliBinary(): string {
        const scopedKey = `${this.options.cerbosEnvPrefix}CERBOS_CLI_BIN`;
        return (
            process.env[scopedKey]?.trim() ||
            process.env.CERBOS_ABAC_CLI_BIN?.trim() ||
            process.env.CERBOS_CLI_BIN?.trim() ||
            'cerbos'
        );
    }

    private getCliTimeoutMs(): number {
        const scopedKey = `${this.options.cerbosEnvPrefix}CERBOS_CLI_TIMEOUT_MS`;
        const rawValue = process.env[scopedKey] ?? process.env.CERBOS_ABAC_CLI_TIMEOUT_MS;
        const value = Number(rawValue ?? DEFAULT_CERBOS_CLI_TIMEOUT_MS);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_CERBOS_CLI_TIMEOUT_MS;
    }

    private getRemoteTarget(): string | undefined {
        const scopedKey = `${this.options.cerbosEnvPrefix}CERBOS_CLI_REMOTE`;
        return process.env[scopedKey]?.trim() || process.env.CERBOS_ABAC_CLI_REMOTE?.trim() || undefined;
    }

    private getRemoteBinary(): string {
        const scopedKey = `${this.options.cerbosEnvPrefix}CERBOS_CLI_REMOTE_BIN`;
        return (
            process.env[scopedKey]?.trim() ||
            process.env.CERBOS_ABAC_CLI_REMOTE_BIN?.trim() ||
            '/usr/local/bin/cerbos'
        );
    }

    private getRemoteBaseDir(): string {
        const scopedKey = `${this.options.cerbosEnvPrefix}CERBOS_CLI_REMOTE_TMP_DIR`;
        return (
            process.env[scopedKey]?.trim() ||
            process.env.CERBOS_ABAC_CLI_REMOTE_TMP_DIR?.trim() ||
            '/tmp/cerbos-abac'
        );
    }

    private getSshBinary(): string {
        return process.env.CERBOS_ABAC_SSH_BIN?.trim() || 'ssh';
    }

    private getScpBinary(): string {
        return process.env.CERBOS_ABAC_SCP_BIN?.trim() || 'scp';
    }

    private createExecOptions(timeoutMs: number) {
        return {
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024
        };
    }

    private collectMessages(...texts: string[]): string[] {
        return texts
            .flatMap((text) => String(text ?? '').split(/\r?\n/))
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 20);
    }

    private collectErrorMessages(...texts: string[]): string[] {
        const lines = this.collectMessages(...texts);
        return lines.length > 0 ? lines : ['Cerbos CLI 未返回详细信息'];
    }

    private readErrorText(error: unknown, key: 'stdout' | 'stderr'): string {
        if (isRecord(error) && typeof error[key] !== 'undefined') {
            return String(error[key] ?? '');
        }
        return '';
    }

}

function quoteShell(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
