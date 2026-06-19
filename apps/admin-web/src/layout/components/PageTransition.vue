<template>
    <Transition
        v-bind="transition"
        :mode="_mode"
        :appear="appear"
    >
        <slot></slot>
    </Transition>
</template>

<script setup lang="ts">
    import { useCssModule } from "vue";
    let styles = useCssModule();
    let props = defineProps({
        inName: {
            type: String,
            default: "fadeIn",
        },
        outName: {
            type: String,
            default: "fadeOut",
        },
        absolute: {
            type: Boolean,
            default: false,
        },
        mode: {
            type: String,
            default: "default",
        },
        duration: {
            type: Number,
            default: 0.2,
        },
        appear: {
            type: Boolean,
            default: false,
        },
    });
    let _mode = computed<"default" | "in-out" | "out-in">(() => {
        if (props.absolute) {
            return "default";
        } else {
            return props.mode as "default" | "in-out" | "out-in";
        }
    });
    // 计算过渡类名字符串 传递 transition 过渡动画生命周期周期的名字 和区分进入还是离开的布尔值
    function transitionFactory(lifycycle: string, isEnter: boolean) {
        let classNames: string[] = [];
        classNames.push(styles["transition-duration"]); // 过渡时间类名(类的css值是动态的)
        if (isEnter) {
            classNames.push(`${props.inName}-${lifycycle}`);
            // 如果是 absolute模式 添加absolute的类名
            props.absolute && classNames.push(styles["transition-enter-absolute"]);
        } else {
            classNames.push(`${props.outName}-${lifycycle}`);
            props.absolute && classNames.push(styles["transition-leave-absolute"]);
        }
        return classNames.join(" ");
    }
    // Transition组件 使用自定义 class 而不是 name 可以让进入和离开的动画分别设置
    let transition = computed(() => ({
        "enter-from-class": transitionFactory("enter-from", true),
        "enter-active-class": transitionFactory("enter-active", true),
        "enter-to-class": transitionFactory("enter-to", true),
        "leave-from-class": transitionFactory("leave-from", false),
        "leave-active-class": transitionFactory("leave-active", false),
        "leave-to-class": transitionFactory("leave-to", false),
    }));
</script>

<style scoped module>
    .transition-enter-absolute,
    .transition-leave-absolute {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
    }

    .transition-enter-absolute {
        z-index: 100;
    }

    .transition-leave-absolute {
        z-index: 99;
    }

    .transition-duration {
        --transition-time: v-bind("`${$props.duration}s`");
    }
</style>
