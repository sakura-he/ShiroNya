-- Shiro Nya 开源版 admin-api 初始化数据。
-- 本文件只填充数据，不创建表、不修改表结构；请先由 Prisma 完成 schema 同步。

BEGIN;

-- 1. Better Auth 后台账号。
-- 密码明文仅写在 README 里，数据库中保存 better-auth/crypto 生成的哈希值。
WITH user_seed(id, username, email, name, role, password_hash, remark) AS (
    VALUES
        (
            'admin_open_source',
            'admin',
            'admin@shiro-nya.local',
            'Admin',
            'admin',
            '9d7638abfa01df5f4136bf93750edfe0:8c92ae733d9f37ce054fbd830014ba5322f0fc554ac6dc9c6f2bc88b0105bb614f136f36aa971c7c8cb156676bb382a77ae4b475452ca9a3ad2a45d770d552b2',
            '开源版内置管理员账号'
        ),
        (
            'demo_open_source',
            'demo',
            'demo@shiro-nya.local',
            'Demo 用户',
            'user',
            'eb1087482779a60f6d5881bf0f296b7b:1580c463a0b2d32a0737f11618f9be490a60a871c29e1b3ae345384885727fbfff96f47600ec3157ea43701d42277dbb913ad2024833acc2dc3d0097a5b7b3f8',
            '开源版内置演示用户'
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
    "createdAt",
    "updatedAt",
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
    now(),
    now(),
    seed.username,
    seed.name
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
    "updatedAt" = now(),
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

WITH user_seed(username, remark) AS (
    VALUES
        ('admin', '开源版内置管理员资料'),
        ('demo', '开源版内置演示用户资料')
)
INSERT INTO better_auth_user_profile (user_id, remark, created_by)
SELECT auth_user.id, seed.remark, 'open_source_seed'
FROM user_seed seed
JOIN better_auth_user auth_user ON auth_user.username = seed.username
ON CONFLICT (user_id) DO UPDATE SET
    remark = EXCLUDED.remark,
    created_by = EXCLUDED.created_by;

-- 2. RBAC 权限分组。
WITH group_seed(code, name, description, sort) AS (
    VALUES
        ('dashboard', '仪表盘', '后台首页和数据看板菜单权限', 1),
        ('app.management', 'App 管理', 'App 管理目录和 app 侧业务管理权限', 5),
        ('system.user', '系统用户', '后台用户、用户详情、密码和会话管理权限', 10),
        ('system.role', '系统角色', '系统角色管理和关系授权动作权限', 20),
        ('system.user-group', '系统用户组', '系统用户组管理和成员授权动作权限', 30),
        ('system.menu', '系统菜单', '系统菜单元数据管理权限', 40),
        ('system.permission', '关系权限', 'SpiceDB 关系权限管理入口权限', 50),
        ('system.dict', '系统字典', '字典和字典项管理权限', 60),
        ('system.task', '系统任务', '任务管理入口权限', 70),
        ('system.monitor', '系统监控', '系统运行状态和 Redis 监控权限', 75),
        ('system.admin-preference', '后台偏好', '后台界面偏好策略权限', 76),
        ('app.user', '应用用户', '通过 admin-api 控制面管理 app-api 业务用户', 80),
        ('app.rbac', '应用 RBAC', '通过 admin-api 控制面管理 app-api RBAC 权限', 90),
        ('app.abac', '应用 ABAC', '通过 admin-api 控制面管理 app-api ABAC 权限策略', 100),
        ('system.spicedb', 'SpiceDB 关系授权', 'SpiceDB 数据页、关系调试和运维动作权限', 110),
        ('system.abac', '系统 ABAC', 'admin-api Cerbos ABAC 权限策略', 120),
        ('system.rbac', 'RBAC 管理入口', 'RBAC 管理目录入口权限', 1000),
        ('system.rbac.user', 'RBAC 用户', 'RBAC 用户角色和用户组关系权限', 1010),
        ('system.rbac.role', 'RBAC 角色', 'RBAC 角色、继承关系和角色授权权限', 1020),
        ('system.rbac.user-group', 'RBAC 用户组', 'RBAC 用户组成员和角色关系权限', 1030),
        ('system.rbac.permission', 'RBAC 权限', 'RBAC 权限声明、数据库权限和分组管理权限', 1040),
        ('system.rbac.menu', 'RBAC 菜单', 'RBAC 菜单元数据和所需权限声明权限', 1050),
        ('system.rbac.effective', 'RBAC Effective', 'RBAC effective 读模型查看和重建权限', 1060),
        ('system.rbac.test', 'RBAC 测试台', 'RBAC 测试台页面和测试接口权限', 1090)
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
-- 非菜单入口统一按 ACTION 写入；页面/目录权限由 menu_code_seed 标记为 MENU。
WITH permission_code_seed(code) AS (
    VALUES
        ('dashboard.home.menu'),
        ('dashboard.workplace.view'),
        ('dashboard.monitor.view'),
        ('system.home.menu'),
        ('app.home.menu'),
        ('system.user.view'),
        ('system.user.detail'),
        ('system.user.create'),
        ('system.user.update'),
        ('system.user.delete'),
        ('system.user.reset-password'),
        ('system.user.session.view'),
        ('system.user.session.revoke'),
        ('system.user.impersonate'),
        ('system.admin-preference.view'),
        ('system.admin-preference.manage'),
        ('app.user.view'),
        ('app.user.detail'),
        ('app.user.create'),
        ('app.user.update'),
        ('app.user.status.update'),
        ('app.user.soft-delete'),
        ('app.user.delete'),
        ('app.user.password.reset'),
        ('app.rbac.role.view'),
        ('app.rbac.role.create'),
        ('app.rbac.role.update'),
        ('app.rbac.role.delete'),
        ('app.rbac.role.assign-user'),
        ('app.rbac.role.assign-user-group'),
        ('app.rbac.role.assign-parent-role'),
        ('app.rbac.role.assign-permission'),
        ('app.rbac.user-group.view'),
        ('app.rbac.user-group.create'),
        ('app.rbac.user-group.update'),
        ('app.rbac.user-group.delete'),
        ('app.rbac.user-group.assign-member'),
        ('app.rbac.user-group.assign-role'),
        ('app.rbac.permission.view'),
        ('app.rbac.permission.create'),
        ('app.rbac.permission.update'),
        ('app.rbac.permission.delete'),
        ('app.rbac.permission.assign-role'),
        ('app.rbac.permission-group.view'),
        ('app.rbac.permission-group.create'),
        ('app.rbac.permission-group.update'),
        ('app.rbac.permission-group.delete'),
        ('app.rbac.permission-group.assign'),
        ('app.rbac.menu.view'),
        ('app.rbac.menu.create'),
        ('app.rbac.menu.update'),
        ('app.rbac.menu.delete'),
        ('app.abac.page'),
        ('app.abac.field.read'),
        ('app.abac.field.write'),
        ('app.abac.policy-group.read'),
        ('app.abac.policy-group.write'),
        ('app.abac.manual-policy.read'),
        ('app.abac.manual-policy.write'),
        ('app.abac.preview'),
        ('app.abac.publish'),
        ('app.abac.runtime-test'),
        ('system.role.view'),
        ('system.role.create'),
        ('system.role.update'),
        ('system.role.delete'),
        ('system.role.assign-user'),
        ('system.role.assign-user-group'),
        ('system.role.assign-task-capability'),
        ('system.role.assign-task-resource'),
        ('system.user-group.view'),
        ('system.user-group.create'),
        ('system.user-group.update'),
        ('system.user-group.delete'),
        ('system.user-group.assign-member'),
        ('system.user-group.assign-role'),
        ('system.menu.view'),
        ('system.menu.create'),
        ('system.menu.update'),
        ('system.menu.delete'),
        ('system.menu.assign-role'),
        ('system.permission.view'),
        ('system.permission.update'),
        ('system.dict.view'),
        ('system.dict.create'),
        ('system.dict.update'),
        ('system.dict.delete'),
        ('system.dict-item.create'),
        ('system.dict-item.update'),
        ('system.dict-item.delete'),
        ('system.task.view'),
        ('system.monitor.menu'),
        ('system.monitor.status.view'),
        ('system.monitor.redis.view'),
        ('system.spicedb.menu'),
        ('system.spicedb.view'),
        ('system.spicedb.publish-schema'),
        ('system.spicedb.reconcile-projection'),
        ('system.spicedb.create-relationship'),
        ('system.spicedb.delete-relationship'),
        ('system.spicedb.bulk-relationship'),
        ('system.spicedb.check-permission'),
        ('system.spicedb.batch-check-permission'),
        ('system.spicedb.explain-permission'),
        ('system.spicedb.replay-watch'),
        ('system.spicedb.handle-watch'),
        ('system.abac.menu'),
        ('system.abac.page'),
        ('system.abac.field.read'),
        ('system.abac.field.write'),
        ('system.abac.policy-group.read'),
        ('system.abac.policy-group.write'),
        ('system.abac.manual-policy.read'),
        ('system.abac.manual-policy.write'),
        ('system.abac.preview'),
        ('system.abac.publish'),
        ('system.abac.runtime-test'),
        ('system.rbac.view'),
        ('system.rbac.user.view'),
        ('rbac.user.assign_role'),
        ('rbac.user.assign_user_group'),
        ('system.rbac.role.view'),
        ('rbac.role.create'),
        ('rbac.role.update'),
        ('rbac.role.delete'),
        ('rbac.role.assign_user'),
        ('rbac.role.assign_user_group'),
        ('rbac.role.assign_parent_role'),
        ('rbac.role.assign_permission'),
        ('system.rbac.user-group.view'),
        ('rbac.user_group.create'),
        ('rbac.user_group.update'),
        ('rbac.user_group.delete'),
        ('rbac.user_group.assign_member'),
        ('rbac.user_group.assign_role'),
        ('system.rbac.permission.view'),
        ('rbac.permission.create'),
        ('rbac.permission.update'),
        ('rbac.permission.delete'),
        ('system.rbac.menu-binding.view'),
        ('rbac.menu.create'),
        ('rbac.menu.update'),
        ('rbac.menu.delete'),
        ('system.rbac.effective.view'),
        ('rbac.effective.rebuild'),
        ('rbac.test.page'),
        ('rbac.test.view'),
        ('rbac.test.read'),
        ('rbac.test.create'),
        ('rbac.test.update'),
        ('rbac.test.delete'),
        ('rbac.test.manage'),
        ('rbac.test.profile'),
        ('rbac.test.approve'),
        ('rbac.test.publish')
),
numbered_permission_seed AS (
    SELECT code, row_number() OVER (ORDER BY code)::int AS sort
    FROM permission_code_seed
),
menu_code_seed(code) AS (
    VALUES
        ('dashboard.home.menu'),
        ('dashboard.workplace.view'),
        ('dashboard.monitor.view'),
        ('system.home.menu'),
        ('app.home.menu'),
        ('app.user.view'),
        ('app.abac.page'),
        ('app.abac.field.read'),
        ('app.abac.policy-group.read'),
        ('app.abac.manual-policy.read'),
        ('app.abac.preview'),
        ('app.abac.publish'),
        ('app.abac.runtime-test'),
        ('system.user.view'),
        ('system.role.view'),
        ('system.user-group.view'),
        ('system.menu.view'),
        ('system.permission.view'),
        ('system.dict.view'),
        ('system.task.view'),
        ('system.monitor.menu'),
        ('system.monitor.status.view'),
        ('system.monitor.redis.view'),
        ('system.spicedb.menu'),
        ('system.spicedb.view'),
        ('system.abac.menu'),
        ('system.abac.field.read'),
        ('system.abac.policy-group.read'),
        ('system.abac.manual-policy.read'),
        ('system.abac.preview'),
        ('system.abac.publish'),
        ('system.abac.runtime-test'),
        ('system.rbac.view'),
        ('system.rbac.user.view'),
        ('system.rbac.role.view'),
        ('system.rbac.user-group.view'),
        ('system.rbac.permission.view'),
        ('system.rbac.menu-binding.view'),
        ('system.rbac.effective.view'),
        ('rbac.test.page')
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
    seed.code,
    '开源版内置权限：' || seed.code,
    CASE
        WHEN EXISTS (SELECT 1 FROM menu_code_seed menu_code WHERE menu_code.code = seed.code)
            THEN 'MENU'::"RbacPermissionKind"
        ELSE 'ACTION'::"RbacPermissionKind"
    END,
    (
        SELECT id
        FROM rbac_permission_group
        WHERE code = CASE
            WHEN seed.code LIKE 'dashboard.%' THEN 'dashboard'
            WHEN seed.code LIKE 'app.user.%' THEN 'app.user'
            WHEN seed.code LIKE 'app.rbac.%' THEN 'app.rbac'
            WHEN seed.code LIKE 'app.abac.%' THEN 'app.abac'
            WHEN seed.code LIKE 'app.%' THEN 'app.management'
            WHEN seed.code LIKE 'system.user.%' THEN 'system.user'
            WHEN seed.code LIKE 'system.role.%' THEN 'system.role'
            WHEN seed.code LIKE 'system.user-group.%' THEN 'system.user-group'
            WHEN seed.code LIKE 'system.menu.%' THEN 'system.menu'
            WHEN seed.code LIKE 'system.permission.%' THEN 'system.permission'
            WHEN seed.code LIKE 'system.dict%' THEN 'system.dict'
            WHEN seed.code LIKE 'system.task.%' THEN 'system.task'
            WHEN seed.code LIKE 'system.monitor.%' THEN 'system.monitor'
            WHEN seed.code LIKE 'system.admin-preference.%' THEN 'system.admin-preference'
            WHEN seed.code LIKE 'system.spicedb.%' THEN 'system.spicedb'
            WHEN seed.code LIKE 'system.abac.%' THEN 'system.abac'
            WHEN seed.code LIKE 'system.rbac.user.%' OR seed.code LIKE 'rbac.user.%' THEN 'system.rbac.user'
            WHEN seed.code LIKE 'system.rbac.role.%' OR seed.code LIKE 'rbac.role.%' THEN 'system.rbac.role'
            WHEN seed.code LIKE 'system.rbac.user-group.%' OR seed.code LIKE 'rbac.user_group.%' THEN 'system.rbac.user-group'
            WHEN seed.code LIKE 'system.rbac.permission.%' OR seed.code LIKE 'rbac.permission.%' THEN 'system.rbac.permission'
            WHEN seed.code LIKE 'system.rbac.menu-binding.%' OR seed.code LIKE 'rbac.menu.%' THEN 'system.rbac.menu'
            WHEN seed.code LIKE 'system.rbac.effective.%' OR seed.code LIKE 'rbac.effective.%' THEN 'system.rbac.effective'
            WHEN seed.code LIKE 'rbac.test.%' THEN 'system.rbac.test'
            WHEN seed.code LIKE 'system.rbac.%' THEN 'system.rbac'
            ELSE null
        END
    ),
    seed.sort,
    true,
    'ENABLE'::"RbacStatus",
    'open_source_seed',
    'open_source_seed',
    now(),
    now(),
    null
FROM numbered_permission_seed seed
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
    ('rbac_super_admin', 'RBAC 超级管理员', '开源版内置超级管理员角色，拥有全部已配置权限', 0, true, true, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null),
    ('rbac_demo_viewer', '演示只读用户', '开源版内置演示角色，仅授予页面查看和安全的只读动作', 100, true, false, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null)
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
    ('admin_group', '管理员用户组', '开源版管理员账号所在用户组，绑定超级管理员角色', 0, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null),
    ('demo_group', '演示用户组', '开源版 demo 账号所在用户组，绑定只读演示角色', 100, 'ENABLE'::"RbacStatus", 'open_source_seed', 'open_source_seed', now(), now(), null)
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
JOIN rbac_permission permission ON permission.status = 'ENABLE'::"RbacStatus" AND permission.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH demo_role AS (
    SELECT id FROM rbac_role WHERE code = 'rbac_demo_viewer'
),
readonly_permission AS (
    SELECT id
    FROM rbac_permission
    WHERE deleted_at IS NULL
      AND status = 'ENABLE'::"RbacStatus"
      AND (
          kind = 'MENU'::"RbacPermissionKind"
          OR code LIKE '%.detail'
          OR code LIKE '%.session.view'
          OR code LIKE '%.check-permission'
          OR code LIKE '%.batch-check-permission'
          OR code LIKE '%.explain-permission'
          OR code IN ('rbac.test.view', 'rbac.test.read', 'rbac.test.profile')
      )
)
INSERT INTO rbac_role_permission (role_id, permission_id, created_by, created_at)
SELECT demo_role.id, readonly_permission.id, 'open_source_seed', now()
FROM demo_role
CROSS JOIN readonly_permission
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. 菜单。先 upsert 菜单自身，再按 required_permission_code 回填 pid。
WITH menu_seed(code, parent_code, title, path, component_path, type, icon, sort, is_menu_visible, status) AS (
    VALUES
        ('dashboard.home.menu', null, '仪表盘', 'dashboard', null, 'Catalog', 'icon-park-outline:analysis', 1, true, 'ENABLE'),
        ('dashboard.workplace.view', 'dashboard.home.menu', '工作台', 'workplace', 'dashboard/workplace/Workplace', 'Page', 'icon-park-outline:workbench', 10, true, 'ENABLE'),
        ('dashboard.monitor.view', 'dashboard.home.menu', '数据看板', 'monitor', 'dashboard/monitor/Monitor', 'Page', 'icon-park-outline:chart-line', 20, true, 'ENABLE'),
        ('system.home.menu', null, '系统管理', 'system', null, 'Catalog', 'icon-park-outline:setting-two', 10, true, 'ENABLE'),
        ('system.monitor.menu', 'system.home.menu', '运行监控', 'monitor', null, 'Catalog', 'icon-park-outline:monitor', 5, true, 'ENABLE'),
        ('system.monitor.status.view', 'system.monitor.menu', '系统状态', 'status', 'system/monitor/Status', 'Page', 'icon-park-outline:pulse', 10, true, 'ENABLE'),
        ('system.monitor.redis.view', 'system.monitor.menu', 'Redis 监控', 'redis', 'system/monitor/Redis', 'Page', 'icon-park-outline:database-network', 20, true, 'ENABLE'),
        ('system.admin-preference.view', 'system.home.menu', '后台偏好', 'admin-preference', 'system/admin-preference/AdminPreference', 'Page', 'icon-park-outline:setting-config', 10, true, 'ENABLE'),
        ('system.dict.view', 'system.home.menu', '字典管理', 'dict', 'system/dict/Dict', 'Page', 'icon-park-outline:book-open', 20, true, 'ENABLE'),
        ('system.task.view', 'system.home.menu', '任务管理', 'task', 'system/task/Task', 'Page', 'icon-park-outline:schedule', 30, true, 'ENABLE'),
        ('system.spicedb.menu', 'system.home.menu', 'SpiceDB', 'spicedb', null, 'Catalog', 'icon-park-outline:database-network', 40, true, 'ENABLE'),
        ('system.spicedb.view', 'system.spicedb.menu', 'SpiceDB 数据管理', 'data', 'system/spicedb-data/SpiceDBData', 'Page', 'icon-park-outline:database-code', 10, true, 'ENABLE'),
        ('system.user.view', 'system.spicedb.menu', '系统用户', 'user', 'system/user/User', 'Page', 'icon-park-outline:user', 20, true, 'ENABLE'),
        ('system.role.view', 'system.spicedb.menu', '系统角色', 'role', 'system/role/Role', 'Page', 'icon-park-outline:people', 30, true, 'ENABLE'),
        ('system.user-group.view', 'system.spicedb.menu', '后台用户组', 'user-group', 'system/user-group/UserGroup', 'Page', 'icon-park-outline:every-user', 40, true, 'ENABLE'),
        ('system.menu.view', 'system.spicedb.menu', '系统菜单', 'menu', 'system/menu/Menu', 'Page', 'icon-park-outline:tree-list', 50, true, 'ENABLE'),
        ('system.permission.view', 'system.spicedb.menu', '关系权限管理', 'permission', 'system/permission/Permission', 'Page', 'icon-park-outline:key', 60, true, 'ENABLE'),
        ('system.abac.menu', 'system.home.menu', '系统 ABAC', 'abac', null, 'Catalog', 'icon-park-outline:permissions', 50, true, 'ENABLE'),
        ('system.abac.field.read', 'system.abac.menu', 'ABAC 字段管理', 'fields', 'system/abac/AbacFields', 'Page', 'icon-park-outline:form-one', 10, true, 'ENABLE'),
        ('system.abac.policy-group.read', 'system.abac.menu', 'ABAC 策略组', 'policy-groups', 'system/abac/AbacPolicyGroups', 'Page', 'icon-park-outline:components', 20, true, 'ENABLE'),
        ('system.abac.manual-policy.read', 'system.abac.menu', 'ABAC 手写策略', 'manual-policies', 'system/abac/AbacManualPolicies', 'Page', 'icon-park-outline:code', 30, true, 'ENABLE'),
        ('system.abac.preview', 'system.abac.menu', 'ABAC 编译预览', 'preview', 'system/abac/AbacPreview', 'Page', 'icon-park-outline:preview-open', 40, true, 'ENABLE'),
        ('system.abac.publish', 'system.abac.menu', 'ABAC 发布', 'publish', 'system/abac/AbacPublish', 'Page', 'icon-park-outline:upload', 50, true, 'ENABLE'),
        ('system.abac.runtime-test', 'system.abac.menu', 'ABAC 测试台', 'runtime-test', 'system/abac/AbacRuntimeTest', 'Page', 'icon-park-outline:experiment', 60, true, 'ENABLE'),
        ('system.rbac.view', 'system.home.menu', '用户管理', 'user-management', null, 'Catalog', 'icon-park-outline:peoples', 60, true, 'ENABLE'),
        ('system.rbac.user.view', 'system.rbac.view', 'RBAC 用户', 'rbac-user', 'system/rbac/user/User', 'Page', 'icon-park-outline:user', 10, true, 'ENABLE'),
        ('system.rbac.role.view', 'system.rbac.view', 'RBAC 角色', 'rbac-role', 'system/rbac/role/Role', 'Page', 'icon-park-outline:people', 20, true, 'ENABLE'),
        ('system.rbac.user-group.view', 'system.rbac.view', 'RBAC 用户组', 'rbac-user-group', 'system/rbac/user-group/UserGroup', 'Page', 'icon-park-outline:every-user', 30, true, 'ENABLE'),
        ('system.rbac.permission.view', 'system.rbac.view', 'RBAC 权限', 'rbac-permission', 'system/rbac/permission/Permission', 'Page', 'icon-park-outline:key', 40, true, 'ENABLE'),
        ('system.rbac.menu-binding.view', 'system.rbac.view', 'RBAC 菜单', 'rbac-menu-binding', 'system/rbac/menu-binding/MenuBinding', 'Page', 'icon-park-outline:tree-list', 50, true, 'ENABLE'),
        ('system.rbac.effective.view', 'system.rbac.view', 'Effective 读模型', 'rbac-effective', 'system/rbac/effective/Effective', 'Page', 'icon-park-outline:graph-bar', 60, true, 'ENABLE'),
        ('rbac.test.page', 'system.rbac.view', 'RBAC 测试台', 'rbac-test', 'system/rbac/test/Test', 'Page', 'icon-park-outline:experiment', 70, true, 'ENABLE'),
        ('app.home.menu', null, 'App 管理', 'app', null, 'Catalog', 'icon-park-outline:application-menu', 20, true, 'ENABLE'),
        ('app.user.view', 'app.home.menu', '应用用户', 'app-users', 'app/user/User', 'Page', 'icon-park-outline:user-business', 10, true, 'ENABLE'),
        ('app.abac.page', 'app.home.menu', 'App ABAC', 'app-abac', null, 'Catalog', 'icon-park-outline:permissions', 20, true, 'ENABLE'),
        ('app.abac.field.read', 'app.abac.page', 'ABAC 字段管理', 'fields', 'app/abac/AbacFields', 'Page', 'icon-park-outline:form-one', 10, true, 'ENABLE'),
        ('app.abac.policy-group.read', 'app.abac.page', 'ABAC 策略组', 'policy-groups', 'app/abac/AbacPolicyGroups', 'Page', 'icon-park-outline:components', 20, true, 'ENABLE'),
        ('app.abac.manual-policy.read', 'app.abac.page', 'ABAC 手写策略', 'manual-policies', 'app/abac/AbacManualPolicies', 'Page', 'icon-park-outline:code', 30, true, 'ENABLE'),
        ('app.abac.preview', 'app.abac.page', 'ABAC 编译预览', 'preview', 'app/abac/AbacPreview', 'Page', 'icon-park-outline:preview-open', 40, true, 'ENABLE'),
        ('app.abac.publish', 'app.abac.page', 'ABAC 发布', 'publish', 'app/abac/AbacPublish', 'Page', 'icon-park-outline:upload', 50, true, 'ENABLE'),
        ('app.abac.runtime-test', 'app.abac.page', 'ABAC 测试台', 'runtime-test', 'app/abac/AbacRuntimeTest', 'Page', 'icon-park-outline:experiment', 60, true, 'ENABLE')
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
    '开源版内置菜单：' || seed.title,
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
        ('dashboard.home.menu', null),
        ('dashboard.workplace.view', 'dashboard.home.menu'),
        ('dashboard.monitor.view', 'dashboard.home.menu'),
        ('system.home.menu', null),
        ('system.monitor.menu', 'system.home.menu'),
        ('system.monitor.status.view', 'system.monitor.menu'),
        ('system.monitor.redis.view', 'system.monitor.menu'),
        ('system.admin-preference.view', 'system.home.menu'),
        ('system.dict.view', 'system.home.menu'),
        ('system.task.view', 'system.home.menu'),
        ('system.spicedb.menu', 'system.home.menu'),
        ('system.spicedb.view', 'system.spicedb.menu'),
        ('system.user.view', 'system.spicedb.menu'),
        ('system.role.view', 'system.spicedb.menu'),
        ('system.user-group.view', 'system.spicedb.menu'),
        ('system.menu.view', 'system.spicedb.menu'),
        ('system.permission.view', 'system.spicedb.menu'),
        ('system.abac.menu', 'system.home.menu'),
        ('system.abac.field.read', 'system.abac.menu'),
        ('system.abac.policy-group.read', 'system.abac.menu'),
        ('system.abac.manual-policy.read', 'system.abac.menu'),
        ('system.abac.preview', 'system.abac.menu'),
        ('system.abac.publish', 'system.abac.menu'),
        ('system.abac.runtime-test', 'system.abac.menu'),
        ('system.rbac.view', 'system.home.menu'),
        ('system.rbac.user.view', 'system.rbac.view'),
        ('system.rbac.role.view', 'system.rbac.view'),
        ('system.rbac.user-group.view', 'system.rbac.view'),
        ('system.rbac.permission.view', 'system.rbac.view'),
        ('system.rbac.menu-binding.view', 'system.rbac.view'),
        ('system.rbac.effective.view', 'system.rbac.view'),
        ('rbac.test.page', 'system.rbac.view'),
        ('app.home.menu', null),
        ('app.user.view', 'app.home.menu'),
        ('app.abac.page', 'app.home.menu'),
        ('app.abac.field.read', 'app.abac.page'),
        ('app.abac.policy-group.read', 'app.abac.page'),
        ('app.abac.manual-policy.read', 'app.abac.page'),
        ('app.abac.preview', 'app.abac.page'),
        ('app.abac.publish', 'app.abac.page'),
        ('app.abac.runtime-test', 'app.abac.page')
)
UPDATE rbac_menu child
SET pid = parent.id,
    updated_at = now()
FROM menu_seed seed
LEFT JOIN rbac_menu parent ON parent.required_permission_code = seed.parent_code
WHERE child.required_permission_code = seed.code
  AND child.pid IS DISTINCT FROM parent.id;

-- 6. RBAC effective 读模型。
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
SELECT auth_user.id, role.id, 'open-source-admin-seed-v1', now()
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
SELECT role_by_user.user_id, role_permission.permission_id, 'open-source-admin-seed-v1', now()
FROM role_by_user
JOIN rbac_role_permission role_permission ON role_permission.role_id = role_by_user.role_id
ON CONFLICT (user_id, permission_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

WITH admin_user AS (
    SELECT id AS user_id FROM better_auth_user WHERE username = 'admin'
)
INSERT INTO rbac_user_visible_menu (user_id, menu_id, version, updated_at)
SELECT admin_user.user_id, menu.id, 'open-source-admin-seed-v1', now()
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
SELECT demo_user.user_id, visible_menu.id, 'open-source-admin-seed-v1', now()
FROM demo_user
CROSS JOIN visible_menu
ON CONFLICT (user_id, menu_id) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

INSERT INTO state_version (name, type, version, created_at, updated_at)
VALUES ('admin_global', 'menu'::"StateVersionType", 'open-source-admin-seed-v1', now(), now())
ON CONFLICT (type, name) DO UPDATE SET
    version = EXCLUDED.version,
    updated_at = now();

-- 7. 后台偏好、字典和任务演示数据。
INSERT INTO admin_preference_policy (key, value, user_editable, label, "group", sort, created_at, updated_at)
VALUES
    ('themeColor', '"#165DFF"'::jsonb, true, '主题颜色', 'appearance', 10, now(), now()),
    ('menuWidth', '220'::jsonb, true, '菜单栏宽度', 'layout', 20, now(), now()),
    ('tabBar', 'true'::jsonb, true, '开启多标签', 'layout', 30, now(), now()),
    ('showTabsPinIcon', 'false'::jsonb, true, '显示标签页固定图标', 'layout', 40, now(), now()),
    ('translucent', 'true'::jsonb, true, '透明效果', 'appearance', 50, now(), now()),
    ('openingAnimation', '"fade-in"'::jsonb, true, '页面打开动画', 'animation', 60, now(), now()),
    ('quitAnimation', '"fade-out-right"'::jsonb, true, '页面退出动画', 'animation', 70, now(), now()),
    ('colorWeak', 'false'::jsonb, true, '色弱模式', 'accessibility', 80, now(), now())
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    user_editable = EXCLUDED.user_editable,
    label = EXCLUDED.label,
    "group" = EXCLUDED."group",
    sort = EXCLUDED.sort,
    updated_at = now();

INSERT INTO dict_category (name, created_at, updated_at)
VALUES
    ('system_status', now(), now()),
    ('demo_level', now(), now())
ON CONFLICT (name) DO UPDATE SET
    updated_at = now();

INSERT INTO dict (category, name, value, description, status, sort_order, created_at, updated_at)
VALUES
    ('system_status', '启用状态', 'enabled', '开源版演示字典：启用状态集合', 1, 10, now(), now()),
    ('demo_level', '演示等级', 'demo', '开源版演示字典：用户等级集合', 1, 20, now(), now())
ON CONFLICT (category, value) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

DELETE FROM dict_key
WHERE dict_id IN (
    SELECT id FROM dict WHERE category IN ('system_status', 'demo_level')
);

WITH key_seed(category, dict_value, key, value, description, sort_order) AS (
    VALUES
        ('system_status', 'enabled', 'ENABLE', '启用', '可参与运行和授权计算', 10),
        ('system_status', 'enabled', 'DISABLE', '禁用', '保留数据但不参与运行', 20),
        ('demo_level', 'demo', 'basic', '基础演示', '适合只读体验的默认等级', 10),
        ('demo_level', 'demo', 'admin', '管理员演示', '适合管理能力体验的默认等级', 20)
)
INSERT INTO dict_key (dict_id, key, value, description, status, sort_order, created_at, updated_at)
SELECT dict.id, seed.key, seed.value, seed.description, 1, seed.sort_order, now(), now()
FROM key_seed seed
JOIN dict ON dict.category = seed.category AND dict.value = seed.dict_value;

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
    'open-source-demo-task',
    '开源版演示任务，默认禁用，仅用于展示任务管理页面数据',
    '0 0 * * *',
    '{"source":"open-source-seed"}'::jsonb,
    '{"demo":true}'::jsonb,
    'demo.noop',
    'MANUAL'::"TaskStrategy",
    'DISABLE'::"TaskStatus",
    'SUCCESS'::"TaskLogStatus",
    '开源版演示任务初始化完成',
    now(),
    now(),
    12,
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
WHERE task_id IN (SELECT id FROM task WHERE name = 'open-source-demo-task');

INSERT INTO task_log (task_id, log, status, triggered_by, actor_id, error, started_at, finished_at, duration_ms, created_at)
SELECT
    task.id,
    '开源版演示任务日志',
    'SUCCESS'::"TaskLogStatus",
    'SEED',
    auth_user.id,
    null,
    now(),
    now(),
    12,
    now()
FROM task
JOIN better_auth_user auth_user ON auth_user.username = 'admin'
WHERE task.name = 'open-source-demo-task';

COMMIT;
