<template>
    <slot v-if="isAuth"></slot>
</template>
<script lang="ts" setup>
    /*
     * @description: 权限控制组件
     * 使用 hasPermission() 验证 传给 props.permissions 权限
     *
     */
    import { hasPermission } from "@/utils/permission";
    defineOptions({
        name: "ShiroAuthConponent",
    });
    const props = defineProps<{
        permissions: string[] | string;
    }>();
    let isAuth = computed(() => {
        return hasPermission(props.permissions);
    });
</script>
<style lang="scss" scoped></style>
