import { provide, ref, watch } from "vue";
import { useConfigStore } from "@/store/modules/config/index";
import { deviceEnum } from "@/store/modules/config/types";

export function useLayoutMenuCollapse() {
    const configStore = useConfigStore();
    const menuCollapse = ref(
        configStore.config.device <= deviceEnum["sm"] ||
            configStore.config.device === deviceEnum["lg"],
    );
    const updateMenuCollapse = (value: boolean) => {
        menuCollapse.value = value;
    };

    provide("menuCollapse", menuCollapse);
    provide("updateMenuCollapse", updateMenuCollapse);

    watch(
        () => configStore.config.device,
        (newv) => {
            if (newv <= deviceEnum["sm"]) {
                menuCollapse.value = true;
            }
            if (newv === deviceEnum["md"]) {
                menuCollapse.value = false;
            }
            if (newv == deviceEnum["lg"]) {
                menuCollapse.value = true;
            }
            if (newv >= deviceEnum["xl"]) {
                menuCollapse.value = false;
            }
        },
        { immediate: true },
    );

    return {
        configStore,
        menuCollapse,
        updateMenuCollapse,
    };
}
