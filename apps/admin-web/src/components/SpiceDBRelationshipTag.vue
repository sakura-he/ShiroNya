<template>
    <span
        class="spicedb-relationship"
        :aria-label="relationshipText"
        :title="relationshipText"
    >
        <a-typography-text
            v-if="label"
            type="secondary"
        >
            {{ label }}：
        </a-typography-text>
        <a-typography-text code>
            <a-typography-text type="primary">
                {{ resource }}
            </a-typography-text>
            <a-typography-text type="success">#</a-typography-text>
            <a-typography-text type="success">
                {{ relation }}
            </a-typography-text>
            <a-typography-text type="warning">@</a-typography-text>
            <a-typography-text type="warning">{{ subject }}</a-typography-text>
        </a-typography-text>
    </span>
</template>

<script setup lang="ts">
    import { computed } from "vue";

    const props = withDefaults(
        defineProps<{
            label?: string;
            resource: string;
            relation: string;
            subject: string;
        }>(),
        {
            label: "",
        },
    );

    /**
     * 拼出完整 relationship 文本，便于悬浮提示和辅助技术读取。
     */
    const relationshipText = computed(() => `${props.resource}#${props.relation}@${props.subject}`);
</script>

<style scoped lang="scss">
    .spicedb-relationship {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;
        vertical-align: middle;
    }

    .spicedb-relationship :deep(.arco-typography) {
        margin-bottom: 0;
    }

    .spicedb-relationship__label {
        font-size: 12px;
        line-height: 24px;
        font-weight: 600;
    }

    .spicedb-relationship__code {
        font-size: 14px;
        line-height: 24px;
        font-weight: 600;
    }

    .spicedb-relationship__operator {
        color: var(--color-text-3);
        font-weight: 600;
    }

    .spicedb-relationship__resource,
    .spicedb-relationship__subject {
        color: var(--color-text-1);
        font-weight: 600;
    }

    .spicedb-relationship__relation {
        color: rgb(var(--arcoblue-6));
        font-weight: 600;
    }
</style>
