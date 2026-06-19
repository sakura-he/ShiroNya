import { ref } from "vue";
export default function useLoading(initialValue: boolean) {
    let loading = ref(initialValue); // 响应变量是个对象,外部引用会同步
    const setLoading = (value: boolean) => {
        loading.value = value; // 闭包,该函数作用域不会被销毁
    };
    const toggle = () => {
        loading.value = !loading.value;
    };
    return {
        loading,
        setLoading,
        toggle,
    };
}
