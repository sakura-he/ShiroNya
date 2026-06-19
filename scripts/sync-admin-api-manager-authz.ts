// 从业务库源表重建 admin-api 核心 manager AuthZ 关系。
// 数据来源：后台用户、角色、菜单、用户组、任务元数据，以及 authz_resource_role_binding。
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSpiceDbToolkit, loadConfig, type RelationshipInput } from '@spicedb-toolkit/core';
import { ExtendedPrismaClient } from '../libs/prisma-admin/src/extended-client';
import {
    CORE_MANAGER_RELATIONS,
    type CoreManagerRelation,
    type CoreManagerResourceType
} from '../apps/admin-api/src/modules/spicedb/core-manager-authz.constants';

const ADMIN_SYSTEM_ID = 'admin';
const MANAGER_RESOURCE_ID = 'default';

type Toolkit = ReturnType<typeof createSpiceDbToolkit>;
type PrismaClient = InstanceType<typeof ExtendedPrismaClient>;
type ManagerBinding = {
    resourceType: CoreManagerResourceType;
    relation: CoreManagerRelation;
    roleId: number;
};

/**
 * 按项目约定加载根目录 .env 与环境专属 .env。
 */
function loadProjectEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];
    for (const envFile of envFiles) {
        if (!existsSync(envFile)) {
            continue;
        }
        loadEnv({ path: envFile, override: true });
    }
}

/**
 * 将数字主键转换为 SpiceDB object id。
 */
function toObjectId(id: number): string {
    return String(id);
}

/**
 * 判断字符串是否为当前 schema 支持的核心 manager 类型。
 */
function isCoreManagerResourceType(value: string): value is CoreManagerResourceType {
    return value in CORE_MANAGER_RELATIONS;
}

/**
 * 判断关系是否属于指定核心 manager 类型的闭集。
 */
function isCoreManagerRelation(resourceType: CoreManagerResourceType, relation: string): relation is CoreManagerRelation {
    return CORE_MANAGER_RELATIONS[resourceType].includes(relation as CoreManagerRelation);
}

/**
 * 构造 manager 单例归属 admin system 的 relationship。
 */
function createManagerSystemRelationship(resourceType: CoreManagerResourceType): RelationshipInput {
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
 * 构造 manager 单例授权给角色的 relationship。
 */
function createManagerRoleRelationship(binding: ManagerBinding): RelationshipInput {
    return {
        resource: {
            type: binding.resourceType,
            id: MANAGER_RESOURCE_ID
        },
        relation: binding.relation,
        subject: {
            type: 'role',
            id: toObjectId(binding.roleId)
        }
    };
}

/**
 * 构造后台用户资源的基础 relationships。
 */
function createAdminUserBaseRelationships(userId: string): RelationshipInput[] {
    return [
        {
            resource: {
                type: 'admin_user',
                id: userId
            },
            relation: 'manager',
            subject: {
                type: 'user_manager',
                id: MANAGER_RESOURCE_ID
            }
        },
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
    ];
}

/**
 * 构造业务资源对象到对应 manager 单例的 relationship。
 */
function createManagedObjectRelationship(
    resourceType: 'role' | 'menu' | 'user_group',
    resourceId: string,
    managerType: 'role_manager' | 'menu_manager' | 'user_group_manager'
): RelationshipInput {
    return {
        resource: {
            type: resourceType,
            id: resourceId
        },
        relation: 'authz_manager',
        subject: {
            type: managerType,
            id: MANAGER_RESOURCE_ID
        }
    };
}

/**
 * 构造任务对象基础 relationships。
 */
function createTaskBaseRelationships(task: { id: number; userId: string }): RelationshipInput[] {
    return [
        {
            resource: {
                type: 'task',
                id: toObjectId(task.id)
            },
            relation: 'manager',
            subject: {
                type: 'task_manager',
                id: MANAGER_RESOURCE_ID
            }
        },
        {
            resource: {
                type: 'task',
                id: toObjectId(task.id)
            },
            relation: 'creator',
            subject: {
                type: 'user',
                id: task.userId
            }
        }
    ];
}

/**
 * 删除可重建的 manager 与对象基础关系，保留菜单 viewer、角色 assignee、用户组 member 等业务分配关系。
 */
async function cleanupRebuildableRelationships(toolkit: Toolkit): Promise<void> {
    for (const resourceType of Object.keys(CORE_MANAGER_RELATIONS) as CoreManagerResourceType[]) {
        await toolkit.relationship.deleteRelationships({
            filter: {
                resourceType
            }
        });
    }
    await toolkit.relationship.deleteRelationships({
        filter: {
            resourceType: 'admin_user'
        }
    });
    for (const resourceType of ['role', 'menu', 'user_group'] as const) {
        await toolkit.relationship.deleteRelationships({
            filter: {
                resourceType,
                relation: 'authz_manager'
            }
        });
    }
    for (const relation of ['manager', 'creator']) {
        await toolkit.relationship.deleteRelationships({
            filter: {
                resourceType: 'task',
                relation
            }
        });
    }
}

/**
 * 从业务库加载 manager 源数据并校验无效引用。
 */
async function loadSource(prisma: PrismaClient): Promise<{
    userIds: string[];
    roles: Array<{ id: number }>;
    menuIds: number[];
    userGroupIds: number[];
    tasks: Array<{ id: number; userId: string }>;
    bindings: ManagerBinding[];
}> {
    const [users, roles, menus, userGroups, tasks, rawBindings] = await Promise.all([
        prisma.betterAuthUser.findMany({
            select: {
                id: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        }),
        prisma.rbacRole.findMany({
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        }),
        prisma.rbacMenu.findMany({
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        }),
        prisma.rbacUserGroup.findMany({
            select: {
                id: true
            },
            orderBy: {
                id: 'asc'
            }
        }),
        prisma.task.findMany({
            select: {
                id: true,
                userId: true
            },
            orderBy: {
                id: 'asc'
            }
        }),
        prisma.authzResourceRoleBinding.findMany({
            select: {
                resourceType: true,
                resourceId: true,
                roleId: true
            }
        })
    ]);
    const roleIds = new Set(roles.map((role) => role.id));
    const invalidBindings = rawBindings.filter((binding) => {
        if (!roleIds.has(binding.roleId) || !isCoreManagerResourceType(binding.resourceType)) {
            return true;
        }
        return !isCoreManagerRelation(binding.resourceType, binding.resourceId);
    });

    if (invalidBindings.length > 0) {
        throw new Error(`manager AuthZ 源表存在无效记录：${JSON.stringify(invalidBindings)}`);
    }

    return {
        userIds: users.map((user) => user.id),
        roles,
        menuIds: menus.map((menu) => menu.id),
        userGroupIds: userGroups.map((group) => group.id),
        tasks,
        bindings: rawBindings
            .filter((binding) => isCoreManagerResourceType(binding.resourceType))
            .map((binding) => ({
                resourceType: binding.resourceType as CoreManagerResourceType,
                relation: binding.resourceId as CoreManagerRelation,
                roleId: binding.roleId
            }))
    };
}

/**
 * 根据源数据生成完整 relationship 集合。
 */
function buildRelationships(source: Awaited<ReturnType<typeof loadSource>>): RelationshipInput[] {
    return [
        ...(Object.keys(CORE_MANAGER_RELATIONS) as CoreManagerResourceType[]).map(createManagerSystemRelationship),
        ...source.bindings.map(createManagerRoleRelationship),
        ...source.userIds.flatMap(createAdminUserBaseRelationships),
        ...source.roles.map((role) => createManagedObjectRelationship('role', toObjectId(role.id), 'role_manager')),
        ...source.menuIds.map((menuId) => createManagedObjectRelationship('menu', toObjectId(menuId), 'menu_manager')),
        ...source.userGroupIds.map((groupId) =>
            createManagedObjectRelationship('user_group', toObjectId(groupId), 'user_group_manager')
        ),
        ...source.tasks.flatMap(createTaskBaseRelationships)
    ];
}

/**
 * 脚本入口：重建可推导的 manager AuthZ relationships。
 */
async function main(): Promise<void> {
    loadProjectEnv();
    const dryRun = process.argv.includes('--dry-run');
    const prisma = new ExtendedPrismaClient();
    const config = await loadConfig(undefined, {
        skipValidation: true
    });
    const toolkit = createSpiceDbToolkit(config);

    try {
        const source = await loadSource(prisma);
        const relationships = buildRelationships(source);
        console.log(
            `manager 同步${dryRun ? ' dry-run' : ''}：用户 ${source.userIds.length}，角色 ${source.roles.length}，菜单 ${source.menuIds.length}，用户组 ${source.userGroupIds.length}，任务 ${source.tasks.length}，manager binding ${source.bindings.length}，待写 relationship ${relationships.length}。`
        );
        if (dryRun) {
            return;
        }

        await cleanupRebuildableRelationships(toolkit);
        if (relationships.length > 0) {
            await toolkit.relationship.touchRelationships({
                relationships
            });
        }
        console.log('manager AuthZ 同步完成。');
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error) => {
    console.error('[sync-admin-api-manager-authz] 同步失败', error);
    process.exitCode = 1;
});
