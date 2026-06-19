import { PrismaService } from '@app/prisma-admin';
import {
    BETTER_AUTH_SECONDARY_STORAGE_REDIS_KEY_PREFIX,
    APP_API_CACHE_MANAGER_REDIS_NAMESPACE,
    REDIS_KEY_PREFIX_SAMPLE_LIMIT,
    REDIS_KEY_PREFIX_SCAN_COUNT,
    REDIS_KEY_PREFIX_SCAN_LIMIT,
    ADMIN_API_CACHE_MANAGER_REDIS_NAMESPACE,
    resolveKnownRedisKeyPrefixDefinition
} from '@app/common/constants';
import { CerbosService, getCerbosServiceToken } from '@app/cerbos';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-redis/client';
import { performance } from 'node:perf_hooks';
import type { RedisClientType } from 'redis';
import { UserAdminGrpcClient } from '../../app-api/user/user-admin.grpc-client';
import { AdminSpiceDbAuthorizationService } from '../../spicedb/admin-spicedb-authorization.service';
import {
    ADMIN_SPICEDB_WATCH_EVENTS_TOPIC,
    createSpiceDbKafka
} from '../../spicedb-stream/admin-spicedb-kafka.config';
import type { RedisMonitorOverviewType, SystemMonitorHealthStatus } from './dto/monitor.dto';

type RedisInfo = Record<string, string>;
type SystemMonitorServiceHealthRecord = {
    key: string;
    name: string;
    status: SystemMonitorHealthStatus;
    latencyMs: number | null;
    message: string | null;
    checkedAt: string;
};
type RedisKeyPrefixBucket = {
    prefix: string;
    module: string;
    keyCount: number;
    sampleKeys: string[];
};

@Injectable()
export class SystemMonitorService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly userAdminGrpcClient: UserAdminGrpcClient,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        @Optional() @Inject(getCerbosServiceToken('ADMIN_')) private readonly cerbosService?: CerbosService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    async getRuntimeStatus() {
        const checkedAt = new Date().toISOString();
        const services = await Promise.all([
            this.checkDatabaseHealth(),
            this.checkRedisHealth(),
            this.checkKafkaHealth(),
            this.checkAppApiGrpcHealth(),
            this.checkSpiceDbHealth(),
            this.checkCerbosHealth()
        ]);
        const status = this.resolveOverallStatus(services.map((service) => service.status));

        return {
            checkedAt,
            status,
            services
        };
    }

    async getRedisOverview(): Promise<RedisMonitorOverviewType> {
        const checkedAt = new Date().toISOString();
        if (!this.redis) {
            return this.createOfflineRedisOverview(checkedAt, 'Redis 客户端未注入');
        }

        try {
            const startedAt = performance.now();
            await this.redis.ping();
            const latencyMs = Math.round(performance.now() - startedAt);
            const [rawInfo, dbSize] = await Promise.all([this.sendRedisCommand(['INFO']), this.redis.dbSize()]);
            const keyPrefixes = await this.collectRedisKeyPrefixOverview(dbSize);
            const info = this.parseInfo(String(rawInfo));
            return this.createRedisOverviewFromInfo(info, checkedAt, latencyMs, dbSize, keyPrefixes);
        } catch (error) {
            return this.createOfflineRedisOverview(checkedAt, this.formatError(error));
        }
    }

    private async checkDatabaseHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        try {
            const startedAt = performance.now();
            await this.withHealthTimeout(this.prisma.$queryRaw`SELECT 1::int AS ok`, 'PostgreSQL');
            return {
                key: 'database',
                name: 'PostgreSQL',
                status: 'online' as const,
                latencyMs: Math.round(performance.now() - startedAt),
                message: null,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'database',
                name: 'PostgreSQL',
                status: 'offline' as const,
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        }
    }

    private async checkRedisHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        if (!this.redis) {
            return {
                key: 'redis',
                name: 'Redis',
                status: 'offline' as const,
                latencyMs: null,
                message: 'Redis 客户端未注入',
                checkedAt
            };
        }

        try {
            const startedAt = performance.now();
            await this.withHealthTimeout(this.redis.ping(), 'Redis');
            return {
                key: 'redis',
                name: 'Redis',
                status: 'online' as const,
                latencyMs: Math.round(performance.now() - startedAt),
                message: null,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'redis',
                name: 'Redis',
                status: 'offline' as const,
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        }
    }

    private async checkKafkaHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        if (this.configService.get<string>('ADMIN_SPICEDB_KAFKA_ENABLED', 'false') !== 'true') {
            return this.createDisabledHealth('kafka', 'Kafka', 'ADMIN_SPICEDB_KAFKA_ENABLED=false');
        }

        const startedAt = performance.now();
        let admin: ReturnType<ReturnType<typeof createSpiceDbKafka>['admin']> | null = null;
        try {
            const kafka = createSpiceDbKafka(this.configService);
            admin = kafka.admin();
            await this.withHealthTimeout(admin.connect(), 'Kafka');
            const topics = await this.withHealthTimeout(admin.listTopics(), 'Kafka');
            const watchEventsTopic = this.configService.get<string>(
                'ADMIN_SPICEDB_KAFKA_WATCH_EVENTS_TOPIC',
                ADMIN_SPICEDB_WATCH_EVENTS_TOPIC
            );
            const missingTopicMessage = topics.includes(watchEventsTopic)
                ? null
                : `Kafka 已连接，缺少 topic: ${watchEventsTopic}`;

            return {
                key: 'kafka',
                name: 'Kafka',
                status: missingTopicMessage ? 'degraded' : 'online',
                latencyMs: Math.round(performance.now() - startedAt),
                message: missingTopicMessage,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'kafka',
                name: 'Kafka',
                status: 'offline',
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        } finally {
            await admin?.disconnect().catch(() => undefined);
        }
    }

    private async checkAppApiGrpcHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        if (!this.configService.get<string>('APP_USER_ADMIN_GRPC_PORT')) {
            return this.createDisabledHealth('app-api-grpc', 'app-api gRPC', 'APP_USER_ADMIN_GRPC_PORT 未配置');
        }

        try {
            const startedAt = performance.now();
            await this.withHealthTimeout(
                this.userAdminGrpcClient.callTypedAbacControlPlane(
                    'GetAbacHealth',
                    {},
                    {
                        actor: {
                            id: 'system-monitor',
                            name: 'System Monitor'
                        },
                        requestId: `system-monitor-${Date.now()}`,
                        reason: 'system monitor health check'
                    }
                ),
                'app-api gRPC'
            );
            return {
                key: 'app-api-grpc',
                name: 'app-api gRPC',
                status: 'online',
                latencyMs: Math.round(performance.now() - startedAt),
                message: null,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'app-api-grpc',
                name: 'app-api gRPC',
                status: 'offline',
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        }
    }

    private async checkSpiceDbHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        if (!this.configService.get<string>('ADMIN_SPICEDB_ENDPOINT')) {
            return this.createDisabledHealth('spicedb', 'SpiceDB', 'ADMIN_SPICEDB_ENDPOINT 未配置');
        }

        try {
            const startedAt = performance.now();
            await this.withHealthTimeout(this.spiceDbAuthorizationService.readSchemaText(), 'SpiceDB');
            return {
                key: 'spicedb',
                name: 'SpiceDB',
                status: 'online',
                latencyMs: Math.round(performance.now() - startedAt),
                message: null,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'spicedb',
                name: 'SpiceDB',
                status: 'offline',
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        }
    }

    private async checkCerbosHealth(): Promise<SystemMonitorServiceHealthRecord> {
        const checkedAt = new Date().toISOString();
        if (!this.configService.get<string>('ADMIN_CERBOS_ENDPOINT')) {
            return this.createDisabledHealth('cerbos', 'Cerbos', 'ADMIN_CERBOS_ENDPOINT 未配置');
        }
        if (!this.cerbosService) {
            return this.createDisabledHealth('cerbos', 'Cerbos', 'Cerbos 客户端未注入');
        }

        try {
            const startedAt = performance.now();
            const result = await this.withHealthTimeout(this.cerbosService.getClient().checkHealth(), 'Cerbos');
            const status = result.status === 'SERVING' ? 'online' : 'degraded';
            return {
                key: 'cerbos',
                name: 'Cerbos',
                status,
                latencyMs: Math.round(performance.now() - startedAt),
                message: status === 'online' ? null : `Cerbos 状态: ${result.status}`,
                checkedAt
            };
        } catch (error) {
            return {
                key: 'cerbos',
                name: 'Cerbos',
                status: 'offline',
                latencyMs: null,
                message: this.formatError(error),
                checkedAt
            };
        }
    }

    private resolveOverallStatus(statuses: SystemMonitorHealthStatus[]): SystemMonitorHealthStatus {
        const activeStatuses = statuses.filter((status) => status !== 'disabled');
        if (activeStatuses.length === 0) {
            return 'disabled';
        }
        if (activeStatuses.every((status) => status === 'online')) {
            return 'online';
        }
        if (activeStatuses.some((status) => status === 'online' || status === 'degraded')) {
            return 'degraded';
        }
        return 'offline';
    }

    private createDisabledHealth(key: string, name: string, message: string): SystemMonitorServiceHealthRecord {
        return {
            key,
            name,
            status: 'disabled',
            latencyMs: null,
            message,
            checkedAt: new Date().toISOString()
        };
    }

    private async withHealthTimeout<T>(operation: Promise<T>, serviceName: string): Promise<T> {
        const timeoutMs = Number(this.configService.get<string>('SYSTEM_MONITOR_HEALTH_TIMEOUT_MS', '3000'));
        let timeout: NodeJS.Timeout | undefined;
        try {
            return await Promise.race([
                operation,
                new Promise<T>((_, reject) => {
                    timeout = setTimeout(() => {
                        reject(new Error(`${serviceName} 健康检查超时: ${timeoutMs}ms`));
                    }, timeoutMs);
                })
            ]);
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    }

    private async sendRedisCommand(command: string[]): Promise<unknown> {
        return await (this.redis as RedisClientType & { sendCommand(command: string[]): Promise<unknown> }).sendCommand(
            command
        );
    }

    private createRedisOverviewFromInfo(
        info: RedisInfo,
        checkedAt: string,
        latencyMs: number,
        dbSize: number,
        keyPrefixes: RedisMonitorOverviewType['keyPrefixes']
    ): RedisMonitorOverviewType {
        return {
            checkedAt,
            status: 'online',
            latencyMs,
            dbSize,
            error: null,
            server: {
                redisVersion: this.readString(info, 'redis_version'),
                redisMode: this.readString(info, 'redis_mode'),
                os: this.readString(info, 'os'),
                archBits: this.readNumber(info, 'arch_bits'),
                tcpPort: this.readNumber(info, 'tcp_port'),
                uptimeSeconds: this.readNumber(info, 'uptime_in_seconds'),
                uptimeDays: this.readNumber(info, 'uptime_in_days')
            },
            clients: {
                connectedClients: this.readNumber(info, 'connected_clients'),
                blockedClients: this.readNumber(info, 'blocked_clients'),
                trackingClients: this.readNumber(info, 'tracking_clients'),
                maxClients: this.readNumber(info, 'maxclients')
            },
            memory: {
                usedMemory: this.readNumber(info, 'used_memory'),
                usedMemoryHuman: this.readString(info, 'used_memory_human'),
                usedMemoryPeak: this.readNumber(info, 'used_memory_peak'),
                usedMemoryPeakHuman: this.readString(info, 'used_memory_peak_human'),
                maxMemory: this.readNumber(info, 'maxmemory'),
                maxMemoryHuman: this.readString(info, 'maxmemory_human'),
                maxMemoryPolicy: this.readString(info, 'maxmemory_policy'),
                memFragmentationRatio: this.readNumber(info, 'mem_fragmentation_ratio')
            },
            stats: {
                totalConnectionsReceived: this.readNumber(info, 'total_connections_received'),
                totalCommandsProcessed: this.readNumber(info, 'total_commands_processed'),
                instantaneousOpsPerSec: this.readNumber(info, 'instantaneous_ops_per_sec'),
                totalNetInputBytes: this.readNumber(info, 'total_net_input_bytes'),
                totalNetOutputBytes: this.readNumber(info, 'total_net_output_bytes'),
                rejectedConnections: this.readNumber(info, 'rejected_connections'),
                expiredKeys: this.readNumber(info, 'expired_keys'),
                evictedKeys: this.readNumber(info, 'evicted_keys'),
                keyspaceHits: this.readNumber(info, 'keyspace_hits'),
                keyspaceMisses: this.readNumber(info, 'keyspace_misses'),
                hitRate: this.calculateHitRate(info)
            },
            persistence: {
                rdbChangesSinceLastSave: this.readNumber(info, 'rdb_changes_since_last_save'),
                rdbLastSaveTime: this.formatUnixSeconds(this.readNumber(info, 'rdb_last_save_time')),
                rdbLastBgsaveStatus: this.readString(info, 'rdb_last_bgsave_status'),
                aofEnabled: this.readBoolean(info, 'aof_enabled'),
                aofLastBgrewriteStatus: this.readString(info, 'aof_last_bgrewrite_status')
            },
            replication: {
                role: this.readString(info, 'role'),
                connectedSlaves: this.readNumber(info, 'connected_slaves'),
                masterHost: this.readString(info, 'master_host'),
                masterPort: this.readNumber(info, 'master_port'),
                masterLinkStatus: this.readString(info, 'master_link_status')
            },
            keyspace: this.parseKeyspace(info),
            keyPrefixes,
            commandStats: this.parseCommandStats(info)
        };
    }

    private createOfflineRedisOverview(checkedAt: string, error: string): RedisMonitorOverviewType {
        return {
            checkedAt,
            status: 'offline',
            latencyMs: null,
            dbSize: null,
            error,
            server: {
                redisVersion: null,
                redisMode: null,
                os: null,
                archBits: null,
                tcpPort: null,
                uptimeSeconds: null,
                uptimeDays: null
            },
            clients: {
                connectedClients: null,
                blockedClients: null,
                trackingClients: null,
                maxClients: null
            },
            memory: {
                usedMemory: null,
                usedMemoryHuman: null,
                usedMemoryPeak: null,
                usedMemoryPeakHuman: null,
                maxMemory: null,
                maxMemoryHuman: null,
                maxMemoryPolicy: null,
                memFragmentationRatio: null
            },
            stats: {
                totalConnectionsReceived: null,
                totalCommandsProcessed: null,
                instantaneousOpsPerSec: null,
                totalNetInputBytes: null,
                totalNetOutputBytes: null,
                rejectedConnections: null,
                expiredKeys: null,
                evictedKeys: null,
                keyspaceHits: null,
                keyspaceMisses: null,
                hitRate: null
            },
            persistence: {
                rdbChangesSinceLastSave: null,
                rdbLastSaveTime: null,
                rdbLastBgsaveStatus: null,
                aofEnabled: null,
                aofLastBgrewriteStatus: null
            },
            replication: {
                role: null,
                connectedSlaves: null,
                masterHost: null,
                masterPort: null,
                masterLinkStatus: null
            },
            keyspace: [],
            keyPrefixes: this.createEmptyRedisKeyPrefixOverview(),
            commandStats: []
        };
    }

    private parseInfo(infoText: string): RedisInfo {
        const info: RedisInfo = {};
        for (const line of infoText.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) {
                continue;
            }
            const separatorIndex = line.indexOf(':');
            if (separatorIndex <= 0) {
                continue;
            }
            info[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1).trim();
        }
        return info;
    }

    private parseKeyspace(info: RedisInfo) {
        return Object.entries(info)
            .filter(([key]) => /^db\d+$/.test(key))
            .map(([db, value]) => {
                const parts = this.parseCommaStats(value);
                return {
                    db,
                    keys: Number(parts.keys ?? 0),
                    expires: Number(parts.expires ?? 0),
                    avgTtl: parts.avg_ttl === undefined ? null : Number(parts.avg_ttl)
                };
            })
            .sort((left, right) => left.db.localeCompare(right.db, undefined, { numeric: true }));
    }

    private parseCommandStats(info: RedisInfo) {
        return Object.entries(info)
            .filter(([key]) => key.startsWith('cmdstat_'))
            .map(([key, value]) => {
                const parts = this.parseCommaStats(value);
                return {
                    command: key.replace('cmdstat_', ''),
                    calls: Number(parts.calls ?? 0),
                    usec: Number(parts.usec ?? 0),
                    usecPerCall: Number(parts.usec_per_call ?? 0)
                };
            })
            .sort((left, right) => right.calls - left.calls)
            .slice(0, 20);
    }

    private async collectRedisKeyPrefixOverview(
        totalKeyCount: number | null
    ): Promise<RedisMonitorOverviewType['keyPrefixes']> {
        if (!this.redis) {
            return this.createEmptyRedisKeyPrefixOverview(totalKeyCount);
        }

        const buckets = new Map<string, RedisKeyPrefixBucket>();
        let cursor = '0';
        let scannedKeyCount = 0;
        let isTruncated = false;

        do {
            const scanResult = this.parseScanResponse(
                await this.sendRedisCommand(['SCAN', cursor, 'COUNT', String(REDIS_KEY_PREFIX_SCAN_COUNT)])
            );
            cursor = scanResult.cursor;

            for (const key of scanResult.keys) {
                if (scannedKeyCount >= REDIS_KEY_PREFIX_SCAN_LIMIT) {
                    isTruncated = true;
                    break;
                }
                scannedKeyCount += 1;
                const prefixMeta = this.resolveRedisKeyPrefixMeta(key);
                const prefix = prefixMeta.prefix;
                const bucket = buckets.get(prefix) ?? {
                    prefix,
                    module: prefixMeta.module,
                    keyCount: 0,
                    sampleKeys: []
                };
                bucket.keyCount += 1;
                if (bucket.sampleKeys.length < REDIS_KEY_PREFIX_SAMPLE_LIMIT) {
                    bucket.sampleKeys.push(this.compactRedisKey(key));
                }
                buckets.set(prefix, bucket);
            }

            if (isTruncated) {
                break;
            }
        } while (cursor !== '0');

        const denominator = Math.max(scannedKeyCount, 1);
        return {
            totalKeyCount,
            scannedKeyCount,
            maxScanCount: REDIS_KEY_PREFIX_SCAN_LIMIT,
            isTruncated: isTruncated || cursor !== '0',
            records: [...buckets.values()]
                .map((bucket) => ({
                    ...bucket,
                    ratio: bucket.keyCount / denominator
                }))
                .sort((left, right) => right.keyCount - left.keyCount || left.prefix.localeCompare(right.prefix))
        };
    }

    private createEmptyRedisKeyPrefixOverview(
        totalKeyCount: number | null = null
    ): RedisMonitorOverviewType['keyPrefixes'] {
        return {
            totalKeyCount,
            scannedKeyCount: 0,
            maxScanCount: REDIS_KEY_PREFIX_SCAN_LIMIT,
            isTruncated: false,
            records: []
        };
    }

    private parseScanResponse(value: unknown): { cursor: string; keys: string[] } {
        if (!Array.isArray(value) || value.length < 2 || !Array.isArray(value[1])) {
            return {
                cursor: '0',
                keys: []
            };
        }

        return {
            cursor: String(value[0]),
            keys: value[1].map((key) => String(key))
        };
    }

    private resolveRedisKeyPrefixMeta(key: string): { prefix: string; module: string } {
        const knownDefinition = resolveKnownRedisKeyPrefixDefinition(key);
        if (knownDefinition) {
            return knownDefinition;
        }

        return {
            prefix: this.resolveFallbackRedisKeyPrefix(key),
            module: '未识别模块'
        };
    }

    private resolveFallbackRedisKeyPrefix(key: string): string {
        const parts = key.split(':').filter(Boolean);
        if (parts.length === 0) {
            return '(empty)';
        }

        if (parts[0] === BETTER_AUTH_SECONDARY_STORAGE_REDIS_KEY_PREFIX) {
            return parts[0];
        }

        if (parts[0] === 'rbac' && parts.length >= 3) {
            return parts.slice(0, 3).join(':');
        }

        if (parts[0] === 'bull' && parts.length >= 2) {
            return parts.slice(0, 2).join(':');
        }

        if ((parts[0] === 'admin' || parts[0] === 'app-api') && parts.length >= 2) {
            if (parts[1] === 'account' && parts.length >= 3) {
                return parts.slice(0, 3).join(':');
            }
            if (parts[1] === 'authz-projection') {
                return parts.slice(0, 2).join(':');
            }
        }

        if (
            (parts[0] === ADMIN_API_CACHE_MANAGER_REDIS_NAMESPACE ||
                parts[0] === APP_API_CACHE_MANAGER_REDIS_NAMESPACE) &&
            parts.length >= 2
        ) {
            return parts.slice(0, 2).join(':');
        }

        if (parts[0] === 'admin-api' && parts[1] === 'permify') {
            return parts.slice(0, 2).join(':');
        }

        return parts.slice(0, Math.min(parts.length, 2)).join(':');
    }

    private compactRedisKey(key: string): string {
        if (key.length <= 96) {
            return key;
        }
        return `${key.slice(0, 56)}...${key.slice(-24)}`;
    }

    private parseCommaStats(value: string) {
        return Object.fromEntries(
            value
                .split(',')
                .map((part) => part.split('='))
                .filter((part): part is [string, string] => part.length === 2 && Boolean(part[0]))
        );
    }

    private calculateHitRate(info: RedisInfo): number | null {
        const hits = this.readNumber(info, 'keyspace_hits');
        const misses = this.readNumber(info, 'keyspace_misses');
        if (hits === null || misses === null || hits + misses <= 0) {
            return null;
        }
        return hits / (hits + misses);
    }

    private readString(info: RedisInfo, key: string): string | null {
        return info[key] || null;
    }

    private readNumber(info: RedisInfo, key: string): number | null {
        const value = Number(info[key]);
        return Number.isFinite(value) ? value : null;
    }

    private readBoolean(info: RedisInfo, key: string): boolean | null {
        const value = this.readNumber(info, key);
        return value === null ? null : value === 1;
    }

    private formatUnixSeconds(value: number | null): string | null {
        if (!value) {
            return null;
        }
        return new Date(value * 1000).toISOString();
    }

    private formatError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
