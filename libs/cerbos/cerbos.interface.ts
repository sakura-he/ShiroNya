import { ExecutionContext } from '@nestjs/common';
import { ErrorCodes } from '@app/common';

/** Cerbos 鉴权所需的用户信息，session 类型由接入方注入 */
export interface CerbosUser<TSession = unknown> {
    id: string;
    roles: string[];
    session: TSession;
}

export type UserFromContextFn<TSession = unknown> = (
    ctx: ExecutionContext
) => CerbosUser<TSession> | null | Promise<CerbosUser<TSession> | null>;

/** 从请求上下文提取 principal 属性的函数 */
export type PrincipalAttrFromContextFn = (ctx: ExecutionContext) => Record<string, any> | Promise<Record<string, any>>;

/** Admin API 认证凭据 */
export interface CerbosAdminCredentials {
    username: string;
    password: string;
}

/**
 * 显式校验 Cerbos 实例前缀，禁止使用空前缀或缺省前缀，
 * 避免请求落到隐式默认实例而掩盖配置错误。
 */
export function assertCerbosEnvPrefix(envPrefix: string | undefined, source: string): string {
    const normalized = envPrefix?.trim();
    if (!normalized) {
        throw new Error(ErrorCodes.CERBOS.ENV_PREFIX_REQUIRED(source).message);
    }
    return normalized;
}

export interface CerbosModuleOptions<TSession = unknown> {
    /** 从请求上下文提取用户信息（必需） */
    userFromContext: UserFromContextFn<TSession>;
    /** 全局默认的 principal 属性提取函数（可选） */
    principalAttrFromContext?: PrincipalAttrFromContextFn;
    /** 环境变量前缀，例如传 'APP_' 读取 APP_CERBOS_*，传 'ADMIN_' 读取 ADMIN_CERBOS_* */
    envPrefix: string;
    /** Admin API 凭据，启用后支持 addOrUpdatePolicies 等管理操作 */
    adminCredentials?: CerbosAdminCredentials;
}

export const CERBOS_MODULE_OPTIONS = '__cerbos_module_options__';

/** 根据 envPrefix 生成 CerbosService 注入令牌 */
export function getCerbosServiceToken(envPrefix: string): string {
    const normalized = assertCerbosEnvPrefix(envPrefix, 'getCerbosServiceToken');
    return `__cerbos_service_${normalized}__`;
}

/** 根据 envPrefix 生成 CerbosModuleOptions 注入令牌 */
export function getCerbosOptionsToken(envPrefix: string): string {
    const normalized = assertCerbosEnvPrefix(envPrefix, 'getCerbosOptionsToken');
    return `__cerbos_options_${normalized}__`;
}
