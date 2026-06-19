<template>
    <GiPageLayout>
        <div class="page">
            <!-- 销售统计 -->
            <Statistic class="header" />
            <!-- 销售表格 -->
            <a-card
                class="chart2 custom-card tw:rounded-[4px]! tw:mb-2"
                :bordered="false"
            >
                <template v-slot:title>
                    <div class="chart2__header tw:w-full">
                        <a-tabs
                            :type="'line'"
                            size="small"
                            :header-padding="false"
                            :hide-content="true"
                        >
                            <template v-slot:extra>
                                <div class="tw:text-body-3">
                                    <a-button
                                        type="text"
                                        size="mini"
                                    >
                                        刷新
                                    </a-button>
                                </div>
                            </template>
                            <div class="tw:text-title-1">
                                <a-tab-pane
                                    key="1"
                                    title="销售额"
                                ></a-tab-pane>
                                <a-tab-pane
                                    key="2"
                                    title="访问量"
                                ></a-tab-pane>
                                <a-tab-pane
                                    key="3"
                                    title="历史销售额"
                                ></a-tab-pane>
                            </div>
                        </a-tabs>
                    </div>
                </template>

                <div class="tw:flex tw:flex-wrap tw:-mx-1">
                    <!-- chart2 -->
                    <div
                        class="chart2__chart tw:min-w-[300px] tw:mx-1 tw:flex-1 tw:h-[420px] tw:grow-[2]"
                    >
                        <Chart1 v-if="showchart1" />
                    </div>
                    <div
                        class="chart2__table tw:flex-col tw:flex tw:min-w-[300px] tw:h-[420px] tw:box-border tw:pl-2 tw:overflow-hidden tw:mx-1 tw:flex-1 tw:grow-[1]"
                    >
                        <GiTable
                            class="tw:flex-1 tw:min-h-0"
                            header-title="销售排名"
                            row-key="key"
                            :columns="columns"
                            :scroll="scroll"
                            :data="data"
                            :pagination="false"
                            :search="false"
                            :options="rankingTableOptions"
                            :columns-state="rankingColumnsState"
                            :bordered="false"
                            :stripe="true"
                        />
                    </div>
                </div>
            </a-card>
            <!-- 销售分步地区表格 -->
            <div class="tw:flex tw:flex-wrap tw:-mx-1">
                <a-card
                    class="chart2 tw:rounded-[4px]! tw:flex-1 tw:min-w-[300px] tw:bg-p-1 tw:mb-2 tw:mx-1"
                    :bordered="false"
                >
                    <div class="tw:flex-none tw:text-title-1 tw:pb-2 tw:flex tw:items-center">
                        <span class="tw:flex-auto">销售地区分布</span>
                        <a-radio-group
                            v-model="chart2TypeValue"
                            :type="'button'"
                            :size="'mini'"
                        >
                            <a-radio :value="chart2Type['map']">地图</a-radio>
                            <a-radio :value="chart2Type['bar']">柱状图</a-radio>
                        </a-radio-group>
                    </div>
                    <div class="tw:flex-1 tw:rounded-[4px]! tw:mb-2 tw:h-[300px]">
                        <Chart2 :type="chart2TypeValue" />
                    </div>
                </a-card>
                <a-card
                    class="chart2 tw:rounded-[4px]! tw:flex-1 tw:min-w-[300px] tw:bg-p-1 tw:mb-2 tw:mx-1"
                    :bordered="false"
                >
                    <div class="tw:flex-none tw:text-title-1 tw:pb-2 tw:flex tw:items-center">
                        <span class="tw:flex-auto">销售来源</span>
                    </div>
                    <div class="tw:flex-1 tw:rounded-[4px]! tw:mb-2 tw:h-[300px]">
                        <ChartSource />
                    </div>
                </a-card>
                <a-card
                    class="chart2 tw:rounded-[4px]! tw:flex-1 tw:min-w-[300px] tw:bg-p-1 tw:mb-2 tw:mx-1"
                    :bordered="false"
                >
                    <div class="tw:flex-none tw:text-title-1 tw:pb-2 tw:flex tw:items-center">
                        <span class="tw:flex-auto">月销售量排行</span>
                    </div>
                    <div class="tw:flex-1 tw:rounded-[4px]! tw:mb-2 tw:h-[300px]">
                        <Char3 />
                    </div>
                </a-card>
            </div>
        </div>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import Chart1 from "./components/Chart1.vue";
    import Chart2 from "./components/Chart2.vue";
    import Char3 from "./components/Chart3.vue";
    import ChartSource from "./components/ChartSource.vue";
    import Statistic from "./components/TheStatistic.vue";
    defineOptions({
        name: "Monitor",
    });
    enum chart2Type {
        map = 1,
        bar = 2,
    }
    let showchart1 = ref(false);
    setTimeout(() => {
        showchart1.value = true;
    }, 1000);
    let chart2TypeValue = ref(chart2Type["map"]);
    const rankingTableOptions = {
        reload: true,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };

    const rankingColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "dashboard-monitor-ranking-columns",
    } as const;

    const columns: ProColumns[] = [
        {
            title: "销售团队",
            dataIndex: "name",
        },
        {
            title: "销售金额",
            dataIndex: "salary",
        },
        {
            title: "备注",
            dataIndex: "address",
        },
    ];

    const scroll = {
        x: "100%",
        y: "100%",
    };

    const data = reactive([
        {
            key: "1",
            name: "一组",
            salary: 23000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "jane.doe@example.com",
            expand: "Expand Content",
        },
        {
            key: "2",
            name: "二组",
            salary: 25000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "alisa.ross@example.com",
        },
        {
            key: "3",
            name: "三组",
            salary: 22000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "kevin.sandra@example.com",
        },
        {
            key: "4",
            name: "五组",
            salary: 17000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "ed.hellen@example.com",
        },
        {
            key: "5",
            name: "四组",
            salary: 27000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "william.smith@example.com",
        },
        {
            key: "6",
            name: "六组",
            salary: 27000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "william.smith@example.com",
        },
        {
            key: "7",
            name: "九组",
            salary: 27000,
            address: "卢萨卡交罚款善良的啊发射点发生为人情味",
            email: "william.smith@example.com",
        },
    ]);
</script>

<style scoped lang="scss">
    .page {
        width: 100%;
        box-sizing: border-box;
        padding-bottom: 12px;
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
</style>
