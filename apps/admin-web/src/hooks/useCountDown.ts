// 倒计时hooks
import { ref, Ref } from "vue";
interface IOption {
    interval: number;
    end: number;
}
interface IHookReturnType {
    count: Ref<number>;
    start: (start: number) => void;
    setCount: (value: number) => void;
    reset: () => void;
}

export function useCountDown(option: IOption): IHookReturnType {
    option = option || { interval: 1000, end: 0 };
    let count = ref(option.end);
    let timer: ReturnType<typeof setInterval> | undefined = undefined;
    function start(value: number) {
        if (timer) {
            return;
        } else {
            count.value = value; // 设置初始值
            timer = setInterval(() => {
                count.value--;
                if (count.value <= option.end) {
                    count.value = option.end;
                    clearInterval(timer);
                    timer = undefined;
                }
            }, option.interval);
        }
    }
    function reset() {
        clearInterval(timer);
        timer = undefined;
        count.value = option.end;
    }
    function setCount(value: number) {
        count.value = value;
    }
    return {
        count,
        start,
        reset,
        setCount,
    };
}
