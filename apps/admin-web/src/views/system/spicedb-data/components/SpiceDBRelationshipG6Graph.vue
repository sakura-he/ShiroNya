<template>
    <div class="relationship-g6-graph">
        <a-spin
            class="relationship-g6-graph__spin"
            :loading="loading"
            tip="正在加载 G6 实体关系图..."
        >
            <a-result
                v-if="errorMessage"
                status="error"
                title="G6 实体关系图加载失败"
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
                description="暂无已部署 Schema 图谱数据"
            />

            <a-empty
                v-else-if="!relationshipGraph.nodes.length"
                description="当前 Schema 暂无可展示的实体关系"
            />

            <a-card
                v-else
                class="relationship-g6-graph__canvas"
                :bordered="true"
                :body-style="{
                    padding: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }"
            >
                <div class="relationship-g6-graph__toolbar">
                    <div class="relationship-g6-graph__toolbar-main">
                        <div class="relationship-g6-graph__toolbar-summary">
                            <span>定义 {{ relationshipGraph.stats.definitionCount }}</span>
                            <span>Relation {{ relationshipGraph.stats.relationCount }}</span>
                            <span>
                                权限依赖
                                {{ relationshipGraph.stats.permissionDependencyCount }}
                            </span>
                            <span>可见连线 {{ relationshipGraph.stats.visibleEdgeCount }}</span>
                        </div>
                        <div class="relationship-g6-graph__toolbar-hint">
                            G6 图与 VueFlow 图使用同一份 SpiceDB 数据，只是换了一种排布方式。
                        </div>
                    </div>

                    <div class="relationship-g6-graph__toolbar-actions">
                        <div class="relationship-g6-graph__legend">
                            <span class="relationship-g6-graph__legend-item">
                                <i class="relationship-g6-graph__legend-line" />
                                Relation target
                            </span>
                            <span class="relationship-g6-graph__legend-item">
                                <i
                                    class="relationship-g6-graph__legend-line relationship-g6-graph__legend-line--permission"
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

                <div class="relationship-g6-graph__viewport">
                    <div
                        ref="graphContainerRef"
                        class="relationship-g6-graph__container"
                    />
                </div>
            </a-card>
        </a-spin>
    </div>
</template>

<script setup lang="ts">
    import {
        CommonEvent,
        EdgeEvent,
        Graph,
        NodeEvent,
        type EdgeData,
        type GraphData,
        type NodeData,
    } from "@antv/g6";
    import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
    import type { SpiceDBSchemaDefinition, SpiceDBSchemaGraphResponse } from "@/api/spicedb-data";
    import {
        SPICEDB_RELATIONSHIP_NODE_HEIGHT,
        SPICEDB_RELATIONSHIP_NODE_WIDTH,
        buildSpiceDBRelationshipGraph,
        buildSpiceDBRelationshipLayout,
        resolveSpiceDBRelationshipNodeVisual,
    } from "./spiceDBRelationshipGraph";

    defineOptions({
        name: "SpiceDBRelationshipG6Graph",
    });

    type G6EventLike = {
        target?: {
            id?: unknown;
        };
    };

    type EdgeVisual = {
        stroke: string;
        lineWidth: number;
        lineDash: number[] | 0;
        opacity: number;
        labelOpacity: number;
    };

    type G6FocusContext = {
        active: boolean;
        anchorDefinitionNames: Set<string>;
        focusedDefinitionNames: Set<string>;
        focusedEdgeIds: Set<string>;
    };

    const G6_CANVAS_PADDING = 36;
    const G6_MIN_WIDTH = 320;
    const G6_MIN_HEIGHT = 560;
    const G6_FOCUS_ZOOM = 0.9;

    const props = defineProps<{
        loading: boolean;
        errorMessage: string;
        graph: SpiceDBSchemaGraphResponse | null;
        definitions: SpiceDBSchemaDefinition[];
        selectedDefinition: string | null;
        selectedEdgeId: string | null;
    }>();

    const emit = defineEmits<{
        (event: "select-definition", definitionName: string | null): void;
        (event: "select-edge", edgeId: string | null): void;
        (event: "refresh"): void;
    }>();

    const graphContainerRef = ref<HTMLDivElement | null>(null);
    const g6Graph = shallowRef<Graph | null>(null);
    let resizeObserver: ResizeObserver | null = null;

    const relationshipGraph = computed(() =>
        buildSpiceDBRelationshipGraph(props.definitions, props.graph),
    );

    const focusContext = computed(() =>
        createFocusContext(relationshipGraph.value, props.selectedDefinition, props.selectedEdgeId),
    );

    const selectedViewportNodeIds = computed(() => {
        const nodeIds = new Set<string>(focusContext.value.anchorDefinitionNames);
        if (props.selectedEdgeId) {
            const selectedEdge = relationshipGraph.value.edges.find(
                (edge) => edge.id === props.selectedEdgeId,
            );
            if (selectedEdge) {
                nodeIds.add(selectedEdge.source);
                nodeIds.add(selectedEdge.target);
            }
        }
        return [...nodeIds];
    });

    /**
     * schema graph 或选中态变化时重绘 G6。
     */
    watch(
        () => createGraphRenderKey(relationshipGraph.value, focusContext.value),
        async () => {
            await nextTick();
            await syncGraphData();
        },
    );

    onMounted(() => {
        setupResizeObserver();
        void syncGraphData();
    });

    onBeforeUnmount(() => {
        resizeObserver?.disconnect();
        resizeObserver = null;
        g6Graph.value?.destroy();
        g6Graph.value = null;
    });

    /**
     * 创建或复用 G6 实例，并注册交互事件。
     */
    function ensureGraphInstance() {
        const container = graphContainerRef.value;
        if (!container) {
            return null;
        }

        if (g6Graph.value) {
            return g6Graph.value;
        }

        const graphInstance = new Graph({
            container,
            width: resolveContainerWidth(container),
            height: resolveContainerHeight(container),
            padding: G6_CANVAS_PADDING,
            zoomRange: [0.25, 2.2],
            data: {
                nodes: [],
                edges: [],
            },
            layout: createGraphLayout(),
            node: {
                type: "rect",
                style: createNodeStyle,
            },
            edge: {
                type: "quadratic",
                style: createEdgeStyle,
            },
            behaviors: createGraphBehaviors(),
        });

        registerGraphEvents(graphInstance);
        g6Graph.value = graphInstance;
        return graphInstance;
    }

    /**
     * 把实体关系图数据同步到 G6。
     */
    async function syncGraphData() {
        const graphInstance = ensureGraphInstance();
        if (!graphInstance) {
            return;
        }

        graphInstance.setData(buildG6GraphData(relationshipGraph.value, focusContext.value));
        await graphInstance.render();
        await syncGraphViewport();
    }

    /**
     * 生成禁用自动布局的 G6 布局配置。
     */
    function createGraphLayout() {
        return {
            type: "grid",
            nodeFilter: () => false,
            comboFilter: () => false,
        };
    }

    /**
     * 创建 G6 交互行为。
     */
    function createGraphBehaviors() {
        return ["drag-canvas", "zoom-canvas", "drag-element", "auto-adapt-label"];
    }

    /**
     * 注册容器尺寸监听，让 G6 画布跟随 tab 宽度变化。
     */
    function setupResizeObserver() {
        const container = graphContainerRef.value;
        if (!container || resizeObserver) {
            return;
        }

        resizeObserver = new ResizeObserver(() => {
            void resizeGraphToContainer();
        });
        resizeObserver.observe(container);
    }

    /**
     * 根据 DOM 容器真实尺寸调整 G6 画布大小。
     */
    async function resizeGraphToContainer() {
        const container = graphContainerRef.value;
        const graphInstance = g6Graph.value;
        if (!container || !graphInstance) {
            return;
        }

        graphInstance.setSize(resolveContainerWidth(container), resolveContainerHeight(container));
        await syncGraphViewport();
    }

    /**
     * 图谱重绘后同步视口。
     */
    async function syncGraphViewport() {
        if (await focusGraphSelection()) {
            return;
        }

        await handleFitView();
    }

    /**
     * 将当前实体关系图完整适配到视口内。
     */
    async function handleFitView() {
        const graphInstance = g6Graph.value;
        if (
            !graphInstance ||
            graphInstance.destroyed ||
            !graphInstance.rendered ||
            !relationshipGraph.value.nodes.length
        ) {
            return false;
        }

        await graphInstance.fitView(
            {
                when: "always",
                direction: "both",
            },
            {
                duration: 260,
                easing: "ease",
            },
        );

        return true;
    }

    /**
     * 将当前聚焦 definition 移到视口中心。
     */
    async function focusGraphSelection(elementIds = selectedViewportNodeIds.value) {
        const graphInstance = g6Graph.value;
        if (
            !graphInstance ||
            graphInstance.destroyed ||
            !graphInstance.rendered ||
            !elementIds.length
        ) {
            return false;
        }

        await graphInstance.focusElement(elementIds, {
            duration: 260,
            easing: "ease",
        });
        await graphInstance.zoomTo(G6_FOCUS_ZOOM, {
            duration: 220,
            easing: "ease",
        });

        return true;
    }

    /**
     * 将共享实体关系图转换为 G6 nodes/edges。
     */
    function buildG6GraphData(
        graph: ReturnType<typeof buildSpiceDBRelationshipGraph>,
        context: G6FocusContext,
    ): GraphData {
        const layout = buildSpiceDBRelationshipLayout(graph);

        return {
            nodes: graph.nodes.map((node) => createG6NodeData(node, layout, context)),
            edges: graph.edges.map((edge) => createG6EdgeData(edge, context)),
        };
    }

    /**
     * 创建 G6 节点数据。
     */
    function createG6NodeData(
        node: ReturnType<typeof buildSpiceDBRelationshipGraph>["nodes"][number],
        layout: Map<string, { x: number; y: number }>,
        context: G6FocusContext,
    ): NodeData {
        const placement = layout.get(node.id);
        if (!placement) {
            throw new Error(`SpiceDB 关系图缺少 G6 节点坐标：${node.id}`);
        }

        return {
            id: node.id,
            data: {
                definitionName: node.definitionName,
                labelText: createG6NodeLabel(node),
                isSelected: String(context.anchorDefinitionNames.has(node.id)),
                isDimmed: String(context.active && !context.focusedDefinitionNames.has(node.id)),
            },
            style: {
                x: placement.x,
                y: placement.y,
            },
        };
    }

    /**
     * 创建 G6 边数据。
     */
    function createG6EdgeData(
        edge: ReturnType<typeof buildSpiceDBRelationshipGraph>["edges"][number],
        context: G6FocusContext,
    ): EdgeData {
        const isSelected = context.focusedEdgeIds.has(edge.id);
        const isDimmed = context.active && !isSelected;

        return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            data: {
                kind: edge.kind,
                label: edge.label,
                isSelected: String(isSelected),
                isDimmed: String(isDimmed),
            },
        };
    }

    /**
     * 生成 G6 节点多行标签。
     */
    function createG6NodeLabel(
        node: ReturnType<typeof buildSpiceDBRelationshipGraph>["nodes"][number],
    ) {
        return [
            node.definitionName,
            `出 ${node.outgoingCount} / 入 ${node.incomingCount}`,
            `R: ${formatCompactDefinitionList(node.relationLabels)}`,
            `P: ${formatCompactDefinitionList(node.permissionLabels)}`,
        ].join("\n");
    }

    /**
     * 压缩 G6 节点内的定义列表。
     */
    function formatCompactDefinitionList(labels: string[]) {
        if (!labels.length) {
            return "-";
        }

        const preview = labels.slice(0, 2);
        const suffix = labels.length > preview.length ? ` +${labels.length - preview.length}` : "";
        return `${preview.join(" | ")}${suffix}`;
    }

    /**
     * 生成 G6 节点样式。
     */
    function createNodeStyle(nodeData: NodeData) {
        const isSelected = readG6DataBoolean(nodeData, "isSelected");
        const isDimmed = readG6DataBoolean(nodeData, "isDimmed");
        const visual = resolveSpiceDBRelationshipNodeVisual(
            readG6DataString(nodeData, "definitionName"),
        );

        return {
            size: [SPICEDB_RELATIONSHIP_NODE_WIDTH, SPICEDB_RELATIONSHIP_NODE_HEIGHT] as [
                number,
                number,
            ],
            fill: visual.fill,
            stroke: isSelected ? "#111827" : visual.stroke,
            radius: 8,
            lineWidth: isSelected ? 2.4 : 1.2,
            opacity: isDimmed ? 0.28 : 1,
            shadowColor: "rgba(15, 23, 42, 0.14)",
            shadowBlur: isSelected ? 16 : 10,
            shadowOffsetY: 8,
            cursor: "pointer" as const,
            labelText: readG6DataString(nodeData, "labelText"),
            labelPlacement: "center" as const,
            labelFill: visual.text,
            labelFontSize: 11,
            labelFontWeight: 700,
            labelLineHeight: 14,
            labelWordWrap: true,
            labelWordWrapWidth: SPICEDB_RELATIONSHIP_NODE_WIDTH - 22,
            labelMaxLines: 6,
            labelTextOverflow: "...",
            labelBackground: false,
        };
    }

    /**
     * 生成 G6 边样式。
     */
    function createEdgeStyle(edgeData: EdgeData) {
        const visual = resolveEdgeVisual(edgeData);

        return {
            stroke: visual.stroke,
            lineWidth: visual.lineWidth,
            opacity: visual.opacity,
            lineDash: visual.lineDash,
            endArrow: true,
            endArrowType: "vee" as const,
            endArrowFill: visual.stroke,
            endArrowStroke: visual.stroke,
            endArrowOffset: 4,
            cursor: "pointer" as const,
            label: visual.labelOpacity > 0,
            labelText: readG6DataString(edgeData, "label"),
            labelOpacity: visual.labelOpacity,
            labelFill: visual.stroke,
            labelFontSize: 10,
            labelFontWeight: 700,
            labelPlacement: "center" as const,
            labelWordWrap: true,
            labelWordWrapWidth: 150,
            labelMaxLines: 2,
            labelTextOverflow: "...",
            labelBackground: true,
            labelBackgroundFill: "rgba(255, 255, 255, 0.94)",
            labelBackgroundStroke: visual.stroke,
            labelBackgroundLineWidth: 0.6,
            labelBackgroundRadius: 4,
            labelPadding: [2, 6],
        };
    }

    /**
     * 根据边语义和聚焦状态生成 G6 线条视觉配置。
     */
    function resolveEdgeVisual(edgeData: EdgeData): EdgeVisual {
        const kind = readG6DataString(edgeData, "kind");
        const isSelected = readG6DataBoolean(edgeData, "isSelected");
        const isDimmed = readG6DataBoolean(edgeData, "isDimmed");

        if (kind === "permission") {
            return {
                stroke: "#be123c",
                lineWidth: isSelected ? 3 : 1.8,
                lineDash: [8, 5],
                opacity: isDimmed ? 0.1 : 0.72,
                labelOpacity: isDimmed ? 0 : 1,
            };
        }

        return {
            stroke: "#2563eb",
            lineWidth: isSelected ? 3 : 1.6,
            lineDash: 0,
            opacity: isDimmed ? 0.08 : 0.76,
            labelOpacity: isDimmed ? 0 : 1,
        };
    }

    /**
     * 注册 G6 点击事件，并同步到父级选中态。
     */
    function registerGraphEvents(graphInstance: Graph) {
        graphInstance.on(NodeEvent.CLICK, (event) => {
            const nodeId = resolveEventElementId(event);
            const relationshipNode = relationshipGraph.value.nodes.find(
                (node) => node.id === nodeId,
            );
            emit("select-definition", relationshipNode?.definitionName ?? null);
            emit("select-edge", null);
            void focusGraphSelection(nodeId ? [nodeId] : []);
        });

        graphInstance.on(EdgeEvent.CLICK, (event) => {
            const edgeId = resolveEventElementId(event);
            const relationshipEdge = relationshipGraph.value.edges.find(
                (edge) => edge.id === edgeId,
            );

            emit("select-edge", relationshipEdge?.id ?? null);
            emit("select-definition", null);

            if (relationshipEdge) {
                void focusGraphSelection([relationshipEdge.source, relationshipEdge.target]);
            }
        });

        graphInstance.on(CommonEvent.CLICK, (event) => {
            if (isGraphElementId(resolveEventElementId(event))) {
                return;
            }

            clearGraphSelection();
        });
    }

    /**
     * 清空图谱选中态。
     */
    function clearGraphSelection() {
        emit("select-definition", null);
        emit("select-edge", null);
    }

    /**
     * 构建图谱渲染监听 key。
     */
    function createGraphRenderKey(
        graph: ReturnType<typeof buildSpiceDBRelationshipGraph>,
        context: G6FocusContext,
    ) {
        return [
            graph.nodes.map((node) => node.id).join(","),
            graph.edges.map((edge) => `${edge.id}:${edge.label}`).join(","),
            [...context.anchorDefinitionNames].join(","),
            [...context.focusedEdgeIds].join(","),
        ].join("|");
    }

    /**
     * 判断事件命中的 ID 是否属于当前图。
     */
    function isGraphElementId(elementId: string) {
        if (!elementId) {
            return false;
        }

        return (
            relationshipGraph.value.nodes.some((node) => node.id === elementId) ||
            relationshipGraph.value.edges.some((edge) => edge.id === elementId)
        );
    }

    /**
     * 从 G6 事件对象中提取元素 ID。
     */
    function resolveEventElementId(event: unknown) {
        const eventLike = event as G6EventLike;
        return typeof eventLike.target?.id === "string" ? eventLike.target.id : "";
    }

    /**
     * 安全读取 G6 data 字符串字段。
     */
    function readG6DataString(nodeData: NodeData | EdgeData, key: string) {
        const value = nodeData.data?.[key];
        return typeof value === "string" ? value : "";
    }

    /**
     * 安全读取 G6 data 布尔字段。
     */
    function readG6DataBoolean(nodeData: NodeData | EdgeData, key: string) {
        return readG6DataString(nodeData, key) === "true";
    }

    /**
     * 读取容器宽度。
     */
    function resolveContainerWidth(container: HTMLElement) {
        return Math.max(container.clientWidth, G6_MIN_WIDTH);
    }

    /**
     * 读取容器高度。
     */
    function resolveContainerHeight(container: HTMLElement) {
        return Math.max(container.clientHeight, G6_MIN_HEIGHT);
    }

    /**
     * 依据当前选中态构造聚焦上下文。
     */
    function createFocusContext(
        graph: ReturnType<typeof buildSpiceDBRelationshipGraph>,
        selectedDefinition: string | null,
        selectedEdgeId: string | null,
    ): G6FocusContext {
        const context: G6FocusContext = {
            active: false,
            anchorDefinitionNames: new Set<string>(),
            focusedDefinitionNames: new Set<string>(),
            focusedEdgeIds: new Set<string>(),
        };

        if (selectedDefinition) {
            const selectedNode = graph.nodes.find((node) => node.id === selectedDefinition);
            if (selectedNode) {
                context.active = true;
                context.anchorDefinitionNames.add(selectedNode.id);
                includeIncidentEdges(graph, selectedNode.id, context);
            }
        }

        if (selectedEdgeId) {
            const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId);
            if (selectedEdge) {
                context.active = true;
                context.focusedEdgeIds.add(selectedEdge.id);
                context.anchorDefinitionNames.add(selectedEdge.source);
                context.anchorDefinitionNames.add(selectedEdge.target);
                context.focusedDefinitionNames.add(selectedEdge.source);
                context.focusedDefinitionNames.add(selectedEdge.target);
            }
        }

        return context;
    }

    /**
     * 将与当前 definition 相连的边纳入聚焦集合。
     */
    function includeIncidentEdges(
        graph: ReturnType<typeof buildSpiceDBRelationshipGraph>,
        definitionName: string,
        context: G6FocusContext,
    ) {
        context.focusedDefinitionNames.add(definitionName);

        for (const edge of graph.edges) {
            if (edge.source !== definitionName && edge.target !== definitionName) {
                continue;
            }

            context.focusedEdgeIds.add(edge.id);
            context.focusedDefinitionNames.add(edge.source);
            context.focusedDefinitionNames.add(edge.target);
        }
    }
</script>

<style scoped lang="scss">
    .relationship-g6-graph {
        min-height: 720px;
        height: 100%;
    }

    .relationship-g6-graph__spin,
    :deep(.arco-spin-children) {
        display: block;
        height: 100%;
        min-height: 720px;
    }

    .relationship-g6-graph__canvas {
        height: 100%;
        min-height: 720px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .relationship-g6-graph__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        background: #ffffff;
    }

    .relationship-g6-graph__toolbar-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .relationship-g6-graph__toolbar-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 14px;
    }

    .relationship-g6-graph__toolbar-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
    }

    .relationship-g6-graph__toolbar-hint {
        color: #64748b;
        font-size: 12px;
        line-height: 1.45;
    }

    .relationship-g6-graph__legend {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #475569;
        font-size: 12px;
        white-space: nowrap;
    }

    .relationship-g6-graph__legend-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .relationship-g6-graph__legend-line {
        width: 28px;
        height: 0;
        display: inline-block;
        border-top: 2px solid #2563eb;
    }

    .relationship-g6-graph__legend-line--permission {
        border-color: #be123c;
        border-style: dashed;
    }

    .relationship-g6-graph__viewport {
        flex: 1;
        min-height: 0;
        background-color: #fbfbfb;
        background-image: radial-gradient(
            circle at center,
            rgba(100, 116, 139, 0.24) 0 1px,
            transparent 1px
        );
        background-size: 22px 22px;
    }

    .relationship-g6-graph__container {
        width: 100%;
        height: 100%;
        min-height: 560px;
    }

    @media (max-width: 960px) {
        .relationship-g6-graph__toolbar {
            align-items: flex-start;
            flex-direction: column;
        }

        .relationship-g6-graph__toolbar-actions {
            justify-content: flex-start;
        }
    }
</style>
