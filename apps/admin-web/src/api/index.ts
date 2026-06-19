import { Message, Typography } from "@arco-design/web-vue";
import axios, { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { appLoadingBar } from "@/utils/loading-bar";
import {
    getStoredToken,
    getStoredUserStateVersion,
    setStoredUserStateVersion,
} from "@/auth/client";
import {
    completeApiTrace,
    failApiTrace,
    prepareApiTrace,
} from "@/devtools/admin-api-trace/api-trace-store";
import { getApiErrorMessage } from "@/utils/apiValidation";
import { h } from "vue";

export interface HttpResponse<T = any> {
    status: number;
    msg: string;
    code: number;
    data: T;
}

/** 去重中的用户状态刷新任务，避免多个并发响应重复触发 session 刷新链。 */
let userStateRefreshPromise: Promise<void> | null = null;

/**
 * 创建后台请求实例，使用 Bearer Token 认证。
 */
function createRequest(): AxiosInstance {
    return axios.create({
        baseURL: import.meta.env.VITE_API_BASE_URL,
        timeout: 5000,
    });
}

/**
 * 触发一次去重后的用户状态刷新链，确保版本变化时只同步一次 session、权限与菜单。
 */
async function triggerUserStateRefresh(): Promise<void> {
    if (userStateRefreshPromise) {
        await userStateRefreshPromise;
        return;
    }

    userStateRefreshPromise = import("@/store")
        .then(async ({ useUserStore }) => {
            const userStore = useUserStore();
            await userStore.refreshAuthStateByVersionChange();
        })
        .catch((error) => {
            // 用户状态刷新失败不应覆盖当前业务请求结果，仅记录日志便于排查。
            console.error("后台用户状态刷新失败", error);
        })
        .finally(() => {
            userStateRefreshPromise = null;
        });

    await userStateRefreshPromise;
}

/**
 * 从响应头同步最新用户状态版本，并在服务端标记变更时触发一次前端状态刷新。
 */
async function syncUserStateFromHeaders(
    response: Pick<AxiosResponse, "headers" | "config">,
): Promise<void> {
    const versionHeaderRaw = response.headers["x-user-state-version"];
    const latestVersion = Array.isArray(versionHeaderRaw) ? versionHeaderRaw[0] : versionHeaderRaw;
    if (typeof latestVersion === "string" && latestVersion) {
        setStoredUserStateVersion(latestVersion);
    }

    const changedHeaderRaw = response.headers["x-user-state-changed"];
    const userStateChanged = Array.isArray(changedHeaderRaw)
        ? changedHeaderRaw[0]
        : changedHeaderRaw;
    // /account/navigation 本身就是权限和菜单刷新入口，不能在它的响应拦截器里再次触发刷新，
    // 否则 refreshAuthStateByVersionChange -> fetchPermissions -> /account/navigation 会等待自身完成。
    if (userStateChanged === "1" && response.config.url !== "/account/navigation") {
        await triggerUserStateRefresh();
    }
}

/**
 * 在请求发送前启动进度条，并注入 Bearer Token 到 Authorization 头。
 */
function handleRequestConfig(config: InternalAxiosRequestConfig) {
    appLoadingBar.start();

    // 从 localStorage 读取 token，注入到请求头
    const token = getStoredToken();
    if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
    }

    // 普通业务请求统一携带本地记录的用户状态版本，供后端判断是否需要刷新 session。
    const userStateVersion = getStoredUserStateVersion();
    if (userStateVersion) {
        config.headers.set("x-user-state-version", userStateVersion);
    }

    return prepareApiTrace(config);
}

/**
 * 统一处理请求阶段抛出的异常。
 */
function handleRequestError(error: unknown) {
    appLoadingBar.error();
    return Promise.reject(error);
}

/**
 * 处理后端统一响应包装，并提取真正的业务数据。
 */
async function handleBusinessResponse(response: AxiosResponse<HttpResponse>) {
    appLoadingBar.done();
    await syncUserStateFromHeaders(response);
    completeApiTrace(response);
    const res = response.data;

    if (res.code !== 200) {
        Message.error({
            content: getApiErrorMessage(res, String(res.code)),
            duration: 1000,
        });
        return Promise.reject(res);
    }

    return res as unknown as AxiosResponse<HttpResponse>;
}

/**
 * 把 HTTP 错误统一渲染成可读提示，便于前端排查会话和接口异常。
 * 401 状态码表示会话过期或未认证，自动清除本地 token 并跳转登录页。
 */
async function handleResponseError(error: AxiosError<any>) {
    appLoadingBar.error();
    failApiTrace(error);
    const response = error.response;

    if (response) {
        await syncUserStateFromHeaders(response);

        // 会话过期或 token 无效时，清除本地状态并跳转登录页
        if (response.status === 401) {
            // 延迟导入避免循环依赖；401 已代表服务端不认可当前会话，只需清理本地态。
            const { useUserStore } = await import("@/store");
            const userStore = useUserStore();
            await userStore.clearAuthStateAndRedirect();
            return Promise.reject(error);
        }

        Message.error({
            content: () =>
                h(
                    Typography,
                    {
                        style: {
                            color: "red",
                            maxWidth: "50vw",
                        },
                        resetOnHover: true,
                    },
                    getApiErrorMessage(
                        response.data,
                        `响应错误,错误码:${response.data?.code || response.status}`,
                    ),
                ),
            duration: 3000,
        });
        return Promise.reject(error);
    }

    if (error.request) {
        Message.error({
            content: () =>
                h(
                    Typography,
                    {
                        style: {
                            color: "red",
                            maxWidth: "50vw",
                        },
                        resetOnHover: true,
                    },
                    error.message || "Request Error",
                ),
            duration: 3000,
        });
        return Promise.reject(error);
    }

    Message.error({
        content: () =>
            h(
                Typography,
                {
                    style: {
                        color: "red",
                        maxWidth: "50vw",
                    },
                    resetOnHover: true,
                },
                error.message || "请求失败",
            ),
        duration: 3000,
    });
    return Promise.reject(error);
}

export const request = createRequest();

request.interceptors.request.use(handleRequestConfig, handleRequestError);
request.interceptors.response.use(handleBusinessResponse, handleResponseError);
