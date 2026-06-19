<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>后台偏好设置</template>
            <template #subtitle>
                配置后台界面设置的系统默认值，以及是否允许用户在右侧设置抽屉中自行修改
            </template>
        </a-page-header>

        <a-card :bordered="true">
            <template #title>偏好策略</template>
            <template #extra>
                <a-space>
                    <a-button @click="loadPolicies">刷新</a-button>
                    <a-button
                        type="primary"
                        :loading="saving"
                        @click="savePolicies"
                    >
                        保存
                    </a-button>
                </a-space>
            </template>

            <a-table
                row-key="key"
                :loading="loading"
                :pagination="false"
                :columns="columns"
                :data="policies"
            >
                <template #group="{ record }">
                    <a-tag>{{ groupLabels[record.group] ?? record.group }}</a-tag>
                </template>

                <template #value="{ record }">
                    <a-switch
                        v-if="typeof getDraftValue(record) === 'boolean'"
                        :model-value="getDraftValue(record) as boolean"
                        @update:model-value="updateRecordValue(record, $event)"
                    />
                    <a-input-number
                        v-else-if="record.key === 'menuWidth'"
                        :model-value="getDraftValue(record) as number"
                        :min="MENU_WIDTH_MIN"
                        :max="MENU_WIDTH_MAX"
                        @update:model-value="updateRecordValue(record, $event)"
                    />
                    <a-color-picker
                        v-else-if="record.key === 'themeColor'"
                        :model-value="getDraftValue(record) as string"
                        show-preset
                        show-text
                        disabled-alpha
                        format="hex"
                        @change="updateRecordValue(record, $event)"
                    />
                    <a-select
                        v-else-if="
                            record.key === 'openingAnimation' || record.key === 'quitAnimation'
                        "
                        :model-value="getDraftValue(record) as string"
                        :options="resolveAnimationOptions(record.key)"
                        @update:model-value="updateRecordValue(record, $event)"
                    />
                    <a-input
                        v-else
                        :model-value="String(getDraftValue(record) ?? '')"
                        @update:model-value="updateRecordValue(record, $event)"
                    />
                </template>

                <template #userEditable="{ record }">
                    <a-switch
                        :model-value="getDraftEditable(record)"
                        @update:model-value="updateRecordEditable(record, $event)"
                    />
                </template>
            </a-table>
        </a-card>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        queryAdminPreferencePolicyApi,
        updateAdminPreferencePolicyApi,
        type AdminPreferenceKey,
        type AdminPreferencePolicy,
        type AdminPreferenceValue,
    } from "@/api/admin-preference";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { MENU_WIDTH_MAX, MENU_WIDTH_MIN } from "@/store";
    import { Message, type TableColumnData } from "@arco-design/web-vue";

    defineOptions({ name: "AdminPreference" });

    const loading = ref(false);
    const saving = ref(false);
    const policies = ref<AdminPreferencePolicy[]>([]);
    const draftValues = reactive<Partial<Record<AdminPreferenceKey, AdminPreferenceValue>>>({});
    const draftEditable = reactive<Partial<Record<AdminPreferenceKey, boolean>>>({});

    const groupLabels: Record<string, string> = {
        appearance: "外观",
        layout: "布局",
        animation: "动画",
        accessibility: "辅助",
    };

    const fadeIn = ["fade-in", "fade-in-down", "fade-in-left", "fade-in-right", "fade-in-up"];
    const fadeOut = ["fade-out", "fade-out-down", "fade-out-left", "fade-out-right", "fade-out-up"];
    const zoomIn = ["zoom-in", "zoom-in-down", "zoom-in-left", "zoom-in-right", "zoom-in-up"];
    const zoomOut = ["zoom-out", "zoom-out-down", "zoom-out-left", "zoom-out-right", "zoom-out-up"];
    const slideIn = ["slide-in-down", "slide-in-left", "slide-in-right", "slide-in-up"];
    const slideOut = ["slide-out-down", "slide-out-left", "slide-out-right", "slide-out-up"];

    const columns: TableColumnData[] = [
        { title: "设置项", dataIndex: "label", width: 180 },
        { title: "分组", dataIndex: "group", slotName: "group", width: 100 },
        { title: "系统默认值", dataIndex: "value", slotName: "value" },
        {
            title: "允许用户自定义",
            dataIndex: "userEditable",
            slotName: "userEditable",
            width: 150,
        },
    ];

    onMounted(loadPolicies);

    async function loadPolicies() {
        loading.value = true;
        try {
            const response = await queryAdminPreferencePolicyApi();
            policies.value = response.data;
            response.data.forEach((policy) => {
                draftValues[policy.key] = policy.value;
                draftEditable[policy.key] = policy.userEditable;
            });
        } finally {
            loading.value = false;
        }
    }

    async function savePolicies() {
        saving.value = true;
        try {
            await updateAdminPreferencePolicyApi(
                policies.value.map((policy) => ({
                    key: policy.key,
                    value: draftValues[policy.key] ?? policy.value,
                    userEditable: draftEditable[policy.key] ?? policy.userEditable,
                })),
            );
            Message.success("后台偏好策略已保存");
            await loadPolicies();
        } finally {
            saving.value = false;
        }
    }

    function updateValue(key: AdminPreferenceKey, value: AdminPreferenceValue | null | undefined) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            draftValues[key] = value;
        }
    }

    function updateRecordValue(record: AdminPreferencePolicy, value: unknown) {
        updateValue(record.key, value as AdminPreferenceValue | null | undefined);
    }

    function updateEditable(key: AdminPreferenceKey, value: boolean) {
        draftEditable[key] = value;
    }

    function updateRecordEditable(record: AdminPreferencePolicy, value: unknown) {
        updateEditable(record.key, Boolean(value));
    }

    function getDraftValue(record: AdminPreferencePolicy) {
        return draftValues[record.key];
    }

    function getDraftEditable(record: AdminPreferencePolicy) {
        return draftEditable[record.key] ?? record.userEditable;
    }

    function resolveAnimationOptions(key: AdminPreferenceKey) {
        const options =
            key === "openingAnimation"
                ? [...fadeIn, ...zoomIn, ...slideIn]
                : [...fadeOut, ...zoomOut, ...slideOut];
        return options.map((value) => ({ label: value, value }));
    }
</script>
