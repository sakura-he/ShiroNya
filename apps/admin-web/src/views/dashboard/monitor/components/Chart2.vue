<template>
    <NaChart
        class="chart"
        :update-options="{
            notMerge: true,
        }"
        :option="option"
    />
</template>

<script lang="ts" setup>
    import NaChart from "@/components/NaChart.vue";
    import useChartOption from "@/hooks/chart-option";
    import useResizeObserver from "@/utils/resizeObserver";
    import { getPresetPrimaryColors } from "@/utils/themeColor";
    import { useDebounce } from "@/utils/useDebounce";
    import { BarChart, LineChart, MapChart } from "echarts/charts";
    import {
        DatasetComponent,
        DataZoomComponent,
        GeoComponent,
        TitleComponent,
        TooltipComponent,
        VisualMapComponent,
    } from "echarts/components";
    import { registerMap, use } from "echarts/core";
    import { UniversalTransition } from "echarts/features";
    import { CanvasRenderer } from "echarts/renderers";
    import { provide, VNodeRef } from "vue";
    import VChart, { THEME_KEY } from "vue-echarts";
    import ChinaMapJSON from "../ChinaMap.json";
    let props = defineProps<{
        type: chart2Type;
    }>();
    enum chart2Type {
        map = 1,
        bar = 2,
    }
    let { delay, execDebounce } = useDebounce();
    delay.value = 150;
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

    use([
        DataZoomComponent,
        TitleComponent,
        DatasetComponent,
        TooltipComponent,
        VisualMapComponent,
        GeoComponent,
        MapChart,
        CanvasRenderer,
        LineChart,
        BarChart,
        UniversalTransition,
    ]);

    registerMap("ChinaMap", ChinaMapJSON as any);
    let data = [
        { name: "河北省", value: 15 },
        { name: "北京市", value: 35 },
        { name: "河南省", value: 15 },
        {
            name: "浙江省",
            value: 25,
        },
        {
            name: "天津市",
            value: 45,
        },
        { name: "湖北省", value: 85 },
        {
            name: "湖南省",
            value: 25,
        },
        { name: "云南省", value: 15 },
        {
            name: "四川省",
            value: 55,
        },
        {
            name: "上海市",
            value: 25,
        },
        {
            name: "青海",
            value: 65,
        },
        { name: "甘肃省", value: 45 },
        {
            name: "测试1",
            value: 85,
        },
        { name: "上海市", value: 35 },
        { name: "山西省", value: 75 },
        {
            name: "山东省",
            value: 65,
        },
        {
            name: "陕西省",
            value: 65,
        },
        {
            name: "辽宁省",
            value: 85,
        },
        { name: "黑龙江省", value: 75 },
        { name: "吉林省", value: 65 },
        {
            name: "辽宁省",
            value: 55,
        },
        { name: "宁夏回族自治区", value: 45 },
        { name: "测试2", value: 85 },
        {
            name: "内蒙古自治区",
            value: 15,
        },
        { name: "江苏", value: 65 },
        {
            name: "安徽省",
            value: 45,
        },
        { name: "福建省", value: 85 },
        {
            name: "广东省 baronne",
            value: 65,
        },
        { name: "贵州省", value: 95 },
    ];
    let mapOption = useChartOption((dark) => {
        return {
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            backgroundColor: "",
            tooltip: {
                className: "map-tooltip",
            },
            dataZoom: [
                {
                    type: "inside",
                },
            ],
            visualMap: {
                left: "0",
                top: "10%",
                min: 50,
                max: 100,
                orient: "vertical",
                text: ["", "Price"],
                realtime: true,
                calculable: true,
                inRange: {
                    color: ["#dbac00", "#db6e00", "#cf0000"],
                },
            },
            dataset: {
                dimensions: ["name", "value"],
                source: data,
            },
            series: [
                {
                    name: "地区",
                    type: "map",
                    map: "ChinaMap",
                    roam: false,
                    emphasis: {
                        label: {
                            show: false,
                        },
                    },
                    selectedMode: false,
                    animationDurationUpdate: 300,
                    universalTransition: true,
                },
            ],
        };
    });
    let barOption = useChartOption((dark) => {
        return {
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            backgroundColor: "",
            dataset: {
                dimensions: ["name", "value"],
                source: data,
            },
            xAxis: {
                type: "category",
                axisLabel: {
                    rotate: 70,
                },
            },
            yAxis: {
                type: "value",
            },
            series: [
                {
                    name: "地区",
                    type: "bar",

                    emphasis: {
                        label: {
                            show: true,
                        },
                    },
                    selectedMode: false,
                    universalTransition: true,
                },
            ],
        };
    });

    const option = computed(() => {
        return props.type === chart2Type["map"] ? mapOption.value : barOption.value;
    });
</script>

<style scoped>
    .chart {
        height: 100%;
        width: 100%;
    }

    :deep(.map-tooltip) {
        border-radius: 4px !important;
        border: none !important;
        background-color: var(--color-bg-opacity-2) !important;
        backdrop-filter: blur(4px) !important;
    }
</style>
