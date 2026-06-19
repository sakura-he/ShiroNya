<template>
    <VChart :ref="updateChartRef" />
</template>

<script lang="ts" setup>
    import { ComponentPublicInstance, Ref } from "vue";
    import useColorMode from "@/hooks/useColorMode";
    import { useDebounce } from "@/utils/useDebounce";
    import { VNodeRef } from "vue";
    import VChart, { THEME_KEY } from "vue-echarts";
    import useResizeObserver from "@/utils/resizeObserver";
    const emit = defineEmits<{
        (e: "update-ref", ref: Element | ComponentPublicInstance): void;
    }>();
    let { delay, execDebounce } = useDebounce();
    delay.value = 150;
    let { isDarkMode } = useColorMode();
    provide(
        THEME_KEY,
        computed(() => (isDarkMode.value ? "dark" : "")),
    );
    // 等组件挂载到dom上在渲染,延迟一下优化卡顿
    let renderChart = ref(false);
    let chart = ref<InstanceType<typeof VChart>>();
    nextTick(() => {
        renderChart.value = true;
    });
    let isChartResize = false;
    let stopResizeObserver: () => void;
    type ChartRefType = InstanceType<typeof VChart>;
    let updateChartRef: VNodeRef = (ref) => {
        isChartResize = false;
        if (ref) {
            emit("update-ref", ref);
            chart.value = ref as ChartRefType;
            stopResizeObserver = useResizeObserver({
                el: (ref as ChartRefType).$el,
                observer: () => {
                    execDebounce({
                        callback: () => {
                            isChartResize && chart.value?.resize();
                            isChartResize = true;
                        },
                    });
                },
            }).stopObserver;
        }
    };
    onUnmounted(() => {
        // 注意 当组件卸载后,为元素绑定的resizeobserver仍然会执行,需要手动卸载
        // https://vuejs.org/guide/essentials/lifecycle.html
        stopResizeObserver();
    });
</script>

<style scoped lang="scss"></style>
