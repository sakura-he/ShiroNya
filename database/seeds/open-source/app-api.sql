-- Shiro Nya 开源版 app-api 初始化数据。
-- 本文件只填充数据，不创建表、不修改表结构；请先由 Prisma 完成 schema 同步。
-- 这里的账号、权限、菜单和演示数据用于让公开部署后的 app-api 数据库具备可观察、可管理的初始状态。

BEGIN;

-- 1. Better Auth 应用侧账号。
-- app-api 默认不开放邮箱密码登录，但账号仍然用于用户资料、RBAC 关系、任务归属和后台 App 用户管理演示。
-- 密码明文仅写在 README 里，数据库中保存 better-auth/crypto 生成的哈希值。
WITH user_seed(id, username, email, name, role, password_hash, nickname, profile_level, profile_exp, remark) AS (
    VALUES
        (
            'app_admin_open_source',
            'admin',
            'admin@app.shiro-nya.local',
            'App Admin',
            'admin',
            '9d7638abfa01df5f4136bf93750edfe0:8c92ae733d9f37ce054fbd830014ba5322f0fc554ac6dc9c6f2bc88b0105bb614f136f36aa971c7c8cb156676bb382a77ae4b475452ca9a3ad2a45d770d552b2',
            'App 管理员',
            10,
            1200,
            '开源版内置 app-api 管理员资料'
        ),
        (
            'app_demo_open_source',
            'demo',
            'demo@app.shiro-nya.local',
            'App Demo 用户',
            'user',
            'eb1087482779a60f6d5881bf0f296b7b:1580c463a0b2d32a0737f11618f9be490a60a871c29e1b3ae345384885727fbfff96f47600ec3157ea43701d42277dbb913ad2024833acc2dc3d0097a5b7b3f8',
            'Demo 用户',
            2,
            80,
            '开源版内置 app-api 演示用户资料'
        )
)
INSERT INTO better_auth_user (
    id,
    name,
    email,
    "emailVerified",
    image,
    role,
    banned,
    "banReason",
    "banExpires",
    "deletedAt",
    "deleteReason",
    "createdAt",
    "updatedAt",
    "phoneNumber",
    "phoneNumberVerified",
    username,
    "displayUsername"
)
SELECT
    seed.id,
    seed.name,
    seed.email,
    true,
    null,
    seed.role,
    false,
    null,
    null,
    null,
    null,
    now(),
    now(),
    null,
    false,
    seed.username,
    seed.nickname
FROM user_seed seed
ON CONFLICT (username) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    "emailVerified" = true,
    image = EXCLUDED.image,
    role = EXCLUDED.role,
    banned = false,
    "banReason" = null,
    "banExpires" = null,
    "deletedAt" = null,
    "deleteReason" = null,
    "updatedAt" = now(),
    "phoneNumber" = null,
    "phoneNumberVerified" = false,
    "displayUsername" = EXCLUDED."displayUsername";

WITH seeded_users AS (
    SELECT id, username
    FROM better_auth_user
    WHERE username IN ('admin', 'demo')
)
DELETE FROM better_auth_account account
USING seeded_users seed
WHERE account."userId" = seed.id
  AND account."providerId" = 'credential';

WITH user_seed(username, password_hash) AS (
    VALUES
        (
            'admin',
            '9d7638abfa01df5f4136bf93750edfe0:8c92ae733d9f37ce054fbd830014ba5322f0fc554ac6dc9c6f2bc88b0105bb614f136f36aa971c7c8cb156676bb382a77ae4b475452ca9a3ad2a45d770d552b2'
        ),
        (
            'demo',
            'eb1087482779a60f6d5881bf0f296b7b:1580c463a0b2d32a0737f11618f9be490a60a871c29e1b3ae345384885727fbfff96f47600ec3157ea43701d42277dbb913ad2024833acc2dc3d0097a5b7b3f8'
        )
)
INSERT INTO better_auth_account (
    id,
    "accountId",
    "providerId",
    "userId",
    password,
    "createdAt",
    "updatedAt"
)
SELECT
    'credential_' || auth_user.id,
    auth_user.id,
    'credential',
    auth_user.id,
    seed.password_hash,
    now(),
    now()
FROM user_seed seed
JOIN better_auth_user auth_user ON auth_user.username = seed.username
ON CONFLICT (id) DO UPDATE SET
    "accountId" = EXCLUDED."accountId",
    "providerId" = EXCLUDED."providerId",
    "userId" = EXCLUDED."userId",
    password = EXCLUDED.password,
    "updatedAt" = now();

WITH user_seed(username, nickname, profile_level, profile_exp, remark) AS (
    VALUES
        ('admin', 'App 管理员', 10, 1200, '开源版内置 app-api 管理员资料'),
        ('demo', 'Demo 用户', 2, 80, '开源版内置 app-api 演示用户资料')
)
INSERT INTO better_auth_user_profile (
    user_id,
    nickname,
    avatar,
    gender,
    level,
    exp,
    remark,
    created_by,
    last_login_at,
    created_at,
    updated_at
)
SELECT
    auth_user.id,
    seed.nickname,
    null,
    0,
    seed.profile_level,
    seed.profile_exp,
    seed.remark,
    'open_source_seed',
    null,
    now(),
    now()
FROM user_seed seed
JOIN better_auth_user auth_user ON auth_user.username = seed.username
ON CONFLICT (user_id) DO UPDATE SET
    nickname = EXCLUDED.nickname,
    avatar = EXCLUDED.avatar,
    gender = EXCLUDED.gender,
    level = EXCLUDED.level,
    exp = EXCLUDED.exp,
    remark = EXCLUDED.remark,
    created_by = EXCLUDED.created_by,
    updated_at = now();

-- 2. RBAC 权限分组。
-- group_code 后续会被权限和菜单引用，用来让管理页按业务模块归类显示权限。
WITH group_seed(code, name, description, sort) AS (
    VALUES
        ('system.home', '系统管理', 'app-api 系统管理根目录入口权限', 1),
        ('system.user', '系统用户', 'app-api 用户、用户详情、密码和会话管理权限', 10),
        ('system.role', '系统角色', 'app-api 角色管理和关系授权动作权限', 20),
        ('system.user-group', '系统用户组', 'app-api 用户组管理和成员授权动作权限', 30),
        ('system.menu', '系统菜单', 'app-api 菜单元数据管理权限', 40),
        ('system.permission', '关系权限', 'app-api SpiceDB 关系权限管理入口权限', 50),
        ('system.dict', '系统字典', 'app-api 字典和字典项管理权限', 60),
        ('system.task', '系统任务', 'app-api 任务管理入口权限', 70),
        ('system.spicedb', 'SpiceDB 关系授权', 'app-api SpiceDB 数据页、关系调试和运维动作权限', 80),
        ('system.rbac', 'RBAC 管理入口', 'app-api RBAC 管理目录入口权限', 1000),
        ('system.rbac.user', 'RBAC 用户', 'app-api RBAC 用户角色和用户组关系权限', 1010),
        ('system.rbac.role', 'RBAC 角色', 'app-api RBAC 角色、继承关系和角色授权权限', 1020),
        ('system.rbac.user-group', 'RBAC 用户组', 'app-api RBAC 用户组成员和角色关系权限', 1030),
        ('system.rbac.permission', 'RBAC 权限', 'app-api RBAC 权限声明、数据库权限和分组管理权限', 1040),
        ('system.rbac.menu', 'RBAC 菜单', 'app-api RBAC 菜单元数据和所需权限声明权限', 1050),
        ('system.rbac.effective', 'RBAC Effective', 'app-api RBAC effective 读模型查看和重建权限', 1060)
)
INSERT INTO rbac_permission_group (
    code,
    name,
    description,
    sort,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    seed.code,
    seed.name,
    seed.description,
    seed.sort,
    'ENABLE'::"RbacStatus",
    'open_source_seed',
    'open_source_seed',
    now(),
    now(),
    null
FROM group_seed seed
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort = EXCLUDED.sort,
    status = 'ENABLE'::"RbacStatus",
    updated_by = 'open_source_seed',
    updated_at = now(),
    deleted_at = null;

-- 3. RBAC 权限。
-- kind=MENU 的权限可以点亮菜单，kind=ACTION 的权限用于按钮、接口、关系写入或运维动作。
WITH permission_seed(code, name, description, kind, sort, group_code) AS (
    VALUES
        ('system.home.menu', '系统管理目录', '允许显示 app-api 系统管理根目录', 'MENU', 1, 'system.home'),
        ('system.user.view', '用户查看', '允许查看 app-api 用户列表和用户关系', 'MENU', 10, 'system.user'),
        ('system.user.detail', '用户详情', '允许查看 app-api 用户详情', 'MENU', 11, 'system.user'),
        ('system.user.create', '用户创建', '允许创建 app-api 用户', 'ACTION', 12, 'system.user'),
        ('system.user.update', '用户更新', '允许更新 app-api 用户', 'ACTION', 13, 'system.user'),
        ('system.user.delete', '用户删除', '允许删除 app-api 用户', 'ACTION', 14, 'system.user'),
        ('system.user.reset-password', '用户重置密码', '允许重置 app-api 用户密码', 'ACTION', 15, 'system.user'),
        ('system.user.session.view', '用户会话查看', '允许查看 app-api 用户会话', 'ACTION', 16, 'system.user'),
        ('system.user.session.revoke', '用户会话撤销', '允许撤销 app-api 用户会话', 'ACTION', 17, 'system.user'),
        ('system.user.impersonate', '用户伪装登录', '允许创建目标 app-api 用户的 Better Auth 伪装会话', 'ACTION', 18, 'system.user'),
        ('system.role.view', '角色查看', '允许查看 app-api 角色', 'MENU', 20, 'system.role'),
        ('system.role.create', '角色创建', '允许创建 app-api 角色', 'ACTION', 21, 'system.role'),
        ('system.role.update', '角色更新', '允许更新 app-api 角色', 'ACTION', 22, 'system.role'),
        ('system.role.delete', '角色删除', '允许删除 app-api 角色', 'ACTION', 23, 'system.role'),
        ('system.role.assign-user', '角色分配用户', '允许维护 app-api 角色直接用户', 'ACTION', 24, 'system.role'),
        ('system.role.assign-user-group', '角色分配用户组', '允许维护 app-api 角色用户组', 'ACTION', 25, 'system.role'),
        ('system.role.assign-task-capability', '角色分配任务能力', '允许维护 app-api 角色任务能力关系', 'ACTION', 26, 'system.role'),
        ('system.role.assign-task-resource', '角色分配任务资源', '允许维护 app-api 角色任务资源关系', 'ACTION', 27, 'system.role'),
        ('system.user-group.view', '用户组查看', '允许查看 app-api 用户组', 'MENU', 30, 'system.user-group'),
        ('system.user-group.create', '用户组创建', '允许创建 app-api 用户组', 'ACTION', 31, 'system.user-group'),
        ('system.user-group.update', '用户组更新', '允许更新 app-api 用户组', 'ACTION', 32, 'system.user-group'),
        ('system.user-group.delete', '用户组删除', '允许删除 app-api 用户组', 'ACTION', 33, 'system.user-group'),
        ('system.user-group.assign-member', '用户组分配成员', '允许维护 app-api 用户组成员', 'ACTION', 34, 'system.user-group'),
        ('system.user-group.assign-role', '用户组分配角色', '允许维护 app-api 用户组角色', 'ACTION', 35, 'system.user-group'),
        ('system.menu.view', '菜单查看', '允许查看 app-api 菜单', 'MENU', 40, 'system.menu'),
        ('system.menu.create', '菜单创建', '允许创建 app-api 菜单', 'ACTION', 41, 'system.menu'),
        ('system.menu.update', '菜单更新', '允许更新 app-api 菜单', 'ACTION', 42, 'system.menu'),
        ('system.menu.delete', '菜单删除', '允许删除 app-api 菜单', 'ACTION', 43, 'system.menu'),
        ('system.menu.assign-role', '菜单分配角色', '允许维护 app-api 菜单角色关系', 'ACTION', 44, 'system.menu'),
        ('system.permission.view', '关系权限查看', '允许查看 app-api 关系权限管理页', 'MENU', 50, 'system.permission'),
        ('system.permission.update', '关系权限更新', '允许维护 app-api 关系权限配置', 'ACTION', 51, 'system.permission'),
        ('system.dict.view', '字典查看', '允许查看 app-api 字典管理', 'MENU', 60, 'system.dict'),
        ('system.dict.create', '字典创建', '允许创建 app-api 字典和字典项', 'ACTION', 61, 'system.dict'),
        ('system.dict.update', '字典更新', '允许更新 app-api 字典和字典项', 'ACTION', 62, 'system.dict'),
        ('system.dict.delete', '字典删除', '允许删除 app-api 字典和字典项', 'ACTION', 63, 'system.dict'),
        ('system.dict-item.create', '字典项创建', '允许创建 app-api 字典项', 'ACTION', 64, 'system.dict'),
        ('system.dict-item.update', '字典项更新', '允许更新 app-api 字典项', 'ACTION', 65, 'system.dict'),
        ('system.dict-item.delete', '字典项删除', '允许删除 app-api 字典项', 'ACTION', 66, 'system.dict'),
        ('system.task.view', '任务查看', '允许访问 app-api 任务管理入口', 'MENU', 70, 'system.task'),
        ('system.spicedb.menu', 'SpiceDB 目录', '允许显示 app-api SpiceDB 关系授权工具目录', 'MENU', 79, 'system.spicedb'),
        ('system.spicedb.view', 'SpiceDB 查看', '允许查看 app-api SpiceDB 关系工具页', 'MENU', 80, 'system.spicedb'),
        ('system.spicedb.publish-schema', 'SpiceDB 发布 Schema', '允许发布 app-api SpiceDB schema', 'ACTION', 81, 'system.spicedb'),
        ('system.spicedb.reconcile-projection', 'SpiceDB 投影对账', '允许执行 app-api SpiceDB 投影对账', 'ACTION', 82, 'system.spicedb'),
        ('system.spicedb.create-relationship', 'SpiceDB 创建关系', '允许创建 app-api SpiceDB 关系', 'ACTION', 83, 'system.spicedb'),
        ('system.spicedb.delete-relationship', 'SpiceDB 删除关系', '允许删除 app-api SpiceDB 关系', 'ACTION', 84, 'system.spicedb'),
        ('system.spicedb.bulk-relationship', 'SpiceDB 批量关系', '允许批量维护 app-api SpiceDB 关系', 'ACTION', 85, 'system.spicedb'),
        ('system.spicedb.check-permission', 'SpiceDB 检查权限', '允许执行 app-api SpiceDB 权限检查', 'ACTION', 86, 'system.spicedb'),
        ('system.spicedb.batch-check-permission', 'SpiceDB 批量检查权限', '允许执行 app-api SpiceDB 批量权限检查', 'ACTION', 87, 'system.spicedb'),
        ('system.spicedb.explain-permission', 'SpiceDB 解释权限', '允许执行 app-api SpiceDB 权限解释', 'ACTION', 88, 'system.spicedb'),
        ('system.spicedb.replay-watch', 'SpiceDB 回放 Watch', '允许回放 app-api SpiceDB Watch 事件', 'ACTION', 89, 'system.spicedb'),
        ('system.spicedb.handle-watch', 'SpiceDB 处理 Watch', '允许人工处理 app-api SpiceDB Watch 事件', 'ACTION', 90, 'system.spicedb'),
        ('system.rbac.view', 'RBAC 管理入口', '允许访问 app-api RBAC 管理父菜单', 'MENU', 1000, 'system.rbac'),
        ('system.rbac.user.view', 'RBAC 用户查看', '允许查看 app-api RBAC 用户关系', 'MENU', 1010, 'system.rbac.user'),
        ('rbac.user.assign_role', 'RBAC 用户分配角色', '允许在 app-api RBAC 中为用户分配角色', 'ACTION', 1011, 'system.rbac.user'),
        ('rbac.user.assign_user_group', 'RBAC 用户分配用户组', '允许在 app-api RBAC 中为用户分配用户组', 'ACTION', 1012, 'system.rbac.user'),
        ('system.rbac.role.view', 'RBAC 角色查看', '允许查看 app-api RBAC 角色', 'MENU', 1020, 'system.rbac.role'),
        ('rbac.role.create', 'RBAC 角色创建', '允许创建 app-api RBAC 角色', 'ACTION', 1021, 'system.rbac.role'),
        ('rbac.role.update', 'RBAC 角色更新', '允许更新 app-api RBAC 角色', 'ACTION', 1022, 'system.rbac.role'),
        ('rbac.role.delete', 'RBAC 角色删除', '允许删除 app-api RBAC 角色', 'ACTION', 1023, 'system.rbac.role'),
        ('rbac.role.assign_user', 'RBAC 角色分配用户', '允许维护 app-api RBAC 角色的直接用户', 'ACTION', 1024, 'system.rbac.role'),
        ('rbac.role.assign_user_group', 'RBAC 角色分配用户组', '允许维护 app-api RBAC 角色的用户组', 'ACTION', 1025, 'system.rbac.role'),
        ('rbac.role.assign_parent_role', 'RBAC 角色继承', '允许维护 app-api RBAC 角色继承关系', 'ACTION', 1026, 'system.rbac.role'),
        ('rbac.role.assign_permission', 'RBAC 角色授权', '允许维护 app-api RBAC 角色权限', 'ACTION', 1027, 'system.rbac.role'),
        ('system.rbac.user-group.view', 'RBAC 用户组查看', '允许查看 app-api RBAC 用户组', 'MENU', 1030, 'system.rbac.user-group'),
        ('rbac.user_group.create', 'RBAC 用户组创建', '允许创建 app-api RBAC 用户组', 'ACTION', 1031, 'system.rbac.user-group'),
        ('rbac.user_group.update', 'RBAC 用户组更新', '允许更新 app-api RBAC 用户组', 'ACTION', 1032, 'system.rbac.user-group'),
        ('rbac.user_group.delete', 'RBAC 用户组删除', '允许删除 app-api RBAC 用户组', 'ACTION', 1033, 'system.rbac.user-group'),
        ('rbac.user_group.assign_member', 'RBAC 用户组成员分配', '允许维护 app-api RBAC 用户组成员', 'ACTION', 1034, 'system.rbac.user-group'),
        ('rbac.user_group.assign_role', 'RBAC 用户组角色分配', '允许维护 app-api RBAC 用户组角色', 'ACTION', 1035, 'system.rbac.user-group'),
        ('system.rbac.permission.view', 'RBAC 权限查看', '允许查看 app-api RBAC 权限', 'MENU', 1040, 'system.rbac.permission'),
        ('rbac.permission.create', 'RBAC 权限创建', '允许创建 app-api RBAC 权限', 'ACTION', 1041, 'system.rbac.permission'),
        ('rbac.permission.update', 'RBAC 权限更新', '允许更新 app-api RBAC 权限', 'ACTION', 1042, 'system.rbac.permission'),
        ('rbac.permission.delete', 'RBAC 权限删除', '允许删除 app-api RBAC 权限', 'ACTION', 1043, 'system.rbac.permission'),
        ('system.rbac.menu-binding.view', 'RBAC 菜单查看', '允许查看 app-api RBAC 菜单声明', 'MENU', 1050, 'system.rbac.menu'),
        ('rbac.menu.create', 'RBAC 菜单创建', '允许创建 app-api RBAC 自有菜单', 'ACTION', 1052, 'system.rbac.menu'),
        ('rbac.menu.update', 'RBAC 菜单更新', '允许更新 app-api RBAC 自有菜单元数据', 'ACTION', 1053, 'system.rbac.menu'),
        ('rbac.menu.delete', 'RBAC 菜单删除', '允许删除 app-api RBAC 自有菜单', 'ACTION', 1054, 'system.rbac.menu'),
        ('system.rbac.effective.view', 'RBAC Effective 查看', '允许查看 app-api RBAC effective 读模型', 'MENU', 1060, 'system.rbac.effective'),
        ('rbac.effective.rebuild', 'RBAC Effective 重建', '允许预览和应用 app-api RBAC effective 重建', 'ACTION', 1061, 'system.rbac.effective')
)
INSERT INTO rbac_permission (
    code,
    name,
    description,
    kind,
    group_id,
    sort,
    is_builtin,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    seed.code,
    seed.name,
    seed.description,
    seed.kind::"RbacPermissionKind",
    permission_group.id,
    seed.sort,
    true,
    'ENABLE'::"RbacStatus",
    'open_source_seed',
    'open_source_seed',
    now(),
    now(),
    null
FROM permission_seed seed
LEFT JOIN rbac_permission_group permission_group ON permission_group.code = seed.group_code
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    kind = EXCLUDED.kind,
    group_id = EXCLUDED.group_id,
    sort = EXCLUDED.sort,
    is_builtin = true,
    status = 'ENABLE'::"RbacStatus",
    updated_by = 'open_source_seed',
    updated_at = now(),
    deleted_at = null;

-- 4. 角色、用户组和授权关系。
-- 管理员账号通过 admin_group 获得 rbac_super_admin；demo 账号通过 demo_group 获得只读演示角色。
INSERT INTO rbac_role (
    code,
    name,
    description,
    sort,
    is_builtin,
    is_super_admin,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at
)
VALUES
    ('rbac_super_admin', 'RBAC 超级管理员', 'app-api 开源版内置超级管理员角色', 0, true, true, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null),
    ('rbac_demo_viewer', 'RBAC 演示只读用户', 'app-api 开源版内置只读演示角色', 100, true, false, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort = EXCLUDED.sort,
    is_builtin = true,
    is_super_admin = EXCLUDED.is_super_admin,
    status = 'ENABLE'::"RbacStatus",
    updated_by = 'open_source_seed',
    updated_at = now(),
    deleted_at = null;

INSERT INTO rbac_user_group (
    code,
    name,
    description,
    sort,
    status,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at
)
VALUES
    ('admin_group', '管理员用户组', '开源版内置管理员用户组，默认拥有 app-api 超级管理员角色', 0, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null),
    ('demo_group', '演示用户组', '开源版内置演示用户组，默认拥有 app-api 只读演示角色', 100, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort = EXCLUDED.sort,
    status = 'ENABLE'::"RbacStatus",
    updated_by = 'open_source_seed',
    updated_at = now(),
    deleted_at = null;

WITH binding_seed(group_code, role_code) AS (
    VALUES
        ('admin_group', 'rbac_super_admin'),
        ('demo_group', 'rbac_demo_viewer')
)
INSERT INTO rbac_user_group_role (group_id, role_id, created_by, created_at)
SELECT user_group.id, role.id, 'open_source_seed', now()
FROM binding_seed seed
JOIN rbac_user_group user_group ON user_group.code = seed.group_code
JOIN rbac_role role ON role.code = seed.role_code
ON CONFLICT (group_id, role_id) DO NOTHING;

WITH member_seed(username, group_code) AS (
    VALUES
        ('admin', 'admin_group'),
        ('demo', 'demo_group')
)
INSERT INTO rbac_user_group_member (user_id, group_id, created_by, created_at)
SELECT auth_user.id, user_group.id, 'open_source_seed', now()
FROM member_seed seed
JOIN better_auth_user auth_user ON auth_user.username = seed.username
JOIN rbac_user_group user_group ON user_group.code = seed.group_code
ON CONFLICT (user_id, group_id) DO NOTHING;

WITH super_role AS (
    SELECT id FROM rbac_role WHERE code = 'rbac_super_admin'
)
INSERT INTO rbac_role_permission (role_id, permission_id, created_by, created_at)
SELECT super_role.id, permission.id, 'open_source_seed', now()
FROM super_role
CROSS JOIN rbac_permission permission
WHERE permission.status = 'ENABLE'::"RbacStatus"
  AND permission.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH demo_role AS (
    SELECT id FROM rbac_role WHERE code = 'rbac_demo_viewer'
),
readonly_code(code) AS (
    VALUES
        ('system.home.menu'),
        ('system.user.view'),
        ('system.user.detail'),
        ('system.user.session.view'),
        ('system.role.view'),
        ('system.user-group.view'),
        ('system.menu.view'),
        ('system.permission.view'),
        ('system.dict.view'),
        ('system.task.view'),
        ('system.spicedb.menu'),
        ('system.spicedb.view'),
        ('system.spicedb.check-permission'),
        ('system.spicedb.batch-check-permission'),
        ('system.spicedb.explain-permission'),
        ('system.rbac.view'),
        ('system.rbac.user.view'),
        ('system.rbac.role.view'),
        ('system.rbac.user-group.view'),
        ('system.rbac.permission.view'),
        ('system.rbac.menu-binding.view'),
        ('system.rbac.effective.view')
),
readonly_permission AS (
    SELECT permission.id
    FROM readonly_code code
    JOIN rbac_permission permission ON permission.code = code.code
)
INSERT INTO rbac_role_permission (role_id, permission_id, created_by, created_at)
SELECT demo_role.id, readonly_permission.id, 'open_source_seed', now()
FROM demo_role
CROSS JOIN readonly_permission
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. 菜单。先 upsert 菜单自身，再按 required_permission_code 回填 pid。
-- component_path 是前端路由组件路径，不是文件系统绝对路径；目录类菜单没有组件，所以为 null。
WITH menu_seed(code, parent_code, title, path, component_path, type, icon, sort, is_menu_visible, status) AS (
    VALUES
        ('system.home.menu', null, '系统管理', 'system', null, 'Catalog', 'icon-park-outline:setting-two', 10, true, 'ENABLE'),
        ('system.user.view', 'system.home.menu', '系统用户', 'user', 'system/user/User', 'Page', 'icon-park-outline:user', 10, true, 'ENABLE'),
        ('system.role.view', 'system.home.menu', '系统角色', 'role', 'system/role/Role', 'Page', 'icon-park-outline:people', 20, true, 'ENABLE'),
        ('system.user-group.view', 'system.home.menu', '系统用户组', 'user-group', 'system/user-group/UserGroup', 'Page', 'icon-park-outline:every-user', 30, true, 'ENABLE'),
        ('system.menu.view', 'system.home.menu', '系统菜单', 'menu', 'system/menu/Menu', 'Page', 'icon-park-outline:tree-list', 40, true, 'ENABLE'),
        ('system.permission.view', 'system.home.menu', '关系权限管理', 'permission', 'system/permission/Permission', 'Page', 'icon-park-outline:key', 50, true, 'ENABLE'),
        ('system.dict.view', 'system.home.menu', '字典管理', 'dict', 'system/dict/Dict', 'Page', 'icon-park-outline:book-open', 60, true, 'ENABLE'),
        ('system.task.view', 'system.home.menu', '任务管理', 'task', 'system/task/Task', 'Page', 'icon-park-outline:schedule', 70, true, 'ENABLE'),
        ('system.spicedb.menu', 'system.home.menu', 'SpiceDB', 'spicedb', null, 'Catalog', 'icon-park-outline:database-network', 80, true, 'ENABLE'),
        ('system.spicedb.view', 'system.spicedb.menu', 'SpiceDB 数据管理', 'data', 'system/spicedb-data/SpiceDBData', 'Page', 'icon-park-outline:database-code', 10, true, 'ENABLE'),
        ('system.rbac.view', 'system.home.menu', 'RBAC', 'rbac', null, 'Catalog', 'icon-park-outline:permissions', 90, true, 'ENABLE'),
        ('system.rbac.user.view', 'system.rbac.view', 'RBAC 用户', 'rbac-user', 'system/rbac/user/User', 'Page', 'icon-park-outline:user', 10, true, 'ENABLE'),
        ('system.rbac.role.view', 'system.rbac.view', 'RBAC 角色', 'rbac-role', 'system/rbac/role/Role', 'Page', 'icon-park-outline:people', 20, true, 'ENABLE'),
        ('system.rbac.user-group.view', 'system.rbac.view', 'RBAC 用户组', 'rbac-user-group', 'system/rbac/user-group/UserGroup', 'Page', 'icon-park-outline:every-user', 30, true, 'ENABLE'),
        ('system.rbac.permission.view', 'system.rbac.view', 'RBAC 权限', 'rbac-permission', 'system/rbac/permission/Permission', 'Page', 'icon-park-outline:key', 40, true, 'ENABLE'),
        ('system.rbac.menu-binding.view', 'system.rbac.view', 'RBAC 菜单', 'rbac-menu-binding', 'system/rbac/menu-binding/MenuBinding', 'Page', 'icon-park-outline:tree-list', 50, true, 'ENABLE'),
        ('system.rbac.effective.view', 'system.rbac.view', 'Effective 读模型', 'rbac-effective', 'system/rbac/effective/Effective', 'Page', 'icon-park-outline:graph-bar', 60, true, 'ENABLE')
)
INSERT INTO rbac_menu (
    pid,
    description,
    title,
    component_path,
    type,
    group_id,
    path,
    icon,
    "order",
    layout,
    page_type,
    is_resident,
    is_cache,
    is_menu_visible,
    status,
    show_children,
    required_permission_code,
    component_name,
    is_tab_visible,
    created_by,
    updated_by,
    created_at,
    updated_at
)
SELECT
    null,
    '开源版 app-api 初始化菜单：' || seed.title,
    seed.title,
    seed.component_path,
    seed.type::"MenuTypeEnum",
    permission.group_id,
    seed.path,
    seed.icon,
    seed.sort,
    'LAYOUT_SIDE'::"MenuLayoutTypeEnum",
    'PAGE'::"PageTypeEnum",
    false,
    false,
    seed.is_menu_visible,
    seed.status::"MenuStatusEnum",
    true,
    seed.code,
    seed.code,
    true,
    'open_source_seed',
    'open_source_seed',
    now(),
    now()
FROM menu_seed seed
JOIN rbac_permission permission ON permission.code = seed.code
ON CONFLICT (required_permission_code) DO UPDATE SET
    description = EXCLUDED.description,
    title = EXCLUDED.title,
    component_path = EXCLUDED.component_path,
    type = EXCLUDED.type,
    group_id = EXCLUDED.group_id,
    path = EXCLUDED.path,
    icon = EXCLUDED.icon,
    "order" = EXCLUDED."order",
    layout = EXCLUDED.layout,
    page_type = EXCLUDED.page_type,
    is_resident = EXCLUDED.is_resident,
    is_cache = EXCLUDED.is_cache,
    is_menu_visible = EXCLUDED.is_menu_visible,
    status = EXCLUDED.status,
    show_children = EXCLUDED.show_children,
    component_name = EXCLUDED.component_name,
    is_tab_visible = EXCLUDED.is_tab_visible,
    updated_by = 'open_source_seed',
    updated_at = now();

WITH menu_seed(code, parent_code) AS (
    VALUES
        ('system.home.menu', null),
        ('system.user.view', 'system.home.menu'),
        ('system.role.view', 'system.home.menu'),
        ('system.user-group.view', 'system.home.menu'),
        ('system.menu.view', 'system.home.menu'),
        ('system.permission.view', 'system.home.menu'),
        ('system.dict.view', 'system.home.menu'),
        ('system.task.view', 'system.home.menu'),
        ('system.spicedb.menu', 'system.home.menu'),
        ('system.spicedb.view', 'system.spicedb.menu'),
        ('system.rbac.view', 'system.home.menu'),
        ('system.rbac.user.view', 'system.rbac.view'),
        ('system.rbac.role.view', 'system.rbac.view'),
        ('system.rbac.user-group.view', 'system.rbac.view'),
        ('system.rbac.permission.view', 'system.rbac.view'),
        ('system.rbac.menu-binding.view', 'system.rbac.view'),
        ('system.rbac.effective.view', 'system.rbac.view')
)
UPDATE rbac_menu child
SET pid = parent.id,
    updated_at = now()
FROM menu_seed seed
LEFT JOIN rbac_menu parent ON parent.required_permission_code = seed.parent_code
WHERE child.required_permission_code = seed.code
  AND child.pid IS DISTINCT FROM parent.id;

-- 6. RBAC effective 读模型。
-- 这里把初始账号的有效角色、有效权限、可见菜单直接算好，首次启动后菜单无需等待异步重建。
WITH seeded_users AS (
    SELECT id, username
    FROM better_auth_user
    WHERE username IN ('admin', 'demo')
)
DELETE FROM rbac_effective_user_role effective_role
USING seeded_users seed
WHERE effective_role.user_id = seed.id;

WITH seeded_users AS (
    SELECT id, username
    FROM better_auth_user
    WHERE username IN ('admin', 'demo')
)
DELETE FROM rbac_effective_user_permission effective_permission
USING seeded_users seed
WHERE effective_permission.user_id = seed.id;

WITH seeded_users AS (
    SELECT id, username
    FROM better_auth_user
    WHERE username IN ('admin', 'demo')
)
DELETE FROM rbac_user_visible_menu visible_menu
USING seeded_users seed
WHERE visible_menu.user_id = seed.id;

WITH effective_role_seed(username, role_code) AS (
    VALUES
        ('admin', 'rbac_super_admin'),
        ('demo', 'rbac_demo_viewer')
)
INSERT INTO rbac_effective_user_role (user_id, role_id, version, updated_at)
SELECT auth_user.id, role.id, 'open-source-app-seed-v1', now()
FROM effective_role_seed seed
JOIN better_auth_user auth_user ON auth_user.username = seed.username
JOIN rbac_role role ON role.code = seed.role_code
ON CONFLICT (user_id, role_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

WITH role_by_user AS (
    SELECT auth_user.id AS user_id, role.id AS role_id
    FROM better_auth_user auth_user
    JOIN rbac_role role ON (
        (auth_user.username = 'admin' AND role.code = 'rbac_super_admin')
        OR (auth_user.username = 'demo' AND role.code = 'rbac_demo_viewer')
    )
    WHERE auth_user.username IN ('admin', 'demo')
)
INSERT INTO rbac_effective_user_permission (user_id, permission_id, version, updated_at)
SELECT role_by_user.user_id, role_permission.permission_id, 'open-source-app-seed-v1', now()
FROM role_by_user
JOIN rbac_role_permission role_permission ON role_permission.role_id = role_by_user.role_id
ON CONFLICT (user_id, permission_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

WITH admin_user AS (
    SELECT id AS user_id FROM better_auth_user WHERE username = 'admin'
)
INSERT INTO rbac_user_visible_menu (user_id, menu_id, version, updated_at)
SELECT admin_user.user_id, menu.id, 'open-source-app-seed-v1', now()
FROM admin_user
JOIN rbac_menu menu ON menu.status = 'ENABLE'::"MenuStatusEnum"
ON CONFLICT (user_id, menu_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

WITH RECURSIVE demo_user AS (
    SELECT id AS user_id FROM better_auth_user WHERE username = 'demo'
),
demo_permission_code AS (
    SELECT permission.code
    FROM demo_user
    JOIN rbac_effective_user_permission effective_permission ON effective_permission.user_id = demo_user.user_id
    JOIN rbac_permission permission ON permission.id = effective_permission.permission_id
),
direct_menu AS (
    SELECT menu.id, menu.pid
    FROM rbac_menu menu
    JOIN demo_permission_code permission_code ON permission_code.code = menu.required_permission_code
    WHERE menu.status = 'ENABLE'::"MenuStatusEnum"
),
visible_menu AS (
    SELECT id, pid FROM direct_menu
    UNION
    SELECT parent.id, parent.pid
    FROM rbac_menu parent
    JOIN visible_menu child ON child.pid = parent.id
    WHERE parent.status = 'ENABLE'::"MenuStatusEnum"
)
INSERT INTO rbac_user_visible_menu (user_id, menu_id, version, updated_at)
SELECT demo_user.user_id, visible_menu.id, 'open-source-app-seed-v1', now()
FROM demo_user
CROSS JOIN visible_menu
ON CONFLICT (user_id, menu_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

INSERT INTO state_version (name, type, version, created_at, updated_at)
VALUES ('app_api_global', 'menu'::"StateVersionType", 'open-source-app-seed-v1', now(), now())
ON CONFLICT (type, name) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

-- 7. app-api 关系授权元数据、字典和任务演示数据。
-- authz_resource_metadata 让关系权限页打开后能看到常见资源类型的初始说明。
INSERT INTO authz_resource_metadata (resource_type, display_name, authorization_enabled, created_at, updated_at)
VALUES
    ('task', '任务', true, now(), now()),
    ('task_manager', '任务管理器', true, now(), now()),
    ('admin_user', '后台用户', true, now(), now()),
    ('role', '角色', true, now(), now()),
    ('menu', '菜单', true, now(), now()),
    ('user_group', '用户组', true, now(), now())
ON CONFLICT (resource_type) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    authorization_enabled = EXCLUDED.authorization_enabled,
    updated_at = now();

INSERT INTO dict_category (name, created_at, updated_at)
VALUES
    ('system_status', now(), now()),
    ('app_user_level', now(), now())
ON CONFLICT (name) DO UPDATE SET
    updated_at = now();

INSERT INTO dict (category, name, value, description, status, sort_order, created_at, updated_at)
VALUES
    ('system_status', '启用状态', 'enabled', '开源版 app-api 演示字典：启用状态集合', 1, 10, now(), now()),
    ('app_user_level', '应用用户等级', 'level', '开源版 app-api 演示字典：用户等级集合', 1, 20, now(), now())
ON CONFLICT (category, value) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

WITH key_seed(category, dict_value, key, value, description, sort_order) AS (
    VALUES
        ('system_status', 'enabled', 'ENABLE', '启用', '可参与运行和授权计算', 10),
        ('system_status', 'enabled', 'DISABLE', '禁用', '保留数据但不参与运行', 20),
        ('app_user_level', 'level', 'demo', '演示用户', '普通演示账号等级', 10),
        ('app_user_level', 'level', 'admin', '管理员用户', '管理员演示账号等级', 20)
)
INSERT INTO dict_key (dict_id, key, value, description, status, sort_order, created_at, updated_at)
SELECT dict.id, seed.key, seed.value, seed.description, 1, seed.sort_order, now(), now()
FROM key_seed seed
JOIN dict ON dict.category = seed.category AND dict.value = seed.dict_value
ON CONFLICT (dict_id, key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

WITH admin_user AS (
    SELECT id AS user_id FROM better_auth_user WHERE username = 'admin'
)
INSERT INTO task (
    user_id,
    name,
    remark,
    cron,
    options,
    params,
    handler,
    strategy,
    status,
    last_status,
    last_message,
    last_started_at,
    last_finished_at,
    last_duration_ms,
    created_at,
    updated_at
)
SELECT
    admin_user.user_id,
    'open-source-app-demo-task',
    '开源版 app-api 演示任务，默认禁用，仅用于展示任务管理页面数据',
    '0 30 * * *',
    '{"source":"open-source-seed","service":"app-api"}'::jsonb,
    '{"demo":true,"scope":"app"}'::jsonb,
    'demo.noop',
    'MANUAL'::"TaskStrategy",
    'DISABLE'::"TaskStatus",
    'SUCCESS'::"TaskLogStatus",
    '开源版 app-api 演示任务初始化完成',
    now(),
    now(),
    15,
    now(),
    now()
FROM admin_user
ON CONFLICT (name) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    remark = EXCLUDED.remark,
    cron = EXCLUDED.cron,
    options = EXCLUDED.options,
    params = EXCLUDED.params,
    handler = EXCLUDED.handler,
    strategy = EXCLUDED.strategy,
    status = EXCLUDED.status,
    last_status = EXCLUDED.last_status,
    last_message = EXCLUDED.last_message,
    last_started_at = EXCLUDED.last_started_at,
    last_finished_at = EXCLUDED.last_finished_at,
    last_duration_ms = EXCLUDED.last_duration_ms,
    updated_at = now();

DELETE FROM task_log
WHERE task_id IN (SELECT id FROM task WHERE name = 'open-source-app-demo-task');

INSERT INTO task_log (task_id, log, status, triggered_by, actor_id, error, started_at, finished_at, duration_ms, created_at)
SELECT
    task.id,
    '开源版 app-api 演示任务日志',
    'SUCCESS'::"TaskLogStatus",
    'SEED',
    auth_user.id,
    null,
    now(),
    now(),
    15,
    now()
FROM task
JOIN better_auth_user auth_user ON auth_user.username = 'admin'
WHERE task.name = 'open-source-app-demo-task';

COMMIT;
