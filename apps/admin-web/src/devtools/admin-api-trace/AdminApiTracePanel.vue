<template>
    <section
        ref="panelRef"
        class="api-trace-panel"
    >
        <aside
            ref="listRef"
            class="api-trace-panel__list"
        >
            <header class="api-trace-panel__brand">
                <div>
                    <strong>Admin API</strong>
                    <span>Debug</span>
                </div>
                <a-radio-group
                    v-model="activeTab"
                    type="button"
                    size="small"
                >
                    <a-radio value="requests">Requests请求</a-radio>
                    <a-radio value="spicedb">SpiceDB RPC</a-radio>
                </a-radio-group>
            </header>

            <a-space style="padding: 12px 16px; border-bottom: 1px solid var(--color-border-2)">
                <a-tag color="green">Success {{ counts.success }}</a-tag>
                <a-tag color="blue">Pending {{ counts.pending }}</a-tag>
                <a-tag color="red">Error {{ counts.error }}</a-tag>
                <a-tag color="orangered">SpiceDB {{ counts.spicedb }}</a-tag>
            </a-space>

            <div
                ref="toolbarRef"
                class="api-trace-panel__toolbar"
            >
                <a-input-search
                    v-model="keyword"
                    placeholder="Filter 筛选"
                    allow-clear
                    size="small"
                    class="api-trace-panel__filter-input"
                />
                <a-select
                    v-if="activeTab === 'requests'"
                    v-model="sortMode"
                    size="small"
                    :style="{ width: '140px' }"
                    :popup-container="popupContainer"
                    :trigger-props="{ autoFitPopupWidth: false, autoFitPopupMinWidth: true }"
                >
                    <a-option value="latest">Latest 最新</a-option>
                    <a-option value="slowest">Slowest 最慢</a-option>
                    <a-option value="spicedb">SpiceDB RPC</a-option>
                    <a-option value="status">Status 状态</a-option>
                </a-select>
                <a-select
                    v-else
                    v-model="rpcSortMode"
                    size="small"
                    :style="{ width: '140px' }"
                    :popup-container="popupContainer"
                    :trigger-props="{ autoFitPopupWidth: false, autoFitPopupMinWidth: true }"
                >
                    <a-option value="latest">Latest 最新</a-option>
                    <a-option value="slowest">Slowest 最慢</a-option>
                    <a-option value="operation">Operation 操作</a-option>
                </a-select>
                <a-button
                    size="small"
                    title="Clear 清除"
                    @click="clearApiTraceRecords"
                >
                    <template #icon>
                        <icon-delete />
                    </template>
                </a-button>
            </div>

            <!-- Requests tab: HTTP 请求列表 -->
            <GiTable
                v-if="activeTab === 'requests'"
                :data="visibleRecords"
                :columns="requestListColumns"
                :pagination="false"
                :bordered="false"
                size="small"
                row-key="id"
                :search="false"
                :options="traceTableOptions"
                :row-class="
                    (record: any) =>
                        `api-trace-panel__row--${record.status}` +
                        (activeRecord?.id === record.id ? ' api-trace-panel__row--active' : '')
                "
                @row-click="(record: any) => selectApiTraceRecord(record.id)"
            >
                <template #method="{ record }">
                    <a-tag
                        :color="
                            record.status === 'success'
                                ? 'green'
                                : record.status === 'error'
                                  ? 'red'
                                  : 'blue'
                        "
                        size="small"
                    >
                        {{ record.method }}
                    </a-tag>
                </template>
                <template #url="{ record }">
                    <span style="font-size: 13px">{{ record.url }}</span>
                </template>
                <template #clientDurationMs="{ record }">
                    <span style="font-size: 13px">{{ formatMs(record.clientDurationMs) }}</span>
                </template>
            </GiTable>

            <!-- SpiceDB RPC tab: 扁平化 RPC 调用列表 -->
            <template v-if="activeTab === 'spicedb'">
                <GiTable
                    v-if="visibleRpcRecords.length > 0"
                    :data="visibleRpcRecords"
                    :columns="rpcListColumns"
                    :pagination="false"
                    :bordered="false"
                    size="small"
                    row-key="id"
                    :search="false"
                    :options="traceTableOptions"
                    :row-class="
                        (record: any) =>
                            `api-trace-panel__row--${record.status}` +
                            (activeRpcId === record.id ? ' api-trace-panel__row--active' : '')
                    "
                    @row-click="(record: any) => selectRpcRecord(record.id)"
                >
                    <template #method>
                        <a-tag
                            color="orangered"
                            size="small"
                        >
                            RPC
                        </a-tag>
                    </template>
                    <template #operation="{ record: rpc }">
                        <span style="font-size: 13px">
                            {{ rpc.operation
                            }}{{ rpc.count && rpc.count > 1 ? ` ×${rpc.count}` : "" }}
                        </span>
                    </template>
                    <template #durationMs="{ record: rpc }">
                        <span style="font-size: 13px">{{ formatMs(rpc.durationMs) }}</span>
                    </template>
                </GiTable>
                <a-empty
                    v-else
                    description="No SpiceDB RPC captured 未捕获到 SpiceDB 调用"
                    style="padding: 40px 0"
                />
            </template>
        </aside>

        <main class="api-trace-panel__details">
            <!-- Requests tab 详情 -->
            <template v-if="activeTab === 'requests' && activeRecord">
                <section class="api-trace-panel__section">
                    <div class="api-trace-panel__section-title">Request Details 请求详情</div>
                    <a-space
                        style="padding: 14px 16px; width: 100%; justify-content: space-between"
                    >
                        <code>{{ activeRecord.method }} {{ activeRecord.url }}</code>
                        <a-tag
                            :color="statusTagColor(activeRecord.status)"
                            size="medium"
                        >
                            {{ activeRecord.status }}
                        </a-tag>
                    </a-space>
                    <a-descriptions
                        :column="1"
                        size="small"
                        style="padding: 14px 16px"
                    >
                        <a-descriptions-item label="Client 客户端">
                            {{ formatMs(activeRecord.clientDurationMs) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Server 服务端">
                            {{ formatMs(activeRecord.debug?.http?.serverDurationMs) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="SpiceDB RPC">
                            {{ formatMs(activeRecord.debug?.spicedb?.totalMs) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="RPC 调用数">
                            {{ activeRecord.debug?.spicedb?.count ?? 0 }}
                        </a-descriptions-item>
                    </a-descriptions>
                </section>

                <section class="api-trace-panel__section">
                    <div class="api-trace-panel__section-title">Actions 操作</div>
                    <a-space
                        wrap
                        style="padding: 14px 16px"
                    >
                        <a-button
                            type="primary"
                            size="small"
                            @click="replayActiveRecord"
                        >
                            <template #icon>
                                <icon-refresh />
                            </template>
                            Refetch 重新请求
                        </a-button>
                        <a-button
                            size="small"
                            @click="copyActiveRecord"
                        >
                            <template #icon>
                                <icon-copy />
                            </template>
                            Copy JSON 复制
                        </a-button>
                    </a-space>
                </section>

                <section class="api-trace-panel__section">
                    <div class="api-trace-panel__section-title">SpiceDB RPCs 调用</div>
                    <GiTable
                        v-if="activeRecord.debug?.spicedb?.operations?.length"
                        :data="activeRecord.debug.spicedb.operations"
                        :columns="spicedbOperationColumns"
                        :pagination="false"
                        size="small"
                        :bordered="false"
                        row-key="operation"
                        :search="false"
                        :options="traceTableOptions"
                    >
                        <template #status="{ record: op }">
                            <a-badge :status="op.status === 'success' ? 'success' : 'danger'" />
                        </template>
                        <template #operation="{ record: op }">
                            <code>{{ op.operation }}</code>
                        </template>
                        <template #count="{ record: op }">{{ op.count ?? 1 }} 项</template>
                        <template #durationMs="{ record: op }">
                            <strong>{{ formatMs(op.durationMs) }}</strong>
                        </template>
                    </GiTable>
                    <a-empty
                        v-else
                        description="No SpiceDB RPC captured 未捕获到 SpiceDB 调用"
                    />
                </section>

                <section
                    v-if="hasNativeSpiceDbDebug"
                    class="api-trace-panel__section api-trace-panel__section--data"
                >
                    <div class="api-trace-panel__section-title">
                        Native Check Debug 原生检查调试
                    </div>
                    <div class="api-trace-panel__data-explorer">
                        <VueJsonPretty
                            :data="nativeSpiceDbDebugData"
                            :deep="3"
                            :theme="isDarkMode ? 'dark' : 'light'"
                            show-length
                            show-icon
                            :show-line="true"
                            collapsed-on-click-brackets
                        />
                    </div>
                </section>

                <section class="api-trace-panel__section api-trace-panel__section--data">
                    <div class="api-trace-panel__section-title">Data Explorer 数据浏览</div>
                    <div class="api-trace-panel__data-explorer">
                        <VueJsonPretty
                            :data="toJsonPrettyData(activeRecord.responseData)"
                            :deep="3"
                            :theme="isDarkMode ? 'dark' : 'light'"
                            show-length
                            show-icon
                            :show-line="true"
                            collapsed-on-click-brackets
                        />
                    </div>
                </section>
            </template>

            <!-- SpiceDB RPC tab 详情 -->
            <template v-else-if="activeTab === 'spicedb' && activeRpcRecord">
                <section class="api-trace-panel__section">
                    <div class="api-trace-panel__section-title">RPC Details 调用详情</div>
                    <a-space
                        style="padding: 14px 16px; width: 100%; justify-content: space-between"
                    >
                        <code>{{ activeRpcRecord.operation }}</code>
                        <a-tag
                            :color="activeRpcRecord.status === 'success' ? 'green' : 'red'"
                            size="medium"
                        >
                            {{ activeRpcRecord.status }}
                        </a-tag>
                    </a-space>
                    <a-descriptions
                        :column="1"
                        size="small"
                        style="padding: 14px 16px"
                    >
                        <a-descriptions-item label="Duration 耗时">
                            {{ formatMs(activeRpcRecord.durationMs) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Count 数量">
                            {{ activeRpcRecord.count ?? 1 }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Source 来源">
                            <span style="font-size: 12px">
                                {{ activeRpcRecord.sourceMethod }} {{ activeRpcRecord.sourceUrl }}
                            </span>
                        </a-descriptions-item>
                        <a-descriptions-item
                            v-if="activeRpcRecord.errorCode"
                            label="Error Code"
                        >
                            {{ activeRpcRecord.errorCode }}
                        </a-descriptions-item>
                    </a-descriptions>
                </section>

                <section
                    v-if="activeRpcRecord.nativeDebug"
                    class="api-trace-panel__section api-trace-panel__section--data"
                >
                    <div class="api-trace-panel__section-title">
                        Native Check Debug 原生检查调试
                    </div>
                    <div class="api-trace-panel__data-explorer">
                        <VueJsonPretty
                            :data="toJsonPrettyData(activeRpcRecord.nativeDebug)"
                            :deep="3"
                            :theme="isDarkMode ? 'dark' : 'light'"
                            show-length
                            show-icon
                            :show-line="true"
                            collapsed-on-click-brackets
                        />
                    </div>
                </section>

                <section class="api-trace-panel__section">
                    <div class="api-trace-panel__section-title">Actions 操作</div>
                    <a-space
                        wrap
                        style="padding: 14px 16px"
                    >
                        <a-button
                            size="small"
                            @click="copyRpcRecord"
                        >
                            <template #icon>
                                <icon-copy />
                            </template>
                            Copy JSON 复制
                        </a-button>
                        <a-button
                            size="small"
                            @click="jumpToSourceRequest"
                        >
                            <template #icon>
                                <icon-link />
                            </template>
                            View Request 查看请求
                        </a-button>
                    </a-space>
                </section>
            </template>

            <a-empty
                v-else
                class="api-trace-panel__empty--large"
                :description="
                    activeTab === 'requests'
                        ? 'No requests yet 暂无请求'
                        : 'No SpiceDB RPC captured 未捕获到 SpiceDB 调用'
                "
            />
        </main>
    </section>
</template>

<script setup lang="ts">
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { computed, ref } from "vue";
    import VueJsonPretty from "vue-json-pretty";
    import "vue-json-pretty/lib/styles.css";
    import { request } from "@/api";
    import useColorMode from "@/hooks/useColorMode";
    import {
        apiTraceState,
        clearApiTraceRecords,
        selectApiTraceRecord,
        type ApiTraceRecord,
        type SpiceDbDebugOperation,
    } from "./api-trace-store";

    const { isDarkMode } = useColorMode();

    const keyword = ref("");
    const sortMode = ref<"latest" | "slowest" | "spicedb" | "status">("latest");
    const rpcSortMode = ref<"latest" | "slowest" | "operation">("latest");
    const activeTab = ref<"requests" | "spicedb">("requests");
    const activeRpcId = ref<string | null>(null);
    const panelRef = ref<HTMLElement>();
    const listRef = ref<HTMLElement>();
    const toolbarRef = ref<HTMLElement>();
    const popupContainer = computed(() => toolbarRef.value ?? document.body);

    const traceTableOptions = {
        reload: false,
        density: true,
        setting: false,
        fullScreen: false,
        border: false,
        stripe: false,
    };

    const spicedbOperationColumns: ProColumns[] = [
        { title: "", dataIndex: "status", slotName: "status", width: 40 },
        { title: "Operation", dataIndex: "operation", slotName: "operation" },
        { title: "Count", dataIndex: "count", slotName: "count", width: 80 },
        { title: "Duration", dataIndex: "durationMs", slotName: "durationMs", width: 100 },
    ];

    const requestListColumns: ProColumns[] = [
        { title: "Method", dataIndex: "method", slotName: "method", width: 80 },
        { title: "URL", dataIndex: "url", slotName: "url" },
        {
            title: "Time",
            dataIndex: "clientDurationMs",
            slotName: "clientDurationMs",
            width: 90,
            align: "right",
        },
    ];

    const rpcListColumns: ProColumns[] = [
        { title: "Type", slotName: "method", width: 70 },
        { title: "Operation", dataIndex: "operation", slotName: "operation" },
        {
            title: "Time",
            dataIndex: "durationMs",
            slotName: "durationMs",
            width: 90,
            align: "right",
        },
    ];

    type FlatRpcRecord = SpiceDbDebugOperation & {
        id: string;
        sourceRecordId: string;
        sourceMethod: string;
        sourceUrl: string;
        startedAt: number;
    };

    const counts = computed(() => apiTraceState.counts);
    const activeRecord = computed(() => apiTraceState.activeRecord);
    const nativeSpiceDbDebugData = computed(
        () =>
            activeRecord.value?.debug?.spicedb?.operations
                ?.filter((operation) => operation.nativeDebug !== undefined)
                .map((operation) => ({
                    operation: operation.operation,
                    count: operation.count,
                    durationMs: operation.durationMs,
                    nativeDebug: operation.nativeDebug,
                })) ?? [],
    );
    const hasNativeSpiceDbDebug = computed(() => nativeSpiceDbDebugData.value.length > 0);

    /** 扁平化所有请求中的 SpiceDB RPC 操作 */
    const allRpcRecords = computed<FlatRpcRecord[]>(() => {
        const rpcs: FlatRpcRecord[] = [];
        for (const record of apiTraceState.records) {
            const operations = record.debug?.spicedb?.operations;
            if (!operations?.length) continue;
            for (let i = 0; i < operations.length; i++) {
                const op = operations[i];
                rpcs.push({
                    ...op,
                    id: `${record.id}-rpc-${i}`,
                    sourceRecordId: record.id,
                    sourceMethod: record.method,
                    sourceUrl: record.url,
                    startedAt: record.startedAt,
                });
            }
        }
        return rpcs;
    });

    const visibleRpcRecords = computed(() => {
        const normalizedKeyword = keyword.value.trim().toLowerCase();
        const filtered = allRpcRecords.value.filter((rpc) => {
            if (!normalizedKeyword) return true;
            return `${rpc.operation} ${rpc.sourceUrl} ${rpc.status}`
                .toLowerCase()
                .includes(normalizedKeyword);
        });

        return [...filtered].sort((left, right) => {
            if (rpcSortMode.value === "slowest") {
                return right.durationMs - left.durationMs;
            }
            if (rpcSortMode.value === "operation") {
                return left.operation.localeCompare(right.operation);
            }
            return right.startedAt - left.startedAt;
        });
    });

    const activeRpcRecord = computed(
        () => allRpcRecords.value.find((rpc) => rpc.id === activeRpcId.value) ?? null,
    );

    function selectRpcRecord(id: string) {
        activeRpcId.value = id;
    }

    function jumpToSourceRequest() {
        const rpc = activeRpcRecord.value;
        if (!rpc) return;
        activeTab.value = "requests";
        selectApiTraceRecord(rpc.sourceRecordId);
    }

    async function copyRpcRecord() {
        const rpc = activeRpcRecord.value;
        if (!rpc) return;
        await navigator.clipboard.writeText(JSON.stringify(rpc, null, 2));
    }

    const visibleRecords = computed(() => {
        const normalizedKeyword = keyword.value.trim().toLowerCase();
        const filteredRecords = apiTraceState.records.filter((record) => {
            if (!normalizedKeyword) return true;
            return `${record.method} ${record.url} ${record.status}`
                .toLowerCase()
                .includes(normalizedKeyword);
        });

        return [...filteredRecords].sort((left, right) => {
            if (sortMode.value === "slowest") {
                return (right.clientDurationMs ?? 0) - (left.clientDurationMs ?? 0);
            }
            if (sortMode.value === "spicedb") {
                return (right.debug?.spicedb?.totalMs ?? 0) - (left.debug?.spicedb?.totalMs ?? 0);
            }
            if (sortMode.value === "status") {
                return left.status.localeCompare(right.status);
            }
            return right.startedAt - left.startedAt;
        });
    });

    function statusTagColor(status: string): string {
        switch (status) {
            case "success":
                return "green";
            case "pending":
                return "blue";
            case "error":
                return "red";
            default:
                return "gray";
        }
    }

    async function replayActiveRecord() {
        const record = activeRecord.value;
        if (!record) return;
        await request({
            url: record.replayConfig.url,
            method: record.replayConfig.method,
            params: record.replayConfig.params,
            data: record.replayConfig.data,
        });
    }

    async function copyActiveRecord() {
        const record = activeRecord.value;
        if (!record) return;
        await navigator.clipboard.writeText(JSON.stringify(toCopyPayload(record), null, 2));
    }

    function toCopyPayload(record: ApiTraceRecord) {
        return {
            method: record.method,
            url: record.url,
            status: record.status,
            clientDurationMs: record.clientDurationMs,
            httpStatus: record.httpStatus,
            bizCode: record.bizCode,
            debug: record.debug,
            data: record.responseData,
            error: record.error,
        };
    }

    function toJsonPrettyData(value: unknown) {
        return value as any;
    }

    function formatMs(value?: number): string {
        return typeof value === "number" ? `${value.toFixed(value >= 100 ? 0 : 1)}ms` : "-";
    }
</script>

<style scoped lang="scss">
    .api-trace-panel {
        position: relative;
        display: grid;
        grid-template-columns: minmax(360px, 1fr) minmax(420px, 1fr);
        width: 100%;
        height: 100%;
        overflow: hidden;
        color: var(--color-text-1);
        background: var(--color-bg-1);
        font-family:
            Inter,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
    }

    .api-trace-panel code {
        font-family: var(--font-code);
        font-size: 13px;
    }

    .api-trace-panel__list,
    .api-trace-panel__details {
        min-width: 0;
        min-height: 0;
        overflow: auto;
    }

    .api-trace-panel__list {
        position: relative;
        border-right: 1px solid var(--color-border-2);
    }

    .api-trace-panel__brand {
        display: flex;
        align-items: center;
        gap: 16px;
        min-height: 80px;
        padding: 16px;
        border-bottom: 1px solid var(--color-border-2);
    }

    .api-trace-panel__brand strong {
        display: block;
        font-size: 24px;
        line-height: 1;
        letter-spacing: 0;
    }

    .api-trace-panel__brand span {
        color: rgb(var(--orange-6));
        font-size: 14px;
    }

    .api-trace-panel__toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--color-border-2);
        background: var(--color-bg-2);
        overflow: visible;
    }

    .api-trace-panel__filter-input {
        flex: 1 1 auto;
    }

    :deep(.arco-trigger-popup) {
        z-index: 100 !important;
    }

    .api-trace-panel__list :deep(.arco-table-tr) {
        cursor: pointer;
    }

    .api-trace-panel__row--success td:first-child {
        border-left: 3px solid rgb(var(--green-6));
    }

    .api-trace-panel__row--pending td:first-child {
        border-left: 3px solid rgb(var(--blue-6));
    }

    .api-trace-panel__row--error td:first-child {
        border-left: 3px solid rgb(var(--red-6));
    }

    :deep(.api-trace-panel__row--active) td {
        background-color: var(--color-fill-3) !important;
    }

    .api-trace-panel__section-title {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: 10px 16px;
        background: var(--color-fill-2);
        font-size: 14px;
        font-weight: 600;
    }

    .api-trace-panel__empty--large {
        display: grid;
        height: 100%;
        place-items: center;
    }

    .api-trace-panel__data-explorer {
        padding: 14px 16px;
    }

    @media (max-width: 900px) {
        .api-trace-panel {
            grid-template-columns: 1fr;
        }

        .api-trace-panel__details {
            display: none;
        }
    }
</style>
