import { ConfigService } from '@nestjs/config';
import createSnappyCodec from 'kafkajs-snappy';
import { CompressionCodecs, CompressionTypes, Kafka, logLevel, type KafkaConfig, type SASLOptions } from 'kafkajs';

export const ADMIN_SPICEDB_WATCH_EVENTS_TOPIC = 'admin-api.spicedb.watch-events.v1';
export const ADMIN_SPICEDB_WATCH_DLQ_TOPIC = 'admin-api.spicedb.watch-dlq.v1';
export const ADMIN_SPICEDB_KAFKA_CLIENT_ID = 'admin-api-spicedb-projection';

let spiceDbKafkaSnappyCodecRegistered = false;

/**
 * 读取逗号分隔环境变量，并保留顺序生成非空字符串数组。
 */
export function parseCommaSeparatedEnv(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

/**
 * 读取 SpiceDB Kafka broker 列表，缺失时显式报错避免 consumer 连接到错误目标。
 */
export function getSpiceDbKafkaBrokersOrThrow(configService: ConfigService): string[] {
    const brokers = parseCommaSeparatedEnv(configService.get<string>('ADMIN_SPICEDB_KAFKA_BROKERS'));
    if (brokers.length === 0) {
        throw new Error('缺少 ADMIN_SPICEDB_KAFKA_BROKERS 配置，无法启动 SpiceDB Kafka 投影同步');
    }

    return brokers;
}

/**
 * 读取 SpiceDB Kafka SASL 配置；未配置账号密码时不启用 SASL。
 */
export function createSpiceDbKafkaSaslOptions(configService: ConfigService): SASLOptions | undefined {
    const username = configService.get<string>('ADMIN_SPICEDB_KAFKA_SASL_USERNAME');
    const password = configService.get<string>('ADMIN_SPICEDB_KAFKA_SASL_PASSWORD');

    if (!username && !password) {
        return undefined;
    }
    if (!username || !password) {
        throw new Error('ADMIN_SPICEDB_KAFKA_SASL_USERNAME 和 ADMIN_SPICEDB_KAFKA_SASL_PASSWORD 必须同时配置');
    }

    return {
        mechanism: 'plain',
        username,
        password
    };
}

/**
 * 构造 KafkaJS 共享配置，consumer 与运维查询共用同一套连接参数。
 */
export function createSpiceDbKafkaConfig(configService: ConfigService): KafkaConfig {
    return {
        clientId: configService.get<string>('ADMIN_SPICEDB_KAFKA_CLIENT_ID', ADMIN_SPICEDB_KAFKA_CLIENT_ID),
        brokers: getSpiceDbKafkaBrokersOrThrow(configService),
        ssl: configService.get<string>('ADMIN_SPICEDB_KAFKA_SSL', 'false') === 'true',
        sasl: createSpiceDbKafkaSaslOptions(configService),
        logLevel: logLevel.WARN
    };
}

/**
 * 注册 KafkaJS Snappy codec，避免消费 Snappy 压缩消息时触发 KafkaJSNotImplemented。
 */
export function registerSpiceDbKafkaSnappyCodec(): void {
    if (spiceDbKafkaSnappyCodecRegistered) {
        return;
    }

    CompressionCodecs[CompressionTypes.Snappy] = createSnappyCodec;
    spiceDbKafkaSnappyCodecRegistered = true;
}

/**
 * 创建 KafkaJS 实例，集中隔离 Kafka 连接配置解析。
 */
export function createSpiceDbKafka(configService: ConfigService): Kafka {
    registerSpiceDbKafkaSnappyCodec();
    return new Kafka(createSpiceDbKafkaConfig(configService));
}
