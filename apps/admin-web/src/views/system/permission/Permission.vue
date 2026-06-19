<template>
    <GiPageLayout>
        <a-space
            direction="vertical"
            fill
        >
            <a-page-header :show-back="false">
                <template #title>权限管理</template>
                <template #subtitle>SpiceDB 实体权限</template>
                <template #extra>
                    <a-space size="small">
                        <a-button
                            type="primary"
                            size="small"
                            :disabled="!canSaveAnyMatrixChanges"
                            :loading="matrixPreviewLoading || matrixApplyLoading"
                            @click="saveAllMatrixChanges"
                        >
                            <template #icon>
                                <icon-save />
                            </template>
                            保存全部
                        </a-button>
                        <a-button
                            size="small"
                            :loading="loading"
                            @click="reloadMatrix"
                        >
                            <template #icon>
                                <icon-refresh />
                            </template>
                            刷新
                        </a-button>
                    </a-space>
                </template>
            </a-page-header>

            <a-card :bordered="false">
                <a-space
                    direction="vertical"
                    fill
                >
                    <a-radio-group
                        v-model="viewMode"
                        type="button"
                        size="small"
                    >
                        <a-radio value="entity">按实体</a-radio>
                        <a-radio value="role">按角色</a-radio>
                    </a-radio-group>

                    <a-spin
                        :loading="loading"
                        style="display: block; width: 100%"
                    >
                        <a-row
                            v-if="viewMode === 'entity'"
                            :gutter="[16, 16]"
                            style="width: 100%"
                        >
                            <a-col
                                :xs="24"
                                :md="7"
                                :lg="5"
                            >
                                <a-space
                                    direction="vertical"
                                    fill
                                >
                                    <a-input
                                        v-model="entityKeyword"
                                        allow-clear
                                        size="small"
                                        placeholder="搜索实体"
                                    >
                                        <template #prefix>
                                            <icon-search />
                                        </template>
                                    </a-input>
                                    <a-menu
                                        :selected-keys="selectedDefinitionMenuKeys"
                                        @menu-item-click="selectDefinition"
                                    >
                                        <a-menu-item
                                            v-for="definition in filteredDefinitions"
                                            :key="definition.name"
                                        >
                                            <a-space size="mini">
                                                <a-tag
                                                    size="small"
                                                    :color="
                                                        definition.configurable ? 'green' : 'gray'
                                                    "
                                                >
                                                    {{
                                                        definition.configurable ? "可授权" : "只读"
                                                    }}
                                                </a-tag>
                                                <span>{{ definition.displayName }}</span>
                                            </a-space>
                                        </a-menu-item>
                                    </a-menu>
                                </a-space>
                            </a-col>

                            <a-col
                                :xs="24"
                                :md="17"
                                :lg="19"
                            >
                                <a-space
                                    direction="vertical"
                                    fill
                                >
                                    <a-card
                                        v-if="selectedDefinition"
                                        :title="selectedDefinition.displayName"
                                    >
                                        <template #extra>
                                            <a-button
                                                size="small"
                                                @click="
                                                    openResourceRenameDialog(selectedDefinition)
                                                "
                                            >
                                                <template #icon>
                                                    <icon-edit />
                                                </template>
                                                重命名
                                            </a-button>
                                        </template>
                                        <a-space size="mini">
                                            <a-tag>{{ selectedDefinition.name }}</a-tag>
                                            <a-tag
                                                :color="
                                                    selectedDefinition.configurable
                                                        ? 'green'
                                                        : 'gray'
                                                "
                                            >
                                                {{
                                                    selectedDefinition.configurable
                                                        ? "核心 manager"
                                                        : "schema permission"
                                                }}
                                            </a-tag>
                                        </a-space>
                                    </a-card>

                                    <a-list
                                        v-if="entityRows.length"
                                        :bordered="false"
                                    >
                                        <a-list-item
                                            v-for="row in entityRows"
                                            :key="row.key"
                                        >
                                            <a-row
                                                :gutter="[12, 12]"
                                                align="center"
                                            >
                                                <a-col
                                                    :xs="24"
                                                    :md="15"
                                                >
                                                    <a-space
                                                        direction="vertical"
                                                        fill
                                                        :size="4"
                                                    >
                                                        <a-space
                                                            size="mini"
                                                            wrap
                                                        >
                                                            <a-tag
                                                                size="small"
                                                                :color="
                                                                    row.kind === 'assignable'
                                                                        ? 'arcoblue'
                                                                        : 'gray'
                                                                "
                                                            >
                                                                {{
                                                                    row.kind === "assignable"
                                                                        ? "relation"
                                                                        : row.kind
                                                                }}
                                                            </a-tag>
                                                            <a-typography-text code>
                                                                {{ row.name }}
                                                            </a-typography-text>
                                                            <a-typography-text
                                                                v-if="row.label"
                                                                type="secondary"
                                                            >
                                                                {{ row.label }}
                                                            </a-typography-text>
                                                        </a-space>
                                                        <a-typography-paragraph
                                                            v-if="row.expression"
                                                            code
                                                            copyable
                                                        >
                                                            {{ row.expression }}
                                                        </a-typography-paragraph>
                                                    </a-space>
                                                </a-col>
                                                <a-col
                                                    :xs="24"
                                                    :md="9"
                                                >
                                                    <a-space
                                                        v-if="row.kind === 'assignable'"
                                                        wrap
                                                    >
                                                        <a-select
                                                            :model-value="
                                                                getEntityDraftRoleIds(row)
                                                            "
                                                            multiple
                                                            allow-clear
                                                            size="small"
                                                            :max-tag-count="3"
                                                            style="width: 280px; max-width: 100%"
                                                            :trigger-props="{
                                                                autoFitPopupWidth: false,
                                                                autoFitPopupMinWidth: true,
                                                            }"
                                                            :disabled="isMatrixBusy"
                                                            @change="
                                                                setEntityDraftRoleIds(row, $event)
                                                            "
                                                        >
                                                            <a-option
                                                                v-for="role in roles"
                                                                :key="role.id"
                                                                :value="role.id"
                                                                :disabled="
                                                                    !row.editableRoleIds.includes(
                                                                        role.id,
                                                                    )
                                                                "
                                                            >
                                                                {{ role.name }} / {{ role.code }}
                                                            </a-option>
                                                        </a-select>
                                                        <a-button
                                                            type="primary"
                                                            size="small"
                                                            :disabled="!canSaveEntityRelation(row)"
                                                            :loading="isEntityRelationSaving(row)"
                                                            @click="saveEntityRelation(row)"
                                                        >
                                                            <template #icon>
                                                                <icon-save />
                                                            </template>
                                                            保存
                                                        </a-button>
                                                    </a-space>
                                                    <a-tag
                                                        v-else
                                                        color="gray"
                                                    >
                                                        只读
                                                    </a-tag>
                                                </a-col>
                                            </a-row>
                                        </a-list-item>
                                    </a-list>
                                    <a-empty
                                        v-else
                                        description="暂无实体权限"
                                    />
                                </a-space>
                            </a-col>
                        </a-row>

                        <a-row
                            v-else
                            :gutter="[16, 16]"
                            style="width: 100%"
                        >
                            <a-col
                                :xs="24"
                                :md="7"
                                :lg="5"
                            >
                                <a-space
                                    direction="vertical"
                                    fill
                                >
                                    <a-input
                                        v-model="roleKeyword"
                                        allow-clear
                                        size="small"
                                        placeholder="搜索角色"
                                    >
                                        <template #prefix>
                                            <icon-search />
                                        </template>
                                    </a-input>
                                    <a-menu
                                        :selected-keys="selectedRoleMenuKeys"
                                        @menu-item-click="selectRole"
                                    >
                                        <a-menu-item
                                            v-for="role in filteredRoles"
                                            :key="String(role.id)"
                                        >
                                            <a-space size="mini">
                                                <a-tag
                                                    size="small"
                                                    :color="
                                                        role.status === RoleStatus.ENABLE
                                                            ? 'arcoblue'
                                                            : 'red'
                                                    "
                                                >
                                                    {{
                                                        role.status === RoleStatus.ENABLE
                                                            ? "启用"
                                                            : "禁用"
                                                    }}
                                                </a-tag>
                                                <span>{{ role.name }}</span>
                                            </a-space>
                                        </a-menu-item>
                                    </a-menu>
                                </a-space>
                            </a-col>

                            <a-col
                                :xs="24"
                                :md="17"
                                :lg="19"
                            >
                                <a-space
                                    direction="vertical"
                                    fill
                                >
                                    <a-card
                                        v-if="selectedRole"
                                        :title="selectedRole.name"
                                    >
                                        <a-space size="mini">
                                            <a-tag>{{ selectedRole.code }}</a-tag>
                                            <a-tag
                                                :color="
                                                    selectedRole.status === RoleStatus.ENABLE
                                                        ? 'arcoblue'
                                                        : 'red'
                                                "
                                            >
                                                {{
                                                    selectedRole.status === RoleStatus.ENABLE
                                                        ? "启用"
                                                        : "禁用"
                                                }}
                                            </a-tag>
                                        </a-space>
                                    </a-card>

                                    <a-list
                                        v-if="selectedRole"
                                        :bordered="false"
                                    >
                                        <a-list-item
                                            v-for="module in modules"
                                            :key="module.resourceType"
                                        >
                                            <a-space
                                                direction="vertical"
                                                fill
                                            >
                                                <a-row
                                                    :gutter="[12, 12]"
                                                    align="center"
                                                    justify="space-between"
                                                >
                                                    <a-col
                                                        :xs="24"
                                                        :md="18"
                                                    >
                                                        <a-space
                                                            direction="vertical"
                                                            :size="4"
                                                        >
                                                            <a-typography-title :heading="6">
                                                                {{ module.displayName }}
                                                            </a-typography-title>
                                                            <SpiceDBObjectText
                                                                :type="module.resourceType"
                                                                id="default"
                                                                :label="module.resourceType"
                                                                copyable
                                                            />
                                                        </a-space>
                                                    </a-col>
                                                    <a-col
                                                        :xs="24"
                                                        :md="6"
                                                    >
                                                        <a-button
                                                            type="primary"
                                                            size="small"
                                                            :disabled="!canSaveRoleModule(module)"
                                                            :loading="
                                                                roleModuleSaving[
                                                                    module.resourceType
                                                                ] === true
                                                            "
                                                            @click="saveRoleModule(module)"
                                                        >
                                                            <template #icon>
                                                                <icon-save />
                                                            </template>
                                                            保存模块
                                                        </a-button>
                                                    </a-col>
                                                </a-row>
                                                <a-checkbox-group
                                                    v-model="
                                                        roleRelationDrafts[module.resourceType]
                                                    "
                                                    :disabled="isMatrixBusy"
                                                    @change="
                                                        setRoleModuleDraftRelations(module, $event)
                                                    "
                                                >
                                                    <a-space wrap>
                                                        <a-checkbox
                                                            v-for="relation in module.relations"
                                                            :key="relation.relation"
                                                            :value="relation.relation"
                                                            :disabled="
                                                                !isSelectedRoleRelationEditable(
                                                                    module.resourceType,
                                                                    relation.relation,
                                                                )
                                                            "
                                                        >
                                                            <a-space size="mini">
                                                                <span>{{ relation.label }}</span>
                                                                <a-tag size="small">
                                                                    {{ relation.relation }}
                                                                </a-tag>
                                                            </a-space>
                                                        </a-checkbox>
                                                    </a-space>
                                                </a-checkbox-group>
                                            </a-space>
                                        </a-list-item>
                                    </a-list>
                                    <a-empty
                                        v-else
                                        description="暂无角色"
                                    />
                                </a-space>
                            </a-col>
                        </a-row>
                    </a-spin>
                </a-space>
            </a-card>

            <a-modal
                v-model:visible="resourceRenameVisible"
                title="重命名实体展示名"
                unmount-on-close
                :mask-closable="!resourceRenameSaving"
                :esc-to-close="!resourceRenameSaving"
            >
                <form-create
                    :model-value="resourceRenameForm"
                    :rule="resourceRenameRules"
                    :option="resourceRenameOptions"
                    @update:model-value="syncResourceRenameForm"
                />
                <template #footer>
                    <a-space>
                        <a-button
                            :disabled="resourceRenameSaving"
                            @click="closeResourceRenameDialog"
                        >
                            取消
                        </a-button>
                        <a-button
                            type="primary"
                            :disabled="!canSaveResourceDisplayName"
                            :loading="resourceRenameSaving"
                            @click="saveResourceDisplayName"
                        >
                            保存
                        </a-button>
                    </a-space>
                </template>
            </a-modal>

            <a-modal
                v-model:visible="matrixPreviewVisible"
                title="保存权限矩阵变更"
                :mask-closable="!matrixApplyLoading"
                :esc-to-close="!matrixApplyLoading"
                @cancel="closeMatrixPreviewDialog"
            >
                <a-space
                    v-if="matrixPreview"
                    direction="vertical"
                    fill
                >
                    <a-alert
                        v-if="matrixPreview.requiresConfirmation"
                        type="warning"
                        show-icon
                    >
                        本次变更影响较大，需要二次确认后才能保存。
                    </a-alert>
                    <a-descriptions
                        :column="2"
                        size="small"
                        bordered
                    >
                        <a-descriptions-item label="新增 tuple">
                            {{ matrixPreview.createCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="删除 tuple">
                            {{ matrixPreview.deleteCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="影响角色">
                            {{ matrixPreview.affectedRoleCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="影响用户估算">
                            {{ matrixPreview.affectedUserEstimate }}
                        </a-descriptions-item>
                        <a-descriptions-item label="影响用户组">
                            {{ matrixPreview.affectedGroupCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="直接用户授权">
                            {{ matrixPreview.directUserAssignmentCount }}
                        </a-descriptions-item>
                        <a-descriptions-item label="精确用户数">
                            {{ matrixPreview.affectedUserCount ?? "未分析" }}
                        </a-descriptions-item>
                    </a-descriptions>
                    <a-button
                        v-if="matrixPreview.impactMode === 'summary'"
                        size="small"
                        :loading="matrixPreciseLoading"
                        @click="analyzeMatrixPreciseImpact"
                    >
                        精确分析
                    </a-button>
                    <a-space
                        v-if="matrixPreview.affectedRolesSample.length"
                        direction="vertical"
                        size="mini"
                    >
                        <a-typography-text type="secondary">角色样例</a-typography-text>
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-tag
                                v-for="role in matrixPreview.affectedRolesSample"
                                :key="role.id"
                            >
                                {{ role.name }} / {{ role.code }}
                            </a-tag>
                        </a-space>
                    </a-space>
                    <a-space
                        v-if="matrixPreview.affectedUsersSample.length"
                        direction="vertical"
                        size="mini"
                    >
                        <a-typography-text type="secondary">用户样例</a-typography-text>
                        <a-space
                            wrap
                            size="mini"
                        >
                            <a-tag
                                v-for="user in matrixPreview.affectedUsersSample"
                                :key="user.id"
                            >
                                {{ user.name || user.username || user.id }}
                            </a-tag>
                        </a-space>
                    </a-space>
                </a-space>
                <template #footer>
                    <a-space>
                        <a-button
                            :disabled="matrixApplyLoading"
                            @click="closeMatrixPreviewDialog"
                        >
                            取消
                        </a-button>
                        <a-button
                            type="primary"
                            :loading="matrixApplyLoading"
                            :disabled="matrixPreciseLoading"
                            @click="confirmMatrixApply"
                        >
                            {{ matrixPreview?.requiresConfirmation ? "确认保存" : "保存" }}
                        </a-button>
                    </a-space>
                </template>
            </a-modal>
        </a-space>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        applyAuthzPermissionMatrixApi,
        getAuthzPermissionMatrixApi,
        previewAuthzPermissionMatrixApi,
        renameAuthzPermissionResourceApi,
        type AuthzPermissionMatrixChangeDto,
        type AuthzPermissionManagerModuleDto,
        type AuthzPermissionMatrixDto,
        type AuthzPermissionMatrixPreviewDto,
        type AuthzPermissionRelationAssignmentDto,
        type AuthzPermissionRoleDto,
        type AuthzPermissionSchemaDefinitionDto,
        type RoleCoreManagerRelation,
        type RoleCoreManagerResourceType,
    } from "@/api/authz-permission";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import SpiceDBObjectText from "@/components/SpiceDBObjectText.vue";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { Message } from "@arco-design/web-vue";
    import { computed, onMounted, reactive, ref } from "vue";

    defineOptions({
        name: "Permission",
    });

    enum RoleStatus {
        DISABLE = "DISABLE",
        ENABLE = "ENABLE",
    }

    type ViewMode = "entity" | "role";

    type EntityPermissionRow =
        | {
              key: string;
              kind: "assignable";
              name: RoleCoreManagerRelation;
              label: string;
              resourceType: RoleCoreManagerResourceType;
              relation: RoleCoreManagerRelation;
              roleIds: number[];
              editableRoleIds: number[];
              expression: string;
          }
        | {
              key: string;
              kind: "relation" | "permission";
              name: string;
              label?: string;
              expression: string;
          };

    const viewMode = ref<ViewMode>("entity");
    const loading = ref(false);
    const entityKeyword = ref("");
    const roleKeyword = ref("");
    const selectedDefinitionName = ref("");
    const selectedRoleId = ref<number | null>(null);
    const definitions = ref<AuthzPermissionSchemaDefinitionDto[]>([]);
    const roles = ref<AuthzPermissionRoleDto[]>([]);
    const modules = ref<AuthzPermissionManagerModuleDto[]>([]);
    const entityDraftRoleIds = reactive<Record<string, number[]>>({});
    const entityRelationSaving = reactive<Record<string, boolean>>({});
    const roleRelationDrafts = reactive<
        Partial<Record<RoleCoreManagerResourceType, RoleCoreManagerRelation[]>>
    >({});
    const roleModuleSaving = reactive<Partial<Record<RoleCoreManagerResourceType, boolean>>>({});
    const matrixPreviewVisible = ref(false);
    const matrixPreviewLoading = ref(false);
    const matrixPreciseLoading = ref(false);
    const matrixApplyLoading = ref(false);
    const matrixPreview = ref<AuthzPermissionMatrixPreviewDto | null>(null);
    const pendingMatrixChanges = ref<AuthzPermissionMatrixChangeDto[]>([]);
    const pendingMatrixSuccessMessage = ref("");
    const resourceRenameVisible = ref(false);
    const resourceRenameSaving = ref(false);
    const resourceRenameForm = reactive({
        resourceType: "",
        displayName: "",
    });
    const resourceRenameOptions: FormCreateOptions = {
        form: { layout: "vertical" },
        row: { gutter: 12 },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };
    const resourceRenameRules: FormCreateRule[] = [
        {
            field: "resourceType",
            title: "实体 ID",
            type: "input",
            props: {
                allowClear: true,
                disabled: true,
                placeholder: "请输入实体 ID",
            },
            col: { span: 24 },
        },
        {
            field: "displayName",
            title: "展示名",
            type: "input",
            props: {
                allowClear: true,
                maxLength: 191,
                placeholder: "请输入展示名",
            },
            col: { span: 24 },
        },
    ];

    function syncResourceRenameForm(value: Partial<typeof resourceRenameForm>) {
        Object.assign(resourceRenameForm, value);
    }

    const filteredDefinitions = computed(() => {
        const keyword = normalizeKeyword(entityKeyword.value);
        if (!keyword) {
            return definitions.value;
        }
        return definitions.value.filter((definition) =>
            [
                definition.name,
                definition.displayName,
                ...definition.relations.map((relation) => relation.name),
                ...definition.permissions.map((permission) => permission.name),
            ]
                .filter(Boolean)
                .some((value) => normalizeKeyword(String(value)).includes(keyword)),
        );
    });

    const filteredRoles = computed(() => {
        const keyword = normalizeKeyword(roleKeyword.value);
        if (!keyword) {
            return roles.value;
        }
        return roles.value.filter((role) =>
            [role.name, role.code, role.description, role.id]
                .filter((value) => value !== null && value !== undefined)
                .some((value) => normalizeKeyword(String(value)).includes(keyword)),
        );
    });

    /**
     * 生成 Arco Menu 所需的实体选中 key 数组。
     */
    const selectedDefinitionMenuKeys = computed(() =>
        selectedDefinitionName.value ? [selectedDefinitionName.value] : [],
    );

    /**
     * 生成 Arco Menu 所需的角色选中 key 数组。
     */
    const selectedRoleMenuKeys = computed(() =>
        selectedRoleId.value ? [String(selectedRoleId.value)] : [],
    );

    const selectedDefinition = computed(
        () =>
            definitions.value.find(
                (definition) => definition.name === selectedDefinitionName.value,
            ) ?? null,
    );

    const selectedModule = computed(
        () =>
            modules.value.find(
                (module) => module.resourceType === selectedDefinition.value?.name,
            ) ?? null,
    );

    const selectedRole = computed(
        () => roles.value.find((role) => role.id === selectedRoleId.value) ?? null,
    );

    /**
     * 判断权限矩阵是否处于预览或保存中。
     */
    const isMatrixBusy = computed(
        () => matrixPreviewLoading.value || matrixPreciseLoading.value || matrixApplyLoading.value,
    );

    /**
     * 判断当前页面是否存在可批量保存的矩阵草稿。
     */
    const canSaveAnyMatrixChanges = computed(() => buildAllSavableMatrixChanges().length > 0);

    /**
     * 判断实体展示名是否发生了可保存的有效变化。
     */
    const canSaveResourceDisplayName = computed(() => {
        const nextDisplayName = resourceRenameForm.displayName.trim();
        const definition = definitions.value.find(
            (item) => item.name === resourceRenameForm.resourceType,
        );
        return Boolean(definition && nextDisplayName && nextDisplayName !== definition.displayName);
    });

    const entityRows = computed<EntityPermissionRow[]>(() => {
        const definition = selectedDefinition.value;
        if (!definition) {
            return [];
        }

        if (definition.configurable && selectedModule.value) {
            return [
                ...selectedModule.value.relations.map((relation) => ({
                    key: createManagerRelationKey(
                        selectedModule.value!.resourceType,
                        relation.relation,
                    ),
                    kind: "assignable" as const,
                    name: relation.relation,
                    label: relation.label,
                    resourceType: selectedModule.value!.resourceType,
                    relation: relation.relation,
                    roleIds: relation.roleIds,
                    editableRoleIds: relation.editableRoleIds,
                    expression: `${definition.name}:${"default"}#${relation.relation}@role`,
                })),
                ...definition.permissions.map((permission) => ({
                    key: `${definition.name}:permission:${permission.name}`,
                    kind: "permission" as const,
                    name: permission.name,
                    expression: permission.expression,
                })),
            ];
        }

        return [
            ...definition.relations.map((relation) => ({
                key: `${definition.name}:relation:${relation.name}`,
                kind: "relation" as const,
                name: relation.name,
                expression: relation.targets
                    .map(
                        (target) => `${target.type}${target.relation ? `#${target.relation}` : ""}`,
                    )
                    .join(" | "),
            })),
            ...definition.permissions.map((permission) => ({
                key: `${definition.name}:permission:${permission.name}`,
                kind: "permission" as const,
                name: permission.name,
                expression: permission.expression,
            })),
        ];
    });

    /**
     * 初始化权限管理页数据。
     */
    onMounted(async () => {
        await reloadMatrix();
    });

    /**
     * 从后端重新加载权限矩阵。
     */
    async function reloadMatrix() {
        loading.value = true;
        try {
            const response = await getAuthzPermissionMatrixApi();
            applyMatrix(response.data);
        } catch (error) {
            Message.error("权限矩阵加载失败，请稍后重试");
            console.error("[Permission] reloadMatrix failed", error);
        } finally {
            loading.value = false;
        }
    }

    /**
     * 应用后端返回的新矩阵，并保持当前实体和角色焦点可用。
     */
    function applyMatrix(matrix: AuthzPermissionMatrixDto) {
        definitions.value = matrix.definitions;
        roles.value = matrix.roles;
        modules.value = matrix.modules;
        syncEntityDrafts();
        ensureSelectedDefinition();
        ensureSelectedRole();
        syncSelectedRoleDrafts();
    }

    /**
     * 选择左侧实体并同步实体视图焦点。
     */
    function selectDefinition(definitionName: string) {
        selectedDefinitionName.value = definitionName;
    }

    /**
     * 打开实体展示名重命名弹窗，并把当前实体信息写入表单。
     */
    function openResourceRenameDialog(definition: AuthzPermissionSchemaDefinitionDto) {
        resourceRenameForm.resourceType = definition.name;
        resourceRenameForm.displayName = definition.displayName;
        resourceRenameVisible.value = true;
    }

    /**
     * 关闭实体展示名重命名弹窗。
     */
    function closeResourceRenameDialog() {
        if (resourceRenameSaving.value) {
            return;
        }
        resourceRenameVisible.value = false;
    }

    /**
     * 保存实体展示名，并用后端返回的新矩阵刷新页面。
     */
    async function saveResourceDisplayName() {
        if (!canSaveResourceDisplayName.value) {
            return;
        }

        resourceRenameSaving.value = true;
        try {
            const response = await renameAuthzPermissionResourceApi({
                resourceType: resourceRenameForm.resourceType,
                displayName: resourceRenameForm.displayName.trim(),
            });
            applyMatrix(response.data);
            resourceRenameVisible.value = false;
            Message.success("实体展示名已更新");
        } finally {
            resourceRenameSaving.value = false;
        }
    }

    /**
     * 选择左侧角色并刷新该角色的 checkbox 草稿。
     */
    function selectRole(roleId: string | number) {
        selectedRoleId.value = Number(roleId);
        syncSelectedRoleDrafts();
    }

    /**
     * 保存当前页面全部可提交的权限矩阵草稿。
     */
    async function saveAllMatrixChanges() {
        const changes = buildAllSavableMatrixChanges();
        if (changes.length === 0) {
            return;
        }
        await previewMatrixChanges(changes, "权限矩阵已更新");
    }

    /**
     * 保存实体视图中单个 manager relation 的角色集合。
     */
    async function saveEntityRelation(row: Extract<EntityPermissionRow, { kind: "assignable" }>) {
        if (!canSaveEntityRelation(row)) {
            return;
        }

        const key = createManagerRelationKey(row.resourceType, row.relation);
        entityRelationSaving[key] = true;
        try {
            await previewMatrixChanges(
                [
                    createMatrixChange(
                        row.resourceType,
                        row.relation,
                        row.roleIds,
                        getEntityDraftRoleIds(row),
                    ),
                ],
                "权限已更新",
            );
        } finally {
            entityRelationSaving[key] = false;
        }
    }

    /**
     * 保存角色视图中当前角色在单个 manager 模块下的关系勾选。
     */
    async function saveRoleModule(module: AuthzPermissionManagerModuleDto) {
        const role = selectedRole.value;
        if (!role || !canSaveRoleModule(module)) {
            return;
        }

        roleModuleSaving[module.resourceType] = true;
        try {
            const changes = getChangedRoleModuleRelations(module)
                .filter((relation) =>
                    isSelectedRoleRelationEditable(module.resourceType, relation.relation),
                )
                .map((relation) =>
                    createMatrixChange(
                        module.resourceType,
                        relation.relation,
                        relation.roleIds,
                        getRelationDraftRoleIds(
                            module.resourceType,
                            relation.relation,
                            relation.roleIds,
                        ),
                    ),
                );
            await previewMatrixChanges(changes, "角色权限已更新");
        } finally {
            roleModuleSaving[module.resourceType] = false;
        }
    }

    /**
     * 预览权限矩阵变更并打开确认弹窗。
     */
    async function previewMatrixChanges(
        changes: AuthzPermissionMatrixChangeDto[],
        successMessage: string,
    ) {
        const normalizedChanges = changes.filter(
            (change) => getChangedRoleIds(change.previousRoleIds, change.nextRoleIds).length > 0,
        );
        if (normalizedChanges.length === 0) {
            return;
        }

        matrixPreviewLoading.value = true;
        try {
            const response = await previewAuthzPermissionMatrixApi({
                changes: normalizedChanges,
                impactMode: "summary",
            });
            matrixPreview.value = response.data;
            pendingMatrixChanges.value = response.data.normalizedChanges.map((change) =>
                createMatrixChange(
                    change.resourceType,
                    change.relation,
                    change.previousRoleIds,
                    change.nextRoleIds,
                ),
            );
            pendingMatrixSuccessMessage.value = successMessage;
            matrixPreviewVisible.value = true;
        } catch (error) {
            Message.error("权限矩阵预览失败，已重新加载最新数据");
            console.error("[Permission] previewMatrixChanges failed", error);
            await reloadMatrix();
        } finally {
            matrixPreviewLoading.value = false;
        }
    }

    /**
     * 确认应用已经预览过的权限矩阵变更。
     */
    async function confirmMatrixApply() {
        if (!matrixPreview.value || pendingMatrixChanges.value.length === 0) {
            return;
        }

        matrixApplyLoading.value = true;
        try {
            const response = await applyAuthzPermissionMatrixApi({
                changes: pendingMatrixChanges.value,
                confirmedLargeChange: matrixPreview.value.requiresConfirmation ? true : undefined,
            });
            applyMatrix(response.data);
            matrixPreviewVisible.value = false;
            Message.success(pendingMatrixSuccessMessage.value || "权限矩阵已更新");
        } catch (error) {
            Message.error("权限矩阵保存失败，已重新加载最新数据");
            console.error("[Permission] confirmMatrixApply failed", error);
            await reloadMatrix();
        } finally {
            matrixApplyLoading.value = false;
        }
    }

    /**
     * 对已预览的矩阵变更执行精确用户影响分析，仅在用户主动点击时展开查询。
     */
    async function analyzeMatrixPreciseImpact() {
        if (!matrixPreview.value || pendingMatrixChanges.value.length === 0) {
            return;
        }

        matrixPreciseLoading.value = true;
        try {
            const response = await previewAuthzPermissionMatrixApi({
                changes: pendingMatrixChanges.value,
                impactMode: "precise",
            });
            matrixPreview.value = response.data;
            pendingMatrixChanges.value = response.data.normalizedChanges.map((change) =>
                createMatrixChange(
                    change.resourceType,
                    change.relation,
                    change.previousRoleIds,
                    change.nextRoleIds,
                ),
            );
        } catch (error) {
            Message.error("精确影响分析失败，已重新加载最新数据");
            console.error("[Permission] analyzeMatrixPreciseImpact failed", error);
            await reloadMatrix();
            closeMatrixPreviewDialog();
        } finally {
            matrixPreciseLoading.value = false;
        }
    }

    /**
     * 关闭权限矩阵预览弹窗并清空待保存快照。
     */
    function closeMatrixPreviewDialog() {
        if (matrixApplyLoading.value || matrixPreciseLoading.value) {
            return;
        }
        matrixPreviewVisible.value = false;
        matrixPreview.value = null;
        pendingMatrixChanges.value = [];
        pendingMatrixSuccessMessage.value = "";
    }

    /**
     * 判断实体 relation 是否正在保存。
     */
    function isEntityRelationSaving(row: Extract<EntityPermissionRow, { kind: "assignable" }>) {
        return (
            entityRelationSaving[createManagerRelationKey(row.resourceType, row.relation)] ===
                true || isMatrixBusy.value
        );
    }

    /**
     * 读取实体 relation 当前草稿角色集合。
     */
    function getEntityDraftRoleIds(row: Extract<EntityPermissionRow, { kind: "assignable" }>) {
        return getRelationDraftRoleIds(row.resourceType, row.relation, row.roleIds);
    }

    /**
     * 读取指定 manager relation 当前草稿角色集合。
     */
    function getRelationDraftRoleIds(
        resourceType: RoleCoreManagerResourceType,
        relation: RoleCoreManagerRelation,
        fallbackRoleIds: number[],
    ) {
        return (
            entityDraftRoleIds[createManagerRelationKey(resourceType, relation)] ?? [
                ...fallbackRoleIds,
            ]
        );
    }

    /**
     * 更新实体 relation 的本地角色草稿。
     */
    function setEntityDraftRoleIds(
        row: Extract<EntityPermissionRow, { kind: "assignable" }>,
        value: unknown,
    ) {
        entityDraftRoleIds[createManagerRelationKey(row.resourceType, row.relation)] =
            normalizeRoleIds(Array.isArray(value) ? value.map((item) => Number(item)) : []);
        syncSelectedRoleDrafts();
    }

    /**
     * 更新角色视图中单个模块的关系草稿，并同步到底层 relation 角色集合草稿。
     */
    function setRoleModuleDraftRelations(module: AuthzPermissionManagerModuleDto, value: unknown) {
        const role = selectedRole.value;
        if (!role) {
            return;
        }

        const draftRelations = Array.isArray(value) ? value.map((item) => String(item)) : [];
        const draftRelationSet = new Set(draftRelations);
        roleRelationDrafts[module.resourceType] = module.relations
            .filter((relation) => draftRelationSet.has(relation.relation))
            .map((relation) => relation.relation);

        for (const relation of module.relations) {
            if (!isSelectedRoleRelationEditable(module.resourceType, relation.relation)) {
                continue;
            }
            const key = createManagerRelationKey(module.resourceType, relation.relation);
            const currentRoleIds = getRelationDraftRoleIds(
                module.resourceType,
                relation.relation,
                relation.roleIds,
            );
            const shouldAssign = draftRelationSet.has(relation.relation);
            entityDraftRoleIds[key] = shouldAssign
                ? normalizeRoleIds([...currentRoleIds, role.id])
                : currentRoleIds.filter((roleId) => roleId !== role.id);
        }
    }

    /**
     * 判断实体 relation 的草稿是否可保存。
     */
    function canSaveEntityRelation(row: Extract<EntityPermissionRow, { kind: "assignable" }>) {
        const changedRoleIds = getChangedRoleIds(row.roleIds, getEntityDraftRoleIds(row));
        return (
            changedRoleIds.length > 0 &&
            changedRoleIds.every((roleId) => row.editableRoleIds.includes(roleId))
        );
    }

    /**
     * 判断当前角色是否可以编辑指定 manager relation。
     */
    function isSelectedRoleRelationEditable(
        resourceType: RoleCoreManagerResourceType,
        relation: RoleCoreManagerRelation,
    ) {
        const role = selectedRole.value;
        if (!role) {
            return false;
        }
        return (
            findModuleRelation(resourceType, relation)?.editableRoleIds.includes(role.id) === true
        );
    }

    /**
     * 判断角色视图中指定 manager 模块是否有可保存的变化。
     */
    function canSaveRoleModule(module: AuthzPermissionManagerModuleDto) {
        return (
            getChangedRoleModuleRelations(module).filter((relation) =>
                isSelectedRoleRelationEditable(module.resourceType, relation.relation),
            ).length > 0
        );
    }

    /**
     * 获取角色视图中指定模块发生变化的 relation 列表。
     */
    function getChangedRoleModuleRelations(module: AuthzPermissionManagerModuleDto) {
        const role = selectedRole.value;
        if (!role) {
            return [];
        }
        return module.relations.filter(
            (relation) =>
                !areRoleIdsEqual(
                    relation.roleIds,
                    getRelationDraftRoleIds(
                        module.resourceType,
                        relation.relation,
                        relation.roleIds,
                    ),
                ),
        );
    }

    /**
     * 构造单个 manager relation 的矩阵变更请求。
     */
    function createMatrixChange(
        resourceType: RoleCoreManagerResourceType,
        relation: RoleCoreManagerRelation,
        previousRoleIds: number[],
        nextRoleIds: number[],
    ): AuthzPermissionMatrixChangeDto {
        return {
            resourceType,
            relation,
            previousRoleIds: normalizeRoleIds(previousRoleIds),
            nextRoleIds: normalizeRoleIds(nextRoleIds),
        };
    }

    /**
     * 汇总当前页面全部发生变化的权限矩阵草稿。
     */
    function buildAllMatrixChanges() {
        return modules.value.flatMap((module) =>
            module.relations
                .map((relation) =>
                    createMatrixChange(
                        module.resourceType,
                        relation.relation,
                        relation.roleIds,
                        getRelationDraftRoleIds(
                            module.resourceType,
                            relation.relation,
                            relation.roleIds,
                        ),
                    ),
                )
                .filter(
                    (change) =>
                        getChangedRoleIds(change.previousRoleIds, change.nextRoleIds).length > 0,
                ),
        );
    }

    /**
     * 汇总当前用户有权限保存的权限矩阵草稿。
     */
    function buildAllSavableMatrixChanges() {
        return buildAllMatrixChanges().filter((change) => {
            const relation = findModuleRelation(change.resourceType, change.relation);
            if (!relation) {
                return false;
            }
            return getChangedRoleIds(change.previousRoleIds, change.nextRoleIds).every((roleId) =>
                relation.editableRoleIds.includes(roleId),
            );
        });
    }

    /**
     * 查找指定 manager 模块里的 relation 当前状态。
     */
    function findModuleRelation(
        resourceType: RoleCoreManagerResourceType,
        relation: RoleCoreManagerRelation,
    ): AuthzPermissionRelationAssignmentDto | null {
        return (
            modules.value
                .find((module) => module.resourceType === resourceType)
                ?.relations.find((item) => item.relation === relation) ?? null
        );
    }

    /**
     * 将后端 relation roleIds 同步到实体视图草稿。
     */
    function syncEntityDrafts() {
        for (const module of modules.value) {
            for (const relation of module.relations) {
                entityDraftRoleIds[
                    createManagerRelationKey(module.resourceType, relation.relation)
                ] = [...relation.roleIds];
            }
        }
    }

    /**
     * 按当前选中的角色同步角色视图 checkbox 草稿。
     */
    function syncSelectedRoleDrafts() {
        const role = selectedRole.value;
        for (const module of modules.value) {
            roleRelationDrafts[module.resourceType] = role
                ? module.relations
                      .filter((relation) =>
                          getRelationDraftRoleIds(
                              module.resourceType,
                              relation.relation,
                              relation.roleIds,
                          ).includes(role.id),
                      )
                      .map((relation) => relation.relation)
                : [];
        }
    }

    /**
     * 确保实体视图始终有一个存在的选中 definition。
     */
    function ensureSelectedDefinition() {
        if (
            definitions.value.some((definition) => definition.name === selectedDefinitionName.value)
        ) {
            return;
        }
        selectedDefinitionName.value = definitions.value[0]?.name ?? "";
    }

    /**
     * 确保角色视图始终有一个存在的选中角色。
     */
    function ensureSelectedRole() {
        if (roles.value.some((role) => role.id === selectedRoleId.value)) {
            return;
        }
        selectedRoleId.value = roles.value[0]?.id ?? null;
    }

    /**
     * 创建 manager relation 草稿和保存状态使用的稳定 key。
     */
    function createManagerRelationKey(
        resourceType: RoleCoreManagerResourceType,
        relation: RoleCoreManagerRelation,
    ) {
        return `${resourceType}:${relation}`;
    }

    /**
     * 计算两个角色 ID 集合的对称差集。
     */
    function getChangedRoleIds(previousRoleIds: number[], nextRoleIds: number[]) {
        const previousRoleIdSet = new Set(previousRoleIds);
        const nextRoleIdSet = new Set(nextRoleIds);
        return normalizeRoleIds([...previousRoleIds, ...nextRoleIds]).filter(
            (roleId) => previousRoleIdSet.has(roleId) !== nextRoleIdSet.has(roleId),
        );
    }

    /**
     * 判断两个角色 ID 集合是否完全一致。
     */
    function areRoleIdsEqual(left: number[], right: number[]) {
        const normalizedLeft = normalizeRoleIds(left);
        const normalizedRight = normalizeRoleIds(right);
        if (normalizedLeft.length !== normalizedRight.length) {
            return false;
        }
        return normalizedLeft.every((roleId, index) => roleId === normalizedRight[index]);
    }

    /**
     * 规整角色 ID 数组，去重后按数字升序排列。
     */
    function normalizeRoleIds(roleIds: number[]) {
        return [
            ...new Set(
                roleIds
                    .map((roleId) => Number(roleId))
                    .filter((roleId) => Number.isInteger(roleId) && roleId > 0),
            ),
        ].sort((left, right) => left - right);
    }

    /**
     * 归一化搜索关键字。
     */
    function normalizeKeyword(value: string) {
        return value.trim().toLowerCase();
    }
</script>
