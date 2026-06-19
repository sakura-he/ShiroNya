import { computed } from "vue";
import { EChartsOption } from "echarts";
import useColorMode from "@/hooks/useColorMode";
// 原作者 https://github.com/arco-design/arco-design-pro
// for code hints
// import { SeriesOption } from 'echarts';
// Because there are so many configuration items, this provides a relatively convenient code hint.
// When using vue, pay attention to the reactive issues. It is necessary to ensure that corresponding functions can be triggered, TypeScript does not report errors, and code writing is convenient.
interface optionsFn {
    (isDark: boolean): EChartsOption;
}
interface updateThemeFn {
    (isDark: string): EChartsOption;
}
let { isDarkMode } = useColorMode();
export default function useChartOption(sourceOption: optionsFn, updateThemeFn?: updateThemeFn) {
    if (updateThemeFn !== undefined) {
        if (isDarkMode.value) {
            updateThemeFn("dark");
        } else {
            updateThemeFn("");
        }
    }
    // echarts support https://echarts.apache.org/zh/theme-builder.html
    // It's not used here
    // TODO echarts themes
    return computed<EChartsOption>(() => {
        return sourceOption(isDarkMode.value);
    });
}
