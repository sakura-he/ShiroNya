<!-- 工作区里面员工数据组件 -->
<template>
    <div class="container tw:w-full">
        <VChart
            class="chart tw:w-full tw:h-96"
            :ref="updateChartRef"
            :option="option"
            v-if="renderChart"
        ></VChart>
    </div>
</template>

<script setup lang="ts">
    import useResizeObserver from "@/utils/resizeObserver";
    import { useDebounce } from "@/utils/useDebounce";
    import dayjs from "dayjs";
    import customParseFormat from "dayjs/plugin/customParseFormat";
    // 引入 echarts 核心模块，核心模块提供了 echarts 使用必须要的接口。
    import * as echarts from "echarts/core";
    // 引入柱状图图表，图表后缀都为 Chartz
    import { RadarChart } from "echarts/charts";
    // 引入提示框，标题，直角坐标系，数据集，内置数据转换器组件，组件后缀都为 Component
    import {
        DatasetComponent,
        LegendComponent,
        TitleComponent,
        TooltipComponent,
        TransformComponent,
    } from "echarts/components";
    // 标签自动布局，全局过渡动画等特性
    import { LabelLayout, UniversalTransition } from "echarts/features";
    // 引入 Canvas 渲染器，注意引入 CanvasRenderer 或者 SVGRenderer 是必须的一步
    import { CanvasRenderer } from "echarts/renderers";
    import { VNodeRef } from "vue";
    import VChart from "vue-echarts";
    dayjs.extend(customParseFormat);

    // 注册必须的组件
    echarts.use([
        TitleComponent,
        TooltipComponent,
        DatasetComponent,
        TransformComponent,
        LabelLayout,
        UniversalTransition,
        CanvasRenderer,
        RadarChart,
        LegendComponent,
    ]);

    let option = reactive({
        tooltip: {
            className: "tooltip",
        },
        title: {
            top: 0,
            left: 0,
            text: "工作任务统计",
            width: "50%",
            textStyle: {
                fontSize: 12,
            },
        },

        legend: {
            top: 0,
            right: 0,
            width: "50%",
            itemWidth: 10,
            itemHeight: 10,
            data: [
                {
                    name: "前天",
                    icon: "circle",
                    textStyle: {
                        fontSize: 12,
                    },
                },
                {
                    name: "昨天",
                    icon: "circle",
                    textStyle: {
                        fontSize: 12,
                    },
                },
                {
                    name: "今天",
                    icon: "circle",
                    textStyle: {
                        fontSize: 12,
                    },
                },
            ],
            itemGap: 10,
            textStyle: {
                color: "#333",
                fontSize: 12,
            },
            selectedMode: "single",
        },
        radar: {
            center: ["50%", "60%"],
            radius: ["0%", "70%"],
            shape: "circle",
            splitNumber: 6,
            axisLine: {
                lineStyle: { width: 0.5 },
            },
            splitLine: {
                lineStyle: {
                    color: [
                        "rgba(238, 197, 102, 0.1)",
                        "rgba(238, 197, 102, 0.2)",
                        "rgba(238, 197, 102, 0.4)",
                        "rgba(238, 197, 102, 0.6)",
                        "rgba(238, 197, 102, 0.8)",
                        "rgba(238, 197, 102, 0.9)",
                    ].reverse(),
                },
            },
            splitArea: {
                areaStyle: {
                    color: "rgba(0,0,0)",
                    shadowColor: "rgba(0, 0, 0, 0.2)",
                    shadowBlur: 10,
                    opacity: 0.8,
                },
            },
            indicator: [
                { name: "已完成", max: 40 },
                { name: "未完成", max: 40 },
                { name: "新开启 ", max: 40 },
            ],
        },
        series: [
            {
                name: "前天",
                type: "radar",
                symbol: "none",
                itemStyle: {
                    color: "#e8f7ff",
                },
                lineStyle: { width: 1, opacity: 1 },
                areaStyle: {
                    opacity: 0.2,
                },
                data: [
                    [3, 18, 23],
                    [32, 25, 26],
                    [23, 15, 26],
                    [12, 15, 30],
                ],
            },
            {
                name: "昨天",
                type: "radar",
                symbol: "none",
                itemStyle: {
                    color: "#d48ffc",
                },
                lineStyle: { width: 1, opacity: 1 },
                areaStyle: {
                    opacity: 0.2,
                },
                data: [
                    [14, 23, 16],
                    [23, 15, 26],
                    [32, 12, 34],
                    [1, 23, 10],
                ],
            },
            {
                name: "今天",
                type: "radar",
                symbol: "none",
                itemStyle: {
                    color: "#e8ffea",
                },
                lineStyle: { width: 1, opacity: 1 },
                areaStyle: {
                    opacity: 0.2,
                },
                data: [
                    [32, 21, 16],
                    [23, 15, 26],
                    [21, 34, 34],
                    [32, 12, 3],
                ],
            },
        ],
    });
    let chart = ref<InstanceType<typeof VChart>>();
    let stopResizeObserver: () => void;
    let { delay, execDebounce } = useDebounce();
    delay.value = 150;
    type ChartRefType = InstanceType<typeof VChart>;
    let isChartResize = false;
    let updateChartRef: VNodeRef = (ref) => {
        isChartResize = false;
        if (ref) {
            chart.value = ref as ChartRefType;
            stopResizeObserver = useResizeObserver({
                el: (ref as ChartRefType).$el,
                observer: () => {
                    execDebounce({
                        callback: () => {
                            isChartResize && (ref as ChartRefType).resize();
                            isChartResize = true;
                        },
                    });
                },
            }).stopObserver;
        }
    };
    let renderChart = ref(false);
    nextTick(() => {
        renderChart.value = true;
    });
    onUnmounted(() => {
        stopResizeObserver();
    });
</script>

<style scoped>
    :deep(.tooltip) {
        border-radius: 4px !important;
        border: none !important;
        background-color: var(--color-bg-opacity-2) !important;
        backdrop-filter: blur(8px) !important;
    }
</style>
