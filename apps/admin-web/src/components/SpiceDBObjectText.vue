<template>
    <a-typography-text
        class="spicedb-object-text"
        code
        :aria-label="displayText"
        :title="displayText"
    >
        <a-typography-text v-if="label">
            {{ label }}
        </a-typography-text>
        <a-typography-text
            v-if="copyable"
            copyable
        >
            {{ objectText }}
        </a-typography-text>
        <a-typography-text v-else>
            {{ objectText }}
        </a-typography-text>
    </a-typography-text>
</template>

<script setup lang="ts">
    import { computed } from "vue";

    const props = withDefaults(
        defineProps<{
            label?: string | number | null;
            type: string;
            id: string | number;
            copyable?: boolean;
        }>(),
        {
            label: "",
            copyable: false,
        },
    );

    /**
     * 拼出 SpiceDB object 引用文本，统一 role/menu/user 等 resource 的展示格式。
     */
    const objectText = computed(() => `${props.type}:${props.id}`);

    /**
     * 拼出面向悬浮提示和辅助技术的完整展示文本。
     */
    const displayText = computed(() =>
        props.label ? `${props.label} ${objectText.value}` : objectText.value,
    );
</script>

<style scoped lang="scss">
    .spicedb-object-text {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: baseline;
    }
</style>
