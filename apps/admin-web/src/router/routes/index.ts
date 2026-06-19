import LinkComponent from "@/layout/components/Link.vue";
import { RouteRecordRaw, RouterView } from "vue-router";
import { MenuEnum, PageTypeEnum, StrictRouteMeta } from "../type";
// 匹配views里面所有的.vue文件，动态引入
const modules = import.meta.glob("/src/views/**/*.vue");
type RouteComponentLoader = NonNullable<RouteRecordRaw["component"]>;
const NotMatchComponent: RouteComponentLoader = () =>
    import("@/views/exception/not-match-component/NotMatchComponent.vue");
// modules应该是一下结构的对象
// /src/views/login/index.vue: () => import("/src/views/login/index.vue"),
// /src/views/login/Login.vue: () => import("/src/views/login/Login.vue"),
// /src/views/setting/setting.vue: () => import("/src/views/setting/setting.vue"),
// 读取当前可被动态路由加载的页面组件 key。
export function getModulesKey() {
    return Object.keys(modules).map((item) => item.replace("/src/views/", "").replace(".vue", ""));
}

// 校验动态路由名称，后端菜单必须提供全局唯一的 requiredPermissionCode。
function resolveRouteName(menu: StrictRouteMeta): string {
    if (typeof menu.requiredPermissionCode !== "string" || menu.requiredPermissionCode.trim().length === 0) {
        throw new Error(`菜单 ${menu.id} 缺少 requiredPermissionCode，无法生成动态路由 name`);
    }
    return menu.requiredPermissionCode;
}

// 校验动态路由路径，进入这里时 path 必须已经由菜单树规则拼成绝对路径。
function resolveRoutePath(menu: StrictRouteMeta): string {
    if (menu.type === MenuEnum.Button) {
        throw new Error(`按钮菜单 ${menu.requiredPermissionCode} 不能生成路由`);
    }
    if (typeof menu.path !== "string" || !menu.path.startsWith("/") || menu.path.includes("//")) {
        throw new Error(`菜单 ${menu.requiredPermissionCode} 的最终路由 path 非法：${String(menu.path)}`);
    }
    return menu.path;
}

// 将后端菜单元数据转换成 vue-router 动态路由记录。
export function coverRoute(menus: StrictRouteMeta[]): RouteRecordRaw[] {
    return menus
        .filter((menu) => menu.type !== MenuEnum.Button) // 过滤掉按钮类型的菜单
        .map((menu) => {
            const routeName = resolveRouteName(menu);
            const routeRecordRaw: RouteRecordRaw = {
                path: resolveRoutePath(menu),
                name: routeName,
                meta: { ...menu, componentName: routeName },
                component: null as any,
            };
            if (menu.type === MenuEnum.Catalog) {
                routeRecordRaw.component = RouterView;
            } else if (menu.type === MenuEnum.Page) {
                if (menu.pageType === PageTypeEnum.IFrame) {
                    // IFrame 不处理组件
                } else if (menu.pageType === PageTypeEnum.Link) {
                    routeRecordRaw.component = LinkComponent;
                } else {
                    routeRecordRaw.component = loadComponent4String(menu.componentPath!, routeName);
                }
            }
            return routeRecordRaw;
        });
}

// 根据后端 componentPath 精确加载 views 目录下的 Vue 页面组件。
// 通过包装异步加载器，在组件 resolve 后注入稳定的 name 供 keep-alive 匹配，
// 不受 Vite HMR / 异步组件包装影响。
export function loadComponent4String(component: string, componentName?: string) {
    if (typeof component !== "string" || component.trim().length === 0) {
        console.warn("页面菜单缺少 componentPath，已使用组件未匹配兜底页");
        return withComponentName(NotMatchComponent, componentName);
    }

    const normalizedComponent = component.replace(/\\/g, "/");
    if (normalizedComponent.startsWith("/") || normalizedComponent.includes("..")) {
        console.warn(`组件路径必须是 src/views 下的相对路径，已使用组件未匹配兜底页：${component}`);
        return withComponentName(NotMatchComponent, componentName);
    }

    const componentKey = `/src/views/${normalizedComponent}.vue`;
    const matchedModule = modules[componentKey];
    if (!matchedModule) {
        console.warn(`找不到组件 ${componentKey}，请确保菜单 componentPath 与文件路径一致`);
        return withComponentName(NotMatchComponent, componentName);
    }

    return withComponentName(matchedModule, componentName);
}

function withComponentName(loader: RouteComponentLoader, componentName?: string): RouteComponentLoader {
    if (!componentName) {
        return loader;
    }

    // 返回一个新的异步加载器，resolve 后强制覆盖组件的 name
    return () =>
        (loader as () => Promise<any>)().then((mod: any) => {
            const comp = mod.default || mod;
            // 强制设置组件 name，确保 keep-alive include 能稳定匹配
            comp.name = componentName;
            return comp;
        });
}

// 寻找 vue-router 路由记录对象中第一个页面，作为登录后跳转的首页。
export function firstRoute(routes: RouteRecordRaw[]): RouteRecordRaw | undefined {
    for (const route of routes) {
        // 判断当前路由记录是不是个目录,是的话,尝试在路由记录的chlidren记录中寻找
        if (route.meta?.type === MenuEnum["Catalog"] && route.children) {
            let children = firstRoute(route.children);
            if (children) {
                return children;
            }
        }
        // 如果遍历中遇到meta.type=Page类型的路由记录,说明是个单页,终止遍历并返回,
        if (route.meta?.type === MenuEnum["Page"]) {
            return route;
        }
    }
}
