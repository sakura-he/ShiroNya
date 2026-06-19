import { PrismaService } from '@app/prisma-admin';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProjectionHealthGateResult = {
    usable: boolean;
    reason: string | null;
    lag: number;
    driftCount: number | null;
    unhandledDlqCount: number;
};

@Injectable()
export class ProjectionHealthGateService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly configService: ConfigService
    ) {}

    /**
     * 判断业务读路径是否允许使用本地投影读模型。
     */
    async canUseProjectionReadModel(): Promise<boolean> {
        return (await this.getProjectionHealthGate()).usable;
    }

    async getProjectionHealthGate(): Promise<ProjectionHealthGateResult> {
        if (!this.getBooleanConfig('ADMIN_SPICEDB_PROJECTION_HEALTH_GATE_ENABLED', true)) {
            return {
                usable: true,
                reason: null,
                lag: 0,
                driftCount: null,
                unhandledDlqCount: 0
            };
        }

        const [lastRun, cursors, unhandledDlqCount] = await Promise.all([
            this.prismaService.spiceDbProjectionReconcileRun.findFirst({
                where: {
                    finishedAt: {
                        not: null
                    }
                },
                orderBy: {
                    finishedAt: 'desc'
                }
            }),
            this.prismaService.spiceDbProjectionCursor.findMany({
                select: {
                    lag: true
                }
            }),
            this.prismaService.spiceDbProjectionEventLog.count({
                where: {
                    status: 'dlq',
                    handledAt: null
                }
            })
        ]);
        const lag = cursors.reduce((sum, cursor) => sum + Number(cursor.lag), 0);
        const totalStats = lastRun?.totalStats as { missingCount?: number; staleCount?: number } | null | undefined;
        const driftCount = totalStats
            ? Number(totalStats.missingCount ?? 0) + Number(totalStats.staleCount ?? 0)
            : null;
        const lagWarn = this.getNumberConfig('ADMIN_SPICEDB_PROJECTION_HEALTH_LAG_WARN', 1000);
        const dlqWarn = this.getNumberConfig('ADMIN_SPICEDB_PROJECTION_HEALTH_DLQ_WARN', 1);
        const driftWarn = this.getNumberConfig('ADMIN_SPICEDB_PROJECTION_HEALTH_DRIFT_WARN', 1);

        if (!lastRun) {
            return {
                usable: false,
                reason: 'projection_reconcile_snapshot_missing',
                lag,
                driftCount,
                unhandledDlqCount
            };
        }
        if (lastRun.status === 'failed') {
            return { usable: false, reason: 'projection_reconcile_failed', lag, driftCount, unhandledDlqCount };
        }
        if (driftCount !== null && driftCount >= driftWarn) {
            return { usable: false, reason: 'projection_drifted', lag, driftCount, unhandledDlqCount };
        }
        if (unhandledDlqCount >= dlqWarn) {
            return { usable: false, reason: 'projection_dlq_unhandled', lag, driftCount, unhandledDlqCount };
        }
        if (lag >= lagWarn) {
            return { usable: false, reason: 'projection_consumer_lagged', lag, driftCount, unhandledDlqCount };
        }

        return { usable: true, reason: null, lag, driftCount, unhandledDlqCount };
    }

    private getNumberConfig(key: string, defaultValue: number): number {
        const value = Number(this.configService.get<string>(key, String(defaultValue)));
        return Number.isFinite(value) ? value : defaultValue;
    }

    private getBooleanConfig(key: string, defaultValue: boolean): boolean {
        const value = this.configService.get<string>(key);
        if (value === undefined) {
            return defaultValue;
        }

        return value !== '0' && value.toLowerCase() !== 'false';
    }
}
