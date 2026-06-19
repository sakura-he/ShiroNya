<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>ABAC 测试台</template>
            <template #subtitle>运行时决策检查</template>
            <template #extra>
                <a-space wrap>
                    <a-tag color="arcoblue">{{ targetApp }}</a-tag>
                    <a-tag
                        v-if="health"
                        color="arcoblue"
                    >
                        {{ health.activeRelease?.revision ?? "未发布" }}
                    </a-tag>
                    <a-button
                        size="small"
                        :loading="loading"
                        @click="refresh"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                        刷新
                    </a-button>
                </a-space>
            </template>
        </a-page-header>

        <a-alert
            type="info"
            show-icon
            style="margin-bottom: 12px"
        >
            <template #title>操作提示</template>
            <a-space
                direction="vertical"
                fill
                size="mini"
            >
                <a-typography-text
                    v-for="item in operationTips"
                    :key="item"
                >
                    {{ item }}
                </a-typography-text>
            </a-space>
        </a-alert>

        <a-grid
            :cols="{ xs: 1, lg: 2 }"
            :col-gap="16"
            :row-gap="16"
        >
            <a-grid-item>
                <a-card title="输入">
                    <a-form
                        :model="form"
                        layout="vertical"
                    >
                        <a-form-item label="权限码">
                            <a-input v-model="form.code" />
                        </a-form-item>
                        <a-form-item label="Principal ID">
                            <a-input v-model="form.principalId" />
                        </a-form-item>
                        <a-form-item label="角色">
                            <a-input v-model="rolesText" />
                        </a-form-item>
                        <a-form-item label="Resource ID">
                            <a-input v-model="form.resourceId" />
                        </a-form-item>
                        <a-form-item label="Principal Attr JSON">
                            <CodeViewer
                                v-model:value="principalAttrText"
                                language="json"
                                :readonly="false"
                                height="180px"
                            />
                        </a-form-item>
                        <a-form-item label="Resource Attr JSON">
                            <CodeViewer
                                v-model:value="resourceAttrText"
                                language="json"
                                :readonly="false"
                                height="180px"
                            />
                        </a-form-item>
                        <a-button
                            type="primary"
                            :loading="testing"
                            @click="runTest"
                        >
                            <template #icon>
                                <icon-play-circle />
                            </template>
                            运行
                        </a-button>
                    </a-form>
                </a-card>
            </a-grid-item>
            <a-grid-item>
                <a-card title="结果">
                    <a-result
                        v-if="result"
                        :status="result.allowed ? 'success' : 'error'"
                        :title="result.allowed ? '允许' : '拒绝'"
                        :subtitle="String(result.reason ?? '')"
                    />
                    <a-empty v-else />
                    <CodeViewer
                        v-if="result"
                        :value="stringifyJson(result)"
                        language="json"
                        readonly
                        height="280px"
                    />
                </a-card>
            </a-grid-item>
        </a-grid>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import { getAbacHealthApi, testAbacRuntimeApi } from "@/api/abac";
    import { CodeViewer } from "@/components/CodeViewer";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { onMounted, reactive, ref, watch } from "vue";
    import { parseJsonObject, showJsonError, stringifyJson, useAbacTarget } from "./abacShared";

    defineOptions({ name: "AbacRuntimeTest" });

    const targetApp = useAbacTarget();
    const loading = ref(false);
    const testing = ref(false);
    const health = ref<Record<string, any> | null>(null);
    const result = ref<Record<string, any> | null>(null);
    const operationTips = [
        "测试台直接调用后端运行时检查；权限码会作为 Cerbos action，角色会作为 principal.roles。",
        "真实 HTTP 请求会自动把 req.session 放入 request.principal.attr.session；这里需要在 Principal Attr JSON 里手动模拟 session 和 ext。",
        "Resource Attr JSON 会进入 request.resource.attr，资源字段 Key 例如 ownerId 会编译成 request.resource.attr.ownerId。",
    ];
    const rolesText = ref("member");
    const principalAttrText = ref(
        stringifyJson({
            session: {
                user: {
                    id: "abac-demo-user",
                    banned: false,
                    createdAt: "2025-04-19T08:05:04.933Z",
                },
                profile: {
                    level: 10,
                },
            },
            ext: {
                departmentId: "dep-alpha",
            },
        }),
    );
    const resourceAttrText = ref(
        stringifyJson({
            tenantId: "tenant-alpha",
            ownerId: "abac-demo-user",
            status: "ACTIVE",
        }),
    );
    const form = reactive({
        code: "system.user.update",
        principalId: "abac-demo-user",
        resourceId: "demo-resource",
    });

    async function refresh() {
        loading.value = true;
        try {
            const response = await getAbacHealthApi(targetApp.value);
            health.value = response.data;
        } finally {
            loading.value = false;
        }
    }

    async function runTest() {
        let principalAttr: Record<string, unknown>;
        let resourceAttr: Record<string, unknown>;
        try {
            principalAttr = parseJsonObject(principalAttrText.value);
            resourceAttr = parseJsonObject(resourceAttrText.value);
        } catch (error) {
            showJsonError(error);
            return;
        }
        testing.value = true;
        try {
            const response = await testAbacRuntimeApi(targetApp.value, {
                ...form,
                roles: rolesText.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                principalAttr,
                resourceAttr,
            });
            result.value = response.data;
        } finally {
            testing.value = false;
        }
    }

    watch(targetApp, () => {
        result.value = null;
        void refresh();
    });

    onMounted(() => {
        void refresh();
    });
</script>

<style scoped lang="scss">
    .json-editor {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 120px;
    }

    .result-viewer {
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        min-height: 280px;
    }
</style>
