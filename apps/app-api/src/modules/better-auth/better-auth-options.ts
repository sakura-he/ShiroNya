import { BusinessException, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, UnauthException } from '@app/common';
import { localization } from 'better-auth-localization';
import { AppBetterAuthConfig, BetterAuthOptionsDeps } from './types';
import { ulid } from 'ulid';
// @ts-ignore
import { admin, bearer, customSession, openAPI, phoneNumber } from 'better-auth/plugins';
// @ts-ignore
import { expo } from '@better-auth/expo';
// @ts-ignore
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { apiKey } from '@better-auth/api-key';
import { BETTER_AUTH_USER_ROLE } from './role.constants';
import { AdminErrorCodes } from '../../common/constants/index';
// @ts-ignore
import { defaultAc } from 'better-auth/plugins/admin/access';

const DEFAULT_TRUSTED_ORIGINS = ['http://localhost:3000', 'mimiapp://', 'http://localhost:3001', 'exp://*'];
const BETTER_AUTH_BASE_PATH = '/app/api/auth';

function resolveTrustedOrigins(configService: BetterAuthOptionsDeps['configService']): string[] {
    const rawOrigins = configService.get<string>('APP_BETTER_AUTH_TRUSTED_ORIGINS');

    if (!rawOrigins) {
        return DEFAULT_TRUSTED_ORIGINS;
    }

    return rawOrigins
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

const RATE_LIMIT = {
    enabled: true,
    window: 60,
    max: 100
};

const SESSION_COOKIE = {
    name: 'app.session',
    options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure:
            process.env.APP_BETTER_AUTH_COOKIE_SECURE === undefined
                ? process.env.NODE_ENV === 'production'
                : process.env.APP_BETTER_AUTH_COOKIE_SECURE === 'true',
        path: '/'
    }
};

const betterAuthUserRole = defaultAc.newRole({
    user: [],
    session: []
});

function generateBetterAuthId(): string {
    return ulid();
}

/**
 * 构建 app-api 对外运行版 Better Auth 配置。
 */
export function buildBetterAuthOptions({
    prisma,
    configService,
    betterAuthService
}: BetterAuthOptionsDeps): AppBetterAuthConfig {
    const jwtSigningKey = configService.get<string>('JWT_SIGNING_KEY')?.trim();
    if (!jwtSigningKey) {
        throw new BusinessException(AdminErrorCodes.CONFIG.JWT_SIGNING_KEY_MISSING);
    }

    // 共享层只保留数据库与会话持久化配置，App 端运行能力在这里显式补齐。
    const plugins: any[] = [
        expo(),
        localization({
            defaultLocale: 'zh-Hant',
            fallbackLocale: 'default'
        }),
        admin({
            defaultRole: BETTER_AUTH_USER_ROLE,
            roles: {
                [BETTER_AUTH_USER_ROLE]: betterAuthUserRole
            },
            adminRoles: []
        }),
        apiKey({
            enableSessionForAPIKeys: true,
            apiKeyHeaders: ['x-api-key'],
            // 映射 api-key 插件的默认表名到自定义 Prisma 模型名
            schema: {
                apikey: {
                    modelName: 'betterAuthApiKey'
                }
            }
        }),
        bearer(),
        openAPI(),
        phoneNumber({
            phoneNumberValidator: betterAuthService.validatePhoneNumber.bind(betterAuthService),
            sendOTP: betterAuthService.sendOtp.bind(betterAuthService),
            signUpOnVerification: {
                getTempEmail: betterAuthService.getTempEmail.bind(betterAuthService),
                getTempName: betterAuthService.getTempName.bind(betterAuthService)
            }
        }),
        {
            id: 'sms-rate-limit',
            hooks: {
                before: [
                    {
                        matcher: betterAuthService.isSendOtpPath.bind(betterAuthService),
                        handler: betterAuthService.handleSendOtpRateLimit.bind(betterAuthService)
                    }
                ]
            }
        },
        customSession(betterAuthService.buildCustomSession.bind(betterAuthService))
    ];

    return {
        database: prismaAdapter(prisma, { provider: 'postgresql' }),
        user: {
            modelName: 'betterAuthUser',
            additionalFields: {}
        },
        account: {
            modelName: 'betterAuthAccount'
        },
        verification: {
            modelName: 'betterAuthVerification'
        },

        appName: configService.get<string>('APP_NAME'),
        secret: configService.get<string>('BETTER_AUTH_SECRET'),
        baseURL: configService.get<string>('BETTER_AUTH_URL'),
        basePath: BETTER_AUTH_BASE_PATH,
        secondaryStorage: betterAuthService.createSecondaryStorage(),
        emailAndPassword: {
            enabled: false,
            requireEmailVerification: false,
            minPasswordLength: PASSWORD_MIN_LENGTH,
            maxPasswordLength: PASSWORD_MAX_LENGTH,
            revokeSessionsOnPasswordReset: true
        },
        session: {
            modelName: 'betterAuthSession',
            storeSessionInDatabase: true,
            expiresIn: 60 * 60 * 24 * 7,
            updateAge: 60 * 40 * 24,
            freshAge: 60 * 60 * 2,
            additionalFields: {},
            cookieCache: {
                enabled: true,
                strategy: 'jwt'
            },
            jwt: {
                signingKey: jwtSigningKey
            }
        },
        advanced: {
            generateId: generateBetterAuthId,
            database: {
                generateId: generateBetterAuthId
            },
            // Better Auth 只会从 advanced.ipAddress 读取客户端 IP 配置。
            ipAddress: {
                disableIpTracking: false,
                ipAddressHeaders: ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip']
            },
            // 允许从可信代理头推断协议/主机信息，避免反向代理部署下的识别异常。
            trustedProxyHeaders: true,
            cookies: {
                sessionToken: {
                    name: SESSION_COOKIE.name,
                    options: SESSION_COOKIE.options
                }
            }
        },
        rateLimit: RATE_LIMIT,
        databaseHooks: {
            user: {
                create: {
                    after: betterAuthService.initializeNewUser.bind(betterAuthService)
                }
            }
        },
        plugins,
        onAPIError: {
            throw: false,
            /**
             * 将业务异常统一映射为 Better Auth APIError 响应。
             */
            onError(error: unknown) {
                if (error instanceof BusinessException) {
                    throw new APIError('BAD_REQUEST', {
                        message: error.bizMessage,
                        code: String(error.bizCode)
                    });
                }
                if (error instanceof UnauthException) {
                    throw new APIError('UNAUTHORIZED', {
                        message: error.bizMessage,
                        code: String(error.bizCode)
                    });
                }
                if (error instanceof Error) {
                    throw new APIError('INTERNAL_SERVER_ERROR', { message: error.message, code: '500' });
                }
                throw new APIError('INTERNAL_SERVER_ERROR', { message: '未知错误' });
            }
        },
        trustedOrigins: resolveTrustedOrigins(configService)
    };
}
