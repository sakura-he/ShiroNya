import { Router, type RouteLocationNormalized } from "vue-router";
import { Message } from "@arco-design/web-vue";
import { useUserStore } from "@/store";
import { hasPermission } from "@/utils/permission";
import { HOME, NOT_FOUND, WHITE_LIST } from "../routes/constant";

/**
 * 判断路由名称是否属于公开白名单。
 */
function isWhiteListRoute(routeName: unknown): boolean {
    // 404 已经过登录态守卫处理，这里放行避免真实未知路由因缺少 requiredPermissionCode 抛错。
    return routeName === HOME || routeName === NOT_FOUND || WHITE_LIST.includes(String(routeName));
}

function shouldSkipPermissionCheck(to: RouteLocationNormalized) {
    return isWhiteListRoute(to.name);
}

/**
 * 提取路由 meta 中的 requiredPermissionCode，约束为非空字符串，避免漏配。
 */
function extractRequiredPermissionCode(requiredPermissionCode: unknown): string | null {
    if (typeof requiredPermissionCode !== "string" || requiredPermissionCode.trim().length === 0) {
        return null;
    }

    return requiredPermissionCode.trim();
}

/**
 * 注册页面级权限守卫，补齐静态路由和隐藏页的前端访问控制。
 */
export default function setupPermissionGuard(router: Router) {
    router.beforeEach((to) => {
        if (shouldSkipPermissionCheck(to)) {
            return true;
        }

        const userStore = useUserStore();
        if (!userStore.isLoggedIn) {
            return true;
        }

        const permissionToken = extractRequiredPermissionCode(to.meta?.requiredPermissionCode);
        if (!permissionToken) {
            throw new Error(
                `路由 ${String(to.name ?? to.path)} 缺少 requiredPermissionCode，不能进入后台权限路由`,
            );
        }

        if (hasPermission(permissionToken)) {
            return true;
        }

        Message.warning({
            content: "当前账号无权访问该页面",
        });
        return {
            name: HOME,
            replace: true,
        };
    });
}
