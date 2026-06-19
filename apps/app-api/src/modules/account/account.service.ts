import { BusinessException, ErrorCodes } from '@app/common';
import { ACCOUNT_NAVIGATION_CACHE_TTL_SECONDS, createAppApiAccountNavigationRedisKey } from '@app/common/constants';
import { PrismaService } from '@app/prisma-app';
import { asPrismaISODate } from '@app/prisma-app/extensions/date-to-iso-string.extension';
import { MenuStatusEnum, MenuTypeEnum, RbacMenu, RbacStatus } from '@app/prisma-app/generated/client';
import { InjectRedis } from '@nestjs-redis/client';
import { Injectable, Optional } from '@nestjs/common';
import { Traceable } from 'nestjs-otel';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';
import { randomBytes } from 'node:crypto';
import { IncomingHttpHeaders } from 'node:http';
import type { RedisClientType } from 'redis';
import type { BetterAuthRequest } from '../better-auth/better-auth-request';
import type { BetterAuthSession } from '../better-auth/better-auth-session.type';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../system/rbac/rbac-graph.service';
import { AdminUserStateService } from '../user-state/admin-user-state.service';

type AccountNavigationCachePayload = {
    menus: RbacMenu[];
    permissions: string[];
};

export type AccountNavigationResult = AccountNavigationCachePayload & {
    userStateVersion: string;
};

/**
 * 负责账号信息、菜单、改密和密码重置的 Better Auth 业务编排。
 */
@Traceable()
@Injectable()
export class AccountService {
    private readonly tokenExpiryMinutes = 30;

    constructor(
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService<any>,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly rbacGraphService: SystemRbacGraphService,
        private readonly adminUserStateService: AdminUserStateService,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    /**
     * 把 Node 请求头转换成 Better Auth API 所需的 Headers 对象。
     */
    private buildHeaders(headers: IncomingHttpHeaders): Headers {
        const result = new Headers();

        for (const [key, value] of Object.entries(headers)) {
            if (value === undefined) {
                continue;
            }

            result.set(key, Array.isArray(value) ? value.join(',') : value);
        }

        return result;
    }

    /**
     * Better Auth 密码策略错误统一转成面向用户的中文提示。
     */
    private getPasswordPolicyErrorCode(errorCode: string) {
        if (errorCode === 'PASSWORD_TOO_SHORT') {
            return ErrorCodes.USER.PASSWORD_TOO_SHORT;
        }

        if (errorCode === 'PASSWORD_TOO_LONG') {
            return ErrorCodes.USER.PASSWORD_TOO_LONG;
        }

        return null;
    }

    /**
     * 从当前会话中提取角色编码列表，供前端界面态直接消费。
     */
    private getRoleCodes(session: BetterAuthSession): string[] {
        return (session.roles ?? []).map((role) => role.code).filter((code) => Boolean(code));
    }

    /**
     * 聚合当前账户信息、角色编码和当前全量菜单权限点列表。
     */
    async getAccountInfo(session: BetterAuthSession, request?: BetterAuthRequest) {
        const navigation = await this.getAccountNavigation(session, request);
        return {
            user: {
                ...session.user,
                profile: session.profile
            },
            permission: navigation.permissions,
            roles: this.getRoleCodes(session)
        };
    }

    /**
     * 一次性获取当前用户前端启动所需的菜单、权限和综合状态版本。
     */
    async getAccountNavigation(
        session: BetterAuthSession,
        request?: BetterAuthRequest
    ): Promise<AccountNavigationResult> {
        const userStateVersion = await this.resolveAccountNavigationVersion(session, request);
        const cacheKey = this.createAccountNavigationCacheKey(session.user.id, userStateVersion);
        const cached = await this.readAccountNavigationCache(cacheKey);
        if (cached) {
            return {
                ...cached,
                userStateVersion
            };
        }

        const payload = await this.buildAccountNavigationPayload(session.user.id);
        await this.writeAccountNavigationCache(cacheKey, payload);

        return {
            ...payload,
            userStateVersion
        };
    }

    /**
     * 通过 RBAC effective 读模型计算可见菜单，并返回用户当前拥有的 RBAC 权限 code。
     */
    private async buildAccountNavigationPayload(userId: string): Promise<AccountNavigationCachePayload> {
        const state = await this.rbacGraphService.getUserEffectiveState(userId);

        const enabledMenus =
            state.visibleMenuIds.length > 0
                ? await this.prismaService.rbacMenu.findMany({
                      where: {
                          status: MenuStatusEnum.ENABLE
                      },
                      orderBy: [{ order: 'asc' }, { id: 'asc' }]
                  })
                : [];
        const navigationMenuIds = this.resolveNavigationMenuIds(state.visibleMenuIds, enabledMenus);

        return {
            menus: enabledMenus.filter((menu) => navigationMenuIds.has(menu.id) && menu.type !== MenuTypeEnum.Button),
            permissions: state.permissionCodes
        };
    }

    private resolveNavigationMenuIds(visibleMenuIds: number[], enabledMenus: RbacMenu[]): Set<number> {
        const visibleMenuIdSet = new Set(visibleMenuIds);
        const menuById = new Map(enabledMenus.map((menu) => [menu.id, menu]));
        const result = new Set<number>();

        const includeWithAncestors = (menuId: number, visiting = new Set<number>()): boolean => {
            if (result.has(menuId)) {
                return true;
            }

            const menu = menuById.get(menuId);
            if (!menu || visiting.has(menuId)) {
                return false;
            }

            visiting.add(menuId);
            if (menu.pid !== null && menu.pid !== undefined && !includeWithAncestors(menu.pid, visiting)) {
                visiting.delete(menuId);
                return false;
            }
            visiting.delete(menuId);
            result.add(menuId);
            return true;
        };

        for (const menu of enabledMenus) {
            if (visibleMenuIdSet.has(menu.id) && menu.type !== MenuTypeEnum.Button) {
                includeWithAncestors(menu.id);
            }
        }

        return result;
    }

    private async getConfiguredPermissionStatusByCode(permissionCodes: string[]) {
        if (permissionCodes.length === 0) {
            return new Map<string, { id: number; status: RbacStatus }>();
        }

        const rows = await this.prismaService.rbacPermission.findMany({
            where: {
                code: {
                    in: permissionCodes
                },
                deletedAt: null
            },
            select: {
                id: true,
                code: true,
                status: true
            }
        });
        return new Map(rows.map((row) => [row.code, { id: row.id, status: row.status }]));
    }

    /**
     * 使用当前 session 中的角色数据计算综合状态版本，保持缓存 key 与响应头版本一致。
     */
    private async resolveAccountNavigationVersion(
        session: BetterAuthSession,
        request?: BetterAuthRequest
    ): Promise<string> {
        const input = {
            userId: session.user.id,
            roles: session.roles.map((role) => ({
                id: role.id,
                name: role.name
            }))
        };

        if (request) {
            return await this.adminUserStateService.getCompositeStateVersionForRequest(request, input);
        }

        return await this.adminUserStateService.getCompositeStateVersion(input);
    }

    /**
     * 生成当前账号导航态缓存 key，版本号变更后天然命中新 key。
     */
    private createAccountNavigationCacheKey(userId: string, userStateVersion: string): string {
        return createAppApiAccountNavigationRedisKey(userId, userStateVersion);
    }

    /**
     * 从 Redis 读取当前账号导航态缓存，缓存异常或脏数据不阻断主授权链路。
     */
    private async readAccountNavigationCache(cacheKey: string): Promise<AccountNavigationCachePayload | null> {
        if (!this.redis) {
            return null;
        }

        try {
            const raw = await this.redis.get(cacheKey);
            if (!raw) {
                return null;
            }

            const payload = JSON.parse(raw) as AccountNavigationCachePayload;
            if (!this.isAccountNavigationCachePayload(payload)) {
                await this.redis.del(cacheKey);
                return null;
            }
            return payload;
        } catch {
            return null;
        }
    }

    /**
     * 写入当前账号导航态缓存；失败时跳过缓存，不影响本次菜单和权限返回。
     */
    private async writeAccountNavigationCache(cacheKey: string, payload: AccountNavigationCachePayload): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.setEx(cacheKey, ACCOUNT_NAVIGATION_CACHE_TTL_SECONDS, JSON.stringify(payload));
        } catch {
            return;
        }
    }

    /**
     * 校验 Redis 中的导航态缓存结构，避免脏缓存污染前端权限和菜单。
     */
    private isAccountNavigationCachePayload(payload: unknown): payload is AccountNavigationCachePayload {
        if (!payload || typeof payload !== 'object') {
            return false;
        }

        const candidate = payload as Partial<AccountNavigationCachePayload>;
        return (
            Array.isArray(candidate.menus) &&
            Array.isArray(candidate.permissions) &&
            this.hasCompleteNavigationMenuParents(candidate.menus)
        );
    }

    private hasCompleteNavigationMenuParents(menus: Array<Partial<RbacMenu>>): boolean {
        const menuIds = new Set(menus.map((menu) => menu.id).filter((id): id is number => typeof id === 'number'));
        return menus.every((menu) => menu.pid === null || menu.pid === undefined || menuIds.has(menu.pid));
    }

    /**
     * 批量检查当前登录用户是否拥有指定菜单权限点，用于前端按钮态减少 N 次请求。
     */
    async checkAccountPermissionsBatch(session: BetterAuthSession, permissions: string[]) {
        const requestedPermissions = [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))];
        const checkedAt = new Date().toISOString();
        if (requestedPermissions.length === 0) {
            return {
                results: [],
                checkedAt
            };
        }

        const configuredPermissionByCode = await this.getConfiguredPermissionStatusByCode(requestedPermissions);
        const enabledPermissionCodes = requestedPermissions.filter(
            (permission) => configuredPermissionByCode.get(permission)?.status === RbacStatus.ENABLE
        );
        const grantedCodeSet =
            enabledPermissionCodes.length > 0
                ? new Set(await this.rbacAuthorizationService.getGrantedCodes(session.user.id))
                : new Set<string>();

        return {
            results: permissions.map((permission) => {
                const normalizedPermission = permission.trim();
                const configuredPermission = configuredPermissionByCode.get(normalizedPermission);
                if (!configuredPermission) {
                    return {
                        permission,
                        allowed: false,
                        permissionId: null,
                        permissionStatus: null,
                        reason: 'permission_not_found'
                    };
                }

                if (configuredPermission.status !== RbacStatus.ENABLE) {
                    return {
                        permission,
                        allowed: false,
                        permissionId: configuredPermission.id,
                        permissionStatus: configuredPermission.status,
                        reason: 'permission_disabled'
                    };
                }

                const allowed = grantedCodeSet.has(normalizedPermission);
                return {
                    permission,
                    allowed,
                    permissionId: configuredPermission.id,
                    permissionStatus: configuredPermission.status,
                    reason: allowed ? 'rbac_allowed' : 'rbac_denied'
                };
            }),
            checkedAt
        };
    }

    /**
     * 为指定邮箱生成 Better Auth 密码重置令牌。
     */
    async requestPasswordReset(email: string) {
        const user = await this.prismaService.betterAuthUser.findUnique({
            where: {
                email
            }
        });

        if (!user) {
            return {
                message: '如果该邮箱已注册，您将收到重置密码的邮件'
            };
        }

        const authContext = await this.authService.instance.$context;
        const token = randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60 * 1000);

        await this.prismaService.betterAuthVerification.deleteMany({
            where: {
                value: user.id,
                identifier: {
                    startsWith: 'reset-password:'
                }
            }
        });

        await authContext.internalAdapter.createVerificationValue({
            value: user.id,
            identifier: `reset-password:${token}`,
            expiresAt
        });

        return {
            message: '如果该邮箱已注册，您将收到重置密码的邮件',
            ...(process.env.NODE_ENV !== 'production' && { token })
        };
    }

    /**
     * 校验密码重置令牌是否仍然有效。
     */
    async verifyResetToken(token: string) {
        const authContext = await this.authService.instance.$context;
        const verification = await authContext.internalAdapter.findVerificationValue(`reset-password:${token}`);
        const serializedVerification = asPrismaISODate(verification);

        const now = new Date().toISOString();
        if (!serializedVerification || serializedVerification.expiresAt < now) {
            throw new BusinessException(ErrorCodes.USER.RESET_TOKEN_INVALID);
        }

        return {
            valid: true
        };
    }

    /**
     * 使用 Better Auth 官方重置密码流程执行密码重置。
     */
    async resetPassword(token: string, newPassword: string) {
        try {
            await this.authService.api.resetPassword({
                body: {
                    token,
                    newPassword
                }
            });
        } catch (error) {
            if (error instanceof APIError) {
                const errorBody = (error as APIError & { body?: Record<string, unknown> }).body ?? {};
                const errorCode = typeof errorBody.code === 'string' ? errorBody.code : '';

                if (errorCode === 'INVALID_TOKEN') {
                    throw new BusinessException(ErrorCodes.USER.RESET_TOKEN_INVALID);
                }

                const passwordErrorCode = this.getPasswordPolicyErrorCode(errorCode);
                if (passwordErrorCode) {
                    throw new BusinessException(passwordErrorCode);
                }
            }

            throw error;
        }

        return {
            message: '密码重置成功'
        };
    }

    /**
     * 使用当前会话调用 Better Auth 改密接口，并保留原有错误码语义。
     */
    async changePassword(
        _session: BetterAuthSession,
        headers: IncomingHttpHeaders,
        oldPassword: string,
        newPassword: string
    ) {
        try {
            await this.authService.api.changePassword({
                headers: this.buildHeaders(headers),
                body: {
                    currentPassword: oldPassword,
                    newPassword,
                    revokeOtherSessions: true
                }
            });
        } catch (error) {
            if (error instanceof APIError) {
                const errorBody = (error as APIError & { body?: Record<string, unknown> }).body ?? {};
                const errorCode = typeof errorBody.code === 'string' ? errorBody.code : '';

                if (errorCode === 'INVALID_PASSWORD') {
                    throw new BusinessException(ErrorCodes.USER.OLD_PASSWORD_ERROR);
                }

                const passwordErrorCode = this.getPasswordPolicyErrorCode(errorCode);
                if (passwordErrorCode) {
                    throw new BusinessException(passwordErrorCode);
                }
            }

            throw error;
        }

        return {
            message: '密码修改成功'
        };
    }
}
