<!-- 顶部统计 -->
<template>
    <div
        class="header tw:mb-2 tw:rounded-[4px]! tw:grid tw:grid-cols-2 tw:lg:grid-cols-4 tw:grid-flow-row tw:gap-2"
    >
        <a-card
            :loading="getMonitorSaleLoading"
            class="custom-card tw:rounded-[4px]! tw:text-c-3! tw:bg-linear-to-l! tw:from-p-2 tw:to-p-5"
            :bordered="false"
        >
            <template v-slot:title>
                <span class="tw:text-body-3 tw:text-[#fff]">销售额</span>
            </template>
            <template #extra>
                <a-space size="mini">
                    <a-button
                        type="text"
                        size="mini"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                    </a-button>
                    <a-radio-group
                        v-model="saleDateType"
                        type="button"
                        size="mini"
                        class="custom-radios"
                    >
                        <a-radio :value="1">日</a-radio>
                        <a-radio :value="2">周</a-radio>
                        <a-radio :value="3">月</a-radio>
                    </a-radio-group>
                </a-space>
            </template>
            <div>
                <div class="header__value tw:text-title-4 tw:mb-2 tw:text-[#fff]">
                    ￥
                    <a-statistic
                        :value="125670"
                        show-group-separator
                        :start="true"
                        :animation-duration="1000"
                        animation
                        :value-style="{ color: '#fff' }"
                    >
                        <template #suffix>
                            <icon-caret-up style="color: #fff" />
                        </template>
                    </a-statistic>
                </div>
                <div class="header__chart tw:w-full tw:h-16">
                    <NaChart
                        :init-options="{
                            renderer: 'svg',
                        }"
                        :option="saleOption"
                    ></NaChart>
                </div>
                <div class="header__footer tw:text-body-2 tw:text-[#fff]">累计销售额:$1222670</div>
            </div>
        </a-card>
        <a-card
            :loading="getMonitorSaleLoading"
            class="custom-card tw:rounded-[4px]!"
            :bordered="false"
        >
            <template v-slot:title>
                <span class="tw:text-body-3">订单量</span>
            </template>
            <template #extra>
                <a-space size="mini">
                    <a-button
                        type="text"
                        size="mini"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                    </a-button>
                    <a-radio-group
                        v-model="saleDateType"
                        type="button"
                        size="mini"
                        class="custom-radios"
                    >
                        <a-radio :value="1">日</a-radio>
                        <a-radio :value="2">周</a-radio>
                        <a-radio :value="3">月</a-radio>
                    </a-radio-group>
                </a-space>
            </template>
            <div>
                <div class="header__value tw:text-title-4 tw:mb-2">
                    ￥
                    <a-statistic
                        :value="125670"
                        show-group-separator
                        :start="true"
                        :animation-duration="1000"
                        animation
                    >
                        <template #suffix>
                            <icon-caret-up style="color: green" />
                        </template>
                    </a-statistic>
                </div>
                <div class="header__chart tw:w-full tw:h-16">
                    <NaChart
                        :init-options="{
                            renderer: 'svg',
                        }"
                        :option="orderOption"
                    ></NaChart>
                </div>
                <div class="header__footer tw:text-body-2">累计销售额:$1222670</div>
            </div>
        </a-card>
        <a-card
            class="custom-card tw:rounded-[4px]!"
            :bordered="false"
        >
            <template v-slot:title>
                <span class="tw:text-body-3">访问量</span>
            </template>
            <template #extra>
                <a-space size="mini">
                    <a-button
                        type="text"
                        size="mini"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                    </a-button>
                </a-space>
            </template>
            <div>
                <div class="header__value tw:text-title-4 tw:mb-2">
                    ￥
                    <a-statistic
                        :value="125670"
                        show-group-separator
                        :start="true"
                        :animation-duration="1000"
                        animation
                    >
                        <template #suffix>
                            <icon-caret-up style="color: green" />
                        </template>
                    </a-statistic>
                </div>
                <div class="header__chart tw:w-full tw:h-16 tw:flex tw:items-center">
                    <a-progress
                        :size="'large'"
                        :percent="0.3"
                        :style="{ width: '100%' }"
                    >
                        <template v-slot:text="scope">
                            <span class="tw:text-body-3">{{ scope.percent * 100 }}%</span>
                        </template>
                    </a-progress>
                </div>
                <div class="header__footer tw:text-body-2">累计销售额:$1222670</div>
            </div>
        </a-card>
        <a-card
            class="custom-card tw:rounded-[4px]!"
            :bordered="false"
        >
            <template v-slot:title>
                <span class="tw:text-body-3">访问量</span>
            </template>
            <template #extra>
                <a-space size="mini">
                    <a-button
                        type="text"
                        size="mini"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                    </a-button>
                </a-space>
            </template>
            <div>
                <div class="header__value tw:text-title-4 tw:mb-4">
                    ￥
                    <a-statistic
                        :value="125670"
                        show-group-separator
                        :start="true"
                        :animation-duration="1000"
                        animation
                    >
                        <template #suffix>
                            <icon-caret-up style="color: green" />
                        </template>
                    </a-statistic>
                </div>
                <div class="header__chart tw:w-full tw:h-16 tw:flex tw:justify-around">
                    <a-progress
                        v-for="item in 2"
                        :type="'circle'"
                        :size="'medium'"
                        :percent="1 / item"
                    >
                        <template v-slot:text="scope">
                            <span class="tw:text-body-3">
                                {{ (scope.percent * 100).toFixed(1) }}%
                            </span>
                        </template>
                    </a-progress>
                </div>
            </div>
        </a-card>
    </div>
</template>

<script setup lang="ts">
    import NaChart from "@/components/NaChart.vue";
    import { getMonitorSale } from "@/api/monitor";
    import { BarChart, LineChart, MapChart } from "echarts/charts";
    import {
        DataZoomComponent,
        DatasetComponent,
        GeoComponent,
        GridComponent,
        TitleComponent,
        TooltipComponent,
        VisualMapComponent,
    } from "echarts/components";
    import { use } from "echarts/core";
    import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
    import VChart from "vue-echarts";
    import { getPresetPrimaryColors, previewColor } from "@/utils/themeColor";
    import useChartOption from "@/hooks/chart-option";
    import { useRequest } from "@/hooks/useRequest";
    import { useConfigStore } from "@/store";
    let { loading: getMonitorSaleLoading, run: getMonitorSaleRun } = useRequest(getMonitorSale);
    let renderChart = ref(false);
    nextTick(() => {
        renderChart.value = true;
    });
    let configStore = useConfigStore();
    use([
        DataZoomComponent,
        SVGRenderer,
        GridComponent,
        TitleComponent,
        DatasetComponent,
        TooltipComponent,
        VisualMapComponent,
        GeoComponent,
        MapChart,
        CanvasRenderer,
        LineChart,
        BarChart,
    ]);
    let saleDateType = ref(1);
    let saleChartSource = ref([] as any[]);
    let saleOption = useChartOption((dark) => {
        return {
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            backgroundColor: "",
            tooltip: {
                className: "tooltip",
            },
            dataZoom: [
                {
                    type: "inside",
                },
            ],
            grid: {
                top: 5,
                bottom: 5,
                left: 0,
                right: 0,
                containLabel: true,
            },

            dataset: {
                dimensions: ["date", "value"],
                source: saleChartSource.value,
            },
            xAxis: {
                type: "category",
                axisLabel: {
                    show: false,
                },
                axisLine: {
                    show: false,
                },
                axisTick: {
                    interval: 0,
                    inside: true,
                    length: 1,
                    lineStyle: {
                        type: "dashed",
                        opacity: 0.5,
                    },
                },
                axisPointer: {
                    show: true,
                    type: "line",
                    label: {
                        show: false,
                        backgroundColor: "rgba(22, 93, 255,1)",
                    },
                },
            },
            yAxis: {
                type: "value",
                axisLabel: {
                    show: false,
                },
                axisLine: {
                    show: false,
                },
                splitLine: {
                    show: false,
                    lineStyle: {
                        type: "solid",
                        opacity: 0.2,
                    },
                },
            },

            series: [
                {
                    name: "截至时间",
                    type: "line",
                    smooth: 0.2,
                    emphasis: {
                        label: {
                            show: true,
                            position: "bottom",
                        },
                    },
                    symbol: "none",

                    lineStyle: {
                        color: previewColor(configStore.config.themeColor, dark)[6],
                    },
                    areaStyle: {
                        color: previewColor(configStore.config.themeColor, dark)[5],
                        opacity: 0.5,
                    },
                    selectedMode: false,
                    universalTransition: true,
                },
            ],
        };
    });
    let orderChartSource = ref([] as any[]);
    let orderOption = useChartOption((dark) => {
        return {
            color: dark
                ? Object.values(getPresetPrimaryColors(4).dark)
                : Object.values(getPresetPrimaryColors(4).light),
            backgroundColor: "",
            dataZoom: [
                {
                    type: "inside",
                },
            ],
            tooltip: {
                className: "tooltip",
            },
            grid: {
                top: 0,
                bottom: 5,
                left: 0,
                right: 0,
                containLabel: true,
            },

            dataset: {
                dimensions: ["date", "value"],
                source: orderChartSource.value,
            },
            xAxis: {
                type: "category",
                axisLabel: {
                    show: false,
                },
                axisLine: {
                    show: false,
                },
                axisTick: {
                    show: false,
                },
                axisPointer: {
                    show: true,
                    type: "line",
                    label: {
                        show: false,
                        backgroundColor: "rgba(22, 93, 255,1)",
                    },
                },
            },
            yAxis: {
                type: "value",
                axisLabel: {
                    show: false,
                },
                axisLine: {
                    show: false,
                },
                splitLine: {
                    show: false,
                    interval: 2,
                    lineStyle: {
                        type: "solid",
                        opacity: 0.4,
                    },
                },
            },
            series: [
                {
                    name: "截至时间",
                    type: "bar",
                    emphasis: {
                        label: {
                            show: true,
                        },
                    },
                    barWidth: "50%",
                    selectedMode: false,
                    itemStyle: {
                        borderRadius: 2,
                    },
                    color: previewColor(configStore.config.themeColor, dark)[5],
                },
            ],
        };
    });
    onMounted(() => {
        getMonitorSaleRun(1)
            .then((res) => {
                saleChartSource.value = res.data.chartData;
                orderChartSource.value = res.data.chartData;
            })
            .catch((err) => {
                console.log(err);
            });
    });

    watch(saleDateType, () => {
        getMonitorSaleRun(saleDateType.value)
            .then((res) => {
                saleChartSource.value = res.data.chartData;
                orderChartSource.value = res.data.chartData;
            })
            .catch((err) => {
                console.log(err);
            });
    });
</script>

<style scoped lang="scss">
    :deep(.tooltip) {
        border-radius: 4px !important;
        border: none !important;
        background-color: var(--color-bg-opacity-2) !important;
        backdrop-filter: blur(4px) !important;
    }

    .custom-card > :deep(.arco-card-header) {
        height: max-content !important;
        padding-bottom: 0 !important;
        border: none !important;
    }

    .custom-card > :deep(.arco-card-body) {
        padding-top: 10px !important;
        padding-bottom: 10px !important;
    }

    .custom-radios {
        border-radius: 4px !important;
    }

    .custom-radios :deep(.arco-radio-button-content) {
        padding-left: 4px !important;
        padding-right: 4px !important;
    }
</style>
