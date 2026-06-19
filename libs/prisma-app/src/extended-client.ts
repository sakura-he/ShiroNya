import { config as loadEnv } from 'dotenv';
import { PrismaClient } from './generated/client';
import { findManyAndCountExtension } from './extensions/find-many-count.extension';
import { PrismaPg } from '@prisma/adapter-pg';
import { dateToISODateStringExtension } from './extensions/date-to-iso-string.extension';
import { prismaQueryTracingExtension } from './extensions/prisma-query-tracing.extension';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { resolve } from 'node:path';

/**
 * 在 Prisma 客户端创建前加载环境变量。
 * 加载顺序：先 .env（基础），再 .env.{NODE_ENV}（覆盖）。
 * 使用 override: true 确保环境特定文件的值优先，
 * 与 ConfigModule 的 envFilePath 优先级语义一致。
 */
function loadPrismaEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    // 先加载基础 .env，再用环境特定文件覆盖（override: true）
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];

    for (const envFile of envFiles) {
        if (!existsSync(envFile)) {
            continue;
        }
        loadEnv({
            path: envFile,
            override: true
        });
    }
}

loadPrismaEnv();

/**
 * 从环境变量读取正整数毫秒配置，缺失或非法时使用调用方给定的项目默认值。
 */
function readPositiveIntegerEnv(name: string, defaultValue: number): number {
    const rawValue = process.env[name];
    if (!rawValue) {
        return defaultValue;
    }

    const value = Number(rawValue);
    return Number.isInteger(value) && value > 0 ? value : defaultValue;
}

function readRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`APP_DATABASE_URL 未配置，无法创建 Prisma 连接`);
    }
    return value;
}

function extendClient(base: PrismaClient) {
    return base
        .$extends(prismaQueryTracingExtension)
        .$extends(findManyAndCountExtension)
        .$extends(dateToISODateStringExtension);
}

class UntypedAppExtendedPrismaClient extends PrismaClient {
    /**
     * 创建带 Prisma 扩展能力的客户端，并显式桥接 Prisma 适配器与根项目的 pg 类型差异。
     */
    constructor(options?: Omit<ConstructorParameters<typeof PrismaClient>[0], 'adapter' | 'accelerateUrl'>) {
        const pool = new Pool({
            connectionString: readRequiredEnv('APP_DATABASE_URL'),
            max: readPositiveIntegerEnv('PRISMA_PG_POOL_MAX', 10),
            connectionTimeoutMillis: readPositiveIntegerEnv('PRISMA_PG_CONNECTION_TIMEOUT_MS', 10_000),
            idleTimeoutMillis: readPositiveIntegerEnv('PRISMA_PG_IDLE_TIMEOUT_MS', 30_000),
            keepAlive: true,
            keepAliveInitialDelayMillis: readPositiveIntegerEnv('PRISMA_PG_KEEP_ALIVE_INITIAL_DELAY_MS', 10_000)
        });
        // 空闲连接被数据库或网络层关闭时让 pg-pool 丢弃坏连接，下一次查询重新建连。
        pool.on('error', (error) => {
            console.warn('[PrismaPgPool] idle client error', error);
        });
        super({
            // PrismaPg 依赖树内置的 pg 类型版本与根项目声明不同，这里按构造参数类型显式收窄。
            adapter: new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]),
            log: ['error', 'warn'],
            ...options
        });
        return extendClient(this) as this;
    }
}

const AppExtendedPrismaClient = UntypedAppExtendedPrismaClient as unknown as new (
    options?: Omit<ConstructorParameters<typeof PrismaClient>[0], 'adapter' | 'accelerateUrl'>
) => ReturnType<typeof extendClient>;

export { AppExtendedPrismaClient, AppExtendedPrismaClient as ExtendedPrismaClient };
