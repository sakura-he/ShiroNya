import { RouteMeta } from "vue-router";
export enum MenuStatusEnum {
    detail = 1, // 菜单详情
    edit = 2, // 编辑菜单状态
    add = 3, // 添加新菜单状态
}

export type MenuDataType = {
    name: string;
    component?: string;
    meta: RouteMeta;
    path: string;
};
