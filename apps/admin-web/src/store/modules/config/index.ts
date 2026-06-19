import defaultSetting from "@/config/setting.json";
import useColorMode from "@/hooks/useColorMode";
import createCache from "@/utils/cache";
import { setThemeColor as _setThemeColor } from "@/utils/themeColor";
import { defineStore } from "pinia";
import {
    queryMyAdminPreferencesApi,
    updateMyAdminPreferencesApi,
    type AdminPreferencePolicy,
    type AdminPreferenceValue,
} from "@/api/admin-preference";
import { ConfigPreferenceKey, ConfigStore, deviceEnum } from "./types";
const STORE_ID = "config_store";
export const MENU_WIDTH_MIN = 150;
export const MENU_WIDTH_MAX = 340;
let cache = createCache(STORE_ID);
let { isDarkMode } = useColorMode();
const preferenceSaveTimers = new Map<ConfigPreferenceKey, ReturnType<typeof setTimeout>>();
const REMOTE_PREFERENCE_KEYS: ConfigPreferenceKey[] = [
    "themeColor",
    "menuWidth",
    "tabBar",
    "showTabsPinIcon",
    "translucent",
    "openingAnimation",
    "quitAnimation",
    "colorWeak",
];
export const useConfigStore = defineStore(STORE_ID, () => {
    let _config = cache.getCache("config") || defaultSetting;
    setupInit(_config);
    let config = ref<ConfigStore>(_config);
    const preferencePolicies = ref<Partial<Record<ConfigPreferenceKey, AdminPreferencePolicy>>>({});
    const preferencesLoaded = ref(false);
    function updateMenuWidth(width: number) {
        config.value.menuWidth = normalizeMenuWidth(width);
        saveUserPreference("menuWidth");
    }
    function setDevice(device: deviceEnum) {
        config.value.device = device;
    }
    function setThemeColor(color: string) {
        config.value.themeColor = color;
        // 当配置对象的颜色改变后,
        _setThemeColor(color, isDarkMode.value);
        saveUserPreference("themeColor");
    }
    function updateColorWeek(value: boolean) {
        config.value.colorWeak = value;
        applyColorWeak(value);
        saveUserPreference("colorWeak");
    }
    function updateTranslucent(value: boolean) {
        config.value.translucent = value;
        setTranslucent(value);
        saveUserPreference("translucent");
    }
    function updatePreferenceValue(key: ConfigPreferenceKey, value: AdminPreferenceValue) {
        if (!isPreferenceEditable(key)) {
            return;
        }
        if (key === "themeColor" && typeof value === "string") {
            setThemeColor(value);
            return;
        }
        if (key === "menuWidth" && typeof value === "number") {
            updateMenuWidth(value);
            return;
        }
        if (key === "colorWeak" && typeof value === "boolean") {
            updateColorWeek(value);
            return;
        }
        if (key === "translucent" && typeof value === "boolean") {
            updateTranslucent(value);
            return;
        }

        (config.value[key] as AdminPreferenceValue) = value;
        saveUserPreference(key);
    }
    async function loadRemotePreferences() {
        try {
            const response = await queryMyAdminPreferencesApi();
            preferencePolicies.value = response.data.policies;
            applyRemoteConfig(response.data.effective);
            preferencesLoaded.value = true;
        } catch (error) {
            // 偏好接口失败时继续使用本地缓存，避免后台基础布局不可用。
            console.error("加载后台偏好失败", error);
        }
    }
    function isPreferenceEditable(key: ConfigPreferenceKey) {
        return preferencePolicies.value[key]?.userEditable !== false;
    }
    function applyRemoteConfig(values: Partial<Record<ConfigPreferenceKey, AdminPreferenceValue>>) {
        REMOTE_PREFERENCE_KEYS.forEach((key) => {
            const value = values[key];
            if (value === undefined) {
                return;
            }
            if (key === "menuWidth" && typeof value === "number") {
                config.value.menuWidth = normalizeMenuWidth(value);
                return;
            }
            if (key === "themeColor" && typeof value === "string") {
                config.value.themeColor = value;
                _setThemeColor(value, isDarkMode.value);
                return;
            }
            if (key === "colorWeak" && typeof value === "boolean") {
                config.value.colorWeak = value;
                applyColorWeak(value);
                return;
            }
            if (key === "translucent" && typeof value === "boolean") {
                config.value.translucent = value;
                setTranslucent(value);
                return;
            }
            if (typeof value === "string" || typeof value === "boolean") {
                (config.value[key] as AdminPreferenceValue) = value;
            }
        });
    }
    function saveUserPreference(key: ConfigPreferenceKey) {
        if (!preferencesLoaded.value || !isPreferenceEditable(key)) {
            return;
        }
        const value = config.value[key];
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            return;
        }
        const existingTimer = preferenceSaveTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        preferenceSaveTimers.set(
            key,
            setTimeout(() => {
                preferenceSaveTimers.delete(key);
                void updateMyAdminPreferencesApi({ [key]: value }).catch((error) => {
                    console.error("保存后台偏好失败", error);
                });
            }, 300),
        );
    }
    return {
        config,
        preferencePolicies,
        preferencesLoaded,
        updateMenuWidth,
        setDevice,
        setThemeColor,
        updateColorWeek,
        updateTranslucent,
        updatePreferenceValue,
        loadRemotePreferences,
        isPreferenceEditable,
    };
});

type useConfigStoreType = typeof useConfigStore;
// 监听state指定键值改变并持久化到本地存储
export function subscribeConfigStore(store: ReturnType<useConfigStoreType>) {
    store.$subscribe(
        (mutation, state) => {
            cache.setCache("config", state.config);
        },
        { detached: true, immediate: true },
    );
}
function applyColorWeak(value: boolean) {
    document.documentElement.style.filter = value ? "invert(80%)" : "none";
}
function setTranslucent(value: boolean) {
    value
        ? document.body.removeAttribute("not-translucent")
        : document.body.setAttribute("not-translucent", "");
}
function setupInit(config: ConfigStore) {
    config.menuWidth = normalizeMenuWidth(config.menuWidth);
    // 初始化颜色
    _setThemeColor(config.themeColor, isDarkMode.value);
    applyColorWeak(config.colorWeak);
    setTranslucent(config.translucent);
}

function normalizeMenuWidth(width: number) {
    const normalizedWidth = Number(width);
    if (!Number.isFinite(normalizedWidth)) {
        return MENU_WIDTH_MIN;
    }
    return Math.min(MENU_WIDTH_MAX, Math.max(MENU_WIDTH_MIN, Math.round(normalizedWidth)));
}
