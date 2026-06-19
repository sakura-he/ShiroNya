<template>
    <div class="tw:w-full tw:h-full tw:bg-cbg-1">
        <div
            class="tw:w-full tw:h-full"
            v-for="[routesMapKey, routesMapValue] in openedIframes"
            :key="routesMapKey"
            v-show="route.name === routesMapKey"
        >
            <a-spin
                class="iframe-loading-spin"
                :loading="!routesMapValue.loaded && route.name === routesMapKey"
            >
                <iframe
                    :src="routesMapValue.meta.componentPath as string"
                    frameborder="0"
                    allow="fullscreen"
                    allowfullscreen
                    width="100%"
                    height="100%"
                    v-if="routesMapValue.loaded || route.name === routesMapKey"
                    @load="onIframeLoad(routesMapValue)"
                ></iframe>
            </a-spin>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { useRoute, type RouteMeta } from "vue-router";
    import { useMultipleTabs } from "@/store/index";
    import { MenuEnum, PageTypeEnum } from "@/router/type";
    let multipleTabs = useMultipleTabs();
    let route = useRoute();
    type IIframeRoutesMapValue = {
        loaded: boolean;
        meta: RouteMeta;
    };
    let allIframeRoutesMap = new Map();
    let lastOpenedIframesMap: typeof allIframeRoutesMap = new Map();
    // 获取多标签中打开的 iframe类型的route
    let openedIframes = computed(() => {
        let openedIframesMap: typeof allIframeRoutesMap = new Map();

        multipleTabs.tabs.forEach((tab) => {
            if (tab.meta.type === MenuEnum.Page && tab.meta.pageType === PageTypeEnum.IFrame) {
                let oldIframe = lastOpenedIframesMap.get(tab.name as string);
                // 已打开的 iframe 复用加载状态，新入口初始化状态。
                openedIframesMap.set(
                    tab.name as string,
                    oldIframe ?? shallowReactive({ loaded: false, meta: tab.meta }),
                );
            }
        });
        if (route.meta.type === MenuEnum.Page && route.meta.pageType === PageTypeEnum.IFrame) {
            let oldIframe = lastOpenedIframesMap.get(route.name as string);
            // 已打开的 iframe 复用加载状态，新入口初始化状态。
            openedIframesMap.set(
                route.name as string,
                oldIframe ?? shallowReactive({ loaded: false, meta: route.meta }),
            );
        }
        // 保存当前 iframe 状态，供下次计算复用。
        lastOpenedIframesMap = openedIframesMap;
        return openedIframesMap;
    });
    // 记录 iframe 加载状态，用于避免已打开的 iframe 重复显示加载中。
    function onIframeLoad(routeValue: IIframeRoutesMapValue) {
        routeValue.loaded = true;
    }
</script>

<style scoped lang="scss">
    .iframe-loading-spin,
    .iframe-loading-spin :deep(.arco-spin-children) {
        width: 100%;
        height: 100%;
    }
</style>
