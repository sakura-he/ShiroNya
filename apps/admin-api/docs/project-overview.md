# admin-api 项目总说明

## 1. 依据代码清单

- `apps/admin-api/src/main.ts`
- `apps/admin-api/src/modules/app.module.ts`
- `apps/admin-api/src/modules/better-auth/better-auth.module.ts`
- `apps/admin-api/src/modules/better-auth/better-auth.service.ts`
- `apps/admin-api/src/modules/better-auth/better-auth-options.ts`
- `apps/admin-api/src/modules/better-auth/better-auth-session.guard.ts`
- `apps/admin-api/src/modules/account/account.controller.ts`
- `apps/admin-api/src/modules/account/account.service.ts`
- `apps/admin-api/src/modules/app-api/app-api.module.ts`
- `apps/admin-api/src/modules/app-api/user/user-admin.grpc-client.ts`
- `apps/admin-api/src/modules/system/users/users.service.ts`
- `apps/admin-api/src/modules/system/roles/roles.service.ts`
- `apps/admin-api/src/modules/system/menus/menus.service.ts`
- `apps/admin-api/src/modules/system/user-groups/user-groups.service.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-authorization.service.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-graph.service.ts`
- `apps/admin-api/src/modules/spicedb/admin-spicedb-authorization.service.ts`
- `apps/admin-api/src/modules/system/spicedb-data/spicedb-data.service.ts`
- `apps/admin-api/src/modules/spicedb-projection/base-relation-projection.service.ts`
- `apps/admin-api/src/modules/spicedb-stream/admin-spicedb-kafka-projection-consumer.service.ts`
- `apps/admin-api/src/modules/user-state/admin-user-state.service.ts`
- `libs/common/src/interceptors/response-format.interceptor.ts`
- `libs/common/src/middleware/http-log.middleware.ts`

## 2. 一句话总览

`admin-api` 是后台管理 Nest 应用，入口基于 Better Auth cookie session；admin 基础授权由 RBAC effective 读模型计算，PostgreSQL 保存业务元数据和 RBAC 源表/读模型，Redis 用于导航缓存和用户状态版本通知，SpiceDB 与 Cerbos ABAC 服务显式关系、策略和运维场景。

## 3. 启动入口与模块组合

- 入口在 `main.ts`，全局前缀为 `/admin`，版本号通过 `version` 请求头切换。
- `AppModule` 聚合 `BetterAuth`、`Account`、`AppApi`、`SystemUsers`、`SystemRoles`、`SystemMenus`、`SystemUserGroups`、`SystemRbac`、`SystemAbac`、`AuthzPermission`、`SpiceDb`、`SpiceDbData`、`SpiceDbStream`、`UserState`、`SystemTasks`、`SystemAuditLogs`、`SystemMonitor`、`Common`、`Sat`、`Prisma`、`Redis`、`Log`。
- 后台没有 Mongo 依赖，当前后台业务数据主要落在 PostgreSQL、Redis；SpiceDB 和 Kafka 只服务显式关系授权、关系数据页和 Watch 投影链路。

## 4. 全局请求处理链

- `HttpLogMiddleware`、`HttpLogContextInterceptor` 与 `ResponseFormatInterceptor` 组成统一日志和返回包装链。
- Better Auth 运行时路由挂在 `/admin/api/auth/*`，前端通过 HttpOnly Cookie 建立与恢复会话。
- 未公开的后台接口以 Better Auth session 作为认证基础。
- `BetterAuthSessionGuard` 和 `RbacGuard` 作为全局 Guard 顺序执行，RBAC code 来自路由 metadata 和 service 层显式断言。
- `AdminUserStateService` 在正常响应和异常响应里写入用户状态版本头，帮助前端判断菜单、权限和用户态缓存是否失效。
- 审计日志由中间件和装饰器采集，高风险写操作落 `audit_log`。

## 5. 业务域划分

- 账户域：`account` 负责当前账号信息、改密、密码重置、菜单和权限点读取。
- 后台用户域：`user` 维护 Better Auth 用户、后台 profile 和用户直接角色关系。
- RBAC 域：`rbac` 维护用户、角色、用户组、权限、菜单声明和 effective 读模型。
- 角色域：`role` 维护角色管理能力，基础授权断言走 RBAC。
- 菜单域：`menu` 维护 `rbac_menu` 元数据和 `requiredPermissionCode`。
- 用户组域：`user-group` 维护用户组元数据、成员关系和用户组角色。
- SpiceDB 域：`spicedb` 提供显式关系授权封装，`system/spicedb-data` 提供 relationship、schema 和 permission check 的数据管理入口。
- App 控制面域：`app-api` 通过 mTLS gRPC 调用 app-api 的用户、RBAC 和 ABAC 管理服务，写入由 app-api 自己解释和执行。
- 系统域：`system/task` 管理 Cron 任务，`system/audit-log` 查询审计日志，`common/upload` 和 `common/dict` 处理通用能力。

## 6. 认证、权限、缓存、日志

- 登录链路：`POST /admin/api/auth/sign-in/username` 由 Better Auth 校验用户名密码并签发 `admin-api.session` Cookie。
- 会话链路：`ShiroAdminBetterAuthService` 从 `rbac_effective_user_role -> rbac_role` 读取有效角色，再回业务库读取用户资料。
- 菜单与按钮权限：`AccountService` 读取 RBAC effective 权限和 `rbac_user_visible_menu`，再回 `rbac_menu` 过滤启用状态和菜单类型。
- 权限关系写入：用户角色、用户入组、用户组角色、角色权限、菜单所需权限和权限/菜单分组都写 `rbac_*`；分组只服务后台管理归类，任务对象和 SpiceDB 数据页保留显式关系授权能力。
- 缓存层使用 Redis；用户、角色、菜单变化后通过 `AdminUserStateService` 刷新版本号。
- 日志层使用共享日志基础设施，审计日志落 PostgreSQL。

## 7. 关键跨模块链路

- 后台登录：`/admin/api/auth/sign-in/username` → Better Auth → 浏览器写入 session Cookie。
- 构建会话：Better Auth → `ShiroAdminBetterAuthService` → RBAC effective roles → profile。
- 获取后台导航：`/admin/account/navigation` → `AccountService` → RBAC visible menus → `rbac_menu`。
- 管理用户角色：`/admin/user/*` → `SystemUsersService` → Better Auth / profile → `rbac_user_role`。
- 管理角色权限：`/admin/rbac/role/*` → `RbacRoleService` → `rbac_role_permission` → effective rebuild。
- 管理菜单声明：`/admin/menu/*` → `SystemMenusService` → `rbac_menu.requiredPermissionCode`。
- 管理用户组：`/admin/user-group/*` → `SystemUserGroupsService` → `rbac_user_group_member` / `rbac_user_group_role`。
- 管理 SpiceDB 数据：`/admin/system/spicedb-data/*` → `SpiceDbDataService` → SpiceDB schema、relationship、permission check。
- 管理 app 侧用户和 RBAC/ABAC：`/admin/app-api/*` → `UserAdminGrpcClient` → app-api `app_user_admin` gRPC。

## 8. 环境变量与外部依赖

- 服务启动：`ADMIN_BETTER_AUTH_SECRET`、`ADMIN_BETTER_AUTH_URL`、`ADMIN_BETTER_AUTH_TRUSTED_ORIGINS`、`SWAGGER_ENABLED`
- 数据与缓存：`ADMIN_DATABASE_URL`、`ADMIN_REDIS_URL` 或 `ADMIN_REDIS_HOST`、`ADMIN_REDIS_PORT`、`ADMIN_REDIS_USER`、`ADMIN_REDIS_PASSWORD`
- SpiceDB：`ADMIN_SPICEDB_ENDPOINT`、`ADMIN_SPICEDB_TENANT`、`ADMIN_SPICEDB_AUTH_TOKEN`、`ADMIN_SPICEDB_INSECURE`、`ADMIN_SPICEDB_TLS_CA_PATH`、`ADMIN_SPICEDB_TIMEOUT_MS`
- App 控制面 gRPC：`APP_USER_ADMIN_GRPC_HOST`、`APP_USER_ADMIN_GRPC_PORT`、`APP_USER_ADMIN_GRPC_TLS_CA_PATH`、`APP_USER_ADMIN_GRPC_TLS_CLIENT_CERT_PATH`、`APP_USER_ADMIN_GRPC_TLS_CLIENT_KEY_PATH`

## 9. 推荐阅读顺序

- 应用总图：`project-architecture-diagrams.md`
- 权限架构：`../../docs/admin-permission-system-code-architecture.md`
- RBAC 说明：`../src/modules/system/rbac/docs/rbac.md`
- 菜单说明：`../src/modules/system/menus/docs/menu-rbac-relations.md`
- 账号导航：`../src/modules/account/docs/account-rbac-navigation.md`
- 后台用户状态：`../src/modules/user-state/docs/user-state.md`
- 用户、角色、菜单、用户组模块各自的 `docs/*.md`
