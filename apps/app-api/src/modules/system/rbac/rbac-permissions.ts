export const RBAC_PERMISSIONS = {
    SYSTEM_USER_VIEW: 'system.user.view',
    SYSTEM_USER_DETAIL: 'system.user.detail',
    SYSTEM_USER_CREATE: 'system.user.create',
    SYSTEM_USER_UPDATE: 'system.user.update',
    SYSTEM_USER_DELETE: 'system.user.delete',
    SYSTEM_USER_RESET_PASSWORD: 'system.user.reset-password',
    SYSTEM_USER_SESSION_VIEW: 'system.user.session.view',
    SYSTEM_USER_SESSION_REVOKE: 'system.user.session.revoke',
    SYSTEM_USER_IMPERSONATE: 'system.user.impersonate',

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
    EFFECTIVE_REBUILD: 'rbac.effective.rebuild'
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

    permissionSeed(RBAC_PERMISSIONS.ROOT_VIEW, 'RBAC 管理入口', '允许访问 RBAC 管理父菜单', 'MENU', 1000),
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
    )
];
