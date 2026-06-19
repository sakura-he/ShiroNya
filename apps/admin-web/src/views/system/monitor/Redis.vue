<template>
    <GiPageLayout class="redis-monitor-page">
        <a-page-header :show-back="false">
            <template #title>Redis 监控</template>
            <template #subtitle>{{ formatDateTime(redisOverview?.checkedAt) }}</template>
            <template #extra>
                <a-button
                    type="primary"
                    :loading="loading"
                    @click="loadRedisOverview"
                >
                    <template #icon>
                        <icon-refresh />
                    </template>
                    刷新
                </a-button>
            </template>
        </a-page-header>

        <a-spin
            :loading="loading"
            class="redis-monitor-spin"
        >
            <a-empty
                v-if="!redisOverview"
                description="暂无 Redis 状态"
            />
            <a-space
                v-else
                direction="vertical"
                fill
                size="large"
            >
                <div class="redis-metric-grid">
                    <a-card :bordered="true">
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <span class="metric-title">连接状态</span>
                            <a-tag :color="getStatusColor(redisOverview.status)">
                                {{ formatStatus(redisOverview.status) }}
                            </a-tag>
                        </a-space>
                    </a-card>
                    <a-card
                        v-for="metric in redisMetrics"
                        :key="metric.title"
                        :bordered="true"
                    >
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <span class="metric-title">{{ metric.title }}</span>
                            <div
                                class="metric-value"
                                :style="statisticTextStyle"
                            >
                                {{ metric.value }}
                            </div>
                        </a-space>
                    </a-card>
                </div>

                <a-alert
                    v-if="redisOverview.error"
                    type="error"
                    :content="redisOverview.error"
                />

                <a-card
                    title="实例信息"
                    :bordered="true"
                >
                    <a-descriptions :column="{ xs: 1, md: 2, lg: 4 }">
                        <a-descriptions-item label="Redis">
                            {{ redisOverview.server.redisVersion ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Mode">
                            {{ redisOverview.server.redisMode ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Role">
                            {{ redisOverview.replication.role ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Port">
                            {{ redisOverview.server.tcpPort ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="运行时间">
                            {{ formatDuration(redisOverview.server.uptimeSeconds) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="延迟">
                            {{ formatLatency(redisOverview.latencyMs) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="OS">
                            {{ redisOverview.server.os ?? "-" }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Arch">
                            {{
                                redisOverview.server.archBits
                                    ? `${redisOverview.server.archBits} bit`
                                    : "-"
                            }}
                        </a-descriptions-item>
                    </a-descriptions>
                </a-card>

                <div class="redis-panel-grid">
                    <a-card
                        title="内存"
                        :bordered="true"
                    >
                        <a-descriptions :column="1">
                            <a-descriptions-item label="当前使用">
                                {{
                                    redisOverview.memory.usedMemoryHuman ??
                                    formatBytes(redisOverview.memory.usedMemory)
                                }}
                            </a-descriptions-item>
                            <a-descriptions-item label="峰值">
                                {{
                                    redisOverview.memory.usedMemoryPeakHuman ??
                                    formatBytes(redisOverview.memory.usedMemoryPeak)
                                }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Max Memory">
                                {{
                                    redisOverview.memory.maxMemoryHuman ??
                                    formatBytes(redisOverview.memory.maxMemory)
                                }}
                            </a-descriptions-item>
                            <a-descriptions-item label="淘汰策略">
                                {{ redisOverview.memory.maxMemoryPolicy ?? "-" }}
                            </a-descriptions-item>
                            <a-descriptions-item label="碎片率">
                                {{ formatRatio(redisOverview.memory.memFragmentationRatio) }}
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-card>

                    <a-card
                        title="流量与命中"
                        :bordered="true"
                    >
                        <a-descriptions :column="1">
                            <a-descriptions-item label="输入">
                                {{ formatBytes(redisOverview.stats.totalNetInputBytes) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="输出">
                                {{ formatBytes(redisOverview.stats.totalNetOutputBytes) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="总命令">
                                {{ formatNumber(redisOverview.stats.totalCommandsProcessed) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Hits / Misses">
                                {{ formatNumber(redisOverview.stats.keyspaceHits) }} /
                                {{ formatNumber(redisOverview.stats.keyspaceMisses) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="过期 / 淘汰">
                                {{ formatNumber(redisOverview.stats.expiredKeys) }} /
                                {{ formatNumber(redisOverview.stats.evictedKeys) }}
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-card>

                    <a-card
                        title="客户端"
                        :bordered="true"
                    >
                        <a-descriptions :column="1">
                            <a-descriptions-item label="Connected">
                                {{ formatNumber(redisOverview.clients.connectedClients) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Blocked">
                                {{ formatNumber(redisOverview.clients.blockedClients) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Tracking">
                                {{ formatNumber(redisOverview.clients.trackingClients) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Max Clients">
                                {{ formatNumber(redisOverview.clients.maxClients) }}
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-card>

                    <a-card
                        title="持久化"
                        :bordered="true"
                    >
                        <a-descriptions :column="1">
                            <a-descriptions-item label="RDB 状态">
                                {{ redisOverview.persistence.rdbLastBgsaveStatus ?? "-" }}
                            </a-descriptions-item>
                            <a-descriptions-item label="RDB 变更">
                                {{
                                    formatNumber(redisOverview.persistence.rdbChangesSinceLastSave)
                                }}
                            </a-descriptions-item>
                            <a-descriptions-item label="最近保存">
                                {{ formatDateTime(redisOverview.persistence.rdbLastSaveTime) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="AOF">
                                {{ formatBoolean(redisOverview.persistence.aofEnabled) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="AOF rewrite">
                                {{ redisOverview.persistence.aofLastBgrewriteStatus ?? "-" }}
                            </a-descriptions-item>
                        </a-descriptions>
                    </a-card>
                </div>

                <a-card
                    title="缓存前缀分布"
                    :bordered="true"
                >
                    <a-space
                        direction="vertical"
                        fill
                    >
                        <a-alert
                            v-if="redisOverview.keyPrefixes.isTruncated"
                            type="warning"
                            :content="`已扫描 ${formatNumber(redisOverview.keyPrefixes.scannedKeyCount)} / ${formatNumber(redisOverview.keyPrefixes.totalKeyCount)} 个 key，统计结果为前 ${formatNumber(redisOverview.keyPrefixes.maxScanCount)} 个 key 的样本。`"
                        />
                        <GiTable
                            row-key="prefix"
                            header-title="Prefix Stats"
                            :columns="keyPrefixColumns"
                            :data="redisOverview.keyPrefixes.records"
                            :pagination="{ pageSize: 10 }"
                            :search="false"
                            :options="tableOptions"
                            :scroll="{ x: '100%', minWidth: 980 }"
                            :bordered="true"
                        >
                            <template #ratio="{ record }">
                                {{ formatPercent(record.ratio) }}
                            </template>
                            <template #sampleKeys="{ record }">
                                <div class="sample-key-list">
                                    <a-tooltip
                                        v-for="key in record.sampleKeys"
                                        :key="key"
                                        :content="key"
                                    >
                                        <span class="sample-key">{{ key }}</span>
                                    </a-tooltip>
                                </div>
                            </template>
                        </GiTable>
                    </a-space>
                </a-card>

                <a-card
                    title="Keyspace"
                    :bordered="true"
                >
                    <GiTable
                        row-key="db"
                        header-title="Keyspace"
                        :columns="keyspaceColumns"
                        :data="redisOverview.keyspace"
                        :pagination="false"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', minWidth: 720 }"
                        :bordered="true"
                    >
                        <template #avgTtl="{ record }">
                            {{ formatMilliseconds(record.avgTtl) }}
                        </template>
                    </GiTable>
                </a-card>

                <a-card
                    title="命令统计"
                    :bordered="true"
                >
                    <GiTable
                        row-key="command"
                        header-title="Command Stats"
                        :columns="commandColumns"
                        :data="redisOverview.commandStats"
                        :pagination="{ pageSize: 10 }"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', minWidth: 840 }"
                        :bordered="true"
                    >
                        <template #usec="{ record }">
                            {{ `${record.usec.toLocaleString()}us` }}
                        </template>
                        <template #usecPerCall="{ record }">
                            {{ `${record.usecPerCall.toFixed(2)}us` }}
                        </template>
                    </GiTable>
                </a-card>
            </a-space>
        </a-spin>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getRedisMonitorOverview,
        type MonitorHealthStatus,
        type RedisMonitorOverview,
    } from "@/api/monitor";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, onMounted, ref } from "vue";

    defineOptions({
        name: "RedisMonitor",
    });

    const redisOverview = ref<RedisMonitorOverview | null>(null);
    const loading = ref(false);
    const statisticTextStyle = {
        fontSize: "24px",
        lineHeight: "32px",
        whiteSpace: "nowrap",
    };
    const tableOptions = {
        reload: false,
        density: true,
        setting: true,
    };
    const redisMetrics = computed(() => {
        const overview = redisOverview.value;
        if (!overview) {
            return [];
        }

        return [
            { title: "Used Memory", value: formatBytes(overview.memory.usedMemory) },
            { title: "Keys", value: formatNumber(overview.dbSize) },
            { title: "OPS", value: formatNumber(overview.stats.instantaneousOpsPerSec) },
            { title: "Hit Rate", value: formatPercent(overview.stats.hitRate) },
            { title: "Clients", value: formatNumber(overview.clients.connectedClients) },
        ];
    });

    const keyspaceColumns: ProColumns[] = [
        { dataIndex: "db", title: "DB", width: 120 },
        { dataIndex: "keys", title: "Keys", width: 180, align: "right" },
        { dataIndex: "expires", title: "Expires", width: 180, align: "right" },
        { dataIndex: "avgTtl", slotName: "avgTtl", title: "Avg TTL", width: 180, align: "right" },
    ];

    const keyPrefixColumns: ProColumns[] = [
        { dataIndex: "module", title: "模块", width: 180 },
        { dataIndex: "prefix", title: "Prefix", width: 260 },
        { dataIndex: "keyCount", title: "Keys", width: 140, align: "right" },
        { dataIndex: "ratio", slotName: "ratio", title: "占比", width: 120, align: "right" },
        { dataIndex: "sampleKeys", slotName: "sampleKeys", title: "样例 Key", width: 360 },
    ];

    const commandColumns: ProColumns[] = [
        { dataIndex: "command", title: "Command", width: 180 },
        { dataIndex: "calls", title: "Calls", width: 180, align: "right" },
        { dataIndex: "usec", slotName: "usec", title: "Usec", width: 180, align: "right" },
        {
            dataIndex: "usecPerCall",
            slotName: "usecPerCall",
            title: "Usec / Call",
            width: 180,
            align: "right",
        },
    ];

    async function loadRedisOverview() {
        loading.value = true;
        try {
            const response = await getRedisMonitorOverview();
            redisOverview.value = response.data;
        } catch {
            Message.error("Redis 监控数据加载失败");
        } finally {
            loading.value = false;
        }
    }

    function getStatusColor(status?: MonitorHealthStatus) {
        if (status === "online") return "green";
        if (status === "degraded") return "orange";
        return "red";
    }

    function formatStatus(status?: MonitorHealthStatus) {
        if (status === "online") return "在线";
        if (status === "degraded") return "降级";
        if (status === "offline") return "离线";
        return "-";
    }

    function formatBytes(value?: number | null) {
        if (value === null || value === undefined) return "-";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let size = value;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function formatNumber(value?: number | null) {
        return value === null || value === undefined ? "-" : value.toLocaleString();
    }

    function formatPercent(value?: number | null) {
        return value === null || value === undefined ? "-" : `${(value * 100).toFixed(1)}%`;
    }

    function formatRatio(value?: number | null) {
        return value === null || value === undefined ? "-" : value.toFixed(2);
    }

    function formatLatency(value?: number | null) {
        return value === null || value === undefined ? "-" : `${value}ms`;
    }

    function formatDuration(seconds?: number | null) {
        if (seconds === null || seconds === undefined) return "-";
        const totalSeconds = Math.floor(seconds);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        if (days > 0) return `${days}天 ${hours}小时`;
        if (hours > 0) return `${hours}小时 ${minutes}分钟`;
        if (minutes > 0) return `${minutes}分钟`;
        return `${totalSeconds}秒`;
    }

    function formatMilliseconds(value?: number | null) {
        if (value === null || value === undefined) return "-";
        if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
        return `${value}ms`;
    }

    function formatDateTime(value?: string | null) {
        return value ? new Date(value).toLocaleString() : "-";
    }

    function formatBoolean(value?: boolean | null) {
        if (value === true) return "开启";
        if (value === false) return "关闭";
        return "-";
    }

    onMounted(() => {
        void loadRedisOverview();
    });
</script>

<style scoped lang="scss">
    .redis-monitor-spin {
        width: 100%;
        min-width: 0;
    }

    .redis-monitor-spin :deep(.arco-spin-children) {
        width: 100%;
        min-width: 0;
    }

    .redis-metric-grid {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 16px;
    }

    .redis-panel-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
    }

    .metric-title {
        color: var(--color-text-2);
        font-size: 13px;
        line-height: 20px;
    }

    .metric-value {
        color: var(--color-text-1);
        font-weight: 600;
    }

    .sample-key-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
    }

    .sample-key {
        display: inline-block;
        max-width: 320px;
        overflow: hidden;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--color-fill-2);
        color: var(--color-text-2);
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
        line-height: 18px;
        text-overflow: ellipsis;
        vertical-align: middle;
        white-space: nowrap;
    }

    @media (max-width: 1320px) {
        .redis-metric-grid,
        .redis-panel-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 720px) {
        .redis-metric-grid,
        .redis-panel-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
