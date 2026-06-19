<template>
    <NaChart
        :init-options="{
            renderer: 'svg',
        }"
        class="chart"
        :option="option"
        :on-update-ref="updateChartRef"
    />
</template>

<script setup lang="ts">
    import NaChart from "@/components/NaChart.vue";

    import { use } from "echarts/core";
    import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

    import useChartOption from "@/hooks/chart-option";
    import { getPresetPrimaryColors } from "@/utils/themeColor";
    import { LineChart } from "echarts/charts";
    import {
        DatasetComponent,
        GridComponent,
        LegendComponent,
        TitleComponent,
        TooltipComponent,
    } from "echarts/components";
    import { LabelLayout, UniversalTransition } from "echarts/features";
    import { provide, ref, VNodeRef } from "vue";
    import VChart, { THEME_KEY } from "vue-echarts";

    use([
        SVGRenderer,
        DatasetComponent,
        CanvasRenderer,
        GridComponent,
        LineChart,
        TitleComponent,
        TooltipComponent,
        LegendComponent,
        LabelLayout,
        UniversalTransition,
    ]);
    let chart = ref<InstanceType<typeof VChart>>();
    provide(THEME_KEY, "");

    type ChartRefType = InstanceType<typeof VChart>;
    let updateChartRef: VNodeRef = (ref) => {
        chart.value = ref as ChartRefType;
    };
    const option = useChartOption((dark) => {
        return {
            backgroundColor: "",
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            tooltip: {
                axisPointer: {
                    type: "cross",
                    label: {
                        backgroundColor: "rgba(22, 93, 255,1)",
                    },
                },
                className: "tooltip",
            },
            grid: {
                left: "3%",
                right: "5%",
                bottom: "3%",
                containLabel: true,
            },
            title: {
                text: "销售额",
                left: "center",
            },
            xAxis: {
                boundaryGap: false,
                type: "category",
            },
            yAxis: {
                type: "value",
            },
            dataset: {
                source: [
                    ["test", "sale"],
                    ["一月", 1020],
                    ["二月", 1500],
                    ["三月", 1020],
                    ["四月", 1200],
                    ["五月", 1730],
                    ["六月", 1240],
                    ["七月", 1600],
                    ["八月", 1400],
                ],
            },
            series: [
                {
                    type: "line",
                    name: "sale",
                    smooth: 0.4,
                    areaStyle: {
                        color: {
                            type: "linear",
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                {
                                    offset: 0,
                                    color: "rgba(22, 93, 255,.9)", // 0% 处的颜色
                                },
                                {
                                    offset: 1,
                                    color: "rgba(190, 218, 255,.4)", // 100% 处的颜色
                                },
                            ],
                            global: false, // 缺省为 false
                        },
                    },
                    label: {
                        show: true,
                    },
                    lineStyle: {
                        cap: "round",
                        color: "#165dff",
                    },
                    symbol: "rect",
                    emphasis: {
                        focus: "series",
                        label: {
                            show: true,
                        },
                    },
                },
            ],
        };
    });
</script>

<style scoped>
    .chart {
        height: 100%;
        width: 100%;
    }

    :deep(.tooltip) {
        border-radius: 4px !important;
        border: none !important;
        background-color: var(--color-bg-opacity-2) !important;
        backdrop-filter: blur(4px) !important;
    }
</style>
