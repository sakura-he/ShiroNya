<!--带有侧栏的布局-->
<template>
    <a-layout class="layout-shell">
        <ImpersonationBanner />
        <a-layout-header class="app-header">
            <MyHeader></MyHeader>
        </a-layout-header>
        <a-layout class="layout-body">
            <a-layout-sider
                class="app-sider"
                :width="menuWidth"
                v-if="configStore.config.device > deviceEnum['sm']"
                :collapsible="true"
                :collapsed="menuCollapse"
                @update:collapsed="collapseChange"
            >
                <Menu />
                <div
                    v-if="!menuCollapse"
                    class="app-sider__resize-trigger"
                    role="separator"
                    aria-orientation="vertical"
                    tabindex="0"
                    title="拖动调整菜单栏宽度"
                    @mousedown="startResizeMenuWidth"
                    @keydown.arrow-left.prevent="resizeMenuWidthByKeyboard(-10)"
                    @keydown.arrow-right.prevent="resizeMenuWidthByKeyboard(10)"
                ></div>
            </a-layout-sider>
            <a-layout-content class="app-main">
                <!-- 多标签栏 -->
                <Transition name="tab">
                    <MultipleTab
                        v-if="configStore.config.tabBar"
                        class="mutiple-tab"
                    />
                </Transition>
                <Main></Main>
            </a-layout-content>
        </a-layout>
        <a-drawer
            :width="'60%'"
            :visible="!menuCollapse && configStore.config.device <= deviceEnum['sm']"
            @update:visible="menuCollapse = !$event"
            placement="left"
            unmountOnClose
            :footer="false"
        >
            <Menu />
        </a-drawer>
    </a-layout>
</template>

<script lang="ts" setup>
    defineOptions({
        name: LayoutEnum.LAYOUT_SIDE,
    });
    import MyHeader from "@/layout/components/Header.vue";
    import ImpersonationBanner from "@/layout/components/ImpersonationBanner.vue";
    import Main from "@/layout/components/Main.vue";
    import Menu from "@/layout/components/Menu.vue";
    import MultipleTab from "@/layout/components/MultipleTab.vue";
    import { LayoutEnum } from "@/router/type";
    import { MENU_WIDTH_MAX, MENU_WIDTH_MIN } from "@/store";
    import { deviceEnum } from "@/store/modules/config/types";
    import { useLayoutMenuCollapse } from "./useLayoutMenuCollapse";

    let { configStore, menuCollapse } = useLayoutMenuCollapse();
    let resizingMenuWidth = ref(false);
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let menuWidth = computed(() => {
        // 移动端模式下隐藏侧边栏
        if (configStore.config.device <= deviceEnum["sm"]) {
            menuCollapse.value = true;
            return 0;
        }
        if (menuCollapse.value) return 48;
        return configStore.config.menuWidth;
    });
    function collapseChange(evt: any) {
        menuCollapse.value = evt;
    }
    function updateSiderWidth(width: number) {
        if (menuCollapse.value) return;
        const nextWidth = Math.min(MENU_WIDTH_MAX, Math.max(MENU_WIDTH_MIN, width));
        configStore.updateMenuWidth(nextWidth);
    }
    function startResizeMenuWidth(event: MouseEvent) {
        if (menuCollapse.value) return;
        event.preventDefault();
        if (resizingMenuWidth.value) return;
        resizingMenuWidth.value = true;
        resizeStartX = event.clientX;
        resizeStartWidth = configStore.config.menuWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", onResizeMenuWidth);
        window.addEventListener("mouseup", stopResizeMenuWidth);
    }
    function onResizeMenuWidth(event: MouseEvent) {
        if (!resizingMenuWidth.value) return;
        updateSiderWidth(resizeStartWidth + event.clientX - resizeStartX);
    }
    function stopResizeMenuWidth() {
        if (!resizingMenuWidth.value) return;
        resizingMenuWidth.value = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onResizeMenuWidth);
        window.removeEventListener("mouseup", stopResizeMenuWidth);
    }
    function resizeMenuWidthByKeyboard(offset: number) {
        configStore.updateMenuWidth(configStore.config.menuWidth + offset);
    }
    onBeforeUnmount(() => {
        stopResizeMenuWidth();
    });
</script>

<style scoped lang="scss">
    @use "./layout-shared.scss";

    .layout-body {
        display: flex;
        flex-direction: row;
        flex: 1 1 auto;
        width: 100%;
        min-height: 0;
        overflow: hidden;
    }

    .app-sider {
        flex: 0 0 auto;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        box-sizing: border-box;
        border-right: 1px solid var(--color-border-1);
        backdrop-filter: blur(25px) saturate(150%);
        box-shadow: none !important;
    }

    .app-sider :deep(.arco-layout-sider-children),
    .app-sider :deep(.arco-menu),
    .app-sider :deep(.arco-menu-inner) {
        background: transparent !important;
    }

    .app-sider :deep(.arco-layout-sider-children) {
        height: 100%;
        min-height: 0;
    }

    .app-sider :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-item:not(:hover)),
    .app-sider :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-group-title:not(:hover)),
    .app-sider :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-pop-header:not(:hover)),
    .app-sider :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-inline-header:not(:hover)) {
        background: transparent !important;
        box-shadow: none;
    }

    .app-sider :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-selected-label) {
        background: transparent !important;
    }

    .app-sider__resize-trigger {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 2;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        outline: none;
    }

    .app-sider__resize-trigger::after {
        position: absolute;
        top: 0;
        right: 0;
        width: 2px;
        height: 100%;
        content: "";
        background-color: transparent;
        transition: background-color 0.2s;
    }

    .app-sider__resize-trigger:hover::after,
    .app-sider__resize-trigger:focus-visible::after {
        background-color: var(--color-primary-light-1);
    }
</style>
