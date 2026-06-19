import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-redis/client';
import type { RedisClientType } from 'redis';
import { PrismaService } from '@app/prisma-app';
import { Prisma, RbacStatus } from '@app/prisma-app/generated/client';
import { BusinessException, createRuntimeLogger, ErrorCodes, UnauthException } from '@app/common';
import {
    createBetterAuthSecondaryStorageRedisKey,
    createAppApiSmsIpDailyRedisKey,
    createAppApiSmsPhoneDailyRedisKey,
    createAppApiSmsPhoneLimitRedisKey
} from '@app/common/constants';
import type { BetterAuthOptions, GenericEndpointContext, HookEndpointContext, Session, User } from 'better-auth';
import type { PhoneNumberOptions } from 'better-auth/plugins';
// @ts-ignore
import { getSessionFromCtx } from 'better-auth/api';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import { SystemRbacGraphService } from '../system/rbac/rbac-graph.service';
import { DEFAULT_RBAC_ROLE_CODE } from './role.constants';

/** 短信验证码限流配置 */
const SMS_CONFIG = {
    PHONE_INTERVAL: 60,
    PHONE_DAILY_LIMIT: 10,
    IP_DAILY_LIMIT: 100
} as const;

/** 中国大陆手机号校验正则 */
const CN_MAINLAND_PHONE_REGEX = /^1[3-9]\d{9}$/;
const SMS_RATE_LIMIT_SCRIPT = `
local phoneLimitTtl = redis.call("TTL", KEYS[1])
if phoneLimitTtl and phoneLimitTtl > 0 then
    return {"phone_rate_limit", phoneLimitTtl}
end

local phoneDailyCount = redis.call("INCR", KEYS[2])
if phoneDailyCount == 1 then
    redis.call("EXPIRE", KEYS[2], ARGV[2])
end
if phoneDailyCount > tonumber(ARGV[3]) then
    redis.call("DECR", KEYS[2])
    return {"phone_daily_limit", 0}
end

local ipDailyCount = redis.call("INCR", KEYS[3])
if ipDailyCount == 1 then
    redis.call("EXPIRE", KEYS[3], ARGV[2])
end
if ipDailyCount > tonumber(ARGV[4]) then
    redis.call("DECR", KEYS[3])
    redis.call("DECR", KEYS[2])
    return {"ip_daily_limit", 0}
end

redis.call("SETEX", KEYS[1], ARGV[1], "1")
return {"ok", 0}
`;

/** app-api 默认 RBAC 角色编码 */
const DEFAULT_ROLE_CODE = DEFAULT_RBAC_ROLE_CODE;
/** Better Auth 会话接口路径（排除版本头注入） */
const BA_GET_SESSION_PATH = '/get-session';
/** Better Auth OpenAPI schema 生成接口路径 */
const BA_OPEN_API_SCHEMA_PATH = '/open-api/generate-schema';
/** 用户状态版本响应头 */
const USER_STATE_VERSION_HEADER = 'X-User-State-Version';

type BaPhoneNumberValidator = NonNullable<PhoneNumberOptions['phoneNumberValidator']>;
type BaSendOtp = NonNullable<PhoneNumberOptions['sendOTP']>;
type BaSendOtpParams = Parameters<BaSendOtp>[0];
type BaSendOtpContext = Parameters<BaSendOtp>[1];
type BaUser = User & Record<string, unknown>;
type BaSession = Session & Record<string, unknown>;
type BaSecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>;
type BaUserCreateAfterHook = Exclude<
    NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['user']>['create']>['after'],
    undefined
>;
type BaUserCreateAfterUser = Parameters<BaUserCreateAfterHook>[0];
type BaUserCreateAfterContext = Parameters<BaUserCreateAfterHook>[1];
type SendOtpHookContext = GenericEndpointContext & {
    body?: {
        phoneNumber?: string;
    };
};
type UserStateRole = { id: number; name: string };

@Injectable()
export class BetterAuthService {
    private readonly logger = createRuntimeLogger(BetterAuthService.name);

    constructor(
        @InjectRedis('DEFAULT_REDIS') private readonly redis: RedisClientType,
        private readonly prisma: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        private readonly rbacGraphService: SystemRbacGraphService
    ) {}

    /** 构建 Redis secondaryStorage 配置 */
    createSecondaryStorage(): BaSecondaryStorage {
        return {
            get: async (key: string) => {
                return await this.redis.get(createBetterAuthSecondaryStorageRedisKey(key));
            },
            set: async (key: string, value: string, ttl?: number) => {
                const cacheKey = createBetterAuthSecondaryStorageRedisKey(key);
                if (ttl) {
                    await this.redis.set(cacheKey, value, { EX: ttl });
                    return;
                }
                await this.redis.set(cacheKey, value);
            },
            delete: async (key: string) => {
                await this.redis.del(createBetterAuthSecondaryStorageRedisKey(key));
            }
        };
    }

    /** 校验手机号是否符合中国大陆格式 */
    validatePhoneNumber(phoneNumber: Parameters<BaPhoneNumberValidator>[0]): ReturnType<BaPhoneNumberValidator> {
        const normalizedPhone = this.normalizePhoneNumber(String(phoneNumber ?? ''));
        this.logger.debug('校验手机号格式', {
            phoneNumber: normalizedPhone
        });
        return CN_MAINLAND_PHONE_REGEX.test(normalizedPhone);
    }

    private normalizePhoneNumber(phoneNumber: string): string {
        const compactPhone = phoneNumber.replace(/[\s-]/g, '').trim();
        if (compactPhone.startsWith('+86')) {
            return compactPhone.slice(3);
        }
        if (compactPhone.startsWith('86') && compactPhone.length === 13) {
            return compactPhone.slice(2);
        }
        return compactPhone;
    }

    /** 生成手机号注册临时邮箱 */
    getTempEmail(phoneNumber: string): string {
        return `${phoneNumber}@appapp.com`;
    }

    /** 生成手机号注册临时昵称 */
    getTempName(phoneNumber: string): string {
        return phoneNumber;
    }

    /** 发送短信验证码（当前为占位实现） */
    async sendOtp(params: BaSendOtpParams, ctx?: BaSendOtpContext): Promise<void> {
        const phone = this.normalizePhoneNumber(params.phoneNumber);
        try {
            if (!this.validatePhoneNumber(phone)) {
                throw new BusinessException(ErrorCodes.SMS.PHONE_INVALID);
            }

            const provider = process.env.APP_SMS_PROVIDER?.trim();
            if (process.env.NODE_ENV === 'production' && !provider) {
                throw new BusinessException(ErrorCodes.SMS.PROVIDER_NOT_CONFIGURED);
            }

            if (provider && provider !== 'log') {
                throw new BusinessException(ErrorCodes.SMS.SEND_FAILED, { provider });
            }

            this.logger.info.title('短信验证码开发日志', {
                phone,
                code: params.code
            });
        } catch (error) {
            if (this.validatePhoneNumber(phone)) {
                await this.rollbackSmsRateLimit(phone, this.getClientIp(ctx?.headers));
            }
            if (error instanceof BusinessException) {
                throw error;
            }
            throw new BusinessException(ErrorCodes.SMS.SEND_FAILED);
        }
    }

    /** 计算当天剩余秒数，用于日限流键的过期时间 */
    private getDailyTTL(): number {
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
    }

    /** 从请求头中提取并标准化客户端 IP */
    getClientIp(headersLike?: HeadersInit | Record<string, string | string[] | undefined>): string {
        const headers = this.toHeaders(headersLike);
        const realIp =
            headers.get('x-forwarded-for') ||
            headers.get('x-real-ip') ||
            headers.get('x-client-ip') ||
            headers.get('cf-connecting-ip') ||
            headers.get('true-client-ip') ||
            headers.get('x-cluster-client-ip') ||
            headers.get('forwarded');

        if (!realIp) {
            return 'unknown';
        }

        return this.normalizeIp(realIp) || 'unknown';
    }

    /** 接收 HeadersInit 与普通对象，统一转为 Headers。 */
    private toHeaders(headersLike?: HeadersInit | Record<string, string | string[] | undefined>): Headers {
        if (!headersLike) {
            return new Headers();
        }

        if (headersLike instanceof Headers) {
            return headersLike;
        }

        if (Array.isArray(headersLike)) {
            return new Headers(headersLike);
        }

        const headers = new Headers();
        for (const [key, value] of Object.entries(headersLike)) {
            if (!value) {
                continue;
            }

            headers.set(key, Array.isArray(value) ? value.join(',') : value);
        }

        return headers;
    }

    /** 规范化 IP 值，处理多代理与端口场景 */
    private normalizeIp(rawIp: string): string | null {
        const firstValue = rawIp.split(',')[0]?.trim();
        if (!firstValue) {
            return null;
        }

        let ip = firstValue.trim().replace(/^"(.+)"$/, '$1');

        if (/^for=/i.test(ip)) {
            const forwardedMatch = ip.match(/for=(?:"?\[?([a-f0-9:.]+)\]?)/i);
            if (forwardedMatch?.[1]) {
                ip = forwardedMatch[1];
            } else {
                ip = ip.replace(/^for=/i, '').trim();
            }
        }

        if (ip.startsWith('[')) {
            const end = ip.indexOf(']');
            if (end > 0) {
                return ip.slice(1, end);
            }
        }

        if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
            ip = ip.split(':')[0];
        }

        if (ip.startsWith('::ffff:')) {
            ip = ip.slice('::ffff:'.length);
        }

        if (ip.toLowerCase() === 'unknown' || ip.toLowerCase() === 'null') {
            return null;
        }

        return ip || null;
    }

    /** 校验短信发送频率并写入频率限制键 */
    async checkSmsRateLimit(phone: string, ip: string): Promise<void> {
        const normalizedPhone = this.normalizePhoneNumber(phone);
        if (!this.validatePhoneNumber(normalizedPhone)) {
            throw new BusinessException(ErrorCodes.SMS.PHONE_INVALID);
        }

        const result = await this.redis.eval(SMS_RATE_LIMIT_SCRIPT, {
            keys: [
                createAppApiSmsPhoneLimitRedisKey(normalizedPhone),
                createAppApiSmsPhoneDailyRedisKey(normalizedPhone),
                createAppApiSmsIpDailyRedisKey(ip)
            ],
            arguments: [
                String(SMS_CONFIG.PHONE_INTERVAL),
                String(this.getDailyTTL()),
                String(SMS_CONFIG.PHONE_DAILY_LIMIT),
                String(SMS_CONFIG.IP_DAILY_LIMIT)
            ]
        });
        const [status, ttl] = Array.isArray(result) ? result : [];

        if (status === 'phone_rate_limit') {
            throw new BusinessException(ErrorCodes.SMS.PHONE_RATE_LIMIT(Number(ttl) || SMS_CONFIG.PHONE_INTERVAL));
        }
        if (status === 'phone_daily_limit') {
            throw new BusinessException(ErrorCodes.SMS.PHONE_DAILY_LIMIT);
        }
        if (status === 'ip_daily_limit') {
            throw new BusinessException(ErrorCodes.SMS.IP_DAILY_LIMIT);
        }
    }

    /** 处理发送验证码接口的限流钩子 */
    async handleSendOtpRateLimit(ctx: SendOtpHookContext): Promise<SendOtpHookContext> {
        const body = ctx.body as { phoneNumber?: string } | undefined;
        const phone = this.normalizePhoneNumber(body?.phoneNumber || '');
        const ip = this.getClientIp(ctx.headers);
        await this.checkSmsRateLimit(phone, ip);
        return ctx;
    }

    /** 匹配发送验证码接口路径 */
    isSendOtpPath(ctx: HookEndpointContext): boolean {
        return ctx.path === '/phone-number/send-otp';
    }

    /** 发送失败时回滚当次限流计数 */
    async rollbackSmsRateLimit(phone: string, ip: string): Promise<void> {
        await this.redis.decr(createAppApiSmsPhoneDailyRedisKey(phone));
        await this.redis.decr(createAppApiSmsIpDailyRedisKey(ip));
        await this.redis.del(createAppApiSmsPhoneLimitRedisKey(phone));
    }

    /** 构建 customSession 返回结构（角色+资料+原始会话） */
    async buildCustomSession(
        context: { user: BaUser; session: BaSession },
        _ctx?: GenericEndpointContext
    ): Promise<Record<string, unknown>> {
        const { user, session } = context;
        const [activeUser, roleRows, profile] = await Promise.all([
            this.prisma.betterAuthUser.findFirst({
                where: {
                    id: user.id,
                    deletedAt: null
                },
                select: {
                    id: true
                }
            }),
            this.prisma.rbacEffectiveUserRole.findMany({
                where: {
                    userId: user.id,
                    role: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    role: true
                },
                orderBy: {
                    roleId: 'asc'
                }
            }),
            this.prisma.betterAuthUserProfile.findUnique({
                where: { userId: user.id }
            })
        ]);

        if (!activeUser) {
            throw new UnauthException(ErrorCodes.USER.NOT_FOUND);
        }

        const roles = roleRows.map((row) => row.role);
        const sessionUser = { ...user };
        delete (sessionUser as { role?: unknown }).role;
        return {
            roles,
            profile,
            user: sessionUser,
            session
        };
    }

    /** 初始化新用户资料与默认角色绑定 */
    async initializeNewUser(user: BaUserCreateAfterUser, _ctx?: BaUserCreateAfterContext): Promise<void> {
        await this.prisma.betterAuthUserProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, nickname: user.name },
            update: {}
        });

        const defaultRole = await this.prisma.rbacRole.findFirst({
            where: {
                code: DEFAULT_ROLE_CODE,
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: { id: true }
        });

        if (defaultRole) {
            try {
                await this.prisma.rbacUserRole.create({
                    data: {
                        userId: user.id,
                        roleId: defaultRole.id,
                        createdBy: 'system'
                    }
                });
            } catch (error) {
                if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
                    throw error;
                }
            }
            await this.rbacGraphService.applyRebuild([user.id]);
            return;
        }

        await this.adminUserStateService.bumpUserStateVersion(user.id);
    }
}
