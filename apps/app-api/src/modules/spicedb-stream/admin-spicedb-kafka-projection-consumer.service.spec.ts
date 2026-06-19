import { ConfigService } from '@nestjs/config';
import { AdminSpiceDbKafkaProjectionConsumerService } from './admin-spicedb-kafka-projection-consumer.service';
import { createSpiceDbKafka } from './admin-spicedb-kafka.config';

jest.mock('./admin-spicedb-kafka.config', () => ({
    APP_SPICEDB_WATCH_DLQ_TOPIC: 'app-api.spicedb.watch-dlq.v1',
    APP_SPICEDB_WATCH_EVENTS_TOPIC: 'app-api.spicedb.watch-events.v1',
    createSpiceDbKafka: jest.fn()
}));

describe('AdminSpiceDbKafkaProjectionConsumerService', () => {
    const createConfigService = (enabled: boolean) =>
        ({
            get: jest.fn((key: string, defaultValue?: string) => {
                const values: Record<string, string> = {
                    APP_SPICEDB_KAFKA_ENABLED: String(enabled),
                    APP_SPICEDB_KAFKA_WATCH_EVENTS_TOPIC: 'events-topic',
                    APP_SPICEDB_KAFKA_WATCH_DLQ_TOPIC: 'dlq-topic',
                    APP_SPICEDB_KAFKA_PROJECTION_CONSUMER_GROUP: 'consumer-group',
                    APP_SPICEDB_KAFKA_PROJECTION_CONSUMER_MAX_FAILURES: '5'
                };

                return values[key] ?? defaultValue;
            })
        }) as unknown as ConfigService;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('Kafka 连接未返回时，不应阻塞 Nest 应用启动生命周期', async () => {
        const pendingConnect = new Promise<void>(() => undefined);
        const consumer = {
            connect: jest.fn(() => pendingConnect),
            subscribe: jest.fn(),
            run: jest.fn(),
            disconnect: jest.fn(),
            stop: jest.fn()
        };
        const producer = {
            connect: jest.fn(() => pendingConnect),
            disconnect: jest.fn()
        };
        const admin = {
            connect: jest.fn(() => pendingConnect),
            disconnect: jest.fn()
        };
        const kafka = {
            consumer: jest.fn(() => consumer),
            producer: jest.fn(() => producer),
            admin: jest.fn(() => admin)
        };
        (createSpiceDbKafka as jest.Mock).mockReturnValue(kafka);
        const service = new AdminSpiceDbKafkaProjectionConsumerService(
            createConfigService(true),
            {} as any,
            {} as any,
            {} as any,
            {} as any
        );

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        expect(producer.connect).toHaveBeenCalledTimes(1);
        expect(admin.connect).toHaveBeenCalledTimes(1);
        expect(consumer.connect).toHaveBeenCalledTimes(1);
        expect(consumer.run).not.toHaveBeenCalled();
    });

    it('未启用 Kafka 投影同步时，不应创建 Kafka 客户端', async () => {
        const service = new AdminSpiceDbKafkaProjectionConsumerService(
            createConfigService(false),
            {} as any,
            {} as any,
            {} as any,
            {} as any
        );

        await service.onApplicationBootstrap();

        expect(createSpiceDbKafka).not.toHaveBeenCalled();
    });
});
