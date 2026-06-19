import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class AdminSpiceDbProjectionMetricsService {
    private checkTotal = 0;
    private checkFailed = 0;

    /**
     * 注入 nestjs-prometheus 注册的投影同步指标，避免手写 metrics controller 和 registry。
     */
    constructor(
        @InjectMetric('admin_api_spicedb_projection_events_total')
        private readonly projectionEventsTotal: Counter<string>,
        @InjectMetric('admin_api_spicedb_projection_consumer_lag')
        private readonly projectionConsumerLag: Gauge<string>,
        @InjectMetric('admin_api_spicedb_projection_last_event_age_seconds')
        private readonly lastConsumedEventAgeSeconds: Gauge<string>,
        @InjectMetric('admin_api_spicedb_projection_last_zed_token_age_seconds')
        private readonly lastZedTokenAgeSeconds: Gauge<string>,
        @InjectMetric('admin_api_spicedb_projection_drift_rows')
        private readonly driftRows: Gauge<string>,
        @InjectMetric('admin_api_spicedb_projection_reconcile_duration_seconds')
        private readonly reconcileDurationSeconds: Histogram<string>,
        @InjectMetric('admin_api_spicedb_projection_reconcile_total')
        private readonly reconcileStatusTotal: Counter<string>,
        @InjectMetric('admin_api_spicedb_check_duration_seconds')
        private readonly checkDurationSeconds: Histogram<string>,
        @InjectMetric('admin_api_spicedb_upstream_errors_total')
        private readonly upstreamErrorsTotal: Counter<string>,
        @InjectMetric('admin_api_spicedb_connection_health')
        private readonly connectionHealth: Gauge<string>
    ) {}

    /**
     * 记录投影事件处理结果。
     */
    recordProjectionEvent(status: string, eventType: string, reason: string): void {
        this.projectionEventsTotal.inc({
            status,
            event_type: eventType || 'unknown',
            reason: reason || 'none'
        });
    }

    /**
     * 更新 Kafka consumer lag 指标。
     */
    setConsumerLag(topic: string, partition: number, lag: number): void {
        this.projectionConsumerLag.set(
            {
                topic,
                partition: String(partition)
            },
            Math.max(lag, 0)
        );
    }

    /**
     * 根据事件时间更新最后消费事件年龄。
     */
    setLastConsumedEventAt(eventAt: Date): void {
        this.lastConsumedEventAgeSeconds.set(Math.max((Date.now() - eventAt.getTime()) / 1000, 0));
    }

    /**
     * 根据 zed token 落库时间更新 token 年龄。
     */
    setLastZedTokenUpdatedAt(updatedAt: Date | null | undefined): void {
        if (!updatedAt) {
            return;
        }
        this.lastZedTokenAgeSeconds.set(Math.max((Date.now() - updatedAt.getTime()) / 1000, 0));
    }

    /**
     * 更新四张投影表的 drift 数量指标。
     */
    setDriftRows(table: string, missingCount: number, staleCount: number): void {
        this.driftRows.set({ table, drift_type: 'missing' }, missingCount);
        this.driftRows.set({ table, drift_type: 'stale' }, staleCount);
    }

    /**
     * 记录一次对账任务的耗时与结果状态。
     */
    recordReconcileRun(mode: string, status: string, durationMs: number): void {
        this.reconcileStatusTotal.inc({ mode, status });
        this.reconcileDurationSeconds.observe({ mode, status }, Math.max(durationMs, 0) / 1000);
    }

    /**
     * 记录 SpiceDB permission check 耗时。
     */
    recordCheckDuration(operation: string, status: string, durationMs: number): void {
        this.checkTotal += 1;
        if (status !== 'success') {
            // 健康看板需要快速展示当前进程内的 check 错误率，Prometheus 仍是长期指标来源。
            this.checkFailed += 1;
        }
        this.checkDurationSeconds.observe({ operation, status }, Math.max(durationMs, 0) / 1000);
    }

    /**
     * 记录 SpiceDB 上游错误次数。
     */
    recordUpstreamError(operation: string): void {
        this.upstreamErrorsTotal.inc({ operation });
    }

    /**
     * 更新 SpiceDB 连接健康状态。
     */
    setConnectionHealth(healthy: boolean): void {
        this.connectionHealth.set(healthy ? 1 : 0);
    }

    /**
     * 返回当前进程内的 SpiceDB check 统计，供健康看板展示即时错误率。
     */
    getCheckStats(): { total: number; failed: number; errorRate: number } {
        return {
            total: this.checkTotal,
            failed: this.checkFailed,
            errorRate: this.checkTotal === 0 ? 0 : this.checkFailed / this.checkTotal
        };
    }
}
