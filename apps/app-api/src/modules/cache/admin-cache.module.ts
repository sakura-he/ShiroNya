import { createRuntimeLogger, resolveRedisConnectionConfig } from '@app/common';
import { APP_API_CACHE_MANAGER_REDIS_NAMESPACE } from '@app/common/constants';
import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const cacheRedisLogger = createRuntimeLogger('app_api_cache_redis');

@Module({
    imports: [
        CacheModule.registerAsync({
            isGlobal: true,
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => {
                const redisConfig = resolveRedisConnectionConfig(configService, 'APP');
                const keyvRedis = new KeyvRedis(redisConfig.url);

                keyvRedis.on('error', (error) => {
                    cacheRedisLogger.error('CacheModule Redis 连接失败', {
                        error,
                        host: redisConfig.host,
                        port: redisConfig.port,
                        user: redisConfig.user,
                        sourcePrefix: redisConfig.sourcePrefix
                    });
                });

                keyvRedis.on('connect', () => {
                    cacheRedisLogger.info.title('CacheModule Redis 连接成功');
                });

                return {
                    stores: [keyvRedis],
                    namespace: APP_API_CACHE_MANAGER_REDIS_NAMESPACE
                };
            }
        })
    ],
    exports: [CacheModule]
})
export class AdminCacheModule {}
