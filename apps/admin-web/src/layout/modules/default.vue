<template>
    <router-view></router-view>
</template>

<script lang="ts" setup>
    import { LayoutEnum } from "@/router/type";

    defineOptions({
        name: LayoutEnum.LAYOUT_DEFAULT,
    });
</script>
