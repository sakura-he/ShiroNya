import { BusinessException, ErrorCodes, createRuntimeLogger } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import type {
    ConsistencyOption,
    RelationshipInput,
    RelationshipOperation,
    RelationshipOutput
} from '@spicedb-toolkit/core';
import { Injectable } from '@nestjs/common';
import { Traceable } from 'nestjs-otel';
import { AdminErrorCodes } from '../../common/constants/index';
import { AdminSpiceDbClientFactory } from './admin-spicedb-client.factory';
import {
    CORE_MANAGER_RELATIONS,
    type CoreManagerRelation,
    type CoreManagerResourceType
} from './core-manager-authz.constants';
import { attachSpiceDbDebugTraces, collectSpiceDbDebugTraces } from './spicedb-debug-trace';

const ADMIN_SYSTEM_ID = 'admin';
const ENABLED_WILDCARD_USER_ID = '*';
const MENU_VIEWER_RELATION = 'viewer';
const MENU_MANAGER_RELATION = 'manager';
const TASK_RESOURCE_TYPE = 'task';
const TASK_MANAGER_RESOURCE_TYPE = 'task_manager';
const TASK_MANAGER_RESOURCE_ID = 'default';
const TASK_PERMISSION_VIEW = 'view';
const TASK_MANAGER_SYSTEM_RELATION = 'system';
const TASK_PARENT_MANAGER_RELATION = 'manager';
const TASK_CREATOR_RELATION = 'creator';
const TASK_MANAGER_ROLE_RELATIONS = {
    view: 'viewer',
    create: 'creator',
    update: 'updater',
    delete: 'deleter',
    run: 'runner',
    manage: 'manager'
} as const;
const MANAGER_RESOURCE_ID = 'default';
const RESOURCE_AUTHZ_MANAGER_RELATIONS = {
    admin_user: {
        relation: 'manager',
        managerType: 'user_manager'
    },
    role: {
        relation: 'authz_manager',
        managerType: 'role_manager'
    },
    menu: {
        relation: 'authz_manager',
        managerType: 'menu_manager'
    },
    user_group: {
        relation: 'authz_manager',
        managerType: 'user_group_manager'
    }
} as const;

type ResourceRef = {
    type: string;
    id: string;
};

type SubjectRef = {
    type: string;
    id: string;
    relation?: string;
};

export type RoleAssignmentRefs = {
    userIds: string[];
    userGroupIds: number[];
};

export type AdminSpiceDbRelationshipFilter = {
    resourceType: string;
    resourceId?: string;
    relation?: string;
    consistency?: ConsistencyOption;
    pageSize?: number;
    cursor?: string;
    subject?: {
        type: string;
        id?: string;
        relation?: string;
    };
};

export type AdminSpiceDbRelationshipReadResult = {
    relationships: RelationshipOutput[];
    zedToken?: string;
    cursor?: string;
    hasMore: boolean;
};

export type AdminSpiceDbRelationshipWriteResult = {
    zedToken?: string;
};

export type AdminSpiceDbPermissionCheckInput = {
    resource: ResourceRef;
    permission: string;
    subject: SubjectRef;
    context?: Record<string, unknown>;
    consistency?: ConsistencyOption;
};

export type AdminSpiceDbPermissionBatchCheckInput = {
    items: AdminSpiceDbPermissionCheckInput[];
    consistency?: ConsistencyOption;
};

export type AdminSpiceDbPermissionLookupResourcesInput = {
    resourceType: string;
    permission: string;
    subject: SubjectRef;
    context?: Record<string, unknown>;
    consistency?: ConsistencyOption;
};

export type AdminSpiceDbPermissionLookupSubjectsInput = {
    resource: ResourceRef;
    permission: string;
    subjectType: string;
    subjectRelation?: string;
    context?: Record<string, unknown>;
    consistency?: ConsistencyOption;
};

export type UserGroupMemberRelation = {
    userId: string;
    groupId: number;
};

export type UserRoleRelation = {
    userId: string;
    roleId: number;
};

export type UserGroupRoleRelation = {
    groupId: number;
    roleId: number;
};

export type MenuRoleRelation = {
    menuId: number;
    roleId: number;
    relation: string;
};

export type TaskCapability = keyof typeof TASK_MANAGER_ROLE_RELATIONS;

export type TaskPermission = Exclude<TaskCapability, 'create'> | 'manage';

export type TaskManagerPermission = TaskCapability;

export type TaskPermissionCheckResult = {
    taskId: number;
    permissions: Partial<Record<TaskPermission, boolean>>;
};

export type { CoreManagerRelation, CoreManagerResourceType } from './core-manager-authz.constants';

export type CoreManagedResourceType = keyof typeof RESOURCE_AUTHZ_MANAGER_RELATIONS;

export type CoreManagedPermissionCheckResult = {
    resourceType: CoreManagedResourceType;
    resourceId: string;
    permissions: Record<string, boolean>;
};

type EffectiveRoleProjectionRow = {
    id: number;
    code: string;
};

@Traceable()
@Injectable()
export class AdminSpiceDbAuthorizationService {
    private readonly logger = createRuntimeLogger(AdminSpiceDbAuthorizationService.name, {
        module: 'authz',
        domain: 'authz',
        resource: { type: 'spicedb_authorization' }
    });

    constructor(
        private readonly clientFactory: AdminSpiceDbClientFactory,
        private readonly prismaService: PrismaService
    ) {}

    /**
     * 返回 admin 系统单例对象 ID，避免业务代码散落硬编码。
     */
    getSystemId(): string {
        return ADMIN_SYSTEM_ID;
    }

    /**
     * 读取远端 SpiceDB 当前 schema 文本，供运维数据页面展示。
     */
    async readSchemaText(): Promise<string> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.schema.read();
            return result.schemaText;
        } catch (error) {
            throw this.createSpiceDbError('读取 SpiceDB schema 失败', error);
        }
    }

    /**
     * 写入远端 SpiceDB schema 文本，返回 SpiceDB 写入时的 ZedToken。
     */
    async writeSchemaText(schemaText: string): Promise<AdminSpiceDbRelationshipWriteResult> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.schema.write(schemaText);
            return {
                zedToken: result.writtenAt
            };
        } catch (error) {
            throw this.createSpiceDbError('写入 SpiceDB schema 失败', error);
        }
    }

    /**
     * 按 SpiceDB 原生过滤器读取 relationships，保留读取游标对应的 ZedToken。
     */
    async readRelationshipsNative(filter: AdminSpiceDbRelationshipFilter): Promise<AdminSpiceDbRelationshipReadResult> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.relationship.readRelationships({
                filter: this.toToolkitRelationshipFilter(filter),
                consistency: filter.consistency,
                pageSize: filter.pageSize,
                cursor: filter.cursor
            });
            return {
                relationships: result.relationships,
                zedToken: result.readAt,
                cursor: result.cursor,
                hasMore: result.hasMore
            };
        } catch (error) {
            throw this.createSpiceDbError('读取 SpiceDB relationships 失败', error, { filter });
        }
    }

    /**
     * 使用 SpiceDB TOUCH 批量写入 relationships，适合幂等创建或修复关系。
     */
    async touchRelationshipsNative(relationships: RelationshipInput[]): Promise<AdminSpiceDbRelationshipWriteResult> {
        if (relationships.length === 0) {
            return {};
        }

        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.relationship.touchRelationships({ relationships });
            return {
                zedToken: result.writtenAt
            };
        } catch (error) {
            throw this.createSpiceDbError('写入 SpiceDB relationships 失败', error, { relationships });
        }
    }

    /**
     * 按 SpiceDB 原生过滤器删除 relationships，返回删除时的 ZedToken。
     */
    async deleteRelationshipsNative(
        filter: AdminSpiceDbRelationshipFilter
    ): Promise<AdminSpiceDbRelationshipWriteResult> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.relationship.deleteRelationships({
                filter: this.toToolkitRelationshipFilter(filter)
            });
            return {
                zedToken: result.deletedAt
            };
        } catch (error) {
            throw this.createSpiceDbError('删除 SpiceDB relationships 失败', error, { filter });
        }
    }

    /**
     * 使用 SpiceDB checkPermission 做单次权限判断，供数据管理和调试入口复用。
     */
    async checkPermissionNative(input: AdminSpiceDbPermissionCheckInput) {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.checkPermission(input);
            return attachSpiceDbDebugTraces(
                {
                    allowed: result.allowed,
                    zedToken: result.checkedAt
                },
                [result.trace]
            );
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB checkPermission 失败', error, input);
        }
    }

    /**
     * 使用 SpiceDB bulkCheckPermission 批量做权限判断，保持输入和输出顺序一致。
     */
    async checkBulkPermissionsNative(input: AdminSpiceDbPermissionBatchCheckInput) {
        if (input.items.length === 0) {
            throw this.createSpiceDbError(
                'SpiceDB bulkCheckPermission 拒绝空检查项',
                new Error('items 不能为空'),
                input
            );
        }

        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.checkBulkPermissions({
                items: input.items,
                consistency: input.consistency
            });
            if (result.results.length !== input.items.length) {
                // SpiceDB bulk check 必须和输入一一对应，否则上层无法可靠映射权限结果。
                throw new Error(
                    `bulkCheckPermission 结果数量不一致：期望 ${input.items.length}，实际 ${result.results.length}`
                );
            }
            return attachSpiceDbDebugTraces(
                {
                    results: result.results.map((item) => ({
                        allowed: item.allowed,
                        zedToken: item.checkedAt
                    })),
                    zedToken: result.checkedAt
                },
                [result.trace]
            );
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB bulkCheckPermission 失败', error, input);
        }
    }

    /**
     * 使用 SpiceDB lookupResources 获取权限命中的资源 ID 和读取 ZedToken。
     */
    async lookupResourcesNative(input: AdminSpiceDbPermissionLookupResourcesInput) {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.lookupResources(input);
            return {
                ids: result.resources
                    .filter((resource) => resource.permissionship === 'has_permission')
                    .map((resource) => resource.id),
                zedToken: result.lookedUpAt
            };
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB lookupResources 失败', error, input);
        }
    }

    /**
     * 使用 SpiceDB lookupSubjects 获取权限命中的主体 ID 和读取 ZedToken。
     */
    async lookupSubjectsNative(input: AdminSpiceDbPermissionLookupSubjectsInput) {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.lookupSubjects(input);
            return {
                ids: result.subjects
                    .filter((subject) => subject.permissionship === 'has_permission')
                    .map((subject) => subject.id),
                zedToken: result.lookedUpAt
            };
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB lookupSubjects 失败', error, input);
        }
    }

    /**
     * 使用 SpiceDB 原生批量写关系能力，供运维批量导入和修复脚本复用。
     */
    async writeRelationshipsNative(
        updates: Array<{ operation: RelationshipOperation; relationship: RelationshipInput }>
    ): Promise<AdminSpiceDbRelationshipWriteResult> {
        if (updates.length === 0) {
            return {};
        }

        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.relationship.writeRelationships({ updates });
            return {
                zedToken: result.writtenAt
            };
        } catch (error) {
            throw this.createSpiceDbError('写入 SpiceDB relationships 失败', error, { updates });
        }
    }

    /**
     * 使用 SpiceDB bulk export 导出 relationships，避免运维导出时手写分页拉取。
     */
    async exportRelationshipsNative(
        filter: AdminSpiceDbRelationshipFilter
    ): Promise<AdminSpiceDbRelationshipReadResult> {
        const toolkit = await this.getToolkit();

        try {
            const relationships = await toolkit.relationship.exportBulkRelationships({
                filter: this.toToolkitRelationshipFilter(filter),
                consistency: filter.consistency
            });
            return {
                relationships,
                hasMore: false
            };
        } catch (error) {
            throw this.createSpiceDbError('导出 SpiceDB relationships 失败', error, { filter });
        }
    }

    /**
     * 将数字主键转换成 SpiceDB object id，统一避免 number/string 混用。
     */
    private toObjectId(id: number): string {
        return String(id);
    }

    /**
     * 获取 SpiceDB toolkit 上下文，并把初始化失败映射成项目业务异常。
     */
    private async getToolkit() {
        try {
            const { toolkit } = await this.clientFactory.getClientContext();
            return toolkit;
        } catch (error) {
            throw this.createSpiceDbError('初始化 SpiceDB 客户端失败', error);
        }
    }

    /**
     * 读取全部匹配的 SpiceDB relationships，统一处理上游异常。
     */
    private async readRelationships(filter: AdminSpiceDbRelationshipFilter): Promise<RelationshipOutput[]> {
        const result = await this.readRelationshipsNative(filter);
        return result.relationships;
    }

    /**
     * 批量 touch relationships，空集合直接跳过。
     */
    private async touchRelationships(relationships: RelationshipInput[]): Promise<void> {
        if (relationships.length === 0) {
            return;
        }

        await this.touchRelationshipsNative(relationships);
    }

    /**
     * 精确删除单条 relationship，用于集合 diff 和单项解绑。
     */
    private async deleteRelationship(relationship: RelationshipInput): Promise<void> {
        await this.deleteRelationshipsByFilter({
            resourceType: relationship.resource.type,
            resourceId: relationship.resource.id,
            relation: relationship.relation,
            subject: {
                type: relationship.subject.type,
                id: relationship.subject.id,
                relation: relationship.subject.relation
            }
        });
    }

    /**
     * 按过滤器删除 relationships，用于实体清理和启用状态切换。
     */
    private async deleteRelationshipsByFilter(filter: AdminSpiceDbRelationshipFilter): Promise<void> {
        await this.deleteRelationshipsNative(filter);
    }

    /**
     * 将一组当前关系替换成目标关系，先 diff 后增删，降低无意义写入。
     */
    private async replaceRelationshipSet(
        currentRelationships: RelationshipOutput[],
        desiredRelationships: RelationshipInput[]
    ): Promise<void> {
        const desiredIndex = new Map(
            desiredRelationships.map((relationship) => [this.createRelationshipKey(relationship), relationship])
        );
        const currentIndex = new Map(
            currentRelationships.map((relationship) => [this.createRelationshipKey(relationship), relationship])
        );
        const toDelete = currentRelationships.filter(
            (relationship) => !desiredIndex.has(this.createRelationshipKey(relationship))
        );
        const toTouch = desiredRelationships.filter(
            (relationship) => !currentIndex.has(this.createRelationshipKey(relationship))
        );

        for (const relationship of toDelete) {
            await this.deleteRelationship(relationship);
        }

        await this.touchRelationships(toTouch);
    }

    /**
     * 为 relationship 生成稳定 key，供 diff 替换集合使用。
     */
    private createRelationshipKey(relationship: RelationshipInput | RelationshipOutput): string {
        return [
            relationship.resource.type,
            relationship.resource.id,
            relationship.relation,
            relationship.subject.type,
            relationship.subject.id,
            relationship.subject.relation ?? ''
        ].join(':');
    }

    /**
     * 把项目内的 subject 字段转换为 toolkit 期望的 subjectFilter 字段。
     */
    private toToolkitRelationshipFilter(filter: AdminSpiceDbRelationshipFilter) {
        return {
            resourceType: filter.resourceType,
            resourceId: filter.resourceId,
            relation: filter.relation,
            subjectFilter: filter.subject
        };
    }

    /**
     * 将可选 ZedToken 转成 SpiceDB exact snapshot 读取一致性。
     */
    private toExactSnapshotConsistency(zedToken?: string | null): ConsistencyOption | undefined {
        return zedToken
            ? {
                  type: 'at_exact_snapshot',
                  token: zedToken
              }
            : undefined;
    }

    /**
     * 读取角色直接分配给指定用户的角色 ID。
     */
    async getUserDirectRoleIds(userId: string): Promise<number[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user',
                id: userId
            }
        });

        return this.toNumericIds(relationships.map((relationship) => relationship.resource.id));
    }

    /**
     * 读取指定用户作为成员加入的用户组 ID。
     */
    async getUserMemberGroupIds(userId: string): Promise<number[]> {
        const relationships = await this.readRelationships({
            resourceType: 'user_group',
            relation: 'member',
            subject: {
                type: 'user',
                id: userId
            }
        });

        return this.toNumericIds(relationships.map((relationship) => relationship.resource.id));
    }

    /**
     * 批量读取指定用户作为成员加入的用户组关系，供导出和投影同步避免 N+1 查询。
     */
    async getBatchUserMemberGroupRelations(userIds: string[]): Promise<UserGroupMemberRelation[]> {
        const uniqueUserIds = [...new Set(userIds)].filter((userId) => userId.trim().length > 0);
        if (uniqueUserIds.length === 0) {
            return [];
        }

        const result = await Promise.all(
            uniqueUserIds.map((userId) =>
                this.readRelationships({
                    resourceType: 'user_group',
                    relation: 'member',
                    subject: {
                        type: 'user',
                        id: userId
                    }
                })
            )
        );

        return this.toUserGroupMemberRelations(result.flat());
    }

    /**
     * 读取全部用户组成员关系，供 Watch 投影首次回填和周期对账使用。
     */
    async getAllUserGroupMemberRelations(zedToken?: string | null): Promise<UserGroupMemberRelation[]> {
        const relationships = await this.readRelationships({
            resourceType: 'user_group',
            relation: 'member',
            consistency: this.toExactSnapshotConsistency(zedToken),
            subject: {
                type: 'user'
            }
        });

        return this.toUserGroupMemberRelations(relationships);
    }

    /**
     * 读取全部用户直接角色关系，供 SpiceDB 关系投影全量重建和对账使用。
     */
    async getAllUserRoleRelations(zedToken?: string | null): Promise<UserRoleRelation[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            consistency: this.toExactSnapshotConsistency(zedToken),
            subject: {
                type: 'user'
            }
        });

        return this.toUserRoleRelations(relationships);
    }

    /**
     * 读取全部用户组继承角色关系，供 SpiceDB 关系投影全量重建和对账使用。
     */
    async getAllUserGroupRoleRelations(zedToken?: string | null): Promise<UserGroupRoleRelation[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            consistency: this.toExactSnapshotConsistency(zedToken),
            subject: {
                type: 'user_group',
                relation: 'active_member'
            }
        });

        return this.toUserGroupRoleRelations(relationships);
    }

    /**
     * 读取全部菜单角色关系，供 SpiceDB 关系投影全量重建和对账使用。
     */
    async getAllMenuRoleRelations(zedToken?: string | null): Promise<MenuRoleRelation[]> {
        const consistency = this.toExactSnapshotConsistency(zedToken);
        const relationships = (
            await Promise.all([
                this.readRelationships({
                    resourceType: 'menu',
                    relation: MENU_VIEWER_RELATION,
                    consistency,
                    subject: {
                        type: 'role',
                        relation: 'assigned'
                    }
                }),
                this.readRelationships({
                    resourceType: 'menu',
                    relation: MENU_MANAGER_RELATION,
                    consistency,
                    subject: {
                        type: 'role',
                        relation: 'assigned'
                    }
                })
            ])
        ).flat();

        return this.toMenuRoleRelations(relationships);
    }

    /**
     * 替换指定用户的直接角色分配关系。
     */
    async replaceUserDirectRoleIds(userId: string, roleIds: number[]): Promise<void> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        const currentRelationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user',
                id: userId
            }
        });
        const desiredRelationships = uniqueRoleIds.map((roleId) => this.roleAssigneeUserRelationship(roleId, userId));

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 通过 SpiceDB 计算指定用户所有有效角色，包含直接角色与用户组继承角色。
     */
    async lookupUserEffectiveRoleIds(userId: string): Promise<number[]> {
        const ids = await this.lookupResourceIds('role', 'assigned', {
            type: 'user',
            id: userId
        });
        return this.toNumericIds(ids);
    }

    /**
     * 读取角色当前直接分配的用户与用户组。
     */
    async getRoleAssignmentRefs(roleId: number): Promise<RoleAssignmentRefs> {
        const roleIdText = this.toObjectId(roleId);
        const [userRelationships, groupRelationships] = await Promise.all([
            this.readRelationships({
                resourceType: 'role',
                resourceId: roleIdText,
                relation: 'assignee',
                subject: {
                    type: 'user'
                }
            }),
            this.readRelationships({
                resourceType: 'role',
                resourceId: roleIdText,
                relation: 'assignee',
                subject: {
                    type: 'user_group',
                    relation: 'active_member'
                }
            })
        ]);

        return {
            userIds: userRelationships.map((relationship) => relationship.subject.id),
            userGroupIds: this.toNumericIds(groupRelationships.map((relationship) => relationship.subject.id))
        };
    }

    /**
     * 读取角色直接分配到的用户 ID。
     */
    async getRoleDirectUserIds(roleId: number): Promise<string[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            resourceId: this.toObjectId(roleId),
            relation: 'assignee',
            subject: {
                type: 'user'
            }
        });

        return [...new Set(relationships.map((relationship) => relationship.subject.id))].sort();
    }

    /**
     * 从角色视角替换直接用户分配关系。
     */
    async replaceRoleDirectUserIds(roleId: number, userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        const currentRelationships = await this.readRelationships({
            resourceType: 'role',
            resourceId: this.toObjectId(roleId),
            relation: 'assignee',
            subject: {
                type: 'user'
            }
        });
        const desiredRelationships = uniqueUserIds.map((userId) => this.roleAssigneeUserRelationship(roleId, userId));

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 读取角色直接分配到的用户组 ID。
     */
    async getRoleAssignedUserGroupIds(roleId: number): Promise<number[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            resourceId: this.toObjectId(roleId),
            relation: 'assignee',
            subject: {
                type: 'user_group',
                relation: 'active_member'
            }
        });

        return this.toNumericIds(relationships.map((relationship) => relationship.subject.id));
    }

    /**
     * 从角色视角替换用户组分配关系。
     */
    async replaceRoleAssignedUserGroupIds(roleId: number, groupIds: number[]): Promise<void> {
        const uniqueGroupIds = this.uniqueNumbers(groupIds);
        const currentRelationships = await this.readRelationships({
            resourceType: 'role',
            resourceId: this.toObjectId(roleId),
            relation: 'assignee',
            subject: {
                type: 'user_group',
                relation: 'active_member'
            }
        });
        const desiredRelationships = uniqueGroupIds.map((groupId) =>
            this.roleAssigneeUserGroupRelationship(roleId, groupId)
        );

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 通过 SpiceDB 计算某个角色当前命中的全部用户。
     */
    async lookupRoleEffectiveUserIds(roleId: number): Promise<string[]> {
        return await this.lookupSubjectIds(
            {
                type: 'role',
                id: this.toObjectId(roleId)
            },
            'assigned',
            'user'
        );
    }

    /**
     * 读取某个菜单当前授权给哪些角色。
     */
    async getMenuViewerRoleIds(menuId: number): Promise<number[]> {
        const relationships = await this.readRelationships({
            resourceType: 'menu',
            resourceId: this.toObjectId(menuId),
            relation: MENU_VIEWER_RELATION,
            subject: {
                type: 'role',
                relation: 'assigned'
            }
        });

        return this.toNumericIds(relationships.map((relationship) => relationship.subject.id));
    }

    /**
     * 从菜单视角替换 viewer 角色集合。
     */
    async replaceMenuViewerRoleIds(menuId: number, roleIds: number[]): Promise<void> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        const currentRelationships = await this.readRelationships({
            resourceType: 'menu',
            resourceId: this.toObjectId(menuId),
            relation: MENU_VIEWER_RELATION,
            subject: {
                type: 'role',
                relation: 'assigned'
            }
        });
        const desiredRelationships = uniqueRoleIds.map((roleId) => this.menuRoleRelationship(menuId, roleId));

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 初始化或修复角色在 SpiceDB 中的启用状态。
     */
    async upsertRoleBase(roleId: number, enabled: boolean): Promise<void> {
        await this.setRoleEnabled(roleId, enabled);
        await this.upsertRoleAuthzBase(roleId);
    }

    /**
     * 设置角色启用状态 relationship。
     */
    async setRoleEnabled(roleId: number, enabled: boolean): Promise<void> {
        const relationship = this.enabledRelationship('role', this.toObjectId(roleId));
        if (enabled) {
            await this.touchRelationships([relationship]);
            return;
        }

        await this.deleteRelationship(relationship);
    }

    /**
     * 清理角色相关的 SpiceDB relationships。
     */
    async cleanupRole(roleId: number): Promise<void> {
        const roleIdText = this.toObjectId(roleId);
        await this.deleteRelationshipsByFilter({
            resourceType: 'role',
            resourceId: roleIdText
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'menu',
            relation: MENU_VIEWER_RELATION,
            subject: {
                type: 'role',
                id: roleIdText,
                relation: 'assigned'
            }
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'menu',
            relation: MENU_MANAGER_RELATION,
            subject: {
                type: 'role',
                id: roleIdText,
                relation: 'assigned'
            }
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'system',
            resourceId: ADMIN_SYSTEM_ID,
            relation: 'admin',
            subject: {
                type: 'role',
                id: roleIdText,
                relation: 'assigned'
            }
        });
        for (const resourceType of this.getCoreManagerResourceTypes()) {
            for (const relation of this.getCoreManagerRelations(resourceType)) {
                await this.deleteRelationshipsByFilter({
                    resourceType,
                    relation,
                    subject: {
                        type: 'role',
                        id: roleIdText
                    }
                });
            }
        }
    }

    /**
     * 初始化或修复菜单在 SpiceDB 中的系统归属关系。
     */
    async upsertMenuBase(menuId: number): Promise<void> {
        await this.upsertMenuAuthzBase(menuId);
        await this.touchRelationships([
            {
                resource: {
                    type: 'menu',
                    id: this.toObjectId(menuId)
                },
                relation: 'system',
                subject: {
                    type: 'system',
                    id: ADMIN_SYSTEM_ID
                }
            }
        ]);
    }

    /**
     * 清理菜单相关的 SpiceDB relationships。
     */
    async cleanupMenu(menuId: number): Promise<void> {
        await this.deleteRelationshipsByFilter({
            resourceType: 'menu',
            resourceId: this.toObjectId(menuId)
        });
    }

    /**
     * 通过 SpiceDB 计算当前用户可查看的菜单 ID。
     */
    async lookupUserVisibleMenuIds(userId: string): Promise<number[]> {
        const ids = await this.lookupResourceIds('menu', 'view', {
            type: 'user',
            id: userId
        });
        return this.toNumericIds(ids);
    }

    /**
     * 初始化或修复任务管理资源在 SpiceDB 中的系统归属关系。
     */
    async upsertTaskManagerBase(): Promise<void> {
        await this.touchRelationships([
            {
                resource: {
                    type: TASK_MANAGER_RESOURCE_TYPE,
                    id: TASK_MANAGER_RESOURCE_ID
                },
                relation: TASK_MANAGER_SYSTEM_RELATION,
                subject: {
                    type: 'system',
                    id: ADMIN_SYSTEM_ID
                }
            }
        ]);
    }

    /**
     * 初始化或修复任务对象在 SpiceDB 中的创建人和任务管理资源继承关系。
     */
    async upsertTaskBase(taskId: number, creatorUserId: string): Promise<void> {
        await this.upsertTaskManagerBase();
        await this.touchRelationships([
            {
                resource: {
                    type: TASK_RESOURCE_TYPE,
                    id: this.toObjectId(taskId)
                },
                relation: TASK_PARENT_MANAGER_RELATION,
                subject: {
                    type: TASK_MANAGER_RESOURCE_TYPE,
                    id: TASK_MANAGER_RESOURCE_ID
                }
            },
            {
                resource: {
                    type: TASK_RESOURCE_TYPE,
                    id: this.toObjectId(taskId)
                },
                relation: TASK_CREATOR_RELATION,
                subject: {
                    type: 'user',
                    id: creatorUserId
                }
            }
        ]);
    }

    /**
     * 清理任务对象上的全部 SpiceDB relationships。
     */
    async cleanupTask(taskId: number): Promise<void> {
        await this.deleteRelationshipsByFilter({
            resourceType: TASK_RESOURCE_TYPE,
            resourceId: this.toObjectId(taskId)
        });
    }

    /**
     * 通过 SpiceDB 计算当前用户可查看的任务 ID。
     */
    async lookupUserVisibleTaskIds(userId: string): Promise<number[]> {
        const ids = await this.lookupResourceIds(TASK_RESOURCE_TYPE, TASK_PERMISSION_VIEW, {
            type: 'user',
            id: userId
        });
        return this.toNumericIds(ids);
    }

    /**
     * 检查用户是否拥有指定任务对象权限。
     */
    async checkTaskPermission(taskId: number, permission: TaskPermission, userId: string): Promise<boolean> {
        const result = await this.checkPermissionNative({
            resource: {
                type: TASK_RESOURCE_TYPE,
                id: this.toObjectId(taskId)
            },
            permission,
            subject: {
                type: 'user',
                id: userId
            }
        });
        return result.allowed;
    }

    /**
     * 批量检查用户对一组任务对象的权限，供列表页一次性返回按钮能力。
     */
    async checkTaskPermissions(
        taskIds: number[],
        permissions: TaskPermission[],
        userId: string
    ): Promise<TaskPermissionCheckResult[]> {
        const uniqueTaskIds = this.uniqueNumbers(taskIds);
        const uniquePermissions = [...new Set(permissions)];
        if (uniqueTaskIds.length === 0 || uniquePermissions.length === 0) {
            return [];
        }

        const checkItems = uniqueTaskIds.flatMap((taskId) =>
            uniquePermissions.map((permission) => ({
                resource: {
                    type: TASK_RESOURCE_TYPE,
                    id: this.toObjectId(taskId)
                },
                permission,
                subject: {
                    type: 'user',
                    id: userId
                }
            }))
        );
        const result = await this.checkBulkPermissionsNative({ items: checkItems });
        const permissionMap = new Map<number, Partial<Record<TaskPermission, boolean>>>();

        result.results.forEach((item, index) => {
            const taskIndex = Math.floor(index / uniquePermissions.length);
            const permissionIndex = index % uniquePermissions.length;
            const taskId = uniqueTaskIds[taskIndex];
            const permission = uniquePermissions[permissionIndex];
            const currentPermissions = permissionMap.get(taskId) ?? {};
            currentPermissions[permission] = item.allowed;
            permissionMap.set(taskId, currentPermissions);
        });

        return attachSpiceDbDebugTraces(
            uniqueTaskIds.map((taskId) => ({
                taskId,
                permissions: permissionMap.get(taskId) ?? {}
            })),
            collectSpiceDbDebugTraces(result)
        );
    }

    /**
     * 断言用户拥有指定任务对象权限，不满足时抛出统一权限不足错误。
     */
    async assertTaskPermission(taskId: number, permission: TaskPermission, userId: string): Promise<void> {
        const allowed = await this.checkTaskPermission(taskId, permission, userId);
        if (!allowed) {
            throw new BusinessException(ErrorCodes.ROLE.PERMISSION_DENIED, {
                resourceType: 'task',
                resourceId: this.toObjectId(taskId),
                permission
            });
        }
    }

    /**
     * 检查用户是否拥有任务管理资源权限，例如创建任务。
     */
    async checkTaskManagerPermission(permission: TaskManagerPermission, userId: string): Promise<boolean> {
        const result = await this.checkPermissionNative({
            resource: {
                type: TASK_MANAGER_RESOURCE_TYPE,
                id: TASK_MANAGER_RESOURCE_ID
            },
            permission,
            subject: {
                type: 'user',
                id: userId
            }
        });
        return result.allowed;
    }

    /**
     * 断言用户拥有任务管理资源权限，不满足时抛出统一权限不足错误。
     */
    async assertTaskManagerPermission(permission: TaskManagerPermission, userId: string): Promise<void> {
        const allowed = await this.checkTaskManagerPermission(permission, userId);
        if (!allowed) {
            throw new BusinessException(ErrorCodes.ROLE.PERMISSION_DENIED, {
                resourceType: TASK_MANAGER_RESOURCE_TYPE,
                resourceId: TASK_MANAGER_RESOURCE_ID,
                permission
            });
        }
    }

    /**
     * 通过 SpiceDB 计算当前菜单 view 权限命中的用户 ID。
     */
    async lookupMenuVisibleUserIds(menuId: number): Promise<string[]> {
        return await this.lookupSubjectIds(
            {
                type: 'menu',
                id: this.toObjectId(menuId)
            },
            'view',
            'user'
        );
    }

    /**
     * 初始化或修复用户组启用状态 relationship。
     */
    async upsertUserGroupBase(groupId: number, enabled: boolean): Promise<void> {
        await this.setUserGroupEnabled(groupId, enabled);
        await this.upsertUserGroupAuthzBase(groupId);
    }

    /**
     * 设置用户组启用状态 relationship。
     */
    async setUserGroupEnabled(groupId: number, enabled: boolean): Promise<void> {
        const relationship = this.enabledRelationship('user_group', this.toObjectId(groupId));
        if (enabled) {
            await this.touchRelationships([relationship]);
            return;
        }

        await this.deleteRelationship(relationship);
    }

    /**
     * 读取用户组成员用户 ID。
     */
    async getUserGroupMemberUserIds(groupId: number): Promise<string[]> {
        const relationships = await this.readRelationships({
            resourceType: 'user_group',
            resourceId: this.toObjectId(groupId),
            relation: 'member',
            subject: {
                type: 'user'
            }
        });

        return relationships.map((relationship) => relationship.subject.id);
    }

    /**
     * 替换用户组成员用户集合。
     */
    async replaceUserGroupMemberUserIds(groupId: number, userIds: string[]): Promise<void> {
        const uniqueUserIds = [...new Set(userIds)];
        const currentRelationships = await this.readRelationships({
            resourceType: 'user_group',
            resourceId: this.toObjectId(groupId),
            relation: 'member',
            subject: {
                type: 'user'
            }
        });
        const desiredRelationships = uniqueUserIds.map((userId) => this.userGroupMemberRelationship(groupId, userId));

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 读取用户组分配到的角色 ID。
     */
    async getUserGroupRoleIds(groupId: number): Promise<number[]> {
        const relationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user_group',
                id: this.toObjectId(groupId),
                relation: 'active_member'
            }
        });

        return this.toNumericIds(relationships.map((relationship) => relationship.resource.id));
    }

    /**
     * 替换用户组分配到的角色集合。
     */
    async replaceUserGroupRoleIds(groupId: number, roleIds: number[]): Promise<void> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        const currentRelationships = await this.readRelationships({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user_group',
                id: this.toObjectId(groupId),
                relation: 'active_member'
            }
        });
        const desiredRelationships = uniqueRoleIds.map((roleId) =>
            this.roleAssigneeUserGroupRelationship(roleId, groupId)
        );

        await this.replaceRelationshipSet(currentRelationships, desiredRelationships);
    }

    /**
     * 清理用户组相关的 SpiceDB relationships。
     */
    async cleanupUserGroup(groupId: number): Promise<void> {
        const groupIdText = this.toObjectId(groupId);
        await this.deleteRelationshipsByFilter({
            resourceType: 'user_group',
            resourceId: groupIdText
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user_group',
                id: groupIdText,
                relation: 'active_member'
            }
        });
    }

    /**
     * 清理指定用户在 SpiceDB 中的直接角色和用户组成员关系。
     */
    async cleanupUser(userId: string): Promise<void> {
        await this.deleteRelationshipsByFilter({
            resourceType: 'admin_user',
            resourceId: userId
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'role',
            relation: 'assignee',
            subject: {
                type: 'user',
                id: userId
            }
        });
        await this.deleteRelationshipsByFilter({
            resourceType: 'user_group',
            relation: 'member',
            subject: {
                type: 'user',
                id: userId
            }
        });
    }

    /**
     * 绑定或解绑超级管理员角色到 system.admin。
     */
    async setSystemAdminRole(roleId: number, enabled: boolean): Promise<void> {
        const relationship: RelationshipInput = {
            resource: {
                type: 'system',
                id: ADMIN_SYSTEM_ID
            },
            relation: 'admin',
            subject: {
                type: 'role',
                id: this.toObjectId(roleId),
                relation: 'assigned'
            }
        };

        if (enabled) {
            await this.touchRelationships([relationship]);
            return;
        }

        await this.deleteRelationship(relationship);
    }

    /**
     * 初始化或修复所有核心 manager 单例到 admin system 的归属关系。
     */
    async upsertCoreManagerBases(resourceTypes: CoreManagerResourceType[] = this.getCoreManagerResourceTypes()) {
        await this.upsertAuthzResourceBases(resourceTypes);
    }

    /**
     * 初始化或修复指定授权资源单例到 admin system 的归属关系。
     */
    async upsertAuthzResourceBases(resourceTypes: string[]) {
        const relationships = this.normalizeStringList(resourceTypes).map((resourceType) =>
            this.coreManagerSystemRelationship(resourceType)
        );
        await this.touchRelationships(relationships);
    }

    /**
     * 返回核心 manager 支持的资源类型与关系闭集，供业务层构建权限矩阵。
     */
    getCoreManagerRelationOptions(): Record<CoreManagerResourceType, CoreManagerRelation[]> {
        return this.getCoreManagerResourceTypes().reduce(
            (options, resourceType) => ({
                ...options,
                [resourceType]: this.getCoreManagerRelations(resourceType)
            }),
            {} as Record<CoreManagerResourceType, CoreManagerRelation[]>
        );
    }

    /**
     * 初始化或修复指定后台用户对象的资源级授权基础关系。
     */
    async upsertAdminUserBase(userId: string): Promise<void> {
        await this.upsertCoreManagerBases(['user_manager']);
        await this.touchRelationships([
            this.coreManagedResourceManagerRelationship('admin_user', userId),
            {
                resource: {
                    type: 'admin_user',
                    id: userId
                },
                relation: 'self',
                subject: {
                    type: 'user',
                    id: userId
                }
            }
        ]);
    }

    /**
     * 初始化或修复指定角色对象的资源级授权基础关系。
     */
    async upsertRoleAuthzBase(roleId: number): Promise<void> {
        await this.upsertCoreManagerBases(['role_manager']);
        await this.touchRelationships([this.coreManagedResourceManagerRelationship('role', this.toObjectId(roleId))]);
    }

    /**
     * 初始化或修复指定菜单对象的资源级授权基础关系。
     */
    async upsertMenuAuthzBase(menuId: number): Promise<void> {
        await this.upsertCoreManagerBases(['menu_manager']);
        await this.touchRelationships([this.coreManagedResourceManagerRelationship('menu', this.toObjectId(menuId))]);
    }

    /**
     * 初始化或修复指定用户组对象的资源级授权基础关系。
     */
    async upsertUserGroupAuthzBase(groupId: number): Promise<void> {
        await this.upsertCoreManagerBases(['user_group_manager']);
        await this.touchRelationships([
            this.coreManagedResourceManagerRelationship('user_group', this.toObjectId(groupId))
        ]);
    }

    /**
     * 替换角色在指定核心 manager 单例上的关系集合。
     */
    async replaceRoleCoreManagerRelations(
        roleId: number,
        resourceType: CoreManagerResourceType,
        relations: string[]
    ): Promise<void> {
        await this.replaceRoleAuthzResourceRelations(
            roleId,
            resourceType,
            relations,
            this.getCoreManagerRelations(resourceType)
        );
    }

    /**
     * 按当前 schema 支持关系，替换角色在指定授权资源单例上的关系集合。
     */
    async replaceRoleAuthzResourceRelations(
        roleId: number,
        resourceType: string,
        relations: string[],
        supportedRelations: string[]
    ): Promise<void> {
        const normalizedSupportedRelations = this.normalizeStringList(supportedRelations);
        await this.upsertAuthzResourceBases([resourceType]);
        const roleIdText = this.toObjectId(roleId);
        const desiredRelationSet = new Set(
            this.normalizeAuthzResourceRelations(normalizedSupportedRelations, relations)
        );

        await Promise.all(
            normalizedSupportedRelations.map(async (relation) => {
                const relationship = this.coreManagerRoleRelationship(resourceType, relation, roleId);

                if (desiredRelationSet.has(relation)) {
                    await this.touchRelationships([relationship]);
                    return;
                }

                await this.deleteRelationshipsByFilter({
                    resourceType,
                    resourceId: MANAGER_RESOURCE_ID,
                    relation,
                    subject: {
                        type: 'role',
                        id: roleIdText
                    }
                });
            })
        );
    }

    /**
     * 检查当前用户是否拥有核心 manager 单例权限，例如 user_manager:create。
     */
    async checkCoreManagerPermission(
        resourceType: CoreManagerResourceType,
        permission: string,
        userId: string
    ): Promise<boolean> {
        if (await this.checkCoreManagerPermissionFromProjection(resourceType, permission, userId)) {
            return true;
        }

        const result = await this.checkPermissionNative({
            resource: {
                type: resourceType,
                id: MANAGER_RESOURCE_ID
            },
            permission,
            subject: {
                type: 'user',
                id: userId
            }
        });
        return result.allowed;
    }

    /**
     * 断言当前用户拥有核心 manager 单例权限，不满足时抛出统一权限不足错误。
     */
    async assertCoreManagerPermission(
        resourceType: CoreManagerResourceType,
        permission: string,
        userId: string
    ): Promise<void> {
        const result = await this.checkPermissionNative({
            resource: {
                type: resourceType,
                id: MANAGER_RESOURCE_ID
            },
            permission,
            subject: {
                type: 'user',
                id: userId
            }
        });
        if (!result.allowed) {
            throw new BusinessException(ErrorCodes.ROLE.PERMISSION_DENIED, {
                resourceType,
                resourceId: MANAGER_RESOURCE_ID,
                permission
            });
        }
    }

    /**
     * 批量检查核心资源对象权限，供列表页一次性返回按钮能力。
     */
    async checkCoreManagedResourcePermissions(
        resourceType: CoreManagedResourceType,
        resourceIds: string[],
        permissions: string[],
        userId: string
    ): Promise<CoreManagedPermissionCheckResult[]> {
        const uniqueResourceIds = [...new Set(resourceIds.map((id) => id.trim()).filter(Boolean))];
        const uniquePermissions = [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))];
        if (uniqueResourceIds.length === 0 || uniquePermissions.length === 0) {
            return [];
        }

        const permissionMap = await this.checkCoreManagedResourcePermissionsFromProjection(
            resourceType,
            uniqueResourceIds,
            uniquePermissions,
            userId
        );
        const checkItems = uniqueResourceIds.flatMap((resourceId) =>
            uniquePermissions
                .filter((permission) => permissionMap.get(resourceId)?.[permission] !== true)
                .map((permission) => ({
                    resource: {
                        type: resourceType,
                        id: resourceId
                    },
                    permission,
                    subject: {
                        type: 'user',
                        id: userId
                    }
                }))
        );
        const result = checkItems.length > 0 ? await this.checkBulkPermissionsNative({ items: checkItems }) : null;

        result?.results.forEach((item, index) => {
            const checkItem = checkItems[index];
            if (!checkItem) {
                return;
            }
            const resourceId = checkItem.resource.id;
            const permission = checkItem.permission;
            const currentPermissions = permissionMap.get(resourceId) ?? {};
            currentPermissions[permission] = item.allowed;
            permissionMap.set(resourceId, currentPermissions);
        });

        return attachSpiceDbDebugTraces(
            uniqueResourceIds.map((resourceId) => ({
                resourceType,
                resourceId,
                permissions: permissionMap.get(resourceId) ?? {}
            })),
            result ? collectSpiceDbDebugTraces(result) : []
        );
    }

    /**
     * 断言当前用户拥有指定核心资源对象权限，不满足时抛出统一权限不足错误。
     */
    async assertCoreManagedResourcePermission(
        resourceType: CoreManagedResourceType,
        resourceId: string,
        permission: string,
        userId: string
    ): Promise<void> {
        const result = await this.checkPermissionNative({
            resource: {
                type: resourceType,
                id: resourceId
            },
            permission,
            subject: {
                type: 'user',
                id: userId
            }
        });
        if (!result.allowed) {
            throw new BusinessException(ErrorCodes.ROLE.PERMISSION_DENIED, {
                resourceType,
                resourceId,
                permission
            });
        }
    }

    /**
     * 高频 manager 单例权限先走本地投影和授权源表；未命中时继续由 SpiceDB 兜底。
     */
    private async checkCoreManagerPermissionFromProjection(
        resourceType: CoreManagerResourceType,
        permission: string,
        userId: string
    ): Promise<boolean> {
        try {
            const roleIndex = await this.getEffectiveRoleIndexFromProjection(userId);
            return await this.hasCoreManagerPermissionFromProjection(resourceType, permission, roleIndex);
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影回退路径
            this.logger.warn('本地投影检查核心 manager 权限失败，回退 SpiceDB', {
                resourceType,
                permission,
                userId,
                error
            });
            return false;
        }
    }

    /**
     * 高频对象按钮权限先用 manager 授权源表、自身关系和对象例外源表判定 true，剩余项再回退 SpiceDB。
     */
    private async checkCoreManagedResourcePermissionsFromProjection(
        resourceType: CoreManagedResourceType,
        resourceIds: string[],
        permissions: string[],
        userId: string
    ): Promise<Map<string, Record<string, boolean>>> {
        const permissionMap = new Map(resourceIds.map((resourceId) => [resourceId, {} as Record<string, boolean>]));

        try {
            const roleIndex = await this.getEffectiveRoleIndexFromProjection(userId);
            await this.applyManagerPermissionsFromProjection(
                resourceType,
                resourceIds,
                permissions,
                roleIndex,
                permissionMap
            );
            this.applySelfPermissionsFromProjection(resourceType, resourceIds, permissions, userId, permissionMap);
            await this.applyObjectExceptionPermissionsFromProjection(
                resourceType,
                resourceIds,
                permissions,
                userId,
                roleIndex,
                permissionMap
            );
        } catch (error) {
            // 保留完整 detail 调用：error 字段经 sanitizeForLogging 处理后保留 error.stack，便于排查投影回退路径
            this.logger.warn('本地投影检查核心对象权限失败，回退 SpiceDB', {
                resourceType,
                resourceIds,
                permissions,
                userId,
                error
            });
        }

        return permissionMap;
    }

    private async applyManagerPermissionsFromProjection(
        resourceType: CoreManagedResourceType,
        resourceIds: string[],
        permissions: string[],
        roleIndex: Map<number, EffectiveRoleProjectionRow>,
        permissionMap: Map<string, Record<string, boolean>>
    ): Promise<void> {
        const managerType = RESOURCE_AUTHZ_MANAGER_RELATIONS[resourceType].managerType;
        const managerPermissionPairs = await Promise.all(
            permissions.map(async (permission) => ({
                permission,
                allowed: await this.hasCoreManagerPermissionFromProjection(managerType, permission, roleIndex)
            }))
        );

        for (const { permission, allowed } of managerPermissionPairs) {
            if (!allowed) {
                continue;
            }
            for (const resourceId of resourceIds) {
                this.setProjectionPermission(permissionMap, resourceId, permission, true);
            }
        }
    }

    private applySelfPermissionsFromProjection(
        resourceType: CoreManagedResourceType,
        resourceIds: string[],
        permissions: string[],
        userId: string,
        permissionMap: Map<string, Record<string, boolean>>
    ): void {
        if (resourceType !== 'admin_user') {
            return;
        }

        for (const resourceId of resourceIds) {
            if (resourceId !== userId) {
                continue;
            }
            for (const permission of permissions) {
                if (permission === 'view' || permission === 'update') {
                    this.setProjectionPermission(permissionMap, resourceId, permission, true);
                }
            }
        }
    }

    private async applyObjectExceptionPermissionsFromProjection(
        resourceType: CoreManagedResourceType,
        resourceIds: string[],
        permissions: string[],
        userId: string,
        roleIndex: Map<number, EffectiveRoleProjectionRow>,
        permissionMap: Map<string, Record<string, boolean>>
    ): Promise<void> {
        const relations = this.getObjectExceptionRelationsForPermissions(resourceType, permissions);
        if (relations.length === 0) {
            return;
        }

        const roleIds = [...roleIndex.keys()].map((roleId) => String(roleId));
        const subjectFilters = [
            {
                subjectKind: 'user',
                subjectId: userId
            },
            ...(roleIds.length > 0
                ? [
                      {
                          subjectKind: 'role_assigned',
                          subjectId: {
                              in: roleIds
                          }
                      }
                  ]
                : [])
        ];
        const rows = await this.prismaService.authzObjectSubjectBinding.findMany({
            where: {
                resourceType,
                resourceId: {
                    in: resourceIds
                },
                relation: {
                    in: relations
                },
                OR: subjectFilters
            },
            select: {
                resourceId: true,
                relation: true
            }
        });

        for (const row of rows) {
            for (const permission of permissions) {
                if (this.getObjectExceptionGrantRelations(resourceType, permission).includes(row.relation)) {
                    this.setProjectionPermission(permissionMap, row.resourceId, permission, true);
                }
            }
        }
    }

    private async hasCoreManagerPermissionFromProjection(
        resourceType: CoreManagerResourceType,
        permission: string,
        roleIndex: Map<number, EffectiveRoleProjectionRow>
    ): Promise<boolean> {
        if (roleIndex.size === 0) {
            return false;
        }
        if ([...roleIndex.values()].some((role) => role.code === 'super_admin')) {
            return true;
        }

        const relations = this.getCoreManagerGrantRelations(resourceType, permission);
        if (relations.length === 0) {
            return false;
        }

        const count = await this.prismaService.authzResourceRoleBinding.count({
            where: {
                resourceType,
                resourceId: {
                    in: relations
                },
                roleId: {
                    in: [...roleIndex.keys()]
                }
            }
        });

        return count > 0;
    }

    private getCoreManagerGrantRelations(
        resourceType: CoreManagerResourceType,
        permission: string
    ): CoreManagerRelation[] {
        const supportedRelations = new Set<CoreManagerRelation>(CORE_MANAGER_RELATIONS[resourceType]);
        const normalize = (relations: CoreManagerRelation[]) =>
            relations.filter((relation) => supportedRelations.has(relation));

        if (permission === 'view' || permission === 'list') {
            return normalize([...CORE_MANAGER_RELATIONS[resourceType]]);
        }
        if (permission === 'manage') {
            return normalize(['manager']);
        }

        const permissionRelations: Record<string, CoreManagerRelation[]> = {
            create: ['creator', 'manager'],
            update: ['updater', 'manager'],
            delete: ['deleter', 'manager'],
            reset_password: ['password_resetter', 'manager'],
            view_session: ['session_viewer', 'session_revoker', 'manager'],
            revoke_session: ['session_revoker', 'manager'],
            assign_user: ['user_assigner', 'manager'],
            assign_user_group: ['user_group_assigner', 'manager'],
            assign_task_capability: ['task_capability_assigner', 'manager'],
            assign_task_resource: ['task_resource_assigner', 'manager'],
            assign_member: ['member_assigner', 'manager'],
            assign_role: ['role_assigner', 'manager'],
            run: ['runner', 'manager'],
            rebuild: ['runner', 'manager']
        };

        return normalize(permissionRelations[permission] ?? []);
    }

    private getObjectExceptionRelationsForPermissions(
        resourceType: CoreManagedResourceType,
        permissions: string[]
    ): string[] {
        return [
            ...new Set(
                permissions.flatMap((permission) => this.getObjectExceptionGrantRelations(resourceType, permission))
            )
        ];
    }

    private getObjectExceptionGrantRelations(resourceType: CoreManagedResourceType, permission: string): string[] {
        const relations: Record<CoreManagedResourceType, Record<string, string[]>> = {
            admin_user: {
                view: ['viewer', 'updater', 'deleter', 'password_resetter', 'session_viewer', 'session_revoker'],
                update: ['updater'],
                delete: ['deleter'],
                reset_password: ['password_resetter'],
                view_session: ['session_viewer', 'session_revoker'],
                revoke_session: ['session_revoker']
            },
            role: {
                view: [
                    'viewer',
                    'updater',
                    'deleter',
                    'user_assigner',
                    'user_group_assigner',
                    'task_capability_assigner',
                    'task_resource_assigner'
                ],
                update: ['updater'],
                delete: ['deleter'],
                assign_user: ['user_assigner'],
                assign_user_group: ['user_group_assigner'],
                assign_task_capability: ['task_capability_assigner'],
                assign_task_resource: ['task_resource_assigner']
            },
            menu: {
                inspect: ['inspector', 'updater', 'deleter', 'role_assigner'],
                update: ['updater'],
                delete: ['deleter'],
                assign_role: ['role_assigner']
            },
            user_group: {
                view: ['viewer', 'updater', 'deleter', 'member_assigner', 'role_assigner'],
                update: ['updater'],
                delete: ['deleter'],
                assign_member: ['member_assigner'],
                assign_role: ['role_assigner']
            }
        };

        return relations[resourceType][permission] ?? [];
    }

    private async getEffectiveRoleIndexFromProjection(
        userId: string
    ): Promise<Map<number, EffectiveRoleProjectionRow>> {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
            return new Map();
        }

        const [directAssignments, groupMemberAssignments] = await Promise.all([
            this.prismaService.spiceDbUserRoleProjection.findMany({
                where: {
                    userId: normalizedUserId
                },
                select: {
                    roleId: true
                }
            }),
            this.prismaService.spiceDbUserGroupMemberProjection.findMany({
                where: {
                    userId: normalizedUserId
                },
                select: {
                    groupId: true
                }
            })
        ]);
        const groupIds = this.uniqueNumbers(groupMemberAssignments.map((assignment) => assignment.groupId));
        const enabledGroupIds = await this.getEnabledGroupIdSet(groupIds);
        const groupRoleAssignments =
            enabledGroupIds.size > 0
                ? await this.prismaService.spiceDbUserGroupRoleProjection.findMany({
                      where: {
                          groupId: {
                              in: [...enabledGroupIds]
                          }
                      },
                      select: {
                          roleId: true
                      }
                  })
                : [];
        const roleIds = this.uniqueNumbers([
            ...directAssignments.map((assignment) => assignment.roleId),
            ...groupRoleAssignments.map((assignment) => assignment.roleId)
        ]);

        return await this.getEnabledRoleIndex(roleIds);
    }

    private async getEnabledRoleIndex(roleIds: number[]): Promise<Map<number, EffectiveRoleProjectionRow>> {
        const uniqueRoleIds = this.uniqueNumbers(roleIds);
        if (uniqueRoleIds.length === 0) {
            return new Map();
        }

        const rows = await this.prismaService.rbacRole.findMany({
            where: {
                id: {
                    in: uniqueRoleIds
                },
                status: RbacStatus.ENABLE
            },
            select: {
                id: true,
                code: true
            }
        });

        return new Map(rows.map((role) => [role.id, role]));
    }

    private async getEnabledGroupIdSet(groupIds: number[]): Promise<Set<number>> {
        const uniqueGroupIds = this.uniqueNumbers(groupIds);
        if (uniqueGroupIds.length === 0) {
            return new Set();
        }

        const groups = await this.prismaService.rbacUserGroup.findMany({
            where: {
                id: {
                    in: uniqueGroupIds
                },
                status: RbacStatus.ENABLE
            },
            select: {
                id: true
            }
        });

        return new Set(groups.map((group) => group.id));
    }

    private setProjectionPermission(
        permissionMap: Map<string, Record<string, boolean>>,
        resourceId: string,
        permission: string,
        allowed: boolean
    ): void {
        const currentPermissions = permissionMap.get(resourceId) ?? {};
        currentPermissions[permission] = allowed;
        permissionMap.set(resourceId, currentPermissions);
    }

    /**
     * 调用 lookupResources，获取某 subject 对指定 permission 可访问的资源 ID。
     */
    private async lookupResourceIds(resourceType: string, permission: string, subject: SubjectRef): Promise<string[]> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.lookupResources({
                resourceType,
                permission,
                subject
            });
            return result.resources
                .filter((resource) => resource.permissionship === 'has_permission')
                .map((resource) => resource.id);
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB lookupResources 失败', error, {
                resourceType,
                permission,
                subject
            });
        }
    }

    /**
     * 调用 lookupSubjects，获取某资源 permission 命中的 subject ID。
     */
    private async lookupSubjectIds(resource: ResourceRef, permission: string, subjectType: string): Promise<string[]> {
        const toolkit = await this.getToolkit();

        try {
            const result = await toolkit.permission.lookupSubjects({
                resource,
                permission,
                subjectType
            });
            return result.subjects
                .filter((subject) => subject.permissionship === 'has_permission')
                .map((subject) => subject.id);
        } catch (error) {
            throw this.createSpiceDbError('SpiceDB lookupSubjects 失败', error, {
                resource,
                permission,
                subjectType
            });
        }
    }

    /**
     * 构造角色直接分配用户的 relationship。
     */
    private roleAssigneeUserRelationship(roleId: number, userId: string): RelationshipInput {
        return {
            resource: {
                type: 'role',
                id: this.toObjectId(roleId)
            },
            relation: 'assignee',
            subject: {
                type: 'user',
                id: userId
            }
        };
    }

    /**
     * 构造角色分配用户组活跃成员的 relationship。
     */
    private roleAssigneeUserGroupRelationship(roleId: number, groupId: number): RelationshipInput {
        return {
            resource: {
                type: 'role',
                id: this.toObjectId(roleId)
            },
            relation: 'assignee',
            subject: {
                type: 'user_group',
                id: this.toObjectId(groupId),
                relation: 'active_member'
            }
        };
    }

    /**
     * 构造菜单 viewer 授权到角色有效成员的 relationship。
     */
    private menuRoleRelationship(menuId: number, roleId: number, relation = MENU_VIEWER_RELATION): RelationshipInput {
        return {
            resource: {
                type: 'menu',
                id: this.toObjectId(menuId)
            },
            relation,
            subject: {
                type: 'role',
                id: this.toObjectId(roleId),
                relation: 'assigned'
            }
        };
    }

    /**
     * 构造核心 manager 单例归属 admin system 的 relationship。
     */
    private coreManagerSystemRelationship(resourceType: string): RelationshipInput {
        return {
            resource: {
                type: resourceType,
                id: MANAGER_RESOURCE_ID
            },
            relation: 'system',
            subject: {
                type: 'system',
                id: ADMIN_SYSTEM_ID
            }
        };
    }

    /**
     * 构造核心 manager 单例授权给角色的 relationship。
     */
    private coreManagerRoleRelationship(resourceType: string, relation: string, roleId: number): RelationshipInput {
        return {
            resource: {
                type: resourceType,
                id: MANAGER_RESOURCE_ID
            },
            relation,
            subject: {
                type: 'role',
                id: this.toObjectId(roleId)
            }
        };
    }

    /**
     * 构造业务资源对象指向对应 manager 单例的 relationship。
     */
    private coreManagedResourceManagerRelationship(
        resourceType: CoreManagedResourceType,
        resourceId: string
    ): RelationshipInput {
        const managerConfig = RESOURCE_AUTHZ_MANAGER_RELATIONS[resourceType];
        return {
            resource: {
                type: resourceType,
                id: resourceId
            },
            relation: managerConfig.relation,
            subject: {
                type: managerConfig.managerType,
                id: MANAGER_RESOURCE_ID
            }
        };
    }

    /**
     * 构造用户组成员 relationship。
     */
    private userGroupMemberRelationship(groupId: number, userId: string): RelationshipInput {
        return {
            resource: {
                type: 'user_group',
                id: this.toObjectId(groupId)
            },
            relation: 'member',
            subject: {
                type: 'user',
                id: userId
            }
        };
    }

    /**
     * 构造 role/user_group 启用状态 relationship，使用 user:* 表达无条件启用。
     */
    private enabledRelationship(resourceType: 'role' | 'user_group', resourceId: string): RelationshipInput {
        return {
            resource: {
                type: resourceType,
                id: resourceId
            },
            relation: 'enabled',
            subject: {
                type: 'user',
                id: ENABLED_WILDCARD_USER_ID
            }
        };
    }

    /**
     * 返回当前 schema 支持的核心 manager 类型闭集。
     */
    private getCoreManagerResourceTypes(): CoreManagerResourceType[] {
        return Object.keys(CORE_MANAGER_RELATIONS) as CoreManagerResourceType[];
    }

    /**
     * 返回指定核心 manager 类型支持的关系闭集。
     */
    private getCoreManagerRelations(resourceType: CoreManagerResourceType): CoreManagerRelation[] {
        return [...CORE_MANAGER_RELATIONS[resourceType]] as CoreManagerRelation[];
    }

    /**
     * 标准化核心 manager 关系名，去重并丢弃非法值。
     */
    private normalizeCoreManagerRelations(resourceType: CoreManagerResourceType, relations: string[]) {
        const relationSet = new Set(this.getCoreManagerRelations(resourceType));
        const desiredRelationSet = new Set(
            relations.filter((relation) => relationSet.has(relation as CoreManagerRelation))
        );
        return this.getCoreManagerRelations(resourceType).filter((relation) => desiredRelationSet.has(relation));
    }

    /**
     * 标准化字符串列表，去掉空白项并按首次出现顺序去重。
     */
    private normalizeStringList(values: string[]): string[] {
        const result: string[] = [];
        const seen = new Set<string>();
        for (const value of values) {
            const normalizedValue = value.trim();
            if (!normalizedValue || seen.has(normalizedValue)) {
                continue;
            }
            seen.add(normalizedValue);
            result.push(normalizedValue);
        }
        return result;
    }

    /**
     * 按当前授权资源支持的 relation 顺序，规整待写入的 relation 集合。
     */
    private normalizeAuthzResourceRelations(supportedRelations: string[], relations: string[]): string[] {
        const desiredRelationSet = new Set(this.normalizeStringList(relations));
        return this.normalizeStringList(supportedRelations).filter((relation) => desiredRelationSet.has(relation));
    }

    /**
     * 将 SpiceDB relationship 转换为本地用户组成员关系，并过滤非数字用户组 ID。
     */
    private toUserGroupMemberRelations(relationships: RelationshipOutput[]): UserGroupMemberRelation[] {
        return relationships
            .map((relationship) => ({
                userId: relationship.subject.id,
                groupId: Number(relationship.resource.id)
            }))
            .filter((relation) => relation.userId.trim().length > 0 && Number.isInteger(relation.groupId));
    }

    /**
     * 将 SpiceDB relationship 转换为本地用户直接角色关系，并过滤非数字角色 ID。
     */
    private toUserRoleRelations(relationships: RelationshipOutput[]): UserRoleRelation[] {
        return relationships
            .map((relationship) => ({
                userId: relationship.subject.id,
                roleId: Number(relationship.resource.id)
            }))
            .filter((relation) => relation.userId.trim().length > 0 && Number.isInteger(relation.roleId));
    }

    /**
     * 将 SpiceDB relationship 转换为本地用户组角色关系，并过滤非数字用户组或角色 ID。
     */
    private toUserGroupRoleRelations(relationships: RelationshipOutput[]): UserGroupRoleRelation[] {
        return relationships
            .map((relationship) => ({
                groupId: Number(relationship.subject.id),
                roleId: Number(relationship.resource.id)
            }))
            .filter((relation) => Number.isInteger(relation.groupId) && Number.isInteger(relation.roleId));
    }

    /**
     * 将 SpiceDB relationship 转换为本地菜单角色关系，并过滤非数字菜单或角色 ID。
     */
    private toMenuRoleRelations(relationships: RelationshipOutput[]): MenuRoleRelation[] {
        return relationships
            .map((relationship) => ({
                menuId: Number(relationship.resource.id),
                roleId: Number(relationship.subject.id),
                relation: relationship.relation
            }))
            .filter(
                (relation) =>
                    Number.isInteger(relation.menuId) &&
                    Number.isInteger(relation.roleId) &&
                    relation.relation.trim().length > 0
            );
    }

    /**
     * 数字数组去重并保持正整数。
     */
    private uniqueNumbers(values: number[]): number[] {
        return [...new Set(values)].filter((value) => Number.isInteger(value) && value > 0);
    }

    /**
     * 将字符串 ID 数组转换成稳定排序的数字 ID 数组，过滤非数字实体。
     */
    private toNumericIds(ids: string[]): number[] {
        return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))].sort(
            (left, right) => left - right
        );
    }

    /**
     * 统一包装 SpiceDB 上游错误并记录上下文。
     */
    private createSpiceDbError(summary: string, error: unknown, context?: Record<string, any>) {
        if (error instanceof BusinessException) {
            return error;
        }

        const message = error instanceof Error ? error.message : String(error);
        // 保留完整 detail 调用：SpiceDB 上游错误是关键调试断点，需要保留 message / context 完整字段以便回溯调用上下文
        this.logger.error(summary, {
            message,
            context
        });

        return new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
            summary,
            message,
            ...context
        });
    }
}
