import { ref } from "vue";
import createCache from "../utils/cache";

// 系统主题模式
export enum colorModeEnum {
    DARK = "dark",
    AUTO = "auto",
    LIGHT = "light",
}
interface changeCallbackType {
    light: Record<symbol, () => any>;
    dark: Record<symbol, () => any>;
}
abstract class Callback {
    callback: changeCallbackType = { light: {}, dark: {} };
    abstract addCallback(cb: () => void, type: string): symbol;
    abstract removeCallback(id: symbol, type: string): void;
    abstract execCallback(type: string): void;
}
class ThemeChangeCallback extends Callback {
    constructor() {
        super();
    }

    addCallback(cb: () => void, type: keyof changeCallbackType): symbol {
        let callbackName = Symbol(type + "_callback");
        this.callback[type][callbackName] = cb;
        return callbackName;
    }
    removeCallback(id: symbol, type: keyof changeCallbackType): void {
        delete this.callback[type][id];
    }
    execCallback(type: keyof changeCallbackType): void {
        Object.getOwnPropertySymbols(this.callback[type]).forEach((prop) => {
            if (typeof this.callback[type][prop] === "function") {
                this.callback[type][prop]();
            }
        });
    }
}
let themeChangeCallback = new ThemeChangeCallback();
let themeCache = createCache("theme");
const CACHE_MODE_NAME = "color_mode";
const LIGHT_THEME_NAMW = "ligth_theme_name";
// 从localstorage读取保存的主题配置
let colorMode = themeCache.getCache(CACHE_MODE_NAME) || colorModeEnum.LIGHT; // 本地没有找到默认为 auto
let lightThemeName = themeCache.getCache(LIGHT_THEME_NAMW) || "default"; // 没有找到使用默认的 default ligth主题
// 所有闭包函数共用的ref
let value = ref(colorMode); // 用户指定的模式 dark light auto
let lightTheme = ref(lightThemeName); // ligth 模式下的主题名称
let isDarkMode = ref(false); // 指示当前系统颜色是否是 dark 模式

export default function useColorMode() {
    // 初始化
    setColorMode(value.value);
    // 监听主题变化媒体查询,给媒体查询添加监听,当主题改变的时候,派发一个color-scheme-change时间
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ({ matches }) => {
        // 发布订阅
        window.dispatchEvent(
            new CustomEvent("color-scheme-change", {
                detail: { matches: matches },
            }),
        );
    });

    // 判断当前处于 light 还是 dark 模式
    function getColorMode() {
        let mode = !!window.matchMedia("(prefers-color-scheme:dark)").matches;
        if (mode) {
            isDarkMode.value = true;
            themeChangeCallback.execCallback("dark");
        } else {
            isDarkMode.value = false;
            themeChangeCallback.execCallback("light");
        }
    }
    // 监听浏览器颜色模式的变化的回调,监听到系统切换为 dark 模式执行dark模式的回调,反之亦然
    function listenerColorModeChange(event: CustomEvent) {
        let matches = event.detail.matches;
        if (matches) {
            isDarkMode.value = true;
            themeChangeCallback.execCallback("dark");
        } else {
            isDarkMode.value = false;
            themeChangeCallback.execCallback("light");
        }
    }

    // 自动模式:监测是否为夜间模式
    function autoMode() {
        // 先判断浏览器处于什么模式,并设置mode为对应的的颜色模式
        getColorMode();
        // 监听浏览器颜色模式变化
        window.addEventListener("color-scheme-change", <any>listenerColorModeChange);
    }

    /***
     * 手动切换模式
     * @event 更改的索引
     */
    function setColorMode(mode: colorModeEnum) {
        // 删除 auto 模式的回调监听
        window.removeEventListener("color-scheme-change", <any>isDarkMode);
        // 保存到当前主题名称到本地
        themeCache.setCache(CACHE_MODE_NAME, mode);
        // 更新当前颜色模式
        value.value = mode;
        // 判断用户选择的主题模式,如果是auto,则自动切换主题
        if (mode === colorModeEnum["AUTO"]) {
            autoMode();
        } else if (mode === colorModeEnum["LIGHT"]) {
            isDarkMode.value = false;
            themeChangeCallback.execCallback("light");
        } else {
            isDarkMode.value = true;
            themeChangeCallback.execCallback("dark");
        }
    }

    // 返回封装好的手动切换主题函数
    return {
        setColorMode,
        value,
        isDarkMode,
        lightTheme,
        themeChangeCallback,
    };
}
