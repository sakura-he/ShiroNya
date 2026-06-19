<template>
    <a-popover
        trigger="hover"
        position="bottom"
        :content-class="style['color-radio-outer']"
    >
        <div @click="toggleColorMode">
            <slot
                name="default"
                :icon="currentColorModeIcon"
            ></slot>
        </div>

        <template v-slot:content>
            <a-radio-group
                type="button"
                size="large"
                class="theme-radio"
                @change="onColorModeRadioChange"
                :model-value="colorMode"
            >
                <a-radio :value="colorModeEnum['LIGHT']">
                    <icon-sun />
                </a-radio>
                <a-radio :value="colorModeEnum['DARK']">
                    <icon-moon-fill />
                </a-radio>
                <a-radio :value="colorModeEnum['AUTO']">跟随系统</a-radio>
            </a-radio-group>
        </template>
    </a-popover>
</template>
<script lang="ts" setup>
    import useColorMode, { colorModeEnum } from "@/hooks/useColorMode";
    let style = useCssModule();
    let { value: colorMode, setColorMode, isDarkMode } = useColorMode();
    let currentColorModeIcon = computed(() => {
        if (colorMode.value === colorModeEnum["AUTO"]) return "icon-desktop";
        if (colorMode.value === colorModeEnum["DARK"]) return "icon-moon-fill";
        if (colorMode.value === colorModeEnum["LIGHT"]) return "icon-sun";
    });
    function onColorModeRadioChange(evt: any) {
        setColorMode(evt);
    }
    function toggleColorMode() {
        if (isDarkMode.value) {
            setColorMode(colorModeEnum["LIGHT"]);
        } else {
            setColorMode(colorModeEnum["DARK"]);
        }
    }
    defineExpose({
        toggleColorMode,
    });
</script>
<style lang="scss" scoped>
    :deep(.arco-radio-button) {
        border-radius: 999vw !important;
    }

    .theme-radio {
        border-radius: 999vw !important;
        padding: 3px;
    }

    :deep(.nav-btn) {
        color: var(--color-text-2) !important;
    }
</style>
<style lang="scss" module>
    .color-radio-outer {
        padding: 5px 10px !important;
    }
</style>
