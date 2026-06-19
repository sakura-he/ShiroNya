# UserState 模块说明

## 1. 依据代码清单

- `apps/admin-api/src/modules/user-state/admin-user-state.module.ts`
- `apps/admin-api/src/modules/user-state/admin-user-state.service.ts`
- `apps/admin-api/src/modules/user-state/admin-user-state.service.spec.ts`
- `apps/admin-api/src/common/interceptors/response-format.interceptor.ts`
- `apps/admin-api/src/modules/app.module.ts`
- `libs/common/src/filters/base-exception.filter.ts`
- `apps/admin-api/src/modules/authz-permission/authz-permission.service.ts`
- `apps/admin-api/src/modules/system/roles/roles.service.ts`
- `apps/admin-api/src/modules/system/menus/menus.service.ts`
- `apps/admin-api/src/modules/system/users/users.service.ts`
- `apps/admin-api/src/modules/system/user-groups/user-groups.service.ts`

## 2. 模块定位

`AdminUserStateModule` 是 `admin-api` 管理后台的“版本感知中枢”。它不直接参与角色、菜单、用户的业务写入，而是把这些业务变更统一翻译成用户状态版本号，再通过响应头把“需要刷新”的信号传给前端。

这个模块解决的是两个问题：

- 后台数据已经变了，但前端本地菜单、权限、用户态缓存不知道什么时候失效
- 正常响应和异常响应都需要带上同一套版本头，避免前端只在成功场景下才能感知变更

## 3. 对外入口

- 编程入口：`AdminUserStateService`
- 模块入口：`AdminUserStateModule`
- 响应入口：`ResponseFormatInterceptor` 在正常业务 handler 完成后调用 `attachUserStateHeaders`
- 异常入口：`BaseExceptionFilter` 通过 `USER_STATE_HEADER_WRITER` 注入 token 在异常响应前补写版本头

## 4. 依赖项与环境变量

- `PrismaModule`
- `RedisModule.forRootAsync(...)`
- Redis 连接名：`DEFAULT_REDIS`
- 持久化表：`state_version`
- Better Auth 后台会话：`request.session`
- 环境变量：
    - `ADMIN_REDIS_URL`，或 `ADMIN_REDIS_HOST` / `ADMIN_REDIS_PORT` / `ADMIN_REDIS_USER` / `ADMIN_REDIS_PASSWORD`
    - `ADMIN_DATABASE_URL`

## 5. Provider / Service 与关键方法

- `getUserVersion(userId)`：读取后台用户维度版本，只走 Redis；未命中时初始化 ULID。
- `bumpUserStateVersion(userId)`：重置指定后台用户版本，用于用户信息或用户角色变更后的刷新通知。
- `getRoleStateVersion(roleId, roleName)`：优先读 Redis；未命中时回源 `state_version(type=role, name='admin:role:<roleId>')`。
- `bumpRoleStateVersion(roleId, roleName)`：同步更新 `admin:role:<roleId>` DB 记录与 Redis 缓存。
- `getMenuStateVersion()`：优先读 Redis；未命中时回源 `state_version(type=menu, name='admin_global')`。
- `bumpMenuStateVersion()`：同步更新后台菜单全局版本。
- `getCompositeStateVersion({ userId, roles })`：把菜单版本、用户版本、角色版本拼成稳定字符串后做 `sha256`，得到固定 64 位十六进制综合版本号；该值只在请求内 memo。
- `getCompositeStateVersionForRequest(request, input)`：同一个 HTTP request 内用 Promise memo 复用综合版本计算，避免响应体和响应头重复读版本。
- `attachUserStateHeaders(request, response)`：从后台会话中提取 `user.id` 和 `roles`，写入 `x-user-state-version`，并在请求头版本滞后时追加 `x-user-state-changed: 1`。

## 6. 涉及到的上下游模块

### 6.1 写路径上游

- `SystemRolesService`
    - `createRole()`
    - `updateRole()`
    - `deleteRole()`
    - `assignDirectUsers()`
    - `assignUserGroups()`
- `AuthzPermissionService`
    - `applyMatrixChanges()`
- `SystemMenusService`
    - `create_menu()`
    - `update()`
    - `remove()`
    - `deleteMenu()`
- `SystemUsersService`
    - 用户主表、资料或直接角色变更后，会影响当前用户态刷新
- `SystemUserGroupsService`
    - `createUserGroup()`
    - `updateUserGroup()`
    - 用户组成员或角色分配变更后，会刷新受影响用户和角色版本
      这些上游模块不会自己拼响应头，它们只负责在业务写入成功后调用 `bump*Version()`，把“状态已经变化”的事实写进版本存储层。

### 6.2 读路径下游

- `ResponseFormatInterceptor`
    - 正常响应场景下先等待业务 handler 完成，再写版本头，最后把返回体包装成 `{ data, code, message }`
- `BaseExceptionFilter`
    - 异常响应场景下通过 `USER_STATE_HEADER_WRITER` 调 `attachUserStateHeaders`

这意味着前端无论收到的是成功响应还是异常响应，都有机会拿到最新版本号。

## 7. 核心原理、数据流与异常流

### 7.1 Redis 键空间

- 用户版本：`ver:admin:user:{userId}`
- 角色版本：`ver:admin:role:{roleId}`
- 菜单全局版本：`ver:admin:menu:global`

这套键统一以 `ver:admin:` 开头，和 `app-api` 使用的 `ver:` 键空间隔离。
综合版本本身只在请求内 memo；跨请求缓存由 `/account/navigation` 使用的 `admin:account:navigation:{userId}:{version}` 承担，版本变化会天然切到新的导航缓存 key。

### 7.2 DB 持久化规则

- 角色版本：`type=role, name='admin:role:<roleId>'`
- 菜单版本：`type=menu, name='admin_global'`

其中 `admin_global` 是后台菜单专用命名，避免和 `app-api` 的 `global` 菜单版本记录互相覆盖。
角色版本使用 `type=role, name='admin:role:<roleId>'` 作为稳定持久化键。

### 7.3 综合版本算法

- 先按 `role.id` 去重
- 再按 `role.id` 排序，保证参与 hash 的输入稳定
- 拼接字符串：`menuVersion|userVersion|roleId:roleVersion|...`
- 使用 `sha256` 输出 64 位十六进制字符串

这个设计保证了两件事：

- 同一角色集合即使顺序不同，综合版本也相同
- 只要角色集合不同，综合版本就会不同

### 7.4 会话约束

- `attachUserStateHeaders` 直接使用 `request.session.roles`
- `role.id` 必须是有限数字
- `role.name` 不能为空
- `request.session` 缺失时直接跳过，不报错

### 7.5 异常流

- Redis 不可用：读缓存时退化成 `null`，写缓存静默跳过
- 角色或菜单版本 Redis 未命中：回源 DB，再回填 Redis
- `roleName` 为空：`getRoleStateVersion()` / `bumpRoleStateVersion()` 显式抛错
- `getCompositeStateVersion()` 或头写入链路内部失败：`attachUserStateHeaders()` 自身吞掉异常并记录日志，不阻断主流程

## 8. 测试与验证

测试文件：`apps/admin-api/src/modules/user-state/admin-user-state.service.spec.ts`

当前测试覆盖两类场景：

- 属性测试
    - `bumpUserStateVersion`、`bumpRoleStateVersion`、`bumpMenuStateVersion` 的版本变化性质
    - Redis 键前缀隔离
    - 综合版本的顺序无关性与集合敏感性
    - 响应头写入、`changed` 标记和异常吞掉
- 示例测试
    - Redis 不可用时的降级行为
    - 角色版本 Redis 未命中回源稳定 DB key
    - bump 角色版本写稳定 DB key 和 Redis 缓存
    - 菜单版本使用 `admin_global`
    - 无会话请求跳过版本头写入
    - 同一 request 内重复写版本头只计算一次综合版本，不写 `ver:admin:composite:{userId}`

## 9. 使用示例

```ts
// RBAC 角色、权限、用户组、菜单关系变更后，优先通过 GraphService 重建 effective；
// applyRebuild 会推进被重建用户的 user-state 版本。
await this.rbacGraphService.applyRebuild(userIds);

// 角色或菜单元数据本身变化时，再推进对应的角色/菜单版本。
await this.adminUserStateService.bumpRoleStateVersion(role.id, role.name);
await this.adminUserStateService.bumpMenuStateVersion();
```

```ts
await this.adminUserStateService.attachUserStateHeaders(request, response);
```

## 10. 相关文档

- 关系图文档：`user-state-module-class-diagram.md`
- 上游角色模块：`../../system/roles/docs/role-spicedb-menu-relations.md`
- 上游菜单模块：`../../system/menus/docs/menu-rbac-relations.md`
- 上游后台用户模块：`../../system/users/docs/user-spicedb-role-relations.md`
- 上游用户组模块：`../../system/user-groups/docs/user-group-rbac-relations.md`
