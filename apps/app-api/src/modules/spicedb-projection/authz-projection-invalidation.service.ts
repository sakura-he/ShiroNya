import { createRuntimeLogger } from '@app/common';
import { APP_API_AUTHZ_PROJECTION_CACHE_VERSION_REDIS_KEY } from '@app/common/constants';
import { PrismaService } from '@app/prisma-app';
import { InjectRedis } from '@nestjs-redis/client';
import { Injectable, Optional } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { ulid } from 'ulid';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import type { AdminSpiceDbRelationshipChangeEvent } from './spicedb-projection.constants';

export const AUTHZ_PROJECTION_CACHE_VERSION_KEY = APP_API_AUTHZ_PROJECTION_CACHE_VERSION_REDIS_KEY;

type ProjectionInvalidationSets = {
    userIds: Set<string>;
    roleIds: Set<number>;
    groupIds: Set<number>;
    bumpMenuGlobal: boolean;
};

@Injectable()
export class AuthzProjectionInvalidationService {
    private readonly logger = createRuntimeLogger(AuthzProjectionInvalidationService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'authz_projection_invalidation' }
    });

    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    /**
     * 返回当前投影读模型缓存版本。不存在时不主动写入，避免冷启动产生无意义版本抖动。
     */
    async getProjectionCacheVersion(): Promise<string> {
        if (!this.redis) {
            return 'no-redis';
        }

        try {
            return (await this.redis.get(AUTHZ_PROJECTION_CACHE_VERSION_KEY)) ?? '0';
        } catch {
            return 'redis-unavailable';
        }
    }

    /**
     * 仅推进投影热缓存版本，不改业务 user-state。适合业务写路径已自行 bump user-state 的场景。
     */
    async bumpProjectionCacheVersion(): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.set(AUTHZ_PROJECTION_CACHE_VERSION_KEY, ulid());
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影热缓存版本写入失败
            this.logger.warn('推进投影读模型缓存版本失败', { error });
        }
    }

    /**
     * 根据基础关系变更刷新 user-state 和投影热缓存版本。
     */
    async invalidateByProjectionUpdates(events: AdminSpiceDbRelationshipChangeEvent[]): Promise<void> {
        if (events.length === 0) {
            return;
        }

        const invalidation = this.collectInvalidationSets(events);
        try {
            await this.expandGroupImpact(invalidation);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影关系展开失败
            this.logger.warn('展开投影关系影响范围失败，退回保守菜单态刷新', { error });
            invalidation.bumpMenuGlobal = true;
        }
        await Promise.allSettled([
            this.bumpProjectionCacheVersion(),
            ...[...invalidation.userIds].map((userId) => this.adminUserStateService.bumpUserStateVersion(userId)),
            ...[...invalidation.roleIds].map((roleId) => this.bumpRoleVersion(roleId)),
            ...(invalidation.bumpMenuGlobal ? [this.adminUserStateService.bumpMenuStateVersion()] : [])
        ]);
    }

    /**
     * 范围无法精确计算时使用保守失效：推进投影缓存版本并刷新菜单全局态。
     */
    async invalidateBroadProjectionReadModel(): Promise<void> {
        await Promise.allSettled([
            this.bumpProjectionCacheVersion(),
            this.adminUserStateService.bumpMenuStateVersion()
        ]);
    }

    private collectInvalidationSets(events: AdminSpiceDbRelationshipChangeEvent[]): ProjectionInvalidationSets {
        const result: ProjectionInvalidationSets = {
            userIds: new Set(),
            roleIds: new Set(),
            groupIds: new Set(),
            bumpMenuGlobal: false
        };

        for (const event of events) {
            if (event.resourceType === 'role' && event.relation === 'assignee') {
                this.addNumber(result.roleIds, event.resourceId);
                if (event.subjectType === 'user' && event.subjectId) {
                    result.userIds.add(event.subjectId);
                }
                if (event.subjectType === 'user_group') {
                    this.addNumber(result.groupIds, event.subjectId);
                }
            }

            if (event.resourceType === 'user_group' && event.relation === 'member') {
                this.addNumber(result.groupIds, event.resourceId);
                if (event.subjectType === 'user' && event.subjectId) {
                    result.userIds.add(event.subjectId);
                }
            }

            if (event.resourceType === 'menu' && (event.relation === 'viewer' || event.relation === 'manager')) {
                this.addNumber(result.roleIds, event.subjectId);
                result.bumpMenuGlobal = true;
            }
        }

        return result;
    }

    private async expandGroupImpact(invalidation: ProjectionInvalidationSets): Promise<void> {
        const groupIds = [...invalidation.groupIds];
        if (groupIds.length === 0) {
            return;
        }

        const [members, groupRoles] = await Promise.all([
            this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                where: {
                    groupId: {
                        in: groupIds
                    }
                },
                select: {
                    userId: true
                }
            }),
            this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                where: {
                    groupId: {
                        in: groupIds
                    }
                },
                select: {
                    roleId: true
                }
            })
        ]);

        members.forEach((member) => invalidation.userIds.add(member.userId));
        groupRoles.forEach((groupRole) => invalidation.roleIds.add(groupRole.roleId));
    }

    private async bumpRoleVersion(roleId: number): Promise<void> {
        const role = await this.prismaService.rbacRole.findUnique({
            where: {
                id: roleId
            },
            select: {
                id: true,
                name: true
            }
        });
        if (!role) {
            return;
        }

        await this.adminUserStateService.bumpRoleStateVersion(role.id);
    }

    private addNumber(target: Set<number>, value: string | undefined): void {
        const numberValue = Number(value);
        if (Number.isInteger(numberValue) && numberValue > 0) {
            target.add(numberValue);
        }
    }
}
