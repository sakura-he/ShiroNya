import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * SpiceDB 对象引用 Schema。
 */
export const SpiceDbObjectRefSchema = z.object({
    type: z.string().min(1),
    id: z.string().min(1)
});
export class SpiceDbObjectRefDto extends createZodDto(SpiceDbObjectRefSchema) {}
export type SpiceDbObjectRefType = z.infer<typeof SpiceDbObjectRefSchema>;

/**
 * SpiceDB subject 引用 Schema。
 */
export const SpiceDbSubjectRefSchema = SpiceDbObjectRefSchema.extend({
    relation: z.string().min(1).optional()
});
export class SpiceDbSubjectRefDto extends createZodDto(SpiceDbSubjectRefSchema) {}
export type SpiceDbSubjectRefType = z.infer<typeof SpiceDbSubjectRefSchema>;

/**
 * SpiceDB schema relation target Schema。
 */
export const SpiceDbSchemaRelationTargetSchema = z.object({
    type: z.string(),
    relation: z.string().optional()
});
export class SpiceDbSchemaRelationTargetDto extends createZodDto(SpiceDbSchemaRelationTargetSchema) {}
export type SpiceDbSchemaRelationTargetType = z.infer<typeof SpiceDbSchemaRelationTargetSchema>;

/**
 * SpiceDB schema relation Schema。
 */
export const SpiceDbSchemaRelationSchema = z.object({
    name: z.string(),
    targets: z.array(SpiceDbSchemaRelationTargetSchema)
});
export class SpiceDbSchemaRelationDto extends createZodDto(SpiceDbSchemaRelationSchema) {}
export type SpiceDbSchemaRelationType = z.infer<typeof SpiceDbSchemaRelationSchema>;

/**
 * SpiceDB schema permission Schema。
 */
export const SpiceDbSchemaPermissionSchema = z.object({
    name: z.string(),
    expression: z.string()
});
export class SpiceDbSchemaPermissionDto extends createZodDto(SpiceDbSchemaPermissionSchema) {}
export type SpiceDbSchemaPermissionType = z.infer<typeof SpiceDbSchemaPermissionSchema>;

/**
 * SpiceDB schema definition Schema。
 */
export const SpiceDbSchemaDefinitionSchema = z.object({
    name: z.string(),
    relations: z.array(SpiceDbSchemaRelationSchema),
    permissions: z.array(SpiceDbSchemaPermissionSchema)
});
export class SpiceDbSchemaDefinitionDto extends createZodDto(SpiceDbSchemaDefinitionSchema) {}
export type SpiceDbSchemaDefinitionType = z.infer<typeof SpiceDbSchemaDefinitionSchema>;

/**
 * SpiceDB schema 响应 Schema。
 */
export const SpiceDbSchemaResponseSchema = z.object({
    schema: z.string(),
    definitions: z.array(SpiceDbSchemaDefinitionSchema)
});
export class SpiceDbSchemaResponseDto extends createZodDto(SpiceDbSchemaResponseSchema) {}
export type SpiceDbSchemaResponseType = z.infer<typeof SpiceDbSchemaResponseSchema>;

/**
 * SpiceDB schema graph 节点类型 Schema。
 */
export const SpiceDbSchemaGraphNodeTypeSchema = z.enum(['definition', 'relation', 'permission']);
export const SpiceDbSchemaGraphNodeTypeDto = createZodDto(SpiceDbSchemaGraphNodeTypeSchema);
export type SpiceDbSchemaGraphNodeType = z.infer<typeof SpiceDbSchemaGraphNodeTypeSchema>;

/**
 * SpiceDB schema graph 边类型 Schema。
 */
export const SpiceDbSchemaGraphEdgeTypeSchema = z.enum(['contains', 'targets', 'depends_on']);
export const SpiceDbSchemaGraphEdgeTypeDto = createZodDto(SpiceDbSchemaGraphEdgeTypeSchema);
export type SpiceDbSchemaGraphEdgeType = z.infer<typeof SpiceDbSchemaGraphEdgeTypeSchema>;

/**
 * SpiceDB schema graph 节点 Schema。
 */
export const SpiceDbSchemaGraphNodeSchema = z.object({
    id: z.string(),
    nodeType: SpiceDbSchemaGraphNodeTypeSchema,
    label: z.string(),
    definition: z.string(),
    name: z.string(),
    path: z.string()
});
export class SpiceDbSchemaGraphNodeDto extends createZodDto(SpiceDbSchemaGraphNodeSchema) {}
export type SpiceDbSchemaGraphNodeTypeDtoType = z.infer<typeof SpiceDbSchemaGraphNodeSchema>;

/**
 * SpiceDB schema graph 边 Schema。
 */
export const SpiceDbSchemaGraphEdgeSchema = z.object({
    id: z.string(),
    edgeType: SpiceDbSchemaGraphEdgeTypeSchema,
    source: z.string(),
    target: z.string(),
    label: z.string()
});
export class SpiceDbSchemaGraphEdgeDto extends createZodDto(SpiceDbSchemaGraphEdgeSchema) {}
export type SpiceDbSchemaGraphEdgeTypeDtoType = z.infer<typeof SpiceDbSchemaGraphEdgeSchema>;

/**
 * SpiceDB schema graph 统计 Schema。
 */
export const SpiceDbSchemaGraphStatsSchema = z.object({
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative()
});
export class SpiceDbSchemaGraphStatsDto extends createZodDto(SpiceDbSchemaGraphStatsSchema) {}
export type SpiceDbSchemaGraphStatsType = z.infer<typeof SpiceDbSchemaGraphStatsSchema>;

/**
 * SpiceDB schema graph 响应 Schema。
 */
export const SpiceDbSchemaGraphResponseSchema = z.object({
    nodes: z.array(SpiceDbSchemaGraphNodeSchema),
    edges: z.array(SpiceDbSchemaGraphEdgeSchema),
    stats: SpiceDbSchemaGraphStatsSchema
});
export class SpiceDbSchemaGraphResponseDto extends createZodDto(SpiceDbSchemaGraphResponseSchema) {}
export type SpiceDbSchemaGraphResponseType = z.infer<typeof SpiceDbSchemaGraphResponseSchema>;

/**
 * SpiceDB 关系响应 Schema。
 */
export const SpiceDbRelationshipSchema = z.object({
    resource: SpiceDbObjectRefSchema,
    relation: z.string(),
    subject: SpiceDbSubjectRefSchema,
    zedToken: z.string().nullable().optional()
});
export class SpiceDbRelationshipDto extends createZodDto(SpiceDbRelationshipSchema) {}
export type SpiceDbRelationshipType = z.infer<typeof SpiceDbRelationshipSchema>;

/**
 * SpiceDB 列表分页 Schema。
 */
export const SpiceDbListPaginationSchema = z.object({
    pageSize: z.number().int().positive(),
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean()
});
export class SpiceDbListPaginationDto extends createZodDto(SpiceDbListPaginationSchema) {}
export type SpiceDbListPaginationType = z.infer<typeof SpiceDbListPaginationSchema>;

/**
 * 后台事件日志仍使用数据库 offset 分页，避免和 SpiceDB cursor 分页混用。
 */
export const SpiceDbOffsetPaginationSchema = z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalPages: z.number().int().nonnegative()
});
export class SpiceDbOffsetPaginationDto extends createZodDto(SpiceDbOffsetPaginationSchema) {}
export type SpiceDbOffsetPaginationType = z.infer<typeof SpiceDbOffsetPaginationSchema>;

/**
 * SpiceDB 关系列表响应 Schema。
 */
export const SpiceDbRelationshipPageSchema = z.object({
    records: z.array(SpiceDbRelationshipSchema),
    pagination: SpiceDbListPaginationSchema
});
export class SpiceDbRelationshipPageDto extends createZodDto(SpiceDbRelationshipPageSchema) {}
export type SpiceDbRelationshipPageType = z.infer<typeof SpiceDbRelationshipPageSchema>;

/**
 * SpiceDB relationship 过滤条件 Schema，供分页查询和导出查询复用。
 */
export const SpiceDbRelationshipFilterSchema = z.object({
    resourceType: z.string().min(1),
    resourceId: z.string().min(1).optional(),
    relation: z.string().min(1).optional(),
    subjectType: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    subjectRelation: z.string().min(1).optional()
});

/**
 * SpiceDB 关系查询 Schema。
 */
export const QuerySpiceDbRelationshipsSchema = SpiceDbRelationshipFilterSchema.extend({
    pageSize: z.number().int().min(1).max(100).default(10),
    cursor: z.string().min(1).optional()
}).superRefine((value, ctx) => {
    if ((value.subjectId || value.subjectRelation) && !value.subjectType) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subjectType'],
            message: 'subjectType 为必填项'
        });
    }
});
export class QuerySpiceDbRelationshipsDto extends createZodDto(QuerySpiceDbRelationshipsSchema) {}
export type QuerySpiceDbRelationshipsType = z.infer<typeof QuerySpiceDbRelationshipsSchema>;

/**
 * SpiceDB 关系写入 Schema。
 */
export const WriteSpiceDbRelationshipSchema = z.object({
    resource: SpiceDbObjectRefSchema,
    relation: z.string().min(1),
    subject: SpiceDbSubjectRefSchema,
    reason: z.string().min(1)
});
export class WriteSpiceDbRelationshipDto extends createZodDto(WriteSpiceDbRelationshipSchema) {}
export type WriteSpiceDbRelationshipType = z.infer<typeof WriteSpiceDbRelationshipSchema>;

/**
 * SpiceDB 关系删除 Schema。
 */
export const DeleteSpiceDbRelationshipSchema = WriteSpiceDbRelationshipSchema;
export class DeleteSpiceDbRelationshipDto extends createZodDto(DeleteSpiceDbRelationshipSchema) {}
export type DeleteSpiceDbRelationshipType = z.infer<typeof DeleteSpiceDbRelationshipSchema>;

/**
 * SpiceDB permission 检查 Schema。
 */
export const CheckSpiceDbPermissionSchema = z.object({
    resource: SpiceDbObjectRefSchema,
    permission: z.string().min(1),
    subject: SpiceDbSubjectRefSchema,
    withTracing: z.boolean().optional()
});
export class CheckSpiceDbPermissionDto extends createZodDto(CheckSpiceDbPermissionSchema) {}
export type CheckSpiceDbPermissionType = z.infer<typeof CheckSpiceDbPermissionSchema>;

/**
 * SpiceDB permission 检查结果 Schema。
 */
export const SpiceDbPermissionCheckResultSchema = z.object({
    resource: SpiceDbObjectRefSchema,
    permission: z.string(),
    subject: SpiceDbSubjectRefSchema,
    permissionship: z.string(),
    zedToken: z.string().nullable().optional(),
    traceDurationMs: z.number().nonnegative().nullable().optional(),
    traceOperationId: z.string().nullable().optional(),
    schemaUsed: z.string().nullable().optional(),
    debugTrace: z.any().nullable().optional()
});
export class SpiceDbPermissionCheckResultDto extends createZodDto(SpiceDbPermissionCheckResultSchema) {}
export type SpiceDbPermissionCheckResultType = z.infer<typeof SpiceDbPermissionCheckResultSchema>;

/**
 * 关系投影同步状态 Schema。
 */
export const SpiceDbProjectionSyncStatusSchema = z.enum(['synced', 'drifted']);
export const SpiceDbProjectionSyncStatusDto = createZodDto(SpiceDbProjectionSyncStatusSchema);
export type SpiceDbProjectionSyncStatusType = z.infer<typeof SpiceDbProjectionSyncStatusSchema>;

/**
 * 关系投影表 key Schema。
 */
export const SpiceDbProjectionSyncTableKeySchema = z.enum([
    'userGroupMembers',
    'userRoles',
    'userGroupRoles',
    'menuRoles'
]);
export const SpiceDbProjectionSyncTableKeyDto = createZodDto(SpiceDbProjectionSyncTableKeySchema);
export type SpiceDbProjectionSyncTableKeyType = z.infer<typeof SpiceDbProjectionSyncTableKeySchema>;

/**
 * 关系投影统计 Schema。
 */
export const SpiceDbProjectionSyncStatsSchema = z.object({
    desiredCount: z.number().int().nonnegative(),
    currentCount: z.number().int().nonnegative(),
    missingCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
    synced: z.boolean()
});
export class SpiceDbProjectionSyncStatsDto extends createZodDto(SpiceDbProjectionSyncStatsSchema) {}
export type SpiceDbProjectionSyncStatsType = z.infer<typeof SpiceDbProjectionSyncStatsSchema>;

/**
 * SpiceDB 投影消费游标 Schema。
 */
export const SpiceDbProjectionCursorSchema = z.object({
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    consumerGroup: z.string(),
    lastOffset: z.string().nullable(),
    lastEventKey: z.string().nullable(),
    lastZedToken: z.string().nullable(),
    lastEventAt: z.string().nullable(),
    lastProcessedAt: z.string().nullable(),
    lag: z.string()
});
export class SpiceDbProjectionCursorDto extends createZodDto(SpiceDbProjectionCursorSchema) {}
export type SpiceDbProjectionCursorType = z.infer<typeof SpiceDbProjectionCursorSchema>;

/**
 * SpiceDB 投影消费游标概况 Schema。
 */
export const SpiceDbProjectionCursorOverviewSchema = z.object({
    cursors: z.array(SpiceDbProjectionCursorSchema)
});
export class SpiceDbProjectionCursorOverviewDto extends createZodDto(SpiceDbProjectionCursorOverviewSchema) {}
export type SpiceDbProjectionCursorOverviewType = z.infer<typeof SpiceDbProjectionCursorOverviewSchema>;

/**
 * 单张关系投影表同步概况 Schema。
 */
export const SpiceDbProjectionSyncTableSchema = SpiceDbProjectionSyncStatsSchema.extend({
    key: SpiceDbProjectionSyncTableKeySchema,
    label: z.string(),
    projectionTable: z.string(),
    spiceDbRelation: z.string()
});
export class SpiceDbProjectionSyncTableDto extends createZodDto(SpiceDbProjectionSyncTableSchema) {}
export type SpiceDbProjectionSyncTableType = z.infer<typeof SpiceDbProjectionSyncTableSchema>;

/**
 * 关系投影 overview Schema。
 */
export const SpiceDbProjectionSyncOverviewSchema = z.object({
    checkedAt: z.string(),
    status: SpiceDbProjectionSyncStatusSchema,
    total: SpiceDbProjectionSyncStatsSchema,
    tables: z.array(SpiceDbProjectionSyncTableSchema),
    cursor: SpiceDbProjectionCursorOverviewSchema,
    lag: z.number().int().nonnegative(),
    lastEventAt: z.string().nullable(),
    lastReconcileAt: z.string().nullable()
});
export class SpiceDbProjectionSyncOverviewDto extends createZodDto(SpiceDbProjectionSyncOverviewSchema) {}
export type SpiceDbProjectionSyncOverviewType = z.infer<typeof SpiceDbProjectionSyncOverviewSchema>;

/**
 * SpiceDB 投影对账模式 Schema。
 */
export const SpiceDbProjectionReconcileModeSchema = z.enum(['dry_run', 'apply', 'rebuild']);
export const SpiceDbProjectionReconcileModeDto = createZodDto(SpiceDbProjectionReconcileModeSchema);
export type SpiceDbProjectionReconcileModeType = z.infer<typeof SpiceDbProjectionReconcileModeSchema>;

/**
 * SpiceDB 投影对账请求 Schema。
 */
export const SpiceDbProjectionReconcileRequestSchema = z.object({
    mode: SpiceDbProjectionReconcileModeSchema,
    reason: z.string().min(1),
    zedToken: z.string().min(1).optional()
});
export class SpiceDbProjectionReconcileRequestDto extends createZodDto(SpiceDbProjectionReconcileRequestSchema) {}
export type SpiceDbProjectionReconcileRequestType = z.infer<typeof SpiceDbProjectionReconcileRequestSchema>;

/**
 * SpiceDB 投影对账结果 Schema。
 */
export const SpiceDbProjectionReconcileResultSchema = z.object({
    runId: z.string(),
    mode: SpiceDbProjectionReconcileModeSchema,
    status: z.enum(['succeeded', 'failed']),
    zedToken: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string(),
    durationMs: z.number().int().nonnegative(),
    result: z.object({
        userGroupMembers: SpiceDbProjectionSyncStatsSchema.omit({ synced: true }),
        userRoles: SpiceDbProjectionSyncStatsSchema.omit({ synced: true }),
        userGroupRoles: SpiceDbProjectionSyncStatsSchema.omit({ synced: true }),
        menuRoles: SpiceDbProjectionSyncStatsSchema.omit({ synced: true }),
        total: SpiceDbProjectionSyncStatsSchema.omit({ synced: true })
    })
});
export class SpiceDbProjectionReconcileResultDto extends createZodDto(SpiceDbProjectionReconcileResultSchema) {}
export type SpiceDbProjectionReconcileResultType = z.infer<typeof SpiceDbProjectionReconcileResultSchema>;

/**
 * SpiceDB 投影对账历史记录 Schema。
 */
export const SpiceDbProjectionReconcileRunSchema = z.object({
    id: z.string(),
    mode: z.string(),
    triggeredBy: z.string(),
    reason: z.string(),
    status: z.string(),
    zedToken: z.string().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    userGroupMembersStats: z.unknown().nullable(),
    userRolesStats: z.unknown().nullable(),
    userGroupRolesStats: z.unknown().nullable(),
    menuRolesStats: z.unknown().nullable(),
    totalStats: z.unknown().nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
});
export class SpiceDbProjectionReconcileRunDto extends createZodDto(SpiceDbProjectionReconcileRunSchema) {}

/**
 * SpiceDB 投影对账历史列表 Schema。
 */
export const SpiceDbProjectionReconcileRunListSchema = z.array(SpiceDbProjectionReconcileRunSchema);
export class SpiceDbProjectionReconcileRunListDto extends createZodDto(SpiceDbProjectionReconcileRunListSchema) {}

/**
 * SpiceDB 投影对账历史查询 Schema。
 */
export const QuerySpiceDbProjectionReconcileRunsSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20)
});
export class QuerySpiceDbProjectionReconcileRunsDto extends createZodDto(QuerySpiceDbProjectionReconcileRunsSchema) {}
export type QuerySpiceDbProjectionReconcileRunsType = z.infer<typeof QuerySpiceDbProjectionReconcileRunsSchema>;

/**
 * SpiceDB permission 批量检查请求 Schema。
 */
export const BatchCheckSpiceDbPermissionSchema = z.object({
    items: z.array(CheckSpiceDbPermissionSchema).min(1).max(200)
});
export class BatchCheckSpiceDbPermissionDto extends createZodDto(BatchCheckSpiceDbPermissionSchema) {}
export type BatchCheckSpiceDbPermissionType = z.infer<typeof BatchCheckSpiceDbPermissionSchema>;

/**
 * SpiceDB permission 批量检查单项结果 Schema。
 */
export const SpiceDbPermissionBatchCheckItemResultSchema = SpiceDbPermissionCheckResultSchema.extend({
    index: z.number().int().nonnegative(),
    zedToken: z.string().nullable()
});
export class SpiceDbPermissionBatchCheckItemResultDto extends createZodDto(
    SpiceDbPermissionBatchCheckItemResultSchema
) {}
export type SpiceDbPermissionBatchCheckItemResultType = z.infer<typeof SpiceDbPermissionBatchCheckItemResultSchema>;

/**
 * SpiceDB permission 批量检查结果 Schema。
 */
export const SpiceDbPermissionBatchCheckResultSchema = z.object({
    results: z.array(SpiceDbPermissionBatchCheckItemResultSchema),
    zedToken: z.string().nullable()
});
export class SpiceDbPermissionBatchCheckResultDto extends createZodDto(SpiceDbPermissionBatchCheckResultSchema) {}
export type SpiceDbPermissionBatchCheckResultType = z.infer<typeof SpiceDbPermissionBatchCheckResultSchema>;

/**
 * 权限解释目标 Schema。
 */
export const ExplainSpiceDbPermissionTargetSchema = z
    .object({
        menuId: z.number().int().positive().optional(),
        permission: z.string().min(1).optional()
    })
    .superRefine((value, ctx) => {
        if (!value.menuId && !value.permission) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['menuId'],
                message: 'menuId 或 permission 至少填写一个'
            });
        }
    });
export class ExplainSpiceDbPermissionTargetDto extends createZodDto(ExplainSpiceDbPermissionTargetSchema) {}
export type ExplainSpiceDbPermissionTargetType = z.infer<typeof ExplainSpiceDbPermissionTargetSchema>;

/**
 * 权限解释请求 Schema。
 */
export const ExplainSpiceDbPermissionSchema = z.object({
    userId: z.string().min(1),
    target: ExplainSpiceDbPermissionTargetSchema
});
export class ExplainSpiceDbPermissionDto extends createZodDto(ExplainSpiceDbPermissionSchema) {}
export type ExplainSpiceDbPermissionType = z.infer<typeof ExplainSpiceDbPermissionSchema>;

/**
 * 权限解释缺失原因 Schema。
 */
export const SpiceDbPermissionExplainMissingReasonSchema = z.enum([
    'user_not_found',
    'menu_not_found',
    'no_role',
    'role_disabled',
    'group_disabled',
    'menu_not_authorized',
    'menu_business_disabled',
    'spicedb_denied'
]);
export type SpiceDbPermissionExplainMissingReasonType = z.infer<typeof SpiceDbPermissionExplainMissingReasonSchema>;

/**
 * 权限解释角色路径 Schema。
 */
export const SpiceDbPermissionExplainRolePathSchema = z.object({
    roleId: z.number().int(),
    roleName: z.string(),
    roleCode: z.string(),
    roleEnabled: z.boolean(),
    menuAuthorized: z.boolean(),
    spiceDbAllowed: z.boolean()
});

/**
 * 权限解释用户组路径 Schema。
 */
export const SpiceDbPermissionExplainGroupPathSchema = SpiceDbPermissionExplainRolePathSchema.extend({
    groupId: z.number().int(),
    groupName: z.string(),
    groupCode: z.string(),
    groupEnabled: z.boolean(),
    activeMember: z.boolean()
});

/**
 * 权限解释系统管理员路径 Schema。
 */
export const SpiceDbPermissionExplainSystemAdminPathSchema = z.object({
    viaUser: z.boolean(),
    viaRoles: z.array(
        z.object({
            roleId: z.number().int(),
            roleName: z.string(),
            roleCode: z.string(),
            roleEnabled: z.boolean(),
            spiceDbAllowed: z.boolean()
        })
    )
});

/**
 * 权限解释结果 Schema。
 */
export const SpiceDbPermissionExplainResultSchema = z.object({
    userId: z.string(),
    target: z.object({
        menuId: z.number().int().nullable(),
        permission: z.string().nullable(),
        title: z.string().nullable(),
        status: z.string().nullable(),
        type: z.string().nullable()
    }),
    spiceDbAllowed: z.boolean(),
    businessAllowed: z.boolean(),
    directRolePaths: z.array(SpiceDbPermissionExplainRolePathSchema),
    groupRolePaths: z.array(SpiceDbPermissionExplainGroupPathSchema),
    systemAdminPath: SpiceDbPermissionExplainSystemAdminPathSchema,
    missingReasons: z.array(SpiceDbPermissionExplainMissingReasonSchema),
    checkedAt: z.string()
});
export class SpiceDbPermissionExplainResultDto extends createZodDto(SpiceDbPermissionExplainResultSchema) {}
export type SpiceDbPermissionExplainResultType = z.infer<typeof SpiceDbPermissionExplainResultSchema>;

/**
 * Schema 发布预览 Schema。
 */
export const SpiceDbSchemaPublishPreviewSchema = z.object({
    version: z.number().int().positive(),
    schemaHash: z.string(),
    previousSchemaHash: z.string().nullable(),
    hasChanges: z.boolean(),
    diffText: z.string(),
    draftSchema: z.string(),
    remoteSchema: z.string(),
    rollbackHint: z.string().nullable()
});
export class SpiceDbSchemaPublishPreviewDto extends createZodDto(SpiceDbSchemaPublishPreviewSchema) {}
export type SpiceDbSchemaPublishPreviewType = z.infer<typeof SpiceDbSchemaPublishPreviewSchema>;

/**
 * Schema 发布预览请求 Schema。
 */
export const PreviewSpiceDbSchemaPublishSchema = z.object({
    schemaText: z.string().min(1)
});
export class PreviewSpiceDbSchemaPublishDto extends createZodDto(PreviewSpiceDbSchemaPublishSchema) {}
export type PreviewSpiceDbSchemaPublishType = z.infer<typeof PreviewSpiceDbSchemaPublishSchema>;

/**
 * Schema 发布请求 Schema。
 */
export const PublishSpiceDbSchemaSchema = z.object({
    schemaText: z.string().min(1),
    reason: z.string().min(1)
});
export class PublishSpiceDbSchemaDto extends createZodDto(PublishSpiceDbSchemaSchema) {}
export type PublishSpiceDbSchemaType = z.infer<typeof PublishSpiceDbSchemaSchema>;

/**
 * Schema 发布记录 Schema。
 */
export const SpiceDbSchemaPublicationSchema = z.object({
    id: z.string(),
    version: z.number().int(),
    schemaHash: z.string(),
    previousSchemaHash: z.string().nullable(),
    schemaText: z.string(),
    diffText: z.string(),
    publishedBy: z.string(),
    publishedAt: z.string(),
    reason: z.string(),
    status: z.string(),
    zedToken: z.string().nullable(),
    error: z.string().nullable(),
    rollbackHint: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
});
export class SpiceDbSchemaPublicationDto extends createZodDto(SpiceDbSchemaPublicationSchema) {}

/**
 * Schema 发布记录列表 Schema。
 */
export const SpiceDbSchemaPublicationListSchema = z.array(SpiceDbSchemaPublicationSchema);
export class SpiceDbSchemaPublicationListDto extends createZodDto(SpiceDbSchemaPublicationListSchema) {}

/**
 * Relationship 批量导入格式 Schema。
 */
export const SpiceDbRelationshipImportFormatSchema = z.enum(['json', 'csv']);
export type SpiceDbRelationshipImportFormatType = z.infer<typeof SpiceDbRelationshipImportFormatSchema>;

/**
 * Relationship 批量导入请求 Schema。
 */
export const ImportSpiceDbRelationshipsSchema = z.object({
    format: SpiceDbRelationshipImportFormatSchema,
    content: z.string().min(1),
    reason: z.string().min(1).optional()
});
export class ImportSpiceDbRelationshipsDto extends createZodDto(ImportSpiceDbRelationshipsSchema) {}
export type ImportSpiceDbRelationshipsType = z.infer<typeof ImportSpiceDbRelationshipsSchema>;

/**
 * Relationship 批量导入动作 Schema。
 */
export const SpiceDbRelationshipImportOperationSchema = z.enum(['touch', 'delete']);
export type SpiceDbRelationshipImportOperationType = z.infer<typeof SpiceDbRelationshipImportOperationSchema>;

/**
 * Relationship 批量导入预览行 Schema。
 */
export const SpiceDbRelationshipImportPreviewRowSchema = z.object({
    operation: SpiceDbRelationshipImportOperationSchema,
    relationship: SpiceDbRelationshipSchema,
    key: z.string()
});
export class SpiceDbRelationshipImportPreviewRowDto extends createZodDto(SpiceDbRelationshipImportPreviewRowSchema) {}
export type SpiceDbRelationshipImportPreviewRowType = z.infer<typeof SpiceDbRelationshipImportPreviewRowSchema>;

/**
 * Relationship 批量导入非法行 Schema。
 */
export const SpiceDbRelationshipImportInvalidRowSchema = z.object({
    row: z.number().int().positive(),
    reason: z.string(),
    raw: z.unknown()
});

/**
 * Relationship 批量导入预览结果 Schema。
 */
export const SpiceDbRelationshipImportPreviewSchema = z.object({
    toCreate: z.array(SpiceDbRelationshipImportPreviewRowSchema),
    toDelete: z.array(SpiceDbRelationshipImportPreviewRowSchema),
    skipped: z.array(SpiceDbRelationshipImportPreviewRowSchema),
    invalidRows: z.array(SpiceDbRelationshipImportInvalidRowSchema),
    repairScript: z.string(),
    summary: z.object({
        totalRows: z.number().int().nonnegative(),
        createCount: z.number().int().nonnegative(),
        deleteCount: z.number().int().nonnegative(),
        skippedCount: z.number().int().nonnegative(),
        invalidCount: z.number().int().nonnegative()
    })
});
export class SpiceDbRelationshipImportPreviewDto extends createZodDto(SpiceDbRelationshipImportPreviewSchema) {}
export type SpiceDbRelationshipImportPreviewType = z.infer<typeof SpiceDbRelationshipImportPreviewSchema>;

/**
 * Relationship 批量导入执行结果 Schema。
 */
export const SpiceDbRelationshipImportApplyResultSchema = SpiceDbRelationshipImportPreviewSchema.extend({
    zedToken: z.string().nullable(),
    reconcileRunId: z.string().nullable()
});
export class SpiceDbRelationshipImportApplyResultDto extends createZodDto(SpiceDbRelationshipImportApplyResultSchema) {}

/**
 * Relationship 导出格式 Schema。
 */
export const SpiceDbRelationshipExportFormatSchema = z.enum(['json', 'csv']);
export type SpiceDbRelationshipExportFormatType = z.infer<typeof SpiceDbRelationshipExportFormatSchema>;

/**
 * Relationship 导出查询 Schema。
 */
export const ExportSpiceDbRelationshipsSchema = SpiceDbRelationshipFilterSchema.extend({
    format: SpiceDbRelationshipExportFormatSchema.default('json')
}).superRefine((value, ctx) => {
    if ((value.subjectId || value.subjectRelation) && !value.subjectType) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subjectType'],
            message: 'subjectType 为必填项'
        });
    }
});
export class ExportSpiceDbRelationshipsDto extends createZodDto(ExportSpiceDbRelationshipsSchema) {}
export type ExportSpiceDbRelationshipsType = z.infer<typeof ExportSpiceDbRelationshipsSchema>;

/**
 * Relationship 导出响应 Schema。
 */
export const SpiceDbRelationshipExportResultSchema = z.object({
    format: SpiceDbRelationshipExportFormatSchema,
    filename: z.string(),
    content: z.string(),
    count: z.number().int().nonnegative()
});
export class SpiceDbRelationshipExportResultDto extends createZodDto(SpiceDbRelationshipExportResultSchema) {}

/**
 * Watch 事件查询 Schema。
 */
export const QuerySpiceDbWatchEventsSchema = z.object({
    status: z.string().min(1).optional(),
    zedToken: z.string().min(1).optional(),
    offset: z.string().min(1).optional(),
    eventKey: z.string().min(1).optional(),
    onlyUnhandled: z.boolean().optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20)
});
export class QuerySpiceDbWatchEventsDto extends createZodDto(QuerySpiceDbWatchEventsSchema) {}
export type QuerySpiceDbWatchEventsType = z.infer<typeof QuerySpiceDbWatchEventsSchema>;

/**
 * Watch 事件记录 Schema。
 */
export const SpiceDbWatchEventSchema = z.object({
    id: z.number().int(),
    topic: z.string(),
    partition: z.number().int(),
    offset: z.string(),
    eventKey: z.string(),
    zedToken: z.string().nullable(),
    operation: z.string().nullable(),
    status: z.string(),
    reason: z.string().nullable(),
    error: z.string().nullable(),
    payload: z.unknown().nullable(),
    handledAt: z.string().nullable(),
    handledBy: z.string().nullable(),
    handledReason: z.string().nullable(),
    replayCount: z.number().int(),
    lastReplayAt: z.string().nullable(),
    lastReplayBy: z.string().nullable(),
    lastReplayStatus: z.string().nullable(),
    lastReplayError: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string()
});
export class SpiceDbWatchEventDto extends createZodDto(SpiceDbWatchEventSchema) {}

/**
 * Watch 事件分页响应 Schema。
 */
export const SpiceDbWatchEventPageSchema = z.object({
    records: z.array(SpiceDbWatchEventSchema),
    pagination: SpiceDbOffsetPaginationSchema
});
export class SpiceDbWatchEventPageDto extends createZodDto(SpiceDbWatchEventPageSchema) {}

/**
 * Watch 事件回放请求 Schema。
 */
export const ReplaySpiceDbWatchEventsSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    reason: z.string().min(1)
});
export class ReplaySpiceDbWatchEventsDto extends createZodDto(ReplaySpiceDbWatchEventsSchema) {}
export type ReplaySpiceDbWatchEventsType = z.infer<typeof ReplaySpiceDbWatchEventsSchema>;

/**
 * Watch 事件标记处理请求 Schema。
 */
export const MarkHandledSpiceDbWatchEventsSchema = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    reason: z.string().min(1)
});
export class MarkHandledSpiceDbWatchEventsDto extends createZodDto(MarkHandledSpiceDbWatchEventsSchema) {}
export type MarkHandledSpiceDbWatchEventsType = z.infer<typeof MarkHandledSpiceDbWatchEventsSchema>;

/**
 * Watch 事件批量操作结果 Schema。
 */
export const SpiceDbWatchEventOperationResultSchema = z.object({
    affectedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    failures: z.array(
        z.object({
            id: z.number().int(),
            error: z.string()
        })
    )
});
export class SpiceDbWatchEventOperationResultDto extends createZodDto(SpiceDbWatchEventOperationResultSchema) {}

/**
 * 健康看板告警等级 Schema。
 */
export const SpiceDbHealthAlertLevelSchema = z.enum(['info', 'warning', 'critical']);

/**
 * 健康看板响应 Schema。
 */
export const SpiceDbHealthOverviewSchema = z.object({
    checkedAt: z.string(),
    spicedb: z.object({
        healthy: z.boolean(),
        latencyMs: z.number().int().nonnegative().nullable(),
        error: z.string().nullable()
    }),
    kafka: z.object({
        lag: z.number().int().nonnegative(),
        lastEventAt: z.string().nullable(),
        lastZedTokenAt: z.string().nullable()
    }),
    dlq: z.object({
        unhandledCount: z.number().int().nonnegative()
    }),
    projection: z.object({
        driftCount: z.number().int().nonnegative().nullable(),
        lastReconcileAt: z.string().nullable(),
        lastReconcileStatus: z.string().nullable(),
        lastCheckedAt: z.string().nullable(),
        lastMode: z.string().nullable(),
        snapshotStatus: z.string().nullable()
    }),
    check: z.object({
        total: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        errorRate: z.number().nonnegative()
    }),
    alerts: z.array(
        z.object({
            key: z.string(),
            level: SpiceDbHealthAlertLevelSchema,
            message: z.string()
        })
    ),
    thresholds: z.object({
        lagWarn: z.number().int().nonnegative(),
        dlqWarn: z.number().int().nonnegative(),
        driftWarn: z.number().int().nonnegative(),
        checkErrorRateWarn: z.number().nonnegative()
    })
});
export class SpiceDbHealthOverviewDto extends createZodDto(SpiceDbHealthOverviewSchema) {}

/**
 * 空响应 Schema。
 */
export const SpiceDbNullSchema = z.null();
export class SpiceDbNullDto extends createZodDto(SpiceDbNullSchema as any) {}
