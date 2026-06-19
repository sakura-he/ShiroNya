<template>
    <a-tabs
        ref="tabsRef"
        v-bind="$attrs"
        :class="[
            'gi-tabs',
            {
                'gi-tabs--hover-close': hoverClose,
                'gi-tabs--custom-close': customClose,
                'gi-tabs--draggable': draggable,
            },
        ]"
    >
        <slot />
        <template
            v-if="$slots.extra"
            #extra
        >
            <slot name="extra" />
        </template>
    </a-tabs>
</template>

<script setup lang="ts">
    /**
     * GiTabs - 增强版 Tabs 组件
     *
     * 封装 Arco Design a-tabs，提供以下增强功能：
     *
     * - hoverClose: 关闭按钮仅在鼠标悬停 tab 时显示（带过渡动画）
     *   作用于 Arco 原生的 .arco-tabs-tab-close-btn
     *
     * - customClose: 隐藏 Arco 原生关闭按钮，改为显示用户在 #title 中
     *   放置的 .gi-tabs-close-btn 元素（hover 时显示）。
     *   使用方式：在 a-tab-pane 的 #title 插槽中放置带 class="gi-tabs-close-btn" 的元素。
     *
     * - draggable: 支持拖拽排序 tab 项
     *
     * 透传所有 a-tabs 的 props 和事件。
     */
    defineOptions({
        name: "GiTabs",
        inheritAttrs: false,
    });

    const props = withDefaults(
        defineProps<{
            /** 是否启用 hover 时才显示关闭按钮（原生关闭按钮） */
            hoverClose?: boolean;
            /** 是否启用自定义关闭按钮模式（隐藏原生，显示 .gi-tabs-close-btn） */
            customClose?: boolean;
            /** 是否启用拖拽排序 */
            draggable?: boolean;
            /** 拖拽动画时长 (ms) */
            dragAnimation?: number;
        }>(),
        {
            hoverClose: true,
            customClose: false,
            draggable: false,
            dragAnimation: 200,
        },
    );

    const emit = defineEmits<{
        (e: "drag-sort", payload: { oldIndex: number; newIndex: number }): void;
    }>();

    const tabsRef = ref<any>(null);

    // ---- 拖拽排序实现（原生 HTML5 Drag & Drop） ----
    let dragState: { el: HTMLElement; index: number } | null = null;

    function getTabElements(): HTMLElement[] {
        const el = tabsRef.value?.$el as HTMLElement | undefined;
        if (!el) return [];
        const listEl = el.querySelector(".arco-tabs-nav-tab-list");
        if (!listEl) return [];
        return Array.from(listEl.querySelectorAll<HTMLElement>(":scope > .arco-tabs-tab"));
    }

    function getTabIndex(target: HTMLElement): number {
        return getTabElements().indexOf(target);
    }

    function findTabElement(el: HTMLElement | null): HTMLElement | null {
        while (el) {
            if (el.classList?.contains("arco-tabs-tab")) return el;
            el = el.parentElement;
        }
        return null;
    }

    function onDragStart(e: DragEvent) {
        const tab = findTabElement(e.target as HTMLElement);
        if (!tab) return;
        const index = getTabIndex(tab);
        if (index === -1) return;
        dragState = { el: tab, index };
        tab.classList.add("gi-tabs-dragging");
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setData("text/plain", String(index));
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "move";
        const tab = findTabElement(e.target as HTMLElement);
        if (!tab || !dragState || tab === dragState.el) return;
        getTabElements().forEach((t) => t.classList.remove("gi-tabs-drag-over"));
        tab.classList.add("gi-tabs-drag-over");
    }

    function onDragLeave(e: DragEvent) {
        const tab = findTabElement(e.target as HTMLElement);
        if (tab) tab.classList.remove("gi-tabs-drag-over");
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        const tab = findTabElement(e.target as HTMLElement);
        if (!tab || !dragState) return;

        const newIndex = getTabIndex(tab);
        const oldIndex = dragState.index;

        getTabElements().forEach((t) => {
            t.classList.remove("gi-tabs-drag-over");
            t.classList.remove("gi-tabs-dragging");
        });

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            emit("drag-sort", { oldIndex, newIndex });
        }
        dragState = null;
    }

    function onDragEnd() {
        getTabElements().forEach((t) => {
            t.classList.remove("gi-tabs-drag-over");
            t.classList.remove("gi-tabs-dragging");
        });
        dragState = null;
    }

    function setupDraggable() {
        getTabElements().forEach((tab) => tab.setAttribute("draggable", "true"));
    }

    function teardownDraggable() {
        getTabElements().forEach((tab) => tab.removeAttribute("draggable"));
    }

    let listEl: HTMLElement | null = null;

    function attachDragListeners() {
        const el = tabsRef.value?.$el as HTMLElement | undefined;
        if (!el) return;
        listEl = el.querySelector(".arco-tabs-nav-tab-list") as HTMLElement | null;
        if (!listEl) return;
        listEl.addEventListener("dragstart", onDragStart);
        listEl.addEventListener("dragover", onDragOver);
        listEl.addEventListener("dragleave", onDragLeave);
        listEl.addEventListener("drop", onDrop);
        listEl.addEventListener("dragend", onDragEnd);
        setupDraggable();
    }

    function detachDragListeners() {
        if (!listEl) return;
        listEl.removeEventListener("dragstart", onDragStart);
        listEl.removeEventListener("dragover", onDragOver);
        listEl.removeEventListener("dragleave", onDragLeave);
        listEl.removeEventListener("drop", onDrop);
        listEl.removeEventListener("dragend", onDragEnd);
        teardownDraggable();
        listEl = null;
    }

    // MutationObserver 监听 tab 列表变化
    let observer: MutationObserver | null = null;

    function startObserver() {
        const el = tabsRef.value?.$el as HTMLElement | undefined;
        if (!el) return;
        const navList = el.querySelector(".arco-tabs-nav-tab-list");
        if (!navList) return;
        observer = new MutationObserver(() => {
            if (props.draggable) setupDraggable();
        });
        observer.observe(navList, { childList: true });
    }

    function stopObserver() {
        observer?.disconnect();
        observer = null;
    }

    onMounted(() => {
        if (props.draggable) attachDragListeners();
        startObserver();
    });

    onBeforeUnmount(() => {
        detachDragListeners();
        stopObserver();
    });

    watch(
        () => props.draggable,
        (val) => {
            if (val) {
                nextTick(() => attachDragListeners());
            } else {
                detachDragListeners();
            }
        },
    );
</script>

<style scoped lang="scss">
    // ---- hoverClose 模式：Arco 原生关闭按钮 hover 时显示 ----
    .gi-tabs--hover-close:not(.gi-tabs--custom-close) {
        :deep(.arco-tabs-tab) {
            .arco-tabs-tab-close-btn {
                width: 0;
                overflow: hidden;
                opacity: 0;
                transition: all 0.15s ease;
            }

            &:hover .arco-tabs-tab-close-btn {
                width: 1em;
                opacity: 1;
            }
        }
    }

    // ---- customClose 模式：隐藏原生关闭按钮，用户自定义 .gi-tabs-close-btn hover 时显示 ----
    .gi-tabs--custom-close {
        :deep(.arco-tabs-tab) {
            // 隐藏原生关闭按钮
            .arco-tabs-tab-close-btn {
                display: none !important;
            }

            // 自定义关闭按钮默认隐藏
            // 样式对齐 Arco 的 .arco-icon-hover（使用 ::before 伪元素做圆形背景）
            .gi-tabs-close-btn {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 0;
                aspect-ratio: 1;
                overflow: hidden;
                opacity: 0;
                transition:
                    width 0.15s ease,
                    opacity 0.15s ease,
                    margin 0.15s ease;
                font-size: 12px;
                line-height: 12px;
                cursor: pointer;
                color: var(--color-text-2);

                &::before {
                    position: absolute;
                    display: block;
                    box-sizing: border-box;
                    width: 100%;
                    height: 100%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background-color: transparent;
                    border-radius: var(--border-radius-circle);
                    transition: background-color 0.1s cubic-bezier(0, 0, 1, 1);
                    content: "";
                }

                &:hover::before {
                    background-color: rgb(var(--danger-6));
                }

                // 确保图标在伪元素之上
                > * {
                    position: relative;
                }
            }

            // hover tab 时显示自定义关闭按钮
            &:hover .gi-tabs-close-btn {
                width: 16px;
                opacity: 1;
                &:hover {
                    color: var(--color-white);
                }
            }
        }
    }

    // ---- 拖拽样式 ----
    .gi-tabs--draggable {
        :deep(.arco-tabs-tab) {
            cursor: default;
        }

        :deep(.gi-tabs-dragging) {
            opacity: 0.5;
            cursor: grabbing;
        }

        :deep(.gi-tabs-drag-over) {
            border-left: 2px solid rgb(var(--primary-6));
        }
    }
</style>
