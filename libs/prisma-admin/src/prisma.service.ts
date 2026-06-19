import { createRuntimeLogger } from '@app/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { AdminExtendedPrismaClient } from './extended-client';
import { MenuStatusEnum, RbacStatus } from './generated/client';

@Injectable()
export class AdminPrismaService extends AdminExtendedPrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = createRuntimeLogger(AdminPrismaService.name);
    private readonly maxRetries = 5;
    private readonly retryDelay = 3000; // 3秒

    /** 模块初始化时建立 Prisma 连接。 */
    async onModuleInit() {
        this.logger.info.title('AdminPrismaService onModuleInit 开始');
        await this.connectWithRetry();
        await this.warmupPool();
        await this.warmupRbacQueryPaths();
        this.logger.info.title('AdminPrismaService onModuleInit 完成');
    }

    /** 按重试策略建立数据库连接，并输出统一格式的连接日志。 */
    private async connectWithRetry(attempt = 1): Promise<void> {
        try {
            await this.$connect();
            this.logger.info.title('Database connected successfully');
        } catch (error) {
            if (attempt >= this.maxRetries) {
                this.logger.error(`Failed to connect to database after ${this.maxRetries} attempts`);
                throw error;
            }

            this.logger.warn(
                `Database connection failed (attempt ${attempt}/${this.maxRetries}), retrying in ${this.retryDelay / 1000}s...`
            );

            await this.delay(this.retryDelay);
            await this.connectWithRetry(attempt + 1);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * 应用启动后主动打热 pg 连接池，避免首批业务查询承担建连和认证耗时。
     * 预热失败只降级为日志告警，不能阻断服务启动。
     */
    private async warmupPool(): Promise<void> {
        const enabled = process.env.PRISMA_PG_POOL_WARMUP_ENABLED !== 'false';
        if (!enabled) {
            return;
        }

        const warmupSize = this.readPositiveIntegerEnv('PRISMA_PG_POOL_WARMUP_SIZE', 4);

        try {
            await Promise.all(
                Array.from({ length: warmupSize }, () => this.$queryRaw`SELECT 1::int AS warmup FROM pg_sleep(0.05)`)
            );
            this.logger.info(`Prisma pg pool warmup completed, size=${warmupSize}`);
        } catch (error) {
            this.logger.warn(`Prisma pg pool warmup failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 仅在明确开启时预热当前应用 RBAC rebuild 会用到的 Prisma 查询形状。
     * pg pool 预热只能建好连接，第一次 model findMany 仍会承担 Prisma 查询路径冷启动成本。
     */
    private async warmupRbacQueryPaths(): Promise<void> {
        const enabled = process.env.PRISMA_PG_RBAC_QUERY_WARMUP_ENABLED === 'true';
        if (!enabled) {
            return;
        }

        try {
            const startedAt = Date.now();
            await Promise.all([
                this.rbacPermission.findMany({
                    where: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    },
                    select: {
                        id: true,
                        code: true
                    },
                    orderBy: {
                        id: 'asc'
                    }
                }),
                this.rbacMenu.findMany({
                    where: {
                        status: MenuStatusEnum.ENABLE
                    },
                    select: {
                        id: true,
                        requiredPermissionCode: true
                    },
                    orderBy: {
                        id: 'asc'
                    }
                }),
                this.rbacRolePermission.findMany({
                    where: {
                        permission: {
                            status: RbacStatus.ENABLE,
                            deletedAt: null
                        }
                    },
                    select: {
                        roleId: true,
                        permissionId: true
                    }
                })
            ]);
            this.logger.info(`Prisma RBAC query path warmup completed, durationMs=${Date.now() - startedAt}`);
        } catch (error) {
            this.logger.warn(
                `Prisma RBAC query path warmup failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private readPositiveIntegerEnv(name: string, defaultValue: number): number {
        const rawValue = process.env[name];
        if (!rawValue) {
            return defaultValue;
        }

        const value = Number(rawValue);
        return Number.isInteger(value) && value > 0 ? value : defaultValue;
    }

    /** 模块销毁时主动断开 Prisma 连接。 */
    async onModuleDestroy() {
        await this.$disconnect();
    }
}
