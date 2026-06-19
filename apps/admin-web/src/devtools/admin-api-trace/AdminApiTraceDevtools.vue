<template>
    <TanStackDevtools
        :plugins="plugins"
        :event-bus-config="{ connectToServerBus: false }"
        :config="devtoolsConfig"
    />
</template>

<script setup lang="ts">
    import { TanStackDevtools, type TanStackDevtoolsVuePlugin } from "@tanstack/vue-devtools";
    import { computed } from "vue";
    import useColorMode from "@/hooks/useColorMode";
    import AdminApiTracePanel from "./AdminApiTracePanel.vue";

    const { isDarkMode } = useColorMode();

    const plugins: TanStackDevtoolsVuePlugin[] = [
        {
            id: "admin-api-api",
            name: "Admin API",
            component: AdminApiTracePanel,
        },
    ];

    const devtoolsConfig = computed(
        () =>
            ({
                position: "bottom-right",
                panelLocation: "bottom",
                defaultOpen: false,
                theme: isDarkMode.value ? "dark" : "light",
            }) as const,
    );
</script>
