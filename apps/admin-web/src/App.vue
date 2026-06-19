<template>
    <a-config-provider
        update-at-scroll
        global
    >
        <AppLoadingBarProvider :theme-overrides="loadingBarThemeOverrides">
            <Layout></Layout>
            <AdminApiTraceDevtools v-if="showAdminApiDevtools" />
            <a-drawer
                width="300px"
                v-model:visible="configStore.config.globalSettings"
                placement="right"
                v-bind:footer="false"
                popupContainer="body"
            >
                <Setting></Setting>
            </a-drawer>
        </AppLoadingBarProvider>
    </a-config-provider>
</template>
<script lang="ts" setup>
    import AppLoadingBarProvider from "@/components/AppLoadingBarProvider.vue";
    import useColorMode from "@/hooks/useColorMode";
    import Setting from "@/layout/components/Setting.vue";
    import Layout from "@/layout/Layout.vue";
    import { computed, defineAsyncComponent } from "vue";
    import { apiTraceState } from "@/devtools/admin-api-trace/api-trace-store";
    import {
        subscribeConfigStore,
        subscribeMultipleTabsStore,
        subscribeUserStore,
        useConfigStore,
        useMultipleTabs,
        useUserStore,
    } from "@/store";
    import { deviceEnum } from "@/store/modules/config/types";
    import { setThemeColor } from "./utils/themeColor";
    let userStore = useUserStore();
    subscribeUserStore();
    let configStore = useConfigStore();
    subscribeConfigStore(configStore);
    let multipleTabs = useMultipleTabs();
    subscribeMultipleTabsStore(multipleTabs);
    const showAdminApiDevtools = computed(() => apiTraceState.backendDebugEnabled);
    const loadingBarThemeOverrides = computed(() => ({
        colorLoading: configStore.config.themeColor,
        colorError: "rgb(var(--danger-6))",
        height: "2px",
    }));
    const AdminApiTraceDevtools = defineAsyncComponent(
        () => import("@/devtools/admin-api-trace/AdminApiTraceDevtools.vue"),
    );
    // 监听窗口宽度的变化,判断处于桌面端还是移动端
    let bodyResizeObserver = new ResizeObserver((entries) => {
        let width = 0;
        entries.forEach((item) => {
            if (item.target === document.body) {
                width = item.contentRect.width;
            }
        });
        let type: deviceEnum;
        if (width >= 1600) {
            type = deviceEnum["2xl"];
        } else if (width >= 1200) {
            type = deviceEnum["xl"];
        } else if (width >= 992) {
            type = deviceEnum["lg"];
        } else if (width >= 768) {
            type = deviceEnum["md"];
        } else if (width >= 576) {
            type = deviceEnum["sm"];
        } else {
            type = deviceEnum["xs"];
        }
        configStore.setDevice(type);
    });
    bodyResizeObserver.observe(document.body);
    let { themeChangeCallback, isDarkMode } = useColorMode();
    if (isDarkMode.value) {
        onDark();
    } else {
        onLight();
    }
    // 添加颜色变化后切换指定的arco明暗主题
    themeChangeCallback.addCallback(onDark, "dark");
    themeChangeCallback.addCallback(onLight, "light");
    function onDark() {
        // 设置为暗黑主题
        document.body.setAttribute("arco-theme", "dark");
        // 设置浏览器原生控件的暗黑模式
        document.documentElement.classList.add("dark");
        // 重新生成暗色系列颜色
        setThemeColor(configStore.config.themeColor, true);
    }
    function onLight() {
        // 移除 body 的 arco-theme 属性
        document.body.removeAttribute("arco-theme");
        // 移除浏览器原生控件的暗黑模式
        document.documentElement.classList.remove("dark");
        // 重新生成亮色系列颜色
        setThemeColor(configStore.config.themeColor, false);
    }
</script>
