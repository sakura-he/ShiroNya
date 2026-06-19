import "vue-router";
import { RouteMeta } from "vue-router";
export enum MenuEnum {
    Catalog = "Catalog",
    Page = "Page",
    Button = "Button",
}

export enum PageTypeEnum {
    Page = "PAGE",
    Link = "LINK",
    IFrame = "IFRAME",
}

export enum MenuStatusEnum {
    Enable = "Enable",
    Disable = "Disable",
}
export enum LayoutEnum {
    LAYOUT_DEFAULT = "LAYOUT_DEFAULT",
    LAYOUT_SIDE = "LAYOUT_SIDE",
    LAYOUT_TOP = "LAYOUT_TOP",
}
// 公共字段
interface BaseMeta extends RouteMeta {
    id: number;
    pid: number | null;
    description: string | null;
    title: string;
    requiredPermissionCode: string;
    icon?: string;
    order?: number;
    isMenuVisible: boolean;
    status: MenuStatusEnum;
    createdAt?: Date;
    updatedAt?: Date;
}

// Catalog 专属字段
export interface CatalogMeta extends BaseMeta {
    type: MenuEnum.Catalog;
    path: string;
    componentPath: null;
    layout?: undefined;
    isResident?: undefined;
    isCache?: undefined;
    showChildren: boolean;
}

// Page 专属字段
export interface PageMeta extends BaseMeta {
    type: MenuEnum.Page;
    path: string;
    componentPath: string;
    componentName: string;
    layout: string;
    pageType: PageTypeEnum;
    isResident: boolean;
    isCache: boolean;
    isTabVisible: boolean;
}

export interface ButtonMeta extends BaseMeta {
    type: MenuEnum.Button;
}
// 联合类型
export type StrictRouteMeta = CatalogMeta | PageMeta | ButtonMeta;
// src/types/router-meta.d.ts

declare module "vue-router" {
    interface RouteMeta {
        // 基础字段
        id?: number;
        pid?: number | null;
        description?: string | null;
        title?: string;
        requiredPermissionCode?: string;
        icon?: string;
        order?: number;
        isMenuVisible?: boolean;
        status?: MenuStatusEnum;
        createdAt?: Date;
        updatedAt?: Date;

        // 菜单分类
        type?: MenuEnum;

        // Page 专属字段
        path?: string;
        componentPath?: string | null;
        componentName?: string;
        layout?: LayoutEnum | string;
        pageType?: PageTypeEnum;
        isResident?: boolean;
        isCache?: boolean;
        isTabVisible?: boolean;
        // Catalog 专属字段
        showChildren?: boolean;
    }
}
