import { Inject, Injectable } from '@nestjs/common';
import type { Policy } from '@cerbos/core';
import { CerbosService } from '@app/cerbos';
import {
    CERBOS_ABAC_CERBOS_SERVICE,
    CERBOS_ABAC_MODULE_OPTIONS,
    CERBOS_ABAC_PRISMA
} from '../constants';
import type {
    CerbosAbacCompiledPolicy,
    CerbosAbacCompileResult,
    NormalizedCerbosAbacModuleOptions,
    PrismaLike
} from '../types';
import { createCerbosAbacId, isRecord, sha256, stableStringify, toISOStringValue } from '../utils';
import { CerbosAbacCompilerService } from './compiler.service';

type ReleaseStatus = 'PENDING' | 'ACTIVE' | 'SUPERSEDED' | 'FAILED' | 'ROLLED_BACK';

@Injectable()
export class CerbosAbacPublisherService {
    constructor(
        @Inject(CERBOS_ABAC_PRISMA) private readonly prisma: PrismaLike,
        @Inject(CERBOS_ABAC_CERBOS_SERVICE) private readonly cerbosService: CerbosService,
        @Inject(CERBOS_ABAC_MODULE_OPTIONS) private readonly options: NormalizedCerbosAbacModuleOptions,
        private readonly compiler: CerbosAbacCompilerService
    ) {}

    async previewPublish() {
        const compiled = await this.compiler.compileAll();
        const activeRelease = await this.getActiveRelease();
        return {
            ...compiled,
            changed: activeRelease?.bundleHash !== compiled.bundleHash,
            activeRelease,
            manifest: this.createManifest(compiled)
        };
    }

    async publish(payload: { reason?: string } = {}, actorId?: string) {
        const compiled = await this.compiler.compileAll();
        const release = await this.createPendingRelease(compiled, payload.reason, actorId);

        try {
            await this.addOrUpdatePolicies(compiled.policies.map((item) => item.policy));
            await this.prisma.$transaction?.(async (tx) => {
                await tx.cerbosAbacPolicyRelease.updateMany({
                    where: { status: 'ACTIVE', id: { not: release.id } },
                    data: { status: 'SUPERSEDED' }
                });
                await tx.cerbosAbacPolicyRelease.update({
                    where: { id: release.id },
                    data: {
                        status: 'ACTIVE',
                        publishedAt: new Date(),
                        errorMessage: null
                    }
                });
                await this.writeAudit(tx, actorId, 'release.publish', release.revision, {
                    appName: this.options.appName,
                    revision: release.revision,
                    bundleHash: compiled.bundleHash,
                    reason: payload.reason ?? null
                });
            });
            return {
                published: true,
                appName: this.options.appName,
                release: await this.getReleaseById(release.id),
                compiled
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.prisma.cerbosAbacPolicyRelease.update({
                where: { id: release.id },
                data: {
                    status: 'FAILED',
                    errorMessage: message
                }
            });
            await this.writeAudit(this.prisma, actorId, 'release.publish_failed', release.revision, {
                appName: this.options.appName,
                revision: release.revision,
                errorMessage: message
            });
            return {
                published: false,
                appName: this.options.appName,
                errorMessage: message,
                release: await this.getReleaseById(release.id),
                compiled
            };
        }
    }

    async listReleases() {
        const releases = await this.prisma.cerbosAbacPolicyRelease.findMany({
            include: {
                snapshots: {
                    include: {
                        snapshot: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return {
            releases: releases.map((row: any) => this.mapRelease(row))
        };
    }

    async rollback(revision: string, actorId?: string) {
        const target = await this.prisma.cerbosAbacPolicyRelease.findUnique({
            where: { revision },
            include: {
                snapshots: {
                    include: {
                        snapshot: true
                    }
                }
            }
        });
        if (!target) {
            return {
                rolledBack: false,
                reason: `找不到发布版本 ${revision}`
            };
        }
        const policies = (target.snapshots ?? []).map((item: any) => item.snapshot.policyContent as Policy);
        const bundleHash = sha256(stableStringify(policies));
        const releaseId = createCerbosAbacId('abac_rel');
        const nextRevision = this.createRevision();
        await this.prisma.$transaction?.(async (tx) => {
            await tx.cerbosAbacPolicyRelease.create({
                data: {
                    id: releaseId,
                    revision: nextRevision,
                    bundleHash,
                    policyCount: policies.length,
                    manifestJson: {
                        appName: this.options.appName,
                        rollbackFromRevision: revision,
                        generatedAt: new Date().toISOString()
                    },
                    status: 'PENDING',
                    reason: `rollback from ${revision}`,
                    publishedBy: actorId ?? null,
                    rollbackFromId: target.id,
                    snapshots: {
                        create: (target.snapshots ?? []).map((item: any) => ({
                            snapshotId: item.snapshotId
                        }))
                    }
                }
            });
        });

        try {
            await this.addOrUpdatePolicies(policies);
            await this.prisma.$transaction?.(async (tx) => {
                await tx.cerbosAbacPolicyRelease.updateMany({
                    where: { status: 'ACTIVE' },
                    data: { status: 'ROLLED_BACK' }
                });
                await tx.cerbosAbacPolicyRelease.update({
                    where: { id: releaseId },
                    data: {
                        status: 'ACTIVE',
                        publishedAt: new Date(),
                        errorMessage: null
                    }
                });
                await this.writeAudit(tx, actorId, 'release.rollback', nextRevision, {
                    appName: this.options.appName,
                    revision: nextRevision,
                    rollbackFromRevision: revision
                });
            });
            return {
                rolledBack: true,
                release: await this.getReleaseById(releaseId)
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.prisma.cerbosAbacPolicyRelease.update({
                where: { id: releaseId },
                data: {
                    status: 'FAILED',
                    errorMessage: message
                }
            });
            return {
                rolledBack: false,
                reason: message,
                release: await this.getReleaseById(releaseId)
            };
        }
    }

    private async createPendingRelease(
        compiled: CerbosAbacCompileResult,
        reason: string | undefined,
        actorId: string | undefined
    ) {
        const releaseId = createCerbosAbacId('abac_rel');
        const revision = this.createRevision();
        const snapshots = compiled.policies.map((policy) => this.createSnapshot(policy, actorId));
        await this.prisma.$transaction?.(async (tx) => {
            for (const snapshot of snapshots) {
                await tx.cerbosAbacPolicySnapshot.create({
                    data: snapshot
                });
            }
            await tx.cerbosAbacPolicyRelease.create({
                data: {
                    id: releaseId,
                    revision,
                    bundleHash: compiled.bundleHash,
                    policyCount: compiled.policies.length,
                    manifestJson: this.createManifest(compiled),
                    status: 'PENDING',
                    reason: reason ?? null,
                    publishedBy: actorId ?? null,
                    snapshots: {
                        create: snapshots.map((snapshot) => ({
                            snapshotId: snapshot.id
                        }))
                    }
                }
            });
        });
        return {
            id: releaseId,
            revision
        };
    }

    private createSnapshot(policy: CerbosAbacCompiledPolicy, actorId?: string) {
        return {
            id: createCerbosAbacId('abac_snap'),
            sourceType: policy.sourceType,
            sourceId: policy.sourceId ?? null,
            cerbosPolicyId: policy.policyId,
            resourceName: policy.resourceName,
            cerbosVersion: policy.version,
            policyContent: policy.policy as any,
            contentHash: policy.contentHash,
            generatedBy: actorId ?? null
        };
    }

    private async addOrUpdatePolicies(policies: Policy[]) {
        const client = this.cerbosService.getClient() as unknown as {
            addOrUpdatePolicies?: (request: { policies: Policy[] }) => Promise<void>;
        };
        if (typeof client.addOrUpdatePolicies !== 'function') {
            throw new Error('当前 Cerbos 客户端不支持 addOrUpdatePolicies Admin API');
        }
        await client.addOrUpdatePolicies({ policies });
    }

    private createManifest(compiled: CerbosAbacCompileResult) {
        return {
            appName: this.options.appName,
            bundleHash: compiled.bundleHash,
            policyCount: compiled.policies.length,
            policies: compiled.policies.map((policy) => ({
                policyId: policy.policyId,
                sourceType: policy.sourceType,
                sourceId: policy.sourceId ?? null,
                resourceName: policy.resourceName,
                version: policy.version,
                contentHash: policy.contentHash,
                ruleCount: policy.ruleCount,
                actionCount: policy.actionCount
            })),
            warnings: compiled.warnings,
            generatedAt: compiled.generatedAt
        };
    }

    private async getActiveRelease() {
        const release = await this.prisma.cerbosAbacPolicyRelease.findFirst({
            where: { status: 'ACTIVE' },
            orderBy: { publishedAt: 'desc' }
        });
        return release ? this.mapRelease(release) : null;
    }

    private async getReleaseById(id: string) {
        const release = await this.prisma.cerbosAbacPolicyRelease.findUnique({
            where: { id },
            include: {
                snapshots: {
                    include: {
                        snapshot: true
                    }
                }
            }
        });
        return release ? this.mapRelease(release) : null;
    }

    private mapRelease(row: any) {
        return {
            id: row.id,
            revision: row.revision,
            bundleHash: row.bundleHash,
            policyCount: row.policyCount,
            manifest: isRecord(row.manifestJson) ? row.manifestJson : {},
            status: String(row.status).toLowerCase() as Lowercase<ReleaseStatus>,
            reason: row.reason ?? null,
            publishedBy: row.publishedBy ?? null,
            createdAt: toISOStringValue(row.createdAt),
            publishedAt: toISOStringValue(row.publishedAt),
            rollbackFromId: row.rollbackFromId ?? null,
            errorMessage: row.errorMessage ?? null,
            snapshots: Array.isArray(row.snapshots)
                ? row.snapshots.map((item: any) => ({
                      snapshotId: item.snapshotId,
                      policyId: item.snapshot?.cerbosPolicyId,
                      resourceName: item.snapshot?.resourceName,
                      version: item.snapshot?.cerbosVersion,
                      contentHash: item.snapshot?.contentHash
                  }))
                : []
        };
    }

    private createRevision(): string {
        return `${this.options.appName}-${new Date()
            .toISOString()
            .replace(/[-:.TZ]/g, '')
            .slice(0, 17)}`;
    }

    private async writeAudit(
        client: PrismaLike,
        actorId: string | undefined,
        action: string,
        resourceKey: string | undefined,
        detail: Record<string, unknown>
    ) {
        await client.cerbosAbacAuditLog.create({
            data: {
                id: createCerbosAbacId('abac_audit'),
                actorId: actorId ?? null,
                action,
                resourceKey: resourceKey ?? null,
                detailJson: detail as any
            }
        });
    }
}
