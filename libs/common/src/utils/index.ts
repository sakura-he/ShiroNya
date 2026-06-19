import * as crypto from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-code.constant';
import { BusinessException } from '../exceptions/biz.exception';
import { writeSystemLog } from '../logger/runtime-logger';
import { monotonicFactory, ulid } from 'ulid';
import type { RedisClientType } from 'redis';

const REDIS_ERROR_LISTENER_BOUND_KEY = Symbol.for('admin-api.redis.error.listener.bound');
const REDIS_LIFECYCLE_LISTENER_BOUND_KEY = Symbol.for('admin-api.redis.lifecycle.listener.bound');

type RedisLikeClient = Pick<RedisClientType, 'on'> & {
    isReady?: boolean;
    [REDIS_ERROR_LISTENER_BOUND_KEY]?: boolean;
    [REDIS_LIFECYCLE_LISTENER_BOUND_KEY]?: boolean;
};

type RedisListenerOptions = {
    connectionName: string;
    host?: string;
    port?: string | number;
    user?: string;
    bindLifecycleEvents?: boolean;
};

export type RedisConnectionScope = 'ADMIN' | 'APP';

export type ResolvedRedisConnectionConfig = {
    url: string;
    host: string;
    port: string;
    user: string;
    db: string | null;
    sourcePrefix: `${RedisConnectionScope}_REDIS` | 'REDIS';
};

type RedisConfigReader = {
    get<T = unknown>(propertyPath: string): T | undefined;
};

type ValidationErrorLike = {
    property: string;
    value?: unknown;
    constraints?: Record<string, string>;
};

/**
 * 将 Redis 连接名转换为日志模块名
 */
function getRedisLogModuleName(connectionName: string): string {
    return connectionName.trim().toLowerCase();
}

/**
 * 输出 Redis 生命周期系统日志
 */
function writeRedisLifecycleLog(
    connectionName: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    extraContext?: Record<string, unknown>
): void {
    writeSystemLog({
        level,
        module: getRedisLogModuleName(connectionName),
        message,
        event: 'redis_lifecycle',
        context: {
            connectionName,
            ...extraContext
        }
    });
}

export function md5(str: string) {
    return crypto.createHash('md5').update(str).digest('hex');
}

export function isUndefined(value: any): value is undefined {
    return value === undefined;
}

export function isNull(value: any): value is null {
    return value === null;
}

export function isEmpty(value: any): value is '' | undefined | null {
    return value === '' || isUndefined(value) || isNull(value);
}

/**
 * 将校验错误数组转换成统一的 BadRequestException 文案。
 */
export function validationClassValidateExceptionFactory(errors: ValidationErrorLike[]) {
    let errorMessage = errors
        .map((ValidationError) => {
            let validateField = ValidationError.property;
            let validateValue = ValidationError.value;
            let errorConstraints = ValidationError.constraints!;
            let errorConstraintsMessage = Object.entries(errorConstraints)
                .map(([key, value]) => {
                    return `${key}: ${value}`;
                })
                .join(', ');
            return `字段[${validateField}]验证失败! 当前值: [${validateValue}]，必须满足: [${errorConstraintsMessage}]`;
        })
        .join('; ');
    return new BadRequestException(errorMessage);
}

export function ParseIntPipeError(param: any) {
    return function (error: any) {
        return new BusinessException({
            code: ErrorCodes.PARAM.INVALID.code,
            message: `${ErrorCodes.PARAM.INVALID.message}: 参数${param}转换错误`
        });
    };
}
export function generaterULID(): string {
    return ulid();
}

export function resolveRedisConnectionConfig(
    configService: RedisConfigReader,
    scope: RedisConnectionScope
): ResolvedRedisConnectionConfig {
    const scopedPrefix = `${scope}_REDIS` as const;
    const hasScopedConfig = [
        `${scopedPrefix}_URL`,
        `${scopedPrefix}_HOST`,
        `${scopedPrefix}_PORT`,
        `${scopedPrefix}_USER`,
        `${scopedPrefix}_PASSWORD`,
        `${scopedPrefix}_DB`
    ].some((key) => readConfigString(configService, key) !== null);
    const sourcePrefix = hasScopedConfig ? scopedPrefix : 'REDIS';
    const redisUrl = readConfigString(configService, `${sourcePrefix}_URL`);
    const parsedUrl = redisUrl ? parseRedisUrl(redisUrl) : null;
    const host = readConfigString(configService, `${sourcePrefix}_HOST`) ?? parsedUrl?.host ?? '127.0.0.1';
    const port = readConfigString(configService, `${sourcePrefix}_PORT`) ?? parsedUrl?.port ?? '6379';
    const user = readConfigString(configService, `${sourcePrefix}_USER`) ?? parsedUrl?.user ?? '';
    const password = readConfigString(configService, `${sourcePrefix}_PASSWORD`) ?? parsedUrl?.password ?? '';
    const db = readConfigString(configService, `${sourcePrefix}_DB`) ?? parsedUrl?.db ?? null;

    return {
        url: redisUrl ?? createRedisConnectionUrl({ host, port, user, password, db }),
        host,
        port,
        user,
        db,
        sourcePrefix
    };
}

function readConfigString(configService: RedisConfigReader, key: string): string | null {
    const value = configService.get(key);
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    return text ? text : null;
}

function parseRedisUrl(
    value: string
): (Pick<ResolvedRedisConnectionConfig, 'host' | 'port' | 'user' | 'db'> & { password: string }) | null {
    try {
        const url = new URL(value);
        return {
            host: url.hostname || '127.0.0.1',
            port: url.port || '6379',
            user: decodeURIComponent(url.username || ''),
            password: decodeURIComponent(url.password || ''),
            db: url.pathname && url.pathname !== '/' ? url.pathname.slice(1) : null
        };
    } catch {
        return null;
    }
}

function createRedisConnectionUrl(input: {
    host: string;
    port: string;
    user: string;
    password: string;
    db: string | null;
}): string {
    const auth =
        input.user || input.password ? `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}@` : '';
    const dbPath = input.db ? `/${encodeURIComponent(input.db)}` : '';
    return `redis://${auth}${input.host}:${input.port}${dbPath}`;
}

/**
 * 为 Redis client 显式绑定 error / ready / reconnecting / end 监听。
 */
export function attachRedisClientListeners(
    client: RedisLikeClient | null | undefined,
    options: RedisListenerOptions
): void {
    if (!client || typeof client.on !== 'function') {
        return;
    }

    const { connectionName, host, port, user, bindLifecycleEvents = true } = options;
    const logConfig = { host, port, user };

    if (!client[REDIS_ERROR_LISTENER_BOUND_KEY]) {
        client[REDIS_ERROR_LISTENER_BOUND_KEY] = true;
        client.on('error', (error) => {
            writeRedisLifecycleLog(connectionName, 'error', 'Redis 连接异常', {
                ...logConfig,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        });
    }

    if (!bindLifecycleEvents || client[REDIS_LIFECYCLE_LISTENER_BOUND_KEY]) {
        return;
    }

    client[REDIS_LIFECYCLE_LISTENER_BOUND_KEY] = true;
    client.on('ready', () => {
        writeRedisLifecycleLog(connectionName, 'info', 'Redis connected successfully', logConfig);
    });
    client.on('reconnecting', () => {
        writeRedisLifecycleLog(connectionName, 'warn', 'Redis reconnecting...', logConfig);
    });
    client.on('end', () => {
        writeRedisLifecycleLog(connectionName, 'warn', 'Redis connection closed', logConfig);
    });

    if (client.isReady) {
        writeRedisLifecycleLog(connectionName, 'info', 'Redis connected successfully', logConfig);
    }
}

export * from './sat-audio';
export * from './cors-origin';
