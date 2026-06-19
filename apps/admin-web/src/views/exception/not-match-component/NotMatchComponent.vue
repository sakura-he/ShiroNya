<template>
    <div class="page tw:bg-cbg-1">
        <a-result :status="'error'">
            <template #title>
                <div class="tw:text-title-1 tw:pb-4">根据当前的路由配置未匹配到任何页面组件</div>
            </template>
            <template #subtitle>
                <div class="tw:text-text-2">
                    <p>路由 componentPath: {{ route.meta.componentPath }}</p>
                    <p>未在项目目录中找到文件: {{ `src/views/${route.meta.componentPath}.vue` }}</p>
                </div>
            </template>
            <template #extra>
                <a-button
                    type="primary"
                    @click="onClickTab"
                >
                    <template #icon>
                        <icon-reply />
                    </template>
                    <!-- Use the default slot to avoid extra spaces -->
                    <template #default>关闭</template>
                </a-button>
            </template>
            <a-typography style="background: var(--color-fill-2); padding: 24px">
                <a-typography-paragraph>尝试:</a-typography-paragraph>
                <ul>
                    <li>
                        检查路由配置对象中当前路由配置的 component 字段是否匹配项目中 views
                        目标页面的路径
                    </li>
                    <li>在 项目的 views 文件夹中 按照 component 字段创建 vue 文件</li>
                </ul>
            </a-typography>
        </a-result>
    </div>
</template>

<script setup lang="ts">
    import { useMultipleTabs } from "@/store";
    import { useRoute } from "vue-router";
    defineOptions({
        name: "NotMatchComponent",
    });
    let route = useRoute();
    console.log(route);
    function onClickTab() {
        // 关闭当前标签页
        const { closeCurrentTab } = useMultipleTabs();
        closeCurrentTab();
    }
</script>

<style scoped>
    .page {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    }
</style>
