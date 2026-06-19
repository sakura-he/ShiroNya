<template>
    <div class="relationship-flow-graph">
        <a-spin
            class="relationship-flow-graph__spin"
            :loading="loading"
            tip="正在加载 SpiceDB 实体关系图..."
        >
            <a-result
                v-if="errorMessage"
                status="error"
                title="SpiceDB 实体关系图加载失败"
                :subtitle="errorMessage"
            >
                <template #extra>
                    <a-button
                        type="primary"
                        @click="emit('refresh')"
                    >
                        重试加载
                    </a-button>
                </template>
            </a-result>

            <a-empty
                v-else-if="!graph"
                description="暂无可展示的 SpiceDB schema 数据"
            />

            <a-empty
                v-else-if="!relationshipGraph.nodes.length"
                description="当前 SpiceDB schema 暂无可展示的实体关系"
            />

            <div
                v-else
                class="relationship-flow-graph__canvas"
            >
                <div class="relationship-flow-graph__toolbar">
                    <div class="relationship-flow-graph__toolbar-main">
                        <div class="relationship-flow-graph__toolbar-summary">
                            <span>定义 {{ relationshipGraph.stats.definitionCount }}</span>
                            <span>Relation {{ relationshipGraph.stats.relationCount }}</span>
                            <span>
                                权限依赖
                                {{ relationshipGraph.stats.permissionDependencyCount }}
                            </span>
                            <span>可见连线 {{ relationshipGraph.stats.visibleEdgeCount }}</span>
                        </div>
                        <div class="relationship-flow-graph__toolbar-hint">
                            当前图按 SpiceDB schema 展示 relation target 与 permission dependency。
                        </div>
                    </div>

                    <div class="relationship-flow-graph__toolbar-actions">
                        <div class="relationship-flow-graph__legend">
                            <span class="relationship-flow-graph__legend-item">
                                <i class="relationship-flow-graph__legend-line" />
                                Relation target
                            </span>
                            <span class="relationship-flow-graph__legend-item">
                                <i
                                    class="relationship-flow-graph__legend-line relationship-flow-graph__legend-line--permission"
                                />
                                Permission dependency
                            </span>
                        </div>
                        <a-space
                            size="small"
                            wrap
                        >
                            <a-button
                                size="small"
                                @click="handleFitView"
                            >
                                适配视图
                            </a-button>
                            <a-button
                                size="small"
                                @click="clearGraphSelection"
                            >
                                清除聚焦
                            </a-button>
                            <a-button
                                size="small"
                                @click="emit('refresh')"
                            >
                                刷新图谱
                            </a-button>
                        </a-space>
                    </div>
                </div>

                <a-card
                    class="relationship-flow-graph__flow-card"
                    :bordered="true"
                    :body-style="{ padding: 0 }"
                >
                    <VueFlow
                        class="relationship-flow-graph__flow"
                        :nodes="flowNodes"
                        :edges="flowEdges"
                        :min-zoom="0.25"
                        :max-zoom="1.8"
                        :default-viewport="{ zoom: 0.78 }"
                        :fit-view-on-init="true"
                        :connect-on-click="false"
                        :nodes-draggable="true"
                        :nodes-connectable="false"
                        :elements-selectable="true"
                        @node-click="handleNodeClick"
                        @edge-click="handleEdgeClick"
                        @pane-click="clearGraphSelection"
                        @pane-ready="handlePaneReady"
                    >
                        <template #node-default="{ data }">
                            <div
                                class="relationship-flow-node"
                                :class="[
                                    data.isSelected ? 'is-selected' : '',
                                    data.isDimmed ? 'is-dimmed' : '',
                                ]"
                                :style="{
                                    '--relationship-node-fill': data.fill,
                                    '--relationship-node-stroke': data.stroke,
                                    '--relationship-node-text': data.text,
                                    '--relationship-node-muted': data.mutedText,
                                    '--relationship-node-chip-fill': data.chipFill,
                                    '--relationship-node-chip-text': data.chipText,
                                }"
                            >
                                <Handle
                                    id="source-left"
                                    class="relationship-flow-node__handle"
                                    type="source"
                                    :position="Position.Left"
                                />
                                <Handle
                                    id="target-left"
                                    class="relationship-flow-node__handle"
                                    type="target"
                                    :position="Position.Left"
                                />
                                <Handle
                                    id="source-right"
                                    class="relationship-flow-node__handle"
                                    type="source"
                                    :position="Position.Right"
                                />
                                <Handle
                                    id="target-right"
                                    class="relationship-flow-node__handle"
                                    type="target"
                                    :position="Position.Right"
                                />
                                <Handle
                                    id="source-top"
                                    class="relationship-flow-node__handle"
                                    type="source"
                                    :position="Position.Top"
                                />
                                <Handle
                                    id="source-bottom"
                                    class="relationship-flow-node__handle"
                                    type="source"
                                    :position="Position.Bottom"
                                />
                                <Handle
                                    id="target-top"
                                    class="relationship-flow-node__handle"
                                    type="target"
                                    :position="Position.Top"
                                />
                                <Handle
                                    id="target-bottom"
                                    class="relationship-flow-node__handle"
                                    type="target"
                                    :position="Position.Bottom"
                                />

                                <div class="relationship-flow-node__title">
                                    {{ data.definitionName }}
                                </div>
                                <div class="relationship-flow-node__meta">
                                    出 {{ data.outgoingCount }} / 入 {{ data.incomingCount }}
                                </div>

                                <div class="relationship-flow-node__sections">
                                    <div
                                        v-if="data.relationLabels.length"
                                        class="relationship-flow-node__section"
                                    >
                                        <span class="relationship-flow-node__section-title">
                                            Relations
                                        </span>
                                        <span
                                            v-for="relation in data.relationLabels"
                                            :key="relation"
                                            class="relationship-flow-node__chip"
                                        >
                                            {{ relation }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="data.permissionLabels.length"
                                        class="relationship-flow-node__section"
                                    >
                                        <span class="relationship-flow-node__section-title">
                                            Permissions
                                        </span>
                                        <span
                                            v-for="permission in data.permissionLabels"
                                            :key="permission"
                                            class="relationship-flow-node__chip"
                                        >
                                            {{ permission }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <MiniMap
                            pannable
                            zoomable
                            :mask-color="'rgba(15, 23, 42, 0.08)'"
                            :node-color="resolveMiniMapNodeColor"
                        />
                        <Controls position="bottom-left" />
                    </VueFlow>
                </a-card>
            </div>
        </a-spin>
    </div>
</template>

<script setup lang="ts">
    import {
        Handle,
        MarkerType,
        Position,
        VueFlow,
        type Edge as FlowEdge,
        type Node as FlowNode,
    } from "@vue-flow/core";
    import { Controls } from "@vue-flow/controls";
    import { MiniMap } from "@vue-flow/minimap";
    import { computed, nextTick, shallowRef } from "vue";
    import type { SpiceDBSchemaDefinition, SpiceDBSchemaGraphResponse } from "@/api/spicedb-data";
    import {
        SPICEDB_RELATIONSHIP_NODE_HEIGHT,
        SPICEDB_RELATIONSHIP_NODE_WIDTH,
        buildSpiceDBRelationshipGraph,
        buildSpiceDBRelationshipLayout,
        resolveSpiceDBRelationshipNodeVisual,
    } from "./spiceDBRelationshipGraph";
    import "@vue-flow/core/dist/style.css";
    import "@vue-flow/core/dist/theme-default.css";
    import "@vue-flow/controls/dist/style.css";
    import "@vue-flow/minimap/dist/style.css";

    defineOptions({
        name: "SpiceDBRelationshipFlowGraph",
    });

    type GraphNodeData = {
        definitionName: string;
        relationLabels: string[];
        permissionLabels: string[];
        incomingCount: number;
        outgoingCount: number;
        fill: string;
        stroke: string;
        text: string;
        mutedText: string;
        chipFill: string;
        chipText: string;
        isSelected: boolean;
        isDimmed: boolean;
    };

    type GraphEdgeData = {
        label: string;
        kind: "relation" | "permission";
        isSelected: boolean;
        isDimmed: boolean;
    };

    const props = defineProps<{
        loading: boolean;
        errorMessage: string;
        graph: SpiceDBSchemaGraphResponse | null;
        definitions: SpiceDBSchemaDefinition[];
        selectedDefinition: string | null;
        selectedEdgeId: string | null;
    }>();

    const emit = defineEmits<{
        (event: "refresh"): void;
        (event: "select-definition", definitionName: string | null): void;
        (event: "select-edge", edgeId: string | null): void;
    }>();

    const flowInstance = shallowRef<{
        fitView: (options?: { padding?: number; duration?: number }) => Promise<void> | void;
        setViewport: (viewport: { x: number; y: number; zoom: number }) => Promise<void> | void;
    } | null>(null);

    const relationshipGraph = computed(() =>
        buildSpiceDBRelationshipGraph(props.definitions, props.graph),
    );

    const flowNodes = computed<FlowNode<GraphNodeData>[]>(() => {
        const layout = buildSpiceDBRelationshipLayout(relationshipGraph.value);
        return relationshipGraph.value.nodes.map((node) => {
            const placement = layout.get(node.id);
            if (!placement) {
                throw new Error(`SpiceDB 关系图缺少节点布局：${node.id}`);
            }
            const visual = resolveSpiceDBRelationshipNodeVisual(node.definitionName);
            const isSelected =
                !props.selectedDefinition || props.selectedDefinition === node.definitionName;
            const isDimmed = Boolean(props.selectedDefinition) && !isSelected;

            return {
                id: node.id,
                type: "default",
                position: { x: placement.x, y: placement.y },
                data: {
                    definitionName: node.definitionName,
                    relationLabels: node.relationLabels,
                    permissionLabels: node.permissionLabels,
                    incomingCount: node.incomingCount,
                    outgoingCount: node.outgoingCount,
                    fill: visual.fill,
                    stroke: visual.stroke,
                    text: visual.text,
                    mutedText: visual.mutedText,
                    chipFill: visual.chipFill,
                    chipText: visual.chipText,
                    isSelected,
                    isDimmed,
                },
                style: {
                    width: `${SPICEDB_RELATIONSHIP_NODE_WIDTH}px`,
                    height: `${SPICEDB_RELATIONSHIP_NODE_HEIGHT}px`,
                },
            };
        });
    });

    const flowEdges = computed<FlowEdge<GraphEdgeData>[]>(() => {
        return relationshipGraph.value.edges.map((edge) => {
            const isSelected = props.selectedEdgeId === edge.id;
            const isDimmed = Boolean(props.selectedEdgeId) && !isSelected;
            return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                type: "smoothstep",
                animated: edge.kind === "permission",
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                },
                label: edge.label,
                data: {
                    label: edge.label,
                    kind: edge.kind,
                    isSelected,
                    isDimmed,
                },
                style: {
                    stroke: edge.kind === "permission" ? "#ef4444" : "#2563eb",
                    strokeWidth: edge.kind === "permission" ? 2 : 1.5,
                    strokeDasharray: edge.kind === "permission" ? "6 4" : undefined,
                    opacity: isDimmed ? 0.2 : 0.9,
                },
                labelStyle: {
                    fill: edge.kind === "permission" ? "#b91c1c" : "#1d4ed8",
                    fontSize: 12,
                    fontWeight: 600,
                },
            };
        });
    });

    /**
     * 选中节点时高亮其定义，点击空白则清空焦点。
     */
    function handleNodeClick(payload: { node: { id: string } }) {
        emit("select-definition", payload.node.id);
    }

    /**
     * 选中边时高亮对应实体关系。
     */
    function handleEdgeClick(payload: { edge: { id: string } }) {
        emit("select-edge", payload.edge.id);
    }

    /**
     * 清空关系图当前焦点。
     */
    function clearGraphSelection() {
        emit("select-definition", null);
        emit("select-edge", null);
    }

    /**
     * 适配当前关系图到可视区域。
     */
    async function handleFitView() {
        await nextTick();
        await flowInstance.value?.fitView({ padding: 0.15, duration: 300 });
    }

    /**
     * 接收 VueFlow 实例，便于调用 fitView。
     */
    function handlePaneReady(instance: unknown) {
        flowInstance.value = instance as typeof flowInstance.value;
    }

    /**
     * 计算 MiniMap 节点颜色，维持既有图风格。
     */
    function resolveMiniMapNodeColor(node: { id: string }) {
        const visual = resolveSpiceDBRelationshipNodeVisual(node.id);
        return visual.fill;
    }
</script>

<style scoped lang="scss">
    .relationship-flow-graph {
        min-height: 560px;
    }

    .relationship-flow-graph__spin {
        width: 100%;
    }

    .relationship-flow-graph__canvas {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-height: 640px;
    }

    .relationship-flow-graph__toolbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
    }

    .relationship-flow-graph__toolbar-main {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .relationship-flow-graph__toolbar-summary,
    .relationship-flow-graph__toolbar-hint {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: var(--color-text-2);
    }

    .relationship-flow-graph__toolbar-hint {
        color: var(--color-text-3);
    }

    .relationship-flow-graph__toolbar-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
    }

    .relationship-flow-graph__legend {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        color: var(--color-text-2);
    }

    .relationship-flow-graph__legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    }

    .relationship-flow-graph__legend-line {
        width: 18px;
        height: 2px;
        background: #2563eb;
        display: inline-block;
    }

    .relationship-flow-graph__legend-line--permission {
        background: #ef4444;
        background-image: linear-gradient(90deg, #ef4444 50%, transparent 50%);
        background-size: 8px 2px;
    }

    .relationship-flow-graph__flow-card {
        min-height: 560px;
        overflow: hidden;
    }

    .relationship-flow-graph__flow-card :deep(.arco-card-body) {
        min-height: 560px;
    }

    .relationship-flow-graph__flow {
        min-height: 560px;
        background: var(--color-bg-1);
    }

    .relationship-flow-node {
        position: relative;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 14px 14px 12px;
        border-radius: 8px;
        border: 1px solid var(--relationship-node-stroke);
        background: var(--relationship-node-fill);
        color: var(--relationship-node-text);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }

    .relationship-flow-node.is-dimmed {
        opacity: 0.3;
    }

    .relationship-flow-node.is-selected {
        box-shadow: 0 0 0 2px var(--relationship-node-stroke);
    }

    .relationship-flow-node__handle {
        width: 8px;
        height: 8px;
        border: 1px solid var(--relationship-node-stroke);
        background: var(--relationship-node-chip-fill);
    }

    .relationship-flow-node__title {
        font-weight: 700;
        font-size: 15px;
        line-height: 1.35;
    }

    .relationship-flow-node__meta {
        margin-top: 4px;
        font-size: 12px;
        color: var(--relationship-node-muted);
    }

    .relationship-flow-node__sections {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .relationship-flow-node__section {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
    }

    .relationship-flow-node__section-title {
        font-size: 12px;
        font-weight: 700;
        color: var(--relationship-node-muted);
    }

    .relationship-flow-node__chip {
        display: inline-flex;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        line-height: 1.5;
        background: var(--relationship-node-chip-fill);
        color: var(--relationship-node-chip-text);
    }
</style>
