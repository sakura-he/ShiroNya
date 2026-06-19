export const RBAC_PERMISSIONS = {
    APP_MANAGEMENT_MENU: 'app.home.menu',

    SYSTEM_USER_VIEW: 'system.user.view',
    SYSTEM_USER_DETAIL: 'system.user.detail',
    SYSTEM_USER_CREATE: 'system.user.create',
    SYSTEM_USER_UPDATE: 'system.user.update',
    SYSTEM_USER_DELETE: 'system.user.delete',
    SYSTEM_USER_RESET_PASSWORD: 'system.user.reset-password',
    SYSTEM_USER_SESSION_VIEW: 'system.user.session.view',
    SYSTEM_USER_SESSION_REVOKE: 'system.user.session.revoke',
    SYSTEM_USER_IMPERSONATE: 'system.user.impersonate',

    APP_USER_VIEW: 'app.user.view',
    APP_USER_DETAIL: 'app.user.detail',
    APP_USER_CREATE: 'app.user.create',
    APP_USER_UPDATE: 'app.user.update',
    APP_USER_STATUS_UPDATE: 'app.user.status.update',
    APP_USER_SOFT_DELETE: 'app.user.soft-delete',
    APP_USER_DELETE: 'app.user.delete',
    APP_USER_RESET_PASSWORD: 'app.user.password.reset',

    APP_RBAC_ROLE_VIEW: 'app.rbac.role.view',
    APP_RBAC_ROLE_CREATE: 'app.rbac.role.create',
    APP_RBAC_ROLE_UPDATE: 'app.rbac.role.update',
    APP_RBAC_ROLE_DELETE: 'app.rbac.role.delete',
    APP_RBAC_ROLE_ASSIGN_USER: 'app.rbac.role.assign-user',
    APP_RBAC_ROLE_ASSIGN_USER_GROUP: 'app.rbac.role.assign-user-group',
    APP_RBAC_ROLE_ASSIGN_PARENT_ROLE: 'app.rbac.role.assign-parent-role',
    APP_RBAC_ROLE_ASSIGN_PERMISSION: 'app.rbac.role.assign-permission',

    APP_RBAC_USER_GROUP_VIEW: 'app.rbac.user-group.view',
    APP_RBAC_USER_GROUP_CREATE: 'app.rbac.user-group.create',
    APP_RBAC_USER_GROUP_UPDATE: 'app.rbac.user-group.update',
    APP_RBAC_USER_GROUP_DELETE: 'app.rbac.user-group.delete',
    APP_RBAC_USER_GROUP_ASSIGN_MEMBER: 'app.rbac.user-group.assign-member',
    APP_RBAC_USER_GROUP_ASSIGN_ROLE: 'app.rbac.user-group.assign-role',

    APP_RBAC_PERMISSION_VIEW: 'app.rbac.permission.view',
    APP_RBAC_PERMISSION_CREATE: 'app.rbac.permission.create',
    APP_RBAC_PERMISSION_UPDATE: 'app.rbac.permission.update',
    APP_RBAC_PERMISSION_DELETE: 'app.rbac.permission.delete',
    APP_RBAC_PERMISSION_ASSIGN_ROLE: 'app.rbac.permission.assign-role',

    APP_RBAC_PERMISSION_GROUP_VIEW: 'app.rbac.permission-group.view',
    APP_RBAC_PERMISSION_GROUP_CREATE: 'app.rbac.permission-group.create',
    APP_RBAC_PERMISSION_GROUP_UPDATE: 'app.rbac.permission-group.update',
    APP_RBAC_PERMISSION_GROUP_DELETE: 'app.rbac.permission-group.delete',
    APP_RBAC_PERMISSION_GROUP_ASSIGN: 'app.rbac.permission-group.assign',

    APP_RBAC_MENU_VIEW: 'app.rbac.menu.view',
    APP_RBAC_MENU_CREATE: 'app.rbac.menu.create',
    APP_RBAC_MENU_UPDATE: 'app.rbac.menu.update',
    APP_RBAC_MENU_DELETE: 'app.rbac.menu.delete',

    APP_ABAC_PAGE: 'app.abac.page',
    APP_ABAC_FIELD_READ: 'app.abac.field.read',
    APP_ABAC_FIELD_WRITE: 'app.abac.field.write',
    APP_ABAC_POLICY_GROUP_READ: 'app.abac.policy-group.read',
    APP_ABAC_POLICY_GROUP_WRITE: 'app.abac.policy-group.write',
    APP_ABAC_MANUAL_POLICY_READ: 'app.abac.manual-policy.read',
    APP_ABAC_MANUAL_POLICY_WRITE: 'app.abac.manual-policy.write',
    APP_ABAC_PREVIEW: 'app.abac.preview',
    APP_ABAC_PUBLISH: 'app.abac.publish',
    APP_ABAC_RUNTIME_TEST: 'app.abac.runtime-test',

    SYSTEM_ROLE_VIEW: 'system.role.view',
    SYSTEM_ROLE_CREATE: 'system.role.create',
    SYSTEM_ROLE_UPDATE: 'system.role.update',
    SYSTEM_ROLE_DELETE: 'system.role.delete',
    SYSTEM_ROLE_ASSIGN_USER: 'system.role.assign-user',
    SYSTEM_ROLE_ASSIGN_USER_GROUP: 'system.role.assign-user-group',
    SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY: 'system.role.assign-task-capability',
    SYSTEM_ROLE_ASSIGN_TASK_RESOURCE: 'system.role.assign-task-resource',

    SYSTEM_USER_GROUP_VIEW: 'system.user-group.view',
    SYSTEM_USER_GROUP_CREATE: 'system.user-group.create',
    SYSTEM_USER_GROUP_UPDATE: 'system.user-group.update',
    SYSTEM_USER_GROUP_DELETE: 'system.user-group.delete',
    SYSTEM_USER_GROUP_ASSIGN_MEMBER: 'system.user-group.assign-member',
    SYSTEM_USER_GROUP_ASSIGN_ROLE: 'system.user-group.assign-role',

    SYSTEM_MENU_VIEW: 'system.menu.view',
    SYSTEM_MENU_CREATE: 'system.menu.create',
    SYSTEM_MENU_UPDATE: 'system.menu.update',
    SYSTEM_MENU_DELETE: 'system.menu.delete',
    SYSTEM_MENU_ASSIGN_ROLE: 'system.menu.assign-role',

    SYSTEM_PERMISSION_VIEW: 'system.permission.view',
    SYSTEM_PERMISSION_UPDATE: 'system.permission.update',

    SYSTEM_DICT_VIEW: 'system.dict.view',
    SYSTEM_DICT_CREATE: 'system.dict.create',
    SYSTEM_DICT_UPDATE: 'system.dict.update',
    SYSTEM_DICT_DELETE: 'system.dict.delete',
    SYSTEM_DICT_ITEM_CREATE: 'system.dict-item.create',
    SYSTEM_DICT_ITEM_UPDATE: 'system.dict-item.update',
    SYSTEM_DICT_ITEM_DELETE: 'system.dict-item.delete',

    SYSTEM_TASK_VIEW: 'system.task.view',

    SYSTEM_MONITOR_MENU: 'system.monitor.menu',
    SYSTEM_MONITOR_STATUS_VIEW: 'system.monitor.status.view',
    SYSTEM_MONITOR_REDIS_VIEW: 'system.monitor.redis.view',

    SYSTEM_ADMIN_PREFERENCE_VIEW: 'system.admin-preference.view',
    SYSTEM_ADMIN_PREFERENCE_MANAGE: 'system.admin-preference.manage',

    SYSTEM_ABAC_MENU: 'system.abac.menu',
    SYSTEM_ABAC_PAGE: 'system.abac.page',
    SYSTEM_ABAC_FIELD_READ: 'system.abac.field.read',
    SYSTEM_ABAC_FIELD_WRITE: 'system.abac.field.write',
    SYSTEM_ABAC_POLICY_GROUP_READ: 'system.abac.policy-group.read',
    SYSTEM_ABAC_POLICY_GROUP_WRITE: 'system.abac.policy-group.write',
    SYSTEM_ABAC_MANUAL_POLICY_READ: 'system.abac.manual-policy.read',
    SYSTEM_ABAC_MANUAL_POLICY_WRITE: 'system.abac.manual-policy.write',
    SYSTEM_ABAC_PREVIEW: 'system.abac.preview',
    SYSTEM_ABAC_PUBLISH: 'system.abac.publish',
    SYSTEM_ABAC_RUNTIME_TEST: 'system.abac.runtime-test',

    SYSTEM_SPICEDB_MENU: 'system.spicedb.menu',
    SYSTEM_SPICEDB_VIEW: 'system.spicedb.view',
    SYSTEM_SPICEDB_PUBLISH_SCHEMA: 'system.spicedb.publish-schema',
    SYSTEM_SPICEDB_RECONCILE_PROJECTION: 'system.spicedb.reconcile-projection',
    SYSTEM_SPICEDB_CREATE_RELATIONSHIP: 'system.spicedb.create-relationship',
    SYSTEM_SPICEDB_DELETE_RELATIONSHIP: 'system.spicedb.delete-relationship',
    SYSTEM_SPICEDB_BULK_RELATIONSHIP: 'system.spicedb.bulk-relationship',
    SYSTEM_SPICEDB_CHECK_PERMISSION: 'system.spicedb.check-permission',
    SYSTEM_SPICEDB_BATCH_CHECK_PERMISSION: 'system.spicedb.batch-check-permission',
    SYSTEM_SPICEDB_EXPLAIN_PERMISSION: 'system.spicedb.explain-permission',
    SYSTEM_SPICEDB_REPLAY_WATCH: 'system.spicedb.replay-watch',
    SYSTEM_SPICEDB_HANDLE_WATCH: 'system.spicedb.handle-watch',

    ROOT_VIEW: 'system.rbac.view',

    USER_VIEW: 'system.rbac.user.view',
    USER_ASSIGN_ROLE: 'rbac.user.assign_role',
    USER_ASSIGN_USER_GROUP: 'rbac.user.assign_user_group',

    ROLE_VIEW: 'system.rbac.role.view',
    ROLE_CREATE: 'rbac.role.create',
    ROLE_UPDATE: 'rbac.role.update',
    ROLE_DELETE: 'rbac.role.delete',
    ROLE_ASSIGN_USER: 'rbac.role.assign_user',
    ROLE_ASSIGN_USER_GROUP: 'rbac.role.assign_user_group',
    ROLE_ASSIGN_PARENT_ROLE: 'rbac.role.assign_parent_role',
    ROLE_ASSIGN_PERMISSION: 'rbac.role.assign_permission',

    USER_GROUP_VIEW: 'system.rbac.user-group.view',
    USER_GROUP_CREATE: 'rbac.user_group.create',
    USER_GROUP_UPDATE: 'rbac.user_group.update',
    USER_GROUP_DELETE: 'rbac.user_group.delete',
    USER_GROUP_ASSIGN_MEMBER: 'rbac.user_group.assign_member',
    USER_GROUP_ASSIGN_ROLE: 'rbac.user_group.assign_role',

    PERMISSION_VIEW: 'system.rbac.permission.view',
    PERMISSION_CREATE: 'rbac.permission.create',
    PERMISSION_UPDATE: 'rbac.permission.update',
    PERMISSION_DELETE: 'rbac.permission.delete',

    MENU_BINDING_VIEW: 'system.rbac.menu-binding.view',
    MENU_CREATE: 'rbac.menu.create',
    MENU_UPDATE: 'rbac.menu.update',
    MENU_DELETE: 'rbac.menu.delete',

    EFFECTIVE_VIEW: 'system.rbac.effective.view',
    EFFECTIVE_REBUILD: 'rbac.effective.rebuild',

    TEST_PAGE: 'rbac.test.page',
    TEST_VIEW: 'rbac.test.view',
    TEST_READ: 'rbac.test.read',
    TEST_CREATE: 'rbac.test.create',
    TEST_UPDATE: 'rbac.test.update',
    TEST_DELETE: 'rbac.test.delete',
    TEST_ADMIN: 'rbac.test.manage',
    TEST_PROFILE: 'rbac.test.profile',
    TEST_APPROVE: 'rbac.test.approve',
    TEST_PUBLISH: 'rbac.test.publish'
} as const;

export type RbacPermissionCode = (typeof RBAC_PERMISSIONS)[keyof typeof RBAC_PERMISSIONS];

export type RbacPermissionSeed = {
    code: RbacPermissionCode;
    name: string;
    description: string;
    kind: 'MENU' | 'API' | 'ACTION' | 'DATA' | 'CUSTOM';
    sort: number;
};

function permissionSeed(
    code: RbacPermissionCode,
    name: string,
    description: string,
    kind: RbacPermissionSeed['kind'],
    sort: number
): RbacPermissionSeed {
    return {
        code,
        name,
        description,
        kind,
        sort
    };
}

export const RBAC_MANAGEMENT_PERMISSION_SEEDS: RbacPermissionSeed[] = [
    permissionSeed(RBAC_PERMISSIONS.APP_MANAGEMENT_MENU, 'App 管理目录', '允许显示 App 管理根目录', 'MENU', 5),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_VIEW, '用户查看', '允许查看后台用户列表和用户关系', 'MENU', 10),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_DETAIL, '用户详情', '允许查看后台用户详情', 'MENU', 11),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_CREATE, '用户创建', '允许创建后台用户', 'ACTION', 12),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_UPDATE, '用户更新', '允许更新后台用户', 'ACTION', 13),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_DELETE, '用户删除', '允许删除后台用户', 'ACTION', 14),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_RESET_PASSWORD, '用户重置密码', '允许重置后台用户密码', 'ACTION', 15),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW, '用户会话查看', '允许查看后台用户会话', 'ACTION', 16),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE, '用户会话撤销', '允许撤销后台用户会话', 'ACTION', 17),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE,
        '用户伪装登录',
        '允许创建目标用户的 Better Auth 伪装会话',
        'ACTION',
        18
    ),

    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ADMIN_PREFERENCE_VIEW,
        '后台偏好查看',
        '允许查看后台界面偏好系统策略',
        'MENU',
        30
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ADMIN_PREFERENCE_MANAGE,
        '后台偏好管理',
        '允许维护后台界面偏好系统默认值和用户可编辑策略',
        'ACTION',
        31
    ),

    permissionSeed(RBAC_PERMISSIONS.APP_USER_VIEW, '应用用户查看', '允许查看 app-api 业务用户列表', 'MENU', 80),
    permissionSeed(RBAC_PERMISSIONS.APP_USER_DETAIL, '应用用户详情', '允许查看 app-api 业务用户详情', 'ACTION', 81),
    permissionSeed(RBAC_PERMISSIONS.APP_USER_CREATE, '应用用户创建', '允许创建 app-api 业务用户', 'ACTION', 82),
    permissionSeed(RBAC_PERMISSIONS.APP_USER_UPDATE, '应用用户更新', '允许更新 app-api 业务用户资料', 'ACTION', 83),
    permissionSeed(
        RBAC_PERMISSIONS.APP_USER_SOFT_DELETE,
        '应用用户软删除',
        '允许软删除 app-api 业务用户',
        'ACTION',
        84
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_USER_STATUS_UPDATE,
        '应用用户状态',
        '允许启用或禁用 app-api 业务用户',
        'ACTION',
        85
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_USER_RESET_PASSWORD,
        '应用用户重置密码',
        '允许重置 app-api 业务用户密码',
        'ACTION',
        86
    ),
    permissionSeed(RBAC_PERMISSIONS.APP_USER_DELETE, '应用用户删除', '允许真实删除 app-api 业务用户', 'ACTION', 87),

    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW,
        '应用 RBAC 角色查看',
        '允许查看 app-api RBAC 角色',
        'MENU',
        90
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_CREATE,
        '应用 RBAC 角色创建',
        '允许创建 app-api RBAC 角色',
        'ACTION',
        91
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_UPDATE,
        '应用 RBAC 角色更新',
        '允许更新 app-api RBAC 角色',
        'ACTION',
        92
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_DELETE,
        '应用 RBAC 角色删除',
        '允许删除 app-api RBAC 角色',
        'ACTION',
        93
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER,
        '应用 RBAC 角色分配用户',
        '允许维护 app-api 角色直接用户',
        'ACTION',
        94
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER_GROUP,
        '应用 RBAC 角色分配用户组',
        '允许维护 app-api 角色用户组',
        'ACTION',
        95
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PARENT_ROLE,
        '应用 RBAC 角色继承',
        '允许维护 app-api 角色继承关系',
        'ACTION',
        96
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PERMISSION,
        '应用 RBAC 角色授权',
        '允许维护 app-api 角色权限',
        'ACTION',
        97
    ),

    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW,
        '应用 RBAC 用户组查看',
        '允许查看 app-api RBAC 用户组',
        'MENU',
        98
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_CREATE,
        '应用 RBAC 用户组创建',
        '允许创建 app-api RBAC 用户组',
        'ACTION',
        99
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_UPDATE,
        '应用 RBAC 用户组更新',
        '允许更新 app-api RBAC 用户组',
        'ACTION',
        100
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_DELETE,
        '应用 RBAC 用户组删除',
        '允许删除 app-api RBAC 用户组',
        'ACTION',
        101
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_MEMBER,
        '应用 RBAC 用户组成员分配',
        '允许维护 app-api 用户组成员',
        'ACTION',
        102
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_ROLE,
        '应用 RBAC 用户组角色分配',
        '允许维护 app-api 用户组角色',
        'ACTION',
        103
    ),

    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW,
        '应用 RBAC 权限查看',
        '允许查看 app-api RBAC 权限',
        'MENU',
        104
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_CREATE,
        '应用 RBAC 权限创建',
        '允许创建 app-api RBAC 权限',
        'ACTION',
        105
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_UPDATE,
        '应用 RBAC 权限更新',
        '允许更新 app-api RBAC 权限',
        'ACTION',
        106
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_DELETE,
        '应用 RBAC 权限删除',
        '允许删除 app-api RBAC 权限',
        'ACTION',
        107
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_ASSIGN_ROLE,
        '应用 RBAC 权限角色分配',
        '允许维护 app-api 权限角色',
        'ACTION',
        108
    ),

    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_VIEW,
        '应用 RBAC 权限分组查看',
        '允许查看 app-api RBAC 权限分组',
        'MENU',
        109
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_CREATE,
        '应用 RBAC 权限分组创建',
        '允许创建 app-api RBAC 权限分组',
        'ACTION',
        110
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_UPDATE,
        '应用 RBAC 权限分组更新',
        '允许更新 app-api RBAC 权限分组',
        'ACTION',
        111
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_DELETE,
        '应用 RBAC 权限分组删除',
        '允许删除 app-api RBAC 权限分组',
        'ACTION',
        112
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_ASSIGN,
        '应用 RBAC 权限分组关系维护',
        '允许维护 app-api 权限分组关系',
        'ACTION',
        113
    ),

    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW,
        '应用 RBAC 菜单查看',
        '允许查看 app-api RBAC 菜单',
        'MENU',
        114
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_MENU_CREATE,
        '应用 RBAC 菜单创建',
        '允许创建 app-api RBAC 菜单',
        'ACTION',
        115
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_MENU_UPDATE,
        '应用 RBAC 菜单更新',
        '允许更新 app-api RBAC 菜单',
        'ACTION',
        116
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_RBAC_MENU_DELETE,
        '应用 RBAC 菜单删除',
        '允许删除 app-api RBAC 菜单',
        'ACTION',
        117
    ),
    permissionSeed(RBAC_PERMISSIONS.APP_ABAC_PAGE, '应用 ABAC 管理', '允许访问 app-api ABAC 管理页', 'MENU', 126),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_FIELD_READ,
        '应用 ABAC 字段查看',
        '允许查看 app-api ABAC 内置策略字段',
        'MENU',
        129
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_FIELD_WRITE,
        '应用 ABAC 字段维护',
        '允许维护 app-api ABAC 内置策略字段',
        'ACTION',
        129
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_READ,
        '应用 ABAC 策略组查看',
        '允许查看 app-api ABAC 内置策略组',
        'MENU',
        130
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_POLICY_GROUP_WRITE,
        '应用 ABAC 策略组维护',
        '允许维护 app-api ABAC 内置策略组',
        'ACTION',
        131
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_READ,
        '应用 ABAC 手写策略查看',
        '允许查看 app-api ABAC 手写策略',
        'MENU',
        132
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_MANUAL_POLICY_WRITE,
        '应用 ABAC 手写策略维护',
        '允许维护 app-api ABAC 手写 rules',
        'ACTION',
        133
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_PREVIEW,
        '应用 ABAC 预览',
        '允许预览 app-api ABAC 编译结果',
        'MENU',
        134
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_PUBLISH,
        '应用 ABAC 发布',
        '允许发布和回滚 app-api ABAC 策略',
        'MENU',
        135
    ),
    permissionSeed(
        RBAC_PERMISSIONS.APP_ABAC_RUNTIME_TEST,
        '应用 ABAC 测试台',
        '允许运行 app-api ABAC 测试台',
        'MENU',
        136
    ),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW, '角色查看', '允许查看后台角色', 'MENU', 20),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ROLE_CREATE, '角色创建', '允许创建后台角色', 'ACTION', 21),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ROLE_UPDATE, '角色更新', '允许更新后台角色', 'ACTION', 22),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE, '角色删除', '允许删除后台角色', 'ACTION', 23),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER, '角色分配用户', '允许维护角色直接用户', 'ACTION', 24),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER_GROUP,
        '角色分配用户组',
        '允许维护角色用户组',
        'ACTION',
        25
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY,
        '角色分配任务能力',
        '允许维护角色任务能力关系',
        'ACTION',
        26
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE,
        '角色分配任务资源',
        '允许维护角色任务资源关系',
        'ACTION',
        27
    ),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW, '用户组查看', '允许查看后台用户组', 'MENU', 30),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_CREATE, '用户组创建', '允许创建后台用户组', 'ACTION', 31),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE, '用户组更新', '允许更新后台用户组', 'ACTION', 32),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE, '用户组删除', '允许删除后台用户组', 'ACTION', 33),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER,
        '用户组分配成员',
        '允许维护用户组成员',
        'ACTION',
        34
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_ROLE,
        '用户组分配角色',
        '允许维护用户组角色',
        'ACTION',
        35
    ),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MENU_VIEW, '菜单查看', '允许查看后台菜单', 'MENU', 40),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MENU_CREATE, '菜单创建', '允许创建后台菜单', 'ACTION', 41),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MENU_UPDATE, '菜单更新', '允许更新后台菜单', 'ACTION', 42),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MENU_DELETE, '菜单删除', '允许删除后台菜单', 'ACTION', 43),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE, '菜单分配角色', '允许维护菜单角色关系', 'ACTION', 44),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_PERMISSION_VIEW, '关系权限查看', '允许查看关系权限管理页', 'MENU', 50),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE, '关系权限更新', '允许维护关系权限配置', 'ACTION', 51),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_VIEW, '字典查看', '允许查看字典管理', 'MENU', 60),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_CREATE, '字典创建', '允许创建字典和字典项', 'ACTION', 61),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_UPDATE, '字典更新', '允许更新字典和字典项', 'ACTION', 62),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_DELETE, '字典删除', '允许删除字典和字典项', 'ACTION', 63),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_ITEM_CREATE, '字典项创建', '允许创建字典项', 'ACTION', 64),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_ITEM_UPDATE, '字典项更新', '允许更新字典项', 'ACTION', 65),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_DICT_ITEM_DELETE, '字典项删除', '允许删除字典项', 'ACTION', 66),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_TASK_VIEW, '任务查看', '允许访问任务管理入口', 'MENU', 70),

    permissionSeed(RBAC_PERMISSIONS.SYSTEM_MONITOR_MENU, '运行监控目录', '允许显示系统运行监控目录', 'MENU', 75),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_MONITOR_STATUS_VIEW,
        '系统运行状态查看',
        '允许查看后台服务、数据库和运行时状态',
        'MENU',
        76
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_MONITOR_REDIS_VIEW,
        'Redis 监控查看',
        '允许查看 Redis 连接、内存、命令和键空间状态',
        'MENU',
        77
    ),

    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_MENU,
        'SpiceDB 目录',
        '允许显示 SpiceDB 关系授权工具目录',
        'MENU',
        79
    ),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_SPICEDB_VIEW, 'SpiceDB 查看', '允许查看 SpiceDB 关系工具页', 'MENU', 80),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_PUBLISH_SCHEMA,
        'SpiceDB 发布 Schema',
        '允许发布 SpiceDB schema',
        'ACTION',
        81
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_RECONCILE_PROJECTION,
        'SpiceDB 投影对账',
        '允许执行 SpiceDB 投影对账',
        'ACTION',
        82
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_CREATE_RELATIONSHIP,
        'SpiceDB 创建关系',
        '允许创建 SpiceDB 关系',
        'ACTION',
        83
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_DELETE_RELATIONSHIP,
        'SpiceDB 删除关系',
        '允许删除 SpiceDB 关系',
        'ACTION',
        84
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_BULK_RELATIONSHIP,
        'SpiceDB 批量关系',
        '允许批量维护 SpiceDB 关系',
        'ACTION',
        85
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_CHECK_PERMISSION,
        'SpiceDB 检查权限',
        '允许执行 SpiceDB 权限检查',
        'ACTION',
        86
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_BATCH_CHECK_PERMISSION,
        'SpiceDB 批量检查权限',
        '允许执行 SpiceDB 批量权限检查',
        'ACTION',
        87
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_EXPLAIN_PERMISSION,
        'SpiceDB 解释权限',
        '允许执行 SpiceDB 权限解释',
        'ACTION',
        88
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_REPLAY_WATCH,
        'SpiceDB 回放 Watch',
        '允许回放 Watch 事件',
        'ACTION',
        89
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_SPICEDB_HANDLE_WATCH,
        'SpiceDB 处理 Watch',
        '允许人工处理 Watch 事件',
        'ACTION',
        90
    ),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_MENU, 'ABAC 目录', '允许显示 Cerbos ABAC 授权管理目录', 'MENU', 93),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_PAGE, 'ABAC 权限管理', '允许访问 Cerbos ABAC 管理页', 'MENU', 94),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_FIELD_READ, 'ABAC 字段查看', '允许查看 ABAC 内置策略字段', 'MENU', 97),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ABAC_FIELD_WRITE,
        'ABAC 字段维护',
        '允许维护 ABAC 内置策略字段',
        'ACTION',
        97
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_READ,
        'ABAC 策略组查看',
        '允许查看 ABAC 内置策略组',
        'MENU',
        98
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ABAC_POLICY_GROUP_WRITE,
        'ABAC 策略组维护',
        '允许维护 ABAC 内置策略组',
        'ACTION',
        99
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_READ,
        'ABAC 手写策略查看',
        '允许查看 ABAC 手写策略',
        'MENU',
        100
    ),
    permissionSeed(
        RBAC_PERMISSIONS.SYSTEM_ABAC_MANUAL_POLICY_WRITE,
        'ABAC 手写策略维护',
        '允许维护 ABAC 手写 rules',
        'ACTION',
        101
    ),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_PREVIEW, 'ABAC 编译预览', '允许预览 ABAC 编译结果', 'MENU', 102),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_PUBLISH, 'ABAC 发布', '允许发布和回滚 ABAC 策略', 'MENU', 103),
    permissionSeed(RBAC_PERMISSIONS.SYSTEM_ABAC_RUNTIME_TEST, 'ABAC 测试台', '允许运行 ABAC 测试台', 'MENU', 104),

    permissionSeed(RBAC_PERMISSIONS.ROOT_VIEW, '用户管理目录', '允许访问用户与 RBAC 管理父菜单', 'MENU', 1000),
    permissionSeed(RBAC_PERMISSIONS.USER_VIEW, 'RBAC 用户查看', '允许查看 RBAC 用户关系', 'MENU', 1010),
    permissionSeed(
        RBAC_PERMISSIONS.USER_ASSIGN_ROLE,
        'RBAC 用户分配角色',
        '允许在 RBAC 中为用户分配角色',
        'ACTION',
        1011
    ),
    permissionSeed(
        RBAC_PERMISSIONS.USER_ASSIGN_USER_GROUP,
        'RBAC 用户分配用户组',
        '允许在 RBAC 中为用户分配用户组',
        'ACTION',
        1012
    ),

    permissionSeed(RBAC_PERMISSIONS.ROLE_VIEW, 'RBAC 角色查看', '允许查看 RBAC 角色', 'MENU', 1020),
    permissionSeed(RBAC_PERMISSIONS.ROLE_CREATE, 'RBAC 角色创建', '允许创建 RBAC 角色', 'ACTION', 1021),
    permissionSeed(RBAC_PERMISSIONS.ROLE_UPDATE, 'RBAC 角色更新', '允许更新 RBAC 角色', 'ACTION', 1022),
    permissionSeed(RBAC_PERMISSIONS.ROLE_DELETE, 'RBAC 角色删除', '允许删除 RBAC 角色', 'ACTION', 1023),
    permissionSeed(
        RBAC_PERMISSIONS.ROLE_ASSIGN_USER,
        'RBAC 角色分配用户',
        '允许维护 RBAC 角色的直接用户',
        'ACTION',
        1024
    ),
    permissionSeed(
        RBAC_PERMISSIONS.ROLE_ASSIGN_USER_GROUP,
        'RBAC 角色分配用户组',
        '允许维护 RBAC 角色的用户组',
        'ACTION',
        1025
    ),
    permissionSeed(
        RBAC_PERMISSIONS.ROLE_ASSIGN_PARENT_ROLE,
        'RBAC 角色继承',
        '允许维护 RBAC 角色继承关系',
        'ACTION',
        1026
    ),
    permissionSeed(RBAC_PERMISSIONS.ROLE_ASSIGN_PERMISSION, 'RBAC 角色授权', '允许维护 RBAC 角色权限', 'ACTION', 1027),

    permissionSeed(RBAC_PERMISSIONS.USER_GROUP_VIEW, 'RBAC 用户组查看', '允许查看 RBAC 用户组', 'MENU', 1030),
    permissionSeed(RBAC_PERMISSIONS.USER_GROUP_CREATE, 'RBAC 用户组创建', '允许创建 RBAC 用户组', 'ACTION', 1031),
    permissionSeed(RBAC_PERMISSIONS.USER_GROUP_UPDATE, 'RBAC 用户组更新', '允许更新 RBAC 用户组', 'ACTION', 1032),
    permissionSeed(RBAC_PERMISSIONS.USER_GROUP_DELETE, 'RBAC 用户组删除', '允许删除 RBAC 用户组', 'ACTION', 1033),
    permissionSeed(
        RBAC_PERMISSIONS.USER_GROUP_ASSIGN_MEMBER,
        'RBAC 用户组成员分配',
        '允许维护 RBAC 用户组成员',
        'ACTION',
        1034
    ),
    permissionSeed(
        RBAC_PERMISSIONS.USER_GROUP_ASSIGN_ROLE,
        'RBAC 用户组角色分配',
        '允许维护 RBAC 用户组角色',
        'ACTION',
        1035
    ),

    permissionSeed(RBAC_PERMISSIONS.PERMISSION_VIEW, 'RBAC 权限查看', '允许查看 RBAC 权限', 'MENU', 1040),
    permissionSeed(RBAC_PERMISSIONS.PERMISSION_CREATE, 'RBAC 权限创建', '允许创建 RBAC 权限', 'ACTION', 1041),
    permissionSeed(RBAC_PERMISSIONS.PERMISSION_UPDATE, 'RBAC 权限更新', '允许更新 RBAC 权限', 'ACTION', 1042),
    permissionSeed(RBAC_PERMISSIONS.PERMISSION_DELETE, 'RBAC 权限删除', '允许删除 RBAC 权限', 'ACTION', 1043),

    permissionSeed(RBAC_PERMISSIONS.MENU_BINDING_VIEW, 'RBAC 菜单查看', '允许查看 RBAC 菜单声明', 'MENU', 1050),
    permissionSeed(RBAC_PERMISSIONS.MENU_CREATE, 'RBAC 菜单创建', '允许创建 RBAC 自有菜单', 'ACTION', 1052),
    permissionSeed(RBAC_PERMISSIONS.MENU_UPDATE, 'RBAC 菜单更新', '允许更新 RBAC 自有菜单元数据', 'ACTION', 1053),
    permissionSeed(RBAC_PERMISSIONS.MENU_DELETE, 'RBAC 菜单删除', '允许删除 RBAC 自有菜单', 'ACTION', 1054),

    permissionSeed(
        RBAC_PERMISSIONS.EFFECTIVE_VIEW,
        'RBAC Effective 查看',
        '允许查看 RBAC effective 读模型',
        'MENU',
        1060
    ),
    permissionSeed(
        RBAC_PERMISSIONS.EFFECTIVE_REBUILD,
        'RBAC Effective 重建',
        '允许预览和应用 RBAC effective 重建',
        'ACTION',
        1061
    ),

    permissionSeed(RBAC_PERMISSIONS.TEST_PAGE, 'RBAC 测试台入口', '允许访问 RBAC 权限测试台页面', 'MENU', 1090),
    permissionSeed(RBAC_PERMISSIONS.TEST_VIEW, 'RBAC 测试台查看', '允许通过 RBAC 测试台的查看接口', 'API', 1100),
    permissionSeed(RBAC_PERMISSIONS.TEST_READ, 'RBAC 测试台读取', '允许通过 RBAC 测试台的读取接口', 'API', 1101),
    permissionSeed(RBAC_PERMISSIONS.TEST_CREATE, 'RBAC 测试台创建', '允许通过 RBAC 测试台的创建接口', 'API', 1102),
    permissionSeed(RBAC_PERMISSIONS.TEST_UPDATE, 'RBAC 测试台更新', '允许通过 RBAC 测试台的更新接口', 'API', 1103),
    permissionSeed(RBAC_PERMISSIONS.TEST_DELETE, 'RBAC 测试台删除', '允许通过 RBAC 测试台的删除接口', 'API', 1104),
    permissionSeed(RBAC_PERMISSIONS.TEST_ADMIN, 'RBAC 测试台管理', '允许通过 RBAC 测试台的管理接口', 'API', 1105),
    permissionSeed(RBAC_PERMISSIONS.TEST_PROFILE, 'RBAC 测试台资料接口', '允许通过 RBAC 测试台的资料接口', 'API', 1110),
    permissionSeed(RBAC_PERMISSIONS.TEST_APPROVE, 'RBAC 测试台审批接口', '允许通过 RBAC 测试台的审批接口', 'API', 1111),
    permissionSeed(RBAC_PERMISSIONS.TEST_PUBLISH, 'RBAC 测试台发布接口', '允许通过 RBAC 测试台的发布接口', 'API', 1112)
];
