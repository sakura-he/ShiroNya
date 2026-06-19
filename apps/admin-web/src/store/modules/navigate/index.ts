import { router } from "@/router";
import { coverRoute, firstRoute } from "@/router/routes";
import { NOT_FOUND_ROUTE } from "@/router/routes/base";
import { HOME, LOGIN } from "@/router/routes/constant";
import { MenuEnum } from "@/router/type";
import { recursiveTreeByLastLevel } from "@/utils/breadcrumb";
import createCache, { removeStoreByPrefix } from "@/utils/cache";
import { flat2treeByMap, flatOrder } from "@/utils/treeCover";
import { defineStore } from "pinia";
import { RouteRecordRaw } from "vue-router";
import { TabMeta, useMultipleTabs } from "../multipleTab";
export const STORE_ID = "navigate";
interface INavigateState {
    asyncMenuList: any[]; // 后端返回的原始菜单数组
    treeRoutes: any[]; // 生成的树桩路由数组
    flatRoutes: any[]; // 扁平化路由数组
    breadCrumb: any[]; // 面包屑数组
    currentRouter2MenuTreeLevel: number[];
    openMenuKeys: string[];
    currentSelectedMenuKey: string | undefined;
    startPage: RouteRecordRaw | undefined;
}
let cache = createCache(STORE_ID);

function toMenuKey(value: unknown) {
    if (typeof value !== "number" && typeof value !== "string") {
        return undefined;
    }

    const key = String(value);
    return key.length > 0 ? key : undefined;
}

function normalizeMenuKeys(keys: unknown[]) {
    const uniqueKeys = new Set<string>();
    keys.forEach((key) => {
        const normalizedKey = toMenuKey(key);
        if (normalizedKey) {
            uniqueKeys.add(normalizedKey);
        }
    });
    return Array.from(uniqueKeys);
}

function getCatalogKeysFromBreadcrumb(breadcrumb: any[]) {
    return normalizeMenuKeys(
        breadcrumb.filter((item) => item.type === MenuEnum.Catalog).map((item) => item.id),
    );
}

function getSelectedMenuKeyFromBreadcrumb(breadcrumb: any[]) {
    for (let index = breadcrumb.length - 1; index >= 0; index--) {
        const item = breadcrumb[index];
        if (item.type !== MenuEnum.Button && item.isMenuVisible !== false) {
            return toMenuKey(item.id);
        }
    }
    return undefined;
}

export const useNavigateStore = defineStore(STORE_ID, () => {
    const asyncMenuList = ref<any[]>([]);
    const flatRoutes = ref<RouteRecordRaw[]>([]);
    const treeRoutes = ref<any[]>([]);
    const breadCrumb = ref<any[]>([]);
    const currentRouter2MenuTreeLevel = ref<number[]>([]);
    const openMenuKeys = ref<string[]>([]);
    const currentSelectedMenuKey = ref<string | undefined>(undefined);
    const startPage = ref<RouteRecordRaw | undefined>(undefined);

    const setOpenMenuKeys = (keys: unknown[]) => {
        openMenuKeys.value = normalizeMenuKeys(keys);
    };

    const ensureMenuKeysOpen = (keys: unknown[]) => {
        openMenuKeys.value = normalizeMenuKeys([...openMenuKeys.value, ...keys]);
    };

    /**
     * 使用后端返回的菜单元数据刷新动态路由、菜单树和常驻标签。
     */
    const applyAsyncMenuList = async (menus: any[]) => {
        try {
            let multipleStore = useMultipleTabs();
            let asyncMenuListRes = menus;
            // 排序,拼接完整路由路径
            asyncMenuListRes = flatOrder(asyncMenuListRes, {
                fieldsPath: "order",
                sequential: true,
            });
            asyncMenuList.value.length = 0;
            asyncMenuList.value.push(...asyncMenuListRes);
            // 生成vue-router路由记录
            let routeRecords = coverRoute(asyncMenuListRes);
            // 生成路由树提供给面包屑和菜单使用
            treeRoutes.value.length = 0;
            treeRoutes.value.push(
                ...flat2treeByMap(asyncMenuListRes, {
                    fieldsPath: "order",
                    sequential: true,
                }),
            );

            // 返回第一个单页面,作为登录后的起始页
            startPage.value = firstRoute(routeRecords);
            if (startPage.value === undefined) {
                throw new Error("没有找到有效的起始页");
            }
            // 根路径路由指向第一个有效页面。
            routeRecords.unshift({
                name: HOME,
                path: "/",
                redirect: {
                    name: startPage.value.name,
                },
            });
            // 最后,添加404路由
            routeRecords.push(NOT_FOUND_ROUTE as any);
            // 把生成的路由记录加载到vue-router中
            routeRecords.forEach((routeRecord: RouteRecordRaw) => {
                router.addRoute(routeRecord);
            });
            multipleStore.syncTabsWithRouteMetas(asyncMenuListRes);
            // 将路由中设置了 meta.isResident 的路由添加到tab中
            router.getRoutes().forEach((routeRecord) => {
                if (routeRecord.meta.isResident && routeRecord.meta.type === MenuEnum.Page) {
                    // 添加到tab中

                    let tabMeta: TabMeta = {
                        matchedComponentName: [routeRecord.meta.componentName as string],
                        isPin: true,
                    };
                    // 固定标签的要求:最终路径只能是 meta 中定义的路径和父路由拼接后的路径,不能是由 query
                    // 和 params 拼接的路径,同时,meta 中设置的 component_name 值要和路由最终匹配的
                    // 组件名称一致,否则会影响组件缓存
                    multipleStore.addResidentTab({
                        ...routeRecord,
                        fullPath: routeRecord.path,
                        query: {},
                        params: {},
                        hash: "",
                        tabMeta,
                    });
                }
            });
            // 更新store的routes,方便别的地方使用
            flatRoutes.value.length = 0;
            flatRoutes.value.push(...routeRecords);
            // 生成菜单和路由
        } catch (error) {
            console.log("@store/navigate/applyAsyncMenuList 刷新异步菜单错误", error);
            return Promise.reject(error);
        }
    };

    /**
     * 按菜单 id 更新面包屑，动态路由必须来自后端菜单并携带 id。
     */
    const updateBreadcrumb = (routeMeta: { id?: number }) => {
        if (typeof routeMeta.id !== "number") {
            breadCrumb.value = [];
            currentRouter2MenuTreeLevel.value = [];
            currentSelectedMenuKey.value = undefined;
            return;
        }

        let matches = recursiveTreeByLastLevel(routeMeta.id, treeRoutes.value, "id");

        breadCrumb.value = matches.rData;
        currentRouter2MenuTreeLevel.value = matches.floorArr;
        currentSelectedMenuKey.value = getSelectedMenuKeyFromBreadcrumb(matches.rData);
        ensureMenuKeysOpen(getCatalogKeysFromBreadcrumb(matches.rData));
    };
    /**
     * 判断路由是否为应用启动时注册的静态路由，登出重置只保留基础入口。
     */
    function isConstantRouteName(routeName: unknown) {
        return routeName === HOME || routeName === LOGIN || routeName === NOT_FOUND_ROUTE.name;
    }
    const reset = () => {
        asyncMenuList.value.length = 0;
        flatRoutes.value.length = 0;
        treeRoutes.value.length = 0;
        breadCrumb.value.length = 0;
        currentRouter2MenuTreeLevel.value.length = 0;
        openMenuKeys.value.length = 0;
        currentSelectedMenuKey.value = undefined;
        startPage.value = undefined;
        removeStoreByPrefix(STORE_ID);
        // 清空路由记录
        router.getRoutes().forEach((routeRecord) => {
            if (routeRecord.name && !isConstantRouteName(routeRecord.name)) {
                router.removeRoute(routeRecord.name);
            }
        });
    };
    return {
        asyncMenuList,
        flatRoutes,
        treeRoutes,
        breadCrumb,
        currentRouter2MenuTreeLevel,
        openMenuKeys,
        currentSelectedMenuKey,
        startPage,
        applyAsyncMenuList,
        updateBreadcrumb,
        setOpenMenuKeys,
        ensureMenuKeysOpen,
        reset,
    };
});

type useNavigateStoreType = typeof useNavigateStore;
// 监听state指定键值改变并持久化到本地存储
export function subscribeNavigateStore(store: ReturnType<useNavigateStoreType>) {
    store.$subscribe((mutation, state) => {}, { detached: true });
}
