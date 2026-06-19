<template>
    <GiPageLayout>
        <div class="page tw:break-all">
            <a-card
                :loading="getWorkplaceIndexLoading"
                :bordered="false"
                hoverable
                class="tw:mb-2 tw:break-words tw:rounded-[4px]!"
            >
                <div class="tw:flex tw:items-center">
                    <a-avatar
                        :size="60"
                        class="tw:mr-3"
                    >
                        Admin
                    </a-avatar>
                    <div>
                        <p class="tw:text-title-2 tw:mb-1">欢迎回来:Admin</p>
                        <p class="tw:text-body-3">里卡尔瓦的方法地方开发撒旦发生</p>
                    </div>
                    <div class="tw:flex tw:ml-auto tw:h-full">
                        <div
                            class="tw:mx-2 tw:h-full tw:self-start tw:flex tw:flex-col tw:items-end tw:justify-between"
                        >
                            <span class="tw:text-body-1 tw:mb-1">进行中</span>
                            <span class="tw:text-title-2">
                                {{ userData.user?.work?.underway || null }} / 88
                            </span>
                        </div>
                        <div
                            class="tw:mx-2 tw:h-full tw:self-start tw:flex tw:flex-col tw:items-end tw:justify-between"
                        >
                            <span class="tw:text-body-1 tw:mb-1">已完成</span>
                            <span class="tw:text-title-2">
                                {{ userData.user?.work?.done || null }} / 88
                            </span>
                        </div>
                        <div
                            class="tw:mx-2 tw:h-full tw:self-start tw:flex tw:flex-col tw:items-end tw:justify-between"
                        >
                            <span class="tw:text-body-1 tw:mb-1">未完成</span>
                            <span class="tw:text-title-2">
                                {{ userData.user?.work?.undone || null }} / 88
                            </span>
                        </div>
                    </div>
                </div>
            </a-card>
            <div class="overview tw:-mx-1 tw:lg:flex">
                <div class="ow__content tw:mx-1 tw:flex-auto tw:min-w-0 tw:mb-2">
                    <a-card
                        :loading="getWorkplaceIndexLoading"
                        class="tw:rounded-[4px]! tw:overflow-hidden tw:mb-2"
                        :bordered="false"
                        :header-style="{ border: 'none' }"
                    >
                        <template #title>
                            <div>成员数据</div>
                        </template>
                        <template #extra>
                            <a-pagination
                                :total="50"
                                size="mini"
                                simple
                            />
                        </template>
                        <a-card-grid
                            v-for="(member, memberIndex) in membersData.members ?? []"
                            :key="memberIndex"
                            :hoverable="true"
                            style="width: 25%"
                        >
                            <a-card
                                :header-style="{
                                    border: 'none',
                                }"
                                :body-style="{ paddingTop: 0 }"
                                class="card-demo"
                                :bordered="false"
                            >
                                <template #extra>
                                    <span
                                        class="tw:text-c-1 tw:transition-transform"
                                        :class="
                                            currentMemberChatSwitches?.[memberIndex]
                                                ? 'tw:skew-x-3 tw:text-p-6'
                                                : ''
                                        "
                                        v-if="currentMemberChatSwitches"
                                        @click="switchMemberChart(memberIndex)"
                                    >
                                        <icon-swap />
                                    </span>
                                </template>
                                <template #title>
                                    <div class="tw:flex tw:items-center">
                                        <a-avatar
                                            :size="30"
                                            class="tw:mr-2"
                                        >
                                            {{ member.user }}
                                        </a-avatar>
                                        <div class="tw:text-body-3">{{ member.user }}</div>
                                    </div>
                                </template>
                                <div>
                                    <div
                                        class="tw:text-body-3"
                                        v-if="!currentMemberChatSwitches?.[memberIndex]"
                                    >
                                        <p>已完成: {{ member.today_work.done }}</p>
                                        <p>未完成: {{ member.today_work.undone }}</p>
                                        <p>进行中: {{ member.today_work.underway }}</p>
                                    </div>
                                    <MemberChats
                                        :data="member.work"
                                        v-else
                                    />
                                </div>
                            </a-card>
                        </a-card-grid>
                    </a-card>
                    <a-card
                        class="tw:rounded-[4px]! tw:overflow-hidden"
                        :bordered="false"
                    >
                        <template #title>
                            <span>最新动态</span>
                        </template>
                        <div>
                            <a-comment
                                author="Socrates"
                                content="Comment body content."
                                datetime="1 hour"
                                v-for="item in 8"
                            >
                                <!-- class="tw:border-b-[1px] tw:pb-2 tw:border-cb-1 tw:border-solid" -->
                                <template #actions>
                                    <span
                                        class="action"
                                        key="heart"
                                    >
                                        <span>
                                            <IconHeart />
                                        </span>
                                        11
                                    </span>
                                    <span
                                        class="action"
                                        key="star"
                                    >
                                        <span>
                                            <IconStar />
                                        </span>
                                        11
                                    </span>
                                    <span
                                        class="action"
                                        key="reply"
                                    >
                                        <IconMessage />
                                        Reply
                                    </span>
                                </template>
                                <template #avatar>
                                    <a-avatar :size="35">
                                        <img
                                            alt="avatar"
                                            src="https://p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/3ee5f13fb09879ecb5185e440cef6eb9.png~tplv-uwbnlip3yd-webp.webp"
                                        />
                                    </a-avatar>
                                </template>
                            </a-comment>
                        </div>
                    </a-card>
                </div>
                <div
                    class="ow__right tw:lg:basis-110 tw:shrink-0 tw:min-w-0 tw:lg:block tw:mx-1 tw:flex-wrap"
                >
                    <WorkplaceShortcuts />
                    <a-card
                        class="tw:mb-2 tw:overflow-hidden tw:rounded-[4px]!"
                        :bordered="false"
                        :body-style="{ padding: 0 }"
                    >
                        <a-carousel
                            class="tw:w-full tw:h-40"
                            :default-current="2"
                        >
                            <a-carousel-item
                                v-for="image in images"
                                class="tw:w-full"
                            >
                                <img
                                    :src="image"
                                    class="tw:w-full tw:h-40"
                                />
                            </a-carousel-item>
                        </a-carousel>
                    </a-card>
                    <a-card
                        class="tw:mb-2 tw:rounded-[4px]!"
                        :bordered="false"
                    >
                        <template #title>
                            <span>公告</span>
                        </template>

                        <ul>
                            <li
                                class="tw:flex tw:items-center [&:not(:first-child)]:tw:mt-4"
                                v-for="(item, noticIndex) of 7"
                            >
                                <a-tag
                                    class="tw:flex-none"
                                    :color="colors[noticIndex]"
                                    size="small"
                                >
                                    公告
                                </a-tag>
                                <div class="tw:flex-1 tw:min-w-0 tw:ml-2">
                                    <div class="tw:w-full tw:truncate">
                                        这是通知内容这是通知内容这是通知内容这是通知内容这是通知内容这是通知内容
                                    </div>
                                </div>
                            </li>
                        </ul>
                    </a-card>
                    <a-card
                        class="tw:mb-2 tw:rounded-[4px]!"
                        :bordered="false"
                    >
                        <template #title>
                            <span>统计</span>
                        </template>
                        <div>
                            <StaticsticalChart />
                        </div>
                    </a-card>
                </div>
            </div>
        </div>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { getWorkplaceIndex, getWorkplaceMember } from "@/api/workplace";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import MemberChats from "./components/MemberChats.vue";
    import StaticsticalChart from "./components/StatisticalChat.vue";
    import WorkplaceShortcuts from "./components/WorkplaceShortcuts.vue";
    import { useRequest } from "@/hooks/useRequest";

    interface WorkplaceMembersData {
        members: Record<string, any>[];
        page_num: number;
        [key: string]: any;
    }

    defineOptions({
        name: "Workplace",
    });
    const colors = [
        "blue",
        "red",
        "orange",
        "lime",
        "cyan",
        "gold",
        "green",
        "orangered",
        "arcoblue",
        "purple",
        "pinkpurple",
        "magenta",
        "gray",
    ];
    const images = [
        "https://p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/cd7a1aaea8e1c5e3d26fe2591e561798.png~tplv-uwbnlip3yd-webp.webp",
        "https://p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/6480dbc69be1b5de95010289787d64f1.png~tplv-uwbnlip3yd-webp.webp",
        "https://p1-arco.byteimg.com/tos-cn-i-uwbnlip3yd/0265a04fddbd77a19602a15d9d55d797.png~tplv-uwbnlip3yd-webp.webp",
    ];
    let membersData = reactive<WorkplaceMembersData>({
        members: [],
        page_num: 0,
    });
    let currentMemberPage = ref<number>(1);
    let userData = reactive<any>({});
    let { loading: getWorkplaceIndexLoading, run: getWorkplaceIndexRun } =
        useRequest(getWorkplaceIndex);
    getWorkplaceIndexRun().then((res) => {
        Object.keys(res.data).forEach((key) => {
            userData[key] = res.data[key];
        });
    });

    let memberChartSwitches = reactive<Map<number, boolean[]>>(new Map());
    let currentMemberChatSwitches = computed<boolean[] | undefined>(() => {
        let currentPageMemberCount = Number(membersData.page_num ?? 0);
        if (!memberChartSwitches.get(currentMemberPage.value)) {
            memberChartSwitches.set(
                currentMemberPage.value,
                new Array(currentPageMemberCount).fill(false),
            );
        }
        return memberChartSwitches.get(currentMemberPage.value);
    });
    getWorkplaceMember(currentMemberPage.value).then((res) => {
        let data = res.data;
        Object.keys(data).forEach((key) => {
            membersData[key] = data[key];
        });
    });
    function switchMemberChart(memberIndex: number) {
        if (memberChartSwitches.get(currentMemberPage.value)) {
            memberChartSwitches.get(currentMemberPage.value)![memberIndex] =
                !memberChartSwitches.get(currentMemberPage.value)![memberIndex];
        }
    }
</script>

<style scoped lang="scss">
    .page {
        width: 100%;
        box-sizing: border-box;
    }
</style>
