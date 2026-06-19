<template>
    <a-tag :color="status === RbacStatus.ENABLE ? 'arcoblue' : 'red'">
        {{ status === RbacStatus.ENABLE ? "启用" : "禁用" }}
    </a-tag>
</template>

<script setup lang="ts">
    import { RbacStatus } from "@/api/rbac/common";

    defineProps<{
        status?: RbacStatus | string | null;
    }>();
</script>
