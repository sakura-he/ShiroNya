import { request, type HttpResponse } from "./index";

type MonitorSaleType = 1 | 2 | 3;

interface MonitorSaleData {
    chartData: Array<{
        date: string;
        value: number;
    }>;
}

const monitorSaleData: Record<MonitorSaleType, MonitorSaleData> = {
    1: {
        chartData: [
            { date: "08:59", value: 8 },
            { date: "09:59", value: 14 },
            { date: "10:59", value: 11 },
            { date: "11:59", value: 19 },
            { date: "12:59", value: 16 },
            { date: "13:59", value: 22 },
            { date: "14:59", value: 18 },
            { date: "15:59", value: 26 },
            { date: "16:59", value: 21 },
            { date: "17:59", value: 24 },
        ],
    },
    2: {
        chartData: [
            { date: "05-10", value: 128 },
            { date: "05-11", value: 176 },
            { date: "05-12", value: 149 },
            { date: "05-13", value: 213 },
            { date: "05-14", value: 238 },
            { date: "05-15", value: 196 },
            { date: "05-16", value: 252 },
        ],
    },
    3: {
        chartData: [
            { date: "05-01", value: 62 },
            { date: "05-02", value: 88 },
            { date: "05-03", value: 74 },
            { date: "05-04", value: 109 },
            { date: "05-05", value: 138 },
            { date: "05-06", value: 126 },
            { date: "05-07", value: 151 },
            { date: "05-08", value: 164 },
            { date: "05-09", value: 147 },
            { date: "05-10", value: 182 },
            { date: "05-11", value: 176 },
            { date: "05-12", value: 203 },
            { date: "05-13", value: 221 },
            { date: "05-14", value: 238 },
            { date: "05-15", value: 196 },
            { date: "05-16", value: 252 },
        ],
    },
};

function localResponse<T>(data: T): Promise<HttpResponse<T>> {
    return Promise.resolve({
        status: 200,
        msg: "success",
        code: 200,
        data,
    });
}

export function getMonitorSale(type: number) {
    const saleType = type === 2 || type === 3 ? type : 1;
    return localResponse(monitorSaleData[saleType]);
}

export type MonitorHealthStatus = "online" | "degraded" | "offline" | "disabled";

export interface MonitorServiceHealth {
    key: string;
    name: string;
    status: MonitorHealthStatus;
    latencyMs: number | null;
    message: string | null;
    checkedAt: string;
}

export interface SystemRuntimeStatus {
    checkedAt: string;
    status: MonitorHealthStatus;
    services: MonitorServiceHealth[];
}

export interface RedisKeyspace {
    db: string;
    keys: number;
    expires: number;
    avgTtl: number | null;
}

export interface RedisCommandStat {
    command: string;
    calls: number;
    usec: number;
    usecPerCall: number;
}

export interface RedisKeyPrefixRecord {
    prefix: string;
    module: string;
    keyCount: number;
    ratio: number;
    sampleKeys: string[];
}

export interface RedisKeyPrefixOverview {
    totalKeyCount: number | null;
    scannedKeyCount: number;
    maxScanCount: number;
    isTruncated: boolean;
    records: RedisKeyPrefixRecord[];
}

export interface RedisMonitorOverview {
    checkedAt: string;
    status: MonitorHealthStatus;
    latencyMs: number | null;
    dbSize: number | null;
    error: string | null;
    server: {
        redisVersion: string | null;
        redisMode: string | null;
        os: string | null;
        archBits: number | null;
        tcpPort: number | null;
        uptimeSeconds: number | null;
        uptimeDays: number | null;
    };
    clients: {
        connectedClients: number | null;
        blockedClients: number | null;
        trackingClients: number | null;
        maxClients: number | null;
    };
    memory: {
        usedMemory: number | null;
        usedMemoryHuman: string | null;
        usedMemoryPeak: number | null;
        usedMemoryPeakHuman: string | null;
        maxMemory: number | null;
        maxMemoryHuman: string | null;
        maxMemoryPolicy: string | null;
        memFragmentationRatio: number | null;
    };
    stats: {
        totalConnectionsReceived: number | null;
        totalCommandsProcessed: number | null;
        instantaneousOpsPerSec: number | null;
        totalNetInputBytes: number | null;
        totalNetOutputBytes: number | null;
        rejectedConnections: number | null;
        expiredKeys: number | null;
        evictedKeys: number | null;
        keyspaceHits: number | null;
        keyspaceMisses: number | null;
        hitRate: number | null;
    };
    persistence: {
        rdbChangesSinceLastSave: number | null;
        rdbLastSaveTime: string | null;
        rdbLastBgsaveStatus: string | null;
        aofEnabled: boolean | null;
        aofLastBgrewriteStatus: string | null;
    };
    replication: {
        role: string | null;
        connectedSlaves: number | null;
        masterHost: string | null;
        masterPort: number | null;
        masterLinkStatus: string | null;
    };
    keyspace: RedisKeyspace[];
    keyPrefixes: RedisKeyPrefixOverview;
    commandStats: RedisCommandStat[];
}

export function getSystemRuntimeStatus() {
    return request.get<SystemRuntimeStatus>("/system/monitor/status");
}

export function getRedisMonitorOverview() {
    return request.get<RedisMonitorOverview>("/system/monitor/redis");
}
