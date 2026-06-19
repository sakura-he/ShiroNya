// Seed app-api RBAC 自有管理数据。
//
// 用法：
//   npx tsx scripts/seed-app-api-rbac.ts
//   npx tsx scripts/seed-app-api-rbac.ts --apply
//   npx tsx scripts/seed-app-api-rbac.ts --apply --user-id=<better-auth-user-id>
//
// 这个脚本只写 rbac_* 表和 app-api 状态版本；菜单只声明 requiredPermissionCode，不再写菜单-权限绑定表。
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ulid } from 'ulid';
import { ExtendedPrismaClient } from '../libs/prisma-app/src/extended-client';
import {
    StateVersionType,
    MenuLayoutTypeEnum,
    MenuStatusEnum,
    MenuTypeEnum,
    PageTypeEnum,
    RbacPermissionKind,
    RbacStatus
} from '../libs/prisma-app/src/generated/client';
import {
    RBAC_MANAGEMENT_PERMISSION_SEEDS,
    RBAC_PERMISSIONS,
    type RbacPermissionCode
} from '../apps/app-api/src/modules/system/rbac/rbac-permissions';

const APPLY = process.argv.includes('--apply');
const SUPER_ADMIN_ROLE_CODE = 'rbac_super_admin';
const SYSTEM_ACTOR = 'rbac_seed';
const ADMIN_MENU_STATE_NAME = 'app_api_global';
const SYSTEM_MENU_PERMISSION = 'system.home.menu';

type PrismaClient = InstanceType<typeof ExtendedPrismaClient>;

type MenuSeed = {
    title: string;
    permission: RbacPermissionCode;
    path: string;
    order: number;
    type: typeof MenuTypeEnum.Catalog | typeof MenuTypeEnum.Page;
    componentPath?: string;
    icon?: string;
    isMenuVisible?: boolean;
    status?: typeof MenuStatusEnum.ENABLE | typeof MenuStatusEnum.DISABLE;
};

type RbacMenuSeed = MenuSeed & {
    permission: RbacPermissionCode;
};

type PermissionGroupSeed = {
    code: string;
    name: string;
    description: string;
    sort: number;
    permissionCodes?: RbacPermissionCode[];
    permissionPrefixes?: string[];
};

const RBAC_CATALOG: RbacMenuSeed = {
    title: 'RBAC',
    permission: RBAC_PERMISSIONS.ROOT_VIEW,
    path: 'rbac',
    order: 90,
    type: MenuTypeEnum.Catalog,
    icon: 'icon-park-outline:permissions',
    isMenuVisible: false,
    status: MenuStatusEnum.DISABLE
};

const RBAC_PAGES: RbacMenuSeed[] = [
    {
        title: '用户',
        permission: RBAC_PERMISSIONS.USER_VIEW,
        path: 'rbac-user',
        order: 90,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/user/User',
        icon: 'icon-park-outline:user'
    },
    {
        title: '角色',
        permission: RBAC_PERMISSIONS.ROLE_VIEW,
        path: 'rbac-role',
        order: 91,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/role/Role',
        icon: 'icon-park-outline:people'
    },
    {
        title: '用户组',
        permission: RBAC_PERMISSIONS.USER_GROUP_VIEW,
        path: 'rbac-user-group',
        order: 92,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/user-group/UserGroup',
        icon: 'icon-park-outline:every-user'
    },
    {
        title: '权限',
        permission: RBAC_PERMISSIONS.PERMISSION_VIEW,
        path: 'rbac-permission',
        order: 93,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/permission/Permission',
        icon: 'icon-park-outline:key'
    },
    {
        title: '菜单',
        permission: RBAC_PERMISSIONS.MENU_BINDING_VIEW,
        path: 'rbac-menu-binding',
        order: 94,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/menu-binding/MenuBinding',
        icon: 'icon-park-outline:tree-list'
    },
    {
        title: 'Effective 读模型',
        permission: RBAC_PERMISSIONS.EFFECTIVE_VIEW,
        path: 'rbac-effective',
        order: 95,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/effective/Effective',
        icon: 'icon-park-outline:graph-bar'
    }
];

const PERMISSION_GROUP_SEEDS: PermissionGroupSeed[] = [
    {
        code: 'system.user',
        name: '系统用户',
        description: '后台用户、用户详情、密码和会话管理权限',
        sort: 10,
        permissionPrefixes: ['system.user.']
    },
    {
        code: 'system.role',
        name: '系统角色',
        description: '旧系统角色管理入口和关系授权动作权限',
        sort: 20,
        permissionPrefixes: ['system.role.']
    },
    {
        code: 'system.user-group',
        name: '系统用户组',
        description: '旧系统用户组管理入口和成员授权动作权限',
        sort: 30,
        permissionPrefixes: ['system.user-group.']
    },
    {
        code: 'system.menu',
        name: '系统菜单',
        description: '系统菜单元数据管理权限',
        sort: 40,
        permissionPrefixes: ['system.menu.']
    },
    {
        code: 'system.permission',
        name: '关系权限',
        description: 'SpiceDB 关系权限管理入口权限',
        sort: 50,
        permissionPrefixes: ['system.permission.']
    },
    {
        code: 'system.dict',
        name: '系统字典',
        description: '字典和字典项管理权限',
        sort: 60,
        permissionPrefixes: ['system.dict.', 'system.dict-item.']
    },
    {
        code: 'system.task',
        name: '系统任务',
        description: '任务管理入口权限',
        sort: 70,
        permissionPrefixes: ['system.task.']
    },
    {
        code: 'system.spicedb',
        name: 'SpiceDB 关系授权',
        description: 'SpiceDB 数据页、关系调试和运维动作权限',
        sort: 80,
        permissionPrefixes: ['system.spicedb.']
    },
    {
        code: 'system.rbac',
        name: 'RBAC 管理入口',
        description: 'RBAC 管理目录入口权限',
        sort: 1000,
        permissionCodes: [RBAC_PERMISSIONS.ROOT_VIEW]
    },
    {
        code: 'system.rbac.user',
        name: 'RBAC 用户',
        description: 'RBAC 用户角色和用户组关系权限',
        sort: 1010,
        permissionPrefixes: ['system.rbac.user.', 'rbac.user.']
    },
    {
        code: 'system.rbac.role',
        name: 'RBAC 角色',
        description: 'RBAC 角色、继承关系和角色授权权限',
        sort: 1020,
        permissionPrefixes: ['system.rbac.role.', 'rbac.role.']
    },
    {
        code: 'system.rbac.user-group',
        name: 'RBAC 用户组',
        description: 'RBAC 用户组成员和角色关系权限',
        sort: 1030,
        permissionPrefixes: ['system.rbac.user-group.', 'rbac.user_group.']
    },
    {
        code: 'system.rbac.permission',
        name: 'RBAC 权限',
        description: 'RBAC 权限声明、数据库权限和分组管理权限',
        sort: 1040,
        permissionPrefixes: ['system.rbac.permission.', 'rbac.permission.']
    },
    {
        code: 'system.rbac.menu',
        name: 'RBAC 菜单',
        description: 'RBAC 菜单元数据和所需权限声明权限',
        sort: 1050,
        permissionPrefixes: ['system.rbac.menu-binding.', 'rbac.menu.']
    },
    {
        code: 'system.rbac.effective',
        name: 'RBAC Effective',
        description: 'RBAC effective 读模型查看和重建权限',
        sort: 1060,
        permissionPrefixes: ['system.rbac.effective.', 'rbac.effective.']
    }
];

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

function getArgValue(name: string): string | undefined {
    const prefix = `${name}=`;
    const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
    return value?.trim() || undefined;
}

async function upsertPermissionGroups(prisma: PrismaClient): Promise<Map<string, number>> {
    const groupIdByCode = new Map<string, number>();
    for (const seed of PERMISSION_GROUP_SEEDS) {
        if (!APPLY) {
            console.log(`  upsert permission group ${seed.code}`);
            groupIdByCode.set(seed.code, -1);
            continue;
        }

        const data = {
            name: seed.name,
            description: seed.description,
            sort: seed.sort,
            status: RbacStatus.ENABLE,
            updatedBy: SYSTEM_ACTOR,
            deletedAt: null
        };

        const group = await prisma.rbacPermissionGroup.upsert({
            where: {
                code: seed.code
            },
            update: data,
            create: {
                code: seed.code,
                ...data,
                createdBy: SYSTEM_ACTOR
            },
            select: {
                id: true
            }
        });
        groupIdByCode.set(seed.code, group.id);
    }
    return groupIdByCode;
}

function resolvePermissionGroupSeed(code: RbacPermissionCode): PermissionGroupSeed | undefined {
    return PERMISSION_GROUP_SEEDS.find((seed) => {
        if (seed.permissionCodes?.includes(code)) {
            return true;
        }
        return seed.permissionPrefixes?.some((prefix) => code.startsWith(prefix)) ?? false;
    });
}

function resolvePermissionGroupId(code: RbacPermissionCode, groupIdByCode: Map<string, number>): number | null {
    const groupSeed = resolvePermissionGroupSeed(code);
    if (!groupSeed) {
        return null;
    }
    const groupId = groupIdByCode.get(groupSeed.code);
    return groupId && groupId > 0 ? groupId : null;
}

async function upsertPermissions(
    prisma: PrismaClient,
    groupIdByCode: Map<string, number>
): Promise<Map<RbacPermissionCode, number>> {
    const permissionIdByCode = new Map<RbacPermissionCode, number>();
    for (const seed of RBAC_MANAGEMENT_PERMISSION_SEEDS) {
        if (!APPLY) {
            console.log(`  upsert permission ${seed.code}`);
            permissionIdByCode.set(seed.code, -1);
            continue;
        }

        const data = {
            name: seed.name,
            description: seed.description,
            kind: seed.kind as RbacPermissionKind,
            groupId: resolvePermissionGroupId(seed.code, groupIdByCode),
            sort: seed.sort,
            isBuiltin: true,
            status: RbacStatus.ENABLE,
            updatedBy: SYSTEM_ACTOR
        };

        const permission = await prisma.rbacPermission.upsert({
            where: {
                code: seed.code
            },
            update: data,
            create: {
                code: seed.code,
                ...data,
                createdBy: SYSTEM_ACTOR
            },
            select: {
                id: true
            }
        });
        permissionIdByCode.set(seed.code, permission.id);
    }
    return permissionIdByCode;
}

async function upsertSuperAdminRole(prisma: PrismaClient): Promise<number> {
    if (!APPLY) {
        console.log(`  upsert role ${SUPER_ADMIN_ROLE_CODE}`);
        return -1;
    }

    const data = {
        name: 'RBAC 超级管理员',
        description: 'RBAC 自有权限域的内置超级管理员角色',
        sort: 0,
        isBuiltin: true,
        isSuperAdmin: true,
        status: RbacStatus.ENABLE,
        updatedBy: SYSTEM_ACTOR
    };

    const role = await prisma.rbacRole.upsert({
        where: {
            code: SUPER_ADMIN_ROLE_CODE
        },
        update: data,
        create: {
            code: SUPER_ADMIN_ROLE_CODE,
            ...data,
            createdBy: SYSTEM_ACTOR
        },
        select: {
            id: true
        }
    });
    return role.id;
}

async function upsertMenu(
    prisma: PrismaClient,
    seed: MenuSeed,
    pid: number | null,
    groupIdByCode: Map<string, number>
): Promise<number> {
    if (!APPLY) {
        console.log(`  upsert menu ${seed.permission} -> pid=${pid}, path=${seed.path}`);
        return -1;
    }

    const data = {
        pid,
        title: seed.title,
        description: 'RBAC 权限管理面，用于维护角色、权限、菜单声明与 effective 读模型',
        type: seed.type,
        groupId: resolvePermissionGroupId(seed.permission, groupIdByCode),
        path: seed.path,
        icon: seed.icon,
        order: seed.order,
        requiredPermissionCode: seed.permission,
        componentPath: seed.componentPath,
        componentName: seed.permission,
        layout: MenuLayoutTypeEnum.LAYOUT_SIDE,
        pageType: PageTypeEnum.PAGE,
        isResident: false,
        isCache: false,
        isMenuVisible: seed.isMenuVisible ?? true,
        isTabVisible: true,
        status: seed.status ?? MenuStatusEnum.ENABLE,
        showChildren: true,
        updatedBy: SYSTEM_ACTOR
    };

    const menu = await prisma.rbacMenu.upsert({
        where: {
            requiredPermissionCode: seed.permission
        },
        update: data,
        create: {
            ...data,
            createdBy: SYSTEM_ACTOR
        },
        select: {
            id: true
        }
    });
    return menu.id;
}

async function resolveSystemMenuParentId(prisma: PrismaClient): Promise<number | null> {
    const systemMenu = await prisma.rbacMenu.findUnique({
        where: {
            requiredPermissionCode: SYSTEM_MENU_PERMISSION
        },
        select: {
            id: true
        }
    });
    return systemMenu?.id ?? null;
}

async function bumpAdminMenuStateVersion(prisma: PrismaClient): Promise<void> {
    if (!APPLY) {
        console.log('  bump admin menu state version');
        return;
    }

    await prisma.stateVersion.upsert({
        where: {
            type_name: {
                type: StateVersionType.menu,
                name: ADMIN_MENU_STATE_NAME
            }
        },
        update: {
            version: ulid()
        },
        create: {
            type: StateVersionType.menu,
            name: ADMIN_MENU_STATE_NAME,
            version: ulid()
        }
    });
}

async function bindRolePermissions(
    prisma: PrismaClient,
    roleId: number,
    permissionIdByCode: Map<RbacPermissionCode, number>
): Promise<void> {
    const permissionIds = [...new Set([...permissionIdByCode.values()].filter((id) => id > 0))];
    if (!APPLY) {
        console.log(
            `  replace role permissions ${SUPER_ADMIN_ROLE_CODE}: ${RBAC_MANAGEMENT_PERMISSION_SEEDS.length} permissions`
        );
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.rbacRolePermission.deleteMany({
            where: {
                roleId
            }
        });
        if (permissionIds.length > 0) {
            await tx.rbacRolePermission.createMany({
                data: permissionIds.map((permissionId) => ({
                    roleId,
                    permissionId,
                    createdBy: SYSTEM_ACTOR
                })),
                skipDuplicates: true
            });
        }
    });
}

async function assignSuperAdminUser(prisma: PrismaClient, roleId: number, userId: string | undefined): Promise<void> {
    if (!userId) {
        console.log('  未传 --user-id，也未配置 APP_RBAC_SUPER_ADMIN_USER_ID，跳过用户角色分配。');
        return;
    }

    if (!APPLY) {
        console.log(`  assign user ${userId} -> role ${SUPER_ADMIN_ROLE_CODE}`);
        return;
    }

    const userCount = await prisma.betterAuthUser.count({
        where: {
            id: userId
        }
    });
    if (userCount !== 1) {
        throw new Error(`找不到 App Better Auth 用户: ${userId}`);
    }

    await prisma.rbacUserRole.upsert({
        where: {
            userId_roleId: {
                userId,
                roleId
            }
        },
        update: {},
        create: {
            userId,
            roleId,
            createdBy: SYSTEM_ACTOR
        }
    });
}

async function rebuildEffectiveState(prisma: PrismaClient, userId: string | undefined): Promise<void> {
    if (!userId) {
        console.log('  未传 --user-id，也未配置 APP_RBAC_SUPER_ADMIN_USER_ID，跳过 effective 读模型重建。');
        return;
    }

    if (!APPLY) {
        console.log(`  rebuild RBAC effective state for user ${userId}`);
        return;
    }

    const [user, directRoleRows, groupMemberRows, activeRoles, roleInherits, rolePermissionRows, permissions, menus] =
        await Promise.all([
            prisma.betterAuthUser.findUnique({ where: { id: userId }, select: { id: true } }),
            prisma.rbacUserRole.findMany({ where: { userId }, select: { roleId: true } }),
            prisma.rbacUserGroupMember.findMany({ where: { userId }, select: { groupId: true } }),
            prisma.rbacRole.findMany({
                where: { status: RbacStatus.ENABLE, deletedAt: null },
                select: { id: true, isSuperAdmin: true }
            }),
            prisma.rbacRoleInherit.findMany({ select: { roleId: true, parentRoleId: true } }),
            prisma.rbacRolePermission.findMany({ select: { roleId: true, permissionId: true } }),
            prisma.rbacPermission.findMany({
                where: { status: RbacStatus.ENABLE, deletedAt: null },
                select: { id: true, code: true }
            }),
            prisma.rbacMenu.findMany({
                where: { status: MenuStatusEnum.ENABLE },
                select: { id: true, pid: true, type: true, requiredPermissionCode: true }
            })
        ]);

    if (!user) {
        throw new Error(`找不到 App Better Auth 用户: ${userId}`);
    }

    const activeRoleIds = new Set(activeRoles.map((role) => role.id));
    const superAdminRoleIds = new Set(activeRoles.filter((role) => role.isSuperAdmin).map((role) => role.id));
    const activeGroupIds = groupMemberRows.length
        ? new Set(
              (
                  await prisma.rbacUserGroup.findMany({
                      where: {
                          id: { in: [...new Set(groupMemberRows.map((row) => row.groupId))] },
                          status: RbacStatus.ENABLE,
                          deletedAt: null
                      },
                      select: { id: true }
                  })
              ).map((group) => group.id)
          )
        : new Set<number>();
    const groupRoleRows = activeGroupIds.size
        ? await prisma.rbacUserGroupRole.findMany({
              where: { groupId: { in: [...activeGroupIds] } },
              select: { roleId: true }
          })
        : [];

    const effectiveRoleIds = [...new Set([...directRoleRows, ...groupRoleRows].map((row) => row.roleId))]
        .filter((roleId) => activeRoleIds.has(roleId))
        .sort((left, right) => left - right);
    const roleClosureIds = resolveRoleClosure(effectiveRoleIds, roleInherits, activeRoleIds);
    const isSuperAdmin = effectiveRoleIds.some((roleId) => superAdminRoleIds.has(roleId));

    const permissionCodeById = new Map(permissions.map((permission) => [permission.id, permission.code]));
    const allPermissionIds = permissions.map((permission) => permission.id).sort((left, right) => left - right);
    const effectivePermissionIds = isSuperAdmin
        ? allPermissionIds
        : [
              ...new Set(
                  rolePermissionRows
                      .filter((row) => roleClosureIds.includes(row.roleId) && permissionCodeById.has(row.permissionId))
                      .map((row) => row.permissionId)
              )
          ].sort((left, right) => left - right);
    const effectivePermissionCodes = new Set(
        effectivePermissionIds
            .map((permissionId) => permissionCodeById.get(permissionId))
            .filter((code): code is string => Boolean(code))
    );
    const menuMetaById = new Map(menus.map((menu) => [menu.id, { pid: menu.pid ?? null, type: menu.type }]));
    const directMenuIds = isSuperAdmin
        ? menus.map((menu) => menu.id)
        : menus.filter((menu) => effectivePermissionCodes.has(menu.requiredPermissionCode)).map((menu) => menu.id);
    const visibleMenuIds = resolveMenuIdsWithAncestors(directMenuIds, menuMetaById);
    const version = ulid();

    await prisma.$transaction(async (tx) => {
        await tx.rbacEffectiveUserRole.deleteMany({ where: { userId } });
        await tx.rbacEffectiveUserPermission.deleteMany({ where: { userId } });
        await tx.rbacUserVisibleMenu.deleteMany({ where: { userId } });

        if (effectiveRoleIds.length > 0) {
            await tx.rbacEffectiveUserRole.createMany({
                data: effectiveRoleIds.map((roleId) => ({ userId, roleId, version })),
                skipDuplicates: true
            });
        }
        if (effectivePermissionIds.length > 0) {
            await tx.rbacEffectiveUserPermission.createMany({
                data: effectivePermissionIds.map((permissionId) => ({ userId, permissionId, version })),
                skipDuplicates: true
            });
        }
        if (visibleMenuIds.length > 0) {
            await tx.rbacUserVisibleMenu.createMany({
                data: visibleMenuIds.map((menuId) => ({ userId, menuId, version })),
                skipDuplicates: true
            });
        }
    });

    console.log('  rebuilt RBAC effective state', {
        userId,
        version,
        effectiveRoleCount: effectiveRoleIds.length,
        effectivePermissionCount: effectivePermissionIds.length,
        visibleMenuCount: visibleMenuIds.length,
        isSuperAdmin
    });
}

function resolveRoleClosure(
    roleIds: number[],
    inherits: Array<{ roleId: number; parentRoleId: number }>,
    activeRoleIds: Set<number>
): number[] {
    const parentRoleIdsByRoleId = new Map<number, number[]>();
    for (const inherit of inherits) {
        const parentRoleIds = parentRoleIdsByRoleId.get(inherit.roleId) ?? [];
        parentRoleIds.push(inherit.parentRoleId);
        parentRoleIdsByRoleId.set(inherit.roleId, parentRoleIds);
    }

    const visited = new Set(roleIds.filter((roleId) => activeRoleIds.has(roleId)));
    const queue = [...visited];
    while (queue.length > 0) {
        const currentRoleId = queue.shift()!;
        for (const parentRoleId of parentRoleIdsByRoleId.get(currentRoleId) ?? []) {
            if (!activeRoleIds.has(parentRoleId) || visited.has(parentRoleId)) {
                continue;
            }
            visited.add(parentRoleId);
            queue.push(parentRoleId);
        }
    }
    return [...visited].sort((left, right) => left - right);
}

function resolveMenuIdsWithAncestors(
    menuIds: Iterable<number>,
    menuMetaById: Map<number, { pid?: number | null; type?: MenuTypeEnum }>
): number[] {
    const resolvedMenuIds = new Set(menuIds);
    const queue = [...resolvedMenuIds];

    while (queue.length > 0) {
        const menuId = queue.shift()!;
        const menu = menuMetaById.get(menuId);
        if (!menu || menu.type === MenuTypeEnum.Button) {
            continue;
        }

        const parentMenuId = menu.pid;
        if (typeof parentMenuId !== 'number' || !menuMetaById.has(parentMenuId) || resolvedMenuIds.has(parentMenuId)) {
            continue;
        }

        resolvedMenuIds.add(parentMenuId);
        queue.push(parentMenuId);
    }

    return [...resolvedMenuIds].sort((left, right) => left - right);
}
async function main(): Promise<void> {
    loadProjectEnv();
    const prisma = new ExtendedPrismaClient();
    const userId =
        getArgValue('--user-id') ?? process.env.APP_RBAC_SUPER_ADMIN_USER_ID ?? process.env.RBAC_SUPER_ADMIN_USER_ID;

    try {
        console.log(`=== seed-app-api-rbac ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===`);
        const groupIdByCode = await upsertPermissionGroups(prisma);
        const permissionIdByCode = await upsertPermissions(prisma, groupIdByCode);
        const roleId = await upsertSuperAdminRole(prisma);

        const systemMenuId = await resolveSystemMenuParentId(prisma);
        await upsertMenu(prisma, RBAC_CATALOG, systemMenuId, groupIdByCode);
        for (const page of RBAC_PAGES) {
            await upsertMenu(prisma, page, systemMenuId, groupIdByCode);
        }

        await bindRolePermissions(prisma, roleId, permissionIdByCode);
        await bumpAdminMenuStateVersion(prisma);
        await assignSuperAdminUser(prisma, roleId, userId);
        await rebuildEffectiveState(prisma, userId);
        console.log('=== 完成 ===');
        if (!APPLY) {
            console.log(
                '当前是 DRY-RUN，加 --apply 才会写 RBAC 自有表；加 --user-id=<existing-app-user-id> 可绑定超级管理员并重建该用户 effective。'
            );
        }
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error) => {
    console.error('[seed-app-api-rbac] seed 失败', error);
    process.exitCode = 1;
});
