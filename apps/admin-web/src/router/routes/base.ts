import { RouteRecordRaw } from "vue-router";
import { LayoutEnum, MenuEnum, PageTypeEnum } from "../type";
import { HOME, LINK, LOGIN, NOT_FOUND } from "./constant";
// 404路由
export const NOT_FOUND_ROUTE: RouteRecordRaw = {
    path: "/:pathMatch(.*)*",
    name: NOT_FOUND,
    meta: {
        type: MenuEnum.Page,
        pageType: PageTypeEnum.Page,
        layout: LayoutEnum.LAYOUT_SIDE,
    },
    component: () => import("@/views/not-found/index.vue"),
};
export const LINK_ROUTE: RouteRecordRaw = {
    path: "/link",
    name: LINK,
    meta: {
        type: MenuEnum.Page,
        title: "外部链接",
        layout: LayoutEnum.LAYOUT_SIDE,
    },
    component: () => import("@/layout/components/Link.vue"),
};
export const HOME_ROUTE: RouteRecordRaw = {
    path: "/",
    name: HOME,
    component: () => import("@/views/home/Home.vue"),
    meta: {
        type: MenuEnum.Page,
        title: "首页",
        layout: LayoutEnum.LAYOUT_DEFAULT,
    },
};
export const LOGIN_ROUTE: RouteRecordRaw = {
    path: "/login",
    name: LOGIN,
    component: () => import("@/views/login/Login.vue"),
    meta: {
        title: "登录",
        type: MenuEnum.Page,
        layout: LayoutEnum.LAYOUT_DEFAULT,
    },
};
