<template>
    <div class="page tw:bg-cbg-1">
        <a-result :status="status">
            <template #title>
                <div class="tw:text-title-1 tw:pb-4">
                    {{
                        status === "success" ? "外部页面已在新窗口打开" : "打开外部页面被浏览器阻止"
                    }}
                </div>
            </template>
            <template #subtitle>
                <div class="tw:text-text-2">
                    {{
                        status === "success"
                            ? "如未在新窗口打开, 请点击下面 [再次打开] 按钮"
                            : "请检查浏览器设置并点击下面 [再次打开] 按钮重试"
                    }}
                </div>
            </template>
            <template #extra>
                <a-space>
                    <a-button
                        :type="status === 'success' ? 'primary' : 'secondary'"
                        @click="onOpenWindow"
                    >
                        <template #icon>
                            <icon-reply />
                        </template>
                        <!-- Use the default slot to avoid extra spaces -->
                        <template #default>返回</template>
                    </a-button>
                    <a-button
                        :type="status === 'success' ? 'secondary' : 'primary'"
                        @click="onOpenWindow"
                    >
                        <template #icon>
                            <icon-launch />
                        </template>
                        <!-- Use the default slot to avoid extra spaces -->
                        <template #default>再次打开</template>
                    </a-button>
                </a-space>
            </template>
        </a-result>
    </div>
</template>

<script setup lang="ts">
    import { PageTypeEnum } from "@/router/type";
    import { useRouter, useRoute } from "vue-router";
    defineOptions({
        name: PageTypeEnum.Link,
    });
    let route = useRoute();
    let status = ref<"success" | "error">("success");
    let openedWindow: Window | null;
    onMounted(() => {
        onOpenWindow();
    });

    function onOpenWindow() {
        // if (openedWindow)
        //     openedWindow.focus();
        // else
        openedWindow = window.open(route.meta.componentPath as string);
        if (openedWindow) {
            status.value = "success";
            openedWindow.opener = null;
        } else {
            // 打开新窗口的动作被浏览器阻止,提醒用户
            status.value = "error";
        }
    }
</script>

<style scoped>
    .page {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
