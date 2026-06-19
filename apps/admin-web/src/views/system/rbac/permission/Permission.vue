<template>
    <GiPageLayout>
        <a-modal
            v-model:visible="modalVisible"
            :title="modalTitle"
            :confirm-loading="submitting"
            width="760px"
            unmount-on-close
            @before-ok="submitPermission"
        >
            <a-descriptions
                v-if="currentFormDeclaration"
                bordered
                :column="2"
                class="permission-form-source"
            >
                <a-descriptions-item label="模块">
                    {{ currentFormDeclaration?.moduleName ?? "-" }}
                </a-descriptions-item>
                <a-descriptions-item label="来源">
                    {{ getSourceKindLabel(currentFormDeclaration?.sourceKind) }}
                </a-descriptions-item>
                <a-descriptions-item label="类">
                    {{ currentFormDeclaration?.className ?? "-" }}
                </a-descriptions-item>
                <a-descriptions-item label="方法">
                    {{ currentFormDeclaration?.methodName ?? "-" }}
                </a-descriptions-item>
            </a-descriptions>

            <form-create
                :model-value="form"
                v-model:api="permissionFormApi"
                :rule="permissionFormRules"
                :option="permissionFormOptions"
                @update:model-value="syncPermissionForm"
            />
        </a-modal>

        <a-drawer
            v-model:visible="drawerVisible"
            :title="drawerTitle"
            width="960px"
            unmount-on-close
            :footer="false"
        >
            <a-spin
                :loading="drawerLoading"
                class="tw:w-full"
            >
                <a-space
                    v-if="relations"
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-alert
                        type="info"
                        show-icon
                    >
                        这里是权限的反向授权入口：用于查看或调整哪些角色拥有这个权限。批量配置完整角色时，优先去角色页的“角色授权工作台”。
                    </a-alert>

                    <a-descriptions
                        bordered
                        :column="3"
                    >
                        <a-descriptions-item label="权限 ID">
                            {{ relations.permission.id }}
                        </a-descriptions-item>
                        <a-descriptions-item label="类型">
                            <a-tag color="purple">
                                {{ getPermissionKindLabel(relations.permission.kind) }}
                            </a-tag>
                        </a-descriptions-item>
                        <a-descriptions-item label="状态">
                            <StatusTag :status="relations.permission.status" />
                        </a-descriptions-item>
                        <a-descriptions-item label="授权给角色">
                            {{ relations.roleIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="被菜单引用">
                            {{ relations.menuIds.length }}
                        </a-descriptions-item>
                        <a-descriptions-item label="最终影响用户">
                            {{ relations.effectiveUserIds.length }}
                        </a-descriptions-item>
                    </a-descriptions>

                    <a-card :bordered="true">
                        <template #title>
                            <a-space
                                size="mini"
                                wrap
                            >
                                <span>把这个权限授权给角色</span>
                                <a-typography-text code>
                                    role:&lt;roleId&gt; -> permission:{{ relations.permission.id }}
                                </a-typography-text>
                            </a-space>
                        </template>
                        <template #extra>
                            <a-button
                                v-if="relations.permission.viewerCanAssignRole"
                                type="primary"
                                size="small"
                                :loading="savingRoles"
                                :disabled="!hasRoleChanges"
                                @click="savePermissionRoles"
                            >
                                保存授权角色
                            </a-button>
                        </template>
                        <GiTable
                            v-model:selectedKeys="draftRoleIds"
                            row-key="id"
                            :columns="roleColumns"
                            :request="requestPermissionRoles"
                            :pagination="relationPagination"
                            :row-selection="rowSelection"
                            :search="false"
                            :options="tableOptions"
                            :scroll="{ x: '100%', y: 360, minWidth: 760 }"
                            :action-ref="setRoleAction"
                        >
                            <template #form-search>
                                <form-create
                                    :model-value="permissionRoleFilters"
                                    :rule="permissionRoleSearchRules"
                                    :option="permissionRoleSearchOptions"
                                    @update:model-value="syncPermissionRoleFilters"
                                />
                            </template>
                            <template #roleFlags="{ record }">
                                <a-space size="mini">
                                    <a-tag
                                        v-if="record.isBuiltin"
                                        color="gray"
                                    >
                                        内置
                                    </a-tag>
                                    <a-tag
                                        v-if="record.isSuperAdmin"
                                        color="gold"
                                    >
                                        超管
                                    </a-tag>
                                </a-space>
                            </template>
                            <template #roleStatus="{ record }">
                                <StatusTag :status="record.status" />
                            </template>
                            <template #roleAssigned="{ record }">
                                <a-tag :color="record.assigned ? 'arcoblue' : 'gray'">
                                    {{ record.assigned ? "当前已授权" : "无授权关系" }}
                                </a-tag>
                            </template>
                        </GiTable>
                    </a-card>
                </a-space>
            </a-spin>
        </a-drawer>

        <a-page-header :show-back="false">
            <template #title>权限</template>
            <template #subtitle>维护权限定义，反向查看或调整哪些角色拥有该权限</template>
        </a-page-header>

        <a-alert
            class="permission-rule-alert"
            type="info"
            show-icon
        >
            权限页负责定义 permissionCode
            和反向授权查询；日常给角色配置能力时，建议从角色页进入“角色授权工作台”。
        </a-alert>

        <a-tabs
            v-model:active-key="activeView"
            class="permission-view-tabs"
        >
            <a-tab-pane
                key="nestjs"
                title="后端声明视角"
            >
                <a-spin
                    :loading="loading"
                    class="tw:w-full"
                >
                    <a-space
                        direction="vertical"
                        fill
                        size="large"
                    >
                        <div class="permission-board">
                            <a-card
                                :bordered="true"
                                class="permission-board__tree"
                                :body-style="declarationCardBodyStyle"
                            >
                                <template #title>后端扫描到的权限声明</template>
                                <template #extra>
                                    <a-button
                                        type="text"
                                        size="mini"
                                        @click="reloadDeclarationBoard"
                                    >
                                        刷新
                                    </a-button>
                                </template>

                                <a-input-search
                                    v-model="declarationKeyword"
                                    allow-clear
                                    placeholder="搜索模块 / 控制器 / 方法 / permissionCode"
                                    class="permission-tree-search"
                                />

                                <a-scrollbar
                                    v-if="filteredDeclarationTree.length"
                                    outer-class="declaration-tree-scrollbar"
                                    :outer-style="declarationTreeOuterStyle"
                                    :style="declarationTreeScrollStyle"
                                >
                                    <a-tree
                                        :key="treeRenderKey"
                                        v-model:selected-keys="selectedTreeKeys"
                                        v-model:expanded-keys="expandedTreeKeys"
                                        :data="filteredDeclarationTree"
                                        :field-names="candidateTreeFieldNames"
                                        :virtual-list-props="declarationTreeVirtualListProps"
                                        block-node
                                        :animation="true"
                                        :show-line="true"
                                        @select="handleDeclarationNodeSelect"
                                    >
                                        <template #title="{ title }">
                                            <a-space
                                                :size="8"
                                                align="center"
                                                class="declaration-tree-title"
                                            >
                                                <span class="declaration-tree-title__text">
                                                    {{ title }}
                                                </span>
                                            </a-space>
                                        </template>
                                        <template
                                            #extra="{
                                                sourceKey,
                                                canCreate,
                                                nodeTypeLabel,
                                                tagColor,
                                                missingCount,
                                            }"
                                        >
                                            <a-space
                                                :size="6"
                                                align="center"
                                                class="declaration-tree-extra"
                                            >
                                                <a-tag
                                                    v-if="missingCount > 0"
                                                    color="red"
                                                    size="small"
                                                >
                                                    缺 {{ missingCount }}
                                                </a-tag>
                                                <a-tag
                                                    type="secondary"
                                                    :color="tagColor"
                                                    size="small"
                                                >
                                                    {{ nodeTypeLabel }}
                                                </a-tag>
                                                <a-button
                                                    v-if="canCreate"
                                                    type="text"
                                                    size="mini"
                                                    @click.stop="
                                                        openCreateFromTreeSourceKey(sourceKey)
                                                    "
                                                >
                                                    <template #icon>
                                                        <icon-plus />
                                                    </template>
                                                </a-button>
                                            </a-space>
                                        </template>
                                    </a-tree>
                                </a-scrollbar>
                                <a-empty
                                    v-else
                                    description="没有匹配的后端声明"
                                />
                            </a-card>

                            <a-card
                                :bordered="true"
                                class="permission-board__detail"
                                :body-style="declarationCardBodyStyle"
                            >
                                <template #title>
                                    <a-space
                                        v-if="selectedNode"
                                        :size="8"
                                    >
                                        <a-tag
                                            :color="getCandidateNodeTypeColor(selectedNode.type)"
                                        >
                                            {{ getCandidateNodeTypeLabel(selectedNode.type) }}
                                        </a-tag>
                                        <span>{{ selectedNode.title }}</span>
                                    </a-space>
                                    <span v-else>声明权限</span>
                                </template>
                                <template #extra>
                                    <a-space :size="8">
                                        <a-tag color="green">
                                            已入库 {{ selectedExistsCount }}
                                        </a-tag>
                                        <a-tag color="red">未入库 {{ selectedMissingCount }}</a-tag>
                                        <a-button
                                            v-if="selectedNode && canCreateOnNode(selectedNode)"
                                            type="primary"
                                            size="small"
                                            @click="openCreateFromNode(selectedNode)"
                                        >
                                            <template #icon>
                                                <icon-plus />
                                            </template>
                                            入库权限
                                        </a-button>
                                    </a-space>
                                </template>

                                <div class="declaration-table-frame">
                                    <GiTable
                                        row-key="declarationKey"
                                        :columns="declarationColumns"
                                        :data="selectedDeclarations"
                                        :pagination="false"
                                        :scroll="declarationTableScroll"
                                        :search="false"
                                        :options="tableOptions"
                                        bordered
                                    >
                                        <template #permissionCode="{ record }">
                                            <a-typography-text code>
                                                {{ record.permissionCode }}
                                            </a-typography-text>
                                        </template>
                                        <template #declarationName="{ record }">
                                            {{ getDeclarationName(record) }}
                                        </template>
                                        <template #owner="{ record }">
                                            <PathSegments :path="getDeclarationOwnerPath(record)" />
                                        </template>
                                        <template #databaseState="{ record }">
                                            <a-tag :color="record.permission ? 'green' : 'red'">
                                                {{ record.permission ? "已入库" : "未入库" }}
                                            </a-tag>
                                        </template>
                                        <template #declarationKind="{ record }">
                                            <a-tag color="purple">
                                                {{
                                                    getPermissionKindLabel(
                                                        record.permission?.kind ?? record.kind,
                                                    )
                                                }}
                                            </a-tag>
                                        </template>
                                        <template #declarationStatus="{ record }">
                                            <StatusTag
                                                v-if="record.permission"
                                                :status="record.permission.status"
                                            />
                                            <a-tag
                                                v-else
                                                color="gray"
                                            >
                                                无数据
                                            </a-tag>
                                        </template>
                                        <template #declarationAction="{ record }">
                                            <a-space
                                                size="mini"
                                                wrap
                                            >
                                                <a-link
                                                    v-if="
                                                        !record.permission &&
                                                        meta.viewerCanCreatePermission
                                                    "
                                                    @click="openCreateDeclaration(record)"
                                                >
                                                    入库
                                                </a-link>
                                                <template v-if="record.permission">
                                                    <a-link
                                                        @click="openRelations(record.permission)"
                                                    >
                                                        授权角色
                                                    </a-link>
                                                    <a-link
                                                        v-if="record.permission.viewerCanUpdate"
                                                        @click="openEditDeclaration(record)"
                                                    >
                                                        编辑
                                                    </a-link>
                                                    <a-popconfirm
                                                        v-if="record.permission.viewerCanDelete"
                                                        content="确定删除该数据库权限行吗? 后端声明仍会保留，删除后会显示为未入库。"
                                                        @ok="removePermission(record.permission)"
                                                    >
                                                        <a-link status="danger">删除</a-link>
                                                    </a-popconfirm>
                                                </template>
                                            </a-space>
                                        </template>
                                    </GiTable>
                                </div>
                            </a-card>
                        </div>

                        <a-card :bordered="true">
                            <template #title>未绑定后端声明的权限</template>
                            <template #extra>
                                <a-tag color="gray">数据库有记录，但当前后端声明未扫描到</a-tag>
                            </template>
                            <GiTable
                                row-key="id"
                                :columns="unassignedColumns"
                                :data="unassignedPermissions"
                                :pagination="{ pageSize: 8, showTotal: true }"
                                :scroll="unassignedTableScroll"
                                :search="false"
                                :options="tableOptions"
                                bordered
                            >
                                <template #unassignedCode="{ record }">
                                    <a-typography-text code>{{ record.code }}</a-typography-text>
                                </template>
                                <template #unassignedKind="{ record }">
                                    <a-tag color="purple">
                                        {{ getPermissionKindLabel(record.kind) }}
                                    </a-tag>
                                </template>
                                <template #unassignedStatus="{ record }">
                                    <StatusTag :status="record.status" />
                                </template>
                                <template #unassignedState>
                                    <a-tag color="gray">未绑定声明</a-tag>
                                </template>
                            </GiTable>
                        </a-card>
                    </a-space>
                </a-spin>
            </a-tab-pane>

            <a-tab-pane
                key="database"
                title="权限库"
            >
                <a-card :bordered="true">
                    <GiTable
                        row-key="id"
                        header-title="权限库"
                        :columns="databaseColumns"
                        :request="requestDatabasePermissions"
                        :pagination="databasePagination"
                        :search="false"
                        :options="tableOptions"
                        :scroll="{ x: '100%', y: '100%', minWidth: 1240 }"
                        :action-ref="setDatabaseTableAction"
                        bordered
                    >
                        <template #custom-extra>
                            <a-button
                                v-if="meta.viewerCanCreatePermission"
                                type="primary"
                                size="small"
                                @click="openCreateDatabase"
                            >
                                <template #icon>
                                    <icon-plus />
                                </template>
                                新增数据库权限
                            </a-button>
                        </template>
                        <template #form-search>
                            <form-create
                                :model-value="databaseFilters"
                                :rule="databaseSearchRules"
                                :option="databaseSearchOptions"
                                @update:model-value="syncDatabaseFilters"
                            />
                        </template>
                        <template #databaseCode="{ record }">
                            <a-typography-text code>{{ record.code }}</a-typography-text>
                        </template>
                        <template #databaseKind="{ record }">
                            <a-tag color="purple">{{ getPermissionKindLabel(record.kind) }}</a-tag>
                        </template>
                        <template #databaseGroup="{ record }">
                            <a-tag :color="record.groupId ? 'arcoblue' : 'gray'">
                                {{ getPermissionGroupName(record.groupId) }}
                            </a-tag>
                        </template>
                        <template #databaseFlags="{ record }">
                            <a-tag
                                v-if="record.isBuiltin"
                                color="gray"
                            >
                                内置
                            </a-tag>
                        </template>
                        <template #databaseStatus="{ record }">
                            <StatusTag :status="record.status" />
                        </template>
                        <template #databaseDeclarationState="{ record }">
                            <a-tag :color="isDeclaredCode(record.code) ? 'green' : 'gray'">
                                {{ isDeclaredCode(record.code) ? "已绑定声明" : "未绑定声明" }}
                            </a-tag>
                        </template>
                        <template #databaseAction="{ record }">
                            <a-space
                                size="mini"
                                wrap
                            >
                                <a-link @click="openRelations(record)">授权角色</a-link>
                                <a-link
                                    v-if="record.viewerCanUpdate"
                                    @click="openEditDatabase(record)"
                                >
                                    编辑
                                </a-link>
                                <a-popconfirm
                                    v-if="record.viewerCanDelete"
                                    content="确定软删除该权限吗?"
                                    @ok="removePermission(record)"
                                >
                                    <a-link status="danger">删除</a-link>
                                </a-popconfirm>
                            </a-space>
                        </template>
                    </GiTable>
                </a-card>
            </a-tab-pane>

            <a-tab-pane
                key="groups"
                title="权限分组"
            >
                <PermissionGroupPanel @changed="handlePermissionGroupsChanged" />
            </a-tab-pane>
        </a-tabs>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        RbacPermissionKind,
        RbacStatus,
        type RbacPermissionDto,
        type RbacPermissionGroupDto,
    } from "@/api/rbac/common";
    import {
        createRbacPermissionApi,
        deleteRbacPermissionApi,
        getRbacPermissionDeclarationBoardApi,
        queryRbacPermissionListApi,
        getRbacPermissionRelationsApi,
        assignRbacPermissionRolesApi,
        queryRbacPermissionRolesApi,
        type RbacPermissionCandidateTreeNode,
        type RbacPermissionDeclarationDto,
        type RbacPermissionRelationsDto,
        updateRbacPermissionApi,
    } from "@/api/rbac/permission";
    import { queryRbacPermissionGroupListApi } from "@/api/rbac/permission-group";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import {
        GiTable,
        type ActionType,
        type GiTableRequestParams,
        type ProColumns,
    } from "@/components/GiTable";
    import PathSegments from "@/components/PathSegments.vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { Message } from "@arco-design/web-vue";
    import {
        computed,
        nextTick,
        onMounted,
        reactive,
        ref,
        shallowRef,
        type CSSProperties,
    } from "vue";
    import PermissionGroupPanel from "./PermissionGroupPanel.vue";
    import StatusTag from "../components/StatusTag.vue";

    defineOptions({ name: "RbacPermission" });

    type DeclarationTreeNode = {
        sourceKey: string;
        uiKey: string;
        title: string;
        nodeTypeLabel: string;
        tagColor: string;
        missingCount: number;
        canCreate: boolean;
        searchText: string;
        children?: DeclarationTreeNode[];
    };

    const activeView = ref("nestjs");
    const loading = ref(false);
    const databaseTableAction = shallowRef<ActionType>();
    const roleAction = shallowRef<ActionType>();
    const permissionFormApi = shallowRef<FormCreateApi | null>(null);
    const modalVisible = ref(false);
    const submitting = ref(false);
    const editingId = ref<number | null>(null);
    const drawerVisible = ref(false);
    const drawerLoading = ref(false);
    const savingRoles = ref(false);
    const relations = ref<RbacPermissionRelationsDto | null>(null);
    const draftRoleIds = ref<number[]>([]);
    const savedRoleIds = ref<number[]>([]);
    const declarationTree = ref<RbacPermissionCandidateTreeNode[]>([]);
    const declarations = ref<RbacPermissionDeclarationDto[]>([]);
    const unassignedPermissions = ref<RbacPermissionDto[]>([]);
    const permissionGroups = ref<RbacPermissionGroupDto[]>([]);
    const selectedNodeKey = ref("");
    const expandedNodeKeys = ref<string[]>([]);
    const treeRenderKey = ref(createTreeRenderKey());
    const declarationKeyword = ref("");
    const modalDeclarationOptions = ref<RbacPermissionDeclarationDto[]>([]);
    const meta = reactive({
        viewerCanCreatePermission: false,
        viewerCanUpdatePermission: false,
        viewerCanDeletePermission: false,
    });
    const databaseFilters = reactive<{
        code: string;
        name: string;
        description: string;
        kind?: RbacPermissionKind;
        status?: RbacStatus;
        groupId?: number;
    }>({
        code: "",
        name: "",
        description: "",
        kind: undefined,
        status: undefined,
        groupId: undefined,
    });
    const permissionRoleFilters = reactive<{
        name: string;
        code: string;
        description: string;
        status?: RbacStatus;
        assigned?: boolean;
    }>({
        name: "",
        code: "",
        description: "",
        status: undefined,
        assigned: undefined,
    });

    const form = reactive({
        declarationKey: "",
        code: "",
        name: "",
        description: "",
        kind: RbacPermissionKind.ACTION,
        groupId: undefined as number | undefined,
        sort: 1000,
        isBuiltin: false,
        status: RbacStatus.ENABLE,
    });

    const permissionKindOptions = [
        { label: "菜单", value: RbacPermissionKind.MENU },
        { label: "动作", value: RbacPermissionKind.ACTION },
    ];
    const permissionStatusOptions = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const relationAssignedOptions = [
        { label: "已授权", value: true },
        { label: "未授权", value: false },
    ];
    const permissionFormOptions: FormCreateOptions = {
        form: {
            layout: "vertical",
        },
        row: {
            gutter: 16,
        },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };
    const declarationPanelHeight = 520;
    const unassignedTableBodyHeight = 320;
    const declarationCardBodyStyle: CSSProperties = {
        height: `${declarationPanelHeight}px`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    };
    const declarationTreeOuterStyle: CSSProperties = {
        flex: "1 1 auto",
        minHeight: 0,
        minWidth: 0,
    };
    const declarationTreeScrollStyle: CSSProperties = {
        height: "100%",
        minWidth: "100%",
        overflowX: "auto",
        overflowY: "auto",
    };
    const declarationTreeVirtualListProps = {
        height: "100%",
        threshold: 24,
        estimatedSize: 32,
        buffer: 12,
    };
    const declarationTableScroll = {
        x: "100%",
        y: "100%",
    };
    const unassignedTableScroll = {
        x: "100%",
        y: unassignedTableBodyHeight,
    };
    const candidateTreeFieldNames = {
        key: "uiKey",
        title: "title",
        children: "children",
    };
    const candidateNodeTypeLabels: Record<RbacPermissionCandidateTreeNode["type"], string> = {
        module: "模块",
        controller: "控制器",
        provider: "服务",
        method: "方法",
    };
    const candidateNodeTypeColors: Record<RbacPermissionCandidateTreeNode["type"], string> = {
        module: "arcoblue",
        controller: "green",
        provider: "orange",
        method: "purple",
    };
    const declarationColumns: ProColumns[] = [
        {
            title: "permissionCode",
            dataIndex: "permissionCode",
            slotName: "permissionCode",
            width: 280,
        },
        { title: "名称", dataIndex: "name", slotName: "declarationName", width: 180 },
        { title: "挂载位置", dataIndex: "owner", slotName: "owner", width: 260 },
        { title: "数据库", dataIndex: "databaseState", slotName: "databaseState", width: 100 },
        { title: "类型", dataIndex: "kind", slotName: "declarationKind", width: 90 },
        { title: "状态", dataIndex: "status", slotName: "declarationStatus", width: 100 },
        {
            title: "操作",
            dataIndex: "operation",
            slotName: "declarationAction",
            fixed: "right",
            width: 170,
        },
    ];
    const unassignedColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "编码", dataIndex: "code", slotName: "unassignedCode", width: 280 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "类型", dataIndex: "kind", slotName: "unassignedKind", width: 90 },
        { title: "状态", dataIndex: "status", slotName: "unassignedStatus", width: 100 },
        { title: "声明绑定", dataIndex: "assignState", slotName: "unassignedState", width: 110 },
        { title: "描述", dataIndex: "description", ellipsis: true, tooltip: true },
    ];
    const databaseColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", slotName: "databaseCode", width: 280 },
        { title: "类型", dataIndex: "kind", slotName: "databaseKind", width: 90 },
        { title: "分组", dataIndex: "groupId", slotName: "databaseGroup", width: 150 },
        { title: "标记", dataIndex: "flags", slotName: "databaseFlags", width: 90 },
        { title: "状态", dataIndex: "status", slotName: "databaseStatus", width: 100 },
        {
            title: "声明绑定",
            dataIndex: "declarationState",
            slotName: "databaseDeclarationState",
            width: 110,
        },
        { title: "排序", dataIndex: "sort", width: 80 },
        { title: "描述", dataIndex: "description", ellipsis: true, tooltip: true },
        {
            title: "操作",
            dataIndex: "operation",
            slotName: "databaseAction",
            fixed: "right",
            width: 180,
        },
    ];
    const databasePagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };
    const relationPagination = {
        defaultPageSize: 10,
        showTotal: true,
        showJumper: true,
        showPageSize: true,
    };
    const tableOptions = { reload: true, density: true, setting: true };
    const rowSelection = { type: "checkbox", showCheckedAll: true } as const;
    const roleColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 80 },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "编码", dataIndex: "code", width: 220 },
        { title: "标记", dataIndex: "flags", slotName: "roleFlags", width: 140 },
        { title: "状态", dataIndex: "status", slotName: "roleStatus", width: 100 },
        { title: "当前授权状态", dataIndex: "assigned", slotName: "roleAssigned", width: 120 },
        { title: "描述", dataIndex: "description", ellipsis: true, tooltip: true },
    ];
    const permissionGroupOptions = computed(() =>
        permissionGroups.value.map((group) => ({
            label: `${group.name} / ${group.code}`,
            value: group.id,
        })),
    );
    const modalDeclarationSelectOptions = computed(() =>
        modalDeclarationOptions.value.map((item) => ({
            label: `${item.permissionCode} / ${getDeclarationOwnerPath(item)}`,
            value: item.declarationKey,
        })),
    );
    const permissionFormRules = computed<FormCreateRule[]>(() => {
        const rules: FormCreateRule[] = [];
        if (!editingId.value && modalDeclarationOptions.value.length > 1) {
            rules.push({
                ...createRequiredSelectRule(
                    "declarationKey",
                    "后端声明 permissionCode",
                    modalDeclarationSelectOptions.value,
                    {
                        allowClear: false,
                        allowSearch: true,
                        onChange: handleFormDeclarationChange,
                    },
                    { span: 24 },
                ),
            });
        }

        rules.push(
            createRequiredInputRule(
                "code",
                "权限编码 permissionCode",
                {
                    disabled: isDeclarationBoundForm.value,
                    placeholder: "例如 system.user.create",
                },
                { span: 24 },
            ),
            createRequiredInputRule(
                "name",
                "权限名称",
                { placeholder: "例如 用户创建" },
                { span: 24 },
            ),
            createSelectRule(
                "kind",
                "类型",
                permissionKindOptions,
                { allowClear: false },
                { span: 24 },
            ),
            createSelectRule(
                "groupId",
                "权限分组",
                permissionGroupOptions.value,
                { placeholder: "未分组" },
                { span: 24 },
            ),
            createSelectRule(
                "status",
                "状态",
                permissionStatusOptions,
                { allowClear: false },
                { span: 24 },
            ),
            createNumberRule("sort", "排序", {}, { span: 24 }),
            createSwitchRule("isBuiltin", "内置权限", {}, { span: 24 }),
            createTextareaRule("description", "描述"),
        );
        return rules;
    });
    const databaseSearchOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
        },
        row: { gutter: 12 },
        submitBtn: {
            show: true,
            type: "primary",
            size: "small",
            innerText: "查询",
            click: searchDatabasePermissions,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetDatabaseFilters,
        },
    }));
    const databaseSearchRules = computed<FormCreateRule[]>(() => [
        {
            field: "code",
            title: "权限编码",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按权限编码筛选",
            },
        },
        {
            field: "name",
            title: "权限名称",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按权限名称筛选",
            },
        },
        {
            field: "description",
            title: "描述",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "按描述筛选",
            },
        },
        {
            field: "kind",
            title: "类型",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "全部",
                options: permissionKindOptions,
            },
        },
        {
            field: "status",
            title: "状态",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "全部",
                options: permissionStatusOptions,
            },
        },
        {
            field: "groupId",
            title: "分组",
            type: "select",
            props: {
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
                allowClear: true,
                allowSearch: true,
                placeholder: "全部",
                options: permissionGroupOptions.value,
            },
        },
    ]);
    const permissionRoleSearchOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "horizontal",
            labelAlign: "right",
            autoLabelWidth: true,
        },
        row: { gutter: 12 },
        submitBtn: {
            show: true,
            type: "primary",
            size: "small",
            innerText: "查询",
            click: searchPermissionRoles,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetPermissionRoleFilters,
        },
    }));
    const permissionRoleSearchRules = computed<FormCreateRule[]>(() => [
        createInputRule("name", "角色名称", { placeholder: "按角色名称筛选" }),
        createInputRule("code", "角色编码", { placeholder: "按角色编码筛选" }),
        createInputRule("description", "描述", { placeholder: "按角色描述筛选" }),
        createSelectRule("status", "状态", permissionStatusOptions, { placeholder: "全部" }),
        createSelectRule("assigned", "授权状态", relationAssignedOptions, { placeholder: "全部" }),
    ]);

    function createInputRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "input",
            props: {
                allowClear: true,
                placeholder: `请输入${title}`,
                ...props,
            },
            col,
        };
    }

    function createRequiredInputRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            ...createInputRule(field, title, props, col),
            validate: [{ required: true, message: `请输入${title}`, trigger: "change" }],
        };
    }

    function createSelectRule(
        field: string,
        title: string,
        options: Array<{ label: string; value: string | number | boolean }>,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "select",
            props: {
                allowClear: true,
                allowSearch: true,
                placeholder: `请选择${title}`,
                options,
                ...props,
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
            },
            col,
        };
    }

    function createRequiredSelectRule(
        field: string,
        title: string,
        options: Array<{ label: string; value: string | number | boolean }>,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            ...createSelectRule(field, title, options, { allowClear: false, ...props }, col),
            validate: [{ required: true, message: `请选择${title}`, trigger: "change" }],
        };
    }

    function createNumberRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "inputNumber",
            props: {
                min: 0,
                precision: 0,
                class: "tw:w-full",
                placeholder: `请输入${title}`,
                ...props,
            },
            col,
        };
    }

    function createSwitchRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "switch",
            props: {
                checkedValue: true,
                uncheckedValue: false,
                checkedText: "是",
                uncheckedText: "否",
                ...props,
            },
            col,
        };
    }

    function createTextareaRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "textarea",
            props: {
                allowClear: true,
                placeholder: `请输入${title}`,
                autoSize: { minRows: 3, maxRows: 5 },
                ...props,
            },
            col,
        };
    }
    const hasRoleChanges = computed(() => !isSameNumberSet(draftRoleIds.value, savedRoleIds.value));
    const modalTitle = computed(() => {
        if (currentFormDeclaration.value) {
            return editingId.value ? "编辑声明权限" : "添加声明权限";
        }
        return editingId.value ? "编辑数据库权限" : "新增数据库权限";
    });
    const drawerTitle = computed(() =>
        relations.value ? `配置权限授权 - ${relations.value.permission.name}` : "配置权限授权",
    );
    const displayDeclarationTree = computed(() =>
        buildDisplayDeclarationTree(declarationTree.value),
    );
    const filteredDeclarationTree = computed(() =>
        filterDeclarationTree(displayDeclarationTree.value, declarationKeyword.value.trim()),
    );
    const selectedTreeKeys = computed<Array<string | number>>({
        get: () => {
            if (!selectedNodeKey.value) {
                return [];
            }
            const node = findDisplayTreeNodeBySourceKey(
                filteredDeclarationTree.value,
                selectedNodeKey.value,
            );
            return node ? [node.uiKey] : [];
        },
        set: (keys) => {
            const uiKey = keys[0] ? String(keys[0]) : "";
            const node = uiKey
                ? findDisplayTreeNodeByUiKey(filteredDeclarationTree.value, uiKey)
                : undefined;
            selectedNodeKey.value = node?.sourceKey ?? "";
        },
    });
    const expandedTreeKeys = computed<Array<string | number>>({
        get: () =>
            expandedNodeKeys.value.flatMap((sourceKey) => {
                const node = findDisplayTreeNodeBySourceKey(
                    filteredDeclarationTree.value,
                    sourceKey,
                );
                return node ? [node.uiKey] : [];
            }),
        set: (keys) => {
            expandedNodeKeys.value = keys
                .map(
                    (key) =>
                        findDisplayTreeNodeByUiKey(filteredDeclarationTree.value, String(key))
                            ?.sourceKey,
                )
                .filter((key): key is string => Boolean(key));
        },
    });
    const selectedNode = computed(() =>
        selectedNodeKey.value
            ? findCandidateTreeNodeByKey(declarationTree.value, selectedNodeKey.value)
            : undefined,
    );
    const selectedDeclarations = computed(() =>
        selectedNode.value ? getDeclarationsForNode(selectedNode.value) : declarations.value,
    );
    const selectedMissingCount = computed(
        () => selectedDeclarations.value.filter((item) => !item.permission).length,
    );
    const selectedExistsCount = computed(
        () => selectedDeclarations.value.length - selectedMissingCount.value,
    );
    const currentFormDeclaration = computed(() => {
        if (modalDeclarationOptions.value.length === 0) {
            return undefined;
        }

        return (
            modalDeclarationOptions.value.find(
                (item) => item.declarationKey === form.declarationKey,
            ) ?? modalDeclarationOptions.value[0]
        );
    });
    const isDeclarationBoundForm = computed(() => Boolean(currentFormDeclaration.value));

    onMounted(() => {
        void initializePage();
    });

    function setDatabaseTableAction(action: ActionType) {
        databaseTableAction.value = action;
    }

    function setRoleAction(action: ActionType) {
        roleAction.value = action;
    }

    async function requestDatabasePermissions(params: GiTableRequestParams) {
        const response = await queryRbacPermissionListApi({
            page: params.current,
            pageSize: params.pageSize,
            code: databaseFilters.code || undefined,
            name: databaseFilters.name || undefined,
            description: databaseFilters.description || undefined,
            kind: databaseFilters.kind,
            status: databaseFilters.status,
            groupId: databaseFilters.groupId,
        });
        Object.assign(meta, response.data.meta ?? {});
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    async function searchDatabasePermissions() {
        await databaseTableAction.value?.reload(true);
    }

    function syncDatabaseFilters(value: Partial<typeof databaseFilters>) {
        Object.assign(databaseFilters, value);
    }

    async function resetDatabaseFilters() {
        databaseFilters.code = "";
        databaseFilters.name = "";
        databaseFilters.description = "";
        databaseFilters.kind = undefined;
        databaseFilters.status = undefined;
        databaseFilters.groupId = undefined;
        await searchDatabasePermissions();
    }

    async function requestPermissionRoles(params: GiTableRequestParams) {
        const response = await queryRbacPermissionRolesApi({
            permissionId: relations.value!.permission.id,
            draftRoleIds: draftRoleIds.value,
            page: params.current,
            pageSize: params.pageSize,
            name: permissionRoleFilters.name || undefined,
            code: permissionRoleFilters.code || undefined,
            description: permissionRoleFilters.description || undefined,
            status: permissionRoleFilters.status,
            assigned: permissionRoleFilters.assigned,
        });
        return {
            data: response.data.records,
            total: response.data.pagination?.total,
            success: true,
        };
    }

    function searchPermissionRoles() {
        void roleAction.value?.reload(true);
    }

    function syncPermissionRoleFilters(value: Partial<typeof permissionRoleFilters>) {
        Object.assign(permissionRoleFilters, value);
    }

    function resetPermissionRoleFilters() {
        permissionRoleFilters.name = "";
        permissionRoleFilters.code = "";
        permissionRoleFilters.description = "";
        permissionRoleFilters.status = undefined;
        permissionRoleFilters.assigned = undefined;
        searchPermissionRoles();
    }

    async function initializePage() {
        await Promise.all([loadPermissionGroups(), loadDeclarationBoard()]);
    }

    async function loadPermissionGroups() {
        const response = await queryRbacPermissionGroupListApi();
        permissionGroups.value = response.data.records;
    }

    async function handlePermissionGroupsChanged() {
        await loadPermissionGroups();
        await loadDeclarationBoard();
        await databaseTableAction.value?.reload();
    }

    async function loadDeclarationBoard() {
        loading.value = true;
        try {
            const response = await getRbacPermissionDeclarationBoardApi();
            treeRenderKey.value = createTreeRenderKey();
            declarationTree.value = response.data.tree;
            declarations.value = response.data.declarations;
            unassignedPermissions.value = response.data.unassignedPermissions;
            Object.assign(meta, response.data.meta ?? {});
            expandedNodeKeys.value = collectExpandableNodeKeys(response.data.tree);
            if (
                !selectedNodeKey.value ||
                !findCandidateTreeNodeByKey(declarationTree.value, selectedNodeKey.value)
            ) {
                selectedNodeKey.value = getFirstNodeKey(declarationTree.value) ?? "";
            }
        } finally {
            loading.value = false;
        }
    }

    async function reloadDeclarationBoard() {
        await loadDeclarationBoard();
        Message.success("后端声明已刷新");
    }

    function handleDeclarationNodeSelect(keys: Array<string | number>, event: { node?: unknown }) {
        const uiKey = keys[0] ? String(keys[0]) : "";
        const eventNode = event.node as DeclarationTreeNode | undefined;
        const nextNode = uiKey
            ? findDisplayTreeNodeByUiKey(filteredDeclarationTree.value, uiKey)
            : eventNode;
        if (nextNode?.sourceKey) {
            selectedNodeKey.value = nextNode.sourceKey;
        }
    }

    function getFirstNodeKey(nodes: RbacPermissionCandidateTreeNode[]): string | undefined {
        return nodes[0]?.key;
    }

    function collectExpandableNodeKeys(nodes: RbacPermissionCandidateTreeNode[]): string[] {
        return nodes.flatMap((node) => {
            if (!node.children?.length) {
                return [];
            }
            return [node.key, ...collectExpandableNodeKeys(node.children)];
        });
    }

    function buildDisplayDeclarationTree(
        nodes: RbacPermissionCandidateTreeNode[],
        parentPath = "",
    ): DeclarationTreeNode[] {
        return nodes.map((node, index) => {
            const path = parentPath ? `${parentPath}.${index}` : String(index);
            const missingCount = getNodeMissingCount(node);
            const label = getCandidateNodeTypeLabel(node.type);
            const title = getCandidateTreeNodeTitle(node);
            return {
                sourceKey: node.key,
                uiKey: `${treeRenderKey.value}:node-${path}`,
                title,
                nodeTypeLabel: label,
                tagColor: getCandidateNodeTypeColor(node.type),
                missingCount,
                canCreate: canCreateOnNode(node),
                searchText: buildDeclarationNodeSearchText(node, label, title),
                children: node.children?.length
                    ? buildDisplayDeclarationTree(node.children, path)
                    : undefined,
            };
        });
    }

    function buildDeclarationNodeSearchText(
        node: RbacPermissionCandidateTreeNode,
        label: string,
        title: string,
    ) {
        return [
            label,
            title,
            node.title,
            node.moduleName,
            node.className,
            node.methodName,
            ...getDeclarationsForNode(node).flatMap((declaration) => [
                declaration.permissionCode,
                declaration.name,
                declaration.description,
            ]),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    }

    function createTreeRenderKey() {
        return `rbac-permission-tree-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function findDisplayTreeNodeByUiKey(
        nodes: DeclarationTreeNode[],
        uiKey: string,
    ): DeclarationTreeNode | undefined {
        for (const node of nodes) {
            if (node.uiKey === uiKey) {
                return node;
            }
            const child = node.children?.length
                ? findDisplayTreeNodeByUiKey(node.children, uiKey)
                : undefined;
            if (child) {
                return child;
            }
        }
        return undefined;
    }

    function findDisplayTreeNodeBySourceKey(
        nodes: DeclarationTreeNode[],
        sourceKey: string,
    ): DeclarationTreeNode | undefined {
        for (const node of nodes) {
            if (node.sourceKey === sourceKey) {
                return node;
            }
            const child = node.children?.length
                ? findDisplayTreeNodeBySourceKey(node.children, sourceKey)
                : undefined;
            if (child) {
                return child;
            }
        }
        return undefined;
    }

    function getCandidateTreeNodeTitle(node: RbacPermissionCandidateTreeNode) {
        return node.title;
    }

    function findCandidateTreeNodeByKey(
        nodes: RbacPermissionCandidateTreeNode[],
        key: string,
    ): RbacPermissionCandidateTreeNode | undefined {
        for (const node of nodes) {
            if (node.key === key) {
                return node;
            }
            const child = node.children?.length
                ? findCandidateTreeNodeByKey(node.children, key)
                : undefined;
            if (child) {
                return child;
            }
        }
        return undefined;
    }

    function filterDeclarationTree(
        nodes: DeclarationTreeNode[],
        keyword: string,
    ): DeclarationTreeNode[] {
        if (!keyword) {
            return nodes;
        }
        const normalizedKeyword = keyword.toLowerCase();
        return nodes.flatMap((node) => {
            const children = filterDeclarationTree(node.children ?? [], keyword);
            if (isTreeNodeMatched(node, normalizedKeyword) || children.length > 0) {
                return [
                    {
                        ...node,
                        children: children.length > 0 ? children : undefined,
                    },
                ];
            }
            return [];
        });
    }

    function isTreeNodeMatched(
        node: RbacPermissionCandidateTreeNode | DeclarationTreeNode,
        keyword: string,
    ) {
        if ("searchText" in node && typeof node.searchText === "string") {
            return node.searchText.includes(keyword);
        }
        const candidate = node as RbacPermissionCandidateTreeNode;
        return [
            candidate.title,
            candidate.moduleName,
            candidate.className,
            candidate.methodName,
        ].some((value) => value?.toLowerCase().includes(keyword));
    }

    function getDeclarationsForNode(node: RbacPermissionCandidateTreeNode) {
        if (node.type === "module") {
            return declarations.value.filter((item) => item.moduleName === node.moduleName);
        }
        if (node.type === "controller" || node.type === "provider") {
            return declarations.value.filter(
                (item) =>
                    item.moduleName === node.moduleName &&
                    item.sourceKind === node.sourceKind &&
                    item.className === node.className,
            );
        }
        if (node.type === "method") {
            return declarations.value.filter(
                (item) =>
                    item.moduleName === node.moduleName &&
                    item.sourceKind === node.sourceKind &&
                    item.className === node.className &&
                    item.methodName === node.methodName,
            );
        }
        return [];
    }

    function getNodeMissingCount(node: RbacPermissionCandidateTreeNode) {
        return getDeclarationsForNode(node).filter((item) => !item.permission).length;
    }

    function canCreateOnNode(node: RbacPermissionCandidateTreeNode) {
        return meta.viewerCanCreatePermission && getNodeMissingCount(node) > 0;
    }

    function getCandidateNodeTypeLabel(type?: RbacPermissionCandidateTreeNode["type"]) {
        return type ? candidateNodeTypeLabels[type] : "节点";
    }

    function getCandidateNodeTypeColor(type?: RbacPermissionCandidateTreeNode["type"]) {
        return type ? candidateNodeTypeColors[type] : "gray";
    }

    function getSourceKindLabel(sourceKind?: RbacPermissionDeclarationDto["sourceKind"]) {
        if (sourceKind === "controller") {
            return "控制器";
        }
        if (sourceKind === "provider") {
            return "服务";
        }
        return "未知";
    }

    function getPermissionKindLabel(kind?: RbacPermissionKind | string | null) {
        const option = permissionKindOptions.find((item) => item.value === kind);
        return option?.label ?? kind ?? "-";
    }

    function getDeclarationName(record: RbacPermissionDeclarationDto) {
        return record.permission?.name ?? record.name ?? record.permissionCode;
    }

    function getDeclarationOwnerPath(record: RbacPermissionDeclarationDto) {
        return [record.moduleName, `${record.className}.${record.methodName}`]
            .filter(Boolean)
            .join("/");
    }

    function isDeclaredCode(code: string) {
        return declarations.value.some((item) => item.permissionCode === code);
    }

    function openCreateFromNode(node: RbacPermissionCandidateTreeNode) {
        const missingDeclarations = getDeclarationsForNode(node).filter((item) => !item.permission);
        if (missingDeclarations.length === 0) {
            Message.info("这个节点下面的后端声明都已经入库");
            return;
        }
        openCreateWithDeclarations(missingDeclarations);
    }

    function openCreateFromTreeSourceKey(sourceKey?: string) {
        if (!sourceKey) {
            Message.warning("缺少后端声明节点标识，不能创建权限");
            return;
        }
        const node = findCandidateTreeNodeByKey(declarationTree.value, sourceKey);
        if (!node) {
            Message.warning("未找到对应的后端声明节点");
            return;
        }
        openCreateFromNode(node);
    }

    function openCreateDeclaration(record: RbacPermissionDeclarationDto) {
        openCreateWithDeclarations([record]);
    }

    function openCreateWithDeclarations(options: RbacPermissionDeclarationDto[]) {
        editingId.value = null;
        modalDeclarationOptions.value = options;
        applyDeclarationToForm(options[0]);
        modalVisible.value = true;
        clearPermissionFormValidation();
    }

    function openCreateDatabase() {
        editingId.value = null;
        modalDeclarationOptions.value = [];
        applyEmptyPermissionToForm();
        modalVisible.value = true;
        clearPermissionFormValidation();
    }

    function openEditDeclaration(record: RbacPermissionDeclarationDto) {
        if (!record.permission) {
            Message.warning("这条后端声明还没有入库，不能编辑数据库权限");
            return;
        }
        editingId.value = record.permission.id;
        modalDeclarationOptions.value = [record];
        applyDeclarationToForm(record, record.permission);
        modalVisible.value = true;
        clearPermissionFormValidation();
    }

    function openEditDatabase(record: RbacPermissionDto) {
        editingId.value = record.id;
        modalDeclarationOptions.value = [];
        applyPermissionToForm(record);
        modalVisible.value = true;
        clearPermissionFormValidation();
    }

    function syncPermissionForm(value: Partial<typeof form>) {
        const previousDeclarationKey = form.declarationKey;
        Object.assign(form, value);
        if (modalDeclarationOptions.value.length > 0 && !form.declarationKey) {
            form.declarationKey =
                previousDeclarationKey || modalDeclarationOptions.value[0]?.declarationKey || "";
        }
    }

    function clearPermissionFormValidation() {
        void nextTick(() => {
            const formEl = permissionFormApi.value?.formEl?.();
            const formInstance =
                formEl && "clearValidate" in formEl
                    ? formEl
                    : ((formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.proxy ??
                      (formEl as { proxy?: unknown; exposed?: unknown } | undefined)?.exposed);
            (formInstance as { clearValidate?: () => void } | undefined)?.clearValidate?.();
        });
    }

    function handleFormDeclarationChange(value: unknown) {
        const declaration = modalDeclarationOptions.value.find(
            (item) => item.declarationKey === value,
        );
        if (declaration) {
            applyDeclarationToForm(declaration);
        }
    }

    function applyDeclarationToForm(
        declaration: RbacPermissionDeclarationDto,
        permission?: RbacPermissionDto,
    ) {
        form.declarationKey = declaration.declarationKey;
        form.code = declaration.permissionCode;
        form.name = permission?.name ?? declaration.name ?? declaration.permissionCode;
        form.description = permission?.description ?? declaration.description ?? "";
        form.kind =
            permission?.kind ??
            (declaration.kind as RbacPermissionKind | undefined) ??
            RbacPermissionKind.ACTION;
        form.groupId = permission?.groupId ?? undefined;
        form.sort = permission?.sort ?? 1000;
        form.isBuiltin = permission?.isBuiltin ?? false;
        form.status = permission?.status ?? RbacStatus.ENABLE;
    }

    function applyPermissionToForm(permission: RbacPermissionDto) {
        form.declarationKey = "";
        form.code = permission.code;
        form.name = permission.name;
        form.description = permission.description ?? "";
        form.kind = permission.kind;
        form.groupId = permission.groupId ?? undefined;
        form.sort = permission.sort;
        form.isBuiltin = permission.isBuiltin;
        form.status = permission.status;
    }

    function applyEmptyPermissionToForm() {
        form.declarationKey = "";
        form.code = "";
        form.name = "";
        form.description = "";
        form.kind = RbacPermissionKind.ACTION;
        form.groupId = undefined;
        form.sort = 1000;
        form.isBuiltin = false;
        form.status = RbacStatus.ENABLE;
    }

    function buildPayload() {
        return {
            code: form.code.trim(),
            name: form.name.trim(),
            description: form.description,
            kind: form.kind,
            groupId: form.groupId ?? null,
            sort: form.sort,
            isBuiltin: form.isBuiltin,
            status: form.status,
        };
    }

    function validateForm() {
        if (!form.code.trim()) {
            Message.warning("请输入权限编码 permissionCode");
            return false;
        }
        if (!form.name.trim()) {
            Message.warning("请输入权限名称");
            return false;
        }
        return true;
    }

    function getPermissionGroupName(groupId?: number | null) {
        if (!groupId) {
            return "未分组";
        }
        const group = permissionGroups.value.find((item) => item.id === groupId);
        return group ? group.name : `分组 ${groupId}`;
    }

    async function submitPermission() {
        try {
            await permissionFormApi.value?.validate();
        } catch {
            return false;
        }
        if (!validateForm()) {
            return false;
        }
        submitting.value = true;
        try {
            const payload = buildPayload();
            if (editingId.value) {
                await updateRbacPermissionApi(editingId.value, payload);
            } else {
                await createRbacPermissionApi(payload);
            }
            Message.success("权限已保存");
            await loadDeclarationBoard();
            await databaseTableAction.value?.reload();
            return true;
        } finally {
            submitting.value = false;
        }
    }

    async function removePermission(record: RbacPermissionDto) {
        await deleteRbacPermissionApi(record.id);
        Message.success("权限已删除");
        await loadDeclarationBoard();
        await databaseTableAction.value?.reload();
    }

    async function openRelations(record: RbacPermissionDto) {
        relations.value = null;
        draftRoleIds.value = [];
        savedRoleIds.value = [];
        drawerVisible.value = true;
        drawerLoading.value = true;
        try {
            const response = await getRbacPermissionRelationsApi(record.id);
            relations.value = response.data;
            draftRoleIds.value = [...response.data.roleIds];
            savedRoleIds.value = [...response.data.roleIds];
        } finally {
            drawerLoading.value = false;
        }
    }

    async function savePermissionRoles() {
        if (!relations.value) {
            return;
        }
        savingRoles.value = true;
        try {
            await assignRbacPermissionRolesApi({
                permissionId: relations.value.permission.id,
                roleIds: draftRoleIds.value,
            });
            const response = await getRbacPermissionRelationsApi(relations.value.permission.id);
            relations.value = response.data;
            draftRoleIds.value = [...response.data.roleIds];
            savedRoleIds.value = [...response.data.roleIds];
            await roleAction.value?.reload();
            Message.success("权限授权角色已保存");
        } finally {
            savingRoles.value = false;
        }
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
    .permission-board {
        display: grid;
        grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
        gap: 16px;
        align-items: stretch;
    }

    .permission-board__tree,
    .permission-board__detail {
        min-width: 0;
    }

    .permission-tree-search {
        flex: 0 0 auto;
        margin-bottom: 12px;
    }

    .declaration-table-frame {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
    }

    .declaration-table-frame :deep(.gi-table) {
        height: 100%;
    }

    .declaration-table-frame :deep(.arco-table) {
        display: flex;
        height: 100%;
        min-height: 0;
        flex-direction: column;
    }

    .declaration-table-frame :deep(.arco-spin) {
        height: 100%;
    }

    .declaration-table-frame :deep(.arco-spin-children) {
        display: flex;
        height: 100%;
        min-height: 0;
        flex-direction: column;
    }

    .declaration-table-frame :deep(.arco-table-container) {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
    }

    .declaration-table-frame :deep(.arco-table-content) {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        min-height: 0;
    }
    .declaration-table-frame :deep(.arco-table-body) {
        flex: 1 1 auto;
        min-height: 0;
    }

    :deep(.declaration-tree-scrollbar .arco-tree) {
        height: 100%;
        min-width: 100%;
    }

    :deep(.declaration-tree-scrollbar .arco-virtual-list) {
        height: 100%;
        min-width: 100%;
        overflow-x: auto;
        overflow-y: auto;
    }

    :deep(.declaration-tree-scrollbar .arco-tree-node) {
        width: max-content;
        min-width: 100%;
    }

    :deep(.declaration-tree-scrollbar .arco-tree-node-title-block) {
        flex: 0 0 auto;
    }

    .declaration-tree-title {
        display: inline-flex;
        align-items: center;
        min-width: max-content;
        gap: 6px;
        vertical-align: middle;
    }

    .declaration-tree-title__text {
        white-space: nowrap;
    }

    .declaration-tree-extra {
        display: inline-flex;
        align-items: center;
        min-width: max-content;
    }

    .permission-form-source {
        margin-bottom: 16px;
    }

    .permission-rule-alert {
        margin-bottom: 12px;
    }

    @media (max-width: 1024px) {
        .permission-board {
            grid-template-columns: 1fr;
        }
    }
</style>
