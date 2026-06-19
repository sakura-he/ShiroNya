<template>
    <component
        :is="iconComponent"
        v-if="iconComponent"
        v-bind="$attrs"
        :size="props.size"
        :style="iconStyle"
    />
    <Icon
        v-else-if="isIconifyIcon"
        v-bind="$attrs"
        :icon="props.icon ?? ''"
        :width="props.size"
        :height="props.size"
        :style="iconStyle"
    />
    <span
        v-else-if="customSvg"
        v-bind="$attrs"
        class="dynamic-icon__custom-svg"
        :style="iconStyle"
        v-html="customSvg"
    />
    <icon-question-circle-fill
        v-else
        v-bind="$attrs"
        :size="props.size"
        style="color: rgb(240, 104, 92)"
    />
</template>

<script setup lang="ts">
    import { Icon } from "@iconify/vue";
    import { computed, resolveComponent, watch } from "vue";
    import {
        getCustomIconSvg,
        isCustomIconName,
        isIconifyIconName,
        isIconParkIconName,
        isRemixIconName,
        loadIconParkOutlineIconNames,
        loadRemixIconNames,
    } from "@/utils/iconRegistry";

    defineOptions({
        inheritAttrs: false,
    });

    const props = withDefaults(
        defineProps<{
            icon?: string;
            size?: number | string;
            color?: string;
        }>(),
        {
            size: "1em",
            color: "",
        },
    );

    const iconComponent = computed(() => {
        if (!props.icon || isCustomIconName(props.icon) || isIconifyIconName(props.icon)) {
            return undefined;
        }

        const component = resolveComponent(props.icon);
        return typeof component === "string" ? undefined : component;
    });

    const customSvg = computed(() => getCustomIconSvg(props.icon));

    const isIconifyIcon = computed(() => {
        return !customSvg.value && isIconifyIconName(props.icon);
    });

    const iconStyle = computed(() => {
        const size = getCssUnitValue(props.size);
        return {
            color: props.color || undefined,
            width: size,
            height: size,
        };
    });

    /**
     * 将纯数字尺寸转换成 CSS 可识别的 px 值。
     */
    function getCssUnitValue(value: number | string) {
        if (typeof value === "number") return `${value}px`;
        return /(?:px|em|rem|%)$/.test(value) ? value : `${value}px`;
    }

    /**
     * 当图标名来自内置 Iconify 集合时按需加载离线集合，让菜单回显不依赖首屏静态打包。
     */
    function syncIconifyCollection(iconName?: string) {
        if (isIconParkIconName(iconName)) {
            void loadIconParkOutlineIconNames();
        }
        if (isRemixIconName(iconName)) {
            void loadRemixIconNames();
        }
    }

    watch(() => props.icon, syncIconifyCollection, { immediate: true });
</script>

<style scoped>
    .dynamic-icon__custom-svg {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        line-height: 1;
        vertical-align: middle;
    }

    .dynamic-icon__custom-svg :deep(svg) {
        width: 100%;
        height: 100%;
    }
</style>
