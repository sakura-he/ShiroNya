<template>
    <a-alert
        v-if="userStore.isImpersonating"
        class="impersonation-banner"
        type="warning"
        show-icon
        banner
    >
        <template #title>
            伪装中
        </template>
        <span class="impersonation-banner__text">
            当前会话已切换为 {{ targetUserLabel }}，权限、菜单和操作审计都按目标用户生效。
        </span>
        <template #action>
            <a-button
                type="primary"
                status="warning"
                size="mini"
                :loading="stoppingImpersonation"
                @click="stopImpersonating"
            >
                退出伪装
            </a-button>
        </template>
    </a-alert>
</template>

<script setup lang="ts">
    import { useUserStore } from "@/store";
    import { Message } from "@arco-design/web-vue";

    const userStore = useUserStore();
    const stoppingImpersonation = ref(false);

    const targetUserLabel = computed(() => {
        const user = userStore.session?.user;
        return user?.displayUsername || user?.username || user?.name || user?.id || "目标用户";
    });

    async function stopImpersonating() {
        stoppingImpersonation.value = true;
        try {
            await userStore.stopImpersonating();
            Message.success("已退出伪装");
        } catch (error) {
            Message.error(error instanceof Error ? error.message : "退出伪装失败");
        } finally {
            stoppingImpersonation.value = false;
        }
    }
</script>

<style scoped lang="scss">
    .impersonation-banner {
        flex: 0 0 auto;
        border-radius: 0;
        border-right: 0;
        border-left: 0;
    }

    .impersonation-banner__text {
        line-height: 1.5;
    }
</style>
