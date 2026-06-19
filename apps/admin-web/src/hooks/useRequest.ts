import { Ref, ref } from "vue";
type TApiFun<TData, TParams extends Array<any>> = (...params: TParams) => Promise<TData>;
interface IRequestOptions {
    // 定义一下loading初始状态
    loading?: boolean;
    pollingInterval?: number;
    // 接口调用成功时的回调
    onSuccess?: (data: any) => void;
    onFail?: (err: any) => void;
}
// useRequest的返回值类型
type IRequestResult<TData, TParams extends Array<any>> = {
    loading: Ref<boolean>; // 请求是否为加载状态
    run: TApiFun<TData, TParams>;
    aginRun: TApiFun<TData, TParams>; // 根据上次传递给run的参数，重新调用run
    error: Ref<TData | false>; // 当接口调用出错后error的值为err
    isPollingInterval: Ref<boolean>; // 是否为轮询状态
    cancelPollingInterval: () => void; // 取消轮询
    data: Ref<TData | undefined>; // 当接口调用成功后,data的值为接口的返回值
};

export function useRequest<TData, TParams extends any[]>(
    fun: TApiFun<TData, TParams>,
    options?: IRequestOptions,
): IRequestResult<TData, TParams> {
    const {
        loading: option_loading = false,
        onSuccess: option_onSuccess,
        onFail: option_onFail,
        pollingInterval: option_pollingInterval = 0,
    } = options || {};
    let cancelPollingIntervalTimer: undefined | number = undefined;
    // 缓存的上次的参数
    let lastParams: TParams;
    // 向外暴露的响应式属性：
    const requestLoading = ref(option_loading);
    const error = ref<any>(false);
    const isPollingInterval = ref(false);
    const data = ref<any | undefined>(undefined);
    // 提供手动调用传递的api函数
    const run: TApiFun<TData, TParams> = (...params) => {
        requestLoading.value = true;
        lastParams = params;
        return fun(...params)
            .then((res) => {
                error.value = false;
                data.value = res;
                option_onSuccess && option_onSuccess instanceof Function && option_onSuccess(res);
                return res;
            })
            .catch((err) => {
                data.value = undefined;
                error.value = err;
                option_onFail && option_onFail instanceof Function && option_onFail(err);
                return Promise.reject(err);
            })
            .finally(() => {
                requestLoading.value = false;
                // 开启轮询
                if (option_pollingInterval > 0 && !isPollingInterval.value) {
                    isPollingInterval.value = true;
                    let _lastParams =
                        lastParams instanceof Array ? lastParams : ([] as unknown as TParams);
                    cancelPollingIntervalTimer = setInterval(
                        () => run(..._lastParams),
                        option_pollingInterval,
                    ) as unknown as typeof cancelPollingIntervalTimer;
                }
            });
    };
    // 重新运行上一次请求
    const aginRun: TApiFun<TData, TParams> = () => {
        let _lastParams = lastParams instanceof Array ? lastParams : ([] as unknown as TParams);
        return run(..._lastParams);
    };
    // 取消轮询请求
    function cancelPollingInterval() {
        if (isPollingInterval.value) {
            isPollingInterval.value = false;
            clearInterval(cancelPollingIntervalTimer);
            cancelPollingIntervalTimer = undefined;
        }
    }

    return {
        loading: requestLoading,
        run,
        aginRun,
        error,
        isPollingInterval,
        cancelPollingInterval,
        data,
    };
}
