<!--
  Adapted from https://github.com/lin-97/gi-demo/tree/master/src/components/GiPageLayout
  Modified for ShiroAdmin admin-web: keep Arco Split height constraints and use Arco Scrollbar for content areas.
-->
<template>
    <a-split
        v-if="slots.left"
        v-model:size="splitSize"
        class="gi-page-layout"
        :class="layoutClass"
        :min="min"
        :max="max"
    >
        <template #first>
            <section
                class="gi-page-layout__left"
                :class="{ 'gi-page-layout__left--scrollable': leftScrollable }"
                :style="leftStyle"
            >
                <a-scrollbar
                    v-if="leftScrollable"
                    :outer-style="scrollbarOuterStyle"
                    :style="scrollbarContainerStyle"
                    disable-horizontal
                >
                    <div class="gi-page-layout__scroll-content">
                        <slot name="left" />
                    </div>
                </a-scrollbar>
                <slot
                    v-else
                    name="left"
                />
            </section>
        </template>

        <template #second>
            <section class="gi-page-layout__main">
                <header
                    v-if="slots.header"
                    class="gi-page-layout__header"
                    :style="headerStyle"
                >
                    <slot name="header" />
                </header>
                <main
                    class="gi-page-layout__body"
                    :class="{ 'gi-page-layout__body--scrollable': contentScrollable }"
                    :style="bodyStyle"
                >
                    <a-scrollbar
                        v-if="contentScrollable"
                        :outer-style="scrollbarOuterStyle"
                        :style="scrollbarContainerStyle"
                        disable-horizontal
                    >
                        <div class="gi-page-layout__scroll-content">
                            <slot />
                        </div>
                    </a-scrollbar>
                    <slot v-else />
                </main>
            </section>
        </template>

        <template
            v-if="collapsed || isMobile"
            #resize-trigger-icon
        >
            <a-button
                type="text"
                size="mini"
                class="gi-page-layout__collapse-button"
                @click.stop="toggleLeftPane"
            >
                <template #icon>
                    <icon-right v-if="isLeftPaneCollapsed" />
                    <icon-left v-else />
                </template>
            </a-button>
        </template>
    </a-split>

    <section
        v-else
        class="gi-page-layout"
        :class="layoutClass"
    >
        <section class="gi-page-layout__main">
            <header
                v-if="slots.header"
                class="gi-page-layout__header"
                :style="headerStyle"
            >
                <slot name="header" />
            </header>
            <main
                class="gi-page-layout__body"
                :class="{ 'gi-page-layout__body--scrollable': contentScrollable }"
                :style="bodyStyle"
            >
                <a-scrollbar
                    v-if="contentScrollable"
                    :outer-style="scrollbarOuterStyle"
                    :style="scrollbarContainerStyle"
                    disable-horizontal
                >
                    <div class="gi-page-layout__scroll-content">
                        <slot />
                    </div>
                </a-scrollbar>
                <slot v-else />
            </main>
        </section>
    </section>
</template>

<script setup lang="ts">
    import type { StyleValue } from "vue";
    import type { PageLayoutProps } from "./type";
    import { browse } from "xe-utils";
    import { computed, ref, useSlots } from "vue";

    defineOptions({ name: "GiPageLayout" });

    const props = withDefaults(defineProps<PageLayoutProps>(), {
        size: "270px",
        min: "1px",
        max: "600px",
        margin: false,
        inner: false,
        headerBordered: true,
        leftStyle: () => ({}),
        headerStyle: () => ({}),
        bodyStyle: () => ({}),
        collapsed: false,
        bgTransparent: false,
        contentScrollable: true,
        leftScrollable: true,
    });

    defineSlots<{
        header?: () => void;
        left?: () => void;
        default?: () => void;
    }>();

    const slots = useSlots();
    const isMobile = browse().isMobile ?? false;
    const splitSize = ref<string | number>(isMobile ? "0px" : props.size);
    const scrollbarOuterStyle: StyleValue = {
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
    };
    const scrollbarContainerStyle: StyleValue = {
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflowX: "hidden",
        overflowY: "auto",
    };

    const isLeftPaneCollapsed = computed(() => {
        return Number.parseFloat(String(splitSize.value)) < 20;
    });

    const layoutClass = computed(() => {
        return {
            "gi-page-layout--margin": props.margin,
            "gi-page-layout--inner": props.inner,
            "gi-page-layout--has-header": Boolean(slots.header),
            "gi-page-layout--header-bordered": props.headerBordered,
            "gi-page-layout--bg-transparent": props.bgTransparent,
            "gi-page-layout--content-scrollable": props.contentScrollable,
        };
    });

    /**
     * 切换左侧分栏的折叠状态，复用 Arco Split 自带触发器区域。
     */
    function toggleLeftPane() {
        splitSize.value = isLeftPaneCollapsed.value ? props.size : "0px";
    }
</script>

<style scoped lang="scss">
    :deep(.arco-split-pane) {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    :deep(.arco-split-trigger) {
        position: relative;
    }

    .gi-page-layout {
        box-sizing: border-box;
        display: flex;
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background-color: var(--color-bg-main);
    }

    .gi-page-layout--bg-transparent {
        background-color: transparent;
    }

    .gi-page-layout--margin {
        width: calc(100% - var(--page-pd-x) * 2);
        height: calc(100% - var(--page-pd-y) * 2);
        margin: var(--page-pd-y) var(--page-pd-x);
    }

    .gi-page-layout--inner {
        .gi-page-layout__header {
            padding: 0;
        }

        .gi-page-layout__body {
            padding-right: 0;
            padding-bottom: 0;
            padding-left: 0;
        }

        .gi-page-layout__body--scrollable {
            .gi-page-layout__scroll-content {
                padding-right: 0;
                padding-bottom: 0;
                padding-left: 0;
            }
        }
    }

    .gi-page-layout--header-bordered {
        .gi-page-layout__header {
            border-bottom: 1px solid var(--color-border);
        }
    }

    .gi-page-layout__left,
    .gi-page-layout__main,
    .gi-page-layout__body,
    .gi-page-layout__scroll-content {
        box-sizing: border-box;
        min-width: 0;
        min-height: 0;
    }

    .gi-page-layout__left,
    .gi-page-layout__main,
    .gi-page-layout__body {
        display: flex;
        flex-direction: column;
    }

    .gi-page-layout__left {
        height: 100%;
        padding: var(--page-pd-y) var(--page-pd-x);
        overflow: hidden;
    }

    .gi-page-layout__left--scrollable {
        padding: 0;

        .gi-page-layout__scroll-content {
            padding: var(--page-pd-y) var(--page-pd-x);
        }
    }

    .gi-page-layout__main {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    .gi-page-layout__header {
        box-sizing: border-box;
        flex: 0 0 auto;
        padding: var(--page-pd-y) var(--page-pd-x);
        padding-bottom: 0;
    }

    .gi-page-layout__body {
        flex: 1 1 auto;
        padding: var(--page-pd-y) var(--page-pd-x);
        overflow: hidden;
    }

    .gi-page-layout__body--scrollable {
        padding: 0;

        .gi-page-layout__scroll-content {
            padding: var(--page-pd-y) var(--page-pd-x);
        }
    }

    .gi-page-layout__scroll-content {
        min-height: 100%;
    }

    .gi-page-layout__collapse-button {
        line-height: 1;
    }
</style>
