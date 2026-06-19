import { createRuntimeLogger } from '@app/common';
import { createAppApiAuthzProjectionCacheRedisKey } from '@app/common/constants';
import { PrismaService } from '@app/prisma-app';
import { RbacStatus } from '@app/prisma-app/generated/client';
import { InjectRedis } from '@nestjs-redis/client';
import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import {
    AdminSpiceDbAuthorizationService,
    type TaskManagerPermission,
    type TaskPermission,
    type TaskPermissionCheckResult
} from '../spicedb/admin-spicedb-authorization.service';
import { BaseRelationProjectionService } from './base-relation-projection.service';
import { AuthzProjectionInvalidationService } from './authz-projection-invalidation.service';
import { ProjectionHealthGateService } from './projection-health-gate.service';

const TASK_RESOURCE_TYPE = 'task';
const TASK_MANAGER_RESOURCE_TYPE = 'task_manager';
const PROJECTION_READ_CACHE_TTL_SECONDS = 60;

type RoleIndexRow = {
    id: number;
    code: string;
    isSuperAdmin: boolean;
};

@Injectable()
export class ProjectionAuthzReadService {
    private readonly logger = createRuntimeLogger(ProjectionAuthzReadService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'authz_projection_read' }
    });

    constructor(
        private readonly prismaService: PrismaService,
        private readonly baseRelationProjectionService: BaseRelationProjectionService,
        private readonly spiceDbAuthorizationService: AdminSpiceDbAuthorizationService,
        private readonly projectionHealthGateService: ProjectionHealthGateService,
        private readonly invalidationService: AuthzProjectionInvalidationService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    async getEffectiveRoleIdsByUserId(userId: string): Promise<number[]> {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return [];
        }
        if (!(await this.projectionHealthGateService.canUseProjectionReadModel())) {
            return await this.spiceDbAuthorizationService.lookupUserEffectiveRoleIds(normalizedUserId);
        }

        return await this.withProjectionCache(
            'effective-role-ids',
            [normalizedUserId],
            this.isNumberArray,
            async () => {
                const roleIdMap = await this.baseRelationProjectionService.getBatchUserEffectiveRoleIds([
                    normalizedUserId
                ]);
                return roleIdMap.get(normalizedUserId) ?? [];
            }
        );
    }

    async getVisibleTaskIdsByUserId(userId: string): Promise<number[]> {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return [];
        }

        if (!(await this.projectionHealthGateService.canUseProjectionReadModel())) {
            return await this.spiceDbAuthorizationService.lookupUserVisibleTaskIds(normalizedUserId);
        }

        return await this.withProjectionCache('visible-task-ids', [normalizedUserId], this.isNumberArray, async () => {
            try {
                return await this.getVisibleTaskIdsFromReadModel(normalizedUserId);
            } catch (error) {
                // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影读模型失败回退路径
                this.logger.warn('任务可见性投影读模型失败，回退 SpiceDB', { userId: normalizedUserId, error });
                return await this.spiceDbAuthorizationService.lookupUserVisibleTaskIds(normalizedUserId);
            }
        });
    }

    async checkTaskManagerPermissionFromReadModel(permission: TaskManagerPermission, userId: string): Promise<boolean> {
        if (!(await this.projectionHealthGateService.canUseProjectionReadModel())) {
            return await this.spiceDbAuthorizationService.checkTaskManagerPermission(permission, userId);
        }

        try {
            const roleIndex = await this.getEffectiveRoleIndex(userId);
            return await this.hasTaskManagerPermission(permission, roleIndex);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影读模型失败回退路径
            this.logger.warn('任务 manager 投影读模型失败，回退 SpiceDB', { permission, userId, error });
            return await this.spiceDbAuthorizationService.checkTaskManagerPermission(permission, userId);
        }
    }

    async checkTaskPermissionsFromReadModel(
        taskIds: number[],
        permissions: TaskPermission[],
        userId: string
    ): Promise<TaskPermissionCheckResult[]> {
        const uniqueTaskIds = this.uniqueNumbers(taskIds);
        const uniquePermissions = [...new Set(permissions)];
        if (uniqueTaskIds.length === 0 || uniquePermissions.length === 0) {
            return [];
        }

        if (!(await this.projectionHealthGateService.canUseProjectionReadModel())) {
            return await this.spiceDbAuthorizationService.checkTaskPermissions(
                uniqueTaskIds,
                uniquePermissions,
                userId
            );
        }

        const cacheParts = [
            userId,
            this.hashStable({
                taskIds: uniqueTaskIds,
                permissions: uniquePermissions
            })
        ];
        return await this.withProjectionCache(
            'task-permission-matrix',
            cacheParts,
            this.isTaskPermissionResultArray,
            async () => {
                try {
                    return await this.checkTaskPermissionsFromProjection(uniqueTaskIds, uniquePermissions, userId);
                } catch (error) {
                    // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查权限矩阵投影回退路径
                    this.logger.warn('任务权限矩阵投影读模型失败，回退 SpiceDB', {
                        taskIds: uniqueTaskIds,
                        permissions,
                        userId,
                        error
                    });
                    return await this.spiceDbAuthorizationService.checkTaskPermissions(
                        uniqueTaskIds,
                        uniquePermissions,
                        userId
                    );
                }
            }
        );
    }

    private async getVisibleTaskIdsFromReadModel(userId: string): Promise<number[]> {
        const roleIndex = await this.getEffectiveRoleIndex(userId);
        if (this.isSuperAdmin(roleIndex) || (await this.hasTaskManagerPermission('view', roleIndex))) {
            return await this.getAllTaskIds();
        }

        const roleIds = [...roleIndex.keys()];
        const grantRelations = this.getTaskObjectGrantRelations('view');
        const [creatorTasks, objectBindings] = await Promise.all([
            this.prismaService.task.findMany({
                where: {
                    userId
                },
                select: {
                    id: true
                }
            }),
            this.prismaService.authzObjectSubjectBinding.findMany({
                where: {
                    resourceType: TASK_RESOURCE_TYPE,
                    relation: {
                        in: grantRelations
                    },
                    OR: this.createSubjectFilters(userId, roleIds)
                },
                select: {
                    resourceId: true
                }
            })
        ]);

        return this.uniqueNumbers([
            ...creatorTasks.map((task) => task.id),
            ...objectBindings.map((binding) => Number(binding.resourceId))
        ]);
    }

    private async checkTaskPermissionsFromProjection(
        taskIds: number[],
        permissions: TaskPermission[],
        userId: string
    ): Promise<TaskPermissionCheckResult[]> {
        const roleIndex = await this.getEffectiveRoleIndex(userId);
        const roleIds = [...roleIndex.keys()];
        const isSuperAdmin = this.isSuperAdmin(roleIndex);
        const managerGrantRelations = this.getTaskManagerGrantRelationsForTaskPermissions(permissions);
        const [tasks, managerBindings, objectBindings] = await Promise.all([
            this.prismaService.task.findMany({
                where: {
                    id: {
                        in: taskIds
                    }
                },
                select: {
                    id: true,
                    userId: true
                }
            }),
            roleIds.length > 0 && managerGrantRelations.length > 0
                ? this.prismaService.authzResourceRoleBinding.findMany({
                      where: {
                          resourceType: TASK_MANAGER_RESOURCE_TYPE,
                          resourceId: {
                              in: managerGrantRelations
                          },
                          roleId: {
                              in: roleIds
                          }
                      },
                      select: {
                          resourceId: true
                      }
                  })
                : [],
            this.prismaService.authzObjectSubjectBinding.findMany({
                where: {
                    resourceType: TASK_RESOURCE_TYPE,
                    resourceId: {
                        in: taskIds.map((taskId) => String(taskId))
                    },
                    relation: {
                        in: [
                            ...new Set(
                                permissions.flatMap((permission) => this.getTaskObjectGrantRelations(permission))
                            )
                        ]
                    },
                    OR: this.createSubjectFilters(userId, roleIds)
                },
                select: {
                    resourceId: true,
                    relation: true
                }
            })
        ]);
        const taskIndex = new Map(tasks.map((task) => [task.id, task]));
        const managerRelationIndex = new Set(managerBindings.map((binding) => binding.resourceId));
        const objectRelationIndex = new Map<number, Set<string>>();

        for (const binding of objectBindings) {
            const taskId = Number(binding.resourceId);
            if (!Number.isInteger(taskId)) {
                continue;
            }
            objectRelationIndex.set(taskId, objectRelationIndex.get(taskId) ?? new Set());
            objectRelationIndex.get(taskId)?.add(binding.relation);
        }

        return taskIds.map((taskId) => {
            const task = taskIndex.get(taskId);
            const permissionsByTask: Partial<Record<TaskPermission, boolean>> = {};
            for (const permission of permissions) {
                permissionsByTask[permission] =
                    isSuperAdmin ||
                    this.hasTaskObjectManagerPermissionFromRelations(permission, managerRelationIndex) ||
                    this.isTaskCreatorGrant(task?.userId, permission, userId) ||
                    this.hasObjectRelationGrant(objectRelationIndex.get(taskId), permission);
            }

            return {
                taskId,
                permissions: permissionsByTask
            };
        });
    }

    private async getEffectiveRoleIndex(userId: string): Promise<Map<number, RoleIndexRow>> {
        const roleIds = await this.getEffectiveRoleIdsByUserId(userId);
        if (roleIds.length === 0) {
            return new Map();
        }

        const roles = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: roleIds
                },
                status: RbacStatus.ENABLE
            },
            select: {
                id: true,
                code: true,
                isSuperAdmin: true
            }
        });

        return new Map(roles.map((role) => [role.id, role]));
    }

    private async hasTaskObjectManagerPermission(
        permission: TaskPermission,
        roleIndex: Map<number, RoleIndexRow>
    ): Promise<boolean> {
        if (permission === 'manage') {
            const checks = await Promise.all(
                (['update', 'delete', 'run'] as TaskManagerPermission[]).map((managerPermission) =>
                    this.hasTaskManagerPermission(managerPermission, roleIndex)
                )
            );
            return checks.some(Boolean);
        }

        return await this.hasTaskManagerPermission(permission, roleIndex);
    }

    private getTaskManagerGrantRelationsForTaskPermissions(permissions: TaskPermission[]): string[] {
        return [
            ...new Set(
                permissions.flatMap((permission) => {
                    if (permission === 'manage') {
                        return (['update', 'delete', 'run'] as TaskManagerPermission[]).flatMap((managerPermission) =>
                            this.getTaskManagerGrantRelations(managerPermission)
                        );
                    }
                    return this.getTaskManagerGrantRelations(permission);
                })
            )
        ];
    }

    private hasTaskObjectManagerPermissionFromRelations(
        permission: TaskPermission,
        managerRelations: Set<string>
    ): boolean {
        if (permission === 'manage') {
            return (['update', 'delete', 'run'] as TaskManagerPermission[]).some((managerPermission) =>
                this.hasTaskManagerPermissionFromRelations(managerPermission, managerRelations)
            );
        }
        return this.hasTaskManagerPermissionFromRelations(permission, managerRelations);
    }

    private hasTaskManagerPermissionFromRelations(
        permission: TaskManagerPermission,
        managerRelations: Set<string>
    ): boolean {
        return this.getTaskManagerGrantRelations(permission).some((relation) => managerRelations.has(relation));
    }

    private async hasTaskManagerPermission(
        permission: TaskManagerPermission,
        roleIndex: Map<number, RoleIndexRow>
    ): Promise<boolean> {
        if (roleIndex.size === 0) {
            return false;
        }
        if (this.isSuperAdmin(roleIndex)) {
            return true;
        }

        const grantRelations = this.getTaskManagerGrantRelations(permission);
        if (grantRelations.length === 0) {
            return false;
        }

        const count = await this.prismaService.authzResourceRoleBinding.count({
            where: {
                resourceType: TASK_MANAGER_RESOURCE_TYPE,
                resourceId: {
                    in: grantRelations
                },
                roleId: {
                    in: [...roleIndex.keys()]
                }
            }
        });

        return count > 0;
    }

    private getTaskManagerGrantRelations(permission: TaskManagerPermission): string[] {
        if (permission === 'view') {
            return ['viewer', 'creator', 'updater', 'deleter', 'runner', 'manager'];
        }
        if (permission === 'create') {
            return ['creator', 'manager'];
        }
        if (permission === 'update') {
            return ['updater', 'manager'];
        }
        if (permission === 'delete') {
            return ['deleter', 'manager'];
        }
        if (permission === 'run') {
            return ['runner', 'manager'];
        }
        return ['manager'];
    }

    private getTaskObjectGrantRelations(permission: TaskPermission): string[] {
        if (permission === 'view') {
            return ['viewer', 'updater', 'deleter', 'runner'];
        }
        if (permission === 'update') {
            return ['updater'];
        }
        if (permission === 'delete') {
            return ['deleter'];
        }
        if (permission === 'run') {
            return ['runner'];
        }
        return ['updater', 'deleter', 'runner'];
    }

    private isTaskCreatorGrant(taskUserId: string | undefined, permission: TaskPermission, userId: string): boolean {
        return taskUserId === userId && (permission === 'view' || permission === 'update' || permission === 'manage');
    }

    private hasObjectRelationGrant(relations: Set<string> | undefined, permission: TaskPermission): boolean {
        if (!relations) {
            return false;
        }

        return this.getTaskObjectGrantRelations(permission).some((relation) => relations.has(relation));
    }

    private createSubjectFilters(userId: string, roleIds: number[]) {
        return [
            {
                subjectKind: 'user',
                subjectId: userId
            },
            ...(roleIds.length > 0
                ? [
                      {
                          subjectKind: 'role_assigned',
                          subjectId: {
                              in: roleIds.map((roleId) => String(roleId))
                          }
                      }
                  ]
                : [])
        ];
    }

    private async getAllTaskIds(): Promise<number[]> {
        const tasks = await this.prismaService.task.findMany({
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        });

        return tasks.map((task) => task.id);
    }

    private isSuperAdmin(roleIndex: Map<number, RoleIndexRow>): boolean {
        return [...roleIndex.values()].some((role) => role.isSuperAdmin);
    }

    private async withProjectionCache<T>(
        scope: string,
        parts: string[],
        validate: (value: unknown) => value is T,
        loader: () => Promise<T>
    ): Promise<T> {
        const cacheKey = await this.createCacheKey(scope, parts);
        const cached = await this.readCache(cacheKey, validate);
        if (cached !== null) {
            return cached;
        }

        const value = await loader();
        await this.writeCache(cacheKey, value);
        return value;
    }

    private async createCacheKey(scope: string, parts: string[]): Promise<string> {
        const version = await this.invalidationService.getProjectionCacheVersion();
        return createAppApiAuthzProjectionCacheRedisKey(scope, version, parts);
    }

    private async readCache<T>(cacheKey: string, validate: (value: unknown) => value is T): Promise<T | null> {
        if (!this.redis) {
            return null;
        }

        try {
            const raw = await this.redis.get(cacheKey);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!validate(parsed)) {
                await this.redis.del(cacheKey);
                return null;
            }

            return parsed;
        } catch {
            return null;
        }
    }

    private async writeCache(cacheKey: string, value: unknown): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.setEx(cacheKey, PROJECTION_READ_CACHE_TTL_SECONDS, JSON.stringify(value));
        } catch {
            return;
        }
    }

    private uniqueNumbers(values: number[]): number[] {
        return [...new Set(values)]
            .filter((value) => Number.isInteger(value) && value > 0)
            .sort((left, right) => left - right);
    }

    private hashStable(value: unknown): string {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
    }

    private isNumberArray(value: unknown): value is number[] {
        return Array.isArray(value) && value.every((item) => Number.isInteger(item));
    }

    private isTaskPermissionResultArray(value: unknown): value is TaskPermissionCheckResult[] {
        return (
            Array.isArray(value) &&
            value.every(
                (item) =>
                    item &&
                    typeof item === 'object' &&
                    Number.isInteger((item as TaskPermissionCheckResult).taskId) &&
                    typeof (item as TaskPermissionCheckResult).permissions === 'object'
            )
        );
    }
}
