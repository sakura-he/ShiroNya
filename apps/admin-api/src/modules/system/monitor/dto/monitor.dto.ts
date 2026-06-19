import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SystemMonitorHealthStatusSchema = z.enum(['online', 'degraded', 'offline', 'disabled']);
export type SystemMonitorHealthStatus = z.infer<typeof SystemMonitorHealthStatusSchema>;

export const SystemMonitorServiceHealthSchema = z.object({
    status: SystemMonitorHealthStatusSchema,
    latencyMs: z.number().nonnegative().nullable(),
    message: z.string().nullable(),
    checkedAt: z.string()
});
export class SystemMonitorServiceHealthDto extends createZodDto(SystemMonitorServiceHealthSchema) {}

export const SystemMonitorServiceHealthRecordSchema = SystemMonitorServiceHealthSchema.extend({
    key: z.string(),
    name: z.string()
});
export class SystemMonitorServiceHealthRecordDto extends createZodDto(SystemMonitorServiceHealthRecordSchema) {}

export const SystemMonitorRuntimeStatusSchema = z.object({
    checkedAt: z.string(),
    status: SystemMonitorHealthStatusSchema,
    services: z.array(SystemMonitorServiceHealthRecordSchema)
});
export class SystemMonitorRuntimeStatusDto extends createZodDto(SystemMonitorRuntimeStatusSchema) {}
export type SystemMonitorRuntimeStatusType = z.infer<typeof SystemMonitorRuntimeStatusSchema>;

export const RedisKeyspaceSchema = z.object({
    db: z.string(),
    keys: z.number().int().nonnegative(),
    expires: z.number().int().nonnegative(),
    avgTtl: z.number().int().nullable()
});
export class RedisKeyspaceDto extends createZodDto(RedisKeyspaceSchema) {}

export const RedisCommandStatSchema = z.object({
    command: z.string(),
    calls: z.number().int().nonnegative(),
    usec: z.number().nonnegative(),
    usecPerCall: z.number().nonnegative()
});
export class RedisCommandStatDto extends createZodDto(RedisCommandStatSchema) {}

export const RedisKeyPrefixRecordSchema = z.object({
    prefix: z.string(),
    module: z.string(),
    keyCount: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1),
    sampleKeys: z.array(z.string())
});
export class RedisKeyPrefixRecordDto extends createZodDto(RedisKeyPrefixRecordSchema) {}

export const RedisKeyPrefixOverviewSchema = z.object({
    totalKeyCount: z.number().int().nonnegative().nullable(),
    scannedKeyCount: z.number().int().nonnegative(),
    maxScanCount: z.number().int().positive(),
    isTruncated: z.boolean(),
    records: z.array(RedisKeyPrefixRecordSchema)
});
export class RedisKeyPrefixOverviewDto extends createZodDto(RedisKeyPrefixOverviewSchema) {}

export const RedisMonitorOverviewSchema = z.object({
    checkedAt: z.string(),
    status: SystemMonitorHealthStatusSchema,
    latencyMs: z.number().nonnegative().nullable(),
    dbSize: z.number().int().nonnegative().nullable(),
    error: z.string().nullable(),
    server: z.object({
        redisVersion: z.string().nullable(),
        redisMode: z.string().nullable(),
        os: z.string().nullable(),
        archBits: z.number().int().nullable(),
        tcpPort: z.number().int().nullable(),
        uptimeSeconds: z.number().int().nullable(),
        uptimeDays: z.number().int().nullable()
    }),
    clients: z.object({
        connectedClients: z.number().int().nullable(),
        blockedClients: z.number().int().nullable(),
        trackingClients: z.number().int().nullable(),
        maxClients: z.number().int().nullable()
    }),
    memory: z.object({
        usedMemory: z.number().int().nullable(),
        usedMemoryHuman: z.string().nullable(),
        usedMemoryPeak: z.number().int().nullable(),
        usedMemoryPeakHuman: z.string().nullable(),
        maxMemory: z.number().int().nullable(),
        maxMemoryHuman: z.string().nullable(),
        maxMemoryPolicy: z.string().nullable(),
        memFragmentationRatio: z.number().nullable()
    }),
    stats: z.object({
        totalConnectionsReceived: z.number().int().nullable(),
        totalCommandsProcessed: z.number().int().nullable(),
        instantaneousOpsPerSec: z.number().int().nullable(),
        totalNetInputBytes: z.number().int().nullable(),
        totalNetOutputBytes: z.number().int().nullable(),
        rejectedConnections: z.number().int().nullable(),
        expiredKeys: z.number().int().nullable(),
        evictedKeys: z.number().int().nullable(),
        keyspaceHits: z.number().int().nullable(),
        keyspaceMisses: z.number().int().nullable(),
        hitRate: z.number().min(0).max(1).nullable()
    }),
    persistence: z.object({
        rdbChangesSinceLastSave: z.number().int().nullable(),
        rdbLastSaveTime: z.string().nullable(),
        rdbLastBgsaveStatus: z.string().nullable(),
        aofEnabled: z.boolean().nullable(),
        aofLastBgrewriteStatus: z.string().nullable()
    }),
    replication: z.object({
        role: z.string().nullable(),
        connectedSlaves: z.number().int().nullable(),
        masterHost: z.string().nullable(),
        masterPort: z.number().int().nullable(),
        masterLinkStatus: z.string().nullable()
    }),
    keyspace: z.array(RedisKeyspaceSchema),
    keyPrefixes: RedisKeyPrefixOverviewSchema,
    commandStats: z.array(RedisCommandStatSchema)
});
export class RedisMonitorOverviewDto extends createZodDto(RedisMonitorOverviewSchema) {}
export type RedisMonitorOverviewType = z.infer<typeof RedisMonitorOverviewSchema>;
