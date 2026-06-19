import { createRuntimeLogger } from '@app/common';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Producer } from 'kafkajs';
import { ADMIN_SPICEDB_WATCH_EVENTS_TOPIC, createSpiceDbKafka } from '../../spicedb-stream/admin-spicedb-kafka.config';

export type SpiceDbWatchReplayMessage = {
    id: number;
    key: string;
    payload: unknown;
};

/**
 * 提供 SpiceDB Watch 运维回放所需的 Kafka producer 能力。
 */
@Injectable()
export class SpiceDbDataKafkaOpsService implements OnModuleDestroy {
    private readonly logger = createRuntimeLogger(SpiceDbDataKafkaOpsService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'spicedb_kafka_ops' }
    });
    private producerPromise?: Promise<Producer>;
    private readonly eventsTopic: string;

    /**
     * 读取 Kafka topic 配置，producer 按需连接，避免未使用回放功能时占用连接。
     */
    constructor(private readonly configService: ConfigService) {
        this.eventsTopic = this.configService.get<string>(
            'ADMIN_SPICEDB_KAFKA_WATCH_EVENTS_TOPIC',
            ADMIN_SPICEDB_WATCH_EVENTS_TOPIC
        );
    }

    /**
     * 模块销毁时断开按需创建的 Kafka producer。
     */
    async onModuleDestroy(): Promise<void> {
        if (!this.producerPromise) {
            return;
        }

        const producer = await this.producerPromise.catch(() => null);
        await producer?.disconnect().catch(() => undefined);
        this.producerPromise = undefined;
    }

    /**
     * 将 DLQ 或失败事件原始 payload 重新投递到 Watch events topic。
     */
    async replayWatchMessages(messages: SpiceDbWatchReplayMessage[]): Promise<void> {
        if (messages.length === 0) {
            return;
        }

        const producer = await this.getProducer();
        await producer.send({
            topic: this.eventsTopic,
            acks: -1,
            messages: messages.map((message) => ({
                key: message.key,
                value: JSON.stringify(message.payload)
            }))
        });
        this.logger.info.title('已回放 SpiceDB Watch 事件', {
            topic: this.eventsTopic,
            count: messages.length,
            ids: messages.map((message) => message.id)
        });
    }

    /**
     * 按需创建并缓存 Kafka producer。
     */
    private async getProducer(): Promise<Producer> {
        if (!this.producerPromise) {
            this.producerPromise = this.createProducer();
        }

        return await this.producerPromise;
    }

    /**
     * 创建 Kafka producer 并完成连接。
     */
    private async createProducer(): Promise<Producer> {
        const kafka = createSpiceDbKafka(this.configService);
        const producer = kafka.producer({
            allowAutoTopicCreation: false,
            idempotent: true,
            maxInFlightRequests: 1
        });
        await producer.connect();
        return producer;
    }
}
