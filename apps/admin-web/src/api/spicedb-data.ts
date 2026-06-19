import { request } from "./index";

export type SpiceDBObjectRef = {
    type: string;
    id: string;
};

export type SpiceDBSubjectRef = SpiceDBObjectRef & {
    relation?: string;
};

export type SpiceDBSchemaRelationTarget = {
    type: string;
    relation?: string;
};

export type SpiceDBSchemaRelation = {
    name: string;
    targets: SpiceDBSchemaRelationTarget[];
};

export type SpiceDBSchemaPermission = {
    name: string;
    expression: string;
};

export type SpiceDBSchemaDefinition = {
    name: string;
    relations: SpiceDBSchemaRelation[];
    permissions: SpiceDBSchemaPermission[];
};

export type SpiceDBSchemaResponse = {
    schema: string;
    definitions: SpiceDBSchemaDefinition[];
};

export type SpiceDBSchemaGraphNodeType = "definition" | "relation" | "permission";

export type SpiceDBSchemaGraphEdgeType = "contains" | "targets" | "depends_on";

export type SpiceDBSchemaGraphNode = {
    id: string;
    nodeType: SpiceDBSchemaGraphNodeType;
    label: string;
    definition: string;
    name: string;
    path: string;
};

export type SpiceDBSchemaGraphEdge = {
    id: string;
    edgeType: SpiceDBSchemaGraphEdgeType;
    source: string;
    target: string;
    label: string;
};

export type SpiceDBSchemaGraphResponse = {
    nodes: SpiceDBSchemaGraphNode[];
    edges: SpiceDBSchemaGraphEdge[];
    stats: {
        nodeCount: number;
        edgeCount: number;
    };
};

export type SpiceDBProjectionSyncStatus = "synced" | "drifted";

export type SpiceDBProjectionSyncTableKey =
    | "userGroupMembers"
    | "userRoles"
    | "userGroupRoles"
    | "menuRoles";

export type SpiceDBProjectionSyncStats = {
    desiredCount: number;
    currentCount: number;
    missingCount: number;
    staleCount: number;
    synced: boolean;
};

export type SpiceDBProjectionSyncTable = SpiceDBProjectionSyncStats & {
    key: SpiceDBProjectionSyncTableKey;
    label: string;
    projectionTable: string;
    spiceDbRelation: string;
};

export type SpiceDBProjectionCursor = {
    topic: string;
    partition: number;
    consumerGroup: string;
    lastOffset: string | null;
    lastEventKey: string | null;
    lastZedToken: string | null;
    lastEventAt: string | null;
    lastProcessedAt: string | null;
    lag: string;
};

export type SpiceDBProjectionSyncOverview = {
    checkedAt: string;
    status: SpiceDBProjectionSyncStatus;
    total: SpiceDBProjectionSyncStats;
    tables: SpiceDBProjectionSyncTable[];
    cursor: {
        cursors: SpiceDBProjectionCursor[];
    };
    lag: number;
    lastEventAt: string | null;
    lastReconcileAt: string | null;
};

export type SpiceDBProjectionReconcileMode = "dry_run" | "apply" | "rebuild";

export type SpiceDBProjectionReconcilePayload = {
    mode: SpiceDBProjectionReconcileMode;
    reason: string;
    zedToken?: string;
};

export type SpiceDBProjectionReconcileResult = {
    runId: string;
    mode: SpiceDBProjectionReconcileMode;
    status: "succeeded" | "failed";
    zedToken: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    result: Record<string, Omit<SpiceDBProjectionSyncStats, "synced">>;
};

export type SpiceDBProjectionRunStats = Partial<Omit<SpiceDBProjectionSyncStats, "synced">> &
    Record<string, unknown>;

export type SpiceDBProjectionReconcileRun = {
    id: string;
    mode: string;
    triggeredBy: string;
    reason: string;
    status: string;
    zedToken: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    userGroupMembersStats: SpiceDBProjectionRunStats | null;
    userRolesStats: SpiceDBProjectionRunStats | null;
    userGroupRolesStats: SpiceDBProjectionRunStats | null;
    menuRolesStats: SpiceDBProjectionRunStats | null;
    totalStats: SpiceDBProjectionRunStats | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SpiceDBRelationshipRecord = {
    resource: SpiceDBObjectRef;
    relation: string;
    subject: SpiceDBSubjectRef;
    zedToken?: string | null;
};

export type SpiceDBRelationshipMutationPayload = SpiceDBRelationshipRecord & {
    reason: string;
};

export type SpiceDBPermissionCheckPayload = {
    resource: SpiceDBObjectRef;
    permission: string;
    subject: SpiceDBSubjectRef;
};

export type SpiceDBPermissionCheckResult = SpiceDBPermissionCheckPayload & {
    permissionship: string;
};

export type SpiceDBPermissionBatchCheckPayload = {
    items: SpiceDBPermissionCheckPayload[];
};

export type SpiceDBPermissionBatchCheckItemResult = SpiceDBPermissionCheckResult & {
    index: number;
    zedToken: string | null;
};

export type SpiceDBPermissionBatchCheckResult = {
    results: SpiceDBPermissionBatchCheckItemResult[];
    zedToken: string | null;
};

export type SpiceDBPermissionExplainPayload = {
    userId: string;
    target: {
        menuId?: number;
        permission?: string;
    };
};

export type SpiceDBPermissionExplainRolePath = {
    roleId: number;
    roleName: string;
    roleCode: string;
    roleEnabled: boolean;
    menuAuthorized: boolean;
    spiceDbAllowed: boolean;
};

export type SpiceDBPermissionExplainGroupPath = SpiceDBPermissionExplainRolePath & {
    groupId: number;
    groupName: string;
    groupCode: string;
    groupEnabled: boolean;
    activeMember: boolean;
};

export type SpiceDBPermissionExplainSystemAdminPath = {
    viaUser: boolean;
    viaRoles: Array<{
        roleId: number;
        roleName: string;
        roleCode: string;
        roleEnabled: boolean;
        spiceDbAllowed: boolean;
    }>;
};

export type SpiceDBPermissionExplainResult = {
    userId: string;
    target: {
        menuId: number | null;
        permission: string | null;
        title: string | null;
        status: string | null;
        type: string | null;
    };
    spiceDbAllowed: boolean;
    businessAllowed: boolean;
    directRolePaths: SpiceDBPermissionExplainRolePath[];
    groupRolePaths: SpiceDBPermissionExplainGroupPath[];
    systemAdminPath: SpiceDBPermissionExplainSystemAdminPath;
    missingReasons: string[];
    checkedAt: string;
};

export type SpiceDBRelationshipQuery = {
    resourceType: string;
    resourceId?: string;
    relation?: string;
    subjectType?: string;
    subjectId?: string;
    subjectRelation?: string;
    pageSize?: number;
    cursor?: string;
};

export type SpiceDBRelationshipExportQuery = Omit<
    SpiceDBRelationshipQuery,
    "cursor" | "pageSize"
> & {
    format: SpiceDBRelationshipImportFormat;
};

export type SpiceDBSchemaPublishPreview = {
    version: number;
    schemaHash: string;
    previousSchemaHash: string | null;
    hasChanges: boolean;
    diffText: string;
    draftSchema: string;
    remoteSchema: string;
    rollbackHint: string | null;
};

export type SpiceDBSchemaPublishPreviewPayload = {
    schemaText: string;
};

export type SpiceDBSchemaPublishPayload = {
    schemaText: string;
    reason: string;
};

export type SpiceDBSchemaPublication = {
    id: string;
    version: number;
    schemaHash: string;
    previousSchemaHash: string | null;
    schemaText: string;
    diffText: string;
    publishedBy: string;
    publishedAt: string;
    reason: string;
    status: string;
    zedToken: string | null;
    error: string | null;
    rollbackHint: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SpiceDBRelationshipImportFormat = "json" | "csv";

export type SpiceDBRelationshipImportPayload = {
    format: SpiceDBRelationshipImportFormat;
    content: string;
    reason?: string;
};

export type SpiceDBRelationshipImportPreviewRow = {
    operation: "touch" | "delete";
    relationship: SpiceDBRelationshipRecord;
    key: string;
};

export type SpiceDBRelationshipImportInvalidRow = {
    row: number;
    reason: string;
    raw: unknown;
};

export type SpiceDBRelationshipImportPreview = {
    toCreate: SpiceDBRelationshipImportPreviewRow[];
    toDelete: SpiceDBRelationshipImportPreviewRow[];
    skipped: SpiceDBRelationshipImportPreviewRow[];
    invalidRows: SpiceDBRelationshipImportInvalidRow[];
    repairScript: string;
    summary: {
        totalRows: number;
        createCount: number;
        deleteCount: number;
        skippedCount: number;
        invalidCount: number;
    };
};

export type SpiceDBRelationshipImportApplyResult = SpiceDBRelationshipImportPreview & {
    zedToken: string | null;
    reconcileRunId: string | null;
};

export type SpiceDBRelationshipExportResult = {
    format: SpiceDBRelationshipImportFormat;
    filename: string;
    content: string;
    count: number;
};

export type SpiceDBWatchEventQuery = {
    status?: string;
    zedToken?: string;
    offset?: string;
    eventKey?: string;
    onlyUnhandled?: boolean;
    page?: number;
    pageSize?: number;
};

export type SpiceDBWatchEvent = {
    id: number;
    topic: string;
    partition: number;
    offset: string;
    eventKey: string;
    zedToken: string | null;
    operation: string | null;
    status: string;
    reason: string | null;
    error: string | null;
    payload: unknown | null;
    handledAt: string | null;
    handledBy: string | null;
    handledReason: string | null;
    replayCount: number;
    lastReplayAt: string | null;
    lastReplayBy: string | null;
    lastReplayStatus: string | null;
    lastReplayError: string | null;
    createdAt: string;
    updatedAt: string;
};

export type SpiceDBWatchEventOperationPayload = {
    ids: number[];
    reason: string;
};

export type SpiceDBWatchEventOperationResult = {
    affectedCount: number;
    failedCount: number;
    failures: Array<{
        id: number;
        error: string;
    }>;
};

export type SpiceDBHealthOverview = {
    checkedAt: string;
    spicedb: {
        healthy: boolean;
        latencyMs: number | null;
        error: string | null;
    };
    kafka: {
        lag: number;
        lastEventAt: string | null;
        lastZedTokenAt: string | null;
    };
    dlq: {
        unhandledCount: number;
    };
    projection: {
        driftCount: number | null;
        lastReconcileAt: string | null;
        lastReconcileStatus: string | null;
        lastCheckedAt: string | null;
        lastMode: string | null;
        snapshotStatus: string | null;
    };
    check: {
        total: number;
        failed: number;
        errorRate: number;
    };
    alerts: Array<{
        key: string;
        level: "info" | "warning" | "critical";
        message: string;
    }>;
    thresholds: {
        lagWarn: number;
        dlqWarn: number;
        driftWarn: number;
        checkErrorRateWarn: number;
    };
};

export type SpiceDBCursorPageResponse<T> = {
    records: T[];
    pagination: {
        pageSize: number;
        cursor: string | null;
        nextCursor: string | null;
        hasMore: boolean;
    };
};

export type SpiceDBOffsetPageResponse<T> = {
    records: T[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
};

const SPICEDB_DATA_API_BASE = "/system/spicedb-data";

/**
 * 获取当前部署的 SpiceDB schema。
 */
export function getSpiceDBSchemaApi() {
    return request.get<SpiceDBSchemaResponse>(`${SPICEDB_DATA_API_BASE}/schema`);
}

/**
 * 获取当前 SpiceDB schema graph。
 */
export function getSpiceDBSchemaGraphApi() {
    return request.get<SpiceDBSchemaGraphResponse>(`${SPICEDB_DATA_API_BASE}/graph`);
}

/**
 * 检测基础关系投影表与 SpiceDB 当前全量数据的同步概况。
 */
export function getSpiceDBProjectionSyncOverviewApi() {
    return request.get<SpiceDBProjectionSyncOverview>(
        `${SPICEDB_DATA_API_BASE}/projection-sync/overview`,
    );
}

/**
 * 手动执行 SpiceDB 基础关系投影对账。
 */
export function reconcileSpiceDBProjectionApi(data: SpiceDBProjectionReconcilePayload) {
    return request.post<SpiceDBProjectionReconcileResult>(
        `${SPICEDB_DATA_API_BASE}/projection-sync/reconcile`,
        data,
    );
}

/**
 * 查询 SpiceDB 基础关系投影对账历史。
 */
export function getSpiceDBProjectionReconcileRunsApi(limit = 20) {
    return request.get<SpiceDBProjectionReconcileRun[]>(
        `${SPICEDB_DATA_API_BASE}/projection-sync/runs`,
        {
            params: { limit },
        },
    );
}

/**
 * 检查 subject 是否拥有 resource 上的 permission。
 */
export function checkSpiceDBPermissionApi(data: SpiceDBPermissionCheckPayload) {
    return request.post<SpiceDBPermissionCheckResult>(
        `${SPICEDB_DATA_API_BASE}/permissions/check`,
        data,
    );
}

/**
 * 批量检查多组 subject/resource permission。
 */
export function batchCheckSpiceDBPermissionsApi(data: SpiceDBPermissionBatchCheckPayload) {
    return request.post<SpiceDBPermissionBatchCheckResult>(
        `${SPICEDB_DATA_API_BASE}/permissions/batch-check`,
        data,
    );
}

/**
 * 解释指定用户访问菜单或权限点的命中路径。
 */
export function explainSpiceDBPermissionApi(data: SpiceDBPermissionExplainPayload) {
    return request.post<SpiceDBPermissionExplainResult>(
        `${SPICEDB_DATA_API_BASE}/permissions/explain`,
        data,
    );
}

/**
 * 获取草稿 schema 发布到远端前的差异预览。
 */
export function getSpiceDBSchemaPublishPreviewApi(data: SpiceDBSchemaPublishPreviewPayload) {
    return request.post<SpiceDBSchemaPublishPreview>(
        `${SPICEDB_DATA_API_BASE}/schema/publish-preview`,
        data,
    );
}

/**
 * 发布草稿 schema 到 SpiceDB。
 */
export function publishSpiceDBSchemaApi(data: SpiceDBSchemaPublishPayload) {
    return request.post<SpiceDBSchemaPublication>(`${SPICEDB_DATA_API_BASE}/schema/publish`, data);
}

/**
 * 查询 schema 发布历史。
 */
export function getSpiceDBSchemaPublicationsApi() {
    return request.get<SpiceDBSchemaPublication[]>(`${SPICEDB_DATA_API_BASE}/schema/publications`);
}

/**
 * 查询 SpiceDB relationship 列表。
 */
export function getSpiceDBRelationshipsApi(params: SpiceDBRelationshipQuery) {
    return request.post<SpiceDBCursorPageResponse<SpiceDBRelationshipRecord>>(
        `${SPICEDB_DATA_API_BASE}/relationships/query`,
        params,
    );
}

/**
 * 预览 JSON/CSV relationship 批量导入差异。
 */
export function previewSpiceDBRelationshipImportApi(data: SpiceDBRelationshipImportPayload) {
    return request.post<SpiceDBRelationshipImportPreview>(
        `${SPICEDB_DATA_API_BASE}/relationships/import/preview`,
        data,
    );
}

/**
 * 执行 JSON/CSV relationship 批量导入。
 */
export function applySpiceDBRelationshipImportApi(
    data: Required<SpiceDBRelationshipImportPayload>,
) {
    return request.post<SpiceDBRelationshipImportApplyResult>(
        `${SPICEDB_DATA_API_BASE}/relationships/import/apply`,
        data,
    );
}

/**
 * 按当前查询条件导出 relationships。
 */
export function exportSpiceDBRelationshipsApi(params: SpiceDBRelationshipExportQuery) {
    return request.post<SpiceDBRelationshipExportResult>(
        `${SPICEDB_DATA_API_BASE}/relationships/export`,
        params,
    );
}

/**
 * Touch 单条 SpiceDB relationship。
 */
export function createSpiceDBRelationshipApi(data: SpiceDBRelationshipMutationPayload) {
    return request.post<SpiceDBRelationshipRecord>(`${SPICEDB_DATA_API_BASE}/relationships`, data);
}

/**
 * 精确删除单条 SpiceDB relationship。
 */
export function deleteSpiceDBRelationshipApi(data: SpiceDBRelationshipMutationPayload) {
    return request.post<null>(`${SPICEDB_DATA_API_BASE}/relationships/delete`, data);
}

/**
 * 查询 SpiceDB Watch/DLQ 事件日志。
 */
export function getSpiceDBWatchEventsApi(params: SpiceDBWatchEventQuery) {
    return request.post<SpiceDBOffsetPageResponse<SpiceDBWatchEvent>>(
        `${SPICEDB_DATA_API_BASE}/watch-events/query`,
        params,
    );
}

/**
 * 查询单条 SpiceDB Watch/DLQ 事件详情。
 */
export function getSpiceDBWatchEventApi(id: number) {
    return request.get<SpiceDBWatchEvent>(`${SPICEDB_DATA_API_BASE}/watch-events/${id}`);
}

/**
 * 回放 Watch/DLQ 事件。
 */
export function replaySpiceDBWatchEventsApi(data: SpiceDBWatchEventOperationPayload) {
    return request.post<SpiceDBWatchEventOperationResult>(
        `${SPICEDB_DATA_API_BASE}/watch-events/replay`,
        data,
    );
}

/**
 * 标记 Watch/DLQ 事件已处理。
 */
export function markSpiceDBWatchEventsHandledApi(data: SpiceDBWatchEventOperationPayload) {
    return request.post<SpiceDBWatchEventOperationResult>(
        `${SPICEDB_DATA_API_BASE}/watch-events/mark-handled`,
        data,
    );
}

/**
 * 获取 SpiceDB 权限链路健康看板。
 */
export function getSpiceDBHealthApi() {
    return request.get<SpiceDBHealthOverview>(`${SPICEDB_DATA_API_BASE}/health`);
}
