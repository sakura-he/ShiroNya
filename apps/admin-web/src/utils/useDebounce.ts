/**
 * 消抖和节流hook
 */
/**
 * 消抖
 */
import { ref, Ref } from "vue";
type TCallback = (...argus: any[]) => any;
type TDelay = number;
export function useDebounce(cb?: TCallback) {
    let callback = ref(cb);
    let timer: number | null = null;
    let delay = ref<TDelay>(500);
    function execDebounce(options: { callback?: TCallback; delay?: TDelay }) {
        if (options.delay === undefined) {
            options.delay = delay.value;
        }

        // 如果上次的定时器没有超时,则取消上次的定时任务
        if (typeof timer === "number") {
            clearTimeout(timer);
            timer = null;
        }
        // 开启新的任务
        timer = setTimeout(() => {
            clearTimeout(timer!);
            timer = null;
            if (options.callback) {
                options.callback();
            } else if (callback.value) {
                callback.value();
            } else {
                throw new Error("请传入回调函数");
            }
        }, options.delay) as unknown as number;
    }
    return {
        delay,
        execDebounce,
        callback,
    };
}
