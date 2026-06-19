import { PrismaService } from '@app/prisma-admin';
import {
    ADMIN_MENU_VERSION_DB_NAME,
    ADMIN_MENU_VERSION_REDIS_KEY,
    createAdminRoleVersionDbName,
    createAdminRoleVersionRedisKey,
    createAdminUserVersionRedisKey
} from '@app/common/constants';
import { InjectRedis } from '@nestjs-redis/client';
import { Injectable, Optional } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { ulid } from 'ulid';
import { StateVersionType } from '@app/prisma-admin/generated/client';
import type { UserStateHeaderWriter } from '@app/common';
import { createRuntimeLogger } from '@app/common';
import { BetterAuthSession } from '../better-auth/better-auth-session.type';

const REQUEST_COMPOSITE_VERSION_CACHE_KEY = Symbol.for('admin-api.admin.user-state.composite-version-cache');

type CompositeStateVersionInput = {
    userId: string;
    roles: Array<{ id: number }>;
};

type AdminUserStateRequest = Request & {
    [REQUEST_COMPOSITE_VERSION_CACHE_KEY]?: Map<string, Promise<string>>;
};

@Injectable()
export class AdminUserStateService implements UserStateHeaderWriter {
    private readonly logger = createRuntimeLogger(AdminUserStateService.name, {
        module: 'user_state',
        domain: 'user_state',
        resource: { type: 'user_state' }
    });

    constructor(
        private readonly prismaService: PrismaService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    /** 读取用户版本号（仅 Redis，未命中则初始化 ULID） */
    async getUserVersion(userId: string): Promise<string> {
        const key = this.buildUserKey(userId);
        const cached = await this.getFromCache(key);
        if (cached) return cached;
        const nextVersion = ulid();
        await this.setToCache(key, nextVersion);
        return nextVersion;
    }

    /** 重置用户版本号（按用户维度） */
    async bumpUserStateVersion(userId: string): Promise<string> {
        const nextVersion = ulid();
        await this.setToCache(this.buildUserKey(userId), nextVersion);
        return nextVersion;
    }

    /** 读取角色版本号（优先 Redis，未命中回源稳定 DB key） */
    async getRoleStateVersion(roleId: number): Promise<string> {
        const key = this.buildRoleKey(roleId);
        const cached = await this.getFromCache(key);
        if (cached) return cached;

        const name = this.buildRoleDbName(roleId);
        // 角色版本优先从 DB 回源，避免 Redis 冷启动时版本丢失导致权限抖动
        const record = await this.prismaService.stateVersion.findUnique({
            where: { type_name: { type: StateVersionType.role, name } },
            select: { version: true }
        });

        if (record?.version) {
            await this.setToCache(key, record.version);
            return record.version;
        }

        const nextVersion = ulid();
        await this.prismaService.stateVersion.upsert({
            where: { type_name: { type: StateVersionType.role, name } },
            update: { version: nextVersion },
            create: {
                type: StateVersionType.role,
                name,
                version: nextVersion
            }
        });
        await this.setToCache(key, nextVersion);
        return nextVersion;
    }

    /** 重置角色版本号（DB + Redis 同步更新） */
    async bumpRoleStateVersion(roleId: number): Promise<string> {
        const nextVersion = ulid();
        const name = this.buildRoleDbName(roleId);
        await this.prismaService.stateVersion.upsert({
            where: { type_name: { type: StateVersionType.role, name } },
            update: { version: nextVersion },
            create: {
                type: StateVersionType.role,
                name,
                version: nextVersion
            }
        });
        await this.setToCache(this.buildRoleKey(roleId), nextVersion);
        return nextVersion;
    }

    /** 读取菜单全局版本号（优先 Redis，未命中回源 DB） */
    async getMenuStateVersion(): Promise<string> {
        const cached = await this.getFromCache(ADMIN_MENU_VERSION_REDIS_KEY);
        if (cached) return cached;

        // 菜单全局版本采用单记录（type=menu, name=admin_global），未命中时再初始化
        const record = await this.prismaService.stateVersion.findUnique({
            where: { type_name: { type: StateVersionType.menu, name: ADMIN_MENU_VERSION_DB_NAME } },
            select: { version: true }
        });
        if (record?.version) {
            await this.setToCache(ADMIN_MENU_VERSION_REDIS_KEY, record.version);
            return record.version;
        }

        const nextVersion = ulid();
        await this.prismaService.stateVersion.create({
            data: {
                type: StateVersionType.menu,
                name: ADMIN_MENU_VERSION_DB_NAME,
                version: nextVersion
            }
        });
        await this.setToCache(ADMIN_MENU_VERSION_REDIS_KEY, nextVersion);
        return nextVersion;
    }

    /** 重置菜单全局版本号（DB + Redis 同步更新） */
    async bumpMenuStateVersion(): Promise<string> {
        const nextVersion = ulid();
        await this.prismaService.stateVersion.upsert({
            where: { type_name: { type: StateVersionType.menu, name: ADMIN_MENU_VERSION_DB_NAME } },
            update: { version: nextVersion },
            create: {
                type: StateVersionType.menu,
                name: ADMIN_MENU_VERSION_DB_NAME,
                version: nextVersion
            }
        });
        await this.setToCache(ADMIN_MENU_VERSION_REDIS_KEY, nextVersion);
        return nextVersion;
    }

    /** 计算用户综合版本号（menu + user + roles 的 SHA256 哈希；跨请求缓存由导航缓存 key 承担） */
    async getCompositeStateVersion(input: CompositeStateVersionInput): Promise<string> {
        // 以 roleId 去重并排序，保证参与 hash 的输入顺序稳定
        const dedupedRoles = this.normalizeCompositeRoles(input.roles);
        const [menuVersion, userVersion, roleVersions] = await Promise.all([
            this.getMenuStateVersion(),
            this.getUserVersion(input.userId),
            Promise.all(dedupedRoles.map((role) => this.getRoleStateVersion(role.id)))
        ]);

        // 将 roleId 与对应版本绑定，避免仅拼接版本值造成"同值不同角色"歧义
        const roleVersionPairs = dedupedRoles.map((role, index) => `${role.id}:${roleVersions[index] ?? ''}`);
        const raw = [menuVersion, userVersion, ...roleVersionPairs].join('|');
        // 综合版本使用 sha256，输出固定长度，便于放入响应头与前端比较
        const composite = createHash('sha256').update(raw).digest('hex');

        return composite;
    }

    /** 在同一个 HTTP request 内复用综合版本号计算结果。 */
    async getCompositeStateVersionForRequest(
        request: AdminUserStateRequest,
        input: CompositeStateVersionInput
    ): Promise<string> {
        const cache = this.resolveRequestCompositeVersionCache(request);
        const cacheKey = this.buildRequestCompositeVersionCacheKey(input);
        const cached = cache.get(cacheKey);
        if (cached) {
            return await cached;
        }

        const versionPromise = this.getCompositeStateVersion(input).catch((error: unknown) => {
            cache.delete(cacheKey);
            throw error;
        });
        cache.set(cacheKey, versionPromise);

        return await versionPromise;
    }

    /** 按请求会话写入用户状态版本响应头（含变更提示位） */
    async attachUserStateHeaders(
        request: Request & { session?: BetterAuthSession },
        response: Response
    ): Promise<void> {
        try {
            // 未携带有效会话时直接跳过，不抛异常
            if (!request.session) {
                this.logger.debug.title('attachUserStateHeaders: session 为空，跳过版本头写入', {
                    path: request.url,
                    hasSession: !!request.session,
                    sessionKeys: request.session ? Object.keys(request.session) : []
                });
                return;
            }

            this.logger.debug.title('attachUserStateHeaders: 检测到有效会话，开始写入版本头', {
                path: request.url,
                userId: request.session.user?.id,
                rolesCount: request.session.roles?.length ?? 0,
                currentVersionHeader: request.headers['x-user-state-version']
            });

            const userId = request.session.user.id;
            // 直接使用已认证会话中的角色信息，避免重复查角色表
            const roles = request.session.roles.map((role) => {
                if (!Number.isFinite(role.id)) {
                    throw new Error(`invalid role id in session: ${role.id}`);
                }
                return { id: role.id };
            });

            const latestVersion = await this.getCompositeStateVersionForRequest(request, {
                userId,
                roles
            });

            if (!latestVersion) return;
            this.logger.debug.title('attachUserStateHeaders: 写入版本头', {
                path: request.url,
                userId: request.session.user?.id,
                rolesCount: request.session.roles?.length ?? 0,
                latestVersion
            });
            // 返回服务端当前认定的最新版本，客户端以该值作为本地版本基准
            response.setHeader('x-user-state-version', latestVersion);

            const incomingVersionRaw = request.headers['x-user-state-version'];
            const incomingVersion = Array.isArray(incomingVersionRaw) ? incomingVersionRaw[0] : incomingVersionRaw;
            // 客户端版本与服务端版本不一致时，仅追加 changed 提示位，避免强耦合前端刷新时机。
            if (incomingVersion && incomingVersion !== latestVersion) {
                response.setHeader('x-user-state-changed', '1');
            }
        } catch (error) {
            // 用户状态头失败不影响业务返回，避免阻断主流程
            // 此处保留完整 logger.error(message, { error }) 调用形式：需要保留 error.stack 进 RuntimeLogEntry.error 用于排查
            this.logger.error('attachUserStateHeaders error', {
                error
            });
        }
    }

    /** 组装用户版本缓存键 */
    private buildUserKey(userId: string): string {
        return createAdminUserVersionRedisKey(userId);
    }

    /** 组装角色版本缓存键 */
    private buildRoleKey(roleId: number): string {
        return createAdminRoleVersionRedisKey(roleId);
    }

    /** 组装角色版本 DB 记录名称 */
    private buildRoleDbName(roleId: number): string {
        return createAdminRoleVersionDbName(roleId);
    }

    /** 标准化综合版本输入角色，保证 hash 和 request memo key 使用同一套去重/排序口径。 */
    private normalizeCompositeRoles(roles: CompositeStateVersionInput['roles']): CompositeStateVersionInput['roles'] {
        return Array.from(new Map(roles.map((role) => [role.id, role])).values()).sort((a, b) => a.id - b.id);
    }

    /** 组装 request 级综合版本缓存键。 */
    private buildRequestCompositeVersionCacheKey(input: CompositeStateVersionInput): string {
        const rolesKey = this.normalizeCompositeRoles(input.roles)
            .map((role) => `${role.id}`)
            .join(',');
        return `${input.userId}|${rolesKey}`;
    }

    /** 获取或初始化 request 级综合版本缓存。 */
    private resolveRequestCompositeVersionCache(request: AdminUserStateRequest): Map<string, Promise<string>> {
        request[REQUEST_COMPOSITE_VERSION_CACHE_KEY] ??= new Map<string, Promise<string>>();
        return request[REQUEST_COMPOSITE_VERSION_CACHE_KEY];
    }

    /** 从 Redis 读取版本号（Redis 不可用时返回 null） */
    private async getFromCache(cacheKey: string): Promise<string | null> {
        if (!this.redis) return null;
        return this.redis.get(cacheKey);
    }

    /** 写入 Redis 版本号（Redis 不可用时静默跳过） */
    private async setToCache(cacheKey: string, value: string): Promise<void> {
        if (!this.redis) return;
        await this.redis.set(cacheKey, value);
    }
}
