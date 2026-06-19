<template>
    <NLoadingBarProvider :theme-overrides="themeOverrides">
        <LoadingBarBridge>
            <slot />
        </LoadingBarBridge>
    </NLoadingBarProvider>
</template>

<script setup lang="ts">
    import { registerLoadingBar, unregisterLoadingBar } from "@/utils/loading-bar";
    import { NLoadingBarProvider, useLoadingBar } from "naive-ui/es/loading-bar";
    import type {
        LoadingBarProviderInst,
        LoadingBarProviderProps,
    } from "naive-ui/es/loading-bar";
    import { defineComponent, onBeforeUnmount } from "vue";

    defineProps<{
        themeOverrides?: LoadingBarProviderProps["themeOverrides"];
    }>();

    const LoadingBarBridge = defineComponent({
        name: "LoadingBarBridge",
        setup(_, { slots }) {
            const loadingBar = useLoadingBar();
            registerLoadingBar(loadingBar as LoadingBarProviderInst);

            onBeforeUnmount(() => {
                unregisterLoadingBar(loadingBar as LoadingBarProviderInst);
            });

            return () => slots.default?.();
        },
    });
</script>
