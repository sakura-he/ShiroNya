<template>
    <a-checkbox
        :value="value"
        :disabled="disabled"
        class="custom-checkbox-card"
    >
        <div class="custom-checkbox-card-content">
            <a-space
                size="mini"
                wrap
                class="custom-checkbox-card-heading"
            >
                <span class="custom-checkbox-card-title">
                    <slot name="title">{{ title }}</slot>
                </span>
                <slot name="tags" />
            </a-space>
            <div
                v-if="$slots.description"
                class="custom-checkbox-card-description"
            >
                <slot name="description" />
            </div>
            <a-typography-text
                v-else-if="description"
                type="secondary"
                class="custom-checkbox-card-description"
            >
                {{ description }}
            </a-typography-text>
            <slot />
        </div>
    </a-checkbox>
</template>

<script setup lang="ts">
    import type { PropType } from "vue";

    type CheckboxValue = string | number | boolean;

    defineProps({
        value: {
            type: [String, Number, Boolean] as PropType<CheckboxValue>,
            required: true,
        },
        title: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
        },
        disabled: {
            type: Boolean,
            default: false,
        },
    });
</script>

<style scoped>
    .custom-checkbox-card {
        display: flex;
        align-items: flex-start;
        box-sizing: border-box;
        width: 100%;
        min-height: 40px;
        padding: 10px 16px;
        border: 1px solid var(--color-border-2);
        border-radius: 2px;
        transition:
            color 0.2s,
            border-color 0.2s,
            background-color 0.2s;
    }

    .custom-checkbox-card-content {
        min-width: 0;
        flex: 1 1 auto;
    }

    .custom-checkbox-card-heading {
        margin-bottom: 8px;
    }

    .custom-checkbox-card-title {
        color: var(--color-text-1);
        font-size: 14px;
        font-weight: 600;
    }

    .custom-checkbox-card-description {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .custom-checkbox-card:hover,
    .custom-checkbox-card.arco-checkbox-checked {
        border-color: rgb(var(--primary-6));
    }

    .custom-checkbox-card.arco-checkbox-checked {
        background-color: var(--color-primary-light-1);
    }

    .custom-checkbox-card:hover .custom-checkbox-card-title,
    .custom-checkbox-card.arco-checkbox-checked .custom-checkbox-card-title {
        color: rgb(var(--primary-6));
    }

    .custom-checkbox-card.arco-checkbox-disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .custom-checkbox-card :deep(.arco-checkbox-label) {
        min-width: 0;
        flex: 1 1 auto;
    }

    .custom-checkbox-card :deep(.arco-checkbox-icon-hover) {
        flex: 0 0 auto;
        margin-top: 4px;
    }
</style>
