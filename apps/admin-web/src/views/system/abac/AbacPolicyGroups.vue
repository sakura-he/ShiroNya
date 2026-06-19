<template>
    <GiPageLayout>
        <a-page-header :show-back="false">
            <template #title>ABAC 策略组</template>
            <template #subtitle>内置 Cerbos 规则生成器</template>
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
                        @click="reloadPolicyGroupTable"
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

        <a-card :bordered="true">
            <GiTable
                row-key="id"
                header-title="策略组"
                :columns="columns"
                :request="requestPolicyGroups"
                :pagination="false"
                :search="false"
                :options="tableOptions"
                :scroll="{ x: '100%', y: '100%', minWidth: 1480 }"
                :action-ref="setPolicyGroupTableAction"
                bordered
            >
                <template #custom-extra>
                    <a-button
                        type="primary"
                        size="small"
                        @click="openCreate"
                    >
                        <template #icon>
                            <icon-plus />
                        </template>
                        新增策略组
                    </a-button>
                </template>
                <template #effect="{ record }">
                    <a-tag :color="record.effect === 'DENY' ? 'red' : 'green'">
                        {{ effectLabel(record.effect) }}
                    </a-tag>
                </template>
                <template #permissions="{ record }">
                    <a-space wrap>
                        <a-tag
                            v-for="permission in record.permissions"
                            :key="permission.id"
                            color="arcoblue"
                        >
                            {{ permission.code }}
                        </a-tag>
                        <span v-if="!record.permissions.length">-</span>
                    </a-space>
                </template>
                <template #conditions="{ record }">
                    <a-tag>{{ record.conditions.length }}</a-tag>
                </template>
                <template #action="{ record }">
                    <a-space
                        wrap
                        size="mini"
                    >
                        <a-link @click="openEdit(record)">编辑</a-link>
                        <a-popconfirm
                            content="确认删除？"
                            @ok="remove(record.id)"
                        >
                            <a-link status="danger">删除</a-link>
                        </a-popconfirm>
                    </a-space>
                </template>
            </GiTable>
        </a-card>

        <a-modal
            v-model:visible="modalVisible"
            title="策略组"
            fullscreen
            :body-style="{ height: 'calc(100vh - 108px)', overflow: 'hidden' }"
            :footer="false"
        >
            <div class="policy-modal">
                <a-form
                    :model="form"
                    layout="vertical"
                    class="policy-workbench"
                >
                    <a-split
                        v-model:size="policySplitSize"
                        class="policy-workbench__split"
                        direction="horizontal"
                        :min="0.54"
                        :max="0.66"
                    >
                        <template #first>
                            <div class="policy-workbench__form">
                                <section class="policy-section">
                                    <div class="policy-section__header">
                                        <a-typography-title
                                            :heading="6"
                                            class="policy-section__title"
                                        >
                                            基础信息
                                        </a-typography-title>
                                        <a-radio-group
                                            v-model="form.status"
                                            type="button"
                                            size="small"
                                        >
                                            <a-radio value="ENABLE">启用</a-radio>
                                            <a-radio value="DISABLE">停用</a-radio>
                                        </a-radio-group>
                                    </div>

                                    <a-grid
                                        :cols="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }"
                                        :col-gap="16"
                                    >
                                        <a-grid-item>
                                            <a-form-item label="名称">
                                                <a-input
                                                    v-model="form.name"
                                                    allow-clear
                                                />
                                            </a-form-item>
                                        </a-grid-item>
                                        <a-grid-item>
                                            <a-form-item label="授权作用">
                                                <a-radio-group
                                                    v-model="form.effect"
                                                    type="button"
                                                >
                                                    <a-radio value="ALLOW">允许</a-radio>
                                                    <a-radio value="DENY">拒绝</a-radio>
                                                </a-radio-group>
                                            </a-form-item>
                                        </a-grid-item>
                                        <a-grid-item>
                                            <a-form-item label="内置主策略">
                                                <a-input
                                                    :model-value="builtinPolicyId"
                                                    readonly
                                                />
                                            </a-form-item>
                                        </a-grid-item>
                                        <a-grid-item
                                            :span="{
                                                xs: 1,
                                                sm: 1,
                                                md: 2,
                                                lg: 2,
                                                xl: 2,
                                                xxl: 2,
                                            }"
                                        >
                                            <a-form-item label="权限码">
                                                <a-tree-select
                                                    :model-value="rbacPermissionIds"
                                                    tree-checkable
                                                    tree-checked-strategy="child"
                                                    selectable="leaf"
                                                    allow-search
                                                    allow-clear
                                                    :loading="rbacPermissionLoading"
                                                    :data="permissionTreeData"
                                                    :field-names="{
                                                        key: 'key',
                                                        title: 'title',
                                                        children: 'children',
                                                    }"
                                                    placeholder="选择 RBAC 权限码"
                                                    :filter-tree-node="filterRbacPermissionTreeNode"
                                                    :tree-props="{
                                                        blockNode: true,
                                                        showLine: true,
                                                        defaultExpandSelected: true,
                                                    }"
                                                    :trigger-props="{
                                                        autoFitPopupWidth: false,
                                                        autoFitPopupMinWidth: true,
                                                    }"
                                                    @search="searchRbacPermissions"
                                                    @update:model-value="updateRbacPermissionIds"
                                                />
                                            </a-form-item>
                                        </a-grid-item>
                                        <a-grid-item>
                                            <a-form-item label="描述">
                                                <a-input
                                                    :model-value="form.description ?? ''"
                                                    allow-clear
                                                    @update:model-value="
                                                        (value) =>
                                                            (form.description = String(value ?? ''))
                                                    "
                                                />
                                            </a-form-item>
                                        </a-grid-item>
                                    </a-grid>
                                </section>

                                <section class="policy-section policy-section--tree">
                                    <div class="policy-section__header">
                                        <a-typography-title
                                            :heading="6"
                                            class="policy-section__title"
                                        >
                                            条件
                                        </a-typography-title>
                                    </div>

                                    <AbacConditionTreeBuilder
                                        :nodes="conditionNodes"
                                        :parent-id="null"
                                        :match-type="normalizeMatchType(form.matchType)"
                                        :match-options="matchOptions"
                                        :field-options="fieldOptions"
                                        :root="true"
                                        :add-expr-node="addExprNode"
                                        :add-group-node="addGroupNode"
                                        :remove-node="removeNode"
                                        :update-field="updateField"
                                        :update-operator="updateOperator"
                                        :update-value="updateValue"
                                        :update-group-match="updateGroupMatch"
                                        :get-operator-options="getOperatorOptions"
                                        :get-value-component="getValueComponent"
                                        :get-value-options="getValueOptions"
                                        :get-value-model="getValueModel"
                                        :is-value-free-operator="isValueFreeOperator"
                                        @update-match-type="updateRootMatchType"
                                    />
                                </section>
                            </div>
                        </template>

                        <template #second>
                            <aside class="policy-workbench__preview">
                                <div class="preview-header">
                                    <div class="preview-header__text">
                                        <a-typography-title
                                            :heading="6"
                                            class="preview-header__title"
                                        >
                                            JSON 视图预览
                                        </a-typography-title>
                                        <a-typography-text type="secondary">
                                            {{ previewUpdatedAt }}
                                        </a-typography-text>
                                    </div>
                                    <a-button
                                        size="small"
                                        @click="refreshPreviewStamp"
                                    >
                                        <template #icon>
                                            <icon-refresh />
                                        </template>
                                    </a-button>
                                </div>

                                <a-radio-group
                                    v-model="previewMode"
                                    type="button"
                                    size="small"
                                    class="preview-switch"
                                >
                                    <a-radio value="policy">主策略</a-radio>
                                    <a-radio value="rule">规则</a-radio>
                                    <a-radio value="nodes">条件节点</a-radio>
                                </a-radio-group>

                                <a-alert
                                    v-if="generationPreview.error"
                                    type="warning"
                                    show-icon
                                    class="preview-alert"
                                >
                                    {{ generationPreview.error }}
                                </a-alert>

                                <CodeViewer
                                    :value="previewJson"
                                    language="json"
                                    readonly
                                    word-wrap="off"
                                    height="100%"
                                    class="preview-code"
                                />
                            </aside>
                        </template>
                    </a-split>
                </a-form>

                <div class="modal-footer">
                    <a-space wrap>
                        <a-button @click="modalVisible = false">取消</a-button>
                        <a-button
                            :loading="saving"
                            @click="save"
                        >
                            保存
                        </a-button>
                        <a-button
                            type="primary"
                            :loading="saving"
                            @click="saveAndGoPreview"
                        >
                            保存并预览
                        </a-button>
                    </a-space>
                </div>
            </div>
        </a-modal>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        deleteAbacPolicyGroupApi,
        getAbacFieldsApi,
        getAbacHealthApi,
        getAbacPolicyGroupsApi,
        getAbacRbacPermissionOptionsApi,
        saveAbacPolicyGroupApi,
        type AbacConditionNodeDto,
        type AbacFieldDto,
        type AbacPermissionDto,
        type AbacPolicyGroupDto,
        type AbacRbacPermissionOptionDto,
    } from "@/api/abac";
    import { CodeViewer } from "@/components/CodeViewer";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type ProColumns,
        type RequestData,
    } from "@/components/GiTable";
    import { Message } from "@arco-design/web-vue";
    import { computed, reactive, ref, watch } from "vue";
    import { useRouter } from "vue-router";
    import AbacConditionTreeBuilder from "./AbacConditionTreeBuilder.vue";
    import { stringifyJson, tableOptions, useAbacTarget } from "./abacShared";

    defineOptions({ name: "AbacPolicyGroups" });

    type MatchType = "ALL" | "ANY" | "NONE";
    type NodeType = "GROUP" | "EXPR";
    type PreviewMode = "policy" | "rule" | "nodes";
    type CerbosMatch =
        | { expr: string }
        | { all: { of: CerbosMatch[] } }
        | { any: { of: CerbosMatch[] } }
        | { none: { of: CerbosMatch[] } };
    type ConditionNodePreviewTree = AbacConditionNodeDto & {
        children?: ConditionNodePreviewTree[];
    };
    type ConditionNodePreviewRoot = {
        nodeType: "ROOT";
        matchType: MatchType;
        children: ConditionNodePreviewTree[];
    };
    type RbacPermissionGroupOption = NonNullable<AbacRbacPermissionOptionDto["group"]>;
    type RbacPermissionTreeNode = {
        key: string | number;
        title: string;
        selectable?: boolean;
        isLeaf?: boolean;
        searchText?: string;
        children?: RbacPermissionTreeNode[];
    };

    type ConditionNodeDraft = {
        id: string;
        parentId: string | null;
        nodeType: NodeType;
        matchType: MatchType;
        leftPath: string;
        operator: string;
        rightValue: unknown;
        sort: number;
    };

    const targetApp = useAbacTarget();
    const router = useRouter();
    const operationTips = [
        "先选择 RBAC 权限码，再用字段白名单配置条件；字段 Key 会直接编译成 request.principal.attr.session.*、request.principal.attr.ext.*、request.resource.attr.* 或 request.* 上下文字段。",
        "保存策略组后不会立即影响运行时，需要到发布页预览并发布；后端发布时会把启用的策略组合并进内置 Cerbos 资源策略。",
        "运行时请求进入后，后端按 RBAC 权限码 action 查绑定关系，取当前用户角色、req.session 和传入属性交给 Cerbos 判定。",
    ];
    const loading = ref(false);
    const saving = ref(false);
    const modalVisible = ref(false);
    const groups = ref<AbacPolicyGroupDto[]>([]);
    const rbacPermissions = ref<AbacRbacPermissionOptionDto[]>([]);
    const rbacPermissionLoading = ref(false);
    const fields = ref<AbacFieldDto[]>([]);
    const health = ref<Record<string, any> | null>(null);
    const rbacPermissionIds = ref<number[]>([]);
    const conditionNodes = ref<ConditionNodeDraft[]>([]);
    const policySplitSize = ref(0.62);
    const policyGroupTableAction = ref<ActionType | null>(null);
    const form = reactive<Partial<AbacPolicyGroupDto>>({
        effect: "ALLOW",
        matchType: "ALL",
        status: "ENABLE",
    });

    let nodeCounter = 0;

    const builtinPolicyId = "resource.abac_builtin_permission.vdefault";
    const ungroupedPermissionGroupKey = "permission-group:__ungrouped__";
    const ungroupedPermissionGroupTitle = "未分类";
    const matchOptions: Array<{ label: string; value: MatchType }> = [
        { label: "全部满足", value: "ALL" },
        { label: "任一满足", value: "ANY" },
        { label: "全部不满足", value: "NONE" },
    ];
    const booleanOptions = [
        { label: "是", value: true },
        { label: "否", value: false },
    ];
    const operatorLabels: Record<string, string> = {
        EQ: "等于",
        NE: "不等于",
        GT: "大于",
        GTE: "大于等于",
        LT: "小于",
        LTE: "小于等于",
        IN: "属于",
        NOT_IN: "不属于",
        CONTAINS: "包含",
        NOT_CONTAINS: "不包含",
        EMPTY: "为空",
        NOT_EMPTY: "不为空",
    };

    const fieldOptions = computed(() =>
        fields.value.map((field) => ({
            label: `${field.key} · ${field.label}`,
            value: field.key,
        })),
    );
    const selectedPermissionCodes = computed(() =>
        rbacPermissionIds.value
            .map((id) => rbacPermissions.value.find((permission) => permission.id === id)?.code)
            .filter((code): code is string => Boolean(code)),
    );
    const orderedConditionNodes = computed(() => orderConditionNodes(conditionNodes.value));
    const builtConditionNodes = computed(() => buildConditionNodes());
    const conditionNodePreviewTree = computed(() => buildConditionNodePreviewTree());
    const generationPreview = computed(() => createGenerationPreview());
    const previewMode = ref<PreviewMode>("policy");
    const previewUpdatedAt = ref(formatPreviewTime(new Date()));
    const previewJson = computed(() => {
        if (previewMode.value === "rule") {
            return stringifyJson(generationPreview.value.rule);
        }
        if (previewMode.value === "nodes") {
            return stringifyJson(conditionNodePreviewTree.value);
        }
        return stringifyJson(generationPreview.value.policy);
    });
    const columns: ProColumns[] = [
        { title: "名称", dataIndex: "name", width: 220 },
        { title: "授权作用", dataIndex: "effect", slotName: "effect", width: 110 },
        { title: "匹配方式", dataIndex: "matchType", render: ({ record }) => matchLabel(record.matchType), width: 120 },
        { title: "RBAC 权限码", dataIndex: "permissions", slotName: "permissions", width: 340 },
        { title: "条件数", dataIndex: "conditions", slotName: "conditions", width: 120 },
        { title: "更新时间", dataIndex: "updatedAt", width: 210 },
        {
            title: "操作",
            dataIndex: "action",
            valueType: "option",
            slotName: "action",
            width: 120,
            fixed: "right",
            align: "center",
            hideInSearch: true,
        },
    ];

    function openCreate() {
        resetPolicyWorkbenchLayout();
        Object.assign(form, {
            id: undefined,
            name: "",
            description: "",
            effect: "ALLOW",
            matchType: "ALL",
            status: "ENABLE",
        });
        rbacPermissionIds.value = [];
        conditionNodes.value = fields.value.length ? [createExprNode()] : [];
        modalVisible.value = true;
    }

    function openEdit(record: AbacPolicyGroupDto) {
        resetPolicyWorkbenchLayout();
        Object.assign(form, record);
        rbacPermissionIds.value = [...record.rbacPermissionIds];
        mergeRbacPermissionOptions(
            record.permissions
                .map((permission) => toRbacPermissionOption(permission))
                .filter((permission): permission is AbacRbacPermissionOptionDto => Boolean(permission)),
        );
        conditionNodes.value = normalizeConditionDrafts(record.conditions);
        modalVisible.value = true;
    }

    function resetPolicyWorkbenchLayout() {
        policySplitSize.value = 0.62;
    }

    function setPolicyGroupTableAction(action: ActionType) {
        policyGroupTableAction.value = action;
    }

    async function requestPolicyGroups(): Promise<RequestData<AbacPolicyGroupDto>> {
        await refresh();
        return {
            data: groups.value,
            success: true,
            total: groups.value.length,
        };
    }

    async function reloadPolicyGroupTable() {
        if (policyGroupTableAction.value) {
            await policyGroupTableAction.value.reload();
            return;
        }
        await refresh();
    }

    async function refresh() {
        loading.value = true;
        try {
            const [healthResponse, groupResponse, rbacPermissionResponse, fieldResponse] =
                await Promise.all([
                    getAbacHealthApi(targetApp.value),
                    getAbacPolicyGroupsApi(targetApp.value),
                    getAbacRbacPermissionOptionsApi(targetApp.value),
                    getAbacFieldsApi(targetApp.value),
                ]);
            health.value = healthResponse.data;
            groups.value = groupResponse.data.groups;
            rbacPermissions.value = mergeRbacPermissionOptionLists(
                rbacPermissionResponse.data.permissions,
                groups.value.flatMap((group) =>
                    group.permissions
                        .map((permission) => toRbacPermissionOption(permission))
                        .filter((permission): permission is AbacRbacPermissionOptionDto => Boolean(permission)),
                ),
            );
            fields.value = fieldResponse.data.fields;
            if (modalVisible.value && conditionNodes.value.length === 0 && fields.value.length) {
                conditionNodes.value = [createExprNode()];
            }
        } finally {
            loading.value = false;
        }
    }

    let rbacPermissionSearchTimer: ReturnType<typeof setTimeout> | undefined;

    function searchRbacPermissions(keyword: string) {
        if (rbacPermissionSearchTimer) {
            clearTimeout(rbacPermissionSearchTimer);
        }
        rbacPermissionSearchTimer = setTimeout(() => {
            void loadRbacPermissionOptions(keyword);
        }, 240);
    }

    async function loadRbacPermissionOptions(keyword = "") {
        rbacPermissionLoading.value = true;
        try {
            const response = await getAbacRbacPermissionOptionsApi(targetApp.value, {
                keyword: keyword || undefined,
            });
            rbacPermissions.value = mergeRbacPermissionOptionLists(
                response.data.permissions,
                rbacPermissions.value.filter((permission) => rbacPermissionIds.value.includes(permission.id)),
            );
        } finally {
            rbacPermissionLoading.value = false;
        }
    }

    function updateRbacPermissionIds(value: unknown) {
        const rawValues = Array.isArray(value)
            ? value
            : value === undefined || value === null || value === ""
              ? []
              : [value];
        rbacPermissionIds.value = [
            ...new Set(
                rawValues
                    .map((id) => Number(id))
                    .filter((id) => Number.isInteger(id) && id > 0),
            ),
        ];
    }

    function buildRbacPermissionTreeData(
        permissions: AbacRbacPermissionOptionDto[],
    ): RbacPermissionTreeNode[] {
        const groupMap = new Map<string, RbacPermissionTreeNode>();
        for (const permission of permissions) {
            const group = permission.group ?? null;
            const groupKey = group ? createRbacPermissionGroupKey(group.id) : ungroupedPermissionGroupKey;
            const groupNode = getOrCreateRbacPermissionGroupNode(groupMap, groupKey, group);
            groupNode.children = [
                ...(groupNode.children ?? []),
                {
                    key: permission.id,
                    title: formatRbacPermissionTitle(permission),
                    isLeaf: true,
                    searchText: createRbacPermissionSearchText(permission, group),
                },
            ];
        }

        return [...groupMap.values()]
            .map((group) => ({
                ...group,
                children: [...(group.children ?? [])].sort((left, right) =>
                    left.title.localeCompare(right.title),
                ),
            }))
            .sort(compareRbacPermissionGroupNodes);
    }

    function getOrCreateRbacPermissionGroupNode(
        groupMap: Map<string, RbacPermissionTreeNode>,
        groupKey: string,
        group: RbacPermissionGroupOption | null,
    ) {
        const existing = groupMap.get(groupKey);
        if (existing) {
            return existing;
        }
        const title = group ? `${group.name} · ${group.code}` : ungroupedPermissionGroupTitle;
        const node: RbacPermissionTreeNode = {
            key: groupKey,
            title,
            selectable: false,
            searchText: normalizeRbacPermissionSearchText(title),
            children: [],
        };
        groupMap.set(groupKey, node);
        return node;
    }

    function compareRbacPermissionGroupNodes(
        left: RbacPermissionTreeNode,
        right: RbacPermissionTreeNode,
    ) {
        if (left.key === ungroupedPermissionGroupKey) {
            return 1;
        }
        if (right.key === ungroupedPermissionGroupKey) {
            return -1;
        }
        const leftGroup = findRbacPermissionGroupByNodeKey(left.key);
        const rightGroup = findRbacPermissionGroupByNodeKey(right.key);
        return (
            Number(leftGroup?.sort ?? 0) - Number(rightGroup?.sort ?? 0) ||
            left.title.localeCompare(right.title)
        );
    }

    function findRbacPermissionGroupByNodeKey(key: string | number) {
        const groupId = readRbacPermissionGroupId(key);
        if (!groupId) {
            return null;
        }
        return rbacPermissions.value.find((permission) => permission.group?.id === groupId)?.group ?? null;
    }

    function createRbacPermissionGroupKey(groupId: number) {
        return `permission-group:${groupId}`;
    }

    function readRbacPermissionGroupId(key: string | number) {
        const match = String(key).match(/^permission-group:(\d+)$/);
        return match ? Number(match[1]) : null;
    }

    function formatRbacPermissionTitle(permission: AbacRbacPermissionOptionDto) {
        return `${permission.code} · ${permission.name}`;
    }

    function createRbacPermissionSearchText(
        permission: AbacRbacPermissionOptionDto,
        group: RbacPermissionGroupOption | null,
    ) {
        return normalizeRbacPermissionSearchText(
            [
                permission.id,
                permission.code,
                permission.name,
                permission.description,
                group?.code,
                group?.name,
            ]
                .filter(Boolean)
                .join(" "),
        );
    }

    function filterRbacPermissionTreeNode(
        keyword: string,
        node: { searchText?: string; title?: string; key?: string | number },
    ) {
        const normalizedKeyword = normalizeRbacPermissionSearchText(keyword);
        const searchText = node.searchText ?? normalizeRbacPermissionSearchText(`${node.key ?? ""} ${node.title ?? ""}`);
        return !normalizedKeyword || searchText.includes(normalizedKeyword);
    }

    function normalizeRbacPermissionSearchText(value: unknown) {
        return String(value ?? "").trim().toLowerCase();
    }

    const permissionTreeData = computed(() => buildRbacPermissionTreeData(rbacPermissions.value));

    function mergeRbacPermissionOptions(options: AbacRbacPermissionOptionDto[]) {
        rbacPermissions.value = mergeRbacPermissionOptionLists(rbacPermissions.value, options);
    }

    function mergeRbacPermissionOptionLists(
        baseOptions: AbacRbacPermissionOptionDto[],
        extraOptions: AbacRbacPermissionOptionDto[],
    ) {
        const optionMap = new Map<number, AbacRbacPermissionOptionDto>();
        for (const option of [...baseOptions, ...extraOptions]) {
            optionMap.set(option.id, option);
        }
        return [...optionMap.values()].sort((left, right) => left.code.localeCompare(right.code));
    }

    function toRbacPermissionOption(permission: AbacPermissionDto): AbacRbacPermissionOptionDto | null {
        if (!permission.rbacPermissionId) {
            return null;
        }
        return {
            id: permission.rbacPermissionId,
            code: permission.rbacPermissionCodeSnap || permission.code,
            name: permission.rbacPermissionNameSnap || permission.name,
            description: permission.description ?? null,
            status: permission.status,
        };
    }

    async function save() {
        return await persistPolicyGroup(false);
    }

    async function saveAndGoPreview() {
        await persistPolicyGroup(true);
    }

    async function persistPolicyGroup(goPreview: boolean) {
        if (!String(form.name ?? "").trim()) {
            Message.warning("名称不能为空");
            return false;
        }
        if (rbacPermissionIds.value.length === 0) {
            Message.warning("至少绑定一个 RBAC 权限码");
            return false;
        }
        if (conditionNodes.value.length === 0) {
            Message.warning("至少添加一个条件节点");
            return false;
        }
        if (generationPreview.value.error) {
            Message.warning(generationPreview.value.error);
            return false;
        }

        saving.value = true;
        try {
            const response = await saveAbacPolicyGroupApi(targetApp.value, {
                ...form,
                rbacPermissionIds: rbacPermissionIds.value,
                conditions: builtConditionNodes.value,
            });
            if (!response.data.saved) {
                Message.warning(response.data.reason || "保存失败");
                return false;
            }
            Message.success("策略组已保存");
            modalVisible.value = false;
            await reloadPolicyGroupTable();
            if (goPreview) {
                await router.push(targetApp.value === "app-api" ? "/app/app-abac/preview" : "/system/abac/preview");
            }
            return true;
        } finally {
            saving.value = false;
        }
    }

    async function remove(id: string) {
        await deleteAbacPolicyGroupApi(targetApp.value, id);
        await reloadPolicyGroupTable();
    }

    function createNodeId(prefix: string) {
        nodeCounter += 1;
        return `${prefix}_${Date.now().toString(36)}_${nodeCounter}`;
    }

    function createExprNode(parentId: string | null = null): ConditionNodeDraft {
        const field = fields.value[0] ?? null;
        const operator = field?.operators[0] ?? "EQ";
        return {
            id: createNodeId("expr"),
            parentId,
            nodeType: "EXPR",
            matchType: "ALL",
            leftPath: field?.key ?? "",
            operator,
            rightValue: createDefaultValue(field, operator),
            sort: nextSiblingSort(parentId),
        };
    }

    function createGroupNode(parentId: string | null = null): ConditionNodeDraft {
        return {
            id: createNodeId("group"),
            parentId,
            nodeType: "GROUP",
            matchType: "ALL",
            leftPath: "",
            operator: "",
            rightValue: "",
            sort: nextSiblingSort(parentId),
        };
    }

    function addExprNode(parentId: string | null = null) {
        conditionNodes.value = [...conditionNodes.value, createExprNode(parentId)];
    }

    function addGroupNode(parentId: string | null = null) {
        conditionNodes.value = [...conditionNodes.value, createGroupNode(parentId)];
    }

    function removeNode(node: ConditionNodeDraft) {
        const removingIds = new Set([node.id, ...getDescendantIds(node.id)]);
        conditionNodes.value = conditionNodes.value.filter((item) => !removingIds.has(item.id));
        normalizeAllSiblingSorts();
    }

    function updateField(node: ConditionNodeDraft, value: unknown) {
        node.leftPath = String(value ?? "");
        const field = getField(node.leftPath);
        node.operator = field?.operators[0] ?? "EQ";
        node.rightValue = createDefaultValue(field, node.operator);
    }

    function updateOperator(node: ConditionNodeDraft, value: unknown) {
        node.operator = String(value ?? "");
        node.rightValue = createDefaultValue(getNodeField(node), node.operator);
    }

    function updateValue(node: ConditionNodeDraft, value: unknown) {
        if (usesArrayValue(node.operator)) {
            node.rightValue = parseArrayInput(value);
            return;
        }
        node.rightValue = value;
    }

    function updateRootMatchType(value: MatchType) {
        form.matchType = value;
    }

    function updateGroupMatch(node: ConditionNodeDraft, value: MatchType) {
        node.matchType = value;
    }

    function refreshPreviewStamp() {
        previewUpdatedAt.value = formatPreviewTime(new Date());
    }

    function formatPreviewTime(date: Date) {
        return `最后生成 ${date.toLocaleTimeString("zh-CN", { hour12: false })}`;
    }

    function getDescendantIds(id: string): string[] {
        const children = conditionNodes.value.filter((node) => node.parentId === id);
        return children.flatMap((child) => [child.id, ...getDescendantIds(child.id)]);
    }

    function getSortedSiblings(parentId: string | null | undefined) {
        const normalizedParentId = parentId ?? null;
        return conditionNodes.value
            .filter((node) => (node.parentId ?? null) === normalizedParentId)
            .sort(compareDraftSort);
    }

    function nextSiblingSort(parentId: string | null, excludeId?: string) {
        return conditionNodes.value.filter(
            (node) => (node.parentId ?? null) === (parentId ?? null) && node.id !== excludeId,
        ).length;
    }

    function normalizeAllSiblingSorts() {
        const byParent = new Map<string | null, ConditionNodeDraft[]>();
        for (const node of conditionNodes.value) {
            const parentId = node.parentId ?? null;
            byParent.set(parentId, [...(byParent.get(parentId) ?? []), node]);
        }
        for (const siblings of byParent.values()) {
            siblings.sort(compareDraftSort).forEach((node, index) => {
                node.sort = index;
            });
        }
        conditionNodes.value = [...conditionNodes.value];
    }

    function orderConditionNodes(nodes: ConditionNodeDraft[]) {
        const byParent = new Map<string | null, ConditionNodeDraft[]>();
        for (const node of nodes) {
            const parentId = node.parentId ?? null;
            byParent.set(parentId, [...(byParent.get(parentId) ?? []), node]);
        }
        const ordered: ConditionNodeDraft[] = [];
        const visited = new Set<string>();
        const appendChildren = (parentId: string | null) => {
            const children = [...(byParent.get(parentId) ?? [])].sort(compareDraftSort);
            for (const child of children) {
                if (visited.has(child.id)) {
                    continue;
                }
                visited.add(child.id);
                ordered.push(child);
                appendChildren(child.id);
            }
        };
        appendChildren(null);
        for (const node of nodes) {
            if (!visited.has(node.id)) {
                ordered.push(node);
            }
        }
        return ordered;
    }

    function compareDraftSort(a: ConditionNodeDraft, b: ConditionNodeDraft) {
        return Number(a.sort ?? 0) - Number(b.sort ?? 0);
    }

    function compareConditionNodeSort(a: AbacConditionNodeDto, b: AbacConditionNodeDto) {
        return Number(a.sort ?? 0) - Number(b.sort ?? 0);
    }

    function getField(key: string) {
        return fields.value.find((field) => field.key === key) ?? null;
    }

    function getNodeField(node: ConditionNodeDraft) {
        return getField(node.leftPath);
    }

    function getOperatorOptions(node: ConditionNodeDraft) {
        return (getNodeField(node)?.operators ?? []).map((operator) => ({
            label: operatorLabels[operator] ?? operator,
            value: operator,
        }));
    }

    function effectLabel(effect: unknown) {
        return effect === "DENY" ? "拒绝" : "允许";
    }

    function matchLabel(matchType: unknown) {
        const labels: Record<MatchType, string> = {
            ALL: "全部满足",
            ANY: "任一满足",
            NONE: "全部不满足",
        };
        return labels[normalizeMatchType(matchType)];
    }

    function getValueComponent(node: ConditionNodeDraft) {
        if (usesArrayValue(node.operator)) {
            return "a-input";
        }
        const field = getNodeField(node);
        if (field?.dataType === "number") {
            return "a-input-number";
        }
        if (field?.dataType === "boolean") {
            return "a-select";
        }
        return "a-input";
    }

    function getValueOptions(node: ConditionNodeDraft) {
        return getNodeField(node)?.dataType === "boolean" ? booleanOptions : undefined;
    }

    function getValueModel(node: ConditionNodeDraft) {
        if (usesArrayValue(node.operator)) {
            return parseArrayInput(node.rightValue).join(", ");
        }
        if (getNodeField(node)?.dataType === "number") {
            const value = Number(node.rightValue);
            return Number.isFinite(value) ? value : undefined;
        }
        return node.rightValue;
    }

    function isValueFreeOperator(operator: string | null | undefined) {
        return operator === "EMPTY" || operator === "NOT_EMPTY";
    }

    function usesArrayValue(operator: string | null | undefined) {
        return operator === "IN" || operator === "NOT_IN";
    }

    function createDefaultValue(field: AbacFieldDto | null, operator: string) {
        if (isValueFreeOperator(operator)) {
            return undefined;
        }
        if (usesArrayValue(operator)) {
            return [];
        }
        if (field?.dataType === "number") {
            return 0;
        }
        if (field?.dataType === "boolean") {
            return true;
        }
        return "";
    }

    function normalizeConditionDrafts(conditions: AbacConditionNodeDto[]): ConditionNodeDraft[] {
        if (!conditions.length) {
            return fields.value.length ? [createExprNode()] : [];
        }
        return conditions
            .slice()
            .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))
            .map((node, index) => {
                if (node.nodeType === "GROUP") {
                    return {
                        id: String(node.id ?? createNodeId("group")),
                        parentId: node.parentId ?? null,
                        nodeType: "GROUP" as NodeType,
                        matchType: normalizeMatchType(node.matchType),
                        leftPath: "",
                        operator: "",
                        rightValue: "",
                        sort: Number(node.sort ?? index),
                    };
                }
                const field = node.leftPath ? getField(node.leftPath) : (fields.value[0] ?? null);
                const operator = field?.operators.includes(String(node.operator))
                    ? String(node.operator)
                    : (field?.operators[0] ?? "EQ");
                return {
                    id: String(node.id ?? createNodeId("expr")),
                    parentId: node.parentId ?? null,
                    nodeType: "EXPR" as NodeType,
                    matchType: "ALL" as MatchType,
                    leftPath: field?.key ?? String(node.leftPath ?? ""),
                    operator,
                    rightValue: node.rightValue ?? createDefaultValue(field, operator),
                    sort: Number(node.sort ?? index),
                };
            });
    }

    function buildConditionNodes(): AbacConditionNodeDto[] {
        return orderedConditionNodes.value.map((node) => {
            const sort = getSortedSiblings(node.parentId).findIndex((item) => item.id === node.id);
            if (node.nodeType === "GROUP") {
                return {
                    id: node.id,
                    parentId: node.parentId,
                    nodeType: "GROUP",
                    matchType: node.matchType,
                    sort,
                };
            }
            const field = getNodeField(node);
            const operator = node.operator || field?.operators[0] || "EQ";
            return {
                id: node.id,
                parentId: node.parentId,
                nodeType: "EXPR",
                leftType: field?.valueType as AbacConditionNodeDto["leftType"],
                leftPath: field?.key ?? node.leftPath,
                operator,
                rightType: isValueFreeOperator(operator) ? null : "CONST",
                rightValue: isValueFreeOperator(operator)
                    ? undefined
                    : normalizeRightValue(node, field, operator),
                sort,
            };
        });
    }

    function buildConditionNodePreviewTree(): ConditionNodePreviewRoot {
        const byParent = new Map<string | null, AbacConditionNodeDto[]>();
        for (const node of builtConditionNodes.value) {
            const parentId = node.parentId ?? null;
            byParent.set(parentId, [...(byParent.get(parentId) ?? []), node]);
        }
        for (const siblings of byParent.values()) {
            siblings.sort(compareConditionNodeSort);
        }

        const createChildren = (parentId: string | null): ConditionNodePreviewTree[] =>
            (byParent.get(parentId) ?? []).map((node) => {
                const children = createChildren(String(node.id ?? ""));
                return children.length ? { ...node, children } : { ...node };
            });

        return {
            nodeType: "ROOT",
            matchType: normalizeMatchType(form.matchType),
            children: createChildren(null),
        };
    }

    function createGenerationPreview() {
        const baseRule = {
            name: `builtin_${safeCodeSegment(String(form.id ?? "draft"))}`,
            actions: selectedPermissionCodes.value,
            effect: form.effect === "DENY" ? "EFFECT_DENY" : "EFFECT_ALLOW",
            roles: ["*"],
        };
        try {
            const match = compileLocalMatch(
                builtConditionNodes.value,
                normalizeMatchType(form.matchType),
            );
            const draftRule = {
                ...baseRule,
                ...(match ? { condition: { match } } : {}),
            };
            const rules = [
                ...createExistingPreviewRules(String(form.id ?? "")),
                ...(form.status === "DISABLE" ? [] : [draftRule]),
            ];
            return {
                error: "",
                rule: draftRule,
                policy: createBuiltInPreviewPolicy(rules),
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
                rule: baseRule,
                policy: createBuiltInPreviewPolicy([
                    ...createExistingPreviewRules(String(form.id ?? "")),
                    ...(form.status === "DISABLE" ? [] : [baseRule]),
                ]),
            };
        }
    }

    function createExistingPreviewRules(currentId: string) {
        return groups.value
            .filter((group) => group.status === "ENABLE" && group.id !== currentId)
            .flatMap((group) => {
                try {
                    const actions = group.permissions.map((permission) => permission.code);
                    if (actions.length === 0 || group.conditions.length === 0) {
                        return [];
                    }
                    const match = compileLocalMatch(
                        group.conditions,
                        normalizeMatchType(group.matchType),
                    );
                    return [
                        {
                            name: `builtin_${safeCodeSegment(group.id)}`,
                            actions,
                            effect: group.effect === "DENY" ? "EFFECT_DENY" : "EFFECT_ALLOW",
                            roles: ["*"],
                            ...(match ? { condition: { match } } : {}),
                        },
                    ];
                } catch {
                    return [];
                }
            });
    }

    function createBuiltInPreviewPolicy(rules: Array<Record<string, unknown>>) {
        return {
            apiVersion: "api.cerbos.dev/v1",
            resourcePolicy: {
                resource: "abac_builtin_permission",
                version: "default",
                rules,
            },
        };
    }

    function compileLocalMatch(
        nodes: AbacConditionNodeDto[],
        matchType: MatchType,
    ): CerbosMatch | null {
        if (nodes.length === 0) {
            throw new Error("策略组至少需要一个条件节点");
        }
        const rootNodes = nodes.filter((node) => !node.parentId).sort(compareConditionNodeSort);
        if (!rootNodes.length) {
            throw new Error("条件树缺少根节点或存在循环引用");
        }
        validateLocalTreeShape(nodes, rootNodes);
        if (rootNodes.length === 1) {
            return compileLocalNode(rootNodes[0], nodes);
        }
        return wrapMatches(
            matchType,
            rootNodes.map((node) => compileLocalNode(node, nodes)),
        );
    }

    function compileLocalNode(
        node: AbacConditionNodeDto,
        nodes: AbacConditionNodeDto[],
    ): CerbosMatch {
        if (node.nodeType === "GROUP") {
            const children = nodes.filter((item) => item.parentId === node.id);
            if (!children.length) {
                throw new Error(`${node.id} 没有子条件`);
            }
            return wrapMatches(
                normalizeMatchType(node.matchType),
                children
                    .sort(compareConditionNodeSort)
                    .map((child) => compileLocalNode(child, nodes)),
            );
        }
        return { expr: compileLocalExpr(node) };
    }

    function validateLocalTreeShape(
        nodes: AbacConditionNodeDto[],
        rootNodes: AbacConditionNodeDto[],
    ) {
        const byParent = new Map<string | null, AbacConditionNodeDto[]>();
        for (const node of nodes) {
            const parentId = node.parentId ?? null;
            byParent.set(parentId, [...(byParent.get(parentId) ?? []), node]);
        }
        const exprWithChildren = nodes.find(
            (node) =>
                node.nodeType === "EXPR" && (byParent.get(String(node.id ?? "")) ?? []).length > 0,
        );
        if (exprWithChildren) {
            throw new Error(`表达式节点 ${exprWithChildren.id} 不能包含子条件`);
        }
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const visit = (node: AbacConditionNodeDto) => {
            const id = String(node.id ?? "");
            if (!id) {
                return;
            }
            if (visiting.has(id)) {
                throw new Error(`条件树存在循环引用：${id}`);
            }
            if (visited.has(id)) {
                return;
            }
            visiting.add(id);
            for (const child of byParent.get(id) ?? []) {
                visit(child);
            }
            visiting.delete(id);
            visited.add(id);
        };
        for (const root of rootNodes) {
            visit(root);
        }
        if (visited.size !== nodes.length) {
            const unreachable = nodes
                .filter((node) => !visited.has(String(node.id ?? "")))
                .map((node) => node.id)
                .join(", ");
            throw new Error(`条件树存在无法从根节点到达的节点：${unreachable}`);
        }
    }

    function compileLocalExpr(node: AbacConditionNodeDto) {
        const field = fields.value.find(
            (item) => item.key === node.leftPath && item.valueType === node.leftType,
        );
        const operator = String(node.operator ?? "");
        if (!field) {
            throw new Error(`字段不在 ABAC 白名单内：${node.leftType}:${node.leftPath}`);
        }
        if (!field.operators.includes(operator)) {
            throw new Error(`字段 ${field.key} 不支持操作符 ${operator}`);
        }
        if (operator === "EMPTY") {
            return compileEmptyCheck(field, true);
        }
        if (operator === "NOT_EMPTY") {
            return compileEmptyCheck(field, false);
        }
        return compileOperator(
            field.cerbosPath,
            operator,
            stringifyConstValue(node.rightValue, field, operator),
        );
    }

    function wrapMatches(matchType: MatchType, matches: CerbosMatch[]): CerbosMatch {
        if (matchType === "ANY") {
            return { any: { of: matches } };
        }
        if (matchType === "NONE") {
            return { none: { of: matches } };
        }
        return { all: { of: matches } };
    }

    function compileOperator(left: string, operator: string, right: string) {
        if (operator === "EQ") return `${left} == ${right}`;
        if (operator === "NE") return `${left} != ${right}`;
        if (operator === "GT") return `${left} > ${right}`;
        if (operator === "GTE") return `${left} >= ${right}`;
        if (operator === "LT") return `${left} < ${right}`;
        if (operator === "LTE") return `${left} <= ${right}`;
        if (operator === "IN") return `${left} in ${right}`;
        if (operator === "NOT_IN") return `!(${left} in ${right})`;
        if (operator === "CONTAINS") return `${right} in ${left}`;
        if (operator === "NOT_CONTAINS") return `!(${right} in ${left})`;
        throw new Error(`不支持的操作符：${operator}`);
    }

    function compileEmptyCheck(field: AbacFieldDto, empty: boolean) {
        const left = field.cerbosPath;
        if (field.dataType === "string" || field.dataType === "date") {
            return empty
                ? `(${left} == null || ${left} == "")`
                : `(${left} != null && ${left} != "")`;
        }
        if (field.dataType === "array" || field.dataType === "object") {
            return empty
                ? `(${left} == null || size(${left}) == 0)`
                : `(${left} != null && size(${left}) > 0)`;
        }
        return empty ? `${left} == null` : `${left} != null`;
    }

    function normalizeRightValue(
        node: ConditionNodeDraft,
        field: AbacFieldDto | null,
        operator: string,
    ) {
        if (usesArrayValue(operator)) {
            const values = parseArrayInput(node.rightValue);
            if (field?.dataType === "number") {
                return values.map((value) => normalizeNumberValue(value, field.key));
            }
            if (field?.dataType === "boolean") {
                return values.map((value) => normalizeBooleanValue(value, field.key));
            }
            return values;
        }
        if (field?.dataType === "number") {
            return normalizeNumberValue(node.rightValue, field.key);
        }
        if (field?.dataType === "boolean") {
            return normalizeBooleanValue(node.rightValue, field.key);
        }
        return node.rightValue ?? "";
    }

    function stringifyConstValue(value: unknown, field: AbacFieldDto, operator: string) {
        if (usesArrayValue(operator)) {
            const values = parseArrayInput(value);
            if (field.dataType === "number") {
                return JSON.stringify(values.map((item) => normalizeNumberValue(item, field.key)));
            }
            if (field.dataType === "boolean") {
                return JSON.stringify(values.map((item) => normalizeBooleanValue(item, field.key)));
            }
            return JSON.stringify(values);
        }
        if (field.dataType === "number") {
            return JSON.stringify(normalizeNumberValue(value, field.key));
        }
        if (field.dataType === "boolean") {
            return JSON.stringify(normalizeBooleanValue(value, field.key));
        }
        return JSON.stringify(value === null || value === undefined ? "" : String(value));
    }

    function normalizeNumberValue(value: unknown, fieldKey: string) {
        const numeric = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numeric)) {
            throw new Error(`字段 ${fieldKey} 需要数字常量`);
        }
        return numeric;
    }

    function normalizeBooleanValue(value: unknown, fieldKey: string) {
        if (typeof value === "boolean") {
            return value;
        }
        if (value === "true") {
            return true;
        }
        if (value === "false") {
            return false;
        }
        throw new Error(`字段 ${fieldKey} 需要布尔常量`);
    }

    function parseArrayInput(value: unknown) {
        if (Array.isArray(value)) {
            return value.map((item) => String(item).trim()).filter(Boolean);
        }
        return String(value ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function normalizeMatchType(value: unknown): MatchType {
        return value === "ANY" || value === "NONE" ? value : "ALL";
    }

    function safeCodeSegment(value: string) {
        return value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed";
    }

    watch(generationPreview, () => {
        refreshPreviewStamp();
    });

    watch(targetApp, () => {
        void reloadPolicyGroupTable();
    });
</script>

<style scoped lang="scss">
    .policy-modal {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .policy-workbench {
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .policy-workbench__split {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
    }

    .policy-workbench__split :deep(.arco-split-pane) {
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .policy-workbench__form {
        height: 100%;
        min-width: 0;
        overflow: auto;
        padding-right: 14px;
    }

    .policy-workbench__preview {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-width: 0;
        min-height: 0;
        gap: 12px;
        margin-left: 14px;
        padding: 14px;
        background: var(--color-bg-1);
        border: 1px solid var(--color-border-2);
        border-radius: 6px;
    }

    .policy-section {
        min-width: 0;
        padding: 16px;
        margin-bottom: 16px;
        background: var(--color-bg-1);
        border: 1px solid var(--color-border-2);
        border-radius: 6px;
    }

    .policy-section--tree {
        margin-bottom: 0;
    }

    .policy-section :deep(.arco-form-item-label) {
        white-space: nowrap;
    }

    .policy-section :deep(.arco-form-item-content) {
        min-width: 0;
    }

    .policy-section :deep(.arco-input-wrapper),
    .policy-section :deep(.arco-select-view),
    .policy-section :deep(.arco-radio-group) {
        max-width: 100%;
        min-width: 0;
    }

    .policy-section__header,
    .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
    }

    .policy-section__title,
    .preview-header__title {
        margin: 0;
    }

    .preview-header__text {
        min-width: 0;
    }

    .preview-switch {
        flex-shrink: 0;
    }

    .preview-alert {
        flex-shrink: 0;
    }

    .preview-code {
        flex: 1;
        min-height: 0;
    }

    .preview-code :deep(.code-viewer__editor) {
        min-height: 0;
    }

    .modal-footer {
        display: flex;
        flex-shrink: 0;
        justify-content: flex-end;
        padding-top: 12px;
        margin-top: 12px;
        border-top: 1px solid var(--color-border-2);
    }

    @media (max-width: 1180px) {
        .policy-workbench {
            overflow: auto;
        }

        .policy-workbench__split {
            min-width: 960px;
        }

        .policy-workbench__form {
            padding-right: 12px;
        }

        .policy-workbench__preview {
            margin-left: 12px;
        }
    }

    @media (max-width: 720px) {
        .policy-section__header,
        .preview-header {
            align-items: flex-start;
            flex-direction: column;
        }
    }
</style>
