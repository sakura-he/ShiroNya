<template>
    <div
        ref="containerRef"
        class="container"
    >
        <!--刷新按钮 -->
        <a-button
            type="text"
            class="tw:ml-1"
        >
            <template #icon>
                <Refresh />
            </template>
        </a-button>
        <GiTabs
            :hide-content="true"
            :editable="true"
            :justify="true"
            scroll-position="center"
            :active-key="currentTabKey"
            custom-close
            draggable
            @tab-click="onTabclick"
            @drag-sort="onDragSort"
            class="tabs"
        >
            <a-tab-pane
                :key="tab.fullPath"
                v-for="(tab, tabIndex) in multipleTabsStore.tabs"
                :closable="!tab.tabMeta.isPin"
            >
                <template v-slot:title>
                    <a-dropdown trigger="contextMenu">
                        <a-space
                            :size="6"
                            align="center"
                        >
                            <icon-pushpin
                                v-if="tab.tabMeta.isPin && configStore.config.showTabsPinIcon"
                            />
                            <DynamicIcon
                                v-if="tab?.meta.icon"
                                :icon="tab.meta.icon"
                            />
                            <!-- pin 仅作为状态提示，主图标始终来自路由 meta.icon。 -->

                            <span>{{ tab.meta.title as string }}</span>
                            <span
                                v-if="!tab.tabMeta.isPin"
                                class="gi-tabs-close-btn"
                                @click.stop="onCloseTab(tab.fullPath)"
                            >
                                <icon-close />
                            </span>
                        </a-space>
                        <template #content>
                            <a-doption @click="onCloseRigthTabs(tabIndex)">
                                <template #icon>
                                    <icon-to-right />
                                </template>
                                <template #default>
                                    <span>关闭右侧标签页</span>
                                </template>
                            </a-doption>

                            <a-doption @click="onCloseLeftTabs(tabIndex)">
                                <template #icon>
                                    <icon-to-left />
                                </template>
                                <template #default>
                                    <span>关闭左侧标签页</span>
                                </template>
                            </a-doption>
                            <a-doption @click="onCloseOtherTabs(tabIndex)">
                                <template #icon>
                                    <icon-close />
                                </template>
                                <template #default>
                                    <span>关闭其他标签页</span>
                                </template>
                            </a-doption>
                            <a-doption @click="onCloseAllTabs(tabIndex)">
                                <template #icon>
                                    <icon-delete />
                                </template>

                                <template #default>
                                    <span>关闭全部标签页</span>
                                </template>
                            </a-doption>
                            <a-doption
                                @click="onSwitchResidentTab(tabIndex)"
                                v-if="!tab.meta.is_resident"
                            >
                                <template #icon>
                                    <icon-unlock v-if="tab.tabMeta.isPin" />
                                    <icon-pushpin v-else />
                                </template>

                                <template #default>
                                    <span>
                                        {{ tab.tabMeta.isPin ? "取消常驻标签页" : "常驻标签页" }}
                                    </span>
                                </template>
                            </a-doption>
                        </template>
                    </a-dropdown>
                </template>
            </a-tab-pane>
            <!-- 标签页选项 -->
            <template v-slot:extra>
                <a-tooltip :content="contentFullscreen ? '退出内容全屏' : '全屏内容区'">
                    <a-button
                        size="mini"
                        @click="toggleContentFullscreen"
                    >
                        <template #icon>
                            <icon-fullscreen-exit v-if="contentFullscreen" />
                            <icon-fullscreen v-else />
                        </template>
                    </a-button>
                </a-tooltip>
            </template>
        </GiTabs>
    </div>
</template>

<script setup lang="ts">
    import { useConfigStore } from "@/store";
    import { useMultipleTabs } from "@/store/modules/multipleTab";
    import { useRouter } from "vue-router";
    import DynamicIcon from "../../components/DynamicIcon.vue";
    import { GiTabs } from "@/components/GiTabs";
    import Refresh from "./Refresh.vue";
    let multipleTabsStore = useMultipleTabs();
    const containerRef = ref<HTMLElement>();
    const contentFullscreen = ref(false);

    let router = useRouter();
    const currentRoute = router.currentRoute;
    let configStore = useConfigStore();

    function resolveTabIndex(key: string | number) {
        if (typeof key === "number") {
            return key;
        }
        return multipleTabsStore.tabs.findIndex((tab) => tab.fullPath === key);
    }
    function onTabclick(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        const tab = multipleTabsStore.tabs[tabIndex];
        if (tab) {
            router.push(tab.fullPath);
        }
    }

    function onCloseRigthTabs(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.closeRigthTabs(tabIndex);
        }
    }
    function onCloseLeftTabs(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.closeLeftTabs(tabIndex);
        }
    }
    function onCloseOtherTabs(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.closeOtherTabs(tabIndex);
        }
    }
    function onCloseAllTabs(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.closeAllTabs(tabIndex);
        }
    }
    function onCloseTab(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.closeTab(tabIndex);
        }
    }
    function onSwitchResidentTab(evt: string | number) {
        const tabIndex = resolveTabIndex(evt);
        if (tabIndex >= 0) {
            multipleTabsStore.switchResidentTab(tabIndex);
        }
    }

    function onDragSort({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) {
        const tabs = [...multipleTabsStore.tabs];
        const [moved] = tabs.splice(oldIndex, 1);
        tabs.splice(newIndex, 0, moved);
        multipleTabsStore.tabs = tabs;
    }

    function getContentElement() {
        return containerRef.value?.closest<HTMLElement>(".app-main") ?? null;
    }

    function syncContentFullscreenClass() {
        getContentElement()?.classList.toggle(
            "app-main--content-fullscreen",
            contentFullscreen.value,
        );
    }

    function toggleContentFullscreen() {
        contentFullscreen.value = !contentFullscreen.value;
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && contentFullscreen.value) {
            contentFullscreen.value = false;
        }
    }

    watch(contentFullscreen, syncContentFullscreenClass, { flush: "post" });
    onMounted(() => {
        window.addEventListener("keydown", onKeydown);
        syncContentFullscreenClass();
    });
    onBeforeUnmount(() => {
        getContentElement()?.classList.remove("app-main--content-fullscreen");
        window.removeEventListener("keydown", onKeydown);
    });

    let currentTabKey = computed(() => currentRoute.value.fullPath);
</script>

<style scoped lang="scss">
    .container {
        flex: 0 0 40px;
        display: flex;
        width: 100%;
        height: 40px; // a-tabs的高度是40px
        align-items: center;
        padding: 0 var(--size-2);
        box-sizing: border-box;
        border-bottom: 1px solid var(--color-border-1);
        user-select: none;
        background-color: var(--color-bg-2);
    }

    .tabs {
        flex: 1;
        height: 100%;
        min-width: 0;

        :deep(.arco-tabs-nav),
        :deep(.arco-tabs-nav-tab),
        :deep(.arco-tabs-nav-tab-list),
        :deep(.arco-tabs-tab) {
            height: 100%;
        }
    }
</style>
