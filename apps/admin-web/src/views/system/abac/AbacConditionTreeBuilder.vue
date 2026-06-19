<template>
    <a-tree
        :data="treeData"
        :field-names="treeFieldNames"
        v-model:expanded-keys="expandedKeys"
        blockNode
        :show-line="true"
        :animation="true"
        :selectable="false"
        class="condition-tree"
    >
        <template #title="{ draft, root: isRoot }">
            <a-alert
                v-if="isRoot || draft?.nodeType === 'GROUP'"
                :show-icon="false"
                class="condition-node-alert"
                @click.stop
            >
                <div class="condition-node condition-node--group">
                    <div class="condition-node__logic">
                        <a-select
                            :model-value="getGroupMatchValue(isRoot, draft)"
                            :options="matchOptions"
                            size="small"
                            class="condition-node__match"
                            :trigger-props="{
                                autoFitPopupWidth: false,
                                autoFitPopupMinWidth: true,
                            }"
                            @update:model-value="
                                (value) => updateGroupMatchValue(isRoot, draft, value)
                            "
                        />
                    </div>
                    <div
                        :class="[
                            'condition-node__actions',
                            isRoot
                                ? 'condition-node__actions--root'
                                : 'condition-node__actions--group',
                        ]"
                    >
                        <a-tooltip content="添加子条件">
                            <a-button
                                size="mini"
                                @click="addExprNode(getGroupParentId(isRoot, draft))"
                            >
                                <template #icon>
                                    <icon-plus />
                                </template>
                            </a-button>
                        </a-tooltip>
                        <a-tooltip content="添加子条件组">
                            <a-button
                                size="mini"
                                @click="addGroupNode(getGroupParentId(isRoot, draft))"
                            >
                                <template #icon>
                                    <icon-folder-add />
                                </template>
                            </a-button>
                        </a-tooltip>
                        <a-button
                            v-if="!isRoot && draft"
                            size="mini"
                            status="danger"
                            @click="removeNode(draft)"
                        >
                            <template #icon>
                                <icon-delete />
                            </template>
                        </a-button>
                    </div>
                </div>
            </a-alert>

            <div
                v-else-if="draft"
                class="condition-node condition-node--expr"
                @click.stop
            >
                <a-select
                    :model-value="draft.leftPath"
                    :options="fieldOptions"
                    allow-search
                    placeholder="请选择属性"
                    class="condition-node__field"
                    :trigger-props="{
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    }"
                    @update:model-value="(value) => updateField(draft, value)"
                />
                <a-select
                    :model-value="draft.operator"
                    :options="getOperatorOptions(draft)"
                    placeholder="请选择关系"
                    class="condition-node__operator"
                    :trigger-props="{
                        autoFitPopupWidth: false,
                        autoFitPopupMinWidth: true,
                    }"
                    @update:model-value="(value) => updateOperator(draft, value)"
                />
                <component
                    :is="getValueComponent(draft)"
                    v-if="!isValueFreeOperator(draft.operator)"
                    :model-value="getValueModel(draft)"
                    :options="getValueOptions(draft)"
                    :precision="0"
                    :allow-clear="true"
                    placeholder="请输入属性值"
                    class="condition-node__value"
                    :trigger-props="
                        getValueComponent(draft) === 'a-select'
                            ? {
                                  autoFitPopupWidth: false,
                                  autoFitPopupMinWidth: true,
                              }
                            : undefined
                    "
                    @update:model-value="(value: unknown) => updateValue(draft, value)"
                />
                <a-typography-text
                    v-else
                    type="secondary"
                    class="condition-node__empty"
                >
                    -
                </a-typography-text>
                <div class="condition-node__actions">
                    <a-button
                        size="mini"
                        status="danger"
                        @click="removeNode(draft)"
                    >
                        <template #icon>
                            <icon-delete />
                        </template>
                    </a-button>
                </div>
            </div>
        </template>
    </a-tree>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from "vue";

    defineOptions({ name: "AbacConditionTreeBuilder" });

    type AbacConditionMatchType = "ALL" | "ANY" | "NONE";
    type AbacConditionNodeType = "GROUP" | "EXPR";

    type AbacConditionNodeDraft = {
        id: string;
        parentId: string | null;
        nodeType: AbacConditionNodeType;
        matchType: AbacConditionMatchType;
        leftPath: string;
        operator: string;
        rightValue: unknown;
        sort: number;
    };

    type SelectOption = {
        label: string;
        value: string | boolean;
    };

    type ConditionTreeNode = {
        key: string;
        title: string;
        root?: boolean;
        isLeaf?: boolean;
        draft?: AbacConditionNodeDraft;
        children?: ConditionTreeNode[];
    };

    const props = withDefaults(
        defineProps<{
            nodes: AbacConditionNodeDraft[];
            parentId: string | null;
            matchType: AbacConditionMatchType;
            matchOptions: Array<{ label: string; value: AbacConditionMatchType }>;
            fieldOptions: SelectOption[];
            root?: boolean;
            addExprNode: (parentId?: string | null) => void;
            addGroupNode: (parentId?: string | null) => void;
            removeNode: (node: AbacConditionNodeDraft) => void;
            updateField: (node: AbacConditionNodeDraft, value: unknown) => void;
            updateOperator: (node: AbacConditionNodeDraft, value: unknown) => void;
            updateValue: (node: AbacConditionNodeDraft, value: unknown) => void;
            updateGroupMatch: (node: AbacConditionNodeDraft, value: AbacConditionMatchType) => void;
            getOperatorOptions: (node: AbacConditionNodeDraft) => SelectOption[];
            getValueComponent: (node: AbacConditionNodeDraft) => string;
            getValueOptions: (node: AbacConditionNodeDraft) => SelectOption[] | undefined;
            getValueModel: (node: AbacConditionNodeDraft) => unknown;
            isValueFreeOperator: (operator: string | null | undefined) => boolean;
        }>(),
        {
            root: false,
        },
    );

    const emit = defineEmits<{
        (event: "update-match-type", value: AbacConditionMatchType): void;
    }>();

    const rootKey = "__abac_root__";
    const treeFieldNames = {
        key: "key",
        title: "title",
        children: "children",
    };
    const expandedKeys = ref<Array<string | number>>([]);

    const treeData = computed<ConditionTreeNode[]>(() => [
        {
            key: rootKey,
            title: "",
            root: true,
            isLeaf: false,
            children: createTreeChildren(props.parentId ?? null),
        },
    ]);

    const expandableKeys = computed(() => [
        rootKey,
        ...props.nodes.filter((node) => node.nodeType === "GROUP").map((node) => node.id),
    ]);

    watch(
        expandableKeys,
        (keys, previousKeys = []) => {
            const currentKeys = new Set(keys);
            const previousKeySet = new Set(previousKeys);
            const preservedKeys = expandedKeys.value.filter((key) => currentKeys.has(String(key)));
            const newKeys = keys.filter((key) => !previousKeySet.has(key));
            expandedKeys.value = [...new Set([...preservedKeys, ...newKeys])];
        },
        { immediate: true },
    );

    function createTreeChildren(parentId: string | null): ConditionTreeNode[] {
        return props.nodes
            .filter((node) => (node.parentId ?? null) === parentId)
            .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))
            .map((node) => {
                const children =
                    node.nodeType === "GROUP" ? createTreeChildren(node.id) : undefined;
                const isLeaf = node.nodeType === "EXPR" || !children?.length;
                return {
                    key: node.id,
                    title: "",
                    draft: node,
                    isLeaf,
                    children,
                };
            });
    }

    function normalizeMatchType(value: unknown): AbacConditionMatchType {
        return value === "ANY" || value === "NONE" ? value : "ALL";
    }

    function getGroupMatchValue(
        isRoot: boolean,
        draft: AbacConditionNodeDraft | undefined,
    ): AbacConditionMatchType {
        return isRoot ? props.matchType : normalizeMatchType(draft?.matchType);
    }

    function updateGroupMatchValue(
        isRoot: boolean,
        draft: AbacConditionNodeDraft | undefined,
        value: unknown,
    ) {
        const matchType = normalizeMatchType(value);
        if (isRoot) {
            emit("update-match-type", matchType);
            return;
        }
        if (draft) {
            props.updateGroupMatch(draft, matchType);
        }
    }

    function getGroupParentId(
        isRoot: boolean,
        draft: AbacConditionNodeDraft | undefined,
    ): string | null {
        return isRoot ? props.parentId : (draft?.id ?? null);
    }
</script>

<style scoped lang="scss">
    .condition-tree {
        padding: 10px 8px;
        background: var(--color-bg-1);
        border: 1px solid var(--color-border-2);
        border-radius: 6px;
    }

    .condition-tree :deep(.arco-tree-node-title) {
        flex: 1;
        min-width: 0;
    }

    .condition-tree :deep(.arco-tree-node-title-text) {
        width: 100%;
        min-width: 0;
        white-space: nowrap;
    }

    .condition-node-alert {
        width: 100%;
        min-width: 0;
    }

    .condition-node-alert :deep(.arco-alert-body),
    .condition-node-alert :deep(.arco-alert-content) {
        width: 100%;
        min-width: 0;
    }

    .condition-node {
        display: grid;
        align-items: center;
        width: 100%;
        min-width: 0;
        gap: 8px;
        padding: 6px 4px;
    }

    .condition-node--group {
        grid-template-columns: minmax(180px, 1fr) auto;
    }

    .condition-node--expr {
        grid-template-columns:
            minmax(190px, 0.9fr) minmax(150px, 0.7fr) minmax(220px, 1.2fr)
            104px;
    }

    .condition-node__logic {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .condition-node__match {
        width: auto;
        min-width: 96px;
        flex: 1 1 auto;
    }

    .condition-node__field,
    .condition-node__operator,
    .condition-node__value {
        width: 100%;
        min-width: 0;
    }

    .condition-node__empty {
        display: flex;
        align-items: center;
        height: 32px;
    }

    .condition-node__actions {
        display: grid;
        grid-template-columns: 32px;
        gap: 4px;
        justify-content: end;
    }

    .condition-node__actions--root {
        grid-template-columns: repeat(2, 32px);
    }

    .condition-node__actions--group {
        grid-template-columns: repeat(3, 32px);
    }

    @media (max-width: 1180px) {
        .condition-node--expr {
            grid-template-columns: 1fr 1fr;
        }

        .condition-node__actions {
            justify-content: start;
        }
    }

    @media (max-width: 760px) {
        .condition-node--root,
        .condition-node--group,
        .condition-node--expr {
            grid-template-columns: 1fr;
        }
    }
</style>
