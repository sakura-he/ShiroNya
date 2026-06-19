import { createAuthClient } from "better-auth/vue";
import { adminClient, phoneNumberClient, usernameClient } from "better-auth/client/plugins";
import { dashClient, sentinelClient } from "@better-auth/infra/client";

/** 浏览器认证缓存键名常量 */
const TOKEN_KEY = "admin-api-token";
const USER_STATE_VERSION_KEY = "admin-api-user-state-version";
const SESSION_KEY = "admin-api-session";
const IMPERSONATION_ORIGIN_TOKEN_KEY = "admin-api-impersonation-origin-token";
const AUTH_STORAGE_MODE_KEY = "admin-api-auth-storage-mode";
const AUTH_STORAGE_KEYS = [TOKEN_KEY, USER_STATE_VERSION_KEY, SESSION_KEY, IMPERSONATION_ORIGIN_TOKEN_KEY] as const;

type AuthStorageMode = "local" | "session";

/**
 * 后端 customSession 返回的角色对象结构（对应 ShiroRole 表）。
 */
export interface AdminSessionRole {
    id: number;
    code: string;
    name: string;
}

/**
 * 后端 customSession 返回的用户资料结构（对应 ShiroBetterAuthUserProfile 表）。
 */
export interface AdminSessionProfile {
    id: number;
    userId: string;
    remark?: string | null;
    createdBy?: string | null;
    lastLoginAt?: Date | string | null;
}

/**
 * 后端 customSession 扩展后的完整会话结构，与 buildCustomSession 返回值对齐。
 */
export interface AdminAuthSession {
    user: {
        id: string;
        name: string;
        email: string;
        emailVerified: boolean;
        image?: string | null;
        role?: string | null;
        banned?: boolean | null;
        banReason?: string | null;
        banExpires?: Date | string | null;
        phoneNumber?: string | null;
        phoneNumberVerified?: boolean | null;
        username?: string | null;
        displayUsername?: string | null;
        createdAt: Date;
        updatedAt: Date;
    };
    session: {
        userId: string;
        token: string;
        expiresAt: Date;
        createdAt: Date;
        updatedAt: Date;
        ipAddress?: string | null;
        userAgent?: string | null;
        impersonatedBy?: string | null;
    };
    /** customSession 注入的角色列表 */
    roles: AdminSessionRole[];
    /** customSession 注入的用户资料 */
    profile: AdminSessionProfile | null;
}

type BetterAuthSessionSwitchData = {
    session?: {
        token?: string;
    };
    user?: {
        id?: string;
        name?: string;
        username?: string | null;
    };
};

type BetterAuthClientResult<T> = {
    data?: T | null;
    error?: {
        message?: string;
        code?: string;
        status?: string | number;
    } | null;
};

type AdminAuthClientWithAdmin = typeof adminAuthClient & {
    admin: {
        impersonateUser(input: { userId: string }): Promise<BetterAuthClientResult<BetterAuthSessionSwitchData>>;
    };
};

/**
 * 规范化 Better Auth 客户端地址，确保始终指向 admin 认证路由根。
 */
function resolveBetterAuthBaseUrl(): string {
    const baseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();
    if (!baseUrl) {
        throw new Error("VITE_API_BASE_URL 未配置，无法初始化 Better Auth 客户端");
    }
    return baseUrl.endsWith("/") ? `${baseUrl}api/auth` : `${baseUrl}/api/auth`;
}

/**
 * 将日期字段从 JSON 字符串还原成 Date 实例，非法值直接抛错暴露脏缓存。
 */
function parseDate(value: unknown, field: string): Date {
    if (!(typeof value === "string" || value instanceof Date)) {
        throw new Error(`会话快照字段 ${field} 不是有效日期值`);
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`会话快照字段 ${field} 解析后的日期无效`);
    }
    return d;
}

// ─── 浏览器认证缓存 ───────────────────────────────────────────────

function getBrowserStorage(mode: AuthStorageMode): Storage {
    return mode === "local" ? localStorage : sessionStorage;
}

function getOppositeStorageMode(mode: AuthStorageMode): AuthStorageMode {
    return mode === "local" ? "session" : "local";
}

function isAuthStorageMode(value: string | null): value is AuthStorageMode {
    return value === "local" || value === "session";
}

/**
 * 当前认证态的缓存位置。
 *
 * - 勾选“记住登录状态”：localStorage，浏览器重启后仍可恢复。
 * - 不勾选：sessionStorage，只在当前浏览器会话内恢复。
 * - 没有模式标记时，根据现有认证态选择 sessionStorage 或 localStorage。
 */
function getAuthStorageMode(): AuthStorageMode {
    const sessionMode = sessionStorage.getItem(AUTH_STORAGE_MODE_KEY);
    if (isAuthStorageMode(sessionMode)) {
        return sessionMode;
    }

    const localMode = localStorage.getItem(AUTH_STORAGE_MODE_KEY);
    if (isAuthStorageMode(localMode)) {
        return localMode;
    }

    const hasSessionAuthState = AUTH_STORAGE_KEYS.some(
        (key) => sessionStorage.getItem(key) !== null,
    );
    return hasSessionAuthState ? "session" : "local";
}

function getWritableAuthStorage(): Storage {
    return getBrowserStorage(getAuthStorageMode());
}

function getStoredAuthItem(key: (typeof AUTH_STORAGE_KEYS)[number]) {
    const preferredMode = getAuthStorageMode();
    const fallbackMode = getOppositeStorageMode(preferredMode);
    const preferredStorage = getBrowserStorage(preferredMode);
    const fallbackStorage = getBrowserStorage(fallbackMode);
    const preferredValue = preferredStorage.getItem(key);

    if (preferredValue !== null) {
        return {
            storage: preferredStorage,
            value: preferredValue,
        };
    }

    const fallbackValue = fallbackStorage.getItem(key);
    return fallbackValue === null
        ? null
        : {
              storage: fallbackStorage,
              value: fallbackValue,
          };
}

/**
 * 登录成功后根据 rememberMe 切换缓存位置，并清理另一侧认证态，避免 token 存储冲突。
 */
function setAuthStorageMode(rememberMe: boolean): void {
    const mode: AuthStorageMode = rememberMe ? "local" : "session";
    const targetStorage = getBrowserStorage(mode);
    const staleStorage = getBrowserStorage(getOppositeStorageMode(mode));

    AUTH_STORAGE_KEYS.forEach((key) => staleStorage.removeItem(key));
    staleStorage.removeItem(AUTH_STORAGE_MODE_KEY);
    targetStorage.setItem(AUTH_STORAGE_MODE_KEY, mode);
}

/** 读取 Bearer Token，无值时返回 undefined（better-fetch 约定） */
export function getStoredToken(): string | undefined {
    return getStoredAuthItem(TOKEN_KEY)?.value ?? undefined;
}

/** 持久化 Bearer Token */
export function setStoredToken(token: string, rememberMe?: boolean): void {
    if (rememberMe !== undefined) {
        setAuthStorageMode(rememberMe);
    }

    getWritableAuthStorage().setItem(TOKEN_KEY, token);
}

/** 读取进入伪装前的原始管理员 Bearer Token。 */
export function getStoredImpersonationOriginToken(): string | undefined {
    return getStoredAuthItem(IMPERSONATION_ORIGIN_TOKEN_KEY)?.value ?? undefined;
}

/** 保存进入伪装前的原始管理员 Bearer Token，用于 header-only 退出伪装。 */
export function setStoredImpersonationOriginToken(token: string): void {
    getWritableAuthStorage().setItem(IMPERSONATION_ORIGIN_TOKEN_KEY, token);
}

/** 清理进入伪装前保存的原始管理员 Bearer Token。 */
export function clearStoredImpersonationOriginToken(): void {
    [localStorage, sessionStorage].forEach((storage) => storage.removeItem(IMPERSONATION_ORIGIN_TOKEN_KEY));
}

/** 读取用户状态版本号 */
export function getStoredUserStateVersion(): string | null {
    return getStoredAuthItem(USER_STATE_VERSION_KEY)?.value ?? null;
}

/** 持久化用户状态版本号 */
export function setStoredUserStateVersion(version: string): void {
    getWritableAuthStorage().setItem(USER_STATE_VERSION_KEY, version);
}

/**
 * 读取会话快照，解析失败时清除脏数据并返回 null。
 */
export function getStoredSessionSnapshot(): AdminAuthSession | null {
    const storedSession = getStoredAuthItem(SESSION_KEY);
    if (!storedSession) return null;

    try {
        const snapshot = JSON.parse(storedSession.value);
        // 还原日期字段，其余结构直接信任（数据是自己写入的）
        snapshot.user.createdAt = parseDate(snapshot.user.createdAt, "user.createdAt");
        snapshot.user.updatedAt = parseDate(snapshot.user.updatedAt, "user.updatedAt");
        if (snapshot.user.banExpires !== null && snapshot.user.banExpires !== undefined) {
            snapshot.user.banExpires = parseDate(snapshot.user.banExpires, "user.banExpires");
        }
        snapshot.session.expiresAt = parseDate(snapshot.session.expiresAt, "session.expiresAt");
        snapshot.session.createdAt = parseDate(snapshot.session.createdAt, "session.createdAt");
        snapshot.session.updatedAt = parseDate(snapshot.session.updatedAt, "session.updatedAt");
        if (snapshot.profile?.lastLoginAt !== null && snapshot.profile?.lastLoginAt !== undefined) {
            snapshot.profile.lastLoginAt = parseDate(snapshot.profile.lastLoginAt, "profile.lastLoginAt");
        }
        return snapshot as AdminAuthSession;
    } catch (e) {
        // 快照损坏时立即删除，避免反复读取脏数据
        storedSession.storage.removeItem(SESSION_KEY);
        console.error("会话快照解析失败，已清理损坏缓存", e);
        return null;
    }
}

/** 持久化会话快照 */
export function setStoredSessionSnapshot(session: AdminAuthSession): void {
    getWritableAuthStorage().setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * 一次性清空所有本地认证状态（token、版本号、会话快照）。
 */
export function clearStoredAuthState(): void {
    [localStorage, sessionStorage].forEach((storage) => {
        AUTH_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
        storage.removeItem(AUTH_STORAGE_MODE_KEY);
    });
}

// ─── Better Auth 客户端实例 ──────────────────────────────────────

const infraAuthClientPlugins = [dashClient(), sentinelClient({ autoSolveChallenge: true })] as unknown as [];

export const adminAuthClient = createAuthClient({
    baseURL: resolveBetterAuthBaseUrl(),
    plugins: [usernameClient(), phoneNumberClient(), adminClient(), ...infraAuthClientPlugins] as const,
    fetchOptions: {
        credentials: "omit",
        auth: {
            type: "Bearer",
            token: () => getStoredToken(),
        },
        // 成功响应附带用户状态版本号时立即持久化
        onSuccess: (ctx) => {
            const v = ctx.response.headers.get("x-user-state-version");
            if (v) setStoredUserStateVersion(v);
        },
    },
});

function getSessionSwitchToken(result: BetterAuthClientResult<BetterAuthSessionSwitchData>, action: string): string {
    if (result.error) {
        throw new Error(result.error.message || `${action}失败`);
    }

    const token = result.data?.session?.token;
    if (!token) {
        throw new Error(`${action}成功但没有返回新的会话 token`);
    }

    return token;
}

/**
 * 调用 Better Auth admin API 创建目标用户伪装会话。
 */
export async function impersonateBetterAuthUser(userId: string): Promise<string> {
    const result = await (adminAuthClient as AdminAuthClientWithAdmin).admin.impersonateUser({ userId });
    return getSessionSwitchToken(result, "伪装用户");
}

/**
 * 使用当前 Bearer Token 撤销当前 Better Auth session。
 */
export async function revokeCurrentBetterAuthSession(): Promise<void> {
    const result = await adminAuthClient.signOut();
    if (result.error) {
        throw new Error(result.error.message || "撤销当前会话失败");
    }
}
