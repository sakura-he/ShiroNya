import { PrismaModule } from '@app/prisma-app';
import { Module } from '@nestjs/common';
import {
    makeCounterProvider,
    makeGaugeProvider,
    makeHistogramProvider,
    PrometheusModule
} from '@willsoto/nestjs-prometheus';
import { AdminSpiceDbProjectionModule } from '../spicedb-projection/spicedb-projection.module';
import { AdminSpiceDbKafkaProjectionConsumerService } from './admin-spicedb-kafka-projection-consumer.service';
import { AdminSpiceDbMetricsController } from './admin-spicedb-metrics.controller';
import { AdminSpiceDbProjectionMetricsService } from './admin-spicedb-projection-metrics.service';

/**
 * 装配 SpiceDB Watch Kafka consumer、投影服务与 Prometheus 指标。
 */
@Module({
    imports: [
        PrismaModule,
        AdminSpiceDbProjectionModule,
        PrometheusModule.register({
            controller: AdminSpiceDbMetricsController,
            defaultMetrics: {
                enabled: true,
                config: {
                    prefix: 'app_api_'
                }
            }
        })
    ],
    providers: [
        makeCounterProvider({
            name: 'app_api_spicedb_projection_events_total',
            help: 'SpiceDB projection events by processing status.',
            labelNames: ['status', 'event_type', 'reason']
        }),
        makeGaugeProvider({
            name: 'app_api_spicedb_projection_consumer_lag',
            help: 'Kafka lag observed by the SpiceDB projection consumer.',
            labelNames: ['topic', 'partition']
        }),
        makeGaugeProvider({
            name: 'app_api_spicedb_projection_last_event_age_seconds',
            help: 'Age in seconds of the last consumed SpiceDB projection event.'
        }),
        makeGaugeProvider({
            name: 'app_api_spicedb_projection_last_zed_token_age_seconds',
            help: 'Age in seconds of the latest persisted SpiceDB watch zed token.'
        }),
        makeGaugeProvider({
            name: 'app_api_spicedb_projection_drift_rows',
            help: 'Projection drift row count by table and drift type.',
            labelNames: ['table', 'drift_type']
        }),
        makeHistogramProvider({
            name: 'app_api_spicedb_projection_reconcile_duration_seconds',
            help: 'Projection reconcile duration in seconds.',
            labelNames: ['mode', 'status'],
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
        }),
        makeCounterProvider({
            name: 'app_api_spicedb_projection_reconcile_total',
            help: 'Projection reconcile run count by mode and status.',
            labelNames: ['mode', 'status']
        }),
        makeHistogramProvider({
            name: 'app_api_spicedb_check_duration_seconds',
            help: 'SpiceDB permission check duration in seconds.',
            labelNames: ['operation', 'status'],
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
        }),
        makeCounterProvider({
            name: 'app_api_spicedb_upstream_errors_total',
            help: 'SpiceDB upstream errors by operation.',
            labelNames: ['operation']
        }),
        makeGaugeProvider({
            name: 'app_api_spicedb_connection_health',
            help: 'SpiceDB connection health, 1 healthy and 0 unhealthy.'
        }),
        AdminSpiceDbKafkaProjectionConsumerService,
        AdminSpiceDbProjectionMetricsService
    ],
    exports: [AdminSpiceDbKafkaProjectionConsumerService, AdminSpiceDbProjectionMetricsService]
})
export class AdminSpiceDbStreamConsumerModule {}
