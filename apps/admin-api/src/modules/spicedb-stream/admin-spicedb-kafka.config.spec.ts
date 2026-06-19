import { ConfigService } from '@nestjs/config';
import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import { createSpiceDbKafka } from './admin-spicedb-kafka.config';

describe('createSpiceDbKafka', () => {
    it('创建 Kafka 实例前应注册 Snappy codec', async () => {
        const configService = {
            get: jest.fn((key: string, defaultValue?: string) => {
                if (key === 'ADMIN_SPICEDB_KAFKA_BROKERS') {
                    return 'localhost:19092';
                }

                return defaultValue;
            })
        } as unknown as ConfigService;

        createSpiceDbKafka(configService);

        const codec = CompressionCodecs[CompressionTypes.Snappy]();
        const source = Buffer.from('admin-api-snappy-message');
        const compressed = await codec.compress({ buffer: source });

        await expect(codec.decompress(compressed)).resolves.toEqual(source);
    });
});
