<template>
    <a-space
        direction="vertical"
        fill
        size="large"
    >
        <div class="role-permission-board">
            <a-card
                :bordered="true"
                class="role-permission-board__roles"
                :body-style="roleListBodyStyle"
            >
                <template #title>选择角色</template>
                <template #extra>
                    <a-button
                        type="text"
                        size="mini"
                        :loading="loading"
                        @click="reloadPanel"
                    >
                        <template #icon>
                            <icon-refresh />
                        </template>
                    </a-button>
                </template>

                <a-input-search
                    v-model="roleKeyword"
                    allow-clear
                    placeholder="搜索角色名称 / 编码"
                    class="role-permission-search"
                />

                <a-spin
                    :loading="loading"
                    class="role-permission-list-spin"
                >
                    <a-scrollbar
                        v-if="filteredRoles.length"
                        outer-class="role-permission-role-scrollbar"
                        class="role-permission-role-scrollbar"
                    >
                        <a-menu
                            :selected-keys="selectedRoleMenuKeys"
                            @menu-item-click="selectRoleByKey"
                        >
                            <a-menu-item
                                v-for="role in filteredRoles"
                                :key="String(role.id)"
                            >
                                <a-space
                                    direction="vertical"
                                    :size="2"
                                    fill
                                >
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>{{ role.name }}</span>
                                        <a-tag
                                            v-if="role.isSuperAdmin"
                                            size="small"
                                            color="gold"
                                        >
                                            超管
                                        </a-tag>
                                        <a-tag
                                            v-if="role.isBuiltin"
                                            size="small"
                                            color="gray"
                                        >
                                            内置
                                        </a-tag>
                                    </a-space>
                                    <a-typography-text
                                        type="secondary"
                                        class="role-permission-role-code"
                                    >
                                        {{ role.code }}
                                    </a-typography-text>
                                </a-space>
                            </a-menu-item>
                        </a-menu>
                    </a-scrollbar>
                    <a-empty
                        v-else
                        description="暂无角色"
                    />
                </a-spin>
            </a-card>

            <a-card
                :bordered="true"
                class="role-permission-board__detail"
                :body-style="permissionBodyStyle"
            >
                <template #title>
                    <a-space
                        v-if="currentRole"
                        size="mini"
                        wrap
                    >
                        <span>{{ currentRole.name }}</span>
                        <a-typography-text code>{{ currentRole.code }}</a-typography-text>
                    </a-space>
                    <span v-else>给角色授权</span>
                </template>
                <template #extra>
                    <a-button
                        type="primary"
                        size="small"
                        :loading="saving"
                        :disabled="!canEditCurrentRolePermissions || !hasPermissionChanges"
                        @click="savePermissions"
                    >
                        保存角色权限
                    </a-button>
                </template>

                <a-spin
                    :loading="relationsLoading"
                    class="role-permission-detail-spin"
                >
                    <a-empty
                        v-if="!currentRole"
                        description="请选择一个角色"
                    />
                    <a-space
                        v-if="currentRole"
                        class="role-permission-inherit"
                        size="mini"
                        wrap
                    >
                        <a-tag color="arcoblue">直接权限 {{ savedPermissionIds.length }}</a-tag>
                        <a-tag color="arcoblue">有效权限 {{ effectivePermissionIds.length }}</a-tag>
                        <a-tag
                            v-if="inheritedPermissionIds.length"
                            color="green"
                        >
                            继承权限 {{ inheritedPermissionIds.length }}
                        </a-tag>
                        <a-tag
                            v-if="hasPermissionChanges"
                            color="orange"
                        >
                            有未保存改动
                        </a-tag>
                        <template v-if="parentRoles.length">
                            <span class="role-permission-inherit__label">继承角色</span>
                            <a-button
                                v-for="role in parentRoles"
                                :key="role.id"
                                type="text"
                                size="mini"
                                @click="selectRole(role.id)"
                            >
                                {{ role.name }}
                            </a-button>
                        </template>
                    </a-space>
                    <a-alert
                        v-if="currentRole && currentRole.isSuperAdmin"
                        class="role-permission-super-admin-alert"
                        type="warning"
                        show-icon
                    >
                        超级管理员角色默认拥有全部启用权限，直接授权权限仅用于查看，不能编辑。
                    </a-alert>
                    <a-scrollbar
                        v-if="currentRole"
                        outer-class="role-permission-scrollbar"
                        class="role-permission-scrollbar"
                    >
                        <a-checkbox-group
                            v-model="draftPermissionIds"
                            class="role-permission-checkbox-group"
                            :disabled="!canEditCurrentRolePermissions"
                        >
                            <div
                                v-for="group in groupedPermissions"
                                :key="group.key"
                                class="role-permission-section"
                            >
                                <div class="role-permission-section__header">
                                    <a-space
                                        size="mini"
                                        wrap
                                    >
                                        <span>{{ group.name }}</span>
                                        <a-tag
                                            size="small"
                                            color="arcoblue"
                                        >
                                            {{ group.permissions.length }}
                                        </a-tag>
                                    </a-space>
                                </div>
                                <a-grid
                                    :cols="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 3 }"
                                    :col-gap="12"
                                    :row-gap="12"
                                >
                                    <a-grid-item
                                        v-for="permission in group.permissions"
                                        :key="permission.id"
                                    >
                                        <ArcoCheckboxCard
                                            :value="permission.id"
                                            :disabled="!canEditCurrentRolePermissions"
                                            class="role-permission-checkbox"
                                        >
                                            <template #title>
                                                {{ permission.name }}
                                            </template>
                                            <template #tags>
                                                <a-tag
                                                    size="small"
                                                    color="purple"
                                                >
                                                    {{ getPermissionKindLabel(permission.kind) }}
                                                </a-tag>
                                                <a-tag
                                                    v-if="permission.status === RbacStatus.DISABLE"
                                                    size="small"
                                                    color="red"
                                                >
                                                    禁用
                                                </a-tag>
                                                <a-tag
                                                    v-if="
                                                        savedPermissionIdSet.has(permission.id) &&
                                                        draftPermissionIdSet.has(permission.id)
                                                    "
                                                    size="small"
                                                    color="arcoblue"
                                                >
                                                    已直接授权
                                                </a-tag>
                                                <a-tag
                                                    v-else-if="
                                                        draftPermissionIdSet.has(permission.id)
                                                    "
                                                    size="small"
                                                    color="orange"
                                                >
                                                    待保存
                                                </a-tag>
                                                <a-tag
                                                    v-else-if="
                                                        savedPermissionIdSet.has(permission.id)
                                                    "
                                                    size="small"
                                                    color="red"
                                                >
                                                    保存后移除
                                                </a-tag>
                                                <a-tag
                                                    v-if="
                                                        inheritedPermissionIdSet.has(permission.id)
                                                    "
                                                    size="small"
                                                    color="green"
                                                >
                                                    继承获得
                                                </a-tag>
                                            </template>
                                            <template #description>
                                                <a-typography-text code>
                                                    {{ permission.code }}
                                                </a-typography-text>
                                            </template>
                                        </ArcoCheckboxCard>
                                    </a-grid-item>
                                </a-grid>
                            </div>
                        </a-checkbox-group>
                    </a-scrollbar>
                </a-spin>
            </a-card>
        </div>
    </a-space>
</template>

<script setup lang="ts">
    import {
        RbacStatus,
        type RbacPermissionDto,
        type RbacPermissionGroupDto,
        type RbacRoleDto,
    } from "@/api/rbac/common";
    import { queryRbacPermissionListApi } from "@/api/rbac/permission";
    import { queryRbacPermissionGroupListApi } from "@/api/rbac/permission-group";
    import { assignRolePermissionsApi, queryRoleListApi, getRoleRelationsApi } from "@/api/role";
    import ArcoCheckboxCard from "@/components/ArcoCheckboxCard.vue";
    import { Message } from "@arco-design/web-vue";
    import { computed, onMounted, ref, type CSSProperties } from "vue";

    type PermissionGroupView = {
        key: string;
        name: string;
        sort: number;
        permissions: RbacPermissionDto[];
    };

    const permissionKindLabels: Record<RbacPermissionDto["kind"], string> = {
        MENU: "菜单",
        ACTION: "动作",
    };

    const emit = defineEmits<{
        changed: [roleId: number];
    }>();

    const loading = ref(false);
    const relationsLoading = ref(false);
    const saving = ref(false);
    const roleKeyword = ref("");
    const roles = ref<RbacRoleDto[]>([]);
    const permissions = ref<RbacPermissionDto[]>([]);
    const permissionGroups = ref<RbacPermissionGroupDto[]>([]);
    const selectedRoleId = ref<number | null>(null);
    const relationRole = ref<RbacRoleDto | null>(null);
    const draftPermissionIds = ref<number[]>([]);
    const savedPermissionIds = ref<number[]>([]);
    const parentRoleIds = ref<number[]>([]);
    const effectivePermissionIds = ref<number[]>([]);
    const inheritedPermissionIds = ref<number[]>([]);

    const roleListBodyStyle: CSSProperties = {
        height: "640px",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };
    const permissionBodyStyle: CSSProperties = {
        height: "640px",
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };

    const filteredRoles = computed(() => {
        const keyword = roleKeyword.value.trim().toLowerCase();
        if (!keyword) {
            return roles.value;
        }
        return roles.value.filter((role) =>
            [role.name, role.code, role.description]
                .filter(Boolean)
                .some((text) => String(text).toLowerCase().includes(keyword)),
        );
    });
    const selectedRoleMenuKeys = computed(() =>
        selectedRoleId.value ? [String(selectedRoleId.value)] : [],
    );
    const currentRole = computed(
        () =>
            relationRole.value ??
            roles.value.find((role) => role.id === selectedRoleId.value) ??
            null,
    );
    const canEditCurrentRolePermissions = computed(
        () =>
            Boolean(currentRole.value?.viewerCanAssignPermission) &&
            !currentRole.value?.isSuperAdmin,
    );
    const roleById = computed(() => new Map(roles.value.map((role) => [role.id, role])));
    const parentRoles = computed(() =>
        parentRoleIds.value
            .map((roleId) => roleById.value.get(roleId))
            .filter((role): role is RbacRoleDto => Boolean(role)),
    );
    const draftPermissionIdSet = computed(() => new Set(draftPermissionIds.value));
    const savedPermissionIdSet = computed(() => new Set(savedPermissionIds.value));
    const inheritedPermissionIdSet = computed(() => new Set(inheritedPermissionIds.value));
    const hasPermissionChanges = computed(
        () => !isSameNumberSet(draftPermissionIds.value, savedPermissionIds.value),
    );
    const permissionGroupById = computed(
        () => new Map(permissionGroups.value.map((group) => [group.id, group])),
    );
    const groupedPermissions = computed<PermissionGroupView[]>(() => {
        const groupMap = new Map<string, PermissionGroupView>();
        for (const group of permissionGroups.value) {
            groupMap.set(String(group.id), {
                key: String(group.id),
                name: group.name,
                sort: group.sort,
                permissions: [],
            });
        }
        const ungrouped: PermissionGroupView = {
            key: "ungrouped",
            name: "未分组",
            sort: Number.MAX_SAFE_INTEGER,
            permissions: [],
        };

        for (const permission of permissions.value) {
            const group = permission.groupId ? groupMap.get(String(permission.groupId)) : undefined;
            if (group) {
                group.permissions.push(permission);
            } else {
                ungrouped.permissions.push(permission);
            }
        }

        const groups = [...groupMap.values()].filter((group) => group.permissions.length > 0);
        if (ungrouped.permissions.length > 0) {
            groups.push(ungrouped);
        }
        return groups
            .map((group) => ({
                ...group,
                permissions: [...group.permissions].sort(sortPermissions),
            }))
            .sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name));
    });

    onMounted(() => {
        void initializePanel();
    });

    async function initializePanel() {
        loading.value = true;
        try {
            await Promise.all([loadRoles(), loadPermissionResources()]);
            const firstRole = roles.value[0];
            if (firstRole) {
                await selectRole(firstRole.id);
            }
        } finally {
            loading.value = false;
        }
    }

    async function reloadPanel() {
        await initializePanel();
        Message.success("角色授权数据已刷新");
    }

    async function loadRoles() {
        const response = await queryRoleListApi();
        roles.value = response.data.records;
    }

    async function loadPermissionResources() {
        const [permissionResponse, groupResponse] = await Promise.all([
            queryRbacPermissionListApi(),
            queryRbacPermissionGroupListApi(),
        ]);
        permissions.value = permissionResponse.data.records;
        permissionGroups.value = groupResponse.data.records;
    }

    async function selectRoleByKey(key: string) {
        const id = Number(key);
        if (!Number.isInteger(id) || id <= 0) {
            return;
        }
        await selectRole(id);
    }

    async function selectRole(id: number) {
        selectedRoleId.value = id;
        relationRole.value = null;
        relationsLoading.value = true;
        try {
            const response = await getRoleRelationsApi(id);
            relationRole.value = response.data.role;
            draftPermissionIds.value = [...response.data.permissionIds];
            savedPermissionIds.value = [...response.data.permissionIds];
            parentRoleIds.value = [...response.data.parentRoleIds];
            effectivePermissionIds.value = [...response.data.effectivePermissionIds];
            inheritedPermissionIds.value = [...response.data.inheritedPermissionIds];
        } finally {
            relationsLoading.value = false;
        }
    }

    async function savePermissions() {
        if (!currentRole.value) {
            return;
        }
        if (currentRole.value.isSuperAdmin) {
            Message.info("超级管理员角色默认拥有全部权限，无需保存直接权限");
            return;
        }
        saving.value = true;
        try {
            await assignRolePermissionsApi({
                roleId: currentRole.value.id,
                permissionIds: draftPermissionIds.value,
            });
            await selectRole(currentRole.value.id);
            Message.success("角色直接权限已保存");
            emit("changed", currentRole.value.id);
        } finally {
            saving.value = false;
        }
    }

    function sortPermissions(left: RbacPermissionDto, right: RbacPermissionDto) {
        const leftGroup = left.groupId ? permissionGroupById.value.get(left.groupId) : undefined;
        const rightGroup = right.groupId ? permissionGroupById.value.get(right.groupId) : undefined;
        return (
            (leftGroup?.sort ?? Number.MAX_SAFE_INTEGER) -
                (rightGroup?.sort ?? Number.MAX_SAFE_INTEGER) ||
            left.sort - right.sort ||
            left.id - right.id
        );
    }

    function getPermissionKindLabel(kind: RbacPermissionDto["kind"]) {
        return permissionKindLabels[kind] ?? kind;
    }

    function isSameNumberSet(left: number[], right: number[]) {
        if (left.length !== right.length) {
            return false;
        }
        const rightSet = new Set(right);
        return left.every((item) => rightSet.has(item));
    }
</script>

<style scoped>
    .role-permission-board {
        display: grid;
        grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
    }

    .role-permission-board__roles,
    .role-permission-board__detail {
        min-width: 0;
    }

    .role-permission-search {
        flex: 0 0 auto;
        margin-bottom: 12px;
    }

    .role-permission-role-code {
        display: block;
        max-width: 260px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .role-permission-list-spin,
    .role-permission-detail-spin {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        min-width: 0;
        flex-direction: column;
    }

    .role-permission-list-spin :deep(.arco-spin-children),
    .role-permission-detail-spin :deep(.arco-spin-children) {
        display: flex;
        height: 100%;
        min-height: 0;
        min-width: 0;
        flex-direction: column;
    }

    :deep(.role-permission-role-scrollbar),
    :deep(.role-permission-scrollbar) {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
        min-width: 0;
    }

    :deep(.role-permission-role-scrollbar .arco-scrollbar-container),
    :deep(.role-permission-scrollbar .arco-scrollbar-container) {
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow: auto;
    }

    .role-permission-checkbox-group {
        display: block;
        min-width: 0;
        padding-right: 8px;
    }

    .role-permission-inherit {
        flex: 0 0 auto;
        margin-bottom: 12px;
    }

    .role-permission-super-admin-alert {
        flex: 0 0 auto;
        margin-bottom: 12px;
    }

    .role-permission-inherit__label {
        color: var(--color-text-2);
        font-size: 12px;
    }

    .role-permission-section {
        border-bottom: 1px solid var(--color-border-2);
        padding: 16px 0;
    }

    .role-permission-section:first-child {
        padding-top: 0;
    }

    .role-permission-section__header {
        margin-bottom: 12px;
        font-weight: 600;
    }

    .role-permission-checkbox {
        width: 100%;
        min-width: 0;
    }

    .role-permission-checkbox :deep(.arco-checkbox-label) {
        min-width: 0;
    }

    @media (max-width: 1024px) {
        .role-permission-board {
            grid-template-columns: 1fr;
        }
    }
</style>
