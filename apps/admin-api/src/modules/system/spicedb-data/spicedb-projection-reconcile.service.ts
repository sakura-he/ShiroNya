import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { InjectRedis } from '@nestjs-redis/client';
import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { RedisClientType } from 'redis';
import { ulid } from 'ulid';
import {
    BaseRelationProjectionReconcileResult,
    BaseRelationProjectionService
} from '../../spicedb-projection/base-relation-projection.service';
import { AuthzProjectionInvalidationService } from '../../spicedb-projection/authz-projection-invalidation.service';

export type SpiceDbProjectionReconcileMode = 'dry_run' | 'apply' | 'rebuild';

export type SpiceDbProjectionReconcileRunResult = {
    runId: string;
    mode: SpiceDbProjectionReconcileMode;
    status: 'succeeded' | 'failed';
    zedToken: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    result: BaseRelationProjectionReconcileResult;
};

const PROJECTION_RECONCILE_LOCK_KEY = 'lock:admin-api:spicedb:projection-reconcile';
const PROJECTION_RECONCILE_LOCK_TTL_MS = 4 * 60 * 1000;
const RELEASE_PROJECTION_RECONCILE_LOCK_SCRIPT =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

@Injectable()
export class SpiceDbProjectionReconcileService {
    private readonly logger = createRuntimeLogger(SpiceDbProjectionReconcileService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'spicedb_projection_reconcile' }
    });

    /**
     * 注入 Prisma 和 SpiceDB 关系投影服务。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly projectionService: BaseRelationProjectionService,
        private readonly invalidationService: AuthzProjectionInvalidationService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    /**
     * 手动执行投影对账任务，并写入 run 记录。
     */
    async runManualReconcile(
        mode: SpiceDbProjectionReconcileMode,
        reason: string,
        zedToken?: string | null
    ): Promise<SpiceDbProjectionReconcileRunResult> {
        if (!reason.trim()) {
            // 运维入口必须保留明确原因，便于审计追踪。
            throw new Error('执行投影对账必须填写 reason');
        }
        return this.requireReconcileRunResult(
            await this.runReconcileWithLock(mode, reason, 'manual', zedToken ?? null, 'throw')
        );
    }

    /**
     * 查询最近的投影对账任务历史。
     */
    async listRuns(limit = 20) {
        const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
        return await this.prismaService.spiceDbProjectionReconcileRun.findMany({
            take: safeLimit,
            orderBy: {
                startedAt: 'desc'
            }
        });
    }

    /**
     * 每 5 分钟执行一次 drift dry-run，发现漂移后自动 apply 修复。
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async runScheduledDriftCheck(): Promise<void> {
        const dryRun = await this.runReconcileWithLock('dry_run', 'scheduled drift check', 'scheduler', null, 'skip');
        if (!dryRun) {
            return;
        }
        if (dryRun.result.total.missingCount === 0 && dryRun.result.total.staleCount === 0) {
            return;
        }

        // 保留完整 detail 调用：对账漂移上下文是关键调试断点（design §8.2），需要把 missingCount / staleCount 完整写入文件日志便于追溯
        this.logger.warn('检测到 SpiceDB 投影漂移，准备自动 apply 修复', {
            missingCount: dryRun.result.total.missingCount,
            staleCount: dryRun.result.total.staleCount
        });
        await this.runReconcileWithLock('apply', 'scheduled drift repair', 'scheduler', null, 'skip');
    }

    /**
     * 由 SpiceDB 数据运维入口触发一次轻量 drift dry-run。
     */
    async runRepairDriftCheck(reason: string): Promise<SpiceDbProjectionReconcileRunResult> {
        return this.requireReconcileRunResult(
            await this.runReconcileWithLock('dry_run', reason, 'spicedb-data', null, 'throw')
        );
    }

    /**
     * 在 Redis 分布式锁保护下执行投影对账，避免多实例同时全量扫描和写投影表。
     */
    private async runReconcileWithLock(
        mode: SpiceDbProjectionReconcileMode,
        reason: string,
        triggeredBy: string,
        zedToken: string | null,
        lockFailureMode: 'skip' | 'throw'
    ): Promise<SpiceDbProjectionReconcileRunResult | null> {
        if (!this.redis) {
            return this.handleLockUnavailable(lockFailureMode, 'redis_client_unavailable', {
                mode,
                reason,
                triggeredBy
            });
        }

        const lockValue = ulid();

        try {
            const acquired = await this.acquireRedisLock(lockValue);
            if (!acquired) {
                return this.handleLockUnavailable(lockFailureMode, 'reconcile_lock_held', {
                    mode,
                    reason,
                    triggeredBy
                });
            }
        } catch (error) {
            return this.handleLockUnavailable(lockFailureMode, 'reconcile_lock_unavailable', {
                mode,
                reason,
                triggeredBy,
                error
            });
        }

        try {
            return await this.runReconcile(mode, reason, triggeredBy, zedToken);
        } finally {
            await this.releaseRedisLock(lockValue);
        }
    }

    /**
     * 根据调用来源处理锁不可用，定时任务跳过，人工入口返回明确业务错误。
     */
    private handleLockUnavailable(mode: 'skip' | 'throw', reason: string, context: Record<string, unknown>): null {
        // 保留完整 detail 调用：context 中可能携带 error 字段，需要保留 error.stack 用于排查锁不可用根因
        this.logger.warn('SpiceDB 投影对账锁不可用', {
            reason,
            ...context
        });
        if (mode === 'throw') {
            throw new BusinessException(ErrorCodes.OPERATION.NOT_ALLOWED, {
                reason: 'reconcile_lock_unavailable'
            });
        }
        return null;
    }

    private requireReconcileRunResult(
        result: SpiceDbProjectionReconcileRunResult | null
    ): SpiceDbProjectionReconcileRunResult {
        if (!result) {
            throw new BusinessException(ErrorCodes.OPERATION.NOT_ALLOWED, {
                reason: 'reconcile_lock_unavailable'
            });
        }
        return result;
    }

    /**
     * 使用 Redis SET NX PX 获取单实例分布式锁，避免多 admin 实例同时执行全量对账。
     */
    private async acquireRedisLock(lockValue: string): Promise<boolean> {
        if (!this.redis) {
            return false;
        }
        const result = await this.redis.set(PROJECTION_RECONCILE_LOCK_KEY, lockValue, {
            expiration: {
                type: 'PX',
                value: PROJECTION_RECONCILE_LOCK_TTL_MS
            },
            condition: 'NX'
        });
        return result === 'OK';
    }

    /**
     * 仅释放当前执行持有的锁，避免误删其它实例刚抢到的新锁。
     */
    private async releaseRedisLock(lockValue: string): Promise<void> {
        if (!this.redis) {
            return;
        }
        try {
            await this.redis.eval(RELEASE_PROJECTION_RECONCILE_LOCK_SCRIPT, {
                keys: [PROJECTION_RECONCILE_LOCK_KEY],
                arguments: [lockValue]
            });
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查锁释放失败
            this.logger.warn('释放 SpiceDB 投影对账锁失败', {
                error
            });
        }
    }

    /**
     * 根据模式执行 inspect/reconcile/rebuild，并持久化任务状态。
     */
    private async runReconcile(
        mode: SpiceDbProjectionReconcileMode,
        reason: string,
        triggeredBy: string,
        zedToken: string | null
    ): Promise<SpiceDbProjectionReconcileRunResult> {
        const runId = ulid();
        const startedAt = new Date();
        await this.prismaService.spiceDbProjectionReconcileRun.create({
            data: {
                id: runId,
                mode,
                triggeredBy,
                reason,
                status: 'running',
                zedToken,
                startedAt
            }
        });

        try {
            const result = await this.executeReconcileMode(mode, zedToken);
            const finishedAt = new Date();
            const durationMs = finishedAt.getTime() - startedAt.getTime();
            await this.prismaService.spiceDbProjectionReconcileRun.update({
                where: {
                    id: runId
                },
                data: {
                    status: 'succeeded',
                    finishedAt,
                    durationMs,
                    userGroupMembersStats: result.userGroupMembers,
                    userRolesStats: result.userRoles,
                    userGroupRolesStats: result.userGroupRoles,
                    menuRolesStats: result.menuRoles,
                    totalStats: result.total
                }
            });
            if (mode === 'apply' || mode === 'rebuild') {
                await this.invalidateAfterAppliedReconcile(mode, runId);
            }
            return {
                runId,
                mode,
                status: 'succeeded',
                zedToken,
                startedAt: startedAt.toISOString(),
                finishedAt: finishedAt.toISOString(),
                durationMs,
                result
            };
        } catch (error) {
            const finishedAt = new Date();
            const durationMs = finishedAt.getTime() - startedAt.getTime();
            await this.prismaService.spiceDbProjectionReconcileRun.update({
                where: {
                    id: runId
                },
                data: {
                    status: 'failed',
                    finishedAt,
                    durationMs,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
            throw error;
        }
    }

    /**
     * 执行具体对账模式，rebuild 只会由手动入口触发。
     */
    private async executeReconcileMode(
        mode: SpiceDbProjectionReconcileMode,
        zedToken: string | null
    ): Promise<BaseRelationProjectionReconcileResult> {
        if (mode === 'dry_run') {
            return await this.projectionService.inspectFullSync(zedToken);
        }
        if (mode === 'apply') {
            return await this.projectionService.reconcileFromSpiceDb(zedToken);
        }
        return await this.projectionService.rebuildFromSpiceDb(zedToken);
    }

    private async invalidateAfterAppliedReconcile(mode: SpiceDbProjectionReconcileMode, runId: string): Promise<void> {
        try {
            await this.invalidationService.invalidateBroadProjectionReadModel();
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影读缓存刷新失败
            this.logger.warn('投影对账已完成，但刷新投影读缓存版本失败', {
                mode,
                runId,
                error
            });
        }
    }
}
