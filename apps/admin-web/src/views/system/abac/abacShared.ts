import { getCurrentAbacAppName, type AbacTargetApp } from "@/api/abac";
import { Message } from "@arco-design/web-vue";
import { ref } from "vue";

export const tableOptions = {
    reload: true,
    density: true,
    setting: true,
};

export function useAbacTarget() {
    return ref<AbacTargetApp>(getCurrentAbacAppName());
}

export function parseJsonObject(raw: string, fallback: Record<string, unknown> = {}) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return fallback;
    }
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON 必须是对象");
    }
    return parsed as Record<string, unknown>;
}

export function parseJsonArray<T = unknown>(raw: string): T[] {
    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
        throw new Error("JSON 必须是数组");
    }
    return parsed as T[];
}

export function stringifyJson(value: unknown) {
    return JSON.stringify(value ?? {}, null, 2);
}

export function showJsonError(error: unknown) {
    Message.error(error instanceof Error ? error.message : String(error));
}
