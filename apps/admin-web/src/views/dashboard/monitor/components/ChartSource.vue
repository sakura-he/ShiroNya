<template>
    <NaChart
        :init-options="{
            renderer: 'svg',
        }"
        class="chart"
        :option="option"
        @update-ref="updateChartRef"
    />
</template>

<script lang="ts" setup>
    import NaChart from "@/components/NaChart.vue";
    import useChartOption from "@/hooks/chart-option";
    import { getPresetPrimaryColors } from "@/utils/themeColor";
    import { useDebounce } from "@/utils/useDebounce";
    import { PieChart } from "echarts/charts";
    import { DatasetComponent, TitleComponent, TooltipComponent } from "echarts/components";
    import { use } from "echarts/core";
    import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
    import { DatasetOption } from "echarts/types/dist/shared";
    import { ComponentPublicInstance } from "vue";
    import VChart from "vue-echarts";
    let { delay, execDebounce } = useDebounce();
    delay.value = 150;

    // 等组件挂载到dom上在渲染,延迟一下优化卡顿
    let renderChart = ref(false);
    let chart = ref<InstanceType<typeof VChart>>();
    nextTick(() => {
        renderChart.value = true;
    });
    type ChartRefType = InstanceType<typeof VChart>;
    let updateChartRef = (ref: Element | ComponentPublicInstance) => {
        chart.value = ref as ChartRefType;
    };

    use([
        SVGRenderer,
        TitleComponent,
        DatasetComponent,
        TooltipComponent,
        PieChart,
        CanvasRenderer,
    ]);

    let highlightIndex = 0;
    let option = useChartOption((dark) => {
        return {
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            backgroundColor: "",
            tooltip: {
                position: (_a, _b, tooltip, _d, { viewSize }) => {
                    let tooltipWidth = (tooltip as HTMLDivElement).offsetWidth;
                    let tooltipHeight = (tooltip as HTMLDivElement).offsetHeight;
                    let chartWith = viewSize[0];
                    let chartHeight = viewSize[1];
                    let left = chartWith / 2 - tooltipWidth / 2;
                    let top = chartHeight / 2 - tooltipHeight / 2;
                    return {
                        left,
                        top,
                    };
                },
                padding: 0,
                formatter: "{c} <br /> {d}% ",
                confine: true,
                borderWidth: 0,
                trigger: "item",
                backgroundColor: "rgba(0,0,0,0)",
                className: "chart-source",
            },
            dataset: {
                source: [
                    ["source", "value"],
                    ["百度", 25],
                    ["Youtube", 29],
                    ["哔哩哔哩", 25],
                    ["Github", 22],
                    ["谷歌", 28],
                    ["4chan", 24],
                    ["贴吧", 23],
                    ["推特", 17],
                    ["微信", 21],
                    ["Telegram", 18],
                ],
            } as DatasetOption,
            series: [
                {
                    name: "平台",
                    type: "pie",
                    // roseType:"area",
                    label: {
                        show: true,
                        formatter: "{c} \n {d}%",
                    },
                    itemStyle: {
                        borderRadius: 8,
                        borderColor: "rgba(255,255,255,0.8)",
                        borderWidth: 4,
                        // borderType:'dotted',
                    },
                    emphasis: {
                        label: {
                            fontWeight: "bold",
                        },
                    },
                    radius: ["30%", "70%"],
                },
            ],
        };
    });
    let timer = setInterval(() => {
        let dataset = option.value.dataset as DatasetOption;
        let dataestLength = dataset.source?.length as number;
        if (renderChart.value && chart.value) {
            // 取消之前高亮的图形
            chart.value.dispatchAction({
                type: "downplay",
                seriesIndex: 0,
                dataIndex: highlightIndex,
            });
            // 高亮新的
            if (++highlightIndex >= dataestLength - 1) {
                highlightIndex = 0;
            }
            chart.value.dispatchAction({
                type: "highlight",
                seriesIndex: 0,
                dataIndex: highlightIndex,
            });
            chart.value.dispatchAction({
                type: "showTip",
                seriesIndex: 0,
                dataIndex: highlightIndex,
            });
        }
    }, 1500);
    onUnmounted(() => {
        clearInterval(timer);
    });
</script>

<style scoped>
    .chart {
        height: 100%;
        width: 100%;
    }
    :deep(.chart-source) {
        font-weight: bold !important;
        text-align: center !important;
        box-shadow: none !important;
        width: 30%;
        word-break: break-word !important;
        white-space: normal !important;
    }
</style>
<style></style>
