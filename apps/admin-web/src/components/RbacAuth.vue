<template>
    <slot v-if="allowed" />
</template>

<script setup lang="ts">
    import { useUserStore } from "@/store";
    import { computed } from "vue";

    const props = defineProps<{
        code: string;
    }>();

    const userStore = useUserStore();
    const allowed = computed(() => {
        const code = props.code.trim();
        if (!code) {
            throw new Error("RBAC 权限校验缺少权限 code");
        }
        return userStore.permissionSet.has(code);
    });
</script>
