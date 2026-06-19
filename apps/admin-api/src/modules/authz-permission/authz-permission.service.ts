import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import type { RbacRole } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { Traceable } from 'nestjs-otel';
import {
    AdminSpiceDbAuthorizationService,
    type CoreManagerRelation
} from '../spicedb/admin-spicedb-authorization.service';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS, type RbacPermissionCode } from '../system/rbac/rbac-permissions';
import {
    CORE_MANAGER_RELATION_LABELS,
    TASK_MANAGER_CAPABILITY_RELATIONS,
    TASK_MANAGER_RESOURCE_RELATIONS,
    TASK_MANAGER_RESOURCE_TYPE
} from '../spicedb/core-manager-authz.constants';
import type { SpiceDbSchemaDefinitionType } from '../system/spicedb-data/dto/spicedb-data.dto';
import { SpiceDbDataService } from '../system/spicedb-data/spicedb-data.service';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import type {
    ApplyAuthzPermissionMatrixType,
    AuthzPermissionCoreManagerResourceType,
    PreviewAuthzPermissionMatrixType,
    RenameAuthzPermissionResourceType
} from './dto/authz-permission.dto';

const AUTHZ_PERMISSION_MATRIX_LARGE_CHANGE_TUPLE_THRESHOLD = 20;
const AUTHZ_PERMISSION_MATRIX_LARGE_CHANGE_USER_THRESHOLD = 50;
const AUTHZ_PERMISSION_MATRIX_SAMPLE_LIMIT = 20;

type AuthzPermissionRoleRecord = Pick<RbacRole, 'id' | 'name' | 'code' | 'description' | 'status'>;

type RbacRoleImpactSummary = {
    affectedUserEstimate: number;
    affectedGroupCount: number;
    directUserAssignmentCount: number;
};

type ViewerRoleCapabilities = AuthzPermissionRoleRecord & {
    viewerCanUpdate: boolean;
    viewerCanAssignTaskCapability: boolean;
    viewerCanAssignTaskResource: boolean;
};

type ResourceRoleBindingRow = {
    resourceType: string;
    resourceId: string;
    roleId: number;
};

type AuthzResourceMetadataRow = {
    resourceType: string;
    displayName: string;
    authorizationEnabled: boolean | null;
};

type AssignableSchemaRelation = {
    relation: string;
    label: string;
};

type NormalizedMatrixChange = {
    resourceType: AuthzPermissionCoreManagerResourceType;
    relation: CoreManagerRelation;
    previousRoleIds: number[];
    nextRoleIds: number[];
    createRoleIds: number[];
    deleteRoleIds: number[];
};

type MatrixPreview = {
    normalizedChanges: NormalizedMatrixChange[];
    impactMode: 'summary' | 'precise';
    createCount: number;
    deleteCount: number;
    affectedRoleCount: number;
    affectedUserCount: number | null;
    affectedGroupCount: number;
    directUserAssignmentCount: number;
    affectedUserEstimate: number;
    affectedRolesSample: ViewerRoleCapabilities[];
    affectedUsersSample: Array<{ id: string; username: string | null; name: string }>;
    confirmationReasons: string[];
    requiresConfirmation: boolean;
};

/**
 * 提供独立权限管理页所需的 SpiceDB 实体权限矩阵和核心 manager 授权写入能力。
 */
@Traceable()
@Injectable()
export class AuthzPermissionService {
    private readonly logger = createRuntimeLogger(AuthzPermissionService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'permission' }
    });

    /**
     * 注入 schema 探测、授权校验、源表写入和用户状态刷新依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly spiceDbDataService: SpiceDbDataService,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly adminUserStateService: AdminUserStateService
    ) {}

    /**
     * 汇总当前 schema definition、核心 manager 可配置关系、角色列表和授权状态。
     */
    async getMatrix(actorId: string) {
        const [schemaResult, roles, bindings] = await Promise.all([
            this.spiceDbDataService.getSchema(),
            this.loadRolesWithViewerCapabilities(actorId),
            this.loadAuthzResourceBindingRows()
        ]);
        const resourceMetadataIndex = await this.loadResourceMetadataIndex(schemaResult.definitions);
        const roleIdSet = new Set(roles.map((role) => role.id));
        const managerModules = this.createManagerModules(
            schemaResult.definitions,
            roles,
            new Map(),
            resourceMetadataIndex
        );
        const supportedRelationIndex = this.createSupportedRelationIndex(managerModules);
        const bindingIndex = this.createBindingIndex(bindings, roleIdSet, supportedRelationIndex);

        return {
            definitions: schemaResult.definitions.map((definition) => ({
                ...definition,
                configurable: this.isAuthorizationConfigurableDefinition(definition, resourceMetadataIndex),
                displayName: this.getResourceDisplayName(resourceMetadataIndex, definition.name),
                authorizationEnabled: this.getResourceAuthorizationEnabled(resourceMetadataIndex, definition.name)
            })),
            roles,
            modules: this.createManagerModules(schemaResult.definitions, roles, bindingIndex, resourceMetadataIndex)
        };
    }

    /**
     * 重命名权限管理页中 SpiceDB 实体的展示名，不修改 SpiceDB schema 内的真实实体名。
     */
    async renameResource(data: RenameAuthzPermissionResourceType, actorId: string) {
        const schemaResult = await this.spiceDbDataService.getSchema();
        const resourceType = data.resourceType.trim();
        const displayName = data.displayName.trim();
        const authorizationEnabled = data.authorizationEnabled;
        const definition = schemaResult.definitions.find((item) => item.name === resourceType);

        if (!definition) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType
            });
        }
        if (authorizationEnabled === true) {
            this.assertDefinitionSupportsAuthorization(definition);
        }
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE);

        await this.prismaService.authzResourceMetadata.upsert({
            where: {
                resourceType
            },
            create: {
                resourceType,
                displayName,
                authorizationEnabled:
                    authorizationEnabled ?? this.isSchemaDefinitionAuthorizationShapeSupported(definition)
            },
            update: {
                displayName,
                ...(authorizationEnabled === undefined ? {} : { authorizationEnabled })
            }
        });

        return await this.getMatrix(actorId);
    }

    /**
     * 预览权限矩阵批量变更，只校验快照和计算影响范围，不写源表或 SpiceDB。
     */
    async previewMatrixChanges(data: PreviewAuthzPermissionMatrixType, actorId: string) {
        void actorId;
        return await this.buildMatrixPreview(data);
    }

    /**
     * 应用权限矩阵批量变更，并在 SpiceDB 同步失败时回滚源表和关系快照。
     */
    async applyMatrixChanges(data: ApplyAuthzPermissionMatrixType, actorId: string) {
        const preview = await this.buildMatrixPreview(data);
        await this.assertCanApplyMatrixChanges(preview.normalizedChanges, actorId);

        if (preview.requiresConfirmation && data.confirmedLargeChange !== true) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                reason: 'large_authz_permission_matrix_change_requires_confirmation',
                createCount: preview.createCount,
                deleteCount: preview.deleteCount,
                affectedUserCount: preview.affectedUserCount,
                affectedUserEstimate: preview.affectedUserEstimate,
                confirmationReasons: preview.confirmationReasons
            });
        }

        if (preview.createCount + preview.deleteCount === 0) {
            return await this.getMatrix(actorId);
        }

        const resourceRelations = await this.loadSupportedRelationsByResource(preview.normalizedChanges);
        const affectedRoleIdsByResource = this.createAffectedRoleIdsByResource(preview.normalizedChanges);
        const previousRelationsByResourceRole = await this.loadRoleRelationSnapshotsByResource(
            resourceRelations,
            affectedRoleIdsByResource
        );
        const nextRelationsByResourceRole = this.createNextRoleRelationSnapshots(
            previousRelationsByResourceRole,
            resourceRelations,
            preview.normalizedChanges
        );

        await this.replaceMatrixChangeSourceRows(preview.normalizedChanges, 'next');
        try {
            await this.syncRoleAuthzResourceRelationSnapshots(resourceRelations, nextRelationsByResourceRole);
        } catch (error) {
            try {
                await this.replaceMatrixChangeSourceRows(preview.normalizedChanges, 'previous');
            } catch (rollbackError) {
                // 源表回滚失败也不能吞掉最初的 SpiceDB 同步错误，日志里保留补偿失败细节。
                this.logger.error('权限矩阵源表回滚失败', {
                    cause: error,
                    rollbackError
                });
            }
            await this.rollbackRoleAuthzResourceRelationSnapshots(
                resourceRelations,
                previousRelationsByResourceRole,
                error
            );
            throw error;
        }

        const affectedRoles = await this.findRolesByIds(
            this.normalizeRoleIds(
                preview.normalizedChanges.flatMap((change) => [...change.createRoleIds, ...change.deleteRoleIds])
            )
        );
        await this.bumpAffectedRoleVersions(affectedRoles);
        return await this.getMatrix(actorId);
    }

    /**
     * 构造权限矩阵变更预览，并校验请求快照与当前源表一致。
     */
    private async buildMatrixPreview(data: PreviewAuthzPermissionMatrixType): Promise<MatrixPreview> {
        const schemaResult = await this.spiceDbDataService.getSchema();
        const resourceMetadataIndex = await this.loadResourceMetadataIndex(schemaResult.definitions);
        const currentRows = await this.loadAuthzResourceBindingRows();
        const normalizedChanges = this.normalizeMatrixChanges(
            data,
            schemaResult.definitions,
            resourceMetadataIndex,
            currentRows
        );
        const involvedRoleIds = this.normalizeRoleIds(
            normalizedChanges.flatMap((change) => [...change.previousRoleIds, ...change.nextRoleIds])
        );
        const changedRoleIds = this.normalizeRoleIds(
            normalizedChanges.flatMap((change) => [...change.createRoleIds, ...change.deleteRoleIds])
        );
        const involvedRoles = await this.findRolesByIds(involvedRoleIds);
        const involvedRoleIndex = new Map(involvedRoles.map((role) => [role.id, role]));
        const changedRoles = await this.loadRolesByIdsWithCapabilities(changedRoleIds);
        const createCount = normalizedChanges.reduce((count, change) => count + change.createRoleIds.length, 0);
        const deleteCount = normalizedChanges.reduce((count, change) => count + change.deleteRoleIds.length, 0);
        const impactMode = data.impactMode ?? 'summary';
        const roleImpactSummary = await this.createRbacRoleImpactSummary(changedRoleIds);
        const affectedUserIds = impactMode === 'precise' ? await this.resolveAffectedUserIds(changedRoleIds) : [];
        const affectedUsersSample = impactMode === 'precise' ? await this.loadAffectedUserSample(affectedUserIds) : [];
        const affectedUserCount = impactMode === 'precise' ? affectedUserIds.length : null;
        const affectedUserEstimate =
            impactMode === 'precise' ? affectedUserIds.length : roleImpactSummary.affectedUserEstimate;
        const confirmationReasons = this.createMatrixConfirmationReasons(
            createCount,
            deleteCount,
            affectedUserEstimate
        );

        this.assertRolesExist(involvedRoleIds, involvedRoleIndex);

        return {
            normalizedChanges,
            impactMode,
            createCount,
            deleteCount,
            affectedRoleCount: changedRoleIds.length,
            affectedUserCount,
            affectedGroupCount: roleImpactSummary.affectedGroupCount,
            directUserAssignmentCount: roleImpactSummary.directUserAssignmentCount,
            affectedUserEstimate,
            affectedRolesSample: changedRoles.slice(0, AUTHZ_PERMISSION_MATRIX_SAMPLE_LIMIT),
            affectedUsersSample,
            confirmationReasons,
            requiresConfirmation: confirmationReasons.length > 0
        };
    }

    /**
     * 根据 tuple 增量和用户影响估算生成大变更确认原因。
     */
    private createMatrixConfirmationReasons(
        createCount: number,
        deleteCount: number,
        affectedUserEstimate: number
    ): string[] {
        const reasons: string[] = [];
        if (createCount + deleteCount > AUTHZ_PERMISSION_MATRIX_LARGE_CHANGE_TUPLE_THRESHOLD) {
            reasons.push('tuple_change_threshold_exceeded');
        }
        if (affectedUserEstimate > AUTHZ_PERMISSION_MATRIX_LARGE_CHANGE_USER_THRESHOLD) {
            reasons.push('affected_user_threshold_exceeded');
        }
        return reasons;
    }

    /**
     * 规整批量矩阵变更，并校验 relation 白名单、重复项和 previousRoleIds 快照。
     */
    private normalizeMatrixChanges(
        data: PreviewAuthzPermissionMatrixType,
        definitions: SpiceDbSchemaDefinitionType[],
        resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>,
        currentRows: ResourceRoleBindingRow[]
    ): NormalizedMatrixChange[] {
        const definitionIndex = new Map(definitions.map((definition) => [definition.name, definition]));
        const currentRoleIndex = this.createCurrentRoleIdsByRelationIndex(currentRows);
        const seenKeys = new Set<string>();

        return data.changes.map((change) => {
            const definition = definitionIndex.get(change.resourceType);
            if (!definition) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    resourceType: change.resourceType
                });
            }
            this.assertSupportedAuthorizationRelation(definition, resourceMetadataIndex, change.relation);

            const key = this.createManagerRelationKey(change.resourceType, change.relation);
            if (seenKeys.has(key)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    reason: 'duplicate_authz_permission_matrix_relation',
                    resourceType: change.resourceType,
                    relation: change.relation
                });
            }
            seenKeys.add(key);

            const previousRoleIds = this.normalizeRoleIds(change.previousRoleIds);
            const nextRoleIds = this.normalizeRoleIds(change.nextRoleIds);
            const currentRoleIds = currentRoleIndex.get(key) ?? [];
            if (!this.areRoleIdsEqual(previousRoleIds, currentRoleIds)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    reason: 'authz_permission_matrix_snapshot_conflict',
                    resourceType: change.resourceType,
                    relation: change.relation,
                    currentRoleIds,
                    previousRoleIds
                });
            }

            return {
                resourceType: change.resourceType,
                relation: change.relation,
                previousRoleIds,
                nextRoleIds,
                createRoleIds: this.diffRoleIds(nextRoleIds, previousRoleIds),
                deleteRoleIds: this.diffRoleIds(previousRoleIds, nextRoleIds)
            };
        });
    }

    /**
     * 校验当前操作者具备本次关系矩阵变更所需的 RBAC 全局权限。
     */
    private async assertCanApplyMatrixChanges(changes: NormalizedMatrixChange[], actorId: string): Promise<void> {
        const permissionCodes = new Set<RbacPermissionCode>();
        for (const change of changes) {
            if (change.createRoleIds.length + change.deleteRoleIds.length > 0) {
                permissionCodes.add(this.resolveMatrixUpdatePermissionCode(change.resourceType, change.relation));
            }
        }

        await Promise.all(
            [...permissionCodes].map((code) => this.rbacAuthorizationService.assertPermission(actorId, code))
        );
    }

    /**
     * 按资源类型加载本次变更涉及的 schema 支持 relation 集合。
     */
    private async loadSupportedRelationsByResource(
        changes: NormalizedMatrixChange[]
    ): Promise<Map<AuthzPermissionCoreManagerResourceType, string[]>> {
        const schemaResult = await this.spiceDbDataService.getSchema();
        const resourceMetadataIndex = await this.loadResourceMetadataIndex(schemaResult.definitions);
        const definitionIndex = new Map(schemaResult.definitions.map((definition) => [definition.name, definition]));
        const result = new Map<AuthzPermissionCoreManagerResourceType, string[]>();

        for (const resourceType of this.normalizeResourceTypes(changes.map((change) => change.resourceType))) {
            const definition = definitionIndex.get(resourceType);
            if (!definition) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    resourceType
                });
            }
            if (!this.isAuthorizationConfigurableDefinition(definition, resourceMetadataIndex)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    resourceType
                });
            }
            result.set(
                resourceType as AuthzPermissionCoreManagerResourceType,
                this.createAssignableRelations(definition).map((relation) => relation.relation)
            );
        }

        return result;
    }

    /**
     * 统计每个资源类型下本次发生变化的角色集合。
     */
    private createAffectedRoleIdsByResource(
        changes: NormalizedMatrixChange[]
    ): Map<AuthzPermissionCoreManagerResourceType, number[]> {
        const result = new Map<AuthzPermissionCoreManagerResourceType, number[]>();
        for (const change of changes) {
            result.set(
                change.resourceType,
                this.normalizeRoleIds([
                    ...(result.get(change.resourceType) ?? []),
                    ...change.createRoleIds,
                    ...change.deleteRoleIds
                ])
            );
        }
        return result;
    }

    /**
     * 按资源和角色加载应用前的完整 relation 快照。
     */
    private async loadRoleRelationSnapshotsByResource(
        resourceRelations: Map<AuthzPermissionCoreManagerResourceType, string[]>,
        roleIdsByResource: Map<AuthzPermissionCoreManagerResourceType, number[]>
    ): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();

        for (const [resourceType, roleIds] of roleIdsByResource.entries()) {
            const supportedRelations = resourceRelations.get(resourceType) ?? [];
            const snapshot = await this.loadRoleAuthzResourceRelationsForRoleIds(
                roleIds,
                resourceType,
                supportedRelations
            );
            for (const [roleId, relations] of snapshot.entries()) {
                result.set(this.createResourceRoleKey(resourceType, roleId), relations);
            }
        }

        return result;
    }

    /**
     * 基于变更前快照和批量变更计算应用后的角色 relation 快照。
     */
    private createNextRoleRelationSnapshots(
        previousSnapshots: Map<string, string[]>,
        resourceRelations: Map<AuthzPermissionCoreManagerResourceType, string[]>,
        changes: NormalizedMatrixChange[]
    ): Map<string, string[]> {
        const nextSnapshots = new Map(previousSnapshots);

        for (const change of changes) {
            const supportedRelations = resourceRelations.get(change.resourceType) ?? [];
            for (const roleId of change.deleteRoleIds) {
                const key = this.createResourceRoleKey(change.resourceType, roleId);
                const relationSet = new Set(nextSnapshots.get(key) ?? []);
                relationSet.delete(change.relation);
                nextSnapshots.set(key, this.normalizeAuthzResourceRelations(supportedRelations, [...relationSet]));
            }
            for (const roleId of change.createRoleIds) {
                const key = this.createResourceRoleKey(change.resourceType, roleId);
                const relationSet = new Set(nextSnapshots.get(key) ?? []);
                relationSet.add(change.relation);
                nextSnapshots.set(key, this.normalizeAuthzResourceRelations(supportedRelations, [...relationSet]));
            }
        }

        return nextSnapshots;
    }

    /**
     * 在一个事务内把本次变更涉及的源表 relation 替换为指定快照。
     */
    private async replaceMatrixChangeSourceRows(
        changes: NormalizedMatrixChange[],
        snapshot: 'previous' | 'next'
    ): Promise<void> {
        await this.prismaService.$transaction(async (tx) => {
            for (const change of changes) {
                const roleIds = snapshot === 'next' ? change.nextRoleIds : change.previousRoleIds;
                await tx.authzResourceRoleBinding.deleteMany({
                    where: {
                        resourceType: change.resourceType,
                        resourceId: change.relation
                    }
                });
                if (roleIds.length > 0) {
                    await tx.authzResourceRoleBinding.createMany({
                        data: roleIds.map((roleId) => ({
                            resourceType: change.resourceType,
                            resourceId: change.relation,
                            roleId
                        })),
                        skipDuplicates: true
                    });
                }
            }
        });
    }

    /**
     * 把资源角色快照同步到 SpiceDB manager 单例关系。
     */
    private async syncRoleAuthzResourceRelationSnapshots(
        resourceRelations: Map<AuthzPermissionCoreManagerResourceType, string[]>,
        snapshots: Map<string, string[]>
    ): Promise<void> {
        await Promise.all(
            [...snapshots.entries()].map(([key, relations]) => {
                const { resourceType, roleId } = this.parseResourceRoleKey(key);
                return this.spiceDbAuthorizationService.replaceRoleAuthzResourceRelations(
                    roleId,
                    resourceType,
                    relations,
                    resourceRelations.get(resourceType) ?? []
                );
            })
        );
    }

    /**
     * SpiceDB 同步失败后尽力恢复变更前关系，并保留原始错误作为主错误。
     */
    private async rollbackRoleAuthzResourceRelationSnapshots(
        resourceRelations: Map<AuthzPermissionCoreManagerResourceType, string[]>,
        previousSnapshots: Map<string, string[]>,
        cause: unknown
    ): Promise<void> {
        try {
            await this.syncRoleAuthzResourceRelationSnapshots(resourceRelations, previousSnapshots);
        } catch (rollbackError) {
            // 保留 detail：SpiceDB 回滚失败需要把原始 cause 和 rollbackError 的 stack 完整写入文件日志。
            this.logger.error('权限矩阵 SpiceDB 回滚失败', {
                cause,
                rollbackError
            });
        }
    }

    /**
     * 读取当前 schema definition 的实体元数据；缺失值会按 schema 结构补齐初始授权开关。
     */
    private async loadResourceMetadataIndex(
        definitions: SpiceDbSchemaDefinitionType[]
    ): Promise<Map<string, AuthzResourceMetadataRow>> {
        const definitionIndex = new Map(definitions.map((definition) => [definition.name, definition]));
        const uniqueResourceTypes = this.normalizeResourceTypes(definitions.map((definition) => definition.name));
        if (uniqueResourceTypes.length === 0) {
            return new Map();
        }

        const existingRows = await this.findResourceMetadataRows(uniqueResourceTypes);
        const existingResourceTypeSet = new Set(existingRows.map((row) => row.resourceType));
        const missingResourceTypes = uniqueResourceTypes.filter(
            (resourceType) => !existingResourceTypeSet.has(resourceType)
        );

        if (missingResourceTypes.length > 0) {
            await this.prismaService.authzResourceMetadata.createMany({
                data: missingResourceTypes.map((resourceType) => ({
                    resourceType,
                    displayName: resourceType,
                    authorizationEnabled: this.isSchemaDefinitionAuthorizationShapeSupported(
                        this.getSchemaDefinition(definitionIndex, resourceType)
                    )
                })),
                skipDuplicates: true
            });
        }

        let rows =
            missingResourceTypes.length > 0 ? await this.findResourceMetadataRows(uniqueResourceTypes) : existingRows;
        const rowsNeedAuthorizationInitialization = rows.filter((row) => row.authorizationEnabled === null);

        if (rowsNeedAuthorizationInitialization.length > 0) {
            await Promise.all(
                rowsNeedAuthorizationInitialization.map((row) =>
                    this.prismaService.authzResourceMetadata.update({
                        where: {
                            resourceType: row.resourceType
                        },
                        data: {
                            authorizationEnabled: this.isSchemaDefinitionAuthorizationShapeSupported(
                                this.getSchemaDefinition(definitionIndex, row.resourceType)
                            )
                        }
                    })
                )
            );
            rows = await this.findResourceMetadataRows(uniqueResourceTypes);
        }

        const metadataIndex = new Map(rows.map((row) => [row.resourceType, row]));
        const stillMissingResourceTypes = uniqueResourceTypes.filter(
            (resourceType) => !metadataIndex.has(resourceType)
        );

        if (stillMissingResourceTypes.length > 0) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                missingResourceTypes: stillMissingResourceTypes
            });
        }

        return metadataIndex;
    }

    /**
     * 批量查询实体展示名元数据。
     */
    private async findResourceMetadataRows(resourceTypes: string[]): Promise<AuthzResourceMetadataRow[]> {
        return await this.prismaService.authzResourceMetadata.findMany({
            where: {
                resourceType: {
                    in: resourceTypes
                }
            },
            select: {
                resourceType: true,
                displayName: true,
                authorizationEnabled: true
            },
            orderBy: {
                resourceType: 'asc'
            }
        });
    }

    /**
     * 查询全部角色，并附加当前用户对每个目标角色的授权编辑能力。
     */
    private async loadRolesWithViewerCapabilities(actorId: string): Promise<ViewerRoleCapabilities[]> {
        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                deletedAt: null
            },
            select: {
                id: true,
                name: true,
                code: true,
                description: true,
                status: true
            },
            orderBy: [
                {
                    sort: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        if (roles.length === 0) {
            return [];
        }

        const [canUpdatePermission, canAssignTaskCapability, canAssignTaskResource] = await Promise.all([
            this.rbacAuthorizationService.checkPermission(actorId, RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE),
            this.rbacAuthorizationService.checkPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY),
            this.rbacAuthorizationService.checkPermission(actorId, RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE)
        ]);

        return roles.map((role) => ({
            ...role,
            viewerCanUpdate: canUpdatePermission,
            viewerCanAssignTaskCapability: canUpdatePermission && canAssignTaskCapability,
            viewerCanAssignTaskResource: canUpdatePermission && canAssignTaskResource
        }));
    }

    /**
     * 读取权限管理授权源表的全部记录，并按数据库启用的资源和当前 schema 关系过滤。
     */
    private async loadAuthzResourceBindingRows(): Promise<ResourceRoleBindingRow[]> {
        return await this.prismaService.authzResourceRoleBinding.findMany({
            select: {
                resourceType: true,
                resourceId: true,
                roleId: true
            },
            orderBy: [
                {
                    resourceType: 'asc'
                },
                {
                    resourceId: 'asc'
                },
                {
                    roleId: 'asc'
                }
            ]
        });
    }

    /**
     * 将源表记录整理成 resourceType/relation 到 roleIds 的索引，并过滤当前系统已不存在的角色。
     */
    private createBindingIndex(
        bindings: ResourceRoleBindingRow[],
        roleIdSet: Set<number>,
        supportedRelationIndex: Map<string, Set<string>>
    ) {
        const bindingIndex = new Map<string, number[]>();

        for (const binding of bindings) {
            if (!roleIdSet.has(binding.roleId)) {
                continue;
            }
            const supportedRelations = supportedRelationIndex.get(binding.resourceType);
            if (!supportedRelations) {
                continue;
            }
            if (!supportedRelations.has(binding.resourceId)) {
                continue;
            }

            const key = this.createManagerRelationKey(binding.resourceType, binding.resourceId);
            bindingIndex.set(key, [...(bindingIndex.get(key) ?? []), binding.roleId]);
        }

        return bindingIndex;
    }

    /**
     * 将源表记录按 resourceType/relation 整理成当前角色快照索引。
     */
    private createCurrentRoleIdsByRelationIndex(bindings: ResourceRoleBindingRow[]): Map<string, number[]> {
        const index = new Map<string, number[]>();
        for (const binding of bindings) {
            const key = this.createManagerRelationKey(binding.resourceType, binding.resourceId);
            index.set(key, this.normalizeRoleIds([...(index.get(key) ?? []), binding.roleId]));
        }
        return index;
    }

    /**
     * 根据数据库启用状态、schema 关系、角色编辑能力和源表索引生成可配置授权矩阵。
     */
    private createManagerModules(
        definitions: SpiceDbSchemaDefinitionType[],
        roles: ViewerRoleCapabilities[],
        bindingIndex: Map<string, number[]>,
        resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>
    ) {
        return definitions
            .filter((definition) => this.isAuthorizationConfigurableDefinition(definition, resourceMetadataIndex))
            .map((definition) => ({
                resourceType: definition.name,
                displayName: this.getResourceDisplayName(resourceMetadataIndex, definition.name),
                relations: this.createAssignableRelations(definition).map(({ relation, label }) => ({
                    relation,
                    label,
                    roleIds: bindingIndex.get(this.createManagerRelationKey(definition.name, relation)) ?? [],
                    editableRoleIds: roles
                        .filter((role) => this.canEditRoleManagerRelation(role, definition.name, relation))
                        .map((role) => role.id)
                }))
            }));
    }

    /**
     * 判断当前用户是否可以为目标角色编辑指定 manager relation。
     */
    private canEditRoleManagerRelation(role: ViewerRoleCapabilities, resourceType: string, relation: string) {
        if (resourceType !== TASK_MANAGER_RESOURCE_TYPE) {
            return role.viewerCanUpdate;
        }
        if (TASK_MANAGER_CAPABILITY_RELATIONS.has(relation as CoreManagerRelation)) {
            return role.viewerCanAssignTaskCapability;
        }
        if (TASK_MANAGER_RESOURCE_RELATIONS.has(relation as CoreManagerRelation)) {
            return role.viewerCanAssignTaskResource;
        }
        return false;
    }

    /**
     * 按角色 ID 查询角色元数据，用于存在性校验和状态版本刷新。
     */
    private async findRolesByIds(roleIds: number[]): Promise<AuthzPermissionRoleRecord[]> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return [];
        }

        return await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                deletedAt: null
            },
            select: {
                id: true,
                name: true,
                code: true,
                description: true,
                status: true
            },
            orderBy: {
                id: 'asc'
            }
        });
    }

    /**
     * 按角色 ID 查询角色并补齐当前用户能力字段的默认结构，用于预览样例返回。
     */
    private async loadRolesByIdsWithCapabilities(roleIds: number[]): Promise<ViewerRoleCapabilities[]> {
        const roles = await this.findRolesByIds(roleIds);
        return roles.map((role) => ({
            ...role,
            viewerCanUpdate: false,
            viewerCanAssignTaskCapability: false,
            viewerCanAssignTaskResource: false
        }));
    }

    /**
     * 校验本次请求涉及的角色 ID 全部真实存在。
     */
    private assertRolesExist(roleIds: number[], roleIndex: Map<number, AuthzPermissionRoleRecord>): void {
        const missingRoleIds = roleIds.filter((roleId) => !roleIndex.has(roleId));
        if (missingRoleIds.length > 0) {
            throw new BusinessException(ErrorCodes.ROLE.NOT_FOUND_IDS(missingRoleIds.join(',')));
        }
    }

    /**
     * 按变更角色解析所有受影响用户 ID。
     */
    private async resolveAffectedUserIds(roleIds: number[]): Promise<string[]> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return [];
        }
        const rows = await this.prismaService.rbacEffectiveUserRole.findMany({
            where: {
                roleId: {
                    in: uniqueRoleIds
                }
            },
            select: {
                userId: true
            }
        });
        return [...new Set(rows.map((row) => row.userId))].sort();
    }

    /**
     * 查询受影响用户样例，供前端预览弹窗展示。
     */
    private async loadAffectedUserSample(
        userIds: string[]
    ): Promise<Array<{ id: string; username: string | null; name: string }>> {
        const sampleIds = userIds.slice(0, AUTHZ_PERMISSION_MATRIX_SAMPLE_LIMIT);
        if (sampleIds.length === 0) {
            return [];
        }

        return await this.prismaService.betterAuthUser.findMany({
            where: {
                id: {
                    in: sampleIds
                }
            },
            select: {
                id: true,
                username: true,
                name: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
    }

    /**
     * 根据 RBAC 全局权限码判断当前用户是否能编辑指定关系矩阵。
     */
    private resolveMatrixUpdatePermissionCode(resourceType: string, relation: string): RbacPermissionCode {
        if (resourceType !== TASK_MANAGER_RESOURCE_TYPE) {
            return RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE;
        }
        if (TASK_MANAGER_CAPABILITY_RELATIONS.has(relation as CoreManagerRelation)) {
            return RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY;
        }
        if (TASK_MANAGER_RESOURCE_RELATIONS.has(relation as CoreManagerRelation)) {
            return RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE;
        }
        throw new BusinessException(ErrorCodes.PARAM.INVALID, {
            resourceType,
            relation
        });
    }

    /**
     * 基于 RBAC effective 读模型估算受影响用户。
     */
    private async createRbacRoleImpactSummary(roleIds: number[]): Promise<RbacRoleImpactSummary> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return {
                affectedUserEstimate: 0,
                affectedGroupCount: 0,
                directUserAssignmentCount: 0
            };
        }

        const [directUserRows, groupRows, effectiveUserRows] = await Promise.all([
            this.prismaService.rbacUserRole.findMany({
                where: {
                    roleId: {
                        in: uniqueRoleIds
                    }
                },
                select: {
                    userId: true
                }
            }),
            this.prismaService.rbacUserGroupRole.findMany({
                where: {
                    roleId: {
                        in: uniqueRoleIds
                    }
                },
                select: {
                    groupId: true
                }
            }),
            this.prismaService.rbacEffectiveUserRole.findMany({
                where: {
                    roleId: {
                        in: uniqueRoleIds
                    }
                },
                select: {
                    userId: true
                }
            })
        ]);

        return {
            affectedUserEstimate: new Set(effectiveUserRows.map((row) => row.userId)).size,
            affectedGroupCount: new Set(groupRows.map((row) => row.groupId)).size,
            directUserAssignmentCount: new Set(directUserRows.map((row) => row.userId)).size
        };
    }

    /**
     * 批量读取角色在指定授权资源下的完整 relation 集合，并按当前 schema 支持关系过滤。
     */
    private async loadRoleAuthzResourceRelationsForRoleIds(
        roleIds: number[],
        resourceType: string,
        supportedRelations: string[]
    ): Promise<Map<number, string[]>> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        const result = new Map(uniqueRoleIds.map((roleId) => [roleId, [] as string[]]));
        if (uniqueRoleIds.length === 0) {
            return result;
        }
        const supportedRelationSet = new Set(supportedRelations);

        const rows = await this.prismaService.authzResourceRoleBinding.findMany({
            where: {
                roleId: {
                    in: uniqueRoleIds
                },
                resourceType
            },
            select: {
                roleId: true,
                resourceId: true
            },
            orderBy: [
                {
                    roleId: 'asc'
                },
                {
                    resourceId: 'asc'
                }
            ]
        });

        for (const row of rows) {
            if (!supportedRelationSet.has(row.resourceId)) {
                continue;
            }
            result.set(row.roleId, [...(result.get(row.roleId) ?? []), row.resourceId]);
        }

        return new Map(
            [...result.entries()].map(([roleId, relations]) => [
                roleId,
                this.normalizeAuthzResourceRelations(supportedRelations, relations)
            ])
        );
    }

    /**
     * 刷新受影响角色状态版本，确保已登录用户能感知授权变化。
     */
    private async bumpAffectedRoleVersions(roles: AuthzPermissionRoleRecord[]): Promise<void> {
        const settled = await Promise.allSettled(
            roles.map((role) => this.adminUserStateService.bumpRoleStateVersion(role.id))
        );
        settled.forEach((result, index) => {
            if (result.status === 'rejected') {
                // 保留 detail：状态版本刷新失败需要把每个角色的 rejection 原因（含 stack）完整记录用于补偿排查。
                this.logger.warn('权限管理刷新角色状态版本失败', {
                    roleId: roles[index]?.id,
                    error: result.reason
                });
            }
        });
    }

    /**
     * 校验指定资源和 relation 已在数据库启用授权，且当前 schema 仍支持直接给角色授权。
     */
    private assertSupportedAuthorizationRelation(
        definition: SpiceDbSchemaDefinitionType,
        resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>,
        relation: string
    ): void {
        if (!this.isAuthorizationConfigurableDefinition(definition, resourceMetadataIndex)) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType: definition.name
            });
        }
        if (!this.createAssignableRelations(definition).some((item) => item.relation === relation)) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType: definition.name,
                relation
            });
        }
    }

    /**
     * 校验指定 schema definition 具备权限页可配置授权所需的基础结构。
     */
    private assertDefinitionSupportsAuthorization(definition: SpiceDbSchemaDefinitionType): void {
        if (!this.isSchemaDefinitionAuthorizationShapeSupported(definition)) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType: definition.name
            });
        }
    }

    /**
     * 判断资源是否同时在数据库启用授权，且当前 schema 结构支持角色授权配置。
     */
    private isAuthorizationConfigurableDefinition(
        definition: SpiceDbSchemaDefinitionType,
        resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>
    ) {
        return (
            this.getResourceAuthorizationEnabled(resourceMetadataIndex, definition.name) &&
            this.isSchemaDefinitionAuthorizationShapeSupported(definition)
        );
    }

    /**
     * 根据 schema 结构判断实体是否适合在权限页作为角色授权单例资源。
     */
    private isSchemaDefinitionAuthorizationShapeSupported(definition: SpiceDbSchemaDefinitionType) {
        return this.hasSystemRelation(definition) && this.createAssignableRelations(definition).length > 0;
    }

    /**
     * 判断 schema definition 是否声明了 system 归属关系，确保后台超级管理员链路可达。
     */
    private hasSystemRelation(definition: SpiceDbSchemaDefinitionType) {
        return definition.relations.some(
            (relation) => relation.name === 'system' && relation.targets.some((target) => target.type === 'system')
        );
    }

    /**
     * 从 schema definition 中提取可以直接授权给角色的 relation。
     */
    private createAssignableRelations(definition: SpiceDbSchemaDefinitionType): AssignableSchemaRelation[] {
        return definition.relations
            .filter(
                (relation) =>
                    relation.name !== 'system' &&
                    relation.targets.some((target) => target.type === 'role' && !target.relation)
            )
            .map((relation) => ({
                relation: relation.name,
                label: this.getRelationLabel(relation.name)
            }));
    }

    /**
     * 从实体元数据索引读取授权开关；缺失或未初始化代表元数据补齐失败，应显式报错。
     */
    private getResourceAuthorizationEnabled(
        resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>,
        resourceType: string
    ) {
        const metadata = resourceMetadataIndex.get(resourceType);
        if (!metadata || metadata.authorizationEnabled === null) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType
            });
        }
        return metadata.authorizationEnabled;
    }

    /**
     * 从 schema definition 索引读取指定实体；缺失说明 schema 与元数据补齐流程不一致。
     */
    private getSchemaDefinition(definitionIndex: Map<string, SpiceDbSchemaDefinitionType>, resourceType: string) {
        const definition = definitionIndex.get(resourceType);
        if (!definition) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType
            });
        }
        return definition;
    }

    /**
     * 将模块矩阵转换为 resourceType 到 relation 集合的过滤索引。
     */
    private createSupportedRelationIndex(
        modules: Array<{ resourceType: string; relations: Array<{ relation: string }> }>
    ) {
        return new Map(
            modules.map((module) => [module.resourceType, new Set(module.relations.map((item) => item.relation))])
        );
    }

    /**
     * 按当前 schema 支持关系顺序规整授权关系集合。
     */
    private normalizeAuthzResourceRelations(supportedRelations: string[], relations: string[]): string[] {
        const relationSet = new Set(relations);
        return supportedRelations.filter((relation) => relationSet.has(relation));
    }

    /**
     * 获取 relation 展示名；没有配置中文名时直接展示 schema relation 名。
     */
    private getRelationLabel(relation: string) {
        return CORE_MANAGER_RELATION_LABELS[relation as CoreManagerRelation] ?? relation;
    }

    /**
     * 从实体元数据索引读取展示名；缺失代表元数据补齐失败，应显式报错。
     */
    private getResourceDisplayName(resourceMetadataIndex: Map<string, AuthzResourceMetadataRow>, resourceType: string) {
        const metadata = resourceMetadataIndex.get(resourceType);
        if (!metadata) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType
            });
        }
        return metadata.displayName;
    }

    /**
     * 规整 SpiceDB 实体类型名，去重后按字典序排列。
     */
    private normalizeResourceTypes(resourceTypes: string[]): string[] {
        return [...new Set(resourceTypes.map((resourceType) => resourceType.trim()).filter(Boolean))].sort();
    }

    /**
     * 规整角色 ID，去重后按数字升序排列。
     */
    private normalizeRoleIds(roleIds: number[]): number[] {
        return [
            ...new Set(
                roleIds.map((roleId) => Number(roleId)).filter((roleId) => Number.isInteger(roleId) && roleId > 0)
            )
        ].sort((left, right) => left - right);
    }

    /**
     * 计算 source 中存在而 target 中不存在的角色 ID。
     */
    private diffRoleIds(source: number[], target: number[]): number[] {
        const targetSet = new Set(target);
        return this.normalizeRoleIds(source).filter((roleId) => !targetSet.has(roleId));
    }

    /**
     * 判断两个角色 ID 集合是否完全一致。
     */
    private areRoleIdsEqual(left: number[], right: number[]): boolean {
        const normalizedLeft = this.normalizeRoleIds(left);
        const normalizedRight = this.normalizeRoleIds(right);
        if (normalizedLeft.length !== normalizedRight.length) {
            return false;
        }
        return normalizedLeft.every((roleId, index) => roleId === normalizedRight[index]);
    }

    /**
     * 为 manager relation 创建稳定索引 key。
     */
    private createManagerRelationKey(resourceType: string, relation: string) {
        return `${resourceType}:${relation}`;
    }

    /**
     * 为 resourceType + roleId 创建稳定快照 key。
     */
    private createResourceRoleKey(resourceType: string, roleId: number) {
        return `${resourceType}:${roleId}`;
    }

    /**
     * 解析 resourceType + roleId 快照 key。
     */
    private parseResourceRoleKey(key: string): {
        resourceType: AuthzPermissionCoreManagerResourceType;
        roleId: number;
    } {
        const [resourceType, roleIdText] = key.split(':');
        const roleId = Number(roleIdText);
        if (!resourceType || !Number.isInteger(roleId) || roleId <= 0) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                key
            });
        }
        return {
            resourceType: resourceType as AuthzPermissionCoreManagerResourceType,
            roleId
        };
    }
}
