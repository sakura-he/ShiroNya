import { EventEmitter } from 'node:events';
import * as runtimeLogger from '../logger/runtime-logger';
import { attachRedisClientListeners, resolveRedisConnectionConfig } from './index';

class MockRedisClient extends EventEmitter {
    isReady = false;
}

describe('redis listeners utils', () => {
    let writeSystemLogSpy: jest.SpyInstance;

    beforeEach(() => {
        writeSystemLogSpy = jest.spyOn(runtimeLogger, 'writeSystemLog').mockImplementation(() => {
            return {
                ts: new Date().toISOString(),
                level: 'info',
                logType: 'system',
                app: 'jest-app',
                env: 'test',
                module: 'mock',
                userId: 'system',
                labels: {
                    app: 'jest-app',
                    env: 'test',
                    log_type: 'system',
                    level: 'info',
                    module: 'mock',
                    user_id: 'system'
                },
                message: 'mock',
                event: 'mock'
            };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * 验证重复绑定时不会注册多份 error 监听。
     */
    it('should attach redis error listener only once', () => {
        const client = new MockRedisClient();

        attachRedisClientListeners(client as any, {
            connectionName: 'DEFAULT_REDIS',
            bindLifecycleEvents: false
        });
        attachRedisClientListeners(client as any, {
            connectionName: 'DEFAULT_REDIS',
            bindLifecycleEvents: false
        });

        client.emit('error', new Error('boom'));

        expect(writeSystemLogSpy).toHaveBeenCalledTimes(1);
        expect(writeSystemLogSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'error',
                module: 'default_redis',
                message: 'Redis 连接异常',
                context: expect.objectContaining({
                    connectionName: 'DEFAULT_REDIS',
                    error: 'boom'
                })
            })
        );
    });

    /**
     * 验证显式绑定后可以正确输出 Redis 生命周期日志。
     */
    it('should log redis lifecycle events after attaching listeners', () => {
        const client = new MockRedisClient();

        attachRedisClientListeners(client as any, {
            connectionName: 'CACHE_REDIS'
        });

        client.emit('ready');
        client.emit('reconnecting');
        client.emit('end');

        expect(writeSystemLogSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                level: 'info',
                module: 'cache_redis',
                message: 'Redis connected successfully'
            })
        );
        expect(writeSystemLogSpy).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                level: 'warn',
                module: 'cache_redis',
                message: 'Redis reconnecting...'
            })
        );
        expect(writeSystemLogSpy).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                level: 'warn',
                module: 'cache_redis',
                message: 'Redis connection closed'
            })
        );
    });
});

describe('resolveRedisConnectionConfig', () => {
    function createConfig(values: Record<string, unknown>) {
        return {
            get: jest.fn((key: string) => values[key])
        };
    }

    it('prefers scoped admin redis config over legacy REDIS config', () => {
        const config = createConfig({
            REDIS_HOST: 'legacy-redis',
            REDIS_PORT: '6379',
            ADMIN_REDIS_HOST: 'admin-redis',
            ADMIN_REDIS_PORT: '17379',
            ADMIN_REDIS_USER: 'admin',
            ADMIN_REDIS_PASSWORD: 'secret'
        });

        const result = resolveRedisConnectionConfig(config, 'ADMIN');

        expect(result).toEqual(
            expect.objectContaining({
                sourcePrefix: 'ADMIN_REDIS',
                host: 'admin-redis',
                port: '17379',
                user: 'admin',
                url: 'redis://admin:secret@admin-redis:17379'
            })
        );
    });

    it('falls back to legacy REDIS config when scoped config is absent', () => {
        const config = createConfig({
            REDIS_HOST: 'shared-redis',
            REDIS_PORT: '6379',
            REDIS_USER: 'shared',
            REDIS_PASSWORD: 'secret'
        });

        const result = resolveRedisConnectionConfig(config, 'APP');

        expect(result).toEqual(
            expect.objectContaining({
                sourcePrefix: 'REDIS',
                host: 'shared-redis',
                port: '6379',
                user: 'shared',
                url: 'redis://shared:secret@shared-redis:6379'
            })
        );
    });

    it('supports scoped redis url with db index', () => {
        const config = createConfig({
            APP_REDIS_URL: 'redis://app:secret@app-redis:26379/2'
        });

        const result = resolveRedisConnectionConfig(config, 'APP');

        expect(result).toEqual(
            expect.objectContaining({
                sourcePrefix: 'APP_REDIS',
                host: 'app-redis',
                port: '26379',
                user: 'app',
                db: '2',
                url: 'redis://app:secret@app-redis:26379/2'
            })
        );
    });
});
