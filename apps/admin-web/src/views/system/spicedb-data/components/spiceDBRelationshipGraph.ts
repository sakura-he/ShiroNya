import dagre from "@dagrejs/dagre";
import type {
    SpiceDBSchemaDefinition,
    SpiceDBSchemaGraphResponse,
    SpiceDBSchemaRelationTarget,
} from "@/api/spicedb-data";

export const SPICEDB_RELATIONSHIP_NODE_WIDTH = 286;
export const SPICEDB_RELATIONSHIP_NODE_HEIGHT = 186;

export type SpiceDBRelationshipEdgeKind = "relation" | "permission";

export type SpiceDBRelationshipNodeVisual = {
    fill: string;
    stroke: string;
    text: string;
    mutedText: string;
    chipFill: string;
    chipText: string;
};

export type SpiceDBRelationshipNode = {
    id: string;
    definitionName: string;
    relationLabels: string[];
    permissionLabels: string[];
    incomingCount: number;
    outgoingCount: number;
};

export type SpiceDBRelationshipEdge = {
    id: string;
    kind: SpiceDBRelationshipEdgeKind;
    source: string;
    target: string;
    label: string;
    labels: string[];
};

export type SpiceDBRelationshipGraph = {
    nodes: SpiceDBRelationshipNode[];
    edges: SpiceDBRelationshipEdge[];
    stats: {
        definitionCount: number;
        relationCount: number;
        permissionDependencyCount: number;
        visibleEdgeCount: number;
        rawNodeCount: number;
        rawEdgeCount: number;
    };
};

export type SpiceDBRelationshipPlacement = {
    x: number;
    y: number;
};

type EdgeBucket = {
    kind: SpiceDBRelationshipEdgeKind;
    source: string;
    target: string;
    labels: string[];
};

const RELATIONSHIP_NODE_PALETTE: SpiceDBRelationshipNodeVisual[] = [
    {
        fill: "#ecfeff",
        stroke: "#0891b2",
        text: "#164e63",
        mutedText: "#0e7490",
        chipFill: "rgba(8, 145, 178, 0.12)",
        chipText: "#155e75",
    },
    {
        fill: "#eef2ff",
        stroke: "#4f46e5",
        text: "#312e81",
        mutedText: "#4338ca",
        chipFill: "rgba(79, 70, 229, 0.12)",
        chipText: "#3730a3",
    },
    {
        fill: "#f0fdf4",
        stroke: "#16a34a",
        text: "#14532d",
        mutedText: "#15803d",
        chipFill: "rgba(22, 163, 74, 0.12)",
        chipText: "#166534",
    },
    {
        fill: "#fff7ed",
        stroke: "#ea580c",
        text: "#7c2d12",
        mutedText: "#c2410c",
        chipFill: "rgba(234, 88, 12, 0.12)",
        chipText: "#9a3412",
    },
    {
        fill: "#fdf2f8",
        stroke: "#db2777",
        text: "#831843",
        mutedText: "#be185d",
        chipFill: "rgba(219, 39, 119, 0.12)",
        chipText: "#9d174d",
    },
    {
        fill: "#fffbeb",
        stroke: "#d97706",
        text: "#78350f",
        mutedText: "#b45309",
        chipFill: "rgba(217, 119, 6, 0.14)",
        chipText: "#92400e",
    },
];

/**
 * 将当前 SpiceDB schema 压缩成前端关系图可消费的节点和连线数据。
 */
export function buildSpiceDBRelationshipGraph(
    definitions: SpiceDBSchemaDefinition[],
    graph: SpiceDBSchemaGraphResponse | null,
): SpiceDBRelationshipGraph {
    const definitionNames = new Set(definitions.map((definition) => definition.name));
    const edgeBuckets = new Map<string, EdgeBucket>();

    for (const definition of definitions) {
        for (const relation of definition.relations) {
            for (const target of relation.targets) {
                const targetDefinition = normalizeTargetDefinitionName(target.type);
                if (!definitionNames.has(targetDefinition)) {
                    continue;
                }

                addEdgeBucket(edgeBuckets, {
                    kind: "relation",
                    source: definition.name,
                    target: targetDefinition,
                    label: formatRelationEdgeLabel(relation.name, target),
                });
            }
        }

        for (const permission of definition.permissions) {
            for (const dependency of extractArrowPermissionDependencies(
                definition,
                permission.expression,
                definitionNames,
            )) {
                addEdgeBucket(edgeBuckets, {
                    kind: "permission",
                    source: definition.name,
                    target: dependency.target,
                    label: `${permission.name}: ${dependency.label}`,
                });
            }
        }
    }

    const edges = [...edgeBuckets.values()].map(createRelationshipEdgeFromBucket);
    const nodes = definitions
        .map((definition) => ({
            id: definition.name,
            definitionName: definition.name,
            relationLabels: definition.relations.map(formatRelationLabel),
            permissionLabels: definition.permissions.map(formatPermissionLabel),
            incomingCount: countEdgesByEndpoint(edges, definition.name, "target"),
            outgoingCount: countEdgesByEndpoint(edges, definition.name, "source"),
        }))
        .sort((left, right) => left.definitionName.localeCompare(right.definitionName));

    return {
        nodes,
        edges: edges.sort(sortRelationshipEdges),
        stats: {
            definitionCount: nodes.length,
            relationCount: edges
                .filter((edge) => edge.kind === "relation")
                .reduce((total, edge) => total + edge.labels.length, 0),
            permissionDependencyCount: edges
                .filter((edge) => edge.kind === "permission")
                .reduce((total, edge) => total + edge.labels.length, 0),
            visibleEdgeCount: edges.length,
            rawNodeCount: graph?.stats.nodeCount ?? 0,
            rawEdgeCount: graph?.stats.edgeCount ?? 0,
        },
    };
}

/**
 * 根据 definition 名称稳定分配节点配色，避免刷新后颜色跳变。
 */
export function resolveSpiceDBRelationshipNodeVisual(definitionName: string) {
    const paletteIndex =
        Math.abs(createStableStringHash(definitionName)) % RELATIONSHIP_NODE_PALETTE.length;
    return RELATIONSHIP_NODE_PALETTE[paletteIndex];
}

/**
 * 使用 Dagre 为实体关系图生成稳定布局。
 */
export function buildSpiceDBRelationshipLayout(
    graph: SpiceDBRelationshipGraph,
): Map<string, SpiceDBRelationshipPlacement> {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: "TB",
        nodesep: 78,
        ranksep: 112,
        edgesep: 28,
        marginx: 52,
        marginy: 48,
    });

    for (const node of graph.nodes) {
        dagreGraph.setNode(node.id, {
            width: SPICEDB_RELATIONSHIP_NODE_WIDTH,
            height: SPICEDB_RELATIONSHIP_NODE_HEIGHT,
        });
    }

    for (const edge of graph.edges) {
        dagreGraph.setEdge(edge.source, edge.target);
    }

    dagre.layout(dagreGraph);

    return new Map(
        graph.nodes.map((node) => {
            const positionedNode = dagreGraph.node(node.id) as { x: number; y: number } | undefined;
            if (!positionedNode) {
                throw new Error(`SpiceDB 关系图缺少布局坐标：${node.id}`);
            }

            return [
                node.id,
                {
                    x: positionedNode.x - SPICEDB_RELATIONSHIP_NODE_WIDTH / 2,
                    y: positionedNode.y - SPICEDB_RELATIONSHIP_NODE_HEIGHT / 2,
                },
            ];
        }),
    );
}

/**
 * 按 SpiceDB wildcard target 语义，把 user:* 归回 user definition。
 */
function normalizeTargetDefinitionName(type: string) {
    return type.endsWith(":*") ? type.slice(0, -2) : type;
}

/**
 * 把 relation target 格式化成节点内部的 relation 摘要。
 */
function formatRelationLabel(relation: SpiceDBSchemaDefinition["relations"][number]) {
    const targets = relation.targets.map(formatRelationTarget).join(" | ");
    return targets ? `${relation.name}: ${targets}` : relation.name;
}

/**
 * 把 permission 表达式格式化成节点内部的权限摘要。
 */
function formatPermissionLabel(permission: SpiceDBSchemaDefinition["permissions"][number]) {
    return permission.expression ? `${permission.name}: ${permission.expression}` : permission.name;
}

/**
 * 生成 relation target 连线标签，保留 SpiceDB 的 relation#target 语义。
 */
function formatRelationEdgeLabel(relationName: string, target: SpiceDBSchemaRelationTarget) {
    return `${relationName}: ${formatRelationTarget(target)}`;
}

/**
 * 格式化 SpiceDB relation target。
 */
function formatRelationTarget(target: SpiceDBSchemaRelationTarget) {
    return target.relation ? `${target.type}#${target.relation}` : target.type;
}

/**
 * 提取 permission 表达式中的 tuple-to-userset 依赖，如 system->manage_all。
 */
function extractArrowPermissionDependencies(
    definition: SpiceDBSchemaDefinition,
    expression: string,
    definitionNames: Set<string>,
) {
    const relationByName = new Map(
        definition.relations.map((relation) => [relation.name, relation]),
    );
    const dependencies: Array<{ target: string; label: string }> = [];
    const arrowPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)/g;
    let match: RegExpExecArray | null;

    while ((match = arrowPattern.exec(expression)) !== null) {
        const [, relationName, permissionName] = match;
        const relation = relationByName.get(relationName);
        if (!relation) {
            continue;
        }

        for (const target of relation.targets) {
            const targetDefinition = normalizeTargetDefinitionName(target.type);
            if (!definitionNames.has(targetDefinition)) {
                continue;
            }
            dependencies.push({
                target: targetDefinition,
                label: `${relationName}->${permissionName}`,
            });
        }
    }

    return dependencies;
}

/**
 * 合并同源同目标同类型的边，减少图上重叠连线。
 */
function addEdgeBucket(
    edgeBuckets: Map<string, EdgeBucket>,
    edgeInput: {
        kind: SpiceDBRelationshipEdgeKind;
        source: string;
        target: string;
        label: string;
    },
) {
    const bucketKey = [edgeInput.kind, edgeInput.source, edgeInput.target].join("::");
    const bucket =
        edgeBuckets.get(bucketKey) ??
        ({
            kind: edgeInput.kind,
            source: edgeInput.source,
            target: edgeInput.target,
            labels: [],
        } satisfies EdgeBucket);

    pushUnique(bucket.labels, edgeInput.label);
    edgeBuckets.set(bucketKey, bucket);
}

/**
 * 将边桶转换成前端渲染用边对象。
 */
function createRelationshipEdgeFromBucket(bucket: EdgeBucket): SpiceDBRelationshipEdge {
    return {
        id: ["spicedb", bucket.kind, bucket.source, bucket.target, bucket.labels.join("+")].join(
            ":",
        ),
        kind: bucket.kind,
        source: bucket.source,
        target: bucket.target,
        label: formatCompactEdgeLabel(bucket.labels),
        labels: bucket.labels,
    };
}

/**
 * 压缩多关系标签，避免边标签过长。
 */
function formatCompactEdgeLabel(labels: string[]) {
    const previewLabels = labels.slice(0, 2);
    const suffix =
        labels.length > previewLabels.length ? ` +${labels.length - previewLabels.length}` : "";
    return `${previewLabels.join(", ")}${suffix}`;
}

/**
 * 统计指定端点方向上的边数量。
 */
function countEdgesByEndpoint(
    edges: SpiceDBRelationshipEdge[],
    nodeId: string,
    endpoint: "source" | "target",
) {
    return edges.filter((edge) => edge[endpoint] === nodeId).length;
}

/**
 * 按类型和实体名稳定排序实体关系边。
 */
function sortRelationshipEdges(left: SpiceDBRelationshipEdge, right: SpiceDBRelationshipEdge) {
    return (
        resolveEdgeKindWeight(left.kind) - resolveEdgeKindWeight(right.kind) ||
        left.source.localeCompare(right.source) ||
        left.target.localeCompare(right.target) ||
        left.label.localeCompare(right.label)
    );
}

/**
 * 让 relation target 边优先显示，permission dependency 边作为补充。
 */
function resolveEdgeKindWeight(kind: SpiceDBRelationshipEdgeKind) {
    return kind === "relation" ? 0 : 1;
}

/**
 * 向数组中写入不重复文本。
 */
function pushUnique(list: string[], value: string) {
    if (!list.includes(value)) {
        list.push(value);
    }
}

/**
 * 生成稳定整数 hash，用于配色索引。
 */
function createStableStringHash(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(index);
        hash |= 0;
    }

    return hash;
}
