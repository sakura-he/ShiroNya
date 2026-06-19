import { AuditLog } from '@app/common';
import { ApiOkResByZod } from '@app/common/decorators/api-res.decorator';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    BatchCheckSpiceDbPermissionDto,
    BatchCheckSpiceDbPermissionSchema,
    CheckSpiceDbPermissionDto,
    CheckSpiceDbPermissionSchema,
    DeleteSpiceDbRelationshipDto,
    DeleteSpiceDbRelationshipSchema,
    ExportSpiceDbRelationshipsDto,
    ExportSpiceDbRelationshipsSchema,
    ExplainSpiceDbPermissionDto,
    ExplainSpiceDbPermissionSchema,
    ImportSpiceDbRelationshipsDto,
    ImportSpiceDbRelationshipsSchema,
    MarkHandledSpiceDbWatchEventsDto,
    MarkHandledSpiceDbWatchEventsSchema,
    PreviewSpiceDbSchemaPublishDto,
    PreviewSpiceDbSchemaPublishSchema,
    PublishSpiceDbSchemaDto,
    PublishSpiceDbSchemaSchema,
    QuerySpiceDbProjectionReconcileRunsDto,
    QuerySpiceDbProjectionReconcileRunsSchema,
    QuerySpiceDbRelationshipsDto,
    QuerySpiceDbRelationshipsSchema,
    QuerySpiceDbWatchEventsDto,
    QuerySpiceDbWatchEventsSchema,
    ReplaySpiceDbWatchEventsDto,
    ReplaySpiceDbWatchEventsSchema,
    SpiceDbHealthOverviewDto,
    SpiceDbNullDto,
    SpiceDbPermissionBatchCheckResultDto,
    SpiceDbPermissionCheckResultDto,
    SpiceDbPermissionExplainResultDto,
    SpiceDbProjectionReconcileRequestDto,
    SpiceDbProjectionReconcileRequestSchema,
    SpiceDbProjectionReconcileResultDto,
    SpiceDbProjectionReconcileRunListDto,
    SpiceDbProjectionSyncOverviewDto,
    SpiceDbRelationshipExportResultDto,
    SpiceDbRelationshipImportApplyResultDto,
    SpiceDbRelationshipImportPreviewDto,
    SpiceDbRelationshipDto,
    SpiceDbRelationshipPageDto,
    SpiceDbSchemaPublicationDto,
    SpiceDbSchemaPublicationListDto,
    SpiceDbSchemaPublishPreviewDto,
    SpiceDbSchemaGraphResponseDto,
    SpiceDbSchemaResponseDto,
    SpiceDbWatchEventDto,
    SpiceDbWatchEventOperationResultDto,
    SpiceDbWatchEventPageDto,
    WriteSpiceDbRelationshipDto,
    WriteSpiceDbRelationshipSchema
} from './dto/spicedb-data.dto';
import { SpiceDbDataService } from './spicedb-data.service';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';

/**
 * SpiceDB 数据管理控制器，负责 schema、关系和关系投影运维接口。
 */
@ApiTags('SpiceDB Data')
@Controller('system/spicedb-data')
export class SpiceDbDataController {
    /**
     * 注入 SpiceDB 数据管理服务。
     */
    constructor(private readonly spiceDbDataService: SpiceDbDataService) {}

    /**
     * 返回当前仓库的 SpiceDB schema。
     */
    @RbacPermission('system.spicedb.view')
    @Get('schema')
    @ApiOkResByZod({ summary: '获取 SpiceDB schema', type: SpiceDbSchemaResponseDto })
    async getSchema() {
        return await this.spiceDbDataService.getSchema();
    }

    /**
     * 返回远端 schema 草稿发布前预览。
     */
    @RbacPermission('system.spicedb.view')
    @Post('schema/publish-preview')
    @ApiOkResByZod({ summary: '预览 SpiceDB schema 发布', type: SpiceDbSchemaPublishPreviewDto })
    async getSchemaPublishPreview(
        @Body(new ZodValidationPipe(PreviewSpiceDbSchemaPublishSchema)) data: PreviewSpiceDbSchemaPublishDto
    ) {
        return await this.spiceDbDataService.getSchemaPublishPreview(data.schemaText);
    }

    /**
     * 发布草稿 schema 到 SpiceDB。
     */
    @RbacPermission('system.spicedb.publish-schema')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'publish_schema',
        summary: '发布 SpiceDB schema',
        resourceType: 'spicedb_schema'
    })
    @Post('schema/publish')
    @ApiOkResByZod({ summary: '发布 SpiceDB schema', type: SpiceDbSchemaPublicationDto })
    async publishSchema(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(PublishSpiceDbSchemaSchema)) data: PublishSpiceDbSchemaDto
    ) {
        return await this.spiceDbDataService.publishSchema(data, session.user.id);
    }

    /**
     * 查询 SpiceDB schema 发布历史。
     */
    @RbacPermission('system.spicedb.view')
    @Get('schema/publications')
    @ApiOkResByZod({ summary: '查询 SpiceDB schema 发布历史', type: SpiceDbSchemaPublicationListDto })
    async getSchemaPublications() {
        return await this.spiceDbDataService.listSchemaPublications();
    }

    /**
     * 返回当前 SpiceDB schema graph 数据。
     */
    @RbacPermission('system.spicedb.view')
    @Get('graph')
    @ApiOkResByZod({ summary: '获取 SpiceDB schema graph', type: SpiceDbSchemaGraphResponseDto })
    async getSchemaGraph() {
        return await this.spiceDbDataService.getSchemaGraph();
    }

    /**
     * 检测关系投影表与 SpiceDB 当前全量数据的一致性概况。
     */
    @RbacPermission('system.spicedb.view')
    @Get('projection-sync/overview')
    @ApiOkResByZod({ summary: '检测 SpiceDB 关系投影同步概况', type: SpiceDbProjectionSyncOverviewDto })
    async getProjectionSyncOverview() {
        return await this.spiceDbDataService.getProjectionSyncOverview();
    }

    /**
     * 手动触发关系投影对账或重建。
     */
    @RbacPermission('system.spicedb.reconcile-projection')
    @Post('projection-sync/reconcile')
    @ApiOkResByZod({ summary: '执行 SpiceDB 关系投影对账', type: SpiceDbProjectionReconcileResultDto })
    async reconcileProjection(
        @Body(new ZodValidationPipe(SpiceDbProjectionReconcileRequestSchema))
        data: SpiceDbProjectionReconcileRequestDto
    ) {
        return await this.spiceDbDataService.reconcileProjection(data);
    }

    /**
     * 查询关系投影对账任务历史。
     */
    @RbacPermission('system.spicedb.view')
    @Get('projection-sync/runs')
    @ApiOkResByZod({ summary: '查询 SpiceDB 关系投影对账历史', type: SpiceDbProjectionReconcileRunListDto })
    async getProjectionReconcileRuns(
        @Query(new ZodValidationPipe(QuerySpiceDbProjectionReconcileRunsSchema))
        query: QuerySpiceDbProjectionReconcileRunsDto
    ) {
        return await this.spiceDbDataService.listProjectionReconcileRuns(query.limit);
    }

    /**
     * 查询 SpiceDB relationship 列表。
     */
    @RbacPermission('system.spicedb.view')
    @Post('relationships/query')
    @ApiOkResByZod({ summary: '分页查询 SpiceDB relationships', type: SpiceDbRelationshipPageDto })
    async getRelationships(
        @Body(new ZodValidationPipe(QuerySpiceDbRelationshipsSchema)) query: QuerySpiceDbRelationshipsDto
    ) {
        return await this.spiceDbDataService.listRelationships(query);
    }

    /**
     * 新增或 touch 单条 SpiceDB relationship。
     */
    @RbacPermission('system.spicedb.create-relationship')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'write_relationship',
        summary: '写入 SpiceDB relationship',
        resourceType: 'spicedb_relationship'
    })
    @Post('relationships')
    @ApiOkResByZod({ summary: '写入 SpiceDB relationship', type: SpiceDbRelationshipDto })
    async createRelationship(
        @Body(new ZodValidationPipe(WriteSpiceDbRelationshipSchema)) data: WriteSpiceDbRelationshipDto
    ) {
        return await this.spiceDbDataService.createRelationship(data);
    }

    /**
     * 精确删除单条 SpiceDB relationship。
     */
    @RbacPermission('system.spicedb.delete-relationship')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'delete_relationship',
        summary: '删除 SpiceDB relationship',
        resourceType: 'spicedb_relationship'
    })
    @Post('relationships/delete')
    @ApiOkResByZod({ summary: '删除 SpiceDB relationship', type: SpiceDbNullDto })
    async deleteRelationship(
        @Body(new ZodValidationPipe(DeleteSpiceDbRelationshipSchema)) data: DeleteSpiceDbRelationshipDto
    ) {
        await this.spiceDbDataService.deleteRelationship(data);
        return null;
    }

    /**
     * 预览 JSON/CSV relationship 批量导入差异。
     */
    @RbacPermission('system.spicedb.bulk-relationship')
    @Post('relationships/import/preview')
    @ApiOkResByZod({ summary: '预览 SpiceDB relationship 批量导入', type: SpiceDbRelationshipImportPreviewDto })
    async previewRelationshipImport(
        @Body(new ZodValidationPipe(ImportSpiceDbRelationshipsSchema)) data: ImportSpiceDbRelationshipsDto
    ) {
        return await this.spiceDbDataService.previewRelationshipImport(data);
    }

    /**
     * 执行 JSON/CSV relationship 批量导入。
     */
    @RbacPermission('system.spicedb.bulk-relationship')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'bulk_import_relationship',
        summary: '批量导入 SpiceDB relationship',
        resourceType: 'spicedb_relationship'
    })
    @Post('relationships/import/apply')
    @ApiOkResByZod({ summary: '执行 SpiceDB relationship 批量导入', type: SpiceDbRelationshipImportApplyResultDto })
    async applyRelationshipImport(
        @Body(new ZodValidationPipe(ImportSpiceDbRelationshipsSchema)) data: ImportSpiceDbRelationshipsDto
    ) {
        return await this.spiceDbDataService.applyRelationshipImport(data);
    }

    /**
     * 导出当前过滤条件下的 SpiceDB relationships。
     */
    @RbacPermission('system.spicedb.view')
    @Post('relationships/export')
    @ApiOkResByZod({ summary: '导出 SpiceDB relationships', type: SpiceDbRelationshipExportResultDto })
    async exportRelationships(
        @Body(new ZodValidationPipe(ExportSpiceDbRelationshipsSchema)) query: ExportSpiceDbRelationshipsDto
    ) {
        return await this.spiceDbDataService.exportRelationships(query);
    }

    /**
     * 检查指定 subject 是否拥有 resource 上的 permission。
     */
    @RbacPermission('system.spicedb.check-permission')
    @Post('permissions/check')
    @ApiOkResByZod({ summary: '检查 SpiceDB permission', type: SpiceDbPermissionCheckResultDto })
    async checkPermission(@Body(new ZodValidationPipe(CheckSpiceDbPermissionSchema)) data: CheckSpiceDbPermissionDto) {
        return await this.spiceDbDataService.checkPermission(data);
    }

    /**
     * 批量检查指定 subject 是否拥有多组 permission。
     */
    @RbacPermission('system.spicedb.batch-check-permission')
    @Post('permissions/batch-check')
    @ApiOkResByZod({ summary: '批量检查 SpiceDB permission', type: SpiceDbPermissionBatchCheckResultDto })
    async checkBulkPermissions(
        @Body(new ZodValidationPipe(BatchCheckSpiceDbPermissionSchema)) data: BatchCheckSpiceDbPermissionDto
    ) {
        return await this.spiceDbDataService.checkBulkPermissions(data);
    }

    /**
     * 解释用户访问目标菜单权限点的命中路径和缺失原因。
     */
    @RbacPermission('system.spicedb.explain-permission')
    @Post('permissions/explain')
    @ApiOkResByZod({ summary: '解释 SpiceDB permission 命中原因', type: SpiceDbPermissionExplainResultDto })
    async explainPermission(
        @Body(new ZodValidationPipe(ExplainSpiceDbPermissionSchema)) data: ExplainSpiceDbPermissionDto
    ) {
        return await this.spiceDbDataService.explainPermission(data);
    }

    /**
     * 查询 Watch/DLQ 事件日志。
     */
    @RbacPermission('system.spicedb.view')
    @Post('watch-events/query')
    @ApiOkResByZod({ summary: '查询 SpiceDB Watch 事件日志', type: SpiceDbWatchEventPageDto })
    async getWatchEvents(
        @Body(new ZodValidationPipe(QuerySpiceDbWatchEventsSchema)) query: QuerySpiceDbWatchEventsDto
    ) {
        return await this.spiceDbDataService.listWatchEvents(query);
    }

    /**
     * 查询单条 Watch/DLQ 事件详情。
     */
    @RbacPermission('system.spicedb.view')
    @Get('watch-events/:id')
    @ApiOkResByZod({ summary: '查询 SpiceDB Watch 事件详情', type: SpiceDbWatchEventDto })
    async getWatchEvent(@Param('id') id: string) {
        return await this.spiceDbDataService.getWatchEvent(Number(id));
    }

    /**
     * 回放 Watch/DLQ 事件。
     */
    @RbacPermission('system.spicedb.replay-watch')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'replay_watch_event',
        summary: '回放 SpiceDB Watch 事件',
        resourceType: 'spicedb_watch_event'
    })
    @Post('watch-events/replay')
    @ApiOkResByZod({ summary: '回放 SpiceDB Watch 事件', type: SpiceDbWatchEventOperationResultDto })
    async replayWatchEvents(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(ReplaySpiceDbWatchEventsSchema)) data: ReplaySpiceDbWatchEventsDto
    ) {
        return await this.spiceDbDataService.replayWatchEvents(data, session.user.id);
    }

    /**
     * 人工标记 Watch/DLQ 事件已处理。
     */
    @RbacPermission('system.spicedb.handle-watch')
    @AuditLog({
        module: 'system_spicedb_data',
        action: 'mark_watch_event_handled',
        summary: '标记 SpiceDB Watch 事件已处理',
        resourceType: 'spicedb_watch_event'
    })
    @Post('watch-events/mark-handled')
    @ApiOkResByZod({ summary: '标记 SpiceDB Watch 事件已处理', type: SpiceDbWatchEventOperationResultDto })
    async markWatchEventsHandled(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(MarkHandledSpiceDbWatchEventsSchema)) data: MarkHandledSpiceDbWatchEventsDto
    ) {
        return await this.spiceDbDataService.markWatchEventsHandled(data, session.user.id);
    }

    /**
     * 返回 SpiceDB 权限健康看板数据。
     */
    @RbacPermission('system.spicedb.view')
    @Get('health')
    @ApiOkResByZod({ summary: '获取 SpiceDB 权限健康看板', type: SpiceDbHealthOverviewDto })
    async getHealthOverview() {
        return await this.spiceDbDataService.getHealthOverview();
    }
}
