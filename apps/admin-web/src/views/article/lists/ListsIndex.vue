<template>
    <GiPageLayout>
        <div>
            lists
            <input
                type="text"
                v-model="input"
            />
            <button @click="test">test</button>
        </div>
    </GiPageLayout>
</template>
<script lang="ts" setup>
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { useMultipleTabs } from "@/store";
    defineOptions({
        name: "ListsIndex",
    });
    let multipleTabsStore = useMultipleTabs();
    let input = ref("");
    function test() {
        multipleTabsStore.setTabTitle(input.value);
    }
</script>
