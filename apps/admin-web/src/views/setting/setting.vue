<template>
    <a-drawer
        :width="340"
        :visible="configStore.config.globalSettings"
        unmountOnClose
        @cancel="onDrawClose"
        @ok="onDrawOK"
    >
        <template #title>Title</template>
        <div>
            You can cusstomize modal body text by the current situation. This modal will be closed
            immediately once you press the OK button.
        </div>
    </a-drawer>
</template>

<script setup lang="ts">
    import { useConfigStore } from "@/store/modules/config/index";
    defineOptions({
        name: "Setting",
    });
    let configStore = useConfigStore();
    function onDrawClose() {
        configStore.config.globalSettings = false;
    }
    function onDrawOK() {
        configStore.config.globalSettings = true;
    }
</script>

<style scoped>
    :deep(body .arco-drawer-mask) {
        background-color: red;
    }
</style>
