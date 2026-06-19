<template>
    <a-button
        type="text"
        class="nav-btn"
        @click="onRefresh"
    >
        <template
            #icon
            color="#333"
        >
            <icon-refresh />
        </template>
    </a-button>
</template>

<script setup lang="ts">
    import { appLoadingBar } from "@/utils/loading-bar";
    let updateShowRouter = inject<(show: boolean) => any>("updateShowRouter")!;

    // 重新挂载当前 router-view，触发页面刷新并同步进度条状态。
    function onRefresh() {
        updateShowRouter(false);
        appLoadingBar.start();
        nextTick(() => {
            updateShowRouter(true);
            appLoadingBar.done();
        });
    }
</script>
