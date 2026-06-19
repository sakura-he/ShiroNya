<template>
    <GiPageLayout class="monitor-status-page">
        <a-page-header :show-back="false">
            <template #title>系统运行状态</template>
            <template #subtitle>{{ formatDateTime(runtimeStatus?.checkedAt) }}</template>
            <template #extra>
                <a-button
                    type="primary"
                    :loading="loading"
                    @click="loadStatus"
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
            class="monitor-status-spin"
        >
            <a-empty
                v-if="!runtimeStatus"
                description="暂无运行状态"
            />
            <a-space
                v-else
                direction="vertical"
                fill
                size="large"
            >
                <div class="monitor-metric-grid">
                    <a-card :bordered="true">
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-space>
                                <a-avatar :class="['metric-avatar', getHealthAvatarClass(runtimeStatus.status)]">
                                    <component :is="getStatusIcon(runtimeStatus.status)" />
                                </a-avatar>
                                <span class="metric-title">整体状态</span>
                            </a-space>
                            <a-tag :color="getStatusColor(runtimeStatus.status)">
                                {{ formatStatus(runtimeStatus.status) }}
                            </a-tag>
                        </a-space>
                    </a-card>

                    <a-card :bordered="true">
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-space>
                                <a-avatar class="metric-avatar metric-avatar--process">
                                    <icon-code />
                                </a-avatar>
                                <span class="metric-title">在线服务</span>
                            </a-space>
                            <div
                                class="metric-value"
                                :style="statisticTextStyle"
                            >
                                {{ onlineServiceCount }} / {{ serviceCount }}
                            </div>
                        </a-space>
                    </a-card>

                    <a-card :bordered="true">
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-space>
                                <a-avatar class="metric-avatar metric-avatar--db">
                                    <icon-storage />
                                </a-avatar>
                                <span class="metric-title">平均延迟</span>
                            </a-space>
                            <div
                                class="metric-value"
                                :style="statisticTextStyle"
                            >
                                {{ formatLatency(averageLatency) }}
                            </div>
                        </a-space>
                    </a-card>

                    <a-card :bordered="true">
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-space>
                                <a-avatar class="metric-avatar metric-avatar--redis">
                                    <icon-thunderbolt />
                                </a-avatar>
                                <span class="metric-title">检查时间</span>
                            </a-space>
                            <div
                                class="metric-value"
                                :style="statisticTextStyle"
                            >
                                {{ formatTime(runtimeStatus.checkedAt) }}
                            </div>
                        </a-space>
                    </a-card>
                </div>

                <div class="service-health-grid">
                    <a-card
                        v-for="service in runtimeStatus.services"
                        :key="service.key"
                        :bordered="true"
                    >
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <div class="service-card-header">
                                <a-space>
                                    <a-avatar :class="['metric-avatar', getHealthAvatarClass(service.status)]">
                                        <component :is="getStatusIcon(service.status)" />
                                    </a-avatar>
                                    <span class="service-title">{{ service.name }}</span>
                                </a-space>
                                <a-tag :color="getStatusColor(service.status)">
                                    {{ formatStatus(service.status) }}
                                </a-tag>
                            </div>
                            <a-descriptions :column="1">
                                <a-descriptions-item label="延迟">
                                    {{ formatLatency(service.latencyMs) }}
                                </a-descriptions-item>
                                <a-descriptions-item label="检查时间">
                                    {{ formatDateTime(service.checkedAt) }}
                                </a-descriptions-item>
                                <a-descriptions-item label="信息">
                                    {{ service.message ?? "OK" }}
                                </a-descriptions-item>
                            </a-descriptions>
                        </a-space>
                    </a-card>
                </div>
            </a-space>
        </a-spin>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        getSystemRuntimeStatus,
        type MonitorHealthStatus,
        type SystemRuntimeStatus,
    } from "@/api/monitor";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { Message } from "@arco-design/web-vue";
    import {
        IconCheckCircleFill,
        IconCloseCircleFill,
        IconExclamationCircleFill,
        IconMinusCircleFill,
    } from "@arco-design/web-vue/es/icon";
    import { computed, onMounted, ref } from "vue";

    defineOptions({
        name: "SystemMonitorStatus",
    });

    const runtimeStatus = ref<SystemRuntimeStatus | null>(null);
    const loading = ref(false);
    const statisticTextStyle = {
        fontSize: "24px",
        lineHeight: "32px",
        whiteSpace: "nowrap",
    };
    const serviceCount = computed(
        () => runtimeStatus.value?.services.filter((service) => service.status !== "disabled").length ?? 0
    );
    const onlineServiceCount = computed(
        () => runtimeStatus.value?.services.filter((service) => service.status === "online").length ?? 0
    );
    const averageLatency = computed(() => {
        const services = runtimeStatus.value?.services ?? [];
        const latencies = services
            .map((service) => service.latencyMs)
            .filter((latency): latency is number => latency !== null);
        if (latencies.length === 0) return null;
        return Math.round(latencies.reduce((total, latency) => total + latency, 0) / latencies.length);
    });

    async function loadStatus() {
        loading.value = true;
        try {
            const response = await getSystemRuntimeStatus();
            runtimeStatus.value = response.data;
        } catch {
            Message.error("系统运行状态加载失败");
        } finally {
            loading.value = false;
        }
    }

    function getStatusColor(status?: MonitorHealthStatus) {
        if (status === "online") return "green";
        if (status === "degraded") return "orange";
        if (status === "disabled") return "gray";
        return "red";
    }

    function getHealthAvatarClass(status?: MonitorHealthStatus) {
        if (status === "online") return "health-avatar--online";
        if (status === "degraded") return "health-avatar--degraded";
        if (status === "disabled") return "health-avatar--disabled";
        return "health-avatar--offline";
    }

    function getStatusIcon(status?: MonitorHealthStatus) {
        if (status === "online") return IconCheckCircleFill;
        if (status === "degraded") return IconExclamationCircleFill;
        if (status === "disabled") return IconMinusCircleFill;
        return IconCloseCircleFill;
    }

    function formatStatus(status?: MonitorHealthStatus) {
        if (status === "online") return "在线";
        if (status === "degraded") return "降级";
        if (status === "offline") return "离线";
        if (status === "disabled") return "未启用";
        return "-";
    }

    function formatDateTime(value?: string | null) {
        return value ? new Date(value).toLocaleString() : "-";
    }

    function formatTime(value?: string | null) {
        return value
            ? new Date(value).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
              })
            : "-";
    }

    function formatLatency(value?: number | null) {
        return value === null || value === undefined ? "-" : `${value}ms`;
    }

    onMounted(() => {
        void loadStatus();
    });
</script>

<style scoped lang="scss">
    .monitor-status-spin {
        width: 100%;
        min-width: 0;
    }

    .monitor-status-spin :deep(.arco-spin-children) {
        width: 100%;
        min-width: 0;
    }

    .monitor-metric-grid {
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

    .metric-avatar {
        flex: 0 0 auto;
        color: #fff;
    }

    .service-health-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
    }

    .service-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
    }

    .service-title {
        color: var(--color-text-1);
        font-size: 15px;
        font-weight: 600;
        line-height: 22px;
    }

    .metric-avatar--process {
        background-color: rgb(var(--arcoblue-6));
    }

    .metric-avatar--db {
        background-color: rgb(var(--purple-6));
    }

    .metric-avatar--redis {
        background-color: rgb(var(--orange-6));
    }

    .health-avatar--online {
        background-color: rgb(var(--green-6));
    }

    .health-avatar--degraded {
        background-color: rgb(var(--orange-6));
    }

    .health-avatar--offline {
        background-color: rgb(var(--red-6));
    }

    .health-avatar--disabled {
        background-color: rgb(var(--gray-6));
    }

    @media (max-width: 1100px) {
        .monitor-metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (max-width: 720px) {
        .monitor-metric-grid,
        .service-health-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
