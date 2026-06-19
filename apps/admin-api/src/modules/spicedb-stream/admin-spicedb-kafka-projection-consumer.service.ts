import { createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { asPrismaISODate } from '@app/prisma-admin/extensions/date-to-iso-string.extension';
import { Prisma } from '@app/prisma-admin/generated/client';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Admin, Consumer, EachBatchPayload, Kafka, KafkaMessage, Producer } from 'kafkajs';
import { BaseRelationProjectionService } from '../spicedb-projection/base-relation-projection.service';
import { AuthzProjectionInvalidationService } from '../spicedb-projection/authz-projection-invalidation.service';
import { ADMIN_SPICEDB_BASE_RELATION_PROJECTION_CONSUMER_GROUP } from '../spicedb-projection/spicedb-projection.constants';
import {
    ADMIN_SPICEDB_WATCH_DLQ_TOPIC,
    ADMIN_SPICEDB_WATCH_EVENTS_TOPIC,
    createSpiceDbKafka
} from './admin-spicedb-kafka.config';
import {
    AdminSpiceDbRelationshipChangeEvent,
    isKnownSpiceDbOperation,
    parseSpiceDbKafkaEvent,
    type ParsedSpiceDbKafkaEvent
} from './admin-spicedb-kafka-event.parser';
import { AdminSpiceDbProjectionMetricsService } from './admin-spicedb-projection-metrics.service';

type ProjectionEventProcessResult = {
    status: 'applied' | 'ignored' | 'dlq';
    reason: string;
    events?: AdminSpiceDbRelationshipChangeEvent[];
    parsed?: ParsedSpiceDbKafkaEvent;
    payload: Prisma.InputJsonValue;
    eventKey: string;
    zedToken?: string | null;
    operation?: string | null;
    eventType: string;
};

@Injectable()
export class AdminSpiceDbKafkaProjectionConsumerService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = createRuntimeLogger(AdminSpiceDbKafkaProjectionConsumerService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'spicedb_kafka_projection' }
    });
    private readonly kafka?: Kafka;
    private readonly consumer?: Consumer;
    private readonly producer?: Producer;
    private readonly admin?: Admin;
    private readonly enabled: boolean;
    private readonly eventsTopic: string;
    private readonly dlqTopic: string;
    private readonly consumerGroup: string;
    private readonly maxFailuresBeforePause: number;
    private readonly partitionFailures = new Map<string, number>();
    private started = false;
    private shuttingDown = false;

    /**
     * 初始化 SpiceDB Kafka consumer、DLQ producer 与 admin 客户端。
     */
    constructor(
        private readonly configService: ConfigService,
        private readonly prismaService: PrismaService,
        private readonly projectionService: BaseRelationProjectionService,
        private readonly metricsService: AdminSpiceDbProjectionMetricsService,
        private readonly invalidationService: AuthzProjectionInvalidationService
    ) {
        this.enabled = this.configService.get<string>('ADMIN_SPICEDB_KAFKA_ENABLED', 'false') === 'true';
        this.eventsTopic = this.configService.get<string>(
            'ADMIN_SPICEDB_KAFKA_WATCH_EVENTS_TOPIC',
            ADMIN_SPICEDB_WATCH_EVENTS_TOPIC
        );
        this.dlqTopic = this.configService.get<string>(
            'ADMIN_SPICEDB_KAFKA_WATCH_DLQ_TOPIC',
            ADMIN_SPICEDB_WATCH_DLQ_TOPIC
        );
        this.consumerGroup = this.configService.get<string>(
            'ADMIN_SPICEDB_KAFKA_PROJECTION_CONSUMER_GROUP',
            ADMIN_SPICEDB_BASE_RELATION_PROJECTION_CONSUMER_GROUP
        );
        this.maxFailuresBeforePause = Number(
            this.configService.get<string>('ADMIN_SPICEDB_KAFKA_PROJECTION_CONSUMER_MAX_FAILURES', '5')
        );

        if (this.enabled) {
            this.kafka = createSpiceDbKafka(this.configService);
            this.consumer = this.kafka.consumer({
                groupId: this.consumerGroup,
                allowAutoTopicCreation: false
            });
            this.producer = this.kafka.producer({
                allowAutoTopicCreation: false,
                idempotent: true,
                maxInFlightRequests: 1
            });
            this.admin = this.kafka.admin();
        }
    }

    /**
     * 应用启动后异步连接 Kafka，避免远端 Kafka 不可达时阻塞 Nest HTTP 端口监听。
     */
    async onApplicationBootstrap(): Promise<void> {
        if (!this.enabled) {
            this.logger.info.title('Admin SpiceDB Kafka projection consumer 未启用，跳过启动');
            return;
        }

        void this.startKafkaProjectionConsumer().catch((error) => {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 consumer 启动失败
            this.logger.error('Admin SpiceDB Kafka projection consumer 启动失败，HTTP 服务已继续启动', {
                error: error instanceof Error ? error.message : String(error)
            });
        });
    }

    /**
     * 连接 Kafka，并启动手动 offset commit 的 batch consumer。
     */
    private async startKafkaProjectionConsumer(): Promise<void> {
        if (!this.producer || !this.admin || !this.consumer) {
            throw new Error('SpiceDB Kafka projection consumer 未完成初始化');
        }

        try {
            await Promise.all([this.producer.connect(), this.admin.connect(), this.consumer.connect()]);
            if (this.shuttingDown) {
                await this.disconnectKafkaClients();
                return;
            }

            await this.consumer.subscribe({
                topic: this.eventsTopic,
                fromBeginning: true
            });
            await this.consumer.run({
                autoCommit: false,
                eachBatchAutoResolve: false,
                partitionsConsumedConcurrently: 1,
                eachBatch: async (payload) => this.processBatch(payload)
            });
            this.started = true;
            this.logger.info.title('Admin SpiceDB Kafka projection consumer 已启动', {
                eventsTopic: this.eventsTopic,
                dlqTopic: this.dlqTopic,
                consumerGroup: this.consumerGroup
            });
        } catch (error) {
            await this.disconnectKafkaClients();
            throw error;
        }
    }

    /**
     * 应用关闭时停止 Kafka consumer，并断开 producer/admin 连接。
     */
    async onModuleDestroy(): Promise<void> {
        this.shuttingDown = true;
        await this.disconnectKafkaClients();
    }

    /**
     * 断开 Kafka consumer、producer 和 admin 连接；启动失败或应用关闭时共用。
     */
    private async disconnectKafkaClients(): Promise<void> {
        if (!this.consumer || !this.producer || !this.admin) {
            return;
        }

        if (this.started) {
            await this.consumer.stop().catch(() => undefined);
        }
        await Promise.all([
            this.consumer.disconnect().catch(() => undefined),
            this.producer.disconnect().catch(() => undefined),
            this.admin.disconnect().catch(() => undefined)
        ]);
        this.started = false;
    }

    /**
     * 按 Kafka batch 顺序逐条处理消息，只有 DB 事务完成后才提交下一 offset。
     */
    private async processBatch(payload: EachBatchPayload): Promise<void> {
        const { batch, heartbeat, isRunning, isStale } = payload;
        for (const message of batch.messages) {
            if (!isRunning() || isStale()) {
                return;
            }

            try {
                const result = await this.processMessage(batch.topic, batch.partition, batch.highWatermark, message);
                const nextOffset = this.getNextOffset(message.offset);
                if (!this.consumer) {
                    throw new Error('SpiceDB Kafka projection consumer 已断开，无法提交 offset');
                }
                await this.consumer.commitOffsets([
                    {
                        topic: batch.topic,
                        partition: batch.partition,
                        offset: nextOffset
                    }
                ]);
                payload.resolveOffset(message.offset);
                this.partitionFailures.set(this.createPartitionKey(batch.topic, batch.partition), 0);
                this.metricsService.recordProjectionEvent(result.status, result.eventType, result.reason);
                await heartbeat();
            } catch (error) {
                await this.recordFailedEvent(batch.topic, batch.partition, message, error);
                this.handleRetryableFailure(batch.topic, batch.partition, error);
                throw error;
            }
        }
    }

    /**
     * 处理单条 Kafka 消息，并把投影写入与事件日志放在同一个数据库事务。
     */
    private async processMessage(
        topic: string,
        partition: number,
        highWatermark: string,
        message: KafkaMessage
    ): Promise<ProjectionEventProcessResult> {
        const parsed = parseSpiceDbKafkaEvent(message.value);
        const result = this.classifyMessage(parsed);
        const eventAt = this.parseKafkaMessageTimestamp(message.timestamp);
        const lag = this.calculateMessageLag(message.offset, highWatermark);

        if (result.status === 'dlq') {
            await this.publishDlqMessage(topic, partition, message, result.reason, result.payload);
        }

        await this.prismaService.$transaction(
            async (tx) => {
                if (result.status === 'applied' && result.events) {
                    await this.projectionService.applyPermissionChangeEventsInTransaction(tx, result.events);
                }
                await tx.spiceDbProjectionEventLog.upsert({
                    where: {
                        topic_partition_offset: {
                            topic,
                            partition,
                            offset: message.offset
                        }
                    },
                    create: {
                        topic,
                        partition,
                        offset: message.offset,
                        eventKey: result.eventKey,
                        zedToken: result.zedToken ?? null,
                        operation: result.operation ?? null,
                        status: result.status,
                        reason: result.reason,
                        payload: result.payload
                    },
                    update: {
                        eventKey: result.eventKey,
                        zedToken: result.zedToken ?? null,
                        operation: result.operation ?? null,
                        status: result.status,
                        reason: result.reason,
                        error: null,
                        payload: result.payload
                    }
                });
                await tx.spiceDbProjectionCursor.upsert({
                    where: {
                        topic_partition_consumerGroup: {
                            topic,
                            partition,
                            consumerGroup: this.consumerGroup
                        }
                    },
                    create: {
                        topic,
                        partition,
                        consumerGroup: this.consumerGroup,
                        lastOffset: message.offset,
                        lastEventKey: result.eventKey,
                        lastZedToken: result.zedToken ?? null,
                        lastEventAt: eventAt,
                        lastProcessedAt: new Date(),
                        lag
                    },
                    update: {
                        lastOffset: message.offset,
                        lastEventKey: result.eventKey,
                        lastZedToken: result.zedToken ?? null,
                        lastEventAt: eventAt,
                        lastProcessedAt: new Date(),
                        lag
                    }
                });
            },
            {
                maxWait: 10000,
                timeout: 30000
            }
        );

        this.metricsService.setConsumerLag(topic, partition, Number(lag));
        this.metricsService.setLastConsumedEventAt(eventAt);
        if (result.zedToken) {
            this.metricsService.setLastZedTokenUpdatedAt(new Date());
        }
        if (result.status === 'applied' && result.events?.length) {
            try {
                await this.invalidationService.invalidateByProjectionUpdates(result.events);
            } catch (error) {
                // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影缓存刷新失败
                this.logger.warn('SpiceDB Watch 投影已写入，但刷新投影缓存版本失败', {
                    eventKey: result.eventKey,
                    error
                });
            }
        }

        return result;
    }

    /**
     * 根据解析和 operation 校验结果决定事件应用或进入 DLQ。
     */
    private classifyMessage(parsed: ParsedSpiceDbKafkaEvent): ProjectionEventProcessResult {
        if (!parsed.ok) {
            return {
                status: 'dlq',
                reason: parsed.reason,
                eventKey: `malformed:${parsed.reason}`,
                payload: this.toJsonValue(parsed.payload),
                eventType: 'unknown'
            };
        }

        const unknownOperationEvent = parsed.events.find((event) => !isKnownSpiceDbOperation(event.operation));
        if (unknownOperationEvent) {
            return {
                status: 'dlq',
                reason: 'unknown_operation',
                events: parsed.events,
                parsed,
                eventKey: parsed.eventKey,
                payload: this.toJsonValue(parsed.payload),
                zedToken: this.resolveBatchZedToken(parsed.events),
                operation: unknownOperationEvent.operation,
                eventType: parsed.events.length > 1 ? 'relationship_batch' : 'relationship'
            };
        }

        return {
            status: 'applied',
            reason: 'base_relation_projection',
            events: parsed.events,
            parsed,
            eventKey: parsed.eventKey,
            payload: this.toJsonValue(parsed.payload),
            zedToken: this.resolveBatchZedToken(parsed.events),
            operation: parsed.events.length === 1 ? parsed.events[0].operation : 'batch',
            eventType: parsed.events.length > 1 ? 'relationship_batch' : 'relationship'
        };
    }

    /**
     * 将污染消息写入 DLQ topic，保留原 topic/partition/offset 便于追踪。
     */
    private async publishDlqMessage(
        topic: string,
        partition: number,
        message: KafkaMessage,
        reason: string,
        payload: Prisma.InputJsonValue
    ): Promise<void> {
        if (!this.producer) {
            throw new Error('SpiceDB Kafka DLQ producer 未完成初始化');
        }

        await this.producer.send({
            topic: this.dlqTopic,
            acks: -1,
            messages: [
                {
                    key: message.key?.toString() ?? `${topic}:${partition}:${message.offset}`,
                    value: JSON.stringify({
                        reason,
                        sourceTopic: topic,
                        sourcePartition: partition,
                        sourceOffset: message.offset,
                        payload,
                        failedAt: new Date().toISOString()
                    })
                }
            ]
        });
    }

    /**
     * 记录可重试异常，不提交 offset，等待 Kafka 重放；超过阈值时暂停 partition 并告警。
     */
    private handleRetryableFailure(topic: string, partition: number, error: unknown): void {
        const key = this.createPartitionKey(topic, partition);
        const failures = (this.partitionFailures.get(key) ?? 0) + 1;
        this.partitionFailures.set(key, failures);
        if (failures >= this.maxFailuresBeforePause) {
            this.consumer?.pause([
                {
                    topic,
                    partitions: [partition]
                }
            ]);
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查 partition 暂停根因
            this.logger.error('SpiceDB Kafka 投影 consumer 连续失败，已暂停分区等待人工处理', {
                topic,
                partition,
                failures,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 投影处理发生可重试异常时记录失败日志，重放由 Kafka 负责。
     */
    private async recordFailedEvent(
        topic: string,
        partition: number,
        message: KafkaMessage,
        error: unknown
    ): Promise<void> {
        const parsed = parseSpiceDbKafkaEvent(message.value);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const eventKey = parsed.ok ? parsed.eventKey : `malformed:${parsed.reason}`;
        const payload = this.toJsonValue(parsed.payload);

        await this.prismaService.spiceDbProjectionEventLog
            .upsert({
                where: {
                    topic_partition_offset: {
                        topic,
                        partition,
                        offset: message.offset
                    }
                },
                create: {
                    topic,
                    partition,
                    offset: message.offset,
                    eventKey,
                    zedToken: parsed.ok ? this.resolveBatchZedToken(parsed.events) : null,
                    operation: parsed.ok ? (parsed.events.length === 1 ? parsed.events[0].operation : 'batch') : null,
                    status: 'failed',
                    reason: 'retryable_processing_failure',
                    error: errorMessage,
                    payload
                },
                update: {
                    status: 'failed',
                    reason: 'retryable_processing_failure',
                    error: errorMessage,
                    payload
                }
            })
            .catch((logError) => {
                // 保留完整 detail 调用：logError 内含 stack，便于排查日志写入链路本身故障
                this.logger.warn('记录 SpiceDB Kafka 投影失败日志失败', {
                    error: logError instanceof Error ? logError.message : String(logError)
                });
            });
    }

    /**
     * 读取投影同步游标和 Kafka lag，供 overview API 展示。
     */
    async getProjectionCursorOverview(): Promise<{
        cursors: Array<{
            topic: string;
            partition: number;
            consumerGroup: string;
            lastOffset: string | null;
            lastEventKey: string | null;
            lastZedToken: string | null;
            lastEventAt: string | null;
            lastProcessedAt: string | null;
            lag: string;
        }>;
        lag: number;
        lastEventAt: string | null;
    }> {
        const cursors = asPrismaISODate(
            await this.prismaService.spiceDbProjectionCursor.findMany({
                where: {
                    topic: this.eventsTopic,
                    consumerGroup: this.consumerGroup
                },
                orderBy: {
                    partition: 'asc'
                }
            })
        );
        const latestCursor = cursors
            .filter((cursor) => cursor.lastEventAt)
            .sort((left, right) => (right.lastEventAt ?? '').localeCompare(left.lastEventAt ?? ''))[0];

        return {
            cursors: cursors.map((cursor) => ({
                topic: cursor.topic,
                partition: cursor.partition,
                consumerGroup: cursor.consumerGroup,
                lastOffset: cursor.lastOffset,
                lastEventKey: cursor.lastEventKey,
                lastZedToken: cursor.lastZedToken,
                lastEventAt: cursor.lastEventAt,
                lastProcessedAt: cursor.lastProcessedAt,
                lag: cursor.lag.toString()
            })),
            lag: cursors.reduce((sum, cursor) => sum + Number(cursor.lag), 0),
            lastEventAt: latestCursor?.lastEventAt ?? null
        };
    }

    /**
     * 计算下一条待提交 offset，Kafka commit offset 使用“下一条 offset”语义。
     */
    private getNextOffset(offset: string): string {
        return (BigInt(offset) + 1n).toString();
    }

    /**
     * 批量 Watch payload 中只在 token 完全一致时记录 ZedToken，避免混合 token 被误当作单一进度。
     */
    private resolveBatchZedToken(events: AdminSpiceDbRelationshipChangeEvent[]): string | null {
        const tokens = [...new Set(events.map((event) => event.zedToken).filter((token): token is string => !!token))];
        return tokens.length === 1 ? tokens[0] : null;
    }

    /**
     * 估算单条消息处理后剩余 lag。
     */
    private calculateMessageLag(offset: string, highWatermark?: string): bigint {
        if (!highWatermark) {
            return 0n;
        }

        const lag = BigInt(highWatermark) - BigInt(offset) - 1n;
        return lag > 0n ? lag : 0n;
    }

    /**
     * 解析 Kafka 消息时间戳；缺失或异常时用当前时间保持指标可用。
     */
    private parseKafkaMessageTimestamp(timestamp: string): Date {
        const millis = Number(timestamp);
        if (!Number.isFinite(millis) || millis <= 0) {
            return new Date();
        }
        return new Date(millis);
    }

    /**
     * 生成 topic/partition 维度的失败计数 key。
     */
    private createPartitionKey(topic: string, partition: number): string {
        return `${topic}:${partition}`;
    }

    /**
     * 将未知 payload 转为 Prisma JSON 可写入的结构。
     */
    private toJsonValue(payload: unknown): Prisma.InputJsonValue {
        if (payload === undefined) {
            return null as unknown as Prisma.InputJsonValue;
        }

        return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
    }
}
