<template>
    <NaChart
        :init-options="{
            renderer: 'svg',
        }"
        class="chart"
        :option="option"
    />
</template>

<script setup lang="ts">
    import NaChart from "@/components/NaChart.vue";
    import type { EChartsOption } from "echarts";
    import { use } from "echarts/core";
    import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
    import { LineChart } from "echarts/charts";
    import { LabelLayout, UniversalTransition } from "echarts/features";
    import {
        TitleComponent,
        TooltipComponent,
        LegendComponent,
        GridComponent,
        DatasetComponent,
    } from "echarts/components";
    import useChartOption from "@/hooks/chart-option";
    import { getPresetPrimaryColors } from "@/utils/themeColor";
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

    const option = useChartOption((dark) => {
        return {
            backgroundColor: "",
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            tooltip: {
                className: "tooltip",
            },
            grid: {
                top: 0,
                left: 12,
                right: 0,
                width: "100%",
                height: "100%",
                containLabel: true,
            },
            xAxis: {
                boundaryGap: false,
                type: "value",
                axisLabel: {
                    show: false,
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: "category",
                axisLine: {
                    show: false,
                },
                axisTick: {
                    show: false,
                },
                axisLabel: {
                    backgroundColor: "#165dff",
                    padding: [3, 6],
                    borderRadius: 999,
                    color: "#fff",
                },
                axisPointer: {
                    show: true,
                    type: "line",
                    label: {
                        show: false,
                    },
                },
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
                    type: "bar",
                    name: "销售额",
                    barWidth: 12,
                    label: {
                        show: true,
                        color: "#fff",
                        position: "insideRight",
                    },

                    itemStyle: {
                        borderRadius: 999,
                    },
                    color: {
                        type: "linear",
                        x: 0,
                        y: 0,
                        x2: 1,
                        y2: 0,
                        colorStops: [
                            {
                                offset: 0,
                                color: "#94bfff", // 100% 处的颜色
                            },
                            {
                                offset: 1,
                                color: "#165dff", // 0% 处的颜色
                            },
                        ],
                        global: false, // 缺省为 false
                    },
                },
            ],
        } as unknown as EChartsOption;
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
