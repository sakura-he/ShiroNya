<!-- 工作区里面员工数据组件 -->
<template>
    <div class="container tw:w-full tw:h-40 tw:relative">
        <VChart
            class="chart tw:w-full tw:h-40 tw:relative"
            :option="option"
            :ref="updateChartRef"
            v-if="renderChart"
            @mousemove="onChartMousemove"
        ></VChart>
    </div>
</template>

<script setup lang="ts">
    import useResizeObserver from "@/utils/resizeObserver";
    import { useDebounce } from "@/utils/useDebounce";

    import dayjs from "dayjs";
    import customParseFormat from "dayjs/plugin/customParseFormat";
    import VChart from "vue-echarts";
    // 引入 echarts 核心模块，核心模块提供了 echarts 使用必须要的接口。
    import { use } from "echarts/core";
    // 引入柱状图图表，图表后缀都为 Chartz
    import { BarChart, LineChart, PieChart } from "echarts/charts";
    // 引入提示框，标题，直角坐标系，数据集，内置数据转换器组件，组件后缀都为 Component
    import {
        DatasetComponent,
        GridComponent,
        LegendComponent,
        TitleComponent,
        TooltipComponent,
        TransformComponent,
    } from "echarts/components";
    // 标签自动布局，全局过渡动画等特性

    // 引入 Canvas 渲染器，注意引入 CanvasRenderer 或者 SVGRenderer 是必须的一步
    import { CanvasRenderer } from "echarts/renderers";
    import { VNodeRef } from "vue";
    type ChartRefType = InstanceType<typeof VChart>;
    dayjs.extend(customParseFormat);

    let props = defineProps<{
        data: { [props: string]: any };
    }>();
    let renderChart = ref(false);

    let { delay, execDebounce } = useDebounce();
    delay.value = 150;
    // 注册必须的组件
    use([
        PieChart,
        TitleComponent,
        TooltipComponent,
        GridComponent,
        DatasetComponent,
        TransformComponent,
        BarChart,
        CanvasRenderer,
        LineChart,
        LegendComponent,
    ]);
    nextTick(() => {
        renderChart.value = true;
    });
    let isChartResize = false;
    let chart = ref<InstanceType<typeof VChart>>();
    let stopResizeObserver: () => void;
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
    let sourceData = computed<any>(() => {
        let sourceData = props.data.map((item: any) => {
            return [item.date, item.done, item.undone, item.new_work, item.done + item.undone];
        });
        sourceData.unshift(["工作日期", "已完成", "未完成", "新开启", "总任务"]);
        return sourceData;
    });
    let option = reactive({
        legend: {
            right: "5%",
            width: "50%",
            itemWidth: 10,
            itemHeight: 10,
            borderRadius: 3,
            backgroundColor: "rgba(0,0,0,0.1)",
            zlevel: 1,

            data: [
                {
                    name: "已完成",
                    icon: "circle",
                    textStyle: {
                        fontSize: 8,
                    },
                },
                {
                    name: "未完成",
                    icon: "circle",
                    textStyle: {
                        fontSize: 8,
                    },
                },
                {
                    name: "新开启",

                    textStyle: {
                        fontSize: 8,
                    },
                },
            ],
        },
        tooltip: {
            className: "tooltip",
            confine: true,
        },
        dataset: {
            source: sourceData.value,
        },

        grid: {
            containLabel: true,
            top: 10,
            left: 0,
            right: 0,
            bottom: 0,
        },
        xAxis: {
            type: "category",
        },
        yAxis: {
            type: "value",
        },
        series: [
            {
                type: "line",
                name: "已完成",

                label: {
                    show: false,
                },
                emphasis: {
                    focus: "series",
                    label: {
                        show: true,
                    },
                },
            },
            {
                type: "line",
                name: "未完成",

                zlevel: 1,
                emphasis: {
                    focus: "series",
                },
            },
            {
                type: "line",
                name: "新开启",

                emphasis: {
                    focus: "series",
                },
            },
        ],
    });

    let updateMemberDateTimer: number;
    let oldFocusIndex = -1; // 折线图类目轴指定索引的系列设置高index值,在前面

    updateMemberDateTimer = setInterval(() => {
        let source = option.dataset.source;
        source = source.map((item: any, index: number) => {
            if (item.index !== 0) {
                let date = dayjs(item[0], "MM-DD");
                date = date.add(1, "day");
                item[0] = date.format("MM-DD");
                item[1] = item[1] + 1;
                item[2] = item[2] + 1;
                item[3] = item[3] + 1;
            }
            return item;
        });
        option.dataset.source = source;
    }, 5000) as unknown as number;

    let onChartMousemove = (evt: any) => {
        let newSeries = option.series;
        newSeries.forEach((item: any, index: number) => {
            item.zlevel && (item.zlevel = 0);
            item.label &&
                (item.label = {
                    ...item.label,
                    show: false,
                });
            if (index === evt.seriesIndex) {
                item.zlevel = 99;
                if (!item.label) {
                    item.label = {
                        show: true,
                    } as any;
                } else {
                    item.label.show = true;
                }
            }
        });
    };
    onUnmounted(() => {
        clearInterval(updateMemberDateTimer);
        stopResizeObserver();
    });
</script>

<style scoped>
    :deep(.tooltip) {
        border-radius: 4px !important;
        border: none !important;
        background-color: var(--color-bg-opacity-2) !important;
        backdrop-filter: blur(4px) !important;
    }
</style>
