export enum deviceEnum {
    "xs" = 1,
    "sm" = 2,
    "md" = 3,
    "lg" = 4,
    "xl" = 5,
    "2xl" = 6,
}
export interface ConfigStore {
    theme: string;
    colorWeak: boolean;
    navbar: boolean;
    menu: boolean;
    hideMenu: boolean;
    menuCollapse: boolean;
    footer: boolean;
    themeColor: string;
    menuWidth: number;
    globalSettings: boolean;
    device: deviceEnum;
    menuFromServer: boolean;
    tabBar: boolean; // 是否显示多标签栏
    showTabsPinIcon: boolean; // 当标签页固定时,是否用pin图标替代页面的原图标
    translucent: boolean; // 是否开启毛玻璃效果
    quitAnimation: string; // 页面退场动画
    openingAnimation: string; // 页面入场动画
    animationSync: boolean; // 入场动画和出场动画同时进行
    // serverMenu: RouteRecordNormalized[];
    [key: string]: unknown;
}

export type ConfigPreferenceKey =
    | "themeColor"
    | "menuWidth"
    | "tabBar"
    | "showTabsPinIcon"
    | "translucent"
    | "openingAnimation"
    | "quitAnimation"
    | "colorWeak";
