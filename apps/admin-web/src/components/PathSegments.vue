<template>
    <span
        v-if="segments.length === 0"
        class="path-segments__empty"
    >
        {{ placeholder }}
    </span>
    <span
        v-else
        class="path-segments"
        :title="normalizedPath"
    >
        <template
            v-for="(segment, index) in segments"
            :key="`${segment}-${index}`"
        >
            <span
                class="path-segments__segment"
                :title="segment"
            >
                {{ segment }}
            </span>
            <span
                v-if="index < segments.length - 1"
                class="path-segments__separator"
                aria-hidden="true"
            >
                /
            </span>
        </template>
    </span>
</template>

<script setup lang="ts">
    import { computed } from "vue";

    const props = withDefaults(
        defineProps<{
            path?: string | null;
            placeholder?: string;
        }>(),
        {
            path: "",
            placeholder: "-",
        },
    );

    const normalizedPath = computed(() =>
        (props.path ?? "")
            .trim()
            .replace(/\\/g, "/"),
    );

    const segments = computed(() =>
        normalizedPath.value
            .split("/")
            .map((segment) => segment.trim())
            .filter(Boolean),
    );
</script>

<style scoped>
    .path-segments {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 2px 4px;
        align-items: center;
        max-width: 100%;
        min-width: 0;
        vertical-align: middle;
    }

    .path-segments__segment {
        display: inline-block;
        max-width: 220px;
        overflow-wrap: anywhere;
        vertical-align: bottom;
    }

    .path-segments__separator,
    .path-segments__empty {
        color: var(--color-text-3);
    }
</style>
