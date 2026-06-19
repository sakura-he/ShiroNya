<template>
    <div class="tw:w-full tw:h-full tw:bg-cf-1">
        <div class="tw:fixed tw:z-40 tw:top-5 tw:left-5">
            <!-- 颜色模式切换 -->
            <ColorModeSwitch
                v-slot="icon"
                ref="ColorModeSwitchRef"
            >
                <a-button shape="circle">
                    <DynamicIcon
                        :icon="icon.icon"
                        class="tw:text-title-1"
                    />
                </a-button>
            </ColorModeSwitch>
        </div>
        <div
            class="tw:w-full tw:h-[100vh] tw:box-border tw:p-10 tw:flex tw:flex-col tw:justify-center setup"
        >
            <section class="tw:center tw:mx-auto tw:mb-10 tw:text-center">
                <h1
                    class="tw:text-[80px] title sr-el"
                    :class="{ visibility: isMounted ? 'visible' : 'hidden' }"
                >
                    ShiroAdmin
                </h1>
                <p
                    class="tw:text-title-2 tw:text-c-1 sr-el"
                    :class="{ visibility: isMounted ? 'visible' : 'hidden' }"
                >
                    基于 Arco Design 的后台管理模板, 使用TypeScript 编写
                </p>
            </section>
            <section>
                <div
                    class="tw:flex tw:flex-wrap tw:gap-4 tw:justify-center sr-el"
                    :class="{ visibility: isMounted ? 'visible' : 'hidden' }"
                >
                    <a-button @click="onbutn">
                        <template #icon>
                            <icon-github />
                        </template>
                        <template #default>Github</template>
                    </a-button>
                    <a-button @click="onbutn">
                        <template #icon>
                            <icon-align-left />
                        </template>
                        <template #default>项目文档</template>
                    </a-button>
                    <a-button
                        @click="onbutn"
                        type="primary"
                    >
                        <template #default>
                            开始体验
                            <icon-right class="tw:pl-2" />
                        </template>
                    </a-button>
                </div>
            </section>
        </div>
        <div class="tw:w-[70%] tw:box-border tw:mx-auto"></div>
    </div>
</template>
<script lang="ts" setup>
    import ColorModeSwitch from "@/layout/components/ColorModeSwitch.vue";
    import { useRouter } from "vue-router";
    import scrollReveal from "scrollreveal";
    defineOptions({
        name: "Home",
    });
    let router = useRouter();
    function onbutn() {
        router.push("/login");
    }
    let isMounted = ref(false);
    onMounted(() => {
        nextTick(() => (isMounted.value = true));
        scrollReveal().reveal(".sr-el", {
            // 动画的时长
            duration: 500,
            // 延迟时间
            delay: 0,
            // 动画开始的位置，'bottom', 'left', 'top', 'right'
            origin: "bottom",
            // 回滚的时候是否再次触发动画
            reset: true,
            // 延时执行方式（always（一直延时执行），once（只延时执行一次），onload（只在加载时延时执行））
            // // useDelay: 'onload',
            // 在移动端是否使用动画
            mobile: true,
            // 滚动的距离，单位可以用%，rem等
            distance: "10px",
            // 其他可用的动画效果
            opacity: 0.001,
            // 执行速度 线性函数啥的
            easing: "cubic-bezier(0.5, 0, 0, 1)",
            // 执行方式（缩放）
            scale: 0.9,
        });
    });
</script>
<style scoped>
    .setup {
    }

    .title {
        background-image: linear-gradient(to right, rgb(7, 107, 236), #39c5bb);
        background-clip: text;
        color: transparent;
    }
</style>
