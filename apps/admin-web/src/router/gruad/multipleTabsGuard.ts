import { useMultipleTabs, useNavigateStore } from "@/store";
import createCache from "@/utils/cache";
import { appLoadingBar } from "@/utils/loading-bar";
import { Router } from "vue-router";
import { MenuEnum } from "../type";

const MUTIPLE_CACHE = "multiple_tab";
const mutipleCache = createCache(MUTIPLE_CACHE);

/**
 * 从路由 state 中提取标签页标题，避免把标题塞进 query 影响 tab 唯一性。
 */
function resolveRouteTabTitle(title: unknown) {
    return typeof title === "string" && title.length > 0 ? title : undefined;
}

function resolveDynamicMenuMeta(navigateStore: ReturnType<typeof useNavigateStore>, to: any) {
    const menuMeta = navigateStore.asyncMenuList.find(
        (menu) => menu.path === to.path && menu.type !== MenuEnum.Button,
    );
    if (!menuMeta) {
        return to.meta ?? {};
    }

    const routeName =
        typeof menuMeta.requiredPermissionCode === "string" && menuMeta.requiredPermissionCode
            ? menuMeta.requiredPermissionCode
            : (menuMeta.componentName ?? to.name);
    return {
        ...(to.meta ?? {}),
        ...menuMeta,
        componentName: routeName,
    };
}

function resolveMatchedComponentNames(matched: any[], routeMeta: Record<string, any>) {
    const names = matched
        .filter((routeRecordNormalized) => {
            return (
                (routeRecordNormalized.meta as any)?.componentName ||
                routeRecordNormalized.components?.default?.name
            );
        })
        .map((routeRecordNormalized) => {
            return (
                ((routeRecordNormalized.meta as any)?.componentName as string) ||
                (routeRecordNormalized.components!.default as any).name
            );
        }) as string[];

    if (typeof routeMeta.componentName === "string" && routeMeta.componentName.length > 0) {
        return [
            routeMeta.componentName,
            ...names.filter((name) => name !== routeMeta.componentName),
        ];
    }

    return names;
}

/**
 * 注册多标签页守卫，路由切换后同步标签页、动态标题和面包屑。
 */
export default function setupMultipleTabsGuard(router: Router) {
    router.afterEach((to, from) => {
        let routes = router.getRoutes();
        let multipleStore = useMultipleTabs();
        let navigateStore = useNavigateStore();

        let { matched, redirectedFrom, ...opt } = to;
        let routeMeta = resolveDynamicMenuMeta(navigateStore, to);
        const tabTitle = resolveRouteTabTitle(history.state?.title);
        if (tabTitle) {
            routeMeta = {
                ...routeMeta,
                title: `${routeMeta.title || ""}-${tabTitle}`,
            };
        }
        opt.meta = routeMeta;
        const routeName =
            typeof routeMeta.requiredPermissionCode === "string" && routeMeta.requiredPermissionCode
                ? routeMeta.requiredPermissionCode
                : opt.name;
        let tabMeta = {
            matchedComponentName: resolveMatchedComponentNames(matched, routeMeta),
            isPin: opt.meta.isResident ? true : false,
        };
        multipleStore.addTab({
            ...opt,
            name: routeName,
            // 返回匹配到的路由的组件名称数组
            tabMeta,
        });
        // 更新面包屑
        navigateStore.updateBreadcrumb(routeMeta);

        appLoadingBar.done();
    });
}
