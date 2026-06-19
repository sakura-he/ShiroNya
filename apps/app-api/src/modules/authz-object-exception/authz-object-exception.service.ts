import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import type { AuthzObjectSubjectBinding } from '@app/prisma-app/generated/client';
import type { RelationshipInput, RelationshipOperation } from '@spicedb-toolkit/core';
import { Injectable } from '@nestjs/common';
import { AdminSpiceDbAuthorizationService } from '../spicedb/admin-spicedb-authorization.service';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import {
    AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_TUPLE_THRESHOLD,
    AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_USER_THRESHOLD,
    AUTHZ_OBJECT_EXCEPTION_RELATIONS,
    AUTHZ_OBJECT_EXCEPTION_USER_SAMPLE_LIMIT,
    type AuthzObjectExceptionResourceType,
    type AuthzObjectSubjectKind
} from '../spicedb/object-exception-authz.constants';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import type {
    ApplyAuthzObjectExceptionBindingsType,
    AuthzObjectExceptionQueryType,
    AuthzObjectExceptionSubjectType,
    PreviewAuthzObjectExceptionBindingsType
} from './dto/authz-object-exception.dto';

type ObjectBindingRow = Pick<
    AuthzObjectSubjectBinding,
    'resourceType' | 'resourceId' | 'relation' | 'subjectKind' | 'subjectId' | 'createdBy'
>;

type NormalizedObjectChange = {
    relation: string;
    previousSubjects: AuthzObjectExceptionSubjectType[];
    nextSubjects: AuthzObjectExceptionSubjectType[];
    createSubjects: AuthzObjectExceptionSubjectType[];
    deleteSubjects: AuthzObjectExceptionSubjectType[];
};

type ObjectBindingPreview = {
    resourceType: AuthzObjectExceptionResourceType;
    resourceId: string;
    normalizedChanges: NormalizedObjectChange[];
    impactMode: 'summary' | 'precise';
    createCount: number;
    deleteCount: number;
    affectedUserCount: number | null;
    affectedRoleCount: number;
    affectedGroupCount: number;
    directUserAssignmentCount: number;
    affectedUserEstimate: number;
    affectedUsersSample: Array<{ id: string; username: string | null; name: string }>;
    confirmationReasons: string[];
    requiresConfirmation: boolean;
    preferredSubjectKind: 'role_assigned';
};

/**
 * 管理 SpiceDB 核心对象级例外授权的源表、预览、写入和清理能力。
 */
@Injectable()
export class AuthzObjectExceptionService {
    private readonly logger = createRuntimeLogger(AuthzObjectExceptionService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'object_exception' }
    });

    /**
     * 注入源表、SpiceDB、投影读模型和状态版本依赖。
     */
    constructor(
        private readonly prismaService: PrismaService,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly adminUserStateService: AdminUserStateService
    ) {}

    /**
     * 读取指定对象当前人工维护的例外授权关系。
     */
    async getBindings(data: AuthzObjectExceptionQueryType, actorId: string) {
        const resource = this.normalizeResourceRef(data);
        await this.assertResourceExists(resource.resourceType, resource.resourceId);
        const [editable, rows] = await Promise.all([
            this.canEditObjectExceptions(resource.resourceType, actorId),
            this.loadBindingRows(resource.resourceType, resource.resourceId)
        ]);

        return this.createBindingsView(resource.resourceType, resource.resourceId, rows, editable);
    }

    /**
     * 预览对象例外授权变更，只做校验和影响分析，不写数据库和 SpiceDB。
     */
    async previewBindings(data: PreviewAuthzObjectExceptionBindingsType, actorId: string) {
        await this.assertCanEditObjectExceptions(data.resourceType, actorId);
        return await this.buildPreview(data);
    }

    /**
     * 应用对象例外授权变更，并在 SpiceDB 写入失败时补偿回滚源表。
     */
    async applyBindings(data: ApplyAuthzObjectExceptionBindingsType, actorId: string) {
        await this.assertCanEditObjectExceptions(data.resourceType, actorId);
        const preview = await this.buildPreview(data);

        if (preview.requiresConfirmation && data.confirmedLargeChange !== true) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                reason: 'large_object_exception_change_requires_confirmation',
                createCount: preview.createCount,
                deleteCount: preview.deleteCount,
                affectedUserCount: preview.affectedUserCount,
                affectedUserEstimate: preview.affectedUserEstimate,
                confirmationReasons: preview.confirmationReasons
            });
        }

        if (preview.createCount + preview.deleteCount === 0) {
            return await this.getBindings(
                {
                    resourceType: preview.resourceType,
                    resourceId: preview.resourceId
                },
                actorId
            );
        }

        const previousRows = await this.loadBindingRows(preview.resourceType, preview.resourceId);
        const nextRows = this.createNextRows(previousRows, preview, actorId);
        const previousRelationships = this.createRelationshipsFromRows(previousRows);
        const nextRelationships = this.createRelationshipsFromRows(nextRows);

        await this.replaceSourceRows(preview.resourceType, preview.resourceId, nextRows);

        try {
            await this.replaceSpiceDbRelationships(previousRelationships, nextRelationships);
        } catch (error) {
            await this.replaceSourceRows(preview.resourceType, preview.resourceId, previousRows);
            await this.rollbackSpiceDbRelationships(nextRelationships, previousRelationships, error);
            throw error;
        }

        await this.bumpAffectedStateVersions(preview);
        return await this.getBindings(
            {
                resourceType: preview.resourceType,
                resourceId: preview.resourceId
            },
            actorId
        );
    }

    /**
     * 清理已删除对象作为 resource 时对应的对象例外源表和 SpiceDB 关系。
     */
    async cleanupDeletedResource(resourceType: AuthzObjectExceptionResourceType, resourceId: string): Promise<void> {
        const normalized = this.normalizeResourceRef({ resourceType, resourceId });
        await this.deleteObjectExceptionResourceRelationships(normalized.resourceType, normalized.resourceId);
        await this.prismaService.authzObjectSubjectBinding.deleteMany({
            where: {
                resourceType: normalized.resourceType,
                resourceId: normalized.resourceId
            }
        });
    }

    /**
     * 清理已删除后台用户作为对象或 subject 时产生的对象例外授权。
     */
    async cleanupDeletedUser(userId: string): Promise<void> {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return;
        }

        await this.deleteObjectExceptionResourceRelationships('admin_user', normalizedUserId);
        await this.deleteObjectExceptionSubjectRelationships({
            kind: 'user',
            id: normalizedUserId
        });
        await this.prismaService.authzObjectSubjectBinding.deleteMany({
            where: {
                OR: [
                    {
                        resourceType: 'admin_user',
                        resourceId: normalizedUserId
                    },
                    {
                        subjectKind: 'user',
                        subjectId: normalizedUserId
                    }
                ]
            }
        });
    }

    /**
     * 清理已删除角色作为对象或 role#assigned subject 时产生的对象例外授权。
     */
    async cleanupDeletedRole(roleId: number): Promise<void> {
        if (!Number.isInteger(roleId) || roleId <= 0) {
            return;
        }
        const roleIdText = String(roleId);

        await this.deleteObjectExceptionResourceRelationships('role', roleIdText);
        await this.deleteObjectExceptionSubjectRelationships({
            kind: 'role_assigned',
            id: roleIdText
        });
        await this.prismaService.authzObjectSubjectBinding.deleteMany({
            where: {
                OR: [
                    {
                        resourceType: 'role',
                        resourceId: roleIdText
                    },
                    {
                        subjectKind: 'role_assigned',
                        subjectId: roleIdText
                    }
                ]
            }
        });
    }

    /**
     * 构造对象例外变更预览，并验证前端基线和当前源表一致。
     */
    private async buildPreview(data: PreviewAuthzObjectExceptionBindingsType): Promise<ObjectBindingPreview> {
        const resource = this.normalizeResourceRef(data);
        await this.assertResourceExists(resource.resourceType, resource.resourceId);
        const currentRows = await this.loadBindingRows(resource.resourceType, resource.resourceId);
        const normalizedChanges = await this.normalizeChanges(resource.resourceType, data.changes);

        this.assertPreviousSubjectsMatch(currentRows, normalizedChanges);

        const changedSubjects = this.getChangedSubjects(normalizedChanges);
        const affectedRoleIds = this.normalizeRoleIds(
            changedSubjects.filter((subject) => subject.kind === 'role_assigned').map((subject) => Number(subject.id))
        );
        const directUserIds = changedSubjects.filter((subject) => subject.kind === 'user').map((subject) => subject.id);
        const createCount = normalizedChanges.reduce((count, change) => count + change.createSubjects.length, 0);
        const deleteCount = normalizedChanges.reduce((count, change) => count + change.deleteSubjects.length, 0);
        const impactMode = data.impactMode ?? 'summary';
        const roleImpactSummary = await this.createRbacRoleImpactSummary(affectedRoleIds);
        const affectedUserIds =
            impactMode === 'precise' ? await this.resolveAffectedUserIds(directUserIds, affectedRoleIds) : [];
        const affectedUsersSample = impactMode === 'precise' ? await this.loadAffectedUserSample(affectedUserIds) : [];
        const affectedUserCount = impactMode === 'precise' ? affectedUserIds.length : null;
        const directUserAssignmentCount =
            [...new Set(directUserIds)].length + roleImpactSummary.directUserAssignmentCount;
        const affectedUserEstimate =
            impactMode === 'precise'
                ? affectedUserIds.length
                : [...new Set(directUserIds)].length + roleImpactSummary.affectedUserEstimate;
        const confirmationReasons = this.createConfirmationReasons(createCount, deleteCount, affectedUserEstimate);

        return {
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            normalizedChanges,
            impactMode,
            createCount,
            deleteCount,
            affectedUserCount,
            affectedRoleCount: affectedRoleIds.length,
            affectedGroupCount: roleImpactSummary.affectedGroupCount,
            directUserAssignmentCount,
            affectedUserEstimate,
            affectedUsersSample,
            confirmationReasons,
            requiresConfirmation: confirmationReasons.length > 0,
            preferredSubjectKind: 'role_assigned'
        };
    }

    /**
     * 根据 tuple 增量和用户影响估算生成大变更确认原因。
     */
    private createConfirmationReasons(
        createCount: number,
        deleteCount: number,
        affectedUserEstimate: number
    ): string[] {
        const reasons: string[] = [];
        if (createCount + deleteCount > AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_TUPLE_THRESHOLD) {
            reasons.push('tuple_change_threshold_exceeded');
        }
        if (affectedUserEstimate > AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_USER_THRESHOLD) {
            reasons.push('affected_user_threshold_exceeded');
        }
        return reasons;
    }

    /**
     * 将请求里的资源引用规整成 SpiceDB 使用的字符串 ID。
     */
    private normalizeResourceRef(data: AuthzObjectExceptionQueryType): {
        resourceType: AuthzObjectExceptionResourceType;
        resourceId: string;
    } {
        return {
            resourceType: data.resourceType,
            resourceId: data.resourceId.trim()
        };
    }

    /**
     * 检查当前用户是否可以编辑指定资源类型的对象例外授权。
     */
    private async canEditObjectExceptions(
        resourceType: AuthzObjectExceptionResourceType,
        actorId: string
    ): Promise<boolean> {
        void resourceType;
        return await this.rbacAuthorizationService.checkPermission(actorId, RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE);
    }

    /**
     * 断言当前用户可以编辑指定资源类型的对象例外授权。
     */
    private async assertCanEditObjectExceptions(
        resourceType: AuthzObjectExceptionResourceType,
        actorId: string
    ): Promise<void> {
        void resourceType;
        await this.rbacAuthorizationService.assertPermission(actorId, RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE);
    }

    /**
     * 校验目标业务对象存在，避免给不存在的资源写入孤儿 tuple。
     */
    private async assertResourceExists(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string
    ): Promise<void> {
        const exists = await this.checkResourceExists(resourceType, resourceId);
        if (!exists) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                resourceType,
                resourceId
            });
        }
    }

    /**
     * 查询目标业务对象是否存在。
     */
    private async checkResourceExists(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string
    ): Promise<boolean> {
        if (resourceType === 'admin_user') {
            return (
                (await this.prismaService.betterAuthUser.count({
                    where: {
                        id: resourceId
                    }
                })) > 0
            );
        }

        const numericId = Number(resourceId);
        if (!Number.isInteger(numericId) || numericId <= 0) {
            return false;
        }

        if (resourceType === 'role') {
            return (
                (await this.prismaService.rbacRole.count({
                    where: {
                        id: numericId,
                        deletedAt: null
                    }
                })) > 0
            );
        }
        if (resourceType === 'menu') {
            return (
                (await this.prismaService.rbacMenu.count({
                    where: {
                        id: numericId
                    }
                })) > 0
            );
        }
        if (resourceType === 'user_group') {
            return (
                (await this.prismaService.rbacUserGroup.count({
                    where: {
                        id: numericId,
                        deletedAt: null
                    }
                })) > 0
            );
        }
        return (
            (await this.prismaService.task.count({
                where: {
                    id: numericId
                }
            })) > 0
        );
    }

    /**
     * 读取指定对象当前全部例外授权源表记录。
     */
    private async loadBindingRows(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string
    ): Promise<ObjectBindingRow[]> {
        return await this.prismaService.authzObjectSubjectBinding.findMany({
            where: {
                resourceType,
                resourceId
            },
            select: {
                resourceType: true,
                resourceId: true,
                relation: true,
                subjectKind: true,
                subjectId: true,
                createdBy: true
            },
            orderBy: [
                {
                    relation: 'asc'
                },
                {
                    subjectKind: 'asc'
                },
                {
                    subjectId: 'asc'
                }
            ]
        });
    }

    /**
     * 根据当前源表记录生成接口返回的对象例外授权视图。
     */
    private createBindingsView(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string,
        rows: ObjectBindingRow[],
        editable: boolean
    ) {
        const subjectIndex = this.createRelationSubjectIndex(rows);
        const config = AUTHZ_OBJECT_EXCEPTION_RELATIONS[resourceType];

        return {
            resourceType,
            resourceId,
            editable,
            relations: config.relations.map((relation) => ({
                relation,
                label: config.labels[relation] ?? relation,
                subjects: subjectIndex.get(relation) ?? [],
                preferredSubjectKind: 'role_assigned' as const
            }))
        };
    }

    /**
     * 将源表记录按 relation 分组为 subject 列表。
     */
    private createRelationSubjectIndex(rows: ObjectBindingRow[]): Map<string, AuthzObjectExceptionSubjectType[]> {
        const index = new Map<string, AuthzObjectExceptionSubjectType[]>();
        for (const row of rows) {
            const relationSubjects = index.get(row.relation) ?? [];
            relationSubjects.push({
                kind: row.subjectKind as AuthzObjectSubjectKind,
                id: row.subjectId
            });
            index.set(row.relation, relationSubjects);
        }

        return new Map(
            [...index.entries()].map(([relation, subjects]) => [relation, this.normalizeSubjects(subjects)])
        );
    }

    /**
     * 校验并规整本次提交的全部 relation 变更。
     */
    private async normalizeChanges(
        resourceType: AuthzObjectExceptionResourceType,
        changes: PreviewAuthzObjectExceptionBindingsType['changes']
    ): Promise<NormalizedObjectChange[]> {
        const relationSet = new Set<string>(AUTHZ_OBJECT_EXCEPTION_RELATIONS[resourceType].relations);
        const seenRelations = new Set<string>();
        const normalizedChanges: NormalizedObjectChange[] = [];

        for (const change of changes) {
            const relation = change.relation.trim();
            if (!relationSet.has(relation)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    resourceType,
                    relation
                });
            }
            if (seenRelations.has(relation)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    reason: 'duplicate_object_exception_relation',
                    relation
                });
            }
            seenRelations.add(relation);

            const previousSubjects = this.normalizeSubjects(change.previousSubjects);
            const nextSubjects = this.normalizeSubjects(change.nextSubjects);
            await this.assertSubjectsExist([...previousSubjects, ...nextSubjects]);
            normalizedChanges.push({
                relation,
                previousSubjects,
                nextSubjects,
                createSubjects: this.diffSubjects(nextSubjects, previousSubjects),
                deleteSubjects: this.diffSubjects(previousSubjects, nextSubjects)
            });
        }

        return normalizedChanges;
    }

    /**
     * 规整 subject 列表，去重后按 kind/id 排序。
     */
    private normalizeSubjects(subjects: AuthzObjectExceptionSubjectType[]): AuthzObjectExceptionSubjectType[] {
        const subjectIndex = new Map<string, AuthzObjectExceptionSubjectType>();
        for (const subject of subjects) {
            const normalized = this.normalizeSubject(subject);
            subjectIndex.set(this.createSubjectKey(normalized), normalized);
        }

        return [...subjectIndex.values()].sort((left, right) =>
            this.createSubjectKey(left).localeCompare(this.createSubjectKey(right))
        );
    }

    /**
     * 规整单个 subject，确保 role_assigned 使用正整数角色 ID 字符串。
     */
    private normalizeSubject(subject: AuthzObjectExceptionSubjectType): AuthzObjectExceptionSubjectType {
        const id = subject.id.trim();
        if (subject.kind === 'role_assigned') {
            const roleId = Number(id);
            if (!Number.isInteger(roleId) || roleId <= 0) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    subject
                });
            }
            return {
                kind: subject.kind,
                id: String(roleId)
            };
        }

        return {
            kind: subject.kind,
            id
        };
    }

    /**
     * 校验请求涉及的 user 和 role subject 都真实存在。
     */
    private async assertSubjectsExist(subjects: AuthzObjectExceptionSubjectType[]): Promise<void> {
        const normalizedSubjects = this.normalizeSubjects(subjects);
        const userIds = normalizedSubjects.filter((subject) => subject.kind === 'user').map((subject) => subject.id);
        const roleIds = this.normalizeRoleIds(
            normalizedSubjects
                .filter((subject) => subject.kind === 'role_assigned')
                .map((subject) => Number(subject.id))
        );
        const [existingUserIds, existingRoleIds] = await Promise.all([
            this.findExistingUserIds(userIds),
            this.findExistingRoleIds(roleIds)
        ]);
        const missingUserIds = userIds.filter((userId) => !existingUserIds.has(userId));
        const missingRoleIds = roleIds.filter((roleId) => !existingRoleIds.has(roleId));

        if (missingUserIds.length > 0 || missingRoleIds.length > 0) {
            throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                missingUserIds,
                missingRoleIds
            });
        }
    }

    /**
     * 查询存在的后台用户 ID 集合。
     */
    private async findExistingUserIds(userIds: string[]): Promise<Set<string>> {
        const uniqueUserIds = [...new Set(userIds.filter((userId) => userId.trim().length > 0))];
        if (uniqueUserIds.length === 0) {
            return new Set();
        }
        const rows = await this.prismaService.betterAuthUser.findMany({
            where: {
                id: {
                    in: uniqueUserIds
                }
            },
            select: {
                id: true
            }
        });
        return new Set(rows.map((row) => row.id));
    }

    /**
     * 查询存在的角色 ID 集合。
     */
    private async findExistingRoleIds(roleIds: number[]): Promise<Set<number>> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        if (uniqueRoleIds.length === 0) {
            return new Set();
        }
        const rows = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        return new Set(rows.map((row) => row.id));
    }

    /**
     * 确认前端提交的 previousSubjects 与当前源表状态一致，避免覆盖并发修改。
     */
    private assertPreviousSubjectsMatch(currentRows: ObjectBindingRow[], changes: NormalizedObjectChange[]): void {
        const subjectIndex = this.createRelationSubjectIndex(currentRows);
        for (const change of changes) {
            const currentSubjects = subjectIndex.get(change.relation) ?? [];
            if (!this.areSubjectsEqual(currentSubjects, change.previousSubjects)) {
                throw new BusinessException(ErrorCodes.PARAM.INVALID, {
                    reason: 'object_exception_snapshot_conflict',
                    relation: change.relation,
                    currentSubjects,
                    previousSubjects: change.previousSubjects
                });
            }
        }
    }

    /**
     * 计算 source 中存在而 target 中不存在的 subject。
     */
    private diffSubjects(
        source: AuthzObjectExceptionSubjectType[],
        target: AuthzObjectExceptionSubjectType[]
    ): AuthzObjectExceptionSubjectType[] {
        const targetKeys = new Set(target.map((subject) => this.createSubjectKey(subject)));
        return source.filter((subject) => !targetKeys.has(this.createSubjectKey(subject)));
    }

    /**
     * 判断两个 subject 集合是否完全一致。
     */
    private areSubjectsEqual(
        left: AuthzObjectExceptionSubjectType[],
        right: AuthzObjectExceptionSubjectType[]
    ): boolean {
        const normalizedLeft = this.normalizeSubjects(left);
        const normalizedRight = this.normalizeSubjects(right);
        if (normalizedLeft.length !== normalizedRight.length) {
            return false;
        }
        return normalizedLeft.every(
            (subject, index) => this.createSubjectKey(subject) === this.createSubjectKey(normalizedRight[index])
        );
    }

    /**
     * 收集本次真正新增或删除的 subject 集合。
     */
    private getChangedSubjects(changes: NormalizedObjectChange[]): AuthzObjectExceptionSubjectType[] {
        return this.normalizeSubjects(
            changes.flatMap((change) => [...change.createSubjects, ...change.deleteSubjects])
        );
    }

    /**
     * 按直接用户和角色命中用户合并计算受影响用户 ID。
     */
    private async resolveAffectedUserIds(directUserIds: string[], roleIds: number[]): Promise<string[]> {
        const uniqueRoleIds = this.normalizeRoleIds(roleIds);
        const roleUserRows =
            uniqueRoleIds.length === 0
                ? []
                : await this.prismaService.rbacEffectiveUserRole.findMany({
                      where: {
                          roleId: {
                              in: uniqueRoleIds
                          }
                      },
                      select: {
                          userId: true
                      }
                  });
        return [...new Set([...directUserIds, ...roleUserRows.map((row) => row.userId)])].sort();
    }

    /**
     * 基于 RBAC effective 读模型估算 role_assigned subject 影响范围。
     */
    private async createRbacRoleImpactSummary(roleIds: number[]): Promise<{
        affectedUserEstimate: number;
        affectedGroupCount: number;
        directUserAssignmentCount: number;
    }> {
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
     * 查询受影响用户样例，用于预览页展示数量提示。
     */
    private async loadAffectedUserSample(
        userIds: string[]
    ): Promise<Array<{ id: string; username: string | null; name: string }>> {
        const sampleIds = userIds.slice(0, AUTHZ_OBJECT_EXCEPTION_USER_SAMPLE_LIMIT);
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
     * 基于当前源表行和变更预览生成下一版源表行。
     */
    private createNextRows(
        previousRows: ObjectBindingRow[],
        preview: ObjectBindingPreview,
        actorId: string
    ): ObjectBindingRow[] {
        const rowIndex = new Map(previousRows.map((row) => [this.createRowKey(row), row]));

        for (const change of preview.normalizedChanges) {
            for (const subject of change.deleteSubjects) {
                rowIndex.delete(
                    this.createRowKey({
                        resourceType: preview.resourceType,
                        resourceId: preview.resourceId,
                        relation: change.relation,
                        subjectKind: subject.kind,
                        subjectId: subject.id,
                        createdBy: actorId
                    })
                );
            }
            for (const subject of change.createSubjects) {
                const row: ObjectBindingRow = {
                    resourceType: preview.resourceType,
                    resourceId: preview.resourceId,
                    relation: change.relation,
                    subjectKind: subject.kind,
                    subjectId: subject.id,
                    createdBy: actorId
                };
                rowIndex.set(this.createRowKey(row), row);
            }
        }

        return [...rowIndex.values()].sort((left, right) =>
            this.createRowKey(left).localeCompare(this.createRowKey(right))
        );
    }

    /**
     * 用下一版行集合替换单个对象的源表记录。
     */
    private async replaceSourceRows(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string,
        rows: ObjectBindingRow[]
    ): Promise<void> {
        await this.prismaService.$transaction(async (tx) => {
            await tx.authzObjectSubjectBinding.deleteMany({
                where: {
                    resourceType,
                    resourceId
                }
            });

            if (rows.length > 0) {
                await tx.authzObjectSubjectBinding.createMany({
                    data: rows.map((row) => ({
                        resourceType: row.resourceType,
                        resourceId: row.resourceId,
                        relation: row.relation,
                        subjectKind: row.subjectKind,
                        subjectId: row.subjectId,
                        createdBy: row.createdBy
                    })),
                    skipDuplicates: true
                });
            }
        });
    }

    /**
     * 将源表行转换为 SpiceDB relationship。
     */
    private createRelationshipsFromRows(rows: ObjectBindingRow[]): RelationshipInput[] {
        return rows.map((row) => this.createRelationship(row));
    }

    /**
     * 将单条源表行转换为 SpiceDB relationship。
     */
    private createRelationship(row: ObjectBindingRow): RelationshipInput {
        const subject =
            row.subjectKind === 'role_assigned'
                ? {
                      type: 'role',
                      id: row.subjectId,
                      relation: 'assigned'
                  }
                : {
                      type: 'user',
                      id: row.subjectId
                  };

        return {
            resource: {
                type: row.resourceType,
                id: row.resourceId
            },
            relation: row.relation,
            subject
        };
    }

    /**
     * 通过批量 diff 把 SpiceDB relationships 从 previous 替换到 next。
     */
    private async replaceSpiceDbRelationships(
        previousRelationships: RelationshipInput[],
        nextRelationships: RelationshipInput[]
    ): Promise<void> {
        const previousIndex = new Map(
            previousRelationships.map((relationship) => [this.createRelationshipKey(relationship), relationship])
        );
        const nextIndex = new Map(
            nextRelationships.map((relationship) => [this.createRelationshipKey(relationship), relationship])
        );
        const updates: Array<{ operation: RelationshipOperation; relationship: RelationshipInput }> = [
            ...previousRelationships
                .filter((relationship) => !nextIndex.has(this.createRelationshipKey(relationship)))
                .map((relationship) => ({
                    operation: 'delete' as RelationshipOperation,
                    relationship
                })),
            ...nextRelationships
                .filter((relationship) => !previousIndex.has(this.createRelationshipKey(relationship)))
                .map((relationship) => ({
                    operation: 'touch' as RelationshipOperation,
                    relationship
                }))
        ];

        await this.spiceDbAuthorizationService.writeRelationshipsNative(updates);
    }

    /**
     * SpiceDB 写入失败后尽力恢复变更前关系，并保留原始错误作为主错误。
     */
    private async rollbackSpiceDbRelationships(
        nextRelationships: RelationshipInput[],
        previousRelationships: RelationshipInput[],
        cause: unknown
    ): Promise<void> {
        try {
            await this.replaceSpiceDbRelationships(nextRelationships, previousRelationships);
        } catch (rollbackError) {
            // 保留 detail：SpiceDB 回滚失败需要把原始 cause 和 rollbackError 的 stack 完整写入文件日志。
            this.logger.error('对象例外授权 SpiceDB 回滚失败', {
                cause,
                rollbackError
            });
        }
    }

    /**
     * 刷新本次对象例外授权影响到的用户和角色状态版本。
     */
    private async bumpAffectedStateVersions(preview: ObjectBindingPreview): Promise<void> {
        const changedSubjects = this.getChangedSubjects(preview.normalizedChanges);
        const directUserIds = changedSubjects.filter((subject) => subject.kind === 'user').map((subject) => subject.id);
        const roleIds = this.normalizeRoleIds(
            changedSubjects.filter((subject) => subject.kind === 'role_assigned').map((subject) => Number(subject.id))
        );
        const roles =
            roleIds.length === 0
                ? []
                : await this.prismaService.rbacRole.findMany({
                      where: {
                          id: {
                              in: roleIds
                          },
                          deletedAt: null
                      },
                      select: {
                          id: true,
                          name: true
                      }
                  });
        const settled = await Promise.allSettled([
            ...[...new Set(directUserIds)].map((userId) => this.adminUserStateService.bumpUserStateVersion(userId)),
            ...roles.map((role) => this.adminUserStateService.bumpRoleStateVersion(role.id))
        ]);

        settled.forEach((result) => {
            if (result.status === 'rejected') {
                // 保留 detail：状态版本刷新失败需要把 rejection 原因（含 stack）完整记录用于补偿排查。
                this.logger.warn('对象例外授权刷新状态版本失败', {
                    error: result.reason
                });
            }
        });
    }

    /**
     * 删除某个资源对象上的全部对象例外 relationship。
     */
    private async deleteObjectExceptionResourceRelationships(
        resourceType: AuthzObjectExceptionResourceType,
        resourceId: string
    ): Promise<void> {
        for (const relation of AUTHZ_OBJECT_EXCEPTION_RELATIONS[resourceType].relations) {
            await this.spiceDbAuthorizationService.deleteRelationshipsNative({
                resourceType,
                resourceId,
                relation
            });
        }
    }

    /**
     * 删除某个 subject 在全部核心对象例外 relation 上的 relationship。
     */
    private async deleteObjectExceptionSubjectRelationships(subject: AuthzObjectExceptionSubjectType): Promise<void> {
        const subjectFilter =
            subject.kind === 'role_assigned'
                ? {
                      type: 'role',
                      id: subject.id,
                      relation: 'assigned'
                  }
                : {
                      type: 'user',
                      id: subject.id
                  };

        for (const [resourceType, config] of Object.entries(AUTHZ_OBJECT_EXCEPTION_RELATIONS)) {
            for (const relation of config.relations) {
                await this.spiceDbAuthorizationService.deleteRelationshipsNative({
                    resourceType,
                    relation,
                    subject: subjectFilter
                });
            }
        }
    }

    /**
     * 生成 subject 的稳定去重 key。
     */
    private createSubjectKey(subject: AuthzObjectExceptionSubjectType): string {
        return `${subject.kind}:${subject.id}`;
    }

    /**
     * 生成源表行的稳定去重 key。
     */
    private createRowKey(row: ObjectBindingRow): string {
        return [row.resourceType, row.resourceId, row.relation, row.subjectKind, row.subjectId].join(':');
    }

    /**
     * 生成 relationship 的稳定去重 key。
     */
    private createRelationshipKey(relationship: RelationshipInput): string {
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
     * 规整角色 ID，去重后按数字升序排列。
     */
    private normalizeRoleIds(roleIds: number[]): number[] {
        return [...new Set(roleIds.filter((roleId) => Number.isInteger(roleId) && roleId > 0))].sort(
            (left, right) => left - right
        );
    }
}
