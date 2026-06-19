// Seed RBAC 自有管理数据。
//
// 用法：
//   npx tsx scripts/seed-admin-api-rbac.ts
//   npx tsx scripts/seed-admin-api-rbac.ts --apply
//   npx tsx scripts/seed-admin-api-rbac.ts --apply --user-id=<better-auth-user-id>
//   npx tsx scripts/seed-admin-api-rbac.ts --apply --demo-user
//   npx tsx scripts/seed-admin-api-rbac.ts --apply --demo-user --demo-password=<password>
//
// 这个脚本只写 rbac_* 表和 admin 状态版本；菜单只声明 requiredPermissionCode，不再写菜单-权限绑定表。
import { hashPassword } from 'better-auth/crypto';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ulid } from 'ulid';
import { ExtendedPrismaClient } from '../libs/prisma-admin/src/extended-client';
import {
    StateVersionType,
    MenuLayoutTypeEnum,
    MenuStatusEnum,
    MenuTypeEnum,
    PageTypeEnum,
    RbacPermissionKind,
    RbacStatus
} from '../libs/prisma-admin/src/generated/enums';
import {
    RBAC_MANAGEMENT_PERMISSION_SEEDS,
    RBAC_PERMISSIONS,
    type RbacPermissionCode
} from '../apps/admin-api/src/modules/system/rbac/rbac-permissions';
import { RBAC_TEST_MENU_PERMISSION } from '../apps/admin-api/src/modules/rbac-test/rbac-test.definitions';
import {
    buildRbacEffectiveStates,
    createRbacGraphSnapshot,
    createRbacRebuildSummary
} from '../libs/rbac-core/src/graph/rbac-graph.engine';

const APPLY = process.argv.includes('--apply');
const SUPER_ADMIN_ROLE_CODE = 'rbac_super_admin';
const DEMO_READONLY_ROLE_CODE = 'rbac_demo_viewer';
const SYSTEM_ACTOR = 'rbac_seed';
const CREDENTIAL_PROVIDER_ID = 'credential';
const ADMIN_MENU_STATE_NAME = 'admin_global';
const DASHBOARD_MENU_PERMISSION = 'dashboard.home.menu';
const ARTICLE_MENU_PERMISSION = 'article.home.menu';
const SYSTEM_MENU_PERMISSION = 'system.home.menu';
const OBSOLETE_CHARACTER_MENU_PERMISSION = 'system.character.menu';
const OBSOLETE_CHARACTER_GROUP_CODE = 'system.character';
const DEFAULT_DEMO_USERNAME = 'demo';
const DEFAULT_DEMO_NAME = 'Demo 用户';
const DEFAULT_DEMO_PASSWORD = 'Demo@123456';
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

type PrismaClient = InstanceType<typeof ExtendedPrismaClient>;

type MenuSeed = {
    title: string;
    permission: RbacPermissionCode;
    description?: string;
    path: string;
    order: number;
    type: typeof MenuTypeEnum.Catalog | typeof MenuTypeEnum.Page;
    componentPath?: string;
    componentName?: string;
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

type DemoUserConfig = {
    username: string;
    email: string;
    name: string;
    password: string;
    passwordSource: 'default' | 'explicit';
};

const RBAC_CATALOG: RbacMenuSeed = {
    title: '用户管理',
    permission: RBAC_PERMISSIONS.ROOT_VIEW,
    description: '用户、角色、用户组、权限与 RBAC 读模型管理入口',
    path: 'user-management',
    order: 10,
    type: MenuTypeEnum.Catalog,
    icon: 'icon-park-outline:peoples',
    isMenuVisible: true,
    status: MenuStatusEnum.ENABLE
};

const SPICEDB_CATALOG: RbacMenuSeed = {
    title: 'SpiceDB',
    permission: RBAC_PERMISSIONS.SYSTEM_SPICEDB_MENU,
    description: 'SpiceDB 关系授权工具目录',
    path: 'spicedb',
    order: 20,
    type: MenuTypeEnum.Catalog,
    icon: 'icon-park-outline:database-network'
};

const APP_MANAGEMENT_CATALOG: RbacMenuSeed = {
    title: 'App 管理',
    permission: RBAC_PERMISSIONS.APP_MANAGEMENT_MENU,
    description: 'App 相关后台管理入口',
    path: 'app',
    order: 40,
    type: MenuTypeEnum.Catalog,
    icon: 'icon-park-outline:application-menu'
};

const RBAC_PAGES: RbacMenuSeed[] = [
    {
        title: '用户',
        permission: RBAC_PERMISSIONS.USER_VIEW,
        path: 'rbac-user',
        order: 10,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/user/User',
        icon: 'icon-park-outline:user'
    },
    {
        title: '角色',
        permission: RBAC_PERMISSIONS.ROLE_VIEW,
        path: 'rbac-role',
        order: 20,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/role/Role',
        icon: 'icon-park-outline:people'
    },
    {
        title: '用户组',
        permission: RBAC_PERMISSIONS.USER_GROUP_VIEW,
        path: 'rbac-user-group',
        order: 30,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/user-group/UserGroup',
        icon: 'icon-park-outline:every-user'
    },
    {
        title: '权限',
        permission: RBAC_PERMISSIONS.PERMISSION_VIEW,
        path: 'rbac-permission',
        order: 40,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/permission/Permission',
        icon: 'icon-park-outline:key'
    },
    {
        title: '菜单',
        permission: RBAC_PERMISSIONS.MENU_BINDING_VIEW,
        path: 'rbac-menu-binding',
        order: 50,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/menu-binding/MenuBinding',
        icon: 'icon-park-outline:tree-list'
    },
    {
        title: 'Effective 读模型',
        permission: RBAC_PERMISSIONS.EFFECTIVE_VIEW,
        path: 'rbac-effective',
        order: 60,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/effective/Effective',
        icon: 'icon-park-outline:graph-bar'
    },
    {
        title: '测试台',
        permission: RBAC_TEST_MENU_PERMISSION,
        path: 'rbac-test',
        order: 70,
        type: MenuTypeEnum.Page,
        componentPath: 'system/rbac/test/Test',
        icon: 'icon-park-outline:experiment'
    }
];

const APP_API_PAGES: RbacMenuSeed[] = [
    {
        title: '应用用户',
        permission: RBAC_PERMISSIONS.APP_USER_VIEW,
        description: '通过 app-api 内部管理 API 维护业务用户',
        path: 'app-users',
        order: 10,
        type: MenuTypeEnum.Page,
        componentPath: 'app/user/User',
        icon: 'icon-park-outline:user-business'
    }
];

const APP_ABAC_CATALOG: RbacMenuSeed = {
    title: 'App ABAC管理',
    permission: RBAC_PERMISSIONS.APP_ABAC_PAGE,
    description: '通过 admin-api 控制面管理 app-api ABAC 权限策略',
    path: 'app-abac',
    order: 70,
    type: MenuTypeEnum.Catalog,
    icon: 'icon-park-outline:permissions'
};

const APP_ABAC_PAGES: RbacMenuSeed[] = [
    {
        title: 'ABAC策略组',
        permission: RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_READ,
        description: '查看 app-api ABAC 内置策略组',
        path: 'policy-groups',
        order: 30,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacPolicyGroups',
        componentName: 'appAbacPolicyGroups',
        icon: 'icon-park-outline:components'
    },
    {
        title: 'ABAC字段管理',
        permission: RBAC_PERMISSIONS.APP_ABAC_FIELD_READ,
        description: '维护 app-api ABAC 内置策略字段',
        path: 'fields',
        order: 20,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacFields',
        componentName: 'appAbacFields',
        icon: 'icon-park-outline:form-one'
    },
    {
        title: 'ABAC手写策略',
        permission: RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_READ,
        description: '查看 app-api ABAC 手写策略',
        path: 'manual-policies',
        order: 40,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacManualPolicies',
        componentName: 'appAbacManualPolicies',
        icon: 'icon-park-outline:code'
    },
    {
        title: 'ABAC编译预览',
        permission: RBAC_PERMISSIONS.APP_ABAC_PREVIEW,
        description: '预览 app-api ABAC 编译结果',
        path: 'preview',
        order: 50,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacPreview',
        componentName: 'appAbacPreview',
        icon: 'icon-park-outline:preview-open'
    },
    {
        title: 'ABAC发布',
        permission: RBAC_PERMISSIONS.APP_ABAC_PUBLISH,
        description: '发布和回滚 app-api ABAC 策略',
        path: 'publish',
        order: 60,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacPublish',
        componentName: 'appAbacPublish',
        icon: 'icon-park-outline:upload'
    },
    {
        title: 'ABAC测试台',
        permission: RBAC_PERMISSIONS.APP_ABAC_RUNTIME_TEST,
        description: '运行 app-api ABAC 测试台',
        path: 'runtime-test',
        order: 70,
        type: MenuTypeEnum.Page,
        componentPath: 'app/abac/AbacRuntimeTest',
        componentName: 'appAbacRuntimeTest',
        icon: 'icon-park-outline:experiment'
    }
];

const PERMISSION_GROUP_SEEDS: PermissionGroupSeed[] = [
    {
        code: 'app.management',
        name: 'App 管理',
        description: 'App 管理目录和 app 侧业务管理权限',
        sort: 5,
        permissionPrefixes: ['app.']
    },
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
        code: 'app.user',
        name: '应用用户',
        description: '通过 admin-api 控制面管理 app-api 业务用户',
        sort: 75,
        permissionPrefixes: ['app.user.']
    },
    {
        code: 'app.rbac',
        name: '应用 RBAC',
        description: '通过 admin-api 控制面管理 app-api RBAC 权限',
        sort: 76,
        permissionPrefixes: ['app.rbac.']
    },
    {
        code: 'app.abac',
        name: '应用 ABAC',
        description: '通过 admin-api 控制面管理 app-api ABAC 权限策略',
        sort: 78,
        permissionPrefixes: ['app.abac.']
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
    },
    {
        code: 'system.rbac.test',
        name: 'RBAC 测试台',
        description: 'RBAC 测试台页面和测试接口权限',
        sort: 1090,
        permissionPrefixes: ['rbac.test.']
    }
];

const DEMO_READONLY_PERMISSION_CODES: string[] = [
    DASHBOARD_MENU_PERMISSION,
    ARTICLE_MENU_PERMISSION,
    SYSTEM_MENU_PERMISSION,
    RBAC_PERMISSIONS.APP_MANAGEMENT_MENU,

    RBAC_PERMISSIONS.SYSTEM_USER_VIEW,
    RBAC_PERMISSIONS.SYSTEM_USER_DETAIL,
    RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW,

    RBAC_PERMISSIONS.APP_USER_VIEW,
    RBAC_PERMISSIONS.APP_USER_DETAIL,
    RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW,
    RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW,
    RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW,
    RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_VIEW,
    RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW,

    RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW,
    RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW,
    RBAC_PERMISSIONS.SYSTEM_MENU_VIEW,
    RBAC_PERMISSIONS.SYSTEM_PERMISSION_VIEW,
    RBAC_PERMISSIONS.SYSTEM_DICT_VIEW,
    RBAC_PERMISSIONS.SYSTEM_TASK_VIEW,

    RBAC_PERMISSIONS.SYSTEM_SPICEDB_MENU,
    RBAC_PERMISSIONS.SYSTEM_SPICEDB_VIEW,
    RBAC_PERMISSIONS.SYSTEM_SPICEDB_CHECK_PERMISSION,
    RBAC_PERMISSIONS.SYSTEM_SPICEDB_BATCH_CHECK_PERMISSION,
    RBAC_PERMISSIONS.SYSTEM_SPICEDB_EXPLAIN_PERMISSION,

    RBAC_PERMISSIONS.ROOT_VIEW,
    RBAC_PERMISSIONS.USER_VIEW,
    RBAC_PERMISSIONS.ROLE_VIEW,
    RBAC_PERMISSIONS.USER_GROUP_VIEW,
    RBAC_PERMISSIONS.PERMISSION_VIEW,
    RBAC_PERMISSIONS.MENU_BINDING_VIEW,
    RBAC_PERMISSIONS.EFFECTIVE_VIEW,

    RBAC_PERMISSIONS.TEST_PAGE,
    RBAC_PERMISSIONS.TEST_VIEW,
    RBAC_PERMISSIONS.TEST_READ,
    RBAC_PERMISSIONS.TEST_PROFILE
];

const WRITE_PERMISSION_TOKEN_PATTERN =
    /(^|[._-])(admin|approve|assign|bulk|create|delete|handle|impersonate|manage|publish|rebuild|reconcile|reset|revoke|rollback|run|set|soft-delete|status|update)([._-]|$)/;

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

function isTruthy(value: string | undefined): boolean {
    return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

function isDemoUserRequested(): boolean {
    return process.argv.includes('--demo-user') || isTruthy(process.env.RBAC_DEMO_USER_ENABLED);
}

function assertPasswordPolicy(password: string, source: string): void {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        throw new Error(`${source} 长度必须在 ${PASSWORD_MIN_LENGTH} 到 ${PASSWORD_MAX_LENGTH} 个字符之间`);
    }
}

function resolveDemoUserConfig(): DemoUserConfig | null {
    if (!isDemoUserRequested()) {
        return null;
    }

    const explicitPassword = getArgValue('--demo-password') ?? process.env.RBAC_DEMO_USER_PASSWORD?.trim();
    if (!explicitPassword && process.env.NODE_ENV === 'production') {
        throw new Error('生产环境创建 demo 用户时必须显式传入 --demo-password 或 RBAC_DEMO_USER_PASSWORD');
    }

    const username = getArgValue('--demo-username') ?? process.env.RBAC_DEMO_USERNAME?.trim() ?? DEFAULT_DEMO_USERNAME;
    const email = getArgValue('--demo-email') ?? process.env.RBAC_DEMO_EMAIL?.trim() ?? `${username}@shiro-nya.local`;
    const name = getArgValue('--demo-name') ?? process.env.RBAC_DEMO_NAME?.trim() ?? DEFAULT_DEMO_NAME;
    const password = explicitPassword ?? DEFAULT_DEMO_PASSWORD;
    const passwordSource = explicitPassword ? 'explicit' : 'default';

    if (!username) {
        throw new Error('demo username 不能为空');
    }
    if (!email) {
        throw new Error('demo email 不能为空');
    }
    if (!name) {
        throw new Error('demo name 不能为空');
    }
    assertPasswordPolicy(password, 'demo password');

    return {
        username,
        email: email.toLowerCase(),
        name,
        password,
        passwordSource
    };
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

async function upsertDemoReadonlyRole(prisma: PrismaClient): Promise<number> {
    if (!APPLY) {
        console.log(`  upsert role ${DEMO_READONLY_ROLE_CODE}`);
        return -1;
    }

    const data = {
        name: 'Demo 只读用户',
        description: '内置 demo 查看角色，只授予菜单、列表、详情和只读诊断权限',
        sort: 10,
        isBuiltin: true,
        isSuperAdmin: false,
        status: RbacStatus.ENABLE,
        updatedBy: SYSTEM_ACTOR,
        deletedAt: null
    };

    const role = await prisma.rbacRole.upsert({
        where: {
            code: DEMO_READONLY_ROLE_CODE
        },
        update: data,
        create: {
            code: DEMO_READONLY_ROLE_CODE,
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
        description: seed.description ?? 'RBAC 权限管理面，用于维护角色、权限、菜单声明与 effective 读模型',
        type: seed.type,
        groupId: resolvePermissionGroupId(seed.permission, groupIdByCode),
        path: seed.path,
        icon: seed.icon,
        order: seed.order,
        requiredPermissionCode: seed.permission,
        componentPath: seed.componentPath,
        componentName: seed.componentName ?? seed.permission,
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

async function updateExistingMenu(
    prisma: PrismaClient,
    permission: string,
    data: {
        pid?: number | null;
        title?: string;
        path?: string | null;
        icon?: string | null;
        order?: number;
        groupId?: number | null;
        isMenuVisible?: boolean;
        status?: typeof MenuStatusEnum.ENABLE | typeof MenuStatusEnum.DISABLE;
    }
): Promise<void> {
    if (!APPLY) {
        console.log(`  update existing menu ${permission}: ${JSON.stringify(data)}`);
        return;
    }

    const result = await prisma.rbacMenu.updateMany({
        where: {
            requiredPermissionCode: permission
        },
        data: {
            ...data,
            updatedBy: SYSTEM_ACTOR
        }
    });
    if (result.count === 0) {
        console.log(`  skip missing menu ${permission}`);
    }
}

async function deleteObsoleteCharacterManagementMenu(prisma: PrismaClient): Promise<void> {
    if (!APPLY) {
        console.log(`  delete obsolete menu ${OBSOLETE_CHARACTER_MENU_PERMISSION}`);
        console.log(`  delete obsolete permission group ${OBSOLETE_CHARACTER_GROUP_CODE}`);
        return;
    }

    const menu = await prisma.rbacMenu.findUnique({
        where: {
            requiredPermissionCode: OBSOLETE_CHARACTER_MENU_PERMISSION
        },
        select: {
            id: true
        }
    });
    if (menu) {
        await prisma.rbacUserVisibleMenu.deleteMany({
            where: {
                menuId: menu.id
            }
        });
        await prisma.rbacMenu.delete({
            where: {
                id: menu.id
            }
        });
    }

    await prisma.rbacRolePermission.deleteMany({
        where: {
            permission: {
                code: OBSOLETE_CHARACTER_MENU_PERMISSION
            }
        }
    });
    await prisma.rbacPermission.deleteMany({
        where: {
            code: OBSOLETE_CHARACTER_MENU_PERMISSION
        }
    });
    await prisma.rbacPermissionGroup.deleteMany({
        where: {
            code: OBSOLETE_CHARACTER_GROUP_CODE
        }
    });
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

async function resolvePermissionIdsByCodes(prisma: PrismaClient, codes: string[]): Promise<number[]> {
    const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (uniqueCodes.length === 0) {
        return [];
    }

    const permissions = await prisma.rbacPermission.findMany({
        where: {
            code: {
                in: uniqueCodes
            },
            status: RbacStatus.ENABLE,
            deletedAt: null
        },
        select: {
            id: true,
            code: true
        },
        orderBy: {
            id: 'asc'
        }
    });

    const foundCodes = new Set(permissions.map((permission) => permission.code));
    const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));
    if (missingCodes.length > 0) {
        console.log(`  skip missing readonly permissions: ${missingCodes.join(', ')}`);
    }

    return permissions.map((permission) => permission.id);
}

async function assertNoWritePermissions(prisma: PrismaClient, roleId: number): Promise<void> {
    const grants = await prisma.rbacRolePermission.findMany({
        where: {
            roleId
        },
        select: {
            permission: {
                select: {
                    code: true
                }
            }
        }
    });
    const forbiddenCodes = grants
        .map((grant) => grant.permission.code)
        .filter((code) => WRITE_PERMISSION_TOKEN_PATTERN.test(code));

    if (forbiddenCodes.length > 0) {
        throw new Error(`demo 只读角色包含写权限: ${forbiddenCodes.join(', ')}`);
    }
}

async function bindDemoReadonlyRolePermissions(prisma: PrismaClient, roleId: number): Promise<void> {
    if (!APPLY) {
        console.log(
            `  replace role permissions ${DEMO_READONLY_ROLE_CODE}: ${new Set(DEMO_READONLY_PERMISSION_CODES).size} readonly permission codes`
        );
        return;
    }

    const permissionIds = await resolvePermissionIdsByCodes(prisma, DEMO_READONLY_PERMISSION_CODES);
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
    await assertNoWritePermissions(prisma, roleId);
    console.log(`  replace role permissions ${DEMO_READONLY_ROLE_CODE}: ${permissionIds.length} permissions`);
}

async function rebuildEffectiveReadModels(prisma: PrismaClient): Promise<void> {
    if (!APPLY) {
        console.log('  rebuild RBAC effective read models');
        return;
    }

    const states = await buildEffectiveStates(prisma);
    const version = ulid();
    const userIdFilter = states.map((state) => state.userId);

    await prisma.$transaction(async (tx) => {
        await tx.rbacEffectiveUserRole.deleteMany({
            where: {
                userId: {
                    in: userIdFilter
                }
            }
        });
        await tx.rbacEffectiveUserPermission.deleteMany({
            where: {
                userId: {
                    in: userIdFilter
                }
            }
        });
        await tx.rbacUserVisibleMenu.deleteMany({
            where: {
                userId: {
                    in: userIdFilter
                }
            }
        });

        const roleRows = states.flatMap((state) =>
            state.roleIds.map((roleId) => ({
                userId: state.userId,
                roleId,
                version
            }))
        );
        const permissionRows = states.flatMap((state) =>
            state.permissionIds.map((permissionId) => ({
                userId: state.userId,
                permissionId,
                version
            }))
        );
        const menuRows = states.flatMap((state) =>
            state.visibleMenuIds.map((menuId) => ({
                userId: state.userId,
                menuId,
                version
            }))
        );

        if (roleRows.length > 0) {
            await tx.rbacEffectiveUserRole.createMany({
                data: roleRows,
                skipDuplicates: true
            });
        }
        if (permissionRows.length > 0) {
            await tx.rbacEffectiveUserPermission.createMany({
                data: permissionRows,
                skipDuplicates: true
            });
        }
        if (menuRows.length > 0) {
            await tx.rbacUserVisibleMenu.createMany({
                data: menuRows,
                skipDuplicates: true
            });
        }
    });

    const summary = createRbacRebuildSummary(states);
    console.log(
        `  rebuild effective: users=${summary.userCount}, roles=${summary.effectiveRoleCount}, permissions=${summary.effectivePermissionCount}, menus=${summary.visibleMenuCount}`
    );
}

async function buildEffectiveStates(prisma: PrismaClient) {
    const users = await prisma.betterAuthUser.findMany({
        select: {
            id: true
        },
        orderBy: {
            createdAt: 'asc'
        }
    });
    const targetUserIds = users.map((user) => user.id);
    if (targetUserIds.length === 0) {
        return [];
    }

    const [directRoleRows, groupMemberRows] = await Promise.all([
        prisma.rbacUserRole.findMany({
            where: {
                userId: {
                    in: targetUserIds
                }
            },
            select: {
                userId: true,
                roleId: true
            }
        }),
        prisma.rbacUserGroupMember.findMany({
            where: {
                userId: {
                    in: targetUserIds
                }
            },
            select: {
                userId: true,
                groupId: true
            }
        })
    ]);
    const activeGroupIds = new Set(
        (
            await prisma.rbacUserGroup.findMany({
                where: {
                    id: {
                        in: [...new Set(groupMemberRows.map((row) => row.groupId))]
                    },
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                },
                select: {
                    id: true
                }
            })
        ).map((group) => group.id)
    );
    const [groupRoleRows, roleRows, inheritRows, rolePermissionRows, permissionRows, menuRows] = await Promise.all([
        activeGroupIds.size > 0
            ? prisma.rbacUserGroupRole.findMany({
                  where: {
                      groupId: {
                          in: [...activeGroupIds]
                      }
                  },
                  select: {
                      groupId: true,
                      roleId: true
                  }
              })
            : Promise.resolve([]),
        prisma.rbacRole.findMany({
            where: {
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true,
                isSuperAdmin: true
            }
        }),
        prisma.rbacRoleInherit.findMany({
            select: {
                roleId: true,
                parentRoleId: true
            }
        }),
        prisma.rbacRolePermission.findMany({
            where: {
                permission: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                roleId: true,
                permissionId: true
            }
        }),
        prisma.rbacPermission.findMany({
            where: {
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                id: true,
                code: true
            },
            orderBy: {
                id: 'asc'
            }
        }),
        prisma.rbacMenu.findMany({
            where: {
                status: MenuStatusEnum.ENABLE
            },
            select: {
                id: true,
                pid: true,
                type: true,
                requiredPermissionCode: true
            },
            orderBy: {
                id: 'asc'
            }
        })
    ]);

    return buildRbacEffectiveStates({
        targetUserIds,
        directRoleRows,
        groupMemberRows,
        activeGroupIds,
        groupRoleRows,
        snapshot: createRbacGraphSnapshot({
            roles: roleRows,
            inherits: inheritRows,
            rolePermissions: rolePermissionRows,
            permissions: permissionRows,
            menus: menuRows
        }),
        buttonMenuType: MenuTypeEnum.Button
    });
}

async function assignSuperAdminUser(prisma: PrismaClient, roleId: number, userId: string | undefined): Promise<void> {
    if (!userId) {
        console.log('  未传 --user-id，也未配置 RBAC_SUPER_ADMIN_USER_ID，跳过用户角色分配。');
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
        throw new Error(`找不到 Better Auth 用户: ${userId}`);
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

async function upsertDemoUser(prisma: PrismaClient, config: DemoUserConfig | null): Promise<string | undefined> {
    if (!config) {
        console.log('  未传 --demo-user，也未配置 RBAC_DEMO_USER_ENABLED=true，跳过 demo 用户创建。');
        return undefined;
    }

    if (!APPLY) {
        console.log(
            `  upsert demo user username=${config.username}, email=${config.email}, password=${config.passwordSource}`
        );
        return undefined;
    }

    const conflicts = await prisma.betterAuthUser.findMany({
        where: {
            OR: [
                {
                    username: config.username
                },
                {
                    email: config.email
                }
            ]
        },
        select: {
            id: true,
            username: true,
            email: true
        }
    });
    const usernameOwner = conflicts.find((user) => user.username === config.username);
    const emailOwner = conflicts.find((user) => user.email === config.email);
    if (usernameOwner && emailOwner && usernameOwner.id !== emailOwner.id) {
        throw new Error(
            `demo 用户 username/email 已分别属于不同用户: username=${usernameOwner.id}, email=${emailOwner.id}`
        );
    }

    const existingUser = usernameOwner ?? emailOwner;
    const userData = {
        name: config.name,
        email: config.email,
        emailVerified: true,
        role: 'user',
        banned: false,
        banReason: null,
        banExpires: null,
        username: config.username,
        displayUsername: config.name,
        updatedAt: new Date()
    };

    const user = existingUser
        ? await prisma.betterAuthUser.update({
              where: {
                  id: existingUser.id
              },
              data: userData,
              select: {
                  id: true
              }
          })
        : await prisma.betterAuthUser.create({
              data: {
                  id: ulid(),
                  ...userData
              },
              select: {
                  id: true
              }
          });

    const hashedPassword = await hashPassword(config.password);
    const updatedAccounts = await prisma.betterAuthAccount.updateMany({
        where: {
            userId: user.id,
            providerId: CREDENTIAL_PROVIDER_ID
        },
        data: {
            accountId: user.id,
            password: hashedPassword
        }
    });
    if (updatedAccounts.count === 0) {
        await prisma.betterAuthAccount.create({
            data: {
                id: ulid(),
                accountId: user.id,
                providerId: CREDENTIAL_PROVIDER_ID,
                userId: user.id,
                password: hashedPassword
            }
        });
    }

    await prisma.betterAuthUserProfile.upsert({
        where: {
            userId: user.id
        },
        update: {
            remark: '内置 demo 只读用户',
            createdBy: SYSTEM_ACTOR
        },
        create: {
            userId: user.id,
            remark: '内置 demo 只读用户',
            createdBy: SYSTEM_ACTOR
        }
    });

    console.log(`  upsert demo user ${config.username} (${user.id})`);
    return user.id;
}

async function assignExclusiveDemoReadonlyRole(
    prisma: PrismaClient,
    roleId: number,
    userId: string | undefined
): Promise<void> {
    if (!userId) {
        return;
    }

    if (!APPLY) {
        console.log(`  assign demo user ${userId} -> role ${DEMO_READONLY_ROLE_CODE} only`);
        return;
    }

    await prisma.$transaction(async (tx) => {
        await tx.rbacUserRole.deleteMany({
            where: {
                userId
            }
        });
        await tx.rbacUserGroupMember.deleteMany({
            where: {
                userId
            }
        });
        await tx.authzObjectSubjectBinding.deleteMany({
            where: {
                subjectKind: 'user',
                subjectId: userId
            }
        });
        await tx.rbacUserRole.create({
            data: {
                userId,
                roleId,
                createdBy: SYSTEM_ACTOR
            }
        });
    });
}

async function main(): Promise<void> {
    loadProjectEnv();
    const prisma = new ExtendedPrismaClient();
    const userId = getArgValue('--user-id') ?? process.env.RBAC_SUPER_ADMIN_USER_ID;
    const demoUserConfig = resolveDemoUserConfig();

    try {
        console.log(`=== seed-admin-api-rbac ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===`);
        const groupIdByCode = await upsertPermissionGroups(prisma);
        const permissionIdByCode = await upsertPermissions(prisma, groupIdByCode);
        const roleId = await upsertSuperAdminRole(prisma);
        const demoReadonlyRoleId = await upsertDemoReadonlyRole(prisma);

        const systemMenuId = await resolveSystemMenuParentId(prisma);
        const userManagementMenuId = await upsertMenu(prisma, RBAC_CATALOG, systemMenuId, groupIdByCode);
        const spicedbMenuId = await upsertMenu(prisma, SPICEDB_CATALOG, systemMenuId, groupIdByCode);
        const appManagementMenuId = await upsertMenu(prisma, APP_MANAGEMENT_CATALOG, null, groupIdByCode);
        await deleteObsoleteCharacterManagementMenu(prisma);

        await updateExistingMenu(prisma, DASHBOARD_MENU_PERMISSION, {
            pid: null,
            title: '仪表盘',
            path: 'dashboard',
            order: 10,
            isMenuVisible: true,
            status: MenuStatusEnum.ENABLE
        });
        await updateExistingMenu(prisma, ARTICLE_MENU_PERMISSION, {
            pid: null,
            title: '内容管理',
            path: 'article',
            order: 20,
            isMenuVisible: true,
            status: MenuStatusEnum.ENABLE
        });
        await updateExistingMenu(prisma, SYSTEM_MENU_PERMISSION, {
            pid: null,
            title: '系统管理',
            path: 'system',
            order: 30,
            isMenuVisible: true,
            status: MenuStatusEnum.ENABLE
        });

        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_USER_VIEW, {
            pid: spicedbMenuId,
            title: '系统用户',
            path: 'user',
            order: 30,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_USER_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW, {
            pid: spicedbMenuId,
            title: '系统角色',
            path: 'role',
            order: 40,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW, {
            pid: spicedbMenuId,
            title: '后台用户组',
            path: 'user-group',
            order: 50,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_MENU_VIEW, {
            pid: spicedbMenuId,
            title: '系统菜单',
            path: 'menu',
            order: 60,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_MENU_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_SPICEDB_VIEW, {
            pid: spicedbMenuId,
            title: 'SpiceDB 数据管理',
            path: 'data',
            order: 10,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_SPICEDB_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_PERMISSION_VIEW, {
            pid: spicedbMenuId,
            title: '关系权限管理',
            path: 'permission',
            order: 20,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_PERMISSION_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_DICT_VIEW, {
            pid: systemMenuId,
            title: '字典管理',
            path: 'dict',
            order: 40,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_DICT_VIEW, groupIdByCode)
        });
        await updateExistingMenu(prisma, RBAC_PERMISSIONS.SYSTEM_TASK_VIEW, {
            pid: systemMenuId,
            title: '任务管理',
            path: 'task',
            order: 50,
            groupId: resolvePermissionGroupId(RBAC_PERMISSIONS.SYSTEM_TASK_VIEW, groupIdByCode)
        });

        for (const page of APP_API_PAGES) {
            await upsertMenu(prisma, page, appManagementMenuId, groupIdByCode);
        }
        const appAbacMenuId = await upsertMenu(prisma, APP_ABAC_CATALOG, appManagementMenuId, groupIdByCode);
        for (const page of APP_ABAC_PAGES) {
            await upsertMenu(prisma, page, appAbacMenuId, groupIdByCode);
        }
        for (const page of RBAC_PAGES) {
            await upsertMenu(prisma, page, userManagementMenuId, groupIdByCode);
        }

        await bindRolePermissions(prisma, roleId, permissionIdByCode);
        await bindDemoReadonlyRolePermissions(prisma, demoReadonlyRoleId);
        await assignSuperAdminUser(prisma, roleId, userId);
        const demoUserId = await upsertDemoUser(prisma, demoUserConfig);
        await assignExclusiveDemoReadonlyRole(prisma, demoReadonlyRoleId, demoUserId);
        await rebuildEffectiveReadModels(prisma);
        await bumpAdminMenuStateVersion(prisma);
        console.log('=== 完成 ===');
        if (!APPLY) {
            console.log('当前是 DRY-RUN，加 --apply 才会写 RBAC 自有表。');
        }
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch((error) => {
    console.error('[seed-admin-api-rbac] seed 失败', error);
    process.exitCode = 1;
});
