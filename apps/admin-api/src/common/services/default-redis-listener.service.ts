import { attachRedisClientListeners, createRuntimeLogger, resolveRedisConnectionConfig } from '@app/common';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-redis/client';
import type { RedisClientType } from 'redis';

@Injectable()
export class DefaultRedisListenerService implements OnModuleInit {
    private readonly logger = createRuntimeLogger('DefaultRedisListener');

    constructor(
        private readonly configService: ConfigService,
        @InjectRedis('DEFAULT_REDIS') private readonly redisClient: RedisClientType
    ) {}

    /**
     * 为 admin-api 默认 Redis 连接显式绑定监听，替代无效的 onClientCreated 配置。
     */
    onModuleInit(): void {
        this.logger.info.title('[bootstrap] DefaultRedisListenerService.onModuleInit start');
        const redisConfig = resolveRedisConnectionConfig(this.configService, 'ADMIN');
        attachRedisClientListeners(this.redisClient, {
            connectionName: 'ADMIN_API_DEFAULT_REDIS',
            host: redisConfig.host,
            port: redisConfig.port,
            user: redisConfig.user
        });
        this.logger.info.title('[bootstrap] DefaultRedisListenerService.onModuleInit done');
    }
}
