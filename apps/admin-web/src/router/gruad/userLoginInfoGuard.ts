import { WHITE_LIST } from "@/router/routes/constant";
import { useUserStore } from "@/store";
import { useNavigateStore } from "@/store/modules/navigate";
import { Message } from "@arco-design/web-vue";
import type { Router } from "vue-router";
import { HOME, LOGIN } from "../routes/constant";

/**
 * 判断目标路由是否属于无需登录的白名单页面。
 */
function isWhiteListRoute(routeName: unknown): boolean {
    return WHITE_LIST.includes(String(routeName));
}

/**
 * 注册登录态守卫，优先恢复 Better Auth session，再加载业务态账户信息。
 */
export default function setupUserLoginInfoGuard(router: Router) {
    router.beforeEach(async (to) => {
        const userStore = useUserStore();
        const navigateStore = useNavigateStore();
        const hadMenuLoaded = navigateStore.asyncMenuList.length > 0;
        const hasSession = await userStore.initializeAuthState();

        if (hasSession) {
            if (to.name === LOGIN) {
                return {
                    name: HOME,
                };
            }

            if (hadMenuLoaded) {
                return true;
            }

            // 只按原始路径重新匹配，避免启动期先命中 404 catch-all 后继续按 name 跳回 404。
            return {
                path: to.path,
                query: to.query,
                hash: to.hash,
                replace: true,
            };
        }

        if (isWhiteListRoute(to.name)) {
            return true;
        }

        Message.error({
            content: "请登陆后访问",
        });
        return {
            name: LOGIN,
            query: { toUrl: to.fullPath },
            replace: true,
        };
    });
}
