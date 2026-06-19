<template>
    <a-modal
        v-model:visible="relationshipCreateVisible"
        title="新增 Relationship"
        width="620px"
        unmount-on-close
        :confirm-loading="relationshipSubmitting"
        @before-ok="submitRelationshipCreate"
    >
        <form-create
            :model-value="relationshipCreateForm"
            :rule="relationshipCreateRules"
            :option="formOptions"
            @update:model-value="syncRelationshipCreateForm"
        />
    </a-modal>

    <a-modal
        v-model:visible="relationshipDeleteVisible"
        title="删除 Relationship"
        width="560px"
        :confirm-loading="relationshipDeleting"
        @before-ok="submitRelationshipDelete"
    >
        <a-space
            direction="vertical"
            fill
        >
            <a-typography-paragraph class="tw:mb-0!">
                {{ relationshipDeleteSummary }}
            </a-typography-paragraph>
            <a-textarea
                v-model="relationshipDeleteReason"
                placeholder="请输入本次删除原因"
                :auto-size="{ minRows: 3, maxRows: 5 }"
            />
        </a-space>
    </a-modal>

    <a-modal
        v-model:visible="projectionReconcileVisible"
        title="投影对账"
        width="560px"
        unmount-on-close
        :confirm-loading="projectionReconcileSubmitting"
        @before-ok="submitProjectionReconcile"
    >
        <form-create
            :model-value="projectionReconcileForm"
            :rule="projectionReconcileRules"
            :option="formOptions"
            @update:model-value="syncProjectionReconcileForm"
        />
    </a-modal>

    <a-drawer
        v-model:visible="watchEventDetailVisible"
        title="事件详情"
        width="50vw"
        unmount-on-close
        :footer="false"
    >
        <a-spin
            :loading="watchEventDetailLoading"
            class="watch-event-detail-panel"
        >
            <div class="watch-event-detail-panel__content">
                <a-empty
                    v-if="!watchEventDetail"
                    description="请先选择事件查看详情"
                />
                <CodeViewer
                    v-else
                    :value="formatJson(watchEventDetail)"
                    language="json"
                    height="calc(100vh - 160px)"
                    readonly
                />
            </div>
        </a-spin>
    </a-drawer>

    <GiPageLayout>
        <a-tabs
            v-model:active-key="activeTab"
            class="spicedb-data-tabs"
        >
            <a-tab-pane
                key="overview"
                title="概览"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        :bordered="false"
                        :loading="projectionLoading"
                    >
                        <template #title>Schema</template>
                        <template #extra>
                            <a-button
                                type="primary"
                                :loading="schemaLoading"
                                @click="refreshSchema"
                            >
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                刷新
                            </a-button>
                        </template>
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-descriptions :column="{ xs: 1, md: 2, lg: 4 }">
                                <a-descriptions-item label="Definition">
                                    {{ schemaSummary.definitionCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="Relation">
                                    {{ schemaSummary.relationCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="Permission">
                                    {{ schemaSummary.permissionCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="Graph Nodes">
                                    {{ schemaGraph?.stats.nodeCount ?? 0 }}
                                </a-descriptions-item>
                            </a-descriptions>

                            <CodeViewer
                                :value="schemaState.schema"
                                language="spicedb"
                                height="360px"
                                readonly
                            />
                        </a-space>
                    </a-card>

                    <a-card :bordered="false">
                        <template #title>投影同步</template>
                        <template #extra>
                            <a-space wrap>
                                <a-tag :color="projectionStatusColor">
                                    {{ projectionStatusText }}
                                </a-tag>
                                <a-button
                                    size="small"
                                    :loading="projectionLoading"
                                    @click="refreshProjectionOverview"
                                >
                                    <template #icon>
                                        <icon-refresh />
                                    </template>
                                    检测
                                </a-button>
                                <ShiroAuth
                                    :permissions="SpiceDBDataPermissions.projectionReconcile"
                                >
                                    <a-button
                                        size="small"
                                        @click="openProjectionReconcile('dry_run')"
                                    >
                                        预检
                                    </a-button>
                                </ShiroAuth>
                                <ShiroAuth
                                    :permissions="SpiceDBDataPermissions.projectionReconcile"
                                >
                                    <a-button
                                        size="small"
                                        type="primary"
                                        @click="openProjectionReconcile('apply')"
                                    >
                                        应用
                                    </a-button>
                                </ShiroAuth>
                                <ShiroAuth
                                    :permissions="SpiceDBDataPermissions.projectionReconcile"
                                >
                                    <a-button
                                        size="small"
                                        status="warning"
                                        @click="openProjectionReconcile('rebuild')"
                                    >
                                        重建
                                    </a-button>
                                </ShiroAuth>
                            </a-space>
                        </template>

                        <div class="projection-sync-content">
                            <a-descriptions
                                v-if="projectionOverview"
                                :column="{ xs: 1, md: 2, lg: 4 }"
                            >
                                <a-descriptions-item label="检测时间">
                                    {{ formatDateTime(projectionOverview.checkedAt) }}
                                </a-descriptions-item>
                                <a-descriptions-item label="Lag">
                                    {{ projectionOverview.lag }}
                                </a-descriptions-item>
                                <a-descriptions-item label="最后事件">
                                    {{ formatNullableDateTime(projectionOverview.lastEventAt) }}
                                </a-descriptions-item>
                                <a-descriptions-item label="最近对账">
                                    {{ formatNullableDateTime(projectionOverview.lastReconcileAt) }}
                                </a-descriptions-item>
                            </a-descriptions>

                            <GiTable
                                class="projection-sync-table"
                                header-title="投影表对账结果"
                                row-key="key"
                                :columns="projectionColumns"
                                :data="projectionOverview?.tables ?? []"
                                :pagination="false"
                                :search="false"
                                :options="spiceDBTableOptions"
                                :columns-state="projectionColumnsState"
                                :scroll="{ x: '100%', y: 180, minWidth: 900 }"
                                :bordered="true"
                                :stripe="true"
                            />
                        </div>
                    </a-card>

                    <a-card :bordered="false">
                        <template #title>对账历史</template>
                        <template #extra>
                            <a-button
                                size="small"
                                :loading="projectionRunsLoading"
                                @click="refreshProjectionRuns"
                            >
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                刷新
                            </a-button>
                        </template>

                        <GiTable
                            header-title="对账任务"
                            row-key="id"
                            :columns="projectionRunColumns"
                            :data="projectionRuns"
                            :loading="projectionRunsLoading"
                            :pagination="{ pageSize: 6 }"
                            :search="false"
                            :options="spiceDBTableOptions"
                            :columns-state="projectionRunColumnsState"
                            :scroll="{ x: '100%', minWidth: 1180 }"
                        >
                            <template #status="{ record }">
                                <a-tag :color="getRunStatusColor(record.status)">
                                    {{ formatRunStatus(record.status) }}
                                </a-tag>
                            </template>
                            <template #startedAt="{ record }">
                                {{ formatDateTime(record.startedAt) }}
                            </template>
                            <template #duration="{ record }">
                                {{ formatDuration(record.durationMs) }}
                            </template>
                            <template #totalStats="{ record }">
                                {{ formatProjectionRunStats(record.totalStats) }}
                            </template>
                        </GiTable>
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="schema"
                title="Schema Graph"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        title="Definition"
                        :bordered="false"
                    >
                        <GiTable
                            header-title="Definition 列表"
                            row-key="name"
                            :columns="definitionColumns"
                            :data="schemaState.definitions"
                            :pagination="false"
                            :search="false"
                            :options="spiceDBTableOptions"
                            :columns-state="definitionColumnsState"
                            :scroll="{ x: '100%', minWidth: 720 }"
                        >
                            <template #relations="{ record }">
                                <a-space wrap>
                                    <a-tag
                                        v-for="relation in record.relations"
                                        :key="relation.name"
                                        color="arcoblue"
                                    >
                                        {{ relation.name }}
                                    </a-tag>
                                </a-space>
                            </template>
                            <template #permissions="{ record }">
                                <a-space wrap>
                                    <a-tag
                                        v-for="permission in record.permissions"
                                        :key="permission.name"
                                        color="green"
                                    >
                                        {{ permission.name }}
                                    </a-tag>
                                </a-space>
                            </template>
                        </GiTable>
                    </a-card>

                    <a-card
                        title="Graph Edges"
                        :bordered="false"
                    >
                        <GiTable
                            header-title="Graph Edge 列表"
                            row-key="id"
                            :columns="schemaEdgeColumns"
                            :data="schemaGraph?.edges ?? []"
                            :pagination="{ pageSize: 12 }"
                            :search="false"
                            :options="spiceDBTableOptions"
                            :columns-state="schemaEdgeColumnsState"
                            :scroll="{ x: '100%', minWidth: 900 }"
                        />
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="relationship-graph"
                title="关系图"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        :bordered="false"
                        title="SpiceDB 关系图"
                    >
                        <template #extra>
                            <a-button
                                size="small"
                                :loading="schemaLoading"
                                @click="refreshSchema"
                            >
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                刷新
                            </a-button>
                        </template>

                        <SpiceDBRelationshipFlowGraph
                            :loading="schemaLoading"
                            :error-message="''"
                            :graph="schemaGraph"
                            :definitions="schemaState.definitions"
                            :selected-definition="relationshipGraphSelectedDefinition"
                            :selected-edge-id="relationshipGraphSelectedEdgeId"
                            @refresh="refreshSchema"
                            @select-definition="handleRelationshipGraphSelectDefinition"
                            @select-edge="handleRelationshipGraphSelectEdge"
                        />
                    </a-card>

                    <a-card
                        :bordered="false"
                        title="SpiceDB G6 关系图"
                    >
                        <template #extra>
                            <a-button
                                size="small"
                                :loading="schemaLoading"
                                @click="refreshSchema"
                            >
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                刷新
                            </a-button>
                        </template>

                        <SpiceDBRelationshipG6Graph
                            :loading="schemaLoading"
                            :error-message="''"
                            :graph="schemaGraph"
                            :definitions="schemaState.definitions"
                            :selected-definition="relationshipGraphSelectedDefinition"
                            :selected-edge-id="relationshipGraphSelectedEdgeId"
                            @refresh="refreshSchema"
                            @select-definition="handleRelationshipGraphSelectDefinition"
                            @select-edge="handleRelationshipGraphSelectEdge"
                        />
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="relationships"
                title="Relationships"
            >
                <a-card :bordered="false">
                    <template #title>Relationship 查询</template>
                    <template #extra>
                        <a-space>
                            <a-button
                                :loading="relationshipExporting"
                                @click="exportRelationships('json')"
                            >
                                JSON 导出
                            </a-button>
                            <a-button
                                :loading="relationshipExporting"
                                @click="exportRelationships('csv')"
                            >
                                CSV 导出
                            </a-button>
                            <ShiroAuth :permissions="SpiceDBDataPermissions.relationshipCreate">
                                <a-button
                                    type="primary"
                                    @click="openRelationshipCreate"
                                >
                                    <template #icon>
                                        <icon-plus />
                                    </template>
                                    新增
                                </a-button>
                            </ShiroAuth>
                        </a-space>
                    </template>

                    <form-create
                        class="relationship-search"
                        :model-value="relationshipQuery"
                        :rule="relationshipQueryRules"
                        :option="verticalSearchFormOptions"
                        @update:model-value="syncRelationshipQuery"
                    />

                    <GiTable
                        header-title="Relationship 列表"
                        row-key="rowKey"
                        :columns="relationshipColumns"
                        :data="relationshipRows"
                        :loading="relationshipLoading"
                        :pagination="false"
                        :search="false"
                        :options="spiceDBTableOptions"
                        :columns-state="relationshipColumnsState"
                        :scroll="{ x: '100%', minWidth: 1020 }"
                    >
                        <template #resource="{ record }">
                            <a-tag>{{ formatObjectRef(record.resource) }}</a-tag>
                        </template>
                        <template #subject="{ record }">
                            <a-tag>{{ formatSubjectRef(record.subject) }}</a-tag>
                        </template>
                        <template #action="{ record }">
                            <ShiroAuth :permissions="SpiceDBDataPermissions.relationshipDelete">
                                <a-link
                                    status="danger"
                                    @click="openRelationshipDelete(record)"
                                >
                                    删除
                                </a-link>
                            </ShiroAuth>
                        </template>
                    </GiTable>
                    <a-space
                        class="relationship-cursor-actions"
                        align="center"
                    >
                        <a-button
                            :loading="relationshipLoading"
                            :disabled="relationshipCursorHistory.length === 0"
                            @click="loadPreviousRelationshipPage"
                        >
                            上一批
                        </a-button>
                        <a-button
                            type="primary"
                            :loading="relationshipLoading"
                            :disabled="!relationshipHasMore"
                            @click="loadNextRelationshipPage"
                        >
                            下一批
                        </a-button>
                        <a-select
                            v-model="relationshipQuery.pageSize"
                            :options="relationshipPageSizeOptions"
                            size="small"
                            :trigger-props="{
                                autoFitPopupWidth: false,
                                autoFitPopupMinWidth: true,
                            }"
                            @change="handleRelationshipPageSizeChange"
                        />
                        <a-typography-text type="secondary">
                            Cursor 分页，不统计总数
                        </a-typography-text>
                    </a-space>
                </a-card>
            </a-tab-pane>

            <a-tab-pane
                key="permission-check"
                title="Permission Check"
            >
                <a-card :bordered="false">
                    <template #title>Permission 检查</template>
                    <div class="permission-check-form">
                        <form-create
                            :model-value="permissionCheckForm"
                            :rule="permissionCheckRules"
                            :option="formOptions"
                            @update:model-value="syncPermissionCheckForm"
                        />
                        <ShiroAuth :permissions="SpiceDBDataPermissions.permissionCheck">
                            <a-button
                                type="primary"
                                :loading="permissionChecking"
                                @click="submitPermissionCheck"
                            >
                                检查权限
                            </a-button>
                        </ShiroAuth>
                    </div>

                    <a-descriptions
                        v-if="permissionCheckResult"
                        class="permission-check-result"
                        :column="{ xs: 1, md: 2, lg: 4 }"
                    >
                        <a-descriptions-item label="Resource">
                            {{ formatObjectRef(permissionCheckResult.resource) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Permission">
                            {{ permissionCheckResult.permission }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Subject">
                            {{ formatSubjectRef(permissionCheckResult.subject) }}
                        </a-descriptions-item>
                        <a-descriptions-item label="Permissionship">
                            <a-tag
                                :color="
                                    getPermissionshipColor(permissionCheckResult.permissionship)
                                "
                            >
                                {{ formatPermissionship(permissionCheckResult.permissionship) }}
                            </a-tag>
                        </a-descriptions-item>
                    </a-descriptions>
                </a-card>
            </a-tab-pane>

            <a-tab-pane
                key="permission-explain"
                title="Explain / Why"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        title="权限路径解释"
                        :bordered="false"
                    >
                        <div>
                            <form-create
                                :model-value="permissionExplainForm"
                                :rule="permissionExplainRules"
                                :option="formOptions"
                                @update:model-value="syncPermissionExplainForm"
                            />
                            <ShiroAuth :permissions="SpiceDBDataPermissions.permissionExplain">
                                <a-button
                                    type="primary"
                                    :loading="permissionExplaining"
                                    @click="submitPermissionExplain"
                                >
                                    解释权限
                                </a-button>
                            </ShiroAuth>
                        </div>

                        <a-empty
                            v-if="!permissionExplainResult"
                            description="暂无解释结果"
                        />
                        <a-space
                            v-else
                            direction="vertical"
                            fill
                            class="permission-check-result"
                        >
                            <a-descriptions :column="{ xs: 1, md: 2, lg: 4 }">
                                <a-descriptions-item label="User">
                                    {{ permissionExplainResult.userId }}
                                </a-descriptions-item>
                                <a-descriptions-item label="Target">
                                    {{
                                        permissionExplainResult.target.title ||
                                        permissionExplainResult.target.permission ||
                                        permissionExplainResult.target.menuId ||
                                        "-"
                                    }}
                                </a-descriptions-item>
                                <a-descriptions-item label="SpiceDB">
                                    <a-tag
                                        :color="
                                            permissionExplainResult.spiceDbAllowed ? 'green' : 'red'
                                        "
                                    >
                                        {{
                                            permissionExplainResult.spiceDbAllowed ? "允许" : "拒绝"
                                        }}
                                    </a-tag>
                                </a-descriptions-item>
                                <a-descriptions-item label="Business">
                                    <a-tag
                                        :color="
                                            permissionExplainResult.businessAllowed
                                                ? 'green'
                                                : 'red'
                                        "
                                    >
                                        {{
                                            permissionExplainResult.businessAllowed
                                                ? "允许"
                                                : "拒绝"
                                        }}
                                    </a-tag>
                                </a-descriptions-item>
                            </a-descriptions>
                            <a-alert
                                v-if="permissionExplainResult.missingReasons.length > 0"
                                type="warning"
                                :content="permissionExplainResult.missingReasons.join(' / ')"
                            />
                            <a-descriptions :column="{ xs: 1, md: 3 }">
                                <a-descriptions-item label="直接角色路径">
                                    {{ permissionExplainResult.directRolePaths.length }}
                                </a-descriptions-item>
                                <a-descriptions-item label="用户组角色路径">
                                    {{ permissionExplainResult.groupRolePaths.length }}
                                </a-descriptions-item>
                                <a-descriptions-item label="系统管理员">
                                    {{
                                        permissionExplainResult.systemAdminPath.viaUser
                                            ? "用户直连"
                                            : `${permissionExplainResult.systemAdminPath.viaRoles.length} 个角色`
                                    }}
                                </a-descriptions-item>
                            </a-descriptions>
                            <CodeViewer
                                :value="formatJson(permissionExplainResult)"
                                language="json"
                                height="360px"
                                readonly
                            />
                        </a-space>
                    </a-card>

                    <a-card
                        title="批量 Permission Check"
                        :bordered="false"
                    >
                        <a-space
                            direction="vertical"
                            fill
                        >
                            <a-space wrap>
                                <ShiroAuth
                                    :permissions="SpiceDBDataPermissions.permissionBatchCheck"
                                >
                                    <a-button @click="addPermissionBatchRow">
                                        添加当前检查项
                                    </a-button>
                                </ShiroAuth>
                                <ShiroAuth
                                    :permissions="SpiceDBDataPermissions.permissionBatchCheck"
                                >
                                    <a-button
                                        type="primary"
                                        :loading="permissionBatchChecking"
                                        @click="submitPermissionBatchCheck"
                                    >
                                        批量检查
                                    </a-button>
                                </ShiroAuth>
                                <a-button @click="clearPermissionBatchRows">清空</a-button>
                            </a-space>
                            <a-alert
                                type="info"
                                content="批量检查会使用 Permission Check tab 当前表单追加检查项。"
                            />
                            <GiTable
                                header-title="批量检查结果"
                                row-key="index"
                                :columns="batchCheckColumns"
                                :data="permissionBatchResults"
                                :loading="permissionBatchChecking"
                                :pagination="{ pageSize: 8 }"
                                :search="false"
                                :options="spiceDBTableOptions"
                                :columns-state="batchCheckColumnsState"
                                :scroll="{ x: '100%', minWidth: 980 }"
                            >
                                <template #resource="{ record }">
                                    <a-tag>{{ formatObjectRef(record.resource) }}</a-tag>
                                </template>
                                <template #subject="{ record }">
                                    <a-tag>{{ formatSubjectRef(record.subject) }}</a-tag>
                                </template>
                                <template #permissionship="{ record }">
                                    <a-tag :color="getPermissionshipColor(record.permissionship)">
                                        {{ formatPermissionship(record.permissionship) }}
                                    </a-tag>
                                </template>
                            </GiTable>
                        </a-space>
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="schema-publish"
                title="Schema 发布"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        title="发布预览"
                        :bordered="false"
                        :loading="schemaPublishLoading"
                    >
                        <template #extra>
                            <a-space>
                                <a-button
                                    :loading="schemaPublishLoading"
                                    @click="refreshSchemaPublishData({ forceSchema: true })"
                                >
                                    <template #icon>
                                        <icon-refresh />
                                    </template>
                                    刷新远端
                                </a-button>
                                <a-button
                                    :disabled="!schemaPublishPreview"
                                    @click="resetSchemaDraft"
                                >
                                    重置草稿
                                </a-button>
                                <a-button
                                    :loading="schemaPublishLoading"
                                    @click="refreshSchemaPublishPreview"
                                >
                                    刷新差异
                                </a-button>
                            </a-space>
                        </template>
                        <a-empty
                            v-if="!schemaPublishPreview"
                            description="暂无发布预览"
                        />
                        <a-space
                            v-else
                            direction="vertical"
                            fill
                        >
                            <a-descriptions :column="{ xs: 1, md: 2, lg: 4 }">
                                <a-descriptions-item label="下一版本">
                                    {{ schemaPublishPreview.version }}
                                </a-descriptions-item>
                                <a-descriptions-item label="有变更">
                                    <a-tag
                                        :color="
                                            schemaPublishPreview.hasChanges ? 'orange' : 'green'
                                        "
                                    >
                                        {{ schemaPublishPreview.hasChanges ? "是" : "否" }}
                                    </a-tag>
                                </a-descriptions-item>
                                <a-descriptions-item label="当前 Hash">
                                    {{ schemaPublishPreview.schemaHash }}
                                </a-descriptions-item>
                                <a-descriptions-item label="上一 Hash">
                                    {{ schemaPublishPreview.previousSchemaHash ?? "-" }}
                                </a-descriptions-item>
                            </a-descriptions>
                            <a-alert
                                v-if="schemaPublishPreview.rollbackHint"
                                type="info"
                                :content="schemaPublishPreview.rollbackHint"
                            />
                            <section class="schema-publish-section">
                                <div class="schema-publish-section__title">可编辑差异草稿</div>
                                <CodeDiffViewer
                                    :original="schemaPublishPreview.remoteSchema"
                                    v-model:value="schemaPublishForm.schemaText"
                                    language="spicedb"
                                    height="560px"
                                    :minimap="true"
                                />
                            </section>
                            <div>
                                <form-create
                                    :model-value="schemaPublishForm"
                                    :rule="schemaPublishRules"
                                    :option="formOptions"
                                    @update:model-value="syncSchemaPublishForm"
                                />
                                <ShiroAuth :permissions="SpiceDBDataPermissions.schemaPublish">
                                    <a-button
                                        type="primary"
                                        status="warning"
                                        :loading="schemaPublishSubmitting"
                                        @click="submitSchemaPublish"
                                    >
                                        发布 Schema
                                    </a-button>
                                </ShiroAuth>
                            </div>
                        </a-space>
                    </a-card>

                    <a-card
                        title="发布历史"
                        :bordered="false"
                    >
                        <GiTable
                            header-title="Schema 发布记录"
                            row-key="id"
                            :columns="schemaPublicationColumns"
                            :data="schemaPublications"
                            :loading="schemaPublishLoading"
                            :pagination="{ pageSize: 8 }"
                            :search="false"
                            :options="spiceDBTableOptions"
                            :columns-state="schemaPublicationColumnsState"
                            :scroll="{ x: '100%', minWidth: 1180 }"
                        >
                            <template #status="{ record }">
                                <a-tag :color="getGenericStatusColor(record.status)">
                                    {{ record.status }}
                                </a-tag>
                            </template>
                            <template #publishedAt="{ record }">
                                {{ formatDateTime(record.publishedAt) }}
                            </template>
                        </GiTable>
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="relationship-bulk"
                title="Relationship 批量"
            >
                <a-card
                    title="批量导入 / 修复"
                    :bordered="false"
                >
                    <a-space
                        direction="vertical"
                        fill
                    >
                        <div>
                            <form-create
                                :model-value="relationshipImportForm"
                                :rule="relationshipImportRules"
                                :option="formOptions"
                                @update:model-value="syncRelationshipImportForm"
                            />
                            <a-space>
                                <ShiroAuth :permissions="SpiceDBDataPermissions.relationshipBulk">
                                    <a-button
                                        :loading="relationshipImportLoading"
                                        @click="previewRelationshipImport"
                                    >
                                        预览
                                    </a-button>
                                </ShiroAuth>
                                <ShiroAuth :permissions="SpiceDBDataPermissions.relationshipBulk">
                                    <a-button
                                        type="primary"
                                        :loading="relationshipImportApplying"
                                        @click="applyRelationshipImport"
                                    >
                                        执行导入
                                    </a-button>
                                </ShiroAuth>
                            </a-space>
                        </div>

                        <a-empty
                            v-if="!relationshipImportPreview"
                            description="暂无导入预览"
                        />
                        <a-space
                            v-else
                            direction="vertical"
                            fill
                        >
                            <a-descriptions :column="{ xs: 1, md: 3, lg: 5 }">
                                <a-descriptions-item label="总行数">
                                    {{ relationshipImportPreview.summary.totalRows }}
                                </a-descriptions-item>
                                <a-descriptions-item label="新增">
                                    {{ relationshipImportPreview.summary.createCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="删除">
                                    {{ relationshipImportPreview.summary.deleteCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="跳过">
                                    {{ relationshipImportPreview.summary.skippedCount }}
                                </a-descriptions-item>
                                <a-descriptions-item label="非法">
                                    {{ relationshipImportPreview.summary.invalidCount }}
                                </a-descriptions-item>
                            </a-descriptions>
                            <a-alert
                                v-if="relationshipImportApplyResult?.zedToken"
                                type="success"
                                :content="`ZedToken: ${relationshipImportApplyResult.zedToken}`"
                            />
                            <CodeViewer
                                :value="relationshipImportPreview.repairScript"
                                language="plaintext"
                                height="260px"
                                readonly
                            />
                            <CodeViewer
                                v-if="relationshipImportPreview.invalidRows.length > 0"
                                :value="formatJson(relationshipImportPreview.invalidRows)"
                                language="json"
                                height="220px"
                                readonly
                            />
                        </a-space>
                    </a-space>
                </a-card>
            </a-tab-pane>

            <a-tab-pane
                key="watch-events"
                title="DLQ / Watch 回放"
            >
                <a-space
                    direction="vertical"
                    fill
                    size="large"
                >
                    <a-card
                        title="Watch 事件"
                        :bordered="false"
                    >
                        <form-create
                            class="relationship-search"
                            :model-value="watchEventQuery"
                            :rule="watchEventQueryRules"
                            :option="watchEventSearchOptions"
                            @update:model-value="syncWatchEventQuery"
                        />
                        <a-space
                            class="watch-operation-bar"
                            wrap
                        >
                            <a-input
                                v-model="watchEventOperationForm.reason"
                                placeholder="回放/处理原因"
                                class="watch-operation-reason"
                            />
                            <ShiroAuth :permissions="SpiceDBDataPermissions.watchReplay">
                                <a-button
                                    status="warning"
                                    :loading="watchEventOperating"
                                    @click="replaySelectedWatchEvents"
                                >
                                    回放选中
                                </a-button>
                            </ShiroAuth>
                            <ShiroAuth :permissions="SpiceDBDataPermissions.watchHandle">
                                <a-button
                                    type="primary"
                                    :loading="watchEventOperating"
                                    @click="markSelectedWatchEventsHandled"
                                >
                                    标记已处理
                                </a-button>
                            </ShiroAuth>
                        </a-space>
                        <GiTable
                            v-model:selectedKeys="selectedWatchEventKeys"
                            header-title="Watch/DLQ 事件"
                            row-key="rowKey"
                            :row-selection="watchEventRowSelection"
                            :columns="watchEventColumns"
                            :data="watchEventRows"
                            :loading="watchEventsLoading"
                            :pagination="watchEventPagination"
                            :search="false"
                            :options="spiceDBTableOptions"
                            :columns-state="watchEventColumnsState"
                            :scroll="{ x: '100%', minWidth: 1280 }"
                            @page-change="handleWatchEventPageChange"
                            @page-size-change="handleWatchEventPageSizeChange"
                        >
                            <template #watchStatus="{ record }">
                                <a-tag :color="getGenericStatusColor(record.status)">
                                    {{ record.status }}
                                </a-tag>
                            </template>
                            <template #createdAt="{ record }">
                                {{ formatDateTime(record.createdAt) }}
                            </template>
                            <template #watchAction="{ record }">
                                <a-link @click="openWatchEventDetail(record)">详情</a-link>
                            </template>
                        </GiTable>
                    </a-card>
                </a-space>
            </a-tab-pane>

            <a-tab-pane
                key="health"
                title="健康看板"
            >
                <a-card
                    title="SpiceDB 权限链路健康"
                    :bordered="false"
                    :loading="healthLoading"
                >
                    <template #extra>
                        <a-space>
                            <ShiroAuth :permissions="SpiceDBDataPermissions.projectionReconcile">
                                <a-button
                                    type="primary"
                                    :loading="healthProjectionRefreshing"
                                    @click="refreshProjectionHealthSnapshot"
                                >
                                    <template #icon>
                                        <icon-refresh />
                                    </template>
                                    刷新投影健康
                                </a-button>
                            </ShiroAuth>
                            <a-button
                                :loading="healthLoading"
                                @click="refreshHealthOverview"
                            >
                                <template #icon>
                                    <icon-refresh />
                                </template>
                                刷新快照
                            </a-button>
                        </a-space>
                    </template>
                    <a-empty
                        v-if="!healthOverview"
                        description="暂无健康数据"
                    />
                    <a-space
                        v-else
                        direction="vertical"
                        fill
                    >
                        <a-descriptions :column="{ xs: 1, md: 2, lg: 4 }">
                            <a-descriptions-item label="检测时间">
                                {{ formatDateTime(healthOverview.checkedAt) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="SpiceDB">
                                <a-tag :color="healthOverview.spicedb.healthy ? 'green' : 'red'">
                                    {{ healthOverview.spicedb.healthy ? "健康" : "异常" }}
                                </a-tag>
                            </a-descriptions-item>
                            <a-descriptions-item label="Latency">
                                {{ formatDuration(healthOverview.spicedb.latencyMs) }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Kafka Lag">
                                {{ healthOverview.kafka.lag }}
                            </a-descriptions-item>
                            <a-descriptions-item label="DLQ 未处理">
                                {{ healthOverview.dlq.unhandledCount }}
                            </a-descriptions-item>
                            <a-descriptions-item label="投影差异">
                                {{ healthOverview.projection.driftCount ?? "未检查" }}
                            </a-descriptions-item>
                            <a-descriptions-item label="Check 错误率">
                                {{ healthOverview.check.errorRate }}
                            </a-descriptions-item>
                            <a-descriptions-item label="最近对账">
                                {{
                                    formatNullableDateTime(
                                        healthOverview.projection.lastReconcileAt,
                                    )
                                }}
                            </a-descriptions-item>
                            <a-descriptions-item label="投影快照">
                                <a-space>
                                    <a-tag
                                        v-if="healthOverview.projection.snapshotStatus"
                                        :color="
                                            getGenericStatusColor(
                                                healthOverview.projection.snapshotStatus,
                                            )
                                        "
                                    >
                                        {{ healthOverview.projection.snapshotStatus }}
                                    </a-tag>
                                    <span>
                                        {{
                                            formatNullableDateTime(
                                                healthOverview.projection.lastCheckedAt,
                                            )
                                        }}
                                    </span>
                                </a-space>
                            </a-descriptions-item>
                            <a-descriptions-item label="投影模式">
                                {{ healthOverview.projection.lastMode ?? "未检查" }}
                            </a-descriptions-item>
                        </a-descriptions>
                        <div class="health-chart">
                            <VChart :option="healthChartOption" />
                        </div>
                        <a-space
                            v-if="healthOverview.alerts.length > 0"
                            direction="vertical"
                            fill
                        >
                            <a-alert
                                v-for="alert in healthOverview.alerts"
                                :key="alert.key"
                                :type="
                                    alert.level === 'critical'
                                        ? 'error'
                                        : alert.level === 'warning'
                                          ? 'warning'
                                          : 'info'
                                "
                                :content="alert.message"
                            >
                                <template #title>
                                    <a-tag :color="getHealthAlertColor(alert.level)">
                                        {{ alert.level }}
                                    </a-tag>
                                </template>
                            </a-alert>
                        </a-space>
                    </a-space>
                </a-card>
            </a-tab-pane>
        </a-tabs>
    </GiPageLayout>
</template>

<script setup lang="ts">
    import {
        applySpiceDBRelationshipImportApi,
        batchCheckSpiceDBPermissionsApi,
        exportSpiceDBRelationshipsApi,
        createSpiceDBRelationshipApi,
        deleteSpiceDBRelationshipApi,
        checkSpiceDBPermissionApi,
        explainSpiceDBPermissionApi,
        getSpiceDBHealthApi,
        getSpiceDBProjectionSyncOverviewApi,
        getSpiceDBProjectionReconcileRunsApi,
        getSpiceDBRelationshipsApi,
        getSpiceDBSchemaApi,
        getSpiceDBSchemaGraphApi,
        getSpiceDBSchemaPublicationsApi,
        getSpiceDBSchemaPublishPreviewApi,
        getSpiceDBWatchEventApi,
        getSpiceDBWatchEventsApi,
        markSpiceDBWatchEventsHandledApi,
        previewSpiceDBRelationshipImportApi,
        publishSpiceDBSchemaApi,
        reconcileSpiceDBProjectionApi,
        replaySpiceDBWatchEventsApi,
        type SpiceDBObjectRef,
        type SpiceDBHealthOverview,
        type SpiceDBPermissionBatchCheckItemResult,
        type SpiceDBPermissionCheckResult,
        type SpiceDBPermissionExplainResult,
        type SpiceDBProjectionReconcileMode,
        type SpiceDBProjectionReconcileRun,
        type SpiceDBProjectionSyncOverview,
        type SpiceDBRelationshipImportApplyResult,
        type SpiceDBRelationshipImportFormat,
        type SpiceDBRelationshipImportPreview,
        type SpiceDBRelationshipRecord,
        type SpiceDBSchemaDefinition,
        type SpiceDBSchemaGraphResponse,
        type SpiceDBSchemaPublication,
        type SpiceDBSchemaPublishPreview,
        type SpiceDBSubjectRef,
        type SpiceDBWatchEvent,
    } from "@/api/spicedb-data";
    import { GiPageLayout } from "@/components/GiPageLayout";
    import { GiTable, type ProColumns } from "@/components/GiTable";
    import { CodeDiffViewer, CodeViewer } from "@/components/CodeViewer";
    import ShiroAuth from "@/components/ShiroAuth.vue";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import SpiceDBRelationshipG6Graph from "./components/SpiceDBRelationshipG6Graph.vue";
    import SpiceDBRelationshipFlowGraph from "./components/SpiceDBRelationshipFlowGraph.vue";
    import { Message } from "@arco-design/web-vue";
    import { BarChart, PieChart } from "echarts/charts";
    import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
    import { use } from "echarts/core";
    import { CanvasRenderer } from "echarts/renderers";
    import type { EChartsOption } from "echarts";
    import {
        computed,
        defineComponent,
        h,
        markRaw,
        onMounted,
        reactive,
        ref,
        resolveComponent,
        watch,
    } from "vue";
    import VChart from "vue-echarts";

    use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

    defineOptions({
        name: "SpiceDBData",
    });

    type RelationshipForm = {
        resourceType: string;
        resourceId: string;
        relation: string;
        subjectTargetKey: string;
        subjectId: string;
        reason: string;
    };

    type PermissionCheckForm = {
        resourceType: string;
        resourceId: string;
        permission: string;
        subjectType: string;
        subjectId: string;
        subjectRelation: string;
    };

    type PermissionBatchCheckRow = PermissionCheckForm & {
        rowKey: string;
    };

    type RelationshipRow = SpiceDBRelationshipRecord & {
        rowKey: string;
    };

    type WatchEventRow = SpiceDBWatchEvent & {
        rowKey: number;
    };

    type SelectOption = {
        label: string;
        value: string;
    };

    type SpiceDBDataTabKey =
        | "overview"
        | "schema"
        | "relationship-graph"
        | "relationships"
        | "permission-check"
        | "permission-explain"
        | "schema-publish"
        | "relationship-bulk"
        | "watch-events"
        | "health";

    const activeTab = ref<SpiceDBDataTabKey>("overview");
    const schemaLoading = ref(false);
    const projectionLoading = ref(false);
    const projectionRunsLoading = ref(false);
    const relationshipLoading = ref(false);
    const permissionChecking = ref(false);
    const permissionBatchChecking = ref(false);
    const permissionExplaining = ref(false);
    const schemaPublishLoading = ref(false);
    const schemaPublishSubmitting = ref(false);
    const relationshipImportLoading = ref(false);
    const relationshipImportApplying = ref(false);
    const relationshipExporting = ref(false);
    const watchEventsLoading = ref(false);
    const watchEventDetailLoading = ref(false);
    const watchEventDetailVisible = ref(false);
    const watchEventOperating = ref(false);
    const healthLoading = ref(false);
    const healthProjectionRefreshing = ref(false);
    const relationshipSubmitting = ref(false);
    const relationshipDeleting = ref(false);
    const projectionReconcileSubmitting = ref(false);
    const relationshipCreateVisible = ref(false);
    const relationshipDeleteVisible = ref(false);
    const projectionReconcileVisible = ref(false);
    const schemaGraph = ref<SpiceDBSchemaGraphResponse | null>(null);
    const projectionOverview = ref<SpiceDBProjectionSyncOverview | null>(null);
    const projectionRuns = ref<SpiceDBProjectionReconcileRun[]>([]);
    const relationshipRows = ref<RelationshipRow[]>([]);
    const permissionCheckResult = ref<SpiceDBPermissionCheckResult | null>(null);
    const permissionBatchResults = ref<SpiceDBPermissionBatchCheckItemResult[]>([]);
    const permissionExplainResult = ref<SpiceDBPermissionExplainResult | null>(null);
    const schemaPublishPreview = ref<SpiceDBSchemaPublishPreview | null>(null);
    const schemaPublications = ref<SpiceDBSchemaPublication[]>([]);
    const relationshipImportPreview = ref<SpiceDBRelationshipImportPreview | null>(null);
    const relationshipImportApplyResult = ref<SpiceDBRelationshipImportApplyResult | null>(null);
    const watchEventRows = ref<WatchEventRow[]>([]);
    const selectedWatchEventKeys = ref<number[]>([]);
    const watchEventDetail = ref<SpiceDBWatchEvent | null>(null);
    const healthOverview = ref<SpiceDBHealthOverview | null>(null);
    const relationshipDeleteRecord = ref<SpiceDBRelationshipRecord | null>(null);
    const relationshipDeleteReason = ref("");
    const relationshipGraphSelectedDefinition = ref<string | null>(null);
    const relationshipGraphSelectedEdgeId = ref<string | null>(null);
    const relationshipCursor = ref<string | null>(null);
    const relationshipNextCursor = ref<string | null>(null);
    const relationshipHasMore = ref(false);
    const relationshipCursorHistory = ref<string[]>([]);
    const loadedTabs = reactive<Record<SpiceDBDataTabKey, boolean>>({
        "overview": false,
        "schema": false,
        "relationship-graph": false,
        "relationships": false,
        "permission-check": false,
        "permission-explain": false,
        "schema-publish": false,
        "relationship-bulk": false,
        "watch-events": false,
        "health": false,
    });
    let schemaLoadingPromise: Promise<void> | null = null;

    const schemaState = reactive<{
        schema: string;
        definitions: SpiceDBSchemaDefinition[];
    }>({
        schema: "",
        definitions: [],
    });

    const relationshipQuery = reactive({
        resourceType: "",
        resourceId: "",
        relation: "",
        subjectType: "",
        subjectId: "",
        subjectRelation: "",
        pageSize: 10,
    });

    const relationshipCreateForm = reactive<RelationshipForm>({
        resourceType: "",
        resourceId: "",
        relation: "",
        subjectTargetKey: "",
        subjectId: "",
        reason: "",
    });

    const permissionCheckForm = reactive<PermissionCheckForm>({
        resourceType: "",
        resourceId: "",
        permission: "",
        subjectType: "user",
        subjectId: "",
        subjectRelation: "",
    });

    const permissionBatchRows = ref<PermissionBatchCheckRow[]>([]);

    const permissionExplainForm = reactive({
        userId: "",
        menuId: "",
        permission: "",
    });

    const schemaPublishForm = reactive({
        schemaText: "",
        reason: "",
    });

    const relationshipImportForm = reactive<{
        format: SpiceDBRelationshipImportFormat;
        content: string;
        reason: string;
        filename: string;
    }>({
        format: "json",
        content: "",
        reason: "",
        filename: "",
    });

    const watchEventQuery = reactive({
        status: "",
        zedToken: "",
        offset: "",
        eventKey: "",
        onlyUnhandled: false,
        page: 1,
        pageSize: 20,
        total: 0,
    });

    const watchEventOperationForm = reactive({
        reason: "",
    });

    const projectionReconcileForm = reactive<{
        mode: SpiceDBProjectionReconcileMode;
        reason: string;
        zedToken: string;
    }>({
        mode: "dry_run",
        reason: "",
        zedToken: "",
    });

    const SpiceDBDataPermissions = {
        relationshipCreate: "system.spicedb.create-relationship",
        relationshipDelete: "system.spicedb.delete-relationship",
        permissionCheck: "system.spicedb.check-permission",
        permissionExplain: "system.spicedb.explain-permission",
        permissionBatchCheck: "system.spicedb.batch-check-permission",
        schemaPublish: "system.spicedb.publish-schema",
        relationshipBulk: "system.spicedb.bulk-relationship",
        watchReplay: "system.spicedb.replay-watch",
        watchHandle: "system.spicedb.handle-watch",
        projectionReconcile: "system.spicedb.reconcile-projection",
    };

    const relationshipImportFormatOptions = [
        { label: "JSON", value: "json" },
        { label: "CSV", value: "csv" },
    ];

    const watchEventStatusOptions = [
        { label: "全部", value: "" },
        { label: "已处理", value: "processed" },
        { label: "DLQ", value: "dlq" },
        { label: "失败", value: "failed" },
    ];

    const projectionReconcileModeOptions = [
        { label: "预检", value: "dry_run" },
        { label: "应用修复", value: "apply" },
        { label: "重建投影", value: "rebuild" },
    ];
    const relationshipImportFileInputComponent = markRaw(
        defineComponent({
            name: "RelationshipImportFileInput",
            inheritAttrs: false,
            props: {
                modelValue: {
                    type: String,
                    default: "",
                },
                filename: {
                    type: String,
                    default: "",
                },
                onFileChange: {
                    type: Function,
                    required: true,
                },
            },
            setup(props, { attrs }) {
                const TypographyText = resolveComponent("a-typography-text");
                const Space = resolveComponent("a-space");

                return () =>
                    h(Space, { direction: "vertical", size: "mini", fill: true }, () => [
                        h("input", {
                            ...attrs,
                            type: "file",
                            accept: ".json,.csv,application/json,text/csv,text/plain",
                            onChange: (event: Event) => props.onFileChange(event),
                        }),
                        props.filename
                            ? h(TypographyText, { type: "secondary" }, () => props.filename)
                            : null,
                    ]);
            },
        }),
    );
    const formOptions: FormCreateOptions = {
        form: { layout: "vertical" },
        row: { gutter: 12 },
        // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
        col: { span: 24 },
        submitBtn: false,
        resetBtn: false,
    };
    const verticalSearchFormOptions = computed<FormCreateOptions>(() => ({
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
            loading: relationshipLoading.value,
            click: searchRelationshipsFromStart,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetRelationshipQuery,
        },
    }));
    const watchEventSearchOptions = computed<FormCreateOptions>(() => ({
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
            loading: watchEventsLoading.value,
            click: searchWatchEvents,
        },
        resetBtn: {
            show: true,
            type: "secondary",
            size: "small",
            innerText: "重置",
            click: resetWatchEventQuery,
        },
    }));
    const relationshipCreateRules = computed<FormCreateRule[]>(() => [
        createSelectRule(
            "resourceType",
            "Resource Type",
            definitionOptions.value,
            {
                allowClear: false,
                triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
                onChange: handleCreateResourceTypeChange,
            },
            { span: 24 },
        ),
        createInputRule("resourceId", "Resource ID", {}, { span: 24 }),
        createSelectRule(
            "relation",
            "Relation",
            createRelationOptions.value,
            {
                allowClear: false,
                triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
                onChange: handleCreateRelationChange,
            },
            { span: 24 },
        ),
        createSelectRule(
            "subjectTargetKey",
            "Subject",
            createSubjectTargetOptions.value,
            {
                allowClear: false,
                triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
            },
            { span: 24 },
        ),
        createInputRule("subjectId", "Subject ID", {}, { span: 24 }),
        createInputRule("reason", "Reason", {}, { span: 24 }),
    ]);
    const projectionReconcileRules = computed<FormCreateRule[]>(() => [
        createSelectRule(
            "mode",
            "对账模式",
            projectionReconcileModeOptions,
            {
                allowClear: false,
                triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
            },
            { span: 24 },
        ),
        createTextareaRule("reason", "原因", { placeholder: "请输入本次对账原因" }),
        createInputRule("zedToken", "ZedToken", {
            placeholder: "可选，留空使用 fully consistent 读取",
        }),
    ]);
    const relationshipQueryRules = computed<FormCreateRule[]>(() => [
        createSelectRule("resourceType", "Resource Type", definitionOptions.value, {
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
            onChange: handleQueryResourceTypeChange,
        }),
        createInputRule("resourceId", "Resource ID", {}),
        createSelectRule("relation", "Relation", queryRelationOptions.value, {
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
        }),
        createInputRule("subjectType", "Subject Type", {}),
        createInputRule("subjectId", "Subject ID", {}),
        createInputRule("subjectRelation", "Subject Relation", {
            placeholder: "可选，如 assigned",
        }),
    ]);
    const permissionCheckRules = computed<FormCreateRule[]>(() => [
        createSelectRule("resourceType", "Resource Type", permissionResourceOptions.value, {
            allowClear: false,
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
            onChange: handlePermissionResourceTypeChange,
        }),
        createInputRule("resourceId", "Resource ID", {}),
        createSelectRule("permission", "Permission", permissionOptions.value, {
            allowClear: false,
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
        }),
        createSelectRule("subjectType", "Subject Type", subjectDefinitionOptions.value, {
            allowClear: false,
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
        }),
        createInputRule("subjectId", "Subject ID", {}),
        createInputRule("subjectRelation", "Subject Relation", {
            placeholder: "可选，如 assigned",
        }),
    ]);
    const permissionExplainRules: FormCreateRule[] = [
        createInputRule("userId", "User ID", {}),
        createInputRule("menuId", "Menu ID", {}),
        createInputRule("permission", "Permission", {}),
    ];
    const schemaPublishRules: FormCreateRule[] = [
        createTextareaRule("reason", "发布原因", { autoSize: { minRows: 3, maxRows: 5 } }),
    ];
    const relationshipImportRules = computed<FormCreateRule[]>(() => [
        createSelectRule(
            "format",
            "Format",
            relationshipImportFormatOptions,
            {
                allowClear: false,
                triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
            },
            { span: 24 },
        ),
        {
            field: "filename",
            title: "File",
            type: "relationshipImportFileInput",
            component: relationshipImportFileInputComponent,
            props: {
                filename: relationshipImportForm.filename,
                onFileChange: handleRelationshipImportFileChange,
            },
            col: { span: 24 },
        },
        createTextareaRule(
            "content",
            "Content",
            { autoSize: { minRows: 8, maxRows: 14 } },
            { span: 24 },
        ),
        createTextareaRule(
            "reason",
            "Reason",
            { autoSize: { minRows: 3, maxRows: 5 } },
            { span: 24 },
        ),
    ]);
    const watchEventQueryRules = computed<FormCreateRule[]>(() => [
        createSelectRule("status", "Status", watchEventStatusOptions, {
            triggerProps: { autoFitPopupWidth: false, autoFitPopupMinWidth: true },
        }),
        createInputRule("zedToken", "ZedToken", {}),
        createInputRule("offset", "Offset", {}),
        createInputRule("eventKey", "Event Key", {}),
        createSwitchRule("onlyUnhandled", "仅未处理", {
            checkedValue: true,
            uncheckedValue: false,
        }),
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

    const spiceDBTableOptions = {
        reload: true,
        density: true,
        setting: {
            draggable: true,
            checkable: true,
            checkedReset: true,
            showListItemOption: true,
        },
    };

    const projectionColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-projection-columns",
    } as const;

    const projectionRunColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-projection-run-columns",
    } as const;

    const definitionColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-definition-columns",
    } as const;

    const schemaEdgeColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-schema-edge-columns",
    } as const;

    const relationshipColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-relationship-columns",
    } as const;

    const schemaPublicationColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-schema-publication-columns",
    } as const;

    const watchEventColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-watch-event-columns",
    } as const;

    const batchCheckColumnsState = {
        persistenceType: "localStorage",
        persistenceKey: "system-spicedb-data-batch-check-columns",
    } as const;

    const definitionColumns: ProColumns[] = [
        { title: "Definition", dataIndex: "name", width: 180 },
        { title: "Relations", slotName: "relations" },
        { title: "Permissions", slotName: "permissions" },
    ];

    const schemaEdgeColumns: ProColumns[] = [
        { title: "Source", dataIndex: "source", ellipsis: true, tooltip: true },
        { title: "Type", dataIndex: "edgeType", width: 140 },
        { title: "Target", dataIndex: "target", ellipsis: true, tooltip: true },
        { title: "Label", dataIndex: "label", width: 180 },
    ];

    const projectionColumns: ProColumns[] = [
        { title: "投影表", dataIndex: "projectionTable", ellipsis: true, tooltip: true },
        { title: "SpiceDB Relation", dataIndex: "spiceDbRelation", ellipsis: true, tooltip: true },
        { title: "目标", dataIndex: "desiredCount", width: 100 },
        { title: "当前", dataIndex: "currentCount", width: 100 },
        { title: "缺失", dataIndex: "missingCount", width: 100 },
        { title: "多余", dataIndex: "staleCount", width: 100 },
    ];

    const projectionRunColumns: ProColumns[] = [
        { title: "模式", dataIndex: "mode", width: 100 },
        { title: "状态", slotName: "status", width: 120 },
        { title: "触发来源", dataIndex: "triggeredBy", width: 140 },
        { title: "原因", dataIndex: "reason", ellipsis: true, tooltip: true },
        { title: "开始时间", slotName: "startedAt", width: 190 },
        { title: "耗时", slotName: "duration", width: 100 },
        { title: "Total", slotName: "totalStats", width: 180 },
        { title: "错误", dataIndex: "error", ellipsis: true, tooltip: true },
    ];

    const relationshipColumns: ProColumns[] = [
        { title: "Resource", slotName: "resource", width: 240 },
        { title: "Relation", dataIndex: "relation", width: 160 },
        { title: "Subject", slotName: "subject", width: 260 },
        { title: "ZedToken", dataIndex: "zedToken", ellipsis: true, tooltip: true },
        { title: "操作", slotName: "action", width: 100, fixed: "right" },
    ];

    const batchCheckColumns: ProColumns[] = [
        { title: "Index", dataIndex: "index", width: 90 },
        { title: "Resource", slotName: "resource", width: 220 },
        { title: "Permission", dataIndex: "permission", width: 180 },
        { title: "Subject", slotName: "subject", width: 240 },
        { title: "Permissionship", slotName: "permissionship", width: 150 },
        { title: "ZedToken", dataIndex: "zedToken", ellipsis: true, tooltip: true },
    ];

    const schemaPublicationColumns: ProColumns[] = [
        { title: "版本", dataIndex: "version", width: 100 },
        { title: "状态", slotName: "status", width: 120 },
        { title: "Schema Hash", dataIndex: "schemaHash", ellipsis: true, tooltip: true },
        { title: "发布人", dataIndex: "publishedBy", width: 180 },
        { title: "发布时间", slotName: "publishedAt", width: 190 },
        { title: "原因", dataIndex: "reason", ellipsis: true, tooltip: true },
        { title: "错误", dataIndex: "error", ellipsis: true, tooltip: true },
    ];

    const watchEventColumns: ProColumns[] = [
        { title: "ID", dataIndex: "id", width: 90 },
        { title: "状态", slotName: "watchStatus", width: 120 },
        { title: "Operation", dataIndex: "operation", width: 130 },
        { title: "Offset", dataIndex: "offset", width: 120 },
        { title: "Event Key", dataIndex: "eventKey", ellipsis: true, tooltip: true },
        { title: "ZedToken", dataIndex: "zedToken", ellipsis: true, tooltip: true },
        { title: "Replay", dataIndex: "replayCount", width: 100 },
        { title: "创建时间", slotName: "createdAt", width: 190 },
        { title: "操作", slotName: "watchAction", width: 100, fixed: "right" },
    ];

    const schemaSummary = computed(() => {
        return {
            definitionCount: schemaState.definitions.length,
            relationCount: schemaState.definitions.reduce(
                (total, item) => total + item.relations.length,
                0,
            ),
            permissionCount: schemaState.definitions.reduce(
                (total, item) => total + item.permissions.length,
                0,
            ),
        };
    });

    const definitionOptions = computed<SelectOption[]>(() => {
        return schemaState.definitions
            .filter((definition) => definition.relations.length > 0)
            .map((definition) => ({
                label: definition.name,
                value: definition.name,
            }));
    });

    const queryRelationOptions = computed<SelectOption[]>(() => {
        return getRelationOptions(relationshipQuery.resourceType);
    });

    const createRelationOptions = computed<SelectOption[]>(() => {
        return getRelationOptions(relationshipCreateForm.resourceType);
    });

    const createSubjectTargetOptions = computed<SelectOption[]>(() => {
        return getSubjectTargetOptions(
            relationshipCreateForm.resourceType,
            relationshipCreateForm.relation,
        );
    });

    const permissionResourceOptions = computed<SelectOption[]>(() => {
        return schemaState.definitions
            .filter((definition) => definition.permissions.length > 0)
            .map((definition) => ({
                label: definition.name,
                value: definition.name,
            }));
    });

    const permissionOptions = computed<SelectOption[]>(() => {
        return getPermissionOptions(permissionCheckForm.resourceType);
    });

    const subjectDefinitionOptions = computed<SelectOption[]>(() => {
        return schemaState.definitions.map((definition) => ({
            label: definition.name,
            value: definition.name,
        }));
    });

    const projectionStatusText = computed(() => {
        if (!projectionOverview.value) {
            return "未检测";
        }
        return projectionOverview.value.status === "synced" ? "已同步" : "存在差异";
    });

    const projectionStatusColor = computed(() => {
        if (!projectionOverview.value) {
            return "gray";
        }
        return projectionOverview.value.status === "synced" ? "green" : "orange";
    });

    const relationshipPageSizeOptions = [10, 20, 50, 100].map((value) => ({
        label: `${value} 条`,
        value,
    }));

    const watchEventPagination = computed(() => ({
        current: watchEventQuery.page,
        pageSize: watchEventQuery.pageSize,
        total: watchEventQuery.total,
        showTotal: true,
        showPageSize: true,
    }));

    const watchEventRowSelection = computed(() => ({
        type: "checkbox" as const,
        showCheckedAll: true,
    }));

    const healthChartOption = computed<EChartsOption>(() => {
        const health = healthOverview.value;
        return {
            tooltip: { trigger: "item" },
            legend: { bottom: 0 },
            grid: { left: 32, right: 16, top: 24, bottom: 52 },
            xAxis: {
                type: "category",
                data: ["Kafka Lag", "DLQ", "Drift", "Check Failed"],
            },
            yAxis: { type: "value" },
            series: [
                {
                    type: "bar",
                    data: [
                        health?.kafka.lag ?? 0,
                        health?.dlq.unhandledCount ?? 0,
                        health?.projection.driftCount ?? 0,
                        health?.check.failed ?? 0,
                    ],
                    itemStyle: { color: "#3491fa" },
                },
            ],
        };
    });

    const relationshipDeleteSummary = computed(() => {
        return relationshipDeleteRecord.value
            ? `确定删除 ${formatRelationship(relationshipDeleteRecord.value)} 吗？`
            : "请选择要删除的 relationship";
    });

    /**
     * 当前关系图的选中定义。
     */
    function handleRelationshipGraphSelectDefinition(definitionName: string | null) {
        relationshipGraphSelectedDefinition.value = definitionName;
    }

    /**
     * 当前关系图的选中边。
     */
    function handleRelationshipGraphSelectEdge(edgeId: string | null) {
        relationshipGraphSelectedEdgeId.value = edgeId;
    }

    /**
     * 首屏只读取轻量概览数据；投影全量检测和其它 tab 首次进入时再触发对应请求。
     */
    async function loadInitialData() {
        await loadTabData(activeTab.value);
    }

    /**
     * 按 tab 首次进入加载数据，避免打开页面时同时触发全部运维接口。
     * projection-sync/overview 会全量扫描 SpiceDB 与本地投影，只在手动点击检测或写入后刷新。
     */
    async function loadTabData(tab: SpiceDBDataTabKey) {
        if (loadedTabs[tab]) {
            return;
        }

        if (tab === "overview") {
            await Promise.all([ensureSchemaLoaded(), refreshProjectionRuns()]);
        } else if (tab === "schema" || tab === "relationship-graph") {
            await ensureSchemaLoaded();
        } else if (tab === "relationships") {
            await ensureSchemaLoaded();
            await searchRelationships();
        } else if (tab === "permission-check" || tab === "permission-explain") {
            await ensureSchemaLoaded();
        } else if (tab === "schema-publish") {
            await refreshSchemaPublishData({ forceSchema: false });
        } else if (tab === "watch-events") {
            await searchWatchEvents();
        } else if (tab === "health") {
            await refreshHealthOverview();
        }

        loadedTabs[tab] = true;
    }

    /**
     * 复用当前 schema 请求，避免多个 tab/按钮并发时重复读取远端 schema。
     */
    async function ensureSchemaLoaded() {
        if (schemaState.schema && schemaGraph.value) {
            return;
        }
        await refreshSchema();
    }

    /**
     * 刷新 schema 文本和 graph，用于下拉选项和 graph tab 展示。
     */
    async function refreshSchema() {
        if (!schemaLoadingPromise) {
            schemaLoadingPromise = loadSchemaData().finally(() => {
                schemaLoadingPromise = null;
            });
        }
        await schemaLoadingPromise;
    }

    /**
     * 执行真实 schema 读取。
     */
    async function loadSchemaData() {
        schemaLoading.value = true;
        try {
            const [schemaResponse, graphResponse] = await Promise.all([
                getSpiceDBSchemaApi(),
                getSpiceDBSchemaGraphApi(),
            ]);
            schemaState.schema = schemaResponse.data.schema;
            schemaState.definitions = schemaResponse.data.definitions;
            schemaGraph.value = graphResponse.data;
            applySchemaDefaults();
        } finally {
            schemaLoading.value = false;
        }
    }

    /**
     * 刷新投影一致性概览。
     */
    async function refreshProjectionOverview() {
        projectionLoading.value = true;
        try {
            const response = await getSpiceDBProjectionSyncOverviewApi();
            projectionOverview.value = response.data;
        } finally {
            projectionLoading.value = false;
        }
    }

    /**
     * 刷新投影对账历史，便于排查最近一次 rebuild/apply 的结果。
     */
    async function refreshProjectionRuns() {
        projectionRunsLoading.value = true;
        try {
            const response = await getSpiceDBProjectionReconcileRunsApi(20);
            projectionRuns.value = response.data;
        } finally {
            projectionRunsLoading.value = false;
        }
    }

    /**
     * 刷新远端 schema 草稿、发布预览和最近发布记录。
     */
    async function refreshSchemaPublishData(options: { forceSchema?: boolean } = {}) {
        schemaPublishLoading.value = true;
        try {
            if (options.forceSchema || !schemaState.schema) {
                await refreshSchema();
            }

            schemaPublishForm.schemaText = schemaState.schema;
            const [previewResponse, publicationsResponse] = await Promise.all([
                getSpiceDBSchemaPublishPreviewApi({
                    schemaText: schemaPublishForm.schemaText,
                }),
                getSpiceDBSchemaPublicationsApi(),
            ]);
            schemaPublishPreview.value = previewResponse.data;
            schemaPublications.value = publicationsResponse.data;
        } finally {
            schemaPublishLoading.value = false;
        }
    }

    /**
     * 使用当前草稿刷新发布差异预览，不重新拉取远端 schema 到编辑器。
     */
    async function refreshSchemaPublishPreview() {
        const schemaText = schemaPublishForm.schemaText;
        if (!trimText(schemaText)) {
            Message.warning("Schema 草稿不能为空");
            return;
        }

        schemaPublishLoading.value = true;
        try {
            const [previewResponse, publicationsResponse] = await Promise.all([
                getSpiceDBSchemaPublishPreviewApi({ schemaText }),
                getSpiceDBSchemaPublicationsApi(),
            ]);
            schemaPublishPreview.value = previewResponse.data;
            schemaPublications.value = publicationsResponse.data;
        } finally {
            schemaPublishLoading.value = false;
        }
    }

    /**
     * 将 schema 草稿恢复为最近一次预览读取到的远端当前 schema。
     */
    function resetSchemaDraft() {
        const remoteSchema = schemaPublishPreview.value?.remoteSchema;
        if (!remoteSchema) {
            Message.warning("暂无可重置的远端 Schema");
            return;
        }

        schemaPublishForm.schemaText = remoteSchema;
        Message.success("已重置为远端当前 Schema");
    }

    function syncRelationshipCreateForm(value: Partial<RelationshipForm>) {
        Object.assign(relationshipCreateForm, value);
    }

    function syncProjectionReconcileForm(value: Partial<typeof projectionReconcileForm>) {
        Object.assign(projectionReconcileForm, value);
    }

    function syncRelationshipQuery(value: Partial<typeof relationshipQuery>) {
        Object.assign(relationshipQuery, value);
    }

    function syncPermissionCheckForm(value: Partial<PermissionCheckForm>) {
        Object.assign(permissionCheckForm, value);
    }

    function syncPermissionExplainForm(value: Partial<typeof permissionExplainForm>) {
        Object.assign(permissionExplainForm, value);
    }

    function syncSchemaPublishForm(value: Partial<typeof schemaPublishForm>) {
        Object.assign(schemaPublishForm, value);
    }

    function syncRelationshipImportForm(value: Partial<typeof relationshipImportForm>) {
        Object.assign(relationshipImportForm, value);
    }

    function syncWatchEventQuery(value: Partial<typeof watchEventQuery>) {
        Object.assign(watchEventQuery, value);
    }

    /**
     * 根据 schema relation 查询 SpiceDB relationships。
     */
    async function searchRelationships() {
        const resourceType = trimText(relationshipQuery.resourceType);
        if (!resourceType) {
            relationshipRows.value = [];
            relationshipNextCursor.value = null;
            relationshipHasMore.value = false;
            return;
        }

        relationshipLoading.value = true;
        try {
            const response = await getSpiceDBRelationshipsApi({
                resourceType,
                resourceId: trimText(relationshipQuery.resourceId) || undefined,
                relation: trimText(relationshipQuery.relation) || undefined,
                subjectType: trimText(relationshipQuery.subjectType) || undefined,
                subjectId: trimText(relationshipQuery.subjectId) || undefined,
                subjectRelation: trimText(relationshipQuery.subjectRelation) || undefined,
                pageSize: relationshipQuery.pageSize,
                cursor: relationshipCursor.value ?? undefined,
            });
            relationshipRows.value = response.data.records.map((record) => ({
                ...record,
                rowKey: createRelationshipKey(record),
            }));
            relationshipNextCursor.value = response.data.pagination.nextCursor;
            relationshipHasMore.value = response.data.pagination.hasMore;
        } finally {
            relationshipLoading.value = false;
        }
    }

    /**
     * 从第一批重新查询 relationships，并清空 cursor 历史。
     */
    async function searchRelationshipsFromStart() {
        relationshipCursor.value = null;
        relationshipNextCursor.value = null;
        relationshipHasMore.value = false;
        relationshipCursorHistory.value = [];
        await searchRelationships();
    }

    /**
     * 按 SpiceDB 返回的 next cursor 读取下一批 relationships。
     */
    function loadNextRelationshipPage() {
        if (!relationshipHasMore.value || !relationshipNextCursor.value) {
            return;
        }

        relationshipCursorHistory.value.push(relationshipCursor.value ?? "");
        relationshipCursor.value = relationshipNextCursor.value;
        void searchRelationships();
    }

    /**
     * 从本地 cursor 历史回退到上一批 relationships。
     */
    function loadPreviousRelationshipPage() {
        const previousCursor = relationshipCursorHistory.value.pop();
        if (previousCursor === undefined) {
            return;
        }

        relationshipCursor.value = previousCursor || null;
        void searchRelationships();
    }

    /**
     * 重置 relationship 查询条件并回到默认 resource type。
     */
    function resetRelationshipQuery() {
        relationshipQuery.resourceType = resolveDefaultResourceType();
        relationshipQuery.resourceId = "";
        relationshipQuery.relation = "";
        relationshipQuery.subjectType = "";
        relationshipQuery.subjectId = "";
        relationshipQuery.subjectRelation = "";
        void searchRelationshipsFromStart();
    }

    /**
     * 打开 relationship 新增弹窗并填入当前查询上下文。
     */
    function openRelationshipCreate() {
        relationshipCreateForm.resourceType =
            relationshipQuery.resourceType || resolveDefaultResourceType();
        relationshipCreateForm.resourceId = "";
        relationshipCreateForm.relation = "";
        relationshipCreateForm.subjectTargetKey = "";
        relationshipCreateForm.subjectId = "";
        relationshipCreateForm.reason = "";
        syncCreateRelationDefaults();
        relationshipCreateVisible.value = true;
    }

    /**
     * 提交 relationship TOUCH 写入。
     */
    async function submitRelationshipCreate() {
        const subjectTarget = parseSubjectTargetKey(relationshipCreateForm.subjectTargetKey);
        if (!validateRelationshipCreate(subjectTarget)) {
            return false;
        }

        relationshipSubmitting.value = true;
        try {
            await createSpiceDBRelationshipApi({
                resource: {
                    type: relationshipCreateForm.resourceType,
                    id: trimText(relationshipCreateForm.resourceId),
                },
                relation: relationshipCreateForm.relation,
                subject: {
                    type: subjectTarget?.type ?? "",
                    id: trimText(relationshipCreateForm.subjectId),
                    ...(subjectTarget?.relation ? { relation: subjectTarget.relation } : {}),
                },
                reason: trimText(relationshipCreateForm.reason),
            });
            Message.success("Relationship 写入成功");
            relationshipCreateVisible.value = false;
            relationshipQuery.resourceType = relationshipCreateForm.resourceType;
            relationshipQuery.resourceId = trimText(relationshipCreateForm.resourceId);
            relationshipQuery.relation = relationshipCreateForm.relation;
            await searchRelationshipsFromStart();
            await refreshProjectionOverview();
            return true;
        } finally {
            relationshipSubmitting.value = false;
        }
    }

    /**
     * 打开 relationship 删除弹窗。
     */
    function openRelationshipDelete(record: SpiceDBRelationshipRecord) {
        relationshipDeleteRecord.value = record;
        relationshipDeleteReason.value = "";
        relationshipDeleteVisible.value = true;
    }

    /**
     * 提交 relationship 精确删除。
     */
    async function submitRelationshipDelete() {
        const record = relationshipDeleteRecord.value;
        const reason = trimText(relationshipDeleteReason.value);
        if (!record) {
            Message.warning("请选择要删除的 relationship");
            return false;
        }
        if (!reason) {
            Message.warning("请输入本次删除原因");
            return false;
        }

        relationshipDeleting.value = true;
        try {
            await deleteSpiceDBRelationshipApi({
                ...record,
                reason,
            });
            Message.success("Relationship 已删除");
            relationshipDeleteVisible.value = false;
            relationshipDeleteRecord.value = null;
            await searchRelationshipsFromStart();
            await refreshProjectionOverview();
            return true;
        } finally {
            relationshipDeleting.value = false;
        }
    }

    /**
     * 打开投影对账弹窗。
     */
    function openProjectionReconcile(mode: SpiceDBProjectionReconcileMode) {
        projectionReconcileForm.mode = mode;
        projectionReconcileForm.reason = "";
        projectionReconcileForm.zedToken = "";
        projectionReconcileVisible.value = true;
    }

    /**
     * 提交投影对账任务。
     */
    async function submitProjectionReconcile() {
        const reason = trimText(projectionReconcileForm.reason);
        if (!reason) {
            Message.warning("请输入本次对账原因");
            return false;
        }

        projectionReconcileSubmitting.value = true;
        try {
            await reconcileSpiceDBProjectionApi({
                mode: projectionReconcileForm.mode,
                reason,
                ...(trimText(projectionReconcileForm.zedToken)
                    ? { zedToken: trimText(projectionReconcileForm.zedToken) }
                    : {}),
            });
            Message.success("投影对账已完成");
            projectionReconcileVisible.value = false;
            await refreshProjectionOverview();
            await refreshProjectionRuns();
            return true;
        } finally {
            projectionReconcileSubmitting.value = false;
        }
    }

    /**
     * 提交 permission check，按 SpiceDB resource/permission/subject 语义验证权限。
     */
    async function submitPermissionCheck() {
        if (!validatePermissionCheck()) {
            return;
        }

        permissionChecking.value = true;
        try {
            const response = await checkSpiceDBPermissionApi({
                resource: {
                    type: permissionCheckForm.resourceType,
                    id: trimText(permissionCheckForm.resourceId),
                },
                permission: permissionCheckForm.permission,
                subject: {
                    type: permissionCheckForm.subjectType,
                    id: trimText(permissionCheckForm.subjectId),
                    ...(trimText(permissionCheckForm.subjectRelation)
                        ? { relation: trimText(permissionCheckForm.subjectRelation) }
                        : {}),
                },
            });
            permissionCheckResult.value = response.data;
        } finally {
            permissionChecking.value = false;
        }
    }

    /**
     * 把当前单条 permission check 表单追加到批量检查列表。
     */
    function addPermissionBatchRow() {
        if (!validatePermissionCheck()) {
            return;
        }

        permissionBatchRows.value = [
            ...permissionBatchRows.value,
            {
                ...permissionCheckForm,
                resourceId: trimText(permissionCheckForm.resourceId),
                subjectId: trimText(permissionCheckForm.subjectId),
                subjectRelation: trimText(permissionCheckForm.subjectRelation),
                rowKey: `${Date.now()}::${permissionBatchRows.value.length}`,
            },
        ];
    }

    /**
     * 清空批量 permission check 输入和结果。
     */
    function clearPermissionBatchRows() {
        permissionBatchRows.value = [];
        permissionBatchResults.value = [];
    }

    /**
     * 执行批量 permission check。
     */
    async function submitPermissionBatchCheck() {
        if (permissionBatchRows.value.length === 0) {
            Message.warning("请先添加批量检查项");
            return;
        }

        permissionBatchChecking.value = true;
        try {
            const response = await batchCheckSpiceDBPermissionsApi({
                items: permissionBatchRows.value.map((row) => ({
                    resource: {
                        type: row.resourceType,
                        id: row.resourceId,
                    },
                    permission: row.permission,
                    subject: {
                        type: row.subjectType,
                        id: row.subjectId,
                        ...(row.subjectRelation ? { relation: row.subjectRelation } : {}),
                    },
                })),
            });
            permissionBatchResults.value = response.data.results;
        } finally {
            permissionBatchChecking.value = false;
        }
    }

    /**
     * 提交 Explain/Why 查询，解释用户权限命中路径。
     */
    async function submitPermissionExplain() {
        const userId = trimText(permissionExplainForm.userId);
        const menuId = trimText(permissionExplainForm.menuId);
        const permission = trimText(permissionExplainForm.permission);
        if (!userId) {
            Message.warning("请输入用户 ID");
            return;
        }
        if (!menuId && !permission) {
            Message.warning("请输入 Menu ID 或 Permission");
            return;
        }

        permissionExplaining.value = true;
        try {
            const response = await explainSpiceDBPermissionApi({
                userId,
                target: {
                    ...(menuId ? { menuId: Number(menuId) } : {}),
                    ...(permission ? { permission } : {}),
                },
            });
            permissionExplainResult.value = response.data;
        } finally {
            permissionExplaining.value = false;
        }
    }

    /**
     * 发布草稿 schema，并刷新预览、历史和当前 schema 展示。
     */
    async function submitSchemaPublish() {
        const reason = trimText(schemaPublishForm.reason);
        const schemaText = schemaPublishForm.schemaText;
        if (!trimText(schemaText)) {
            Message.warning("Schema 草稿不能为空");
            return;
        }
        if (!reason) {
            Message.warning("请输入发布原因");
            return;
        }

        schemaPublishSubmitting.value = true;
        try {
            await publishSpiceDBSchemaApi({ schemaText, reason });
            Message.success("Schema 发布完成");
            schemaPublishForm.reason = "";
            await refreshSchema();
            await refreshSchemaPublishData({ forceSchema: false });
        } finally {
            schemaPublishSubmitting.value = false;
        }
    }

    /**
     * 使用浏览器 File API 读取 relationship 批量导入文件内容。
     */
    async function handleRelationshipImportFileChange(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }

        relationshipImportForm.filename = file.name;
        relationshipImportForm.format = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
        relationshipImportForm.content = await file.text();
        relationshipImportPreview.value = null;
        relationshipImportApplyResult.value = null;
        input.value = "";
    }

    /**
     * 预览 relationship 批量导入差异。
     */
    async function previewRelationshipImport() {
        if (!trimText(relationshipImportForm.content)) {
            Message.warning("请先选择文件或粘贴导入内容");
            return;
        }

        relationshipImportLoading.value = true;
        try {
            const response = await previewSpiceDBRelationshipImportApi({
                format: relationshipImportForm.format,
                content: relationshipImportForm.content,
                ...(trimText(relationshipImportForm.reason)
                    ? { reason: trimText(relationshipImportForm.reason) }
                    : {}),
            });
            relationshipImportPreview.value = response.data;
            relationshipImportApplyResult.value = null;
        } finally {
            relationshipImportLoading.value = false;
        }
    }

    /**
     * 执行 relationship 批量导入。
     */
    async function applyRelationshipImport() {
        const reason = trimText(relationshipImportForm.reason);
        if (!trimText(relationshipImportForm.content)) {
            Message.warning("请先选择文件或粘贴导入内容");
            return;
        }
        if (!reason) {
            Message.warning("请输入批量导入原因");
            return;
        }

        relationshipImportApplying.value = true;
        try {
            const response = await applySpiceDBRelationshipImportApi({
                format: relationshipImportForm.format,
                content: relationshipImportForm.content,
                reason,
            });
            relationshipImportApplyResult.value = response.data;
            relationshipImportPreview.value = response.data;
            Message.success("Relationship 批量导入完成");
            await searchRelationshipsFromStart();
            await refreshProjectionOverview();
        } finally {
            relationshipImportApplying.value = false;
        }
    }

    /**
     * 导出当前 relationship 查询条件下的完整结果。
     */
    async function exportRelationships(format: SpiceDBRelationshipImportFormat) {
        const resourceType = trimText(relationshipQuery.resourceType);
        if (!resourceType) {
            Message.warning("请先选择 Resource Type");
            return;
        }

        relationshipExporting.value = true;
        try {
            const response = await exportSpiceDBRelationshipsApi({
                resourceType,
                resourceId: trimText(relationshipQuery.resourceId) || undefined,
                relation: trimText(relationshipQuery.relation) || undefined,
                subjectType: trimText(relationshipQuery.subjectType) || undefined,
                subjectId: trimText(relationshipQuery.subjectId) || undefined,
                subjectRelation: trimText(relationshipQuery.subjectRelation) || undefined,
                format,
            });
            downloadTextFile(response.data.filename, response.data.content);
            Message.success(`已导出 ${response.data.count} 条 relationships`);
        } finally {
            relationshipExporting.value = false;
        }
    }

    /**
     * 查询 Watch/DLQ 事件列表。
     */
    async function searchWatchEvents() {
        watchEventsLoading.value = true;
        try {
            const response = await getSpiceDBWatchEventsApi({
                status: trimText(watchEventQuery.status) || undefined,
                zedToken: trimText(watchEventQuery.zedToken) || undefined,
                offset: trimText(watchEventQuery.offset) || undefined,
                eventKey: trimText(watchEventQuery.eventKey) || undefined,
                onlyUnhandled: watchEventQuery.onlyUnhandled || undefined,
                page: watchEventQuery.page,
                pageSize: watchEventQuery.pageSize,
            });
            watchEventRows.value = response.data.records.map((record) => ({
                ...record,
                rowKey: record.id,
            }));
            watchEventQuery.total = response.data.pagination.total;
        } finally {
            watchEventsLoading.value = false;
        }
    }

    /**
     * 重置 Watch/DLQ 事件查询条件。
     */
    function resetWatchEventQuery() {
        watchEventQuery.status = "";
        watchEventQuery.zedToken = "";
        watchEventQuery.offset = "";
        watchEventQuery.eventKey = "";
        watchEventQuery.onlyUnhandled = false;
        watchEventQuery.page = 1;
        void searchWatchEvents();
    }

    /**
     * 打开 Watch/DLQ 事件详情。
     */
    async function openWatchEventDetail(record: SpiceDBWatchEvent) {
        watchEventDetailVisible.value = true;
        watchEventDetailLoading.value = true;
        watchEventDetail.value = null;
        try {
            const response = await getSpiceDBWatchEventApi(record.id);
            watchEventDetail.value = response.data;
        } finally {
            watchEventDetailLoading.value = false;
        }
    }

    /**
     * 回放已选择的 Watch/DLQ 事件。
     */
    async function replaySelectedWatchEvents() {
        await operateSelectedWatchEvents("replay");
    }

    /**
     * 标记已选择的 Watch/DLQ 事件为已处理。
     */
    async function markSelectedWatchEventsHandled() {
        await operateSelectedWatchEvents("handle");
    }

    /**
     * 执行 Watch/DLQ 事件批量操作。
     */
    async function operateSelectedWatchEvents(action: "replay" | "handle") {
        const reason = trimText(watchEventOperationForm.reason);
        if (selectedWatchEventKeys.value.length === 0) {
            Message.warning("请先选择 Watch 事件");
            return;
        }
        if (!reason) {
            Message.warning("请输入操作原因");
            return;
        }

        watchEventOperating.value = true;
        try {
            const api =
                action === "replay"
                    ? replaySpiceDBWatchEventsApi
                    : markSpiceDBWatchEventsHandledApi;
            const response = await api({
                ids: selectedWatchEventKeys.value,
                reason,
            });
            Message.success(
                `操作完成：成功 ${response.data.affectedCount}，失败 ${response.data.failedCount}`,
            );
            selectedWatchEventKeys.value = [];
            await searchWatchEvents();
        } finally {
            watchEventOperating.value = false;
        }
    }

    /**
     * 刷新健康看板。
     */
    async function refreshHealthOverview() {
        healthLoading.value = true;
        try {
            const response = await getSpiceDBHealthApi();
            healthOverview.value = response.data;
        } finally {
            healthLoading.value = false;
        }
    }

    /**
     * 触发一次带分布式锁的 dry-run 对账，并用结果刷新健康页投影快照。
     */
    async function refreshProjectionHealthSnapshot() {
        healthProjectionRefreshing.value = true;
        try {
            await reconcileSpiceDBProjectionApi({
                mode: "dry_run",
                reason: "health projection dry-run refresh",
            });
            Message.success("投影健康快照已刷新");
            await Promise.all([refreshHealthOverview(), refreshProjectionRuns()]);
        } finally {
            healthProjectionRefreshing.value = false;
        }
    }

    /**
     * 切换查询 resource type 时清理依赖字段。
     */
    function handleQueryResourceTypeChange() {
        relationshipQuery.resourceId = "";
        relationshipQuery.relation = "";
        relationshipQuery.subjectType = "";
        relationshipQuery.subjectId = "";
        relationshipQuery.subjectRelation = "";
        relationshipCursor.value = null;
        relationshipNextCursor.value = null;
        relationshipHasMore.value = false;
        relationshipCursorHistory.value = [];
    }

    /**
     * 切换新增 resource type 时重置 relation 和 subject target。
     */
    function handleCreateResourceTypeChange() {
        relationshipCreateForm.relation = "";
        relationshipCreateForm.subjectTargetKey = "";
        syncCreateRelationDefaults();
    }

    /**
     * 切换新增 relation 时同步 subject target 默认值。
     */
    function handleCreateRelationChange() {
        relationshipCreateForm.subjectTargetKey = "";
        syncCreateSubjectDefaults();
    }

    /**
     * 切换 permission check 的 resource type 时同步 permission 默认值。
     */
    function handlePermissionResourceTypeChange() {
        permissionCheckForm.permission = "";
        syncPermissionDefaults();
        permissionCheckResult.value = null;
    }

    /**
     * 处理 relationship 表格 page size 变化。
     */
    function handleRelationshipPageSizeChange(
        pageSize:
            | string
            | number
            | boolean
            | Record<string, unknown>
            | Array<string | number | boolean | Record<string, unknown>>,
    ) {
        const normalizedPageSize = Number(pageSize);
        if (!Number.isInteger(normalizedPageSize)) {
            return;
        }
        relationshipQuery.pageSize = normalizedPageSize;
        void searchRelationshipsFromStart();
    }

    /**
     * 处理 Watch 事件表格页码变化。
     */
    function handleWatchEventPageChange(page: number) {
        watchEventQuery.page = page;
        void searchWatchEvents();
    }

    /**
     * 处理 Watch 事件表格 page size 变化。
     */
    function handleWatchEventPageSizeChange(pageSize: number) {
        watchEventQuery.page = 1;
        watchEventQuery.pageSize = pageSize;
        void searchWatchEvents();
    }

    /**
     * 根据 schema 设置查询和新增表单默认值。
     */
    function applySchemaDefaults() {
        if (
            !definitionOptions.value.some(
                (option) => option.value === relationshipQuery.resourceType,
            )
        ) {
            relationshipQuery.resourceType = resolveDefaultResourceType();
        }
        if (
            !definitionOptions.value.some(
                (option) => option.value === relationshipCreateForm.resourceType,
            )
        ) {
            relationshipCreateForm.resourceType = resolveDefaultResourceType();
        }
        syncCreateRelationDefaults();
        syncPermissionDefaults();
        if (
            !subjectDefinitionOptions.value.some(
                (option) => option.value === permissionCheckForm.subjectType,
            )
        ) {
            permissionCheckForm.subjectType = subjectDefinitionOptions.value[0]?.value ?? "user";
        }
    }

    /**
     * 选择第一个带 relation 的 definition 作为默认 resource type。
     */
    function resolveDefaultResourceType() {
        return definitionOptions.value[0]?.value ?? "";
    }

    /**
     * 选择第一个带 permission 的 definition 作为 permission check 默认 resource type。
     */
    function resolveDefaultPermissionResourceType() {
        return permissionResourceOptions.value[0]?.value ?? "";
    }

    /**
     * 根据 resource type 返回 relation 下拉项。
     */
    function getRelationOptions(resourceType: string): SelectOption[] {
        return (
            schemaState.definitions
                .find((definition) => definition.name === resourceType)
                ?.relations.map((relation) => ({
                    label: relation.name,
                    value: relation.name,
                })) ?? []
        );
    }

    /**
     * 根据 resource type 返回 permission 下拉项。
     */
    function getPermissionOptions(resourceType: string): SelectOption[] {
        return (
            schemaState.definitions
                .find((definition) => definition.name === resourceType)
                ?.permissions.map((permission) => ({
                    label: permission.name,
                    value: permission.name,
                })) ?? []
        );
    }

    /**
     * 根据 resource relation 返回 subject target 下拉项。
     */
    function getSubjectTargetOptions(resourceType: string, relationName: string): SelectOption[] {
        const relation = schemaState.definitions
            .find((definition) => definition.name === resourceType)
            ?.relations.find((item) => item.name === relationName);
        return (
            relation?.targets.map((target) => ({
                label: formatSubjectTarget(target.type, target.relation),
                value: createSubjectTargetKey(target.type, target.relation),
            })) ?? []
        );
    }

    /**
     * 同步新增表单 relation 和 subject target 默认值。
     */
    function syncCreateRelationDefaults() {
        const relationOptions = getRelationOptions(relationshipCreateForm.resourceType);
        if (!relationOptions.some((option) => option.value === relationshipCreateForm.relation)) {
            relationshipCreateForm.relation = relationOptions[0]?.value ?? "";
        }
        syncCreateSubjectDefaults();
    }

    /**
     * 同步新增表单 subject target 默认值。
     */
    function syncCreateSubjectDefaults() {
        const targetOptions = getSubjectTargetOptions(
            relationshipCreateForm.resourceType,
            relationshipCreateForm.relation,
        );
        if (
            !targetOptions.some(
                (option) => option.value === relationshipCreateForm.subjectTargetKey,
            )
        ) {
            relationshipCreateForm.subjectTargetKey = targetOptions[0]?.value ?? "";
        }
    }

    /**
     * 同步 permission check 表单默认 resource type 和 permission。
     */
    function syncPermissionDefaults() {
        if (
            !permissionResourceOptions.value.some(
                (option) => option.value === permissionCheckForm.resourceType,
            )
        ) {
            permissionCheckForm.resourceType = resolveDefaultPermissionResourceType();
        }

        const options = getPermissionOptions(permissionCheckForm.resourceType);
        if (!options.some((option) => option.value === permissionCheckForm.permission)) {
            permissionCheckForm.permission = options[0]?.value ?? "";
        }
    }

    /**
     * 校验 relationship 新增表单必填项。
     */
    function validateRelationshipCreate(subjectTarget: { type: string; relation?: string } | null) {
        if (!relationshipCreateForm.resourceType || !trimText(relationshipCreateForm.resourceId)) {
            Message.warning("请输入 Resource");
            return false;
        }
        if (
            !relationshipCreateForm.relation ||
            !subjectTarget ||
            !trimText(relationshipCreateForm.subjectId)
        ) {
            Message.warning("请输入 Subject");
            return false;
        }
        if (!trimText(relationshipCreateForm.reason)) {
            Message.warning("请输入本次新增原因");
            return false;
        }
        return true;
    }

    /**
     * 校验 permission check 表单，避免无效空值提交给后端。
     */
    function validatePermissionCheck() {
        if (!permissionCheckForm.resourceType || !trimText(permissionCheckForm.resourceId)) {
            Message.warning("请输入 Resource");
            return false;
        }
        if (!permissionCheckForm.permission) {
            Message.warning("请选择 Permission");
            return false;
        }
        if (!permissionCheckForm.subjectType || !trimText(permissionCheckForm.subjectId)) {
            Message.warning("请输入 Subject");
            return false;
        }
        return true;
    }

    /**
     * 生成 subject target select key。
     */
    function createSubjectTargetKey(type: string, relation?: string) {
        return `${type}::${relation ?? ""}`;
    }

    /**
     * 解析 subject target select key。
     */
    function parseSubjectTargetKey(key: string): { type: string; relation?: string } | null {
        if (!key) {
            return null;
        }
        const [type, relation] = key.split("::");
        return {
            type,
            ...(relation ? { relation } : {}),
        };
    }

    /**
     * 格式化 subject target，供下拉和文本展示共用。
     */
    function formatSubjectTarget(type: string, relation?: string) {
        return relation ? `${type}#${relation}` : type;
    }

    /**
     * 格式化 resource 引用。
     */
    function formatObjectRef(ref: SpiceDBObjectRef) {
        return `${ref.type}:${ref.id}`;
    }

    /**
     * 格式化 subject 引用。
     */
    function formatSubjectRef(ref: SpiceDBSubjectRef) {
        return `${formatSubjectTarget(ref.type, ref.relation)}:${ref.id}`;
    }

    /**
     * 格式化完整 relationship。
     */
    function formatRelationship(record: SpiceDBRelationshipRecord) {
        return `${formatObjectRef(record.resource)}#${record.relation}@${formatSubjectRef(record.subject)}`;
    }

    /**
     * 把未知 JSON 值格式化成 Monaco 可展示文本。
     */
    function formatJson(value: unknown) {
        if (value === null || value === undefined) {
            return "";
        }
        return JSON.stringify(value, null, 2);
    }

    /**
     * 格式化对账任务状态。
     */
    function formatRunStatus(status: string) {
        if (status === "succeeded") {
            return "成功";
        }
        if (status === "failed") {
            return "失败";
        }
        return status || "-";
    }

    /**
     * 根据对账任务状态返回标签颜色。
     */
    function getRunStatusColor(status: string) {
        if (status === "succeeded") {
            return "green";
        }
        if (status === "failed") {
            return "red";
        }
        return "gray";
    }

    /**
     * 根据发布或 Watch 状态返回标签颜色。
     */
    function getGenericStatusColor(status: string) {
        if (["succeeded", "processed", "published", "handled"].includes(status)) {
            return "green";
        }
        if (["failed", "dlq"].includes(status)) {
            return "red";
        }
        return "orange";
    }

    /**
     * 根据健康告警等级返回标签颜色。
     */
    function getHealthAlertColor(level: string) {
        if (level === "critical") {
            return "red";
        }
        if (level === "warning") {
            return "orange";
        }
        return "blue";
    }

    /**
     * 格式化 permission check 的权限判定结果。
     */
    function formatPermissionship(permissionship: string) {
        if (permissionship === "HAS_PERMISSION" || permissionship === "has_permission") {
            return "允许";
        }
        if (permissionship === "NO_PERMISSION" || permissionship === "no_permission") {
            return "拒绝";
        }
        return permissionship || "-";
    }

    /**
     * 根据 permission check 判定结果返回标签颜色。
     */
    function getPermissionshipColor(permissionship: string) {
        if (permissionship === "HAS_PERMISSION" || permissionship === "has_permission") {
            return "green";
        }
        if (permissionship === "NO_PERMISSION" || permissionship === "no_permission") {
            return "red";
        }
        return "orange";
    }

    /**
     * 为 relationship 表格生成稳定行 key。
     */
    function createRelationshipKey(record: SpiceDBRelationshipRecord) {
        return [
            record.resource.type,
            record.resource.id,
            record.relation,
            record.subject.type,
            record.subject.id,
            record.subject.relation ?? "",
        ].join("::");
    }

    /**
     * 去除输入首尾空白。
     */
    function trimText(value: string | null | undefined) {
        return (value ?? "").trim();
    }

    /**
     * 在浏览器中下载后端返回的文本内容。
     */
    function downloadTextFile(filename: string, content: string) {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * 格式化日期时间。
     */
    function formatDateTime(value: string) {
        return value ? new Date(value).toLocaleString() : "-";
    }

    /**
     * 格式化耗时毫秒数。
     */
    function formatDuration(value: number | null) {
        if (value === null || value === undefined) {
            return "-";
        }
        return `${value}ms`;
    }

    /**
     * 格式化可空日期时间。
     */
    function formatNullableDateTime(value: string | null) {
        return value ? formatDateTime(value) : "-";
    }

    /**
     * 格式化对账历史中的统计快照。
     */
    function formatProjectionRunStats(stats: Record<string, unknown> | null) {
        if (!stats) {
            return "-";
        }
        const missing = Number(stats.missingCount ?? 0);
        const stale = Number(stats.staleCount ?? 0);
        const desired = Number(stats.desiredCount ?? 0);
        const current = Number(stats.currentCount ?? 0);
        return `${current}/${desired}，缺 ${missing}，多 ${stale}`;
    }

    onMounted(() => {
        void loadInitialData();
    });

    watch(activeTab, (tab) => {
        void loadTabData(tab);
    });
</script>

<style scoped lang="scss">
    .spicedb-data-tabs {
        min-width: 0;
    }

    .schema-text {
        margin-top: 16px;
        font-family: var(--font-code);
    }

    .projection-sync-content {
        display: flex;
        gap: 16px;
        min-height: 300px;
        min-width: 0;
        flex-direction: column;
    }

    .projection-sync-table {
        flex: 1;
        min-height: 260px;
    }

    .projection-sync-table :deep(.gi-table__container) {
        min-height: 210px;
    }

    .relationship-search {
        margin-bottom: 16px;
    }

    .permission-check-form {
        margin-bottom: 16px;
    }

    .permission-check-result {
        margin-top: 16px;
    }

    .schema-publish-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .schema-publish-section__title {
        color: var(--color-text-1);
        font-size: 14px;
        font-weight: 600;
        line-height: 22px;
    }

    .watch-operation-bar {
        margin: 8px 0 16px;
    }

    .watch-operation-reason {
        width: min(420px, 100%);
    }

    .watch-event-detail-panel {
        width: 100%;
        min-width: 0;
    }

    .watch-event-detail-panel :deep(.arco-spin-children) {
        width: 100%;
        min-width: 0;
    }

    .watch-event-detail-panel__content {
        width: 100%;
        min-width: 0;
    }

    .health-chart {
        width: 100%;
        height: 320px;
        min-height: 320px;
    }

    .health-chart :deep(.echarts) {
        width: 100%;
        height: 100%;
    }
</style>
