// 只读审计脚本：连接 admin 数据库与 SpiceDB，输出完整的菜单 / 角色 / 用户组 / SpiceDB 关系现状。
// 目的：给 AuthZ 权限重构计划书提供事实依据。脚本不会写库，结果通过 stdout 输出 JSON。
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSpiceDbToolkit, loadConfig, type RelationshipOutput } from '@spicedb-toolkit/core';
import { ExtendedPrismaClient } from '../libs/prisma-admin/src/extended-client';
import {
    AUTHZ_OBJECT_EXCEPTION_RELATIONS,
    type AuthzObjectExceptionResourceType
} from '../apps/admin-api/src/modules/spicedb/object-exception-authz.constants';
import { CORE_MANAGER_RELATIONS } from '../apps/admin-api/src/modules/spicedb/core-manager-authz.constants';

const TASK_MANAGER_RESOURCE_ID = 'default';
const TASK_MANAGER_ROLE_RELATIONS = CORE_MANAGER_RELATIONS.task_manager;
const CORE_MANAGED_OBJECT_RELATIONS = [
    { resourceType: 'admin_user', relation: 'manager', managerType: 'user_manager' },
    { resourceType: 'admin_user', relation: 'self', managerType: 'user' },
    { resourceType: 'role', relation: 'authz_manager', managerType: 'role_manager' },
    { resourceType: 'menu', relation: 'authz_manager', managerType: 'menu_manager' },
    { resourceType: 'user_group', relation: 'authz_manager', managerType: 'user_group_manager' }
] as const;

type ObjectExceptionSourceRow = {
    resourceType: string;
    resourceId: string;
    relation: string;
    subjectKind: string;
    subjectId: string;
};

// 只在脚本启动时加载一次 env，读取仓库根目录环境变量。
function loadProjectEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];
    for (const envFile of envFiles) {
        if (!existsSync(envFile)) continue;
        loadEnv({ path: envFile, override: true });
    }
}

// 把 RelationshipOutput 数组按四元组聚合为可读字符串，方便人工核对。
function formatTuple(rel: RelationshipOutput): string {
    const subjectRelation = rel.subject.relation ? `#${rel.subject.relation}` : '';
    return `${rel.resource.type}:${rel.resource.id}#${rel.relation}@${rel.subject.type}:${rel.subject.id}${subjectRelation}`;
}

// 把对象例外授权源表行格式化为可读字符串，方便和 SpiceDB tuple 对照。
function formatObjectExceptionSource(row: ObjectExceptionSourceRow): string {
    return `${row.resourceType}:${row.resourceId}#${row.relation}@${row.subjectKind}:${row.subjectId}`;
}

// 为对象例外授权源表行生成稳定 key，供漂移对账使用。
function createObjectExceptionSourceKey(row: ObjectExceptionSourceRow): string {
    return [row.resourceType, row.resourceId, row.relation, row.subjectKind, row.subjectId].join(':');
}

// 把 SpiceDB tuple 转换为对象例外授权源表同构 key，供漂移对账使用。
function createObjectExceptionTupleKey(rel: RelationshipOutput): string {
    const subjectKind = rel.subject.type === 'role' && rel.subject.relation === 'assigned' ? 'role_assigned' : rel.subject.type;
    return [rel.resource.type, rel.resource.id, rel.relation, subjectKind, rel.subject.id].join(':');
}

// 判断对象例外源表 relation 是否属于当前资源类型支持的闭集。
function isKnownObjectExceptionRelation(resourceType: string, relation: string): boolean {
    const config = AUTHZ_OBJECT_EXCEPTION_RELATIONS[resourceType as AuthzObjectExceptionResourceType];
    return Boolean(config && (config.relations as readonly string[]).includes(relation));
}

// 调用 toolkit.relationship.readRelationships 拉全量并自动翻页，避免 100 条上限截断。
async function readAll(
    toolkit: ReturnType<typeof createSpiceDbToolkit>,
    filter: Parameters<typeof toolkit.relationship.readRelationships>[0]['filter']
): Promise<RelationshipOutput[]> {
    const out: RelationshipOutput[] = [];
    let cursor: string | undefined;
    // SpiceDB 默认分页 100 条，需要循环直到 cursor 为空才算读完。
    do {
        const page = await toolkit.relationship.readRelationships({
            filter,
            pageSize: 1000,
            cursor
        });
        out.push(...page.relationships);
        cursor = (page as any).cursor || undefined;
        if (!cursor) break;
    } while (true);
    return out;
}

// 读取尚未发布到远端 schema 的新增对象例外关系时，远端不支持则按空集合处理。
async function readOptionalNewRelation(
    toolkit: ReturnType<typeof createSpiceDbToolkit>,
    filter: Parameters<typeof toolkit.relationship.readRelationships>[0]['filter']
): Promise<RelationshipOutput[]> {
    try {
        return await readAll(toolkit, filter);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found under definition')) {
            return [];
        }
        throw error;
    }
}

// 执行完整只读巡检，汇总 DB、SpiceDB 和对象例外授权漂移报告。
async function main() {
    loadProjectEnv();

    const prisma = new ExtendedPrismaClient();
    const config = await loadConfig(undefined, { skipValidation: true });
    const toolkit = createSpiceDbToolkit(config);

    try {
        // ---- 1. 业务库元数据 ----
        const [roles, menus, userGroups, users, tasks] = await Promise.all([
            prisma.rbacRole.findMany({ orderBy: { id: 'asc' } }),
            prisma.rbacMenu.findMany({ orderBy: [{ pid: 'asc' }, { order: 'asc' }, { id: 'asc' }] }),
            prisma.rbacUserGroup.findMany({ orderBy: { id: 'asc' } }),
            prisma.betterAuthUser.findMany({
                select: { id: true, username: true, email: true, name: true, banned: true, createdAt: true },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.task.findMany({
                select: { id: true, userId: true, name: true, status: true },
                orderBy: { id: 'asc' }
            })
        ]);

        // ---- 2. 投影表（本地读模型） ----
        const [
            userRoleProjection,
            userGroupMemberProjection,
            userGroupRoleProjection,
            menuRoleProjection,
            authzResourceRoleBindings,
            authzObjectSubjectBindings
        ] = await Promise.all([
            prisma.spiceDbUserRoleProjection.findMany(),
            prisma.spiceDbUserGroupMemberProjection.findMany(),
            prisma.spiceDbUserGroupRoleProjection.findMany(),
            prisma.spiceDbMenuRoleProjection.findMany(),
            prisma.authzResourceRoleBinding.findMany(),
            prisma.authzObjectSubjectBinding.findMany({
                select: {
                    resourceType: true,
                    resourceId: true,
                    relation: true,
                    subjectKind: true,
                    subjectId: true
                }
            })
        ]);

        // ---- 3. SpiceDB schema ----
        const schemaResult = await toolkit.schema.read();

        // ---- 4. SpiceDB 各类 relationship ----
        const [
            systemAdmins,
            roleEnabled,
            roleAssigneeUser,
            roleAssigneeGroup,
            menuSystem,
            menuViewer,
            menuManager,
            userGroupMember,
            userGroupEnabled,
            taskManagerSystem,
            taskManagerRoleRelations,
            taskManagerLinks,
            taskCreators,
            coreManagerSystem,
            coreManagerRoleRelations,
            coreManagedObjectRelations,
            objectExceptionRelationships
        ] = await Promise.all([
            readAll(toolkit, { resourceType: 'system' }),
            readAll(toolkit, { resourceType: 'role', relation: 'enabled' }),
            readAll(toolkit, {
                resourceType: 'role',
                relation: 'assignee',
                subjectFilter: { type: 'user' }
            }),
            readAll(toolkit, {
                resourceType: 'role',
                relation: 'assignee',
                subjectFilter: { type: 'user_group', relation: 'active_member' }
            }),
            readAll(toolkit, { resourceType: 'menu', relation: 'system' }),
            readAll(toolkit, {
                resourceType: 'menu',
                relation: 'viewer',
                subjectFilter: { type: 'role', relation: 'assigned' }
            }),
            readAll(toolkit, {
                resourceType: 'menu',
                relation: 'manager',
                subjectFilter: { type: 'role', relation: 'assigned' }
            }),
            readAll(toolkit, {
                resourceType: 'user_group',
                relation: 'member',
                subjectFilter: { type: 'user' }
            }),
            readAll(toolkit, { resourceType: 'user_group', relation: 'enabled' }),
            readAll(toolkit, {
                resourceType: 'task_manager',
                relation: 'system'
            }),
            Promise.all(
                TASK_MANAGER_ROLE_RELATIONS.map((relation) =>
                    readAll(toolkit, {
                        resourceType: 'task_manager',
                        relation,
                        subjectFilter: { type: 'role' }
                    })
                )
            ).then((groups) => groups.flat()),
            readAll(toolkit, {
                resourceType: 'task',
                relation: 'manager',
                subjectFilter: { type: 'task_manager' }
            }),
            readAll(toolkit, {
                resourceType: 'task',
                relation: 'creator',
                subjectFilter: { type: 'user' }
            }),
            Promise.all(
                Object.keys(CORE_MANAGER_RELATIONS).map((resourceType) =>
                    readAll(toolkit, {
                        resourceType,
                        relation: 'system'
                    })
                )
            ).then((groups) => groups.flat()),
            Promise.all(
                Object.entries(CORE_MANAGER_RELATIONS).flatMap(([resourceType, relations]) =>
                    relations.map((relation) =>
                        readAll(toolkit, {
                            resourceType,
                            relation,
                            subjectFilter: { type: 'role' }
                        })
                    )
                )
            ).then((groups) => groups.flat()),
            Promise.all(
                CORE_MANAGED_OBJECT_RELATIONS.map((item) =>
                    readAll(toolkit, {
                        resourceType: item.resourceType,
                        relation: item.relation
                    })
                )
            ).then((groups) => groups.flat()),
            Promise.all(
                Object.entries(AUTHZ_OBJECT_EXCEPTION_RELATIONS).flatMap(([resourceType, config]) =>
                    config.relations.map((relation) =>
                        readOptionalNewRelation(toolkit, {
                            resourceType,
                            relation
                        })
                    )
                )
            ).then((groups) => groups.flat())
        ]);

        // ---- 5. 派生汇总 ----
        const menusById = new Map(menus.map((m) => [m.id, m]));
        const tasksById = new Map(tasks.map((task) => [task.id, task]));
        const dbMenuParentMissing = menus
            .filter((menu) => menu.pid !== null && !menusById.has(menu.pid))
            .map((menu) => ({ id: menu.id, permission: menu.requiredPermissionCode, title: menu.title, pid: menu.pid }));

        // 检查每个 SpiceDB menu 关系背后的 menuId 是否真的存在于业务库（实体实例缺失）。
        const orphanMenuTuples = [...menuSystem, ...menuViewer, ...menuManager]
            .filter((rel) => !menusById.has(Number(rel.resource.id)))
            .map((rel) => formatTuple(rel));

        const orphanRoleTuples = [...roleEnabled, ...roleAssigneeUser, ...roleAssigneeGroup]
            .filter((rel) => !roles.some((r) => r.id === Number(rel.resource.id)))
            .map((rel) => formatTuple(rel));

        const orphanUserGroupTuples = [...userGroupMember, ...userGroupEnabled]
            .filter((rel) => !userGroups.some((g) => g.id === Number(rel.resource.id)))
            .map((rel) => formatTuple(rel));
        const orphanTaskManagerSystemTuples = taskManagerSystem
            .filter(
                (rel) =>
                    rel.resource.id !== TASK_MANAGER_RESOURCE_ID ||
                    rel.subject.type !== 'system' ||
                    rel.subject.id !== 'admin'
            )
            .map((rel) => formatTuple(rel));
        const orphanTaskManagerRoleTuples = taskManagerRoleRelations
            .filter(
                (rel) =>
                    rel.resource.id !== TASK_MANAGER_RESOURCE_ID ||
                    !roles.some((role) => role.id === Number(rel.subject.id)) ||
                    !TASK_MANAGER_ROLE_RELATIONS.includes(rel.relation as (typeof TASK_MANAGER_ROLE_RELATIONS)[number])
            )
            .map((rel) => formatTuple(rel));
        const orphanTaskManagerLinkTuples = taskManagerLinks
            .filter(
                (rel) =>
                    !tasksById.has(Number(rel.resource.id)) ||
                    rel.subject.type !== 'task_manager' ||
                    rel.subject.id !== TASK_MANAGER_RESOURCE_ID
            )
            .map((rel) => formatTuple(rel));
        const orphanTaskCreatorTuples = taskCreators
            .filter(
                (rel) =>
                    !tasksById.has(Number(rel.resource.id)) || !users.some((user) => user.id === rel.subject.id)
            )
            .map((rel) => formatTuple(rel));
        const coreManagerMissingSystem = (Object.keys(CORE_MANAGER_RELATIONS) as Array<keyof typeof CORE_MANAGER_RELATIONS>).filter(
            (resourceType) =>
                !coreManagerSystem.some(
                    (rel) =>
                        rel.resource.type === resourceType &&
                        rel.resource.id === TASK_MANAGER_RESOURCE_ID &&
                        rel.subject.type === 'system' &&
                        rel.subject.id === 'admin'
                )
        );
        const orphanCoreManagerRoleTuples = coreManagerRoleRelations
            .filter((rel) => !roles.some((role) => role.id === Number(rel.subject.id)))
            .map((rel) => formatTuple(rel));
        const orphanCoreManagedObjectTuples = coreManagedObjectRelations
            .filter((rel) => {
                if (rel.resource.type === 'admin_user') {
                    return !users.some((user) => user.id === rel.resource.id);
                }
                if (rel.resource.type === 'role') {
                    return !roles.some((role) => role.id === Number(rel.resource.id));
                }
                if (rel.resource.type === 'menu') {
                    return !menusById.has(Number(rel.resource.id));
                }
                if (rel.resource.type === 'user_group') {
                    return !userGroups.some((group) => group.id === Number(rel.resource.id));
                }
                return true;
            })
            .map((rel) => formatTuple(rel));

        const userIdSet = new Set(users.map((user) => user.id));
        const roleIdSet = new Set(roles.map((role) => role.id));
        const menuIdSet = new Set(menus.map((menu) => menu.id));
        const userGroupIdSet = new Set(userGroups.map((group) => group.id));
        const taskIdSet = new Set(tasks.map((task) => task.id));
        const objectExceptionSourceRows = authzObjectSubjectBindings as ObjectExceptionSourceRow[];
        const objectExceptionSourceKeys = new Set(
            objectExceptionSourceRows
                .filter((row) => {
                    return (
                        isKnownObjectExceptionRelation(row.resourceType, row.relation) &&
                        (row.subjectKind === 'user' || row.subjectKind === 'role_assigned')
                    );
                })
                .map(createObjectExceptionSourceKey)
        );
        const objectExceptionTupleKeys = new Set(objectExceptionRelationships.map(createObjectExceptionTupleKey));
        const invalidObjectExceptionSourceRelations = objectExceptionSourceRows
            .filter((row) => !isKnownObjectExceptionRelation(row.resourceType, row.relation))
            .map(formatObjectExceptionSource);
        const invalidObjectExceptionSourceSubjects = objectExceptionSourceRows
            .filter((row) => row.subjectKind !== 'user' && row.subjectKind !== 'role_assigned')
            .map(formatObjectExceptionSource);
        const orphanObjectExceptionSourceResources = objectExceptionSourceRows
            .filter((row) => {
                if (row.resourceType === 'admin_user') return !userIdSet.has(row.resourceId);
                if (row.resourceType === 'role') return !roleIdSet.has(Number(row.resourceId));
                if (row.resourceType === 'menu') return !menuIdSet.has(Number(row.resourceId));
                if (row.resourceType === 'user_group') return !userGroupIdSet.has(Number(row.resourceId));
                if (row.resourceType === 'task') return !taskIdSet.has(Number(row.resourceId));
                return true;
            })
            .map(formatObjectExceptionSource);
        const orphanObjectExceptionSourceSubjects = objectExceptionSourceRows
            .filter((row) => {
                if (row.subjectKind === 'user') return !userIdSet.has(row.subjectId);
                if (row.subjectKind === 'role_assigned') return !roleIdSet.has(Number(row.subjectId));
                return true;
            })
            .map(formatObjectExceptionSource);
        const orphanObjectExceptionTuples = objectExceptionRelationships
            .filter((rel) => {
                if (rel.resource.type === 'admin_user' && !userIdSet.has(rel.resource.id)) return true;
                if (rel.resource.type === 'role' && !roleIdSet.has(Number(rel.resource.id))) return true;
                if (rel.resource.type === 'menu' && !menuIdSet.has(Number(rel.resource.id))) return true;
                if (rel.resource.type === 'user_group' && !userGroupIdSet.has(Number(rel.resource.id))) return true;
                if (rel.resource.type === 'task' && !taskIdSet.has(Number(rel.resource.id))) return true;
                if (rel.subject.type === 'user') return !userIdSet.has(rel.subject.id);
                if (rel.subject.type === 'role' && rel.subject.relation === 'assigned') {
                    return !roleIdSet.has(Number(rel.subject.id));
                }
                return true;
            })
            .map(formatTuple);
        const objectExceptionSourceMissingSpiceDb = objectExceptionSourceRows
            .filter((row) => !objectExceptionTupleKeys.has(createObjectExceptionSourceKey(row)))
            .map(formatObjectExceptionSource);
        const objectExceptionSpiceDbMissingSource = objectExceptionRelationships
            .filter((rel) => !objectExceptionSourceKeys.has(createObjectExceptionTupleKey(rel)))
            .map(formatTuple);

        // 业务实体缺少基础关系（漏写 system 归属或 enabled）。
        const enabledRolesMissingEnabled = roles.filter(
            (r) => r.status === 'ENABLE' && !roleEnabled.some((rel) => Number(rel.resource.id) === r.id)
        );
        const menusMissingSystem = menus.filter((m) => !menuSystem.some((rel) => Number(rel.resource.id) === m.id));
        const userGroupsMissingEnabled = userGroups.filter(
            (g) => g.status === 'ENABLE' && !userGroupEnabled.some((rel) => Number(rel.resource.id) === g.id)
        );
        const tasksMissingManager = tasks.filter(
            (task) =>
                !taskManagerLinks.some(
                    (rel) =>
                        Number(rel.resource.id) === task.id &&
                        rel.subject.type === 'task_manager' &&
                        rel.subject.id === TASK_MANAGER_RESOURCE_ID
                )
        );
        const tasksMissingCreator = tasks.filter(
            (task) =>
                !taskCreators.some(
                    (rel) =>
                        Number(rel.resource.id) === task.id &&
                        rel.subject.type === 'user' &&
                        rel.subject.id === task.userId
                )
        );
        const taskManagerMissingSystem = !taskManagerSystem.some(
            (rel) =>
                rel.resource.id === TASK_MANAGER_RESOURCE_ID &&
                rel.subject.type === 'system' &&
                rel.subject.id === 'admin'
        );

        // permission 命名风格统计（用于命名规范评估）。
        const permissionSegmentStats = menus.reduce<Record<string, number>>((acc, m) => {
            const segments = m.requiredPermissionCode.split('.').length;
            acc[String(segments)] = (acc[String(segments)] || 0) + 1;
            return acc;
        }, {});
        const permissionTopLevel = [...new Set(menus.map((m) => m.requiredPermissionCode.split('.')[0]).filter(Boolean))].sort();

        const report = {
            generatedAt: new Date().toISOString(),
            spicedb: {
                schemaText: schemaResult.schemaText,
                tupleCounts: {
                    'system.*': systemAdmins.length,
                    'role.enabled': roleEnabled.length,
                    'role.assignee@user': roleAssigneeUser.length,
                    'role.assignee@user_group#active_member': roleAssigneeGroup.length,
                    'menu.system': menuSystem.length,
                    'menu.viewer@role#assigned': menuViewer.length,
                    'menu.manager@role#assigned': menuManager.length,
                    'user_group.member@user': userGroupMember.length,
                    'user_group.enabled': userGroupEnabled.length,
                    'task_manager.system': taskManagerSystem.length,
                    'task_manager.relation@role': taskManagerRoleRelations.length,
                    'task.manager@task_manager': taskManagerLinks.length,
                    'task.creator@user': taskCreators.length,
                    'core_manager.system': coreManagerSystem.length,
                    'core_manager.relation@role': coreManagerRoleRelations.length,
                    'core_managed.object_base': coreManagedObjectRelations.length,
                    'object_exception.allowed_relations': objectExceptionRelationships.length
                },
                tuples: {
                    system: systemAdmins.map(formatTuple),
                    roleEnabled: roleEnabled.map(formatTuple),
                    roleAssigneeUser: roleAssigneeUser.map(formatTuple),
                    roleAssigneeGroup: roleAssigneeGroup.map(formatTuple),
                    menuSystem: menuSystem.map(formatTuple),
                    menuViewer: menuViewer.map(formatTuple),
                    menuManager: menuManager.map(formatTuple),
                    userGroupMember: userGroupMember.map(formatTuple),
                    userGroupEnabled: userGroupEnabled.map(formatTuple),
                    taskManagerSystem: taskManagerSystem.map(formatTuple),
                    taskManagerRoleRelations: taskManagerRoleRelations.map(formatTuple),
                    taskManagerLinks: taskManagerLinks.map(formatTuple),
                    taskCreators: taskCreators.map(formatTuple),
                    coreManagerSystem: coreManagerSystem.map(formatTuple),
                    coreManagerRoleRelations: coreManagerRoleRelations.map(formatTuple),
                    coreManagedObjectRelations: coreManagedObjectRelations.map(formatTuple),
                    objectExceptionRelationships: objectExceptionRelationships.map(formatTuple)
                }
            },
            db: {
                roleCount: roles.length,
                roles: roles.map((r) => ({
                    id: r.id,
                    code: r.code,
                    name: r.name,
                    status: r.status,
                    description: r.description
                })),
                userGroups: userGroups.map((g) => ({
                    id: g.id,
                    code: g.code,
                    name: g.name,
                    status: g.status
                })),
                userCount: users.length,
                users: users.map((u) => ({
                    id: u.id,
                    username: u.username,
                    email: u.email,
                    name: u.name,
                    banned: u.banned
                })),
                taskCount: tasks.length,
                tasks: tasks.map((task) => ({
                    id: task.id,
                    name: task.name,
                    userId: task.userId,
                    status: task.status
                })),
                menuCount: menus.length,
                menus: menus.map((m) => ({
                    id: m.id,
                    pid: m.pid,
                    permission: m.requiredPermissionCode,
                    title: m.title,
                    type: m.type,
                    path: m.path,
                    status: m.status,
                    isMenuVisible: m.isMenuVisible,
                    componentName: m.componentName,
                    componentPath: m.componentPath
                }))
            },
            projections: {
                userRole: userRoleProjection.length,
                userGroupMember: userGroupMemberProjection.length,
                userGroupRole: userGroupRoleProjection.length,
                menuRole: menuRoleProjection.length,
                menuRoleSamples: menuRoleProjection.slice(0, 50),
                authzResourceRoleBindings: authzResourceRoleBindings.length,
                authzResourceRoleBindingSamples: authzResourceRoleBindings.slice(0, 50),
                authzObjectSubjectBindings: authzObjectSubjectBindings.length,
                authzObjectSubjectBindingSamples: authzObjectSubjectBindings.slice(0, 50)
            },
            consistency: {
                dbMenuParentMissing,
                enabledRolesMissingEnabled: enabledRolesMissingEnabled.map((r) => ({ id: r.id, code: r.code })),
                menusMissingSystem: menusMissingSystem.map((m) => ({ id: m.id, permission: m.requiredPermissionCode })),
                userGroupsMissingEnabled: userGroupsMissingEnabled.map((g) => ({ id: g.id, code: g.code })),
                orphanMenuTuples,
                orphanRoleTuples,
                orphanUserGroupTuples,
                orphanTaskManagerSystemTuples,
                orphanTaskManagerRoleTuples,
                orphanTaskManagerLinkTuples,
                orphanTaskCreatorTuples,
                coreManagerMissingSystem,
                orphanCoreManagerRoleTuples,
                orphanCoreManagedObjectTuples,
                tasksMissingManager: tasksMissingManager.map((task) => ({ id: task.id, name: task.name })),
                tasksMissingCreator: tasksMissingCreator.map((task) => ({ id: task.id, name: task.name })),
                taskManagerMissingSystem,
                invalidObjectExceptionSourceRelations,
                invalidObjectExceptionSourceSubjects,
                orphanObjectExceptionSourceResources,
                orphanObjectExceptionSourceSubjects,
                orphanObjectExceptionTuples,
                objectExceptionSourceMissingSpiceDb,
                objectExceptionSpiceDbMissingSource
            },
            namingAudit: {
                permissionSegmentDistribution: permissionSegmentStats,
                topLevelNamespaces: permissionTopLevel,
                permissionsContainingDoubleDot: menus
                    .filter((m) => m.requiredPermissionCode.includes('..'))
                    .map((m) => ({ id: m.id, permission: m.requiredPermissionCode })),
                permissionsWithUppercase: menus
                    .filter((m) => /[A-Z]/.test(m.requiredPermissionCode))
                    .map((m) => ({ id: m.id, permission: m.requiredPermissionCode })),
                permissionsWithUnderscore: menus
                    .filter((m) => m.requiredPermissionCode.includes('_'))
                    .map((m) => ({ id: m.id, permission: m.requiredPermissionCode }))
            }
        };

        const outDir = resolve(process.cwd(), '.tmp');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const outPath = resolve(outDir, 'authz-state.json');
        writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');

        // 控制台只输出汇总；完整 JSON 落盘 .tmp/authz-state.json 便于浏览。
        console.log('=== AuthZ / SpiceDB 现状审计 ===');
        console.log(`生成时间: ${report.generatedAt}`);
        console.log(`报告路径: ${outPath}`);
        console.log('--- SpiceDB tuple 数量 ---');
        for (const [k, v] of Object.entries(report.spicedb.tupleCounts)) {
            console.log(`  ${k.padEnd(40)}: ${v}`);
        }
        console.log('--- DB 元数据 ---');
        console.log(`  roles            : ${report.db.roleCount}`);
        console.log(`  userGroups       : ${report.db.userGroups.length}`);
        console.log(`  users            : ${report.db.userCount}`);
        console.log(`  tasks            : ${report.db.taskCount}`);
        console.log(`  menus            : ${report.db.menuCount}`);
        console.log('--- 投影表 ---');
        for (const [k, v] of Object.entries(report.projections)) {
            if (typeof v === 'number') console.log(`  ${k.padEnd(20)}: ${v}`);
        }
        console.log('--- 一致性问题 ---');
        console.log(`  菜单父级记录缺失                       : ${report.consistency.dbMenuParentMissing.length}`);
        console.log(
            `  启用角色缺 enabled 关系                : ${report.consistency.enabledRolesMissingEnabled.length}`
        );
        console.log(`  菜单缺 system 关系                     : ${report.consistency.menusMissingSystem.length}`);
        console.log(`  启用用户组缺 enabled 关系              : ${report.consistency.userGroupsMissingEnabled.length}`);
        console.log(
            `  任务管理资源缺 system 关系             : ${report.consistency.taskManagerMissingSystem ? 1 : 0}`
        );
        console.log(`  孤儿 menu tuple                        : ${report.consistency.orphanMenuTuples.length}`);
        console.log(`  孤儿 role tuple                        : ${report.consistency.orphanRoleTuples.length}`);
        console.log(`  孤儿 user_group tuple                  : ${report.consistency.orphanUserGroupTuples.length}`);
        console.log(`  任务缺 manager 关系                   : ${report.consistency.tasksMissingManager.length}`);
        console.log(`  任务缺 creator 关系                   : ${report.consistency.tasksMissingCreator.length}`);
        console.log(
            `  孤儿 task manager system tuple         : ${report.consistency.orphanTaskManagerSystemTuples.length}`
        );
        console.log(
            `  孤儿 task manager role tuple           : ${report.consistency.orphanTaskManagerRoleTuples.length}`
        );
        console.log(
            `  孤儿 task manager link tuple           : ${report.consistency.orphanTaskManagerLinkTuples.length}`
        );
        console.log(`  孤儿 task creator tuple                : ${report.consistency.orphanTaskCreatorTuples.length}`);
        console.log(`  核心 manager 缺 system 关系            : ${report.consistency.coreManagerMissingSystem.length}`);
        console.log(`  孤儿 core manager role tuple           : ${report.consistency.orphanCoreManagerRoleTuples.length}`);
        console.log(`  孤儿 core managed object tuple         : ${report.consistency.orphanCoreManagedObjectTuples.length}`);
        console.log(
            `  对象例外源表无效 relation              : ${report.consistency.invalidObjectExceptionSourceRelations.length}`
        );
        console.log(
            `  对象例外源表无效 subject               : ${report.consistency.invalidObjectExceptionSourceSubjects.length}`
        );
        console.log(
            `  对象例外源表孤儿 resource              : ${report.consistency.orphanObjectExceptionSourceResources.length}`
        );
        console.log(
            `  对象例外源表孤儿 subject               : ${report.consistency.orphanObjectExceptionSourceSubjects.length}`
        );
        console.log(`  对象例外 SpiceDB 孤儿 tuple            : ${report.consistency.orphanObjectExceptionTuples.length}`);
        console.log(
            `  对象例外源表缺 SpiceDB tuple           : ${report.consistency.objectExceptionSourceMissingSpiceDb.length}`
        );
        console.log(
            `  对象例外 SpiceDB 缺源表记录            : ${report.consistency.objectExceptionSpiceDbMissingSource.length}`
        );
        console.log('--- 命名审计 ---');
        console.log(
            `  permission 段数分布                    : ${JSON.stringify(report.namingAudit.permissionSegmentDistribution)}`
        );
        console.log(`  顶层命名空间                           : ${report.namingAudit.topLevelNamespaces.join(', ')}`);
        console.log(`  含大写字母 permission                  : ${report.namingAudit.permissionsWithUppercase.length}`);
        console.log(
            `  含下划线 permission                    : ${report.namingAudit.permissionsWithUnderscore.length}`
        );
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error) => {
    console.error('[inspect-authz-state] 审计失败', error);
    process.exitCode = 1;
});
