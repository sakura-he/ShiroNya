import {
    BusinessException,
    ErrorCodes,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    UnauthException,
    createRuntimeLogger,
    normalizeExceptionToShiroErrorResponse,
    type ShiroNormalizedException
} from '@app/common';
import { dash, sentinel } from '@better-auth/infra';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { localization } from 'better-auth-localization';
// @ts-ignore
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
// @ts-ignore
import { admin, bearer, customSession, openAPI, phoneNumber, username } from 'better-auth/plugins';
// @ts-ignore
import { adminAc, defaultAc } from 'better-auth/plugins/admin/access';
import { ulid } from 'ulid';
import { AdminErrorCodes } from '../../common/constants/index';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import { BetterAuthSession } from './better-auth-session.type';
import { isActiveBetterAuthBan } from './better-auth-ban';
import { AdminBetterAuthConfig, BetterAuthOptionsDeps } from './types';

const ADMIN_BETTER_AUTH_BASE_PATH = '/admin/api/auth';
const ADMIN_BETTER_AUTH_COOKIE_NAME = 'admin-api.session';
const ADMIN_PHONE_NUMBER_PATTERN = /^1[3-9]\d{9}$/;
const betterAuthApiErrorLogger = createRuntimeLogger('BetterAuthApiError', {
    module: 'auth',
    domain: 'auth',
    resource: { type: 'better_auth_api' }
});

type BetterAuthApiErrorLike = Error & {
    body?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    clientVersion?: unknown;
    cause?: unknown;
};

const DATABASE_RUNTIME_ERROR_PATTERNS = [
    /prisma/i,
    /database/i,
    /connection terminated/i,
    /connection timeout/i,
    /timeout/i,
    /econnreset/i,
    /econnrefused/i,
    /etimedout/i,
    /pg[_-]?pool/i,
    /postgres/i
];

/**
 * Better Auth admin 插件的 impersonate endpoint 自带 access-control 检查。
 *
 * 项目自身的授权源仍是 RBAC；这里仅让插件内部的 `user.impersonate` 闸门放行，
 * 实际能否伪装由 `buildAdminImpersonationRbacGuardPlugin()` 检查 `system.user.impersonate`。
 */
const betterAuthUserRoleForRbacImpersonation = defaultAc.newRole({
    user: ['impersonate'],
    session: []
});

function generateBetterAuthId(): string {
    return ulid();
}

/**
 * 解析 Better Auth 可信来源列表。
 */
function parseTrustedOrigins(rawTrustedOrigins: string): string[] {
    const trustedOrigins = rawTrustedOrigins
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

    if (trustedOrigins.length === 0) {
        throw new Error(AdminErrorCodes.CONFIG.TRUSTED_ORIGINS_MISSING.message);
    }

    return trustedOrigins;
}

function resolveSecureCookie(configService: BetterAuthOptionsDeps['configService']): boolean {
    const rawValue = configService.get<string>('ADMIN_BETTER_AUTH_COOKIE_SECURE');

    if (rawValue === 'true') {
        return true;
    }

    if (rawValue === 'false') {
        return false;
    }

    return process.env.NODE_ENV === 'production';
}

function getOptionalConfig(configService: BetterAuthOptionsDeps['configService'], key: string): string | undefined {
    const value = configService.get<string>(key)?.trim();
    return value ? value : undefined;
}

function validateAdminPhoneNumber(phoneNumber: string): boolean {
    return ADMIN_PHONE_NUMBER_PATTERN.test(phoneNumber.trim());
}

async function sendAdminPhoneOtp(data: { phoneNumber: string; code: string }, ctx?: any): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
        ctx?.context?.logger?.error?.('Admin phone OTP requested but SMS provider is not configured');
        throw new Error('ADMIN_SMS_PROVIDER_NOT_CONFIGURED');
    }

    ctx?.context?.logger?.info?.(`[admin-phone-auth] ${data.phoneNumber} OTP: ${data.code}`);
}

function getAdminPhoneTempEmail(phoneNumber: string): string {
    return `phone-${phoneNumber}@shiro-nya.local`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function pickStringOrNumber(value: unknown): string | number | undefined {
    return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function collectErrorText(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;

    for (let depth = 0; depth < 3 && current; depth += 1) {
        if (current instanceof Error) {
            parts.push(current.name, current.message);
            current = (current as { cause?: unknown }).cause;
            continue;
        }

        if (isRecord(current)) {
            const name = current.name;
            const message = current.message;
            if (typeof name === 'string') parts.push(name);
            if (typeof message === 'string') parts.push(message);
            current = current.cause;
            continue;
        }

        parts.push(String(current));
        break;
    }

    return parts.join('\n');
}

function isDatabaseRuntimeError(error: unknown): boolean {
    const record = isRecord(error) ? error : undefined;
    if (typeof record?.clientVersion === 'string') {
        return true;
    }

    const code = pickStringOrNumber(record?.code);
    if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
        return true;
    }

    const text = collectErrorText(error);
    return DATABASE_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeBetterAuthInfrastructureError(error: unknown): ShiroNormalizedException {
    const normalized = normalizeExceptionToShiroErrorResponse(error);

    if (normalized.statusCode >= 500 && isDatabaseRuntimeError(error)) {
        return {
            category: 'http',
            statusCode: 500,
            body: {
                data: {
                    source: 'better-auth',
                    reason: 'database'
                },
                code: ErrorCodes.DATABASE.ERROR.code,
                message: ErrorCodes.DATABASE.ERROR.message
            }
        };
    }

    return normalized;
}

function normalizeExistingBetterAuthApiError(error: BetterAuthApiErrorLike): ShiroNormalizedException {
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    const responseBody = isRecord(error.body) ? error.body : undefined;
    const rawCode = pickStringOrNumber(responseBody?.code) ?? pickStringOrNumber(error.status) ?? statusCode;
    const message =
        typeof responseBody?.message === 'string' && responseBody.message.length > 0
            ? responseBody.message
            : error.message || 'Better Auth API error';

    return {
        category: 'http',
        statusCode,
        body: {
            data: responseBody?.data ?? null,
            code: typeof rawCode === 'number' ? rawCode : statusCode,
            message
        }
    };
}

function buildBetterAuthRuntimeError(error: unknown) {
    if (error instanceof Error) {
        const record = error as BetterAuthApiErrorLike;
        const code = pickStringOrNumber(record.code) ?? pickStringOrNumber(record.status);

        return {
            name: error.name,
            code,
            message: error.message,
            stack: error.stack,
            details: {
                status: record.status,
                statusCode: record.statusCode,
                clientVersion: record.clientVersion,
                body: record.body,
                cause:
                    record.cause instanceof Error
                        ? {
                              name: record.cause.name,
                              message: record.cause.message,
                              stack: record.cause.stack
                          }
                        : record.cause
            }
        };
    }

    return {
        message: typeof error === 'string' ? error : String(error)
    };
}

function recordBetterAuthApiError(error: unknown, normalized: ShiroNormalizedException): void {
    betterAuthApiErrorLogger.system({
        level: normalized.statusCode >= 500 ? 'error' : 'warn',
        message: `[Better Auth] ${normalized.body.message}`,
        event: 'better_auth_api_exception',
        http: {
            statusCode: normalized.statusCode,
            bizCode: normalized.body.code,
            responseBody: normalized.body
        },
        result: {
            success: false,
            message: normalized.body.message
        },
        error: buildBetterAuthRuntimeError(error),
        context: {
            category: normalized.category,
            source: 'better-auth.onAPIError'
        }
    });
}

function throwShiroNormalizedBetterAuthError(error: unknown): never {
    const normalized = normalizeBetterAuthInfrastructureError(error);
    recordBetterAuthApiError(error, normalized);
    throw new APIError(normalized.statusCode, normalized.body);
}

/**
 * 判断 Better Auth 响应体是否已经是 admin customSession 结构。
 */
function isBetterAuthSessionPayload(payload: unknown): payload is BetterAuthSession {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const maybeSession = payload as Partial<BetterAuthSession>;
    return Boolean(
        maybeSession.user &&
        typeof maybeSession.user.id === 'string' &&
        maybeSession.session &&
        typeof maybeSession.session.userId === 'string' &&
        Array.isArray(maybeSession.roles)
    );
}

/**
 * 合并 Access-Control-Expose-Headers，确保浏览器可以读取用户状态版本响应头。
 */
function appendExposedHeader(existingHeaders: string | null | undefined, headerName: string): string {
    const headersSet = new Set(
        String(existingHeaders ?? '')
            .split(',')
            .map((header) => header.trim())
            .filter((header) => header.length > 0)
    );
    headersSet.add(headerName);
    return Array.from(headersSet).join(', ');
}

/**
 * 读取 Better Auth 当前端点最终返回的成功响应体，用于从 getSession 结果中提取 customSession。
 */
async function getSuccessfulEndpointResponse(ctx: { context: { returned?: unknown } }): Promise<unknown | null> {
    const returned = ctx.context.returned;
    if (!returned) {
        return null;
    }

    if (returned instanceof Response) {
        if (returned.status !== 200) {
            return null;
        }
        return returned.clone().json();
    }

    if (isAPIError(returned)) {
        return null;
    }

    return returned;
}

/**
 * 为 Better Auth 的 getSession 成功响应补充最新用户状态版本号。
 */
function buildAdminUserStateVersionPlugin({
    adminUserStateService
}: Pick<BetterAuthOptionsDeps, 'adminUserStateService'>): any {
    return {
        id: 'admin-user-state-version',
        hooks: {
            after: [
                {
                    /**
                     * 仅在 getSession 成功响应时补充版本号，避免登录响应重复计算。
                     */
                    matcher(context: { path?: string }) {
                        return context.path === '/get-session';
                    },
                    handler: createAuthMiddleware(async (ctx: any) => {
                        if (!ctx.request) {
                            return;
                        }

                        const endpointResponse = await getSuccessfulEndpointResponse(ctx);
                        const sessionPayload = isBetterAuthSessionPayload(endpointResponse) ? endpointResponse : null;
                        if (!sessionPayload) {
                            return;
                        }

                        const latestVersion = await adminUserStateService.getCompositeStateVersion({
                            userId: sessionPayload.user.id,
                            roles: sessionPayload.roles.map((role) => ({
                                id: role.id,
                                name: role.name
                            }))
                        });

                        if (!latestVersion) {
                            return;
                        }

                        ctx.setHeader('x-user-state-version', latestVersion);
                        ctx.setHeader(
                            'Access-Control-Expose-Headers',
                            appendExposedHeader(
                                ctx.context.responseHeaders?.get('access-control-expose-headers'),
                                'x-user-state-version'
                            )
                        );
                    })
                }
            ]
        }
    };
}

/**
 * Better Auth admin 插件负责创建伪装会话，这里补上项目 RBAC 动作权限。
 */
function buildAdminImpersonationRbacGuardPlugin({
    prisma,
    rbacAuthorizationService
}: Pick<BetterAuthOptionsDeps, 'prisma' | 'rbacAuthorizationService'>): any {
    return {
        id: 'admin-impersonation-rbac-guard',
        hooks: {
            before: [
                {
                    matcher(context: { path?: string }) {
                        return context.path === '/admin/impersonate-user';
                    },
                    handler: createAuthMiddleware(async (ctx: any) => {
                        const actorId = await resolveAdminImpersonationActorId(ctx, prisma);
                        if (!actorId) {
                            throw APIError.fromStatus('UNAUTHORIZED');
                        }

                        await rbacAuthorizationService.assertPermission(
                            actorId,
                            RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE
                        );
                        await assertAdminImpersonationTargetAvailable(ctx, prisma);
                    })
                }
            ]
        }
    };
}

/**
 * 后台只开放账号密码和手机号登录，显式拦截 Better Auth 默认邮箱入口。
 */
function buildForbidAdminEmailAuthPlugin(): any {
    return {
        id: 'admin-forbid-email-auth',
        hooks: {
            before: [
                {
                    matcher(context: { path?: string }) {
                        return context.path === '/sign-in/email' || context.path === '/sign-up/email';
                    },
                    handler: createAuthMiddleware(async () => {
                        throw APIError.fromStatus('FORBIDDEN');
                    })
                }
            ]
        }
    };
}

function readBearerToken(ctx: any): string | null {
    const headers = ctx.request?.headers ?? ctx.headers;
    const authorization = headers?.get?.('authorization') ?? headers?.get?.('Authorization');
    if (typeof authorization !== 'string') {
        return null;
    }

    const match = authorization.trim().match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

async function resolveAdminImpersonationActorId(ctx: any, prisma: BetterAuthOptionsDeps['prisma']) {
    const bearerToken = readBearerToken(ctx);
    if (bearerToken) {
        const session = await prisma.betterAuthSession.findFirst({
            where: {
                token: bearerToken,
                expiresAt: {
                    gt: new Date()
                }
            },
            select: {
                userId: true,
                impersonatedBy: true
            }
        });
        if (session) {
            return session.impersonatedBy ?? session.userId;
        }
    }

    const session = await getSessionFromCtx(ctx);
    return session?.session?.impersonatedBy ?? session?.user?.id ?? null;
}

function readImpersonationTargetUserId(ctx: any): string | null {
    const userId = ctx.body?.userId;
    return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
}

async function assertAdminImpersonationTargetAvailable(ctx: any, prisma: BetterAuthOptionsDeps['prisma']) {
    const targetUserId = readImpersonationTargetUserId(ctx);
    if (!targetUserId) {
        return;
    }

    const targetUser = await prisma.betterAuthUser.findUnique({
        where: {
            id: targetUserId
        },
        select: {
            banned: true,
            banExpires: true
        }
    });

    if (isActiveBetterAuthBan(targetUser)) {
        throw APIError.from('FORBIDDEN', {
            code: 'TARGET_USER_BANNED',
            message: '目标用户已封禁，不能被伪装；请先解封后再操作。'
        });
    }
}

/**
 * 构建 admin-api 对外运行版 Better Auth 配置。
 */
export function buildBetterAuthOptions({
    prisma,
    configService,
    adminUserStateService,
    rbacAuthorizationService,
    betterAuthService
}: BetterAuthOptionsDeps): AdminBetterAuthConfig {
    const trustedOrigins = parseTrustedOrigins(configService.getOrThrow<string>('ADMIN_BETTER_AUTH_TRUSTED_ORIGINS'));
    const secureCookie = resolveSecureCookie(configService);

    return {
        database: prismaAdapter(prisma, {
            provider: 'postgresql'
        }),
        basePath: ADMIN_BETTER_AUTH_BASE_PATH,
        appName: configService.getOrThrow<string>('APP_NAME'),
        secret: configService.getOrThrow<string>('ADMIN_BETTER_AUTH_SECRET'),
        baseURL: configService.getOrThrow<string>('ADMIN_BETTER_AUTH_URL'),
        trustedOrigins,
        user: {
            modelName: 'betterAuthUser',
            additionalFields: {
                phoneNumber: {
                    type: 'string',
                    required: false,
                    unique: true
                },
                phoneNumberVerified: {
                    type: 'boolean',
                    required: false,
                    defaultValue: false
                }
            }
        },
        account: {
            modelName: 'betterAuthAccount'
        },
        verification: {
            modelName: 'betterAuthVerification'
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp: true,
            requireEmailVerification: false,
            minPasswordLength: PASSWORD_MIN_LENGTH,
            maxPasswordLength: PASSWORD_MAX_LENGTH,
            revokeSessionsOnPasswordReset: true,
            /**
             * 当前后台记录重置链接；该回调不发送邮件。
             */
            async sendResetPassword(_payload: { user: Record<string, unknown>; url: string; token: string }) {
                return;
            }
        },
        session: {
            modelName: 'betterAuthSession',
            storeSessionInDatabase: true,
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 60 * 24,
            freshAge: 60 * 60 * 2
        },
        advanced: {
            generateId: generateBetterAuthId,
            database: {
                generateId: generateBetterAuthId
            },
            ipAddress: {
                disableIpTracking: false,
                ipAddressHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip']
            },
            trustedProxyHeaders: true,
            cookies: {
                sessionToken: {
                    name: ADMIN_BETTER_AUTH_COOKIE_NAME,
                    options: {
                        httpOnly: true,
                        sameSite: 'lax' as const,
                        secure: secureCookie,
                        path: '/'
                    }
                }
            }
        },
        databaseHooks: {
            user: {
                create: {
                    after: betterAuthService.initializeNewUser.bind(betterAuthService)
                }
            },
            session: {
                create: {
                    after: betterAuthService.touchLastLoginAt.bind(betterAuthService)
                }
            }
        },
        plugins: [
            localization({
                defaultLocale: 'zh-Hans',
                fallbackLocale: 'default'
            }),
            dash({
                apiUrl: getOptionalConfig(configService, 'BETTER_AUTH_API_URL'),
                kvUrl: getOptionalConfig(configService, 'BETTER_AUTH_KV_URL'),
                apiKey: getOptionalConfig(configService, 'BETTER_AUTH_API_KEY')
            }),
            sentinel({
                apiUrl: getOptionalConfig(configService, 'BETTER_AUTH_API_URL'),
                kvUrl: getOptionalConfig(configService, 'BETTER_AUTH_KV_URL'),
                apiKey: getOptionalConfig(configService, 'BETTER_AUTH_API_KEY')
            }),
            admin({
                defaultRole: 'user',
                roles: {
                    admin: adminAc,
                    user: betterAuthUserRoleForRbacImpersonation
                },
                adminRoles: ['admin']
            }),
            buildAdminImpersonationRbacGuardPlugin({
                prisma,
                rbacAuthorizationService
            }),
            buildForbidAdminEmailAuthPlugin(),
            // 启用 Bearer Token 认证，前端通过 Authorization 头传递 token
            bearer(),
            openAPI(),
            username({
                minUsernameLength: 1,
                maxUsernameLength: 64,
                usernameNormalization: false,
                displayUsernameNormalization: false,
                usernameValidator: betterAuthService.validateAdminUsername.bind(betterAuthService)
            }),
            phoneNumber({
                otpLength: 6,
                expiresIn: 60 * 5,
                allowedAttempts: 5,
                requireVerification: true,
                phoneNumberValidator: validateAdminPhoneNumber,
                sendOTP: sendAdminPhoneOtp,
                sendPasswordResetOTP: sendAdminPhoneOtp,
                signUpOnVerification: {
                    getTempEmail: getAdminPhoneTempEmail,
                    getTempName: (phone) => phone
                }
            }),
            customSession(betterAuthService.buildCustomSession.bind(betterAuthService)),
            buildAdminUserStateVersionPlugin({
                adminUserStateService
            })
        ],
        onAPIError: {
            throw: false,
            /**
             * Better Auth 路由不进入 Nest Controller/APP_FILTER。
             * 这里接管项目异常和基础设施异常，复用 Shiro 错误体与运行时日志；
             * Better Auth 自己的 APIError 保持原样，避免破坏官方 client 的错误语义。
             */
            onError(error: unknown) {
                if (isAPIError(error)) {
                    const apiError = error as BetterAuthApiErrorLike;
                    if (typeof apiError.statusCode === 'number' && apiError.statusCode >= 500) {
                        recordBetterAuthApiError(error, normalizeExistingBetterAuthApiError(apiError));
                    }
                    return;
                }

                if (error instanceof BusinessException) {
                    throwShiroNormalizedBetterAuthError(error);
                }

                if (error instanceof UnauthException) {
                    throwShiroNormalizedBetterAuthError(error);
                }

                throwShiroNormalizedBetterAuthError(error);
            }
        }
    };
}
