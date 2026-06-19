import { BusinessException, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { asPrismaISODate } from '@app/prisma-admin/extensions/date-to-iso-string.extension';
import { MenuStatusEnum, RbacStatus } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    diffSchema,
    formatRelationship,
    parseSchema,
    type RelationshipInput,
    type RelationshipOperation
} from '@spicedb-toolkit/core';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { AdminErrorCodes } from '../../../common/constants/index';
import { AdminSpiceDbAuthorizationService } from '../../spicedb/admin-spicedb-authorization.service';
import {
    BaseRelationProjectionService,
    ProjectionReconcileStats
} from '../../spicedb-projection/base-relation-projection.service';
import { AuthzProjectionInvalidationService } from '../../spicedb-projection/authz-projection-invalidation.service';
import { AdminSpiceDbProjectionMetricsService } from '../../spicedb-stream/admin-spicedb-projection-metrics.service';
import {
    BatchCheckSpiceDbPermissionType,
    CheckSpiceDbPermissionType,
    DeleteSpiceDbRelationshipType,
    ExportSpiceDbRelationshipsType,
    ExplainSpiceDbPermissionType,
    ImportSpiceDbRelationshipsType,
    MarkHandledSpiceDbWatchEventsType,
    PublishSpiceDbSchemaType,
    QuerySpiceDbRelationshipsType,
    QuerySpiceDbWatchEventsType,
    ReplaySpiceDbWatchEventsType,
    SpiceDbPermissionExplainMissingReasonType,
    SpiceDbRelationshipImportPreviewRowType,
    SpiceDbRelationshipImportPreviewType,
    SpiceDbObjectRefType,
    SpiceDbProjectionSyncStatsType,
    SpiceDbProjectionSyncStatusType,
    SpiceDbRelationshipType,
    SpiceDbSchemaDefinitionType,
    SpiceDbSchemaGraphEdgeTypeDtoType,
    SpiceDbSchemaGraphNodeTypeDtoType,
    SpiceDbSubjectRefType,
    WriteSpiceDbRelationshipType
} from './dto/spicedb-data.dto';
import { SpiceDbDataKafkaOpsService } from './spicedb-data-kafka-ops.service';
import { SpiceDbProjectionReconcileService } from './spicedb-projection-reconcile.service';
import { attachSpiceDbDebugTraces, collectSpiceDbDebugTraces } from '../../spicedb/spicedb-debug-trace';

type SpiceDbRelationshipOutput = {
    resource: SpiceDbObjectRefType;
    relation: string;
    subject: SpiceDbSubjectRefType;
    zedToken?: string | null;
};

type SpiceDbRelationshipImportRow = {
    operation: RelationshipOperation;
    relationship: SpiceDbRelationshipType;
    key: string;
    sourceRow: number;
};

type ProjectionRepairResult = {
    repaired: boolean;
    patchedCount: number;
};

type SpiceDbRelationshipRawImportRow = {
    operation?: unknown;
    resourceType?: unknown;
    resourceId?: unknown;
    relation?: unknown;
    subjectType?: unknown;
    subjectId?: unknown;
    subjectRelation?: unknown;
};

type SpiceDbSchemaParsedExpression = {
    range?: {
        startIndex?: { offset?: number };
        endIndex?: { offset?: number };
    };
};

type SpiceDbSchemaSnapshot = {
    schema: string;
    definitions: SpiceDbSchemaDefinitionType[];
};

const MENU_VIEW_PERMISSION = 'view';
const MENU_VIEWER_RELATION = 'viewer';
const ADMIN_SYSTEM_ID = 'admin';
const HEALTH_THRESHOLD_ENV = {
    lagWarn: 'ADMIN_SPICEDB_HEALTH_LAG_WARN',
    dlqWarn: 'ADMIN_SPICEDB_HEALTH_DLQ_WARN',
    driftWarn: 'ADMIN_SPICEDB_HEALTH_DRIFT_WARN',
    checkErrorRateWarn: 'ADMIN_SPICEDB_HEALTH_CHECK_ERROR_RATE_WARN'
} as const;

const PROJECTION_TABLES = [
    {
        key: 'userGroupMembers',
        label: '用户组成员',
        projectionTable: 'spicedb_user_group_member_projection',
        spiceDbRelation: 'user_group#member@user'
    },
    {
        key: 'userRoles',
        label: '用户直接角色',
        projectionTable: 'spicedb_user_role_projection',
        spiceDbRelation: 'role#assignee@user'
    },
    {
        key: 'userGroupRoles',
        label: '用户组继承角色',
        projectionTable: 'spicedb_user_group_role_projection',
        spiceDbRelation: 'role#assignee@user_group#active_member'
    },
    {
        key: 'menuRoles',
        label: '菜单角色',
        projectionTable: 'spicedb_menu_role_projection',
        spiceDbRelation: 'menu#viewer|manager@role#assigned'
    }
] as const;

@Injectable()
export class SpiceDbDataService {
    private readonly logger = createRuntimeLogger(SpiceDbDataService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'spicedb_data' }
    });
    private schemaSnapshotPromise: Promise<SpiceDbSchemaSnapshot> | null = null;

    /**
     * 注入 SpiceDB toolkit 工厂、投影服务、对账服务和 Prisma。
     */
    constructor(
        private readonly authorizationService: AdminSpiceDbAuthorizationService,
        private readonly projectionService: BaseRelationProjectionService,
        private readonly reconcileService: SpiceDbProjectionReconcileService,
        private readonly prismaService: PrismaService,
        private readonly configService: ConfigService,
        private readonly metricsService: AdminSpiceDbProjectionMetricsService,
        private readonly kafkaOpsService: SpiceDbDataKafkaOpsService,
        private readonly invalidationService: AuthzProjectionInvalidationService
    ) {}

    /**
     * 读取当前仓库内的 SpiceDB schema 文本并返回解析结果。
     */
    async getSchema() {
        const snapshot = await this.readSchemaSnapshot();
        return {
            schema: snapshot.schema,
            definitions: snapshot.definitions
        };
    }

    /**
     * 根据 schema definition/relation/permission 生成前端可展示的图谱数据。
     */
    async getSchemaGraph() {
        const { definitions } = await this.readSchemaSnapshot();
        return this.createSchemaGraph(definitions);
    }

    /**
     * 复用并发中的 schema 读取，避免 /schema 与 /graph 同时各打一次 SpiceDB。
     */
    private async readSchemaSnapshot(): Promise<SpiceDbSchemaSnapshot> {
        if (!this.schemaSnapshotPromise) {
            this.schemaSnapshotPromise = this.loadSchemaSnapshot().finally(() => {
                this.schemaSnapshotPromise = null;
            });
        }

        return await this.schemaSnapshotPromise;
    }

    private async loadSchemaSnapshot(): Promise<SpiceDbSchemaSnapshot> {
        const schema = await this.authorizationService.readSchemaText();
        return {
            schema,
            definitions: this.parseSchemaDefinitions(schema)
        };
    }

    private createSchemaGraph(definitions: SpiceDbSchemaDefinitionType[]) {
        const nodes: SpiceDbSchemaGraphNodeTypeDtoType[] = [];
        const edges: SpiceDbSchemaGraphEdgeTypeDtoType[] = [];

        for (const definition of definitions) {
            const definitionNodeId = this.createGraphNodeId(definition.name, 'definition', definition.name);
            nodes.push({
                id: definitionNodeId,
                nodeType: 'definition',
                label: definition.name,
                definition: definition.name,
                name: definition.name,
                path: definition.name
            });

            for (const relation of definition.relations) {
                const relationNodeId = this.createGraphNodeId(definition.name, 'relation', relation.name);
                nodes.push({
                    id: relationNodeId,
                    nodeType: 'relation',
                    label: relation.name,
                    definition: definition.name,
                    name: relation.name,
                    path: `${definition.name}#${relation.name}`
                });
                edges.push(this.createGraphEdge(definitionNodeId, relationNodeId, 'contains', 'relation'));

                for (const target of relation.targets) {
                    const targetNodeId = this.createGraphNodeId(target.type, 'definition', target.type);
                    edges.push(
                        this.createGraphEdge(
                            relationNodeId,
                            targetNodeId,
                            'targets',
                            target.relation ? `${target.type}#${target.relation}` : target.type
                        )
                    );
                }
            }

            for (const permission of definition.permissions) {
                const permissionNodeId = this.createGraphNodeId(definition.name, 'permission', permission.name);
                nodes.push({
                    id: permissionNodeId,
                    nodeType: 'permission',
                    label: permission.name,
                    definition: definition.name,
                    name: permission.name,
                    path: `${definition.name}#${permission.name}`
                });
                edges.push(this.createGraphEdge(definitionNodeId, permissionNodeId, 'contains', 'permission'));

                for (const dependency of this.extractPermissionDependencies(definition, permission.expression)) {
                    edges.push(this.createGraphEdge(permissionNodeId, dependency, 'depends_on', 'uses'));
                }
            }
        }

        const uniqueNodes = this.uniqueById(nodes);
        const uniqueEdges = this.uniqueById(edges);

        return {
            nodes: uniqueNodes,
            edges: uniqueEdges,
            stats: {
                nodeCount: uniqueNodes.length,
                edgeCount: uniqueEdges.length
            }
        };
    }

    /**
     * 查询 SpiceDB relationships，直接使用 SpiceDB cursor 分页避免全量读取。
     */
    async listRelationships(query: QuerySpiceDbRelationshipsType) {
        const result = await this.authorizationService.readRelationshipsNative({
            resourceType: query.resourceType,
            resourceId: query.resourceId,
            relation: query.relation,
            pageSize: query.pageSize,
            cursor: query.cursor,
            subject: query.subjectType
                ? {
                      type: query.subjectType,
                      id: query.subjectId,
                      relation: query.subjectRelation
                  }
                : undefined
        });

        return {
            records: result.relationships,
            pagination: {
                pageSize: query.pageSize,
                cursor: query.cursor ?? null,
                nextCursor: result.cursor ?? null,
                hasMore: result.hasMore
            }
        };
    }

    /**
     * 写入单条 SpiceDB relationship，并返回写入后的标准结构。
     */
    async createRelationship(data: WriteSpiceDbRelationshipType): Promise<SpiceDbRelationshipType> {
        const relationship = this.toRelationshipInput(data);

        try {
            const result = await this.authorizationService.touchRelationshipsNative([relationship]);
            await this.repairProjectionAfterRelationshipWrite(
                'OPERATION_TOUCH',
                relationship,
                result.zedToken ?? null,
                data.reason
            );
            return {
                ...relationship,
                zedToken: result.zedToken ?? null
            };
        } catch (error) {
            throw this.createSpiceDbError('写入 SpiceDB relationship 失败', error, { relationship });
        }
    }

    /**
     * 精确删除单条 SpiceDB relationship。
     */
    async deleteRelationship(data: DeleteSpiceDbRelationshipType): Promise<void> {
        const relationship = this.toRelationshipInput(data);

        const result = await this.authorizationService.deleteRelationshipsNative({
            resourceType: relationship.resource.type,
            resourceId: relationship.resource.id,
            relation: relationship.relation,
            subject: relationship.subject
        });
        await this.repairProjectionAfterRelationshipWrite(
            'OPERATION_DELETE',
            relationship,
            result.zedToken ?? null,
            data.reason
        );
    }

    /**
     * 调用 SpiceDB permission check，供运维排查权限推导链路。
     */
    async checkPermission(data: CheckSpiceDbPermissionType) {
        const startedAt = Date.now();
        try {
            const result = await this.authorizationService.checkPermissionNative({
                resource: data.resource,
                permission: data.permission,
                subject: data.subject
            });
            this.metricsService.recordCheckDuration('single_check', 'success', Date.now() - startedAt);
            return attachSpiceDbDebugTraces(
                {
                    resource: data.resource,
                    permission: data.permission,
                    subject: data.subject,
                    permissionship: result.allowed ? 'has_permission' : 'no_permission'
                },
                collectSpiceDbDebugTraces(result)
            );
        } catch (error) {
            this.metricsService.recordCheckDuration('single_check', 'failed', Date.now() - startedAt);
            this.metricsService.recordUpstreamError('single_check');
            throw this.createSpiceDbError('检查 SpiceDB permission 失败', error, data);
        }
    }

    /**
     * 批量调用 SpiceDB permission check，减少运维页和按钮态的 N 次请求。
     */
    async checkBulkPermissions(data: BatchCheckSpiceDbPermissionType) {
        const startedAt = Date.now();
        try {
            const result = await this.authorizationService.checkBulkPermissionsNative({ items: data.items });
            this.metricsService.recordCheckDuration('batch_check', 'success', Date.now() - startedAt);
            return attachSpiceDbDebugTraces(
                {
                    results: data.items.map((item, index) => ({
                        index,
                        resource: item.resource,
                        permission: item.permission,
                        subject: item.subject,
                        permissionship: result.results[index]?.allowed === true ? 'has_permission' : 'no_permission',
                        zedToken: result.results[index]?.zedToken ?? result.zedToken ?? null
                    })),
                    zedToken: result.zedToken ?? null
                },
                collectSpiceDbDebugTraces(result)
            );
        } catch (error) {
            this.metricsService.recordCheckDuration('batch_check', 'failed', Date.now() - startedAt);
            this.metricsService.recordUpstreamError('batch_check');
            throw this.createSpiceDbError('批量检查 SpiceDB permission 失败', error, data);
        }
    }

    /**
     * 解释指定用户为什么能或不能访问目标菜单权限点。
     */
    async explainPermission(data: ExplainSpiceDbPermissionType) {
        const checkedAt = new Date().toISOString();
        const user = await this.prismaService.betterAuthUser.findUnique({
            where: {
                id: data.userId
            }
        });
        const menu = await this.findExplainTargetMenu(data);
        const missingReasons = new Set<SpiceDbPermissionExplainMissingReasonType>();

        if (!user) {
            missingReasons.add('user_not_found');
        }
        if (!menu) {
            missingReasons.add('menu_not_found');
        }

        if (!user || !menu) {
            return {
                userId: data.userId,
                target: this.createExplainTarget(menu),
                spiceDbAllowed: false,
                businessAllowed: false,
                directRolePaths: [],
                groupRolePaths: [],
                systemAdminPath: {
                    viaUser: false,
                    viaRoles: []
                },
                missingReasons: [...missingReasons],
                checkedAt
            };
        }

        const [directRoleRelations, groupMemberRelations, menuRoleRelations, systemAdminRelationships] =
            await Promise.all([
                this.prismaService.spiceDbUserRoleProjection.findMany({
                    where: {
                        userId: data.userId
                    }
                }),
                this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                    where: {
                        userId: data.userId
                    }
                }),
                this.prismaService.spiceDbMenuRoleProjection.findMany({
                    where: {
                        menuId: menu.id,
                        relation: MENU_VIEWER_RELATION
                    }
                }),
                this.readRelationships({
                    resourceType: 'system',
                    resourceId: ADMIN_SYSTEM_ID,
                    relation: 'admin'
                })
            ]);
        const groupIds = groupMemberRelations.map((relation) => relation.groupId);
        const groupRoleRelations =
            groupIds.length === 0
                ? []
                : await this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                      where: {
                          groupId: {
                              in: groupIds
                          }
                      }
                  });
        const roleIds = [
            ...directRoleRelations.map((relation) => relation.roleId),
            ...groupRoleRelations.map((relation) => relation.roleId),
            ...systemAdminRelationships
                .filter((relationship) => relationship.subject.type === 'role')
                .map((relationship) => Number(relationship.subject.id))
                .filter((roleId) => Number.isInteger(roleId))
        ];
        const [roles, groups, pathCheckResult] = await Promise.all([
            this.findRolesByIds(roleIds),
            this.findGroupsByIds(groupIds),
            this.checkExplainPathPermissions(data.userId, menu.id, directRoleRelations, groupMemberRelations, roleIds)
        ]);
        const roleIndex = new Map(roles.map((role) => [role.id, role]));
        const groupIndex = new Map(groups.map((group) => [group.id, group]));
        const menuAuthorizedRoleIds = new Set(menuRoleRelations.map((relation) => relation.roleId));
        const directRolePaths = directRoleRelations.map((relation) => {
            const role = roleIndex.get(relation.roleId);
            const roleEnabled = role?.status === RbacStatus.ENABLE;
            const menuAuthorized = menuAuthorizedRoleIds.has(relation.roleId);

            return {
                roleId: relation.roleId,
                roleName: role?.name ?? `角色已删除#${relation.roleId}`,
                roleCode: role?.code ?? `missing-role-${relation.roleId}`,
                roleEnabled,
                menuAuthorized,
                spiceDbAllowed: pathCheckResult.roleAssigned.get(relation.roleId) === true && menuAuthorized
            };
        });
        const groupRolePaths = groupRoleRelations.map((relation) => {
            const role = roleIndex.get(relation.roleId);
            const group = groupIndex.get(relation.groupId);
            const roleEnabled = role?.status === RbacStatus.ENABLE;
            const groupEnabled = group?.status === RbacStatus.ENABLE;
            const activeMember = pathCheckResult.groupActiveMember.get(relation.groupId) === true;
            const menuAuthorized = menuAuthorizedRoleIds.has(relation.roleId);

            return {
                roleId: relation.roleId,
                roleName: role?.name ?? `角色已删除#${relation.roleId}`,
                roleCode: role?.code ?? `missing-role-${relation.roleId}`,
                roleEnabled,
                menuAuthorized,
                spiceDbAllowed:
                    pathCheckResult.roleAssigned.get(relation.roleId) === true && activeMember && menuAuthorized,
                groupId: relation.groupId,
                groupName: group?.name ?? `用户组已删除#${relation.groupId}`,
                groupCode: group?.code ?? `missing-group-${relation.groupId}`,
                groupEnabled,
                activeMember
            };
        });
        const directAdminUserExists = systemAdminRelationships.some(
            (relationship) => relationship.subject.type === 'user' && relationship.subject.id === data.userId
        );
        const systemAdminRoleIds = new Set(
            systemAdminRelationships
                .filter((relationship) => relationship.subject.type === 'role')
                .map((relationship) => Number(relationship.subject.id))
                .filter((roleId) => Number.isInteger(roleId))
        );
        const systemAdminPath = {
            viaUser: directAdminUserExists && pathCheckResult.systemAdminManageAll,
            viaRoles: [...systemAdminRoleIds].map((roleId) => {
                const role = roleIndex.get(roleId);
                return {
                    roleId,
                    roleName: role?.name ?? `角色已删除#${roleId}`,
                    roleCode: role?.code ?? `missing-role-${roleId}`,
                    roleEnabled: role?.status === RbacStatus.ENABLE,
                    spiceDbAllowed: pathCheckResult.roleAssigned.get(roleId) === true
                };
            })
        };

        if (menu.status !== MenuStatusEnum.ENABLE) {
            missingReasons.add('menu_business_disabled');
        }
        if (directRolePaths.length === 0 && groupRolePaths.length === 0 && !systemAdminPath.viaUser) {
            missingReasons.add('no_role');
        }
        if ([...directRolePaths, ...groupRolePaths].some((path) => !path.roleEnabled)) {
            missingReasons.add('role_disabled');
        }
        if (groupRolePaths.some((path) => !path.groupEnabled || !path.activeMember)) {
            missingReasons.add('group_disabled');
        }
        if (
            directRolePaths.every((path) => !path.menuAuthorized) &&
            groupRolePaths.every((path) => !path.menuAuthorized) &&
            !systemAdminPath.viaUser &&
            systemAdminPath.viaRoles.every((path) => !path.spiceDbAllowed)
        ) {
            missingReasons.add('menu_not_authorized');
        }
        if (!pathCheckResult.menuAllowed) {
            missingReasons.add('spicedb_denied');
        }

        return attachSpiceDbDebugTraces(
            {
                userId: data.userId,
                target: this.createExplainTarget(menu),
                spiceDbAllowed: pathCheckResult.menuAllowed,
                businessAllowed: pathCheckResult.menuAllowed && menu.status === MenuStatusEnum.ENABLE,
                directRolePaths,
                groupRolePaths,
                systemAdminPath,
                missingReasons: [...missingReasons],
                checkedAt
            },
            collectSpiceDbDebugTraces(pathCheckResult)
        );
    }

    /**
     * 检测关系投影表和 SpiceDB 当前关系的差异概况。
     */
    async getProjectionSyncOverview() {
        const [result, cursor, lastRun] = await Promise.all([
            this.projectionService.inspectFullSync(),
            this.getProjectionCursorOverview(),
            this.findLastReconcileRun()
        ]);

        return {
            checkedAt: new Date().toISOString(),
            status: this.resolveProjectionSyncStatus(result.total),
            total: this.createProjectionSyncStats(result.total),
            tables: PROJECTION_TABLES.map((table) => ({
                ...table,
                ...this.createProjectionSyncStats(result[table.key])
            })),
            cursor: {
                cursors: cursor.cursors
            },
            lag: cursor.lag,
            lastEventAt: cursor.lastEventAt,
            lastReconcileAt: lastRun?.finishedAt ?? null
        };
    }

    /**
     * 手动执行关系投影对账。
     */
    async reconcileProjection(data: { mode: 'dry_run' | 'apply' | 'rebuild'; reason: string; zedToken?: string }) {
        return await this.reconcileService.runManualReconcile(data.mode, data.reason, data.zedToken ?? null);
    }

    /**
     * 查询关系投影对账历史。
     */
    async listProjectionReconcileRuns(limit?: number) {
        return asPrismaISODate(await this.reconcileService.listRuns(limit));
    }

    /**
     * 读取草稿 schema 发布预览，包含 hash、下一版本和发布前 diff。
     */
    async getSchemaPublishPreview(draftSchema?: string | null) {
        const [schemaSnapshot, lastSuccessPublication, lastPublication] = await Promise.all([
            this.readSchemaSnapshot(),
            this.findLastSuccessfulSchemaPublication(),
            this.findLastSchemaPublication()
        ]);
        const remoteSchema = schemaSnapshot.schema;
        const resolvedDraftSchema = draftSchema ?? remoteSchema;
        this.assertSchemaValid(resolvedDraftSchema, '草稿');
        const schemaHash = this.createSchemaHash(resolvedDraftSchema);
        const previousSchemaHash = lastSuccessPublication?.schemaHash ?? this.createSchemaHash(remoteSchema);
        const schemaDiff = diffSchema(resolvedDraftSchema, remoteSchema);

        return {
            version: (lastPublication?.version ?? 0) + 1,
            schemaHash,
            previousSchemaHash,
            hasChanges: schemaDiff.hasChanges,
            diffText: schemaDiff.textDiff,
            draftSchema: resolvedDraftSchema,
            remoteSchema,
            rollbackHint: this.createRollbackHint(lastSuccessPublication)
        };
    }

    /**
     * 发布草稿 schema 到 SpiceDB，并记录成功或失败发布记录。
     */
    async publishSchema(data: PublishSpiceDbSchemaType, publishedBy: string) {
        const preview = await this.getSchemaPublishPreview(data.schemaText);
        const now = new Date();
        const publicationBase = {
            id: ulid(),
            version: preview.version,
            schemaHash: preview.schemaHash,
            previousSchemaHash: preview.previousSchemaHash,
            schemaText: preview.draftSchema,
            diffText: preview.diffText,
            publishedBy,
            publishedAt: now,
            reason: data.reason,
            rollbackHint: preview.rollbackHint
        };

        try {
            const result = await this.authorizationService.writeSchemaText(preview.draftSchema);
            return asPrismaISODate(
                await this.prismaService.spiceDbSchemaPublication.create({
                    data: {
                        ...publicationBase,
                        status: 'succeeded',
                        zedToken: result.zedToken ?? null
                    }
                })
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.prismaService.spiceDbSchemaPublication.create({
                data: {
                    ...publicationBase,
                    status: 'failed',
                    zedToken: null,
                    error: message,
                    rollbackHint:
                        preview.rollbackHint ??
                        '未找到上一条成功发布记录，请先从 SpiceDB 远端 schema read 结果人工确认回滚内容。'
                }
            });
            throw this.createSpiceDbError('发布 SpiceDB schema 失败', error, {
                version: preview.version,
                schemaHash: preview.schemaHash
            });
        }
    }

    /**
     * 查询 SpiceDB schema 发布历史。
     */
    async listSchemaPublications() {
        return asPrismaISODate(
            await this.prismaService.spiceDbSchemaPublication.findMany({
                take: 50,
                orderBy: {
                    publishedAt: 'desc'
                }
            })
        );
    }

    /**
     * 解析并预览 Relationship 批量导入差异。
     */
    async previewRelationshipImport(
        data: ImportSpiceDbRelationshipsType
    ): Promise<SpiceDbRelationshipImportPreviewType> {
        const parsed = this.parseRelationshipImportContent(data);
        const validRows = parsed.validRows;
        const existingIndex = await this.createExistingRelationshipIndex(validRows);
        const dedupedRows = this.dedupeImportRows(validRows);
        const toCreate: SpiceDbRelationshipImportPreviewRowType[] = [];
        const toDelete: SpiceDbRelationshipImportPreviewRowType[] = [];
        const skipped: SpiceDbRelationshipImportPreviewRowType[] = [];

        for (const row of dedupedRows) {
            const exists = existingIndex.has(row.key);
            const previewRow = {
                operation: row.operation === 'delete' ? 'delete' : 'touch',
                relationship: row.relationship,
                key: row.key
            } as SpiceDbRelationshipImportPreviewRowType;

            if (row.operation === 'delete') {
                if (exists) {
                    toDelete.push(previewRow);
                } else {
                    skipped.push(previewRow);
                }
                continue;
            }

            if (exists) {
                skipped.push(previewRow);
            } else {
                toCreate.push(previewRow);
            }
        }

        return {
            toCreate,
            toDelete,
            skipped,
            invalidRows: parsed.invalidRows,
            repairScript: this.createRelationshipRepairScript(toCreate, toDelete),
            summary: {
                totalRows: parsed.totalRows,
                createCount: toCreate.length,
                deleteCount: toDelete.length,
                skippedCount: skipped.length,
                invalidCount: parsed.invalidRows.length
            }
        };
    }

    /**
     * 执行 Relationship 批量导入，并在写入后触发一次投影 apply 对账。
     */
    async applyRelationshipImport(data: ImportSpiceDbRelationshipsType) {
        if (!data.reason?.trim()) {
            // 批量写入会改变权限事实，必须记录人工原因便于审计追踪。
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'Relationship 批量导入必须填写 reason'
            });
        }

        const preview = await this.previewRelationshipImport(data);
        if (preview.invalidRows.length > 0) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'Relationship 批量导入存在非法行，已拒绝执行',
                invalidRows: preview.invalidRows
            });
        }

        const updates = [
            ...preview.toCreate.map((row) => ({
                operation: 'touch' as RelationshipOperation,
                relationship: row.relationship
            })),
            ...preview.toDelete.map((row) => ({
                operation: 'delete' as RelationshipOperation,
                relationship: row.relationship
            }))
        ];
        const result = await this.authorizationService.writeRelationshipsNative(updates);
        const repairResult = await this.repairProjectionAfterRelationshipUpdates(
            updates,
            result.zedToken ?? null,
            data.reason
        );
        const reconcileRun =
            updates.length === 0 || repairResult.repaired
                ? null
                : await this.reconcileService.runManualReconcile(
                      'apply',
                      `spicedb relationship bulk import: ${data.reason}`,
                      result.zedToken ?? null
                  );

        return {
            ...preview,
            zedToken: result.zedToken ?? null,
            reconcileRunId: reconcileRun?.runId ?? null
        };
    }

    /**
     * 按当前过滤条件导出 SpiceDB relationships 为 JSON 或 CSV。
     */
    async exportRelationships(query: ExportSpiceDbRelationshipsType) {
        const result = await this.authorizationService.exportRelationshipsNative({
            resourceType: query.resourceType,
            resourceId: query.resourceId,
            relation: query.relation,
            subject: query.subjectType
                ? {
                      type: query.subjectType,
                      id: query.subjectId,
                      relation: query.subjectRelation
                  }
                : undefined
        });
        const rows = result.relationships.map((relationship) =>
            this.toRelationshipResponse(relationship, result.zedToken ?? null)
        );

        return {
            format: query.format,
            filename: `spicedb-relationships-${new Date().toISOString().replace(/[:.]/g, '-')}.${query.format}`,
            content:
                query.format === 'csv'
                    ? this.stringifyRelationshipExportCsv(rows)
                    : JSON.stringify(
                          rows.map((relationship) => this.toRelationshipImportObject('touch', relationship)),
                          null,
                          2
                      ),
            count: rows.length
        };
    }

    /**
     * 查询 Watch/DLQ 事件日志列表，支持 offset、zedToken 和未处理过滤。
     */
    async listWatchEvents(query: QuerySpiceDbWatchEventsType) {
        const where = {
            ...(query.status && { status: query.status }),
            ...(query.zedToken && { zedToken: query.zedToken }),
            ...(query.offset && { offset: query.offset }),
            ...(query.eventKey && { eventKey: query.eventKey }),
            ...(query.onlyUnhandled && { handledAt: null })
        };
        const [total, records] = await Promise.all([
            this.prismaService.spiceDbProjectionEventLog.count({ where }),
            this.prismaService.spiceDbProjectionEventLog.findMany({
                where,
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
                orderBy: {
                    createdAt: 'desc'
                }
            })
        ]);

        return {
            records: asPrismaISODate(records),
            pagination: {
                total,
                page: query.page,
                pageSize: query.pageSize,
                totalPages: Math.ceil(total / query.pageSize)
            }
        };
    }

    /**
     * 查询单条 Watch/DLQ 事件详情。
     */
    async getWatchEvent(id: number) {
        const event = await this.prismaService.spiceDbProjectionEventLog.findUnique({
            where: {
                id
            }
        });
        if (!event) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'Watch 事件不存在',
                id
            });
        }

        return asPrismaISODate(event);
    }

    /**
     * 将 Watch/DLQ 事件原始 payload 重新投递到 Watch events topic。
     */
    async replayWatchEvents(data: ReplaySpiceDbWatchEventsType, userId: string) {
        const events = await this.prismaService.spiceDbProjectionEventLog.findMany({
            where: {
                id: {
                    in: data.ids
                }
            }
        });
        const eventIndex = new Map(events.map((event) => [event.id, event]));
        const failures = data.ids
            .filter((id) => !eventIndex.has(id))
            .map((id) => ({
                id,
                error: '事件不存在'
            }));
        const replayableEvents = events.filter((event) => event.payload !== null);
        const payloadMissingEvents = events.filter((event) => event.payload === null);

        failures.push(
            ...payloadMissingEvents.map((event) => ({
                id: event.id,
                error: '事件 payload 为空，无法回放'
            }))
        );

        if (payloadMissingEvents.length > 0) {
            await this.prismaService.spiceDbProjectionEventLog.updateMany({
                where: {
                    id: {
                        in: payloadMissingEvents.map((event) => event.id)
                    }
                },
                data: {
                    lastReplayAt: new Date(),
                    lastReplayBy: userId,
                    lastReplayStatus: 'failed',
                    lastReplayError: '事件 payload 为空，无法回放'
                }
            });
        }

        if (replayableEvents.length === 0) {
            return {
                affectedCount: 0,
                failedCount: failures.length,
                failures
            };
        }

        try {
            await this.kafkaOpsService.replayWatchMessages(
                replayableEvents.map((event) => ({
                    id: event.id,
                    key: event.eventKey,
                    payload: event.payload
                }))
            );
            await this.prismaService.spiceDbProjectionEventLog.updateMany({
                where: {
                    id: {
                        in: replayableEvents.map((event) => event.id)
                    }
                },
                data: {
                    replayCount: {
                        increment: 1
                    },
                    lastReplayAt: new Date(),
                    lastReplayBy: userId,
                    lastReplayStatus: 'published',
                    lastReplayError: null
                }
            });
            return {
                affectedCount: replayableEvents.length,
                failedCount: failures.length,
                failures
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.prismaService.spiceDbProjectionEventLog.updateMany({
                where: {
                    id: {
                        in: replayableEvents.map((event) => event.id)
                    }
                },
                data: {
                    lastReplayAt: new Date(),
                    lastReplayBy: userId,
                    lastReplayStatus: 'failed',
                    lastReplayError: message
                }
            });
            return {
                affectedCount: 0,
                failedCount: failures.length + replayableEvents.length,
                failures: [
                    ...failures,
                    ...replayableEvents.map((event) => ({
                        id: event.id,
                        error: message
                    }))
                ]
            };
        }
    }

    /**
     * 人工标记 Watch/DLQ 事件已处理，不改变原始 payload。
     */
    async markWatchEventsHandled(data: MarkHandledSpiceDbWatchEventsType, userId: string) {
        const existingEvents = await this.prismaService.spiceDbProjectionEventLog.findMany({
            where: {
                id: {
                    in: data.ids
                }
            },
            select: {
                id: true
            }
        });
        const existingIds = new Set(existingEvents.map((event) => event.id));
        const result = await this.prismaService.spiceDbProjectionEventLog.updateMany({
            where: {
                id: {
                    in: data.ids
                }
            },
            data: {
                handledAt: new Date(),
                handledBy: userId,
                handledReason: data.reason
            }
        });
        const affectedCount = result.count;
        const missingIds = data.ids.filter((id) => !existingIds.has(id));

        return {
            affectedCount,
            failedCount: data.ids.length - affectedCount,
            failures: missingIds.map((id) => ({
                id,
                error: '事件不存在'
            }))
        };
    }

    /**
     * 汇总 SpiceDB 权限链路健康状态和告警建议。
     */
    async getHealthOverview() {
        const checkedAt = new Date().toISOString();
        const thresholds = this.getHealthThresholds();
        const [spiceDbProbe, cursor, unhandledDlqCount, lastReconcileRun, lastZedTokenCursor] = await Promise.all([
            this.probeSpiceDbConnection(),
            this.getProjectionCursorOverview(),
            this.prismaService.spiceDbProjectionEventLog.count({
                where: {
                    status: 'dlq',
                    handledAt: null
                }
            }),
            this.findLastReconcileRun(),
            this.prismaService.spiceDbProjectionCursor.findFirst({
                where: {
                    lastZedToken: {
                        not: null
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            })
        ]);
        const projectionHealth = this.createProjectionHealthSnapshot(lastReconcileRun);
        const driftCount = projectionHealth.driftCount;
        const checkStats = this.metricsService.getCheckStats();
        const alerts = this.createHealthAlerts({
            spiceDbHealthy: spiceDbProbe.healthy,
            lag: cursor.lag,
            unhandledDlqCount,
            driftCount: driftCount ?? 0,
            projectionError: projectionHealth.error,
            checkErrorRate: checkStats.errorRate,
            thresholds
        });

        return {
            checkedAt,
            spicedb: spiceDbProbe,
            kafka: {
                lag: cursor.lag,
                lastEventAt: cursor.lastEventAt,
                lastZedTokenAt: lastZedTokenCursor?.updatedAt ?? null
            },
            dlq: {
                unhandledCount: unhandledDlqCount
            },
            projection: {
                driftCount,
                lastReconcileAt: lastReconcileRun?.finishedAt ?? null,
                lastReconcileStatus: lastReconcileRun?.status ?? null,
                lastCheckedAt: projectionHealth.lastCheckedAt,
                lastMode: projectionHealth.lastMode,
                snapshotStatus: projectionHealth.snapshotStatus
            },
            check: checkStats,
            alerts,
            thresholds
        };
    }

    /**
     * 运维入口写入单条 relationship 后，优先精准修复关系投影，非投影关系退回只读漂移检查。
     */
    private async repairProjectionAfterRelationshipWrite(
        operation: 'OPERATION_TOUCH' | 'OPERATION_DELETE',
        relationship: RelationshipInput,
        zedToken: string | null,
        reason: string
    ): Promise<void> {
        const repairResult = await this.repairProjectionAfterRelationshipUpdates(
            [
                {
                    operation: operation === 'OPERATION_DELETE' ? 'delete' : 'touch',
                    relationship
                }
            ],
            zedToken,
            reason
        );
        if (!repairResult.repaired) {
            await this.reconcileService.runRepairDriftCheck(`spicedb-data relationship write: ${reason}`);
        }
    }

    /**
     * 批量关系写入后按基础关系类型精准修复投影，无法识别或过大批次交给 reconcile apply。
     */
    private async repairProjectionAfterRelationshipUpdates(
        updates: Array<{ operation: RelationshipOperation; relationship: RelationshipInput }>,
        zedToken: string | null,
        reason: string
    ): Promise<ProjectionRepairResult> {
        const repairThreshold = this.getNumberConfig('ADMIN_SPICEDB_TARGETED_REPAIR_THRESHOLD', 500);
        if (updates.length === 0) {
            return {
                repaired: true,
                patchedCount: 0
            };
        }
        if (
            updates.length > repairThreshold ||
            updates.some((update) => !this.isProjectionRelationship(update.relationship))
        ) {
            return {
                repaired: false,
                patchedCount: 0
            };
        }

        const events = updates.map((update) =>
            this.createProjectionRepairEvent(update.operation, update.relationship, zedToken)
        );
        try {
            const patchedCount = await this.projectionService.applyPermissionChangeEvents(events);
            await this.invalidationService.invalidateByProjectionUpdates(events);
            this.logger.info.title('SpiceDB 运维写入已完成精准投影修复', {
                reason,
                patchedCount
            });

            return {
                repaired: true,
                patchedCount
            };
        } catch (error) {
            // SpiceDB 事实已经写入成功，这里只阻断接口并留下待巡检上下文，不能回滚上游事实。
            throw this.createSpiceDbError('SpiceDB relationship 已写入，但精准投影修复失败，请执行投影巡检', error, {
                reason,
                zedToken,
                updates
            });
        }
    }

    /**
     * 判断 relationship 是否属于本地关系投影可精准修复的闭集。
     */
    private isProjectionRelationship(relationship: RelationshipInput): boolean {
        if (
            relationship.resource.type === 'role' &&
            relationship.relation === 'assignee' &&
            relationship.subject.type === 'user'
        ) {
            return true;
        }
        if (
            relationship.resource.type === 'role' &&
            relationship.relation === 'assignee' &&
            relationship.subject.type === 'user_group' &&
            relationship.subject.relation === 'active_member'
        ) {
            return true;
        }
        if (
            relationship.resource.type === 'user_group' &&
            relationship.relation === 'member' &&
            relationship.subject.type === 'user'
        ) {
            return true;
        }
        return (
            relationship.resource.type === 'menu' &&
            (relationship.relation === 'viewer' || relationship.relation === 'manager') &&
            relationship.subject.type === 'role' &&
            relationship.subject.relation === 'assigned'
        );
    }

    /**
     * 将运维写入的 relationship 转换为投影服务复用的 Watch 事件结构。
     */
    private createProjectionRepairEvent(
        operation: RelationshipOperation,
        relationship: RelationshipInput,
        zedToken: string | null
    ) {
        return {
            operation: operation === 'delete' ? 'OPERATION_DELETE' : 'OPERATION_TOUCH',
            resourceType: relationship.resource.type,
            resourceId: relationship.resource.id,
            relation: relationship.relation,
            subjectType: relationship.subject.type,
            subjectId: relationship.subject.id,
            subjectRelation: relationship.subject.relation,
            zedToken: zedToken ?? undefined
        };
    }

    /**
     * 按权限解释入参定位目标菜单，menuId 优先于 permission。
     */
    private async findExplainTargetMenu(data: ExplainSpiceDbPermissionType) {
        if (data.target.menuId) {
            return await this.prismaService.rbacMenu.findUnique({
                where: {
                    id: data.target.menuId
                }
            });
        }

        return await this.prismaService.rbacMenu.findFirst({
            where: {
                requiredPermissionCode: data.target.permission
            },
            orderBy: {
                id: 'asc'
            }
        });
    }

    /**
     * 生成权限解释响应中的菜单目标摘要。
     */
    private createExplainTarget(menu: Awaited<ReturnType<SpiceDbDataService['findExplainTargetMenu']>>) {
        return {
            menuId: menu?.id ?? null,
            permission: menu?.requiredPermissionCode ?? null,
            title: menu?.title ?? null,
            status: menu?.status ?? null,
            type: menu?.type ?? null
        };
    }

    /**
     * 批量查询角色元数据，并过滤重复 ID。
     */
    private async findRolesByIds(roleIds: number[]) {
        const uniqueRoleIds = [...new Set(roleIds)].filter((roleId) => Number.isInteger(roleId) && roleId > 0);
        if (uniqueRoleIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                }
            }
        });
    }

    /**
     * 批量查询用户组元数据，并过滤重复 ID。
     */
    private async findGroupsByIds(groupIds: number[]) {
        const uniqueGroupIds = [...new Set(groupIds)].filter((groupId) => Number.isInteger(groupId) && groupId > 0);
        if (uniqueGroupIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacUserGroup.findMany({
            where: {
                id: {
                    in: uniqueGroupIds
                }
            }
        });
    }

    /**
     * 用 SpiceDB bulk check 验证解释路径中的角色 assigned、用户组 active_member 和系统管理员路径。
     */
    private async checkExplainPathPermissions(
        userId: string,
        menuId: number,
        directRoleRelations: Array<{ roleId: number }>,
        groupMemberRelations: Array<{ groupId: number }>,
        roleIds: number[]
    ) {
        const uniqueRoleIds = [
            ...new Set([...directRoleRelations.map((relation) => relation.roleId), ...roleIds])
        ].filter((roleId) => Number.isInteger(roleId) && roleId > 0);
        const uniqueGroupIds = [...new Set(groupMemberRelations.map((relation) => relation.groupId))].filter(
            (groupId) => Number.isInteger(groupId)
        );
        const roleItems = uniqueRoleIds.map((roleId) => ({
            resource: {
                type: 'role',
                id: String(roleId)
            },
            permission: 'assigned',
            subject: {
                type: 'user',
                id: userId
            }
        }));
        const groupItems = uniqueGroupIds.map((groupId) => ({
            resource: {
                type: 'user_group',
                id: String(groupId)
            },
            permission: 'active_member',
            subject: {
                type: 'user',
                id: userId
            }
        }));
        const systemAdminItem = {
            resource: {
                type: 'system',
                id: ADMIN_SYSTEM_ID
            },
            permission: 'manage_all',
            subject: {
                type: 'user',
                id: userId
            }
        };
        const menuItem = {
            resource: {
                type: 'menu',
                id: String(menuId)
            },
            permission: MENU_VIEW_PERMISSION,
            subject: {
                type: 'user',
                id: userId
            }
        };
        const items = [menuItem, ...roleItems, ...groupItems, systemAdminItem];
        const result = await this.authorizationService.checkBulkPermissionsNative({ items });
        const roleAssigned = new Map<number, boolean>();
        const groupActiveMember = new Map<number, boolean>();

        roleItems.forEach((item, index) => {
            roleAssigned.set(Number(item.resource.id), result.results[index + 1]?.allowed === true);
        });
        groupItems.forEach((item, index) => {
            groupActiveMember.set(
                Number(item.resource.id),
                result.results[1 + roleItems.length + index]?.allowed === true
            );
        });

        return attachSpiceDbDebugTraces(
            {
                menuAllowed: result.results[0]?.allowed === true,
                roleAssigned,
                groupActiveMember,
                systemAdminManageAll: result.results[items.length - 1]?.allowed === true
            },
            collectSpiceDbDebugTraces(result)
        );
    }

    /**
     * 使用 toolkit parser 校验 schema，失败时暴露具体解析错误。
     */
    private assertSchemaValid(schema: string, source: string): void {
        const parsed = parseSchema(schema);
        if (parsed.isValid) {
            return;
        }

        throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
            summary: `${source} SpiceDB schema 解析失败`,
            errors: parsed.errors
        });
    }

    /**
     * 计算 schema 文本的 SHA256 hash。
     */
    private createSchemaHash(schema: string): string {
        return createHash('sha256').update(schema).digest('hex');
    }

    /**
     * 查询上一条成功 schema 发布记录。
     */
    private async findLastSuccessfulSchemaPublication() {
        return await this.prismaService.spiceDbSchemaPublication.findFirst({
            where: {
                status: 'succeeded'
            },
            orderBy: {
                version: 'desc'
            }
        });
    }

    /**
     * 查询最近一条 schema 发布记录，失败记录也会占用版本号。
     */
    private async findLastSchemaPublication() {
        return await this.prismaService.spiceDbSchemaPublication.findFirst({
            orderBy: {
                version: 'desc'
            }
        });
    }

    /**
     * 根据上一成功版本生成失败回滚提示。
     */
    private createRollbackHint(
        publication: Awaited<ReturnType<SpiceDbDataService['findLastSuccessfulSchemaPublication']>>
    ) {
        if (!publication) {
            return null;
        }

        return `可回滚到 schema 发布版本 v${publication.version}（hash: ${publication.schemaHash}），使用该记录的 schemaText 重新发布。`;
    }

    /**
     * 解析 JSON 或 CSV Relationship 导入内容，并收集非法行。
     */
    private parseRelationshipImportContent(data: ImportSpiceDbRelationshipsType): {
        validRows: SpiceDbRelationshipImportRow[];
        invalidRows: SpiceDbRelationshipImportPreviewType['invalidRows'];
        totalRows: number;
    } {
        const rawRows =
            data.format === 'csv'
                ? this.parseRelationshipImportCsv(data.content)
                : this.parseRelationshipImportJson(data.content);
        const validRows: SpiceDbRelationshipImportRow[] = [];
        const invalidRows: SpiceDbRelationshipImportPreviewType['invalidRows'] = [];

        rawRows.forEach((raw, index) => {
            const rowNumber = index + 1;
            const parsed = this.toRelationshipImportRow(raw, rowNumber);
            if ('error' in parsed) {
                invalidRows.push({
                    row: rowNumber,
                    reason: parsed.error,
                    raw
                });
                return;
            }
            validRows.push(parsed.row);
        });

        return {
            validRows,
            invalidRows,
            totalRows: rawRows.length
        };
    }

    /**
     * 使用 csv-parse 解析 Relationship CSV 文本。
     */
    private parseRelationshipImportCsv(content: string): SpiceDbRelationshipRawImportRow[] {
        try {
            return parseCsv(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            }) as SpiceDbRelationshipRawImportRow[];
        } catch (error) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'Relationship CSV 导入内容解析失败',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 解析 Relationship JSON 文本，支持数组或 { items/relationships } 包装。
     */
    private parseRelationshipImportJson(content: string): SpiceDbRelationshipRawImportRow[] {
        let parsed: unknown;
        try {
            parsed = JSON.parse(content) as unknown;
        } catch (error) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'Relationship JSON 导入内容解析失败',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        if (Array.isArray(parsed)) {
            return parsed as SpiceDbRelationshipRawImportRow[];
        }
        if (parsed && typeof parsed === 'object') {
            const objectValue = parsed as { items?: unknown; relationships?: unknown };
            const rows = objectValue.items ?? objectValue.relationships;
            if (Array.isArray(rows)) {
                return rows as SpiceDbRelationshipRawImportRow[];
            }
        }

        throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
            summary: 'Relationship JSON 导入内容必须是数组或包含 items/relationships 数组'
        });
    }

    /**
     * 将原始导入行转换为标准 relationship，并做必填字段校验。
     */
    private toRelationshipImportRow(
        raw: SpiceDbRelationshipRawImportRow,
        sourceRow: number
    ): { row: SpiceDbRelationshipImportRow } | { error: string } {
        const operation = this.toTrimmedString(raw.operation);
        const resourceType = this.toTrimmedString(raw.resourceType);
        const resourceId = this.toTrimmedString(raw.resourceId);
        const relation = this.toTrimmedString(raw.relation);
        const subjectType = this.toTrimmedString(raw.subjectType);
        const subjectId = this.toTrimmedString(raw.subjectId);
        const subjectRelation = this.toTrimmedString(raw.subjectRelation) || undefined;

        if (operation !== 'touch' && operation !== 'delete') {
            return { error: 'operation 必须是 touch 或 delete' };
        }
        if (!resourceType || !resourceId || !relation || !subjectType || !subjectId) {
            return { error: 'resourceType、resourceId、relation、subjectType、subjectId 均为必填项' };
        }

        const relationship = {
            resource: {
                type: resourceType,
                id: resourceId
            },
            relation,
            subject: {
                type: subjectType,
                id: subjectId,
                relation: subjectRelation
            }
        };

        return {
            row: {
                operation,
                relationship,
                key: this.createRelationshipKey(relationship),
                sourceRow
            }
        };
    }

    /**
     * 把未知值安全转换为 trim 后的字符串。
     */
    private toTrimmedString(value: unknown): string {
        return typeof value === 'string'
            ? value.trim()
            : value === undefined || value === null
              ? ''
              : String(value).trim();
    }

    /**
     * 按 relationship key 去重，保留后出现的运维意图。
     */
    private dedupeImportRows(rows: SpiceDbRelationshipImportRow[]): SpiceDbRelationshipImportRow[] {
        return [...new Map(rows.map((row) => [row.key, row])).values()];
    }

    /**
     * 根据导入行精确读取当前关系并构造存在性索引，避免按 resourceType 全量导出。
     */
    private async createExistingRelationshipIndex(rows: SpiceDbRelationshipImportRow[]): Promise<Set<string>> {
        const dedupedRows = this.dedupeImportRows(rows);
        if (dedupedRows.length === 0) {
            return new Set();
        }

        const existingKeys = new Set<string>();
        for (const rowChunk of this.chunk(dedupedRows, 50)) {
            const pages = await Promise.all(
                rowChunk.map((row) =>
                    this.authorizationService.readRelationshipsNative({
                        resourceType: row.relationship.resource.type,
                        resourceId: row.relationship.resource.id,
                        relation: row.relationship.relation,
                        subject: {
                            type: row.relationship.subject.type,
                            id: row.relationship.subject.id,
                            relation: row.relationship.subject.relation
                        },
                        pageSize: 1
                    })
                )
            );
            pages
                .flatMap((page) => page.relationships)
                .forEach((relationship) => existingKeys.add(this.createRelationshipKey(relationship)));
        }

        return existingKeys;
    }

    /**
     * 生成可人工复核执行的 zed relationship 修复脚本。
     */
    private createRelationshipRepairScript(
        toCreate: SpiceDbRelationshipImportPreviewRowType[],
        toDelete: SpiceDbRelationshipImportPreviewRowType[]
    ): string {
        const lines = [
            ...toCreate.map((row) => `zed relationship create ${formatRelationship(row.relationship)}`),
            ...toDelete.map((row) => `zed relationship delete ${formatRelationship(row.relationship)}`)
        ];

        return lines.join('\n');
    }

    /**
     * 生成 JSON/CSV 导出使用的扁平 Relationship 对象。
     */
    private toRelationshipImportObject(operation: RelationshipOperation, relationship: SpiceDbRelationshipType) {
        return {
            operation,
            resourceType: relationship.resource.type,
            resourceId: relationship.resource.id,
            relation: relationship.relation,
            subjectType: relationship.subject.type,
            subjectId: relationship.subject.id,
            subjectRelation: relationship.subject.relation ?? ''
        };
    }

    /**
     * 使用 csv-stringify 输出 Relationship CSV。
     */
    private stringifyRelationshipExportCsv(relationships: SpiceDbRelationshipType[]): string {
        return stringifyCsv(
            relationships.map((relationship) => this.toRelationshipImportObject('touch', relationship)),
            {
                header: true,
                columns: [
                    'operation',
                    'resourceType',
                    'resourceId',
                    'relation',
                    'subjectType',
                    'subjectId',
                    'subjectRelation'
                ]
            }
        );
    }

    /**
     * 探测 SpiceDB 连接健康状态，并记录 Prometheus gauge 与耗时指标。
     */
    private async probeSpiceDbConnection() {
        const startedAt = Date.now();
        try {
            await this.authorizationService.readSchemaText();
            const latencyMs = Date.now() - startedAt;
            this.metricsService.setConnectionHealth(true);
            this.metricsService.recordCheckDuration('health_probe', 'success', latencyMs);
            return {
                healthy: true,
                latencyMs,
                error: null
            };
        } catch (error) {
            const latencyMs = Date.now() - startedAt;
            const message = error instanceof Error ? error.message : String(error);
            this.metricsService.setConnectionHealth(false);
            this.metricsService.recordCheckDuration('health_probe', 'failed', latencyMs);
            this.metricsService.recordUpstreamError('health_probe');
            return {
                healthy: false,
                latencyMs,
                error: message
            };
        }
    }

    /**
     * 从最近一次 reconcile run 生成健康页投影快照，避免每次打开页面都做全量漂移检查。
     */
    private createProjectionHealthSnapshot(lastRun: any): {
        driftCount: number | null;
        error: string | null;
        lastCheckedAt: string | null;
        lastMode: string | null;
        snapshotStatus: string | null;
    } {
        const totalStats = lastRun?.totalStats as ProjectionReconcileStats | null | undefined;
        return {
            driftCount: totalStats ? totalStats.missingCount + totalStats.staleCount : null,
            error: lastRun?.status === 'failed' ? (lastRun.error ?? 'projection health snapshot failed') : null,
            lastCheckedAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
            lastMode: lastRun?.mode ?? null,
            snapshotStatus: lastRun?.status ?? null
        };
    }

    /**
     * 读取健康告警阈值，环境变量未设置时使用方案中约定的默认值。
     */
    private getHealthThresholds() {
        return {
            lagWarn: this.getNumberConfig(HEALTH_THRESHOLD_ENV.lagWarn, 1000),
            dlqWarn: this.getNumberConfig(HEALTH_THRESHOLD_ENV.dlqWarn, 1),
            driftWarn: this.getNumberConfig(HEALTH_THRESHOLD_ENV.driftWarn, 1),
            checkErrorRateWarn: this.getNumberConfig(HEALTH_THRESHOLD_ENV.checkErrorRateWarn, 0.05)
        };
    }

    /**
     * 读取数字环境变量，不合法时使用明确的运维默认阈值。
     */
    private getNumberConfig(key: string, defaultValue: number): number {
        const value = Number(this.configService.get<string>(key, String(defaultValue)));
        return Number.isFinite(value) ? value : defaultValue;
    }

    /**
     * 根据健康指标生成页面直接展示的告警建议。
     */
    private createHealthAlerts(input: {
        spiceDbHealthy: boolean;
        lag: number;
        unhandledDlqCount: number;
        driftCount: number;
        projectionError: string | null;
        checkErrorRate: number;
        thresholds: ReturnType<SpiceDbDataService['getHealthThresholds']>;
    }) {
        const alerts: Array<{ key: string; level: 'info' | 'warning' | 'critical'; message: string }> = [];

        if (!input.spiceDbHealthy) {
            alerts.push({
                key: 'spicedb_connection_failed',
                level: 'critical',
                message: 'SpiceDB 探测失败，请检查连接配置和上游服务状态。'
            });
        }
        if (input.projectionError) {
            alerts.push({
                key: 'projection_health_failed',
                level: 'critical',
                message: `projection drift 检测失败：${input.projectionError}`
            });
        }
        if (input.driftCount >= input.thresholds.driftWarn) {
            alerts.push({
                key: 'projection_drift',
                level: 'warning',
                message: `projection drift 数量为 ${input.driftCount}，建议执行 apply 对账。`
            });
        }
        if (input.unhandledDlqCount >= input.thresholds.dlqWarn) {
            alerts.push({
                key: 'dlq_unhandled',
                level: 'warning',
                message: `未处理 DLQ 数量为 ${input.unhandledDlqCount}，建议查看 DLQ / Watch 回放。`
            });
        }
        if (input.lag >= input.thresholds.lagWarn) {
            alerts.push({
                key: 'consumer_lag',
                level: 'warning',
                message: `Kafka consumer lag 为 ${input.lag}，超过阈值 ${input.thresholds.lagWarn}。`
            });
        }
        if (input.checkErrorRate >= input.thresholds.checkErrorRateWarn) {
            alerts.push({
                key: 'check_error_rate',
                level: 'warning',
                message: `SpiceDB check 错误率为 ${(input.checkErrorRate * 100).toFixed(2)}%。`
            });
        }

        return alerts;
    }

    /**
     * 从本地投影游标表读取消费进度。
     */
    private async getProjectionCursorOverview() {
        const cursors = asPrismaISODate(
            await this.prismaService.spiceDbProjectionCursor.findMany({
                orderBy: {
                    partition: 'asc'
                }
            })
        );
        const latestCursor = cursors
            .filter((cursor) => cursor.lastEventAt)
            .sort((left, right) => (right.lastEventAt ?? '').localeCompare(left.lastEventAt ?? ''))[0];

        return {
            cursors: cursors.map((cursor) => ({
                topic: cursor.topic,
                partition: cursor.partition,
                consumerGroup: cursor.consumerGroup,
                lastOffset: cursor.lastOffset,
                lastEventKey: cursor.lastEventKey,
                lastZedToken: cursor.lastZedToken,
                lastEventAt: cursor.lastEventAt,
                lastProcessedAt: cursor.lastProcessedAt,
                lag: cursor.lag.toString()
            })),
            lag: cursors.reduce((sum, cursor) => sum + Number(cursor.lag), 0),
            lastEventAt: latestCursor?.lastEventAt ?? null
        };
    }

    /**
     * 查询最近一次已结束的关系投影对账任务。
     */
    private async findLastReconcileRun() {
        return asPrismaISODate(
            await this.prismaService.spiceDbProjectionReconcileRun.findFirst({
                where: {
                    finishedAt: {
                        not: null
                    }
                },
                orderBy: {
                    finishedAt: 'desc'
                }
            })
        );
    }

    /**
     * 将投影差异统计转换成 overview 需要的结构。
     */
    private createProjectionSyncStats(stats: ProjectionReconcileStats): SpiceDbProjectionSyncStatsType {
        return {
            ...stats,
            synced: this.resolveProjectionSyncStatus(stats) === 'synced'
        };
    }

    /**
     * 根据缺失和陈旧数量判断投影是否同步。
     */
    private resolveProjectionSyncStatus(stats: ProjectionReconcileStats): SpiceDbProjectionSyncStatusType {
        return stats.missingCount === 0 && stats.staleCount === 0 ? 'synced' : 'drifted';
    }

    /**
     * 通过授权服务读取 SpiceDB relationships。
     */
    private async readRelationships(filter: {
        resourceType: string;
        resourceId?: string;
        relation?: string;
        subject?: { type: string; id?: string; relation?: string };
    }): Promise<SpiceDbRelationshipType[]> {
        try {
            const result = await this.authorizationService.readRelationshipsNative(filter);
            return (result.relationships ?? []).map((relationship: SpiceDbRelationshipOutput) =>
                this.toRelationshipResponse(relationship, result.zedToken ?? null)
            );
        } catch (error) {
            throw this.createSpiceDbError('读取 SpiceDB relationships 失败', error, { filter });
        }
    }

    /**
     * 按过滤器删除 SpiceDB relationships。
     */
    private async deleteRelationshipsByFilter(filter: {
        resourceType: string;
        resourceId?: string;
        relation?: string;
        subject?: { type: string; id?: string; relation?: string };
    }): Promise<void> {
        try {
            await this.authorizationService.deleteRelationshipsNative(filter);
        } catch (error) {
            throw this.createSpiceDbError('删除 SpiceDB relationships 失败', error, { filter });
        }
    }

    /**
     * 将写入请求转换为 SpiceDB relationship 输入。
     */
    private toRelationshipInput(data: WriteSpiceDbRelationshipType): SpiceDbRelationshipType {
        return {
            resource: data.resource,
            relation: data.relation,
            subject: data.subject
        };
    }

    /**
     * 将 SpiceDB relationship 输出标准化为 API 响应。
     */
    private toRelationshipResponse(
        relationship: SpiceDbRelationshipOutput,
        zedToken: string | null
    ): SpiceDbRelationshipType {
        return {
            resource: {
                type: relationship.resource.type,
                id: relationship.resource.id
            },
            relation: relationship.relation,
            subject: {
                type: relationship.subject.type,
                id: relationship.subject.id,
                relation: relationship.subject.relation
            },
            zedToken: relationship.zedToken ?? zedToken
        };
    }

    /**
     * 为 relationship 生成稳定 key，供批量导入 diff 使用。
     */
    private createRelationshipKey(relationship: RelationshipInput | SpiceDbRelationshipOutput): string {
        return [
            relationship.resource.type,
            relationship.resource.id,
            relationship.relation,
            relationship.subject.type,
            relationship.subject.id,
            relationship.subject.relation ?? ''
        ].join(':');
    }

    /**
     * 使用 toolkit parser 解析 SpiceDB schema definition/relation/permission。
     */
    private parseSchemaDefinitions(schema: string): SpiceDbSchemaDefinitionType[] {
        const parsed = parseSchema(schema);
        if (!parsed.isValid || !parsed.schema) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'SpiceDB schema 解析失败',
                errors: parsed.errors
            });
        }

        return parsed.schema.definitions
            .filter((definition): definition is any => definition.kind === 'objectDef')
            .map((definition) => ({
                name: definition.name,
                relations: definition.relations.map((relation) => ({
                    name: relation.name,
                    targets: relation.allowedTypes.types.map((target) => ({
                        type: target.path,
                        relation: target.relationName ?? (target.wildcard ? '*' : undefined)
                    }))
                })),
                permissions: definition.permissions.map((permission) => ({
                    name: permission.name,
                    expression: this.createSchemaExpressionText(
                        schema,
                        permission.expr as SpiceDbSchemaParsedExpression
                    )
                }))
            }));
    }

    /**
     * 根据 parser range 从 schema 原文截取 permission 表达式。
     */
    private createSchemaExpressionText(schema: string, expression: SpiceDbSchemaParsedExpression): string {
        const startOffset = expression.range?.startIndex?.offset;
        const endOffset = expression.range?.endIndex?.offset;
        if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset <= startOffset) {
            throw new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
                summary: 'SpiceDB schema parser 未返回 permission expression range'
            });
        }

        return schema.slice(startOffset, endOffset).trim();
    }

    /**
     * 从 permission 表达式中提取当前 definition 下的依赖节点。
     */
    private extractPermissionDependencies(definition: SpiceDbSchemaDefinitionType, expression: string): string[] {
        const relationNames = new Set(definition.relations.map((relation) => relation.name));
        const permissionNames = new Set(definition.permissions.map((permission) => permission.name));
        const tokenPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
        const dependencies: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = tokenPattern.exec(expression)) !== null) {
            const token = match[0];
            if (relationNames.has(token)) {
                dependencies.push(this.createGraphNodeId(definition.name, 'relation', token));
            }
            if (permissionNames.has(token)) {
                dependencies.push(this.createGraphNodeId(definition.name, 'permission', token));
            }
        }

        return [...new Set(dependencies)];
    }

    /**
     * 生成 schema graph 节点 ID。
     */
    private createGraphNodeId(definition: string, nodeType: string, name: string): string {
        return `${definition}:${nodeType}:${name}`;
    }

    /**
     * 生成 schema graph 边。
     */
    private createGraphEdge(
        source: string,
        target: string,
        edgeType: 'contains' | 'targets' | 'depends_on',
        label: string
    ): SpiceDbSchemaGraphEdgeTypeDtoType {
        return {
            id: `${source}->${target}:${edgeType}:${label}`,
            edgeType,
            source,
            target,
            label
        };
    }

    /**
     * 根据 id 对 graph 节点或边去重。
     */
    private uniqueById<T extends { id: string }>(items: T[]): T[] {
        return [...new Map(items.map((item) => [item.id, item])).values()];
    }

    /**
     * 将数组按固定大小拆块，避免批量精确读取时一次性打满上游。
     */
    private chunk<T>(items: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }

    /**
     * 统一包装 SpiceDB 上游错误并记录上下文。
     */
    private createSpiceDbError(summary: string, error: unknown, context?: Record<string, any>) {
        if (error instanceof BusinessException) {
            return error;
        }

        const message = error instanceof Error ? error.message : String(error);
        // 保留完整 detail 调用：SpiceDB 下游错误摘要是关键调试断点（design §8.2），需要保留 message / context 完整字段
        this.logger.error(summary, {
            message,
            context
        });

        return new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
            summary,
            message,
            ...context
        });
    }
}
