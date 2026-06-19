<!-- 顶部菜单布局 -->
<template>
    <a-layout class="layout-shell">
        <ImpersonationBanner />
        <a-layout-header class="app-header">
            <MyHeader :layout="LayoutEnum.LAYOUT_TOP"></MyHeader>
        </a-layout-header>
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
        name: LayoutEnum.LAYOUT_TOP,
    });

    import MyHeader from "@/layout/components/Header.vue";
    import ImpersonationBanner from "@/layout/components/ImpersonationBanner.vue";
    import Main from "@/layout/components/Main.vue";
    import Menu from "@/layout/components/Menu.vue";
    import MultipleTab from "@/layout/components/MultipleTab.vue";
    import { LayoutEnum } from "@/router/type";
    import { deviceEnum } from "@/store/modules/config/types";
    import { useLayoutMenuCollapse } from "./useLayoutMenuCollapse";

    let { configStore, menuCollapse } = useLayoutMenuCollapse();
</script>

<style scoped lang="scss">
    @use "./layout-shared.scss";
</style>
