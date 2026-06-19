import * as arcoIcons from "@arco-design/web-vue/es/icon";
import { addCollection } from "@iconify/vue";

export type IconSourceType = "arco" | "custom" | "iconpark" | "remix";

type CustomSvgModuleMap = Record<string, string>;
type IconifyCollection = Parameters<typeof addCollection>[0] & {
    icons?: Record<string, unknown>;
};

let iconParkIconNamesPromise: Promise<string[]> | undefined;
let remixIconNamesPromise: Promise<string[]> | undefined;

const ICON_PARK_OUTLINE_PREFIX = "icon-park-outline:";
const REMIX_ICON_PREFIX = "ri:";

const customSvgModules = import.meta.glob("../icons/*.svg", {
    eager: true,
    import: "default",
    query: "?raw",
}) as CustomSvgModuleMap;

export const ARCO_ICON_NAMES = Object.keys(arcoIcons).filter((name) => name !== "default");

export const CUSTOM_ICON_SVG_MAP = Object.fromEntries(
    Object.entries(customSvgModules)
        .map(([path, svg]) => [getCustomIconNameFromPath(path), svg])
        .filter(([name]) => Boolean(name)),
) as Record<string, string>;

export const CUSTOM_ICON_NAMES = Object.keys(CUSTOM_ICON_SVG_MAP);

const arcoIconNameSet = new Set(ARCO_ICON_NAMES);
const customIconNameSet = new Set(CUSTOM_ICON_NAMES);

/**
 * 从本地 SVG 文件路径中解析自定义图标名。
 */
function getCustomIconNameFromPath(path: string) {
    return path.match(/([^/\\]+)\.svg$/i)?.[1] ?? "";
}

/**
 * 判断图标名是否属于 Arco 图标库。
 */
export function isArcoIconName(iconName?: string) {
    return Boolean(iconName && arcoIconNameSet.has(iconName));
}

/**
 * 判断图标名是否属于本地自定义 SVG 图标。
 */
export function isCustomIconName(iconName?: string) {
    return Boolean(iconName && customIconNameSet.has(iconName));
}

/**
 * 判断图标名是否是 Iconify 格式的外部图标名。
 */
export function isIconifyIconName(iconName?: string) {
    return Boolean(iconName && /^[a-z0-9-]+:[a-z0-9-]+$/i.test(iconName));
}

/**
 * 判断图标名是否属于内置离线 IconPark 集合。
 */
export function isIconParkIconName(iconName?: string) {
    return Boolean(iconName?.startsWith(ICON_PARK_OUTLINE_PREFIX));
}

/**
 * 判断图标名是否属于内置离线 Remix Icon 集合。
 */
export function isRemixIconName(iconName?: string) {
    return Boolean(iconName?.startsWith(REMIX_ICON_PREFIX));
}

/**
 * 根据图标名推断它应使用的图标源类型。
 */
export function inferIconSourceType(iconName?: string): IconSourceType {
    if (isCustomIconName(iconName)) return "custom";
    if (isIconParkIconName(iconName)) return "iconpark";
    if (isRemixIconName(iconName)) return "remix";
    if (isIconifyIconName(iconName)) return "iconpark";
    return "arco";
}

/**
 * 读取本地自定义 SVG 图标源码。
 */
export function getCustomIconSvg(iconName?: string) {
    if (!iconName) return "";
    return CUSTOM_ICON_SVG_MAP[iconName] ?? "";
}

/**
 * 按图标源类型返回可选择的图标名列表。
 */
export function getIconNamesBySource(sourceType: IconSourceType) {
    if (sourceType === "arco") return ARCO_ICON_NAMES;
    if (sourceType === "custom") return CUSTOM_ICON_NAMES;
    return [];
}

/**
 * 按需加载 IconPark 离线图标集合，并返回选择器使用的完整图标名列表。
 */
export function loadIconParkOutlineIconNames() {
    iconParkIconNamesPromise ??= import("@iconify-json/icon-park-outline/icons.json").then(
        (module) => {
            const collection = module.default as IconifyCollection;
            addCollection(collection);
            return Object.keys(collection.icons ?? {}).map(
                (name) => `${ICON_PARK_OUTLINE_PREFIX}${name}`,
            );
        },
    );

    return iconParkIconNamesPromise;
}

/**
 * 按需加载 Remix Icon 离线图标集合，并返回选择器使用的完整图标名列表。
 */
export function loadRemixIconNames() {
    remixIconNamesPromise ??= import("@iconify-json/ri/icons.json").then((module) => {
        const collection = module.default as IconifyCollection;
        addCollection(collection);
        return Object.keys(collection.icons ?? {}).map((name) => `${REMIX_ICON_PREFIX}${name}`);
    });

    return remixIconNamesPromise;
}

/**
 * 用统一规则过滤图标名，支持完整名称、去掉 icon 前缀后的短名称和 Iconify 冒号后的名称。
 */
export function filterIconNames(iconNames: string[], keyword: string) {
    const normalizedKeyword = normalizeSearchText(keyword);
    if (!normalizedKeyword) return iconNames;

    return iconNames.filter((iconName) => {
        const lowerIconName = iconName.toLowerCase();
        const shortIconName = normalizeSearchText(
            lowerIconName.includes(":")
                ? (lowerIconName.split(":").at(-1) ?? lowerIconName)
                : lowerIconName,
        );
        return (
            normalizeSearchText(lowerIconName).includes(normalizedKeyword) ||
            shortIconName.includes(normalizedKeyword)
        );
    });
}

/**
 * 归一化搜索文本，让用户既能搜完整名称，也能直接搜去掉 icon 前缀后的名称。
 */
function normalizeSearchText(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/^icon[-_:]?/, "");
}
