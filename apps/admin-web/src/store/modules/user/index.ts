import {
    adminAuthClient,
    type AdminAuthSession,
    clearStoredImpersonationOriginToken,
    clearStoredAuthState,
    getStoredImpersonationOriginToken,
    getStoredSessionSnapshot,
    getStoredToken,
    impersonateBetterAuthUser,
    revokeCurrentBetterAuthSession,
    setStoredImpersonationOriginToken,
    setStoredToken,
    setStoredSessionSnapshot,
} from "@/auth/client";
import { getAccountNavigationApi, type AccountNavigationDto } from "@/api/account";
import type { LoginParams } from "@/api/schemas/account.schema";
import { router } from "@/router";
import { HOME, LOGIN } from "@/router/routes/constant";
import { useMultipleTabs } from "@/store/modules/multipleTab";
import { useNavigateStore } from "@/store/modules/navigate";
import { defineStore } from "pinia";

const STORE_ID = "user";

/** user store 订阅入口；当前模块不做持久化。 */
export function subscribeUserStore() {
    return;
}

export const useUserStore = defineStore(STORE_ID, () => {
    const sessionState = adminAuthClient.useSession();
    const initialized = ref(false);
    const permissions = ref<string[]>([]);
    const sessionSnapshot = ref<AdminAuthSession | null>(getStoredSessionSnapshot());
    const authStateClearedLocally = ref(false);
    let versionChangeRefreshPromise: Promise<boolean> | null = null;

    /** 从 Better Auth customSession 中提取服务端最新会话，无会话时为 null */
    const liveSession = computed<AdminAuthSession | null>(() => {
        return (sessionState.value.data as AdminAuthSession | null | undefined) ?? null;
    });

    /** 优先使用主动刷新写入的快照；Better Auth useSession 不会在手动切 token 后立即同步 */
    const session = computed<AdminAuthSession | null>(() => {
        if (authStateClearedLocally.value) return null;
        return sessionSnapshot.value ?? liveSession.value;
    });

    /** 当前是否已登录（会话中存在有效 user.id） */
    const isLoggedIn = computed(() => Boolean(session.value?.user?.id));

    /** 当前会话是否由 Better Auth admin impersonate 创建 */
    const isImpersonating = computed(() => Boolean(session.value?.session?.impersonatedBy));

    /** 当前伪装会话的原管理员 userId */
    const impersonatedBy = computed(() => session.value?.session?.impersonatedBy ?? null);

    /** 从 customSession 中提取角色 code 列表，供权限判断使用 */
    const roles = computed<string[]>(() => {
        const r = session.value?.roles;
        if (!Array.isArray(r)) return [];
        return r.map((item) => item.code).filter(Boolean);
    });

    /** 从 customSession 中提取用户基础信息 */
    const userInfo = computed(() => session.value?.user ?? {});

    /** 把扁平 permission token 数组打包成 Set，供 hasPermission 做 O(1) 命中检查 */
    const permissionSet = computed(() => new Set(permissions.value));

    // useSession 拿到新会话后同步覆盖本地快照；确认无会话时清理快照避免界面回退到过期快照
    watch(liveSession, (next) => {
        if (authStateClearedLocally.value) return;

        if (next) {
            sessionSnapshot.value = next;
            setStoredSessionSnapshot(next);
        } else if (
            initialized.value &&
            !sessionState.value?.isPending &&
            !sessionState.value?.error
        ) {
            // useSession 已完成加载且无错误，说明服务端确认无有效会话。
            sessionSnapshot.value = null;
            clearStoredAuthState();
        }
    });

    /**
     * 从后端组合导航接口一次性拉取当前会话权限和动态菜单。
     */
    async function fetchPermissions() {
        const res = await getAccountNavigationApi();
        const navigation = res.data as AccountNavigationDto;
        permissions.value = navigation.permissions;
        const navigateStore = useNavigateStore();
        await navigateStore.applyAsyncMenuList(navigation.menus);
    }

    async function fetchAdminPreferences() {
        const { useConfigStore } = await import("@/store/modules/config");
        const configStore = useConfigStore();
        await configStore.loadRemotePreferences();
    }

    async function refreshAfterSuccessfulLogin(token: string, rememberMe: boolean) {
        clearStoredImpersonationOriginToken();
        setStoredToken(token, rememberMe);
        await initializeAuthState(true);
    }

    /**
     * 采用 Better Auth 账号密码、手机号密码或手机号验证码登录，成功后恢复完整业务态。
     */
    async function login(loginData: LoginParams) {
        const rememberMe = loginData.rememberMe ?? false;
        const result =
            loginData.loginMethod === "phone-code"
                ? await adminAuthClient.phoneNumber.verify({
                      phoneNumber: loginData.phoneNumber ?? "",
                      code: loginData.code ?? "",
                  })
                : loginData.loginMethod === "phone-password"
                  ? await adminAuthClient.signIn.phoneNumber({
                        phoneNumber: loginData.phoneNumber ?? "",
                        password: loginData.password ?? "",
                        rememberMe,
                    })
                  : await adminAuthClient.signIn.username({
                        username: loginData.account ?? "",
                        password: loginData.password ?? "",
                        rememberMe,
                    });

        if (result.error) {
            return Promise.reject(result.error);
        }

        const authToken = result.data?.token;
        if (!authToken) {
            throw new Error("Better Auth 登录成功但未返回 token");
        }

        await refreshAfterSuccessfulLogin(authToken, rememberMe);
        return result.data;
    }

    /**
     * 发送 Better Auth 手机号验证码，用于手机号验证码登录和手机号注册。
     */
    async function sendPhoneLoginCode(phoneNumber: string) {
        const result = await adminAuthClient.phoneNumber.sendOtp({ phoneNumber });
        if (result.error) {
            return Promise.reject(result.error);
        }
        return result.data;
    }

    /**
     * 恢复会话 + 拉取权限，双阶段恢复前端登录态。
     * force=true 时直接请求服务端拉取最新会话。
     */
    async function initializeAuthState(force = false): Promise<boolean> {
        let currentSession: AdminAuthSession | null = null;

        if (force) {
            // 强制刷新：直接请求服务端
            const result = await adminAuthClient.getSession();
            currentSession = (result.data as AdminAuthSession | null | undefined) ?? null;
            if (currentSession) {
                authStateClearedLocally.value = false;
                sessionSnapshot.value = currentSession;
                setStoredSessionSnapshot(currentSession);
            } else {
                authStateClearedLocally.value = true;
                sessionSnapshot.value = null;
                clearStoredAuthState();
            }
        } else {
            // 非强制：信任 useSession 响应式数据和本地快照，不发请求
            currentSession = authStateClearedLocally.value
                ? null
                : (liveSession.value ?? sessionSnapshot.value ?? null);
        }

        if (!currentSession) {
            permissions.value = [];
            initialized.value = true;
            return false;
        }

        // 已初始化且权限列表非空时跳过重复拉取
        if (!force && initialized.value && permissions.value.length > 0) {
            return true;
        }

        await fetchPermissions();
        await fetchAdminPreferences();
        initialized.value = true;
        return true;
    }

    /**
     * 清空前端登录态并跳转到登录页。
     */
    async function clearAuthStateAndRedirect() {
        const multipleTabsStore = useMultipleTabs();
        const navigateStore = useNavigateStore();

        authStateClearedLocally.value = true;
        sessionSnapshot.value = null;
        clearStoredImpersonationOriginToken();
        clearStoredAuthState();
        permissions.value = [];
        initialized.value = false;
        versionChangeRefreshPromise = null;
        multipleTabsStore.reset();
        navigateStore.reset();

        if (router.currentRoute.value.name !== LOGIN) {
            await router.replace({ name: LOGIN });
        }
    }

    async function refreshAfterSessionSwitch(token: string): Promise<boolean> {
        const multipleTabsStore = useMultipleTabs();
        const navigateStore = useNavigateStore();

        setStoredToken(token);
        authStateClearedLocally.value = false;
        sessionSnapshot.value = null;
        permissions.value = [];
        initialized.value = false;
        versionChangeRefreshPromise = null;
        multipleTabsStore.reset();
        navigateStore.reset();

        const ok = await initializeAuthState(true);
        if (ok && router.currentRoute.value.name !== HOME) {
            await router.replace({ name: HOME });
        }
        return ok;
    }

    /**
     * 切换到目标用户的 Better Auth 伪装会话，并立即刷新 session、权限和菜单。
     */
    async function impersonateUser(userId: string): Promise<boolean> {
        const originToken = getStoredToken();
        if (!originToken) {
            throw new Error("当前会话缺少 Bearer token，无法进入伪装");
        }

        const token = await impersonateBetterAuthUser(userId);
        setStoredImpersonationOriginToken(originToken);
        return refreshAfterSessionSwitch(token);
    }

    /**
     * 退出 Better Auth 伪装会话，恢复原管理员 token，并刷新权限菜单。
     */
    async function stopImpersonating(): Promise<boolean> {
        const originToken = getStoredImpersonationOriginToken();
        if (!originToken) {
            throw new Error("缺少进入伪装前的原始 Bearer token，请重新登录");
        }

        try {
            await revokeCurrentBetterAuthSession();
        } catch (error) {
            console.warn("撤销当前伪装会话失败，仍会恢复原始 Bearer token", error);
        }

        clearStoredImpersonationOriginToken();
        return refreshAfterSessionSwitch(originToken);
    }

    /**
     * 收到 x-user-state-changed 后，串行刷新 session、权限与菜单，避免并发重复刷新。
     */
    async function refreshAuthStateByVersionChange(): Promise<boolean> {
        if (versionChangeRefreshPromise) {
            return versionChangeRefreshPromise;
        }

        versionChangeRefreshPromise = (async () => {
            const result = await adminAuthClient.getSession();
            const currentSession = (result.data as AdminAuthSession | null | undefined) ?? null;

            if (!currentSession) {
                await clearAuthStateAndRedirect();
                return false;
            }

            authStateClearedLocally.value = false;
            sessionSnapshot.value = currentSession;
            setStoredSessionSnapshot(currentSession);
            await fetchPermissions();
            await fetchAdminPreferences();
            initialized.value = true;
            return true;
        })().finally(() => {
            versionChangeRefreshPromise = null;
        });

        return versionChangeRefreshPromise;
    }

    /**
     * 调用 Better Auth 登出接口，清除本地状态并跳转登录页。
     */
    async function logout() {
        try {
            await adminAuthClient.signOut();
        } finally {
            await clearAuthStateAndRedirect();
        }
    }

    return {
        initialized,
        sessionState,
        session,
        isLoggedIn,
        isImpersonating,
        impersonatedBy,
        userInfo,
        permissions,
        permissionSet,
        roles,
        login,
        sendPhoneLoginCode,
        fetchPermissions,
        initializeAuthState,
        clearAuthStateAndRedirect,
        refreshAuthStateByVersionChange,
        impersonateUser,
        stopImpersonating,
        reset: () => {
            permissions.value = [];
            initialized.value = false;
            versionChangeRefreshPromise = null;
        },
        logout,
    };
});
