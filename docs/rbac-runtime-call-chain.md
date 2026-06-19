# RBAC 运行时调用链逐函数说明

本文描述当前代码里的基础 RBAC 接口授权链路，覆盖 `admin-api` 和 `app-api`。RBAC 直接使用 `libs/rbac-core` 和应用侧适配器，不经过通用 checker/resolver 分发。

两个应用共享 `libs/rbac-core` 的运行时和纯图计算逻辑；各应用负责自己的 Prisma 源表、effective 表、错误码、模块装配和控制面边界。`@app/rbac-core` 是共享内部库，权限事实来源仍是各应用 RBAC 源表和 effective 读模型。

## 0. 共享 RBAC core 与应用适配层

| 层               | 代码                                            | 职责                                                                                                                                     |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 共享运行时       | `libs/rbac-core/src/runtime/*`                  | metadata key、`@RbacPermission()` 工厂、请求内 cache、`RbacGuardBase`、`RbacAuthorizationServiceBase`、effective permission cache 基类。 |
| 共享图计算       | `libs/rbac-core/src/graph/rbac-graph.engine.ts` | 角色继承闭包、用户直接角色 + 用户组角色合并、权限集合、可见菜单集合和 rebuild summary 的纯函数计算。                                     |
| admin-api 适配 | `apps/admin-api/src/modules/system/rbac/*`    | 接入 `rbac_*` Prisma model、admin 错误码、`admin-api` cache namespace、APP_GUARD 注册和管理接口。                                |
| app-api 适配    | `apps/app-api/src/modules/system/rbac/*`       | 接入 `rbac_*` Prisma model、app 错误码、`app-api` cache namespace、可信控制面上下文和管理接口。                                    |

维护原则：运行时算法 bug 优先修 `libs/rbac-core`；表名、Prisma 查询、错误码、用户状态版本和控制面边界留在各应用适配层。

## 1. 总链路

```text
HTTP request
  -> BetterAuthSessionGuard.canActivate()
  -> resolveBetterAuthRequestSession()
  -> RbacGuard app adapter
  -> RbacGuardBase.canActivate()
  -> RbacGuardBase.readRequiredPermissionCodes()
  -> getRbacRequestCache()
  -> RbacAuthorizationService app adapter
  -> RbacAuthorizationServiceBase.checkPermission()
  -> app Prisma effective RBAC read model
  -> controller handler
```

无权限声明的路由：

```text
HTTP request
  -> BetterAuthSessionGuard.canActivate()
  -> RbacGuardBase.canActivate()
  -> no RBAC metadata
  -> controller handler
```

## 2. 装饰器写入链路

### 2.1 `@RbacPermission(code)`

所属模块：

- `libs/rbac-core/src/runtime/rbac-permission.decorator.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-permission.decorator.ts`
- `apps/app-api/src/modules/system/rbac/rbac-permission.decorator.ts`

职责：

- 共享 core 提供 `createRbacPermissionDecorator(RbacDeclarePermissions)` 工厂。
- 应用侧 `rbac-permission.decorator.ts` 传入本应用 discovery 装饰器，生成 `RbacPermission`。
- 接收业务 permission code。
- `trim()` 后写入 `RBAC_PERMISSION_CODE_METADATA_KEY`，保存当前 RBAC 路由的单个主权限点。
- 调用 `RbacDeclarePermissions({ permissionCode: code })`，继续写候选扫描 metadata 和运行时 RBAC metadata。

使用方式：

```ts
@Post('create')
@RbacPermission(RBAC_PERMISSIONS.SYSTEM_USER_CREATE)
async createUser() {
    return await this.usersService.createUser();
}
```

### 2.2 `RbacDeclarePermissions(...permissions)`

所属模块：

- `apps/admin-api/src/modules/system/discovery/discovery.decorators.ts`
- `apps/app-api/src/modules/system/discovery/discovery.decorators.ts`

职责：

- 校验并标准化 `permissionCode`。
- 写入 `RBAC_PERMISSION_CANDIDATES_METADATA_KEY`，供 `SystemRbacPermissionDiscoveryService` 扫描候选权限。
- 写入 `RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY`，供 `RbacGuard` 运行时读取。

使用方式：

```ts
@RbacDeclarePermissions(
    { permissionCode: 'system.task.read', name: '读取任务', kind: 'API' },
    { permissionCode: 'system.task.publish', name: '发布任务', kind: 'API' }
)
async publishTask() {}
```

默认 all 语义：class 级和 handler 级 code 会合并去重，全部通过后才进入 handler。

### 2.3 `@Public()`

所属模块：

- `libs/common/src/decorators/public.decorator.ts`

职责：

- 只写 `PUBLIC_KEY`。
- 只影响 `BetterAuthSessionGuard` 是否要求 session。
- 不跳过 `RbacGuard`。公开路由如果同时声明 `@RbacPermission()`，匿名请求仍会被 `RbacGuard` 返回 401。

## 3. AppModule 全局 Guard 注册

所属模块：

- `apps/admin-api/src/modules/app.module.ts`
- `apps/app-api/src/modules/app.module.ts`

注册顺序：

```ts
{
    provide: APP_GUARD,
    useClass: BetterAuthSessionGuard
},
{
    provide: APP_GUARD,
    useClass: RbacGuard
}
```

职责边界：

- `BetterAuthSessionGuard`：认证层，只负责 session。
- `RbacGuard`：授权层，只负责 RBAC permission code。

## 4. Better Auth 会话 Guard 函数

所属模块：

- `apps/admin-api/src/modules/better-auth/better-auth-session.guard.ts`
- `apps/app-api/src/modules/better-auth/better-auth-session.guard.ts`

| 函数                                                    | 作用                                                                                        | 调用关系                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `canActivate(context)`                                  | 全局认证入口。判断公开路由、可选 session、缺 session、封禁状态，并把 session 写入 request。 | Nest 自动调用。                                  |
| `isPublicRoute(context)`                                | 读取 Better Auth `PUBLIC` 和 common `PUBLIC_KEY`。命中后不要求 session。                    | `canActivate()` 调用。                           |
| `isOptionalRoute(context)`                              | 读取 Better Auth `OPTIONAL`。缺 session 时也继续。                                          | `canActivate()` 调用。                           |
| `resolveBetterAuthRequestSession(request, authService)` | 同一 HTTP request 内只调用一次 Better Auth `getSession()`，结果缓存到 request。             | `canActivate()`、SpiceDB subject resolver 调用。 |
| `buildBetterAuthHeaders(headers)`                       | 把 Node request headers 转成 Better Auth API 需要的 `Headers`。                             | `resolveBetterAuthRequestSession()` 调用。       |

## 5. RbacGuard 函数

所属模块：

- `libs/rbac-core/src/runtime/rbac-guard.ts`
- `apps/admin-api/src/modules/system/rbac/rbac.guard.ts`
- `apps/app-api/src/modules/system/rbac/rbac.guard.ts`

| 函数                                                 | 作用                                                                                                                                                                                              | 使用方式                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `RbacGuardBase.canActivate(context)`                 | 运行时 RBAC 入口。读取 permission code；没有 code 直接放行；有 code 时要求 `request.session.user.id` 或 `request.session.session.userId`；逐个调用 `RbacAuthorizationService.checkPermission()`。 | 全局 APP_GUARD 自动调用应用侧 `RbacGuard`，实际逻辑在 core base。 |
| `RbacGuardBase.readRequiredPermissionCodes(context)` | 分别读取 controller class 与 handler 上的 `RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY`，合并、trim、过滤空值、去重。                                                                             | `canActivate()` 内部调用。                                        |
| `apps/*/rbac.guard.ts`                               | 继承 `RbacGuardBase`，注入 `Reflector` 和本应用 `RbacAuthorizationService`。                                                                                                                      | 应用适配层。                                                       |

错误行为：

- 有 code 但没有 session userId：401。
- `checkPermission()` 返回 `false`：403 `RBAC 权限不足`。
- 目标 code 不存在、禁用或软删除：让 `RbacAuthorizationService` 抛 RBAC 配置错误，不伪装成 403。

## 6. 请求内 RBAC cache 函数

所属模块：

- `libs/rbac-core/src/runtime/rbac-request-cache.ts`

| 函数/类型                      | 作用                                                                                               | 使用方式                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `RbacRequestCache`             | 单个 HTTP request 内的授权查询缓存，包含 `grantedStates`、`permissionChecks`、`superAdminStates`。 | Guard 和 service 层复用。                               |
| `createRbacRequestCache()`     | 创建三个 `Map`。Map value 存 `Promise`，避免并发重复查同一份数据。                                 | 测试或内部创建。                                        |
| `getRbacRequestCache(context)` | 从 HTTP request 获取或创建 cache，并同步到 request ALS。                                           | `RbacGuard.canActivate()` 调用。                        |
| `getActiveRbacRequestCache()`  | service 层没有 `ExecutionContext` 时，从 ALS 中取当前请求 cache。                                  | `RbacAuthorizationService.resolveRequestCache()` 调用。 |

测试和业务代码直接从 `@app/rbac-core` 引入请求内 RBAC cache 类型和函数。

## 6.1 跨请求 effective permission cache

所属模块：

- `libs/rbac-core/src/runtime/rbac-effective-permission-cache.service.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-effective-permission-cache.service.ts`
- `apps/app-api/src/modules/system/rbac/rbac-effective-permission-cache.service.ts`

| 函数/类型                                 | 作用                                                                                      | 使用方式                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `RbacEffectivePermissionCacheServiceBase` | 按 `userId + userStateVersion` 缓存 effective permission codes，缓存异常时静默降级到 DB。 | `RbacAuthorizationServiceBase.getEffectivePermissionCodesForUser()` 调用。 |
| `RbacUserStateReader`                     | core 只要求 `getUserVersion(userId)`，不依赖具体 `AdminUserStateService` 类型。           | 应用适配层传入。                                                           |
| app cache service                         | 继承 base 并设置 namespace。                                                              | `admin-api` 使用 `admin-api`，`app-api` 使用 `app-api`。             |

当前 key 形态：

```text
rbac:admin-api:effective-permission-codes:<encodedUserId>:<userStateVersion>
rbac:app-api:effective-permission-codes:<encodedUserId>:<userStateVersion>
```

namespace 是为了避免两个应用共用 Redis/cache-manager 时互相污染。

## 7. RbacAuthorizationService 函数

所属模块：

- `libs/rbac-core/src/runtime/rbac-authorization.service.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-authorization.service.ts`
- `apps/app-api/src/modules/system/rbac/rbac-authorization.service.ts`

| 函数                                                                               | 作用                                                                     | 使用方式                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `RbacAuthorizationServiceBase.assertPermission(userId, permissionCode, options?)`  | 最终断言入口。无权限时通过应用错误工厂抛业务异常。                       | service 敏感操作、任务、RPC/gRPC。                      |
| `RbacAuthorizationServiceBase.checkPermission(userId, permissionCode, options?)`   | 单个 permission code 判断。配置错误会抛异常；用户无权限返回 `false`。    | `RbacGuard` 和业务分支调用。                            |
| `RbacAuthorizationServiceBase.checkPermissions(userId, permissionCodes, options?)` | 批量判断，返回 `Map<string, boolean>`。                                  | 详情页 `viewerCan`、批量按钮态。                        |
| `RbacAuthorizationServiceBase.getGrantedCodes(userId, options?)`                   | 返回用户当前 effective permission codes。                                | `/account/navigation`、展示能力。                       |
| `RbacAuthorizationStore.assertPermissionConfigured()`                              | 确认目标 code 存在、启用、未删除。                                       | 应用 Prisma adapter 实现。                              |
| `RbacAuthorizationStore.assertPermissionsConfigured()`                             | 批量确认目标 codes 有效。                                                | 应用 Prisma adapter 实现。                              |
| `RbacAuthorizationStore.hasEffectiveSuperAdminRole()`                              | 查询 effective user role 表上的超管角色。                                | 应用 Prisma adapter 实现。                              |
| `RbacAuthorizationStore.getAllEnabledPermissionCodes()`                            | 超管读取所有启用 permission code。                                       | 应用 Prisma adapter 实现。                              |
| `RbacAuthorizationStore.getEffectivePermissionCodesForUser()`                      | 读取 effective user permission 表。                                      | 应用 Prisma adapter 实现；base 会优先尝试跨请求 cache。 |
| app `RbacAuthorizationService`                                                     | 继承 base，注入本应用 store、错误工厂和可选 effective permission cache。 | 应用 DI 入口。                                          |

判断顺序：

1. 校验 `userId` 和 `permissionCode`。
2. 取 request cache。
3. 判断 effective 超管角色。
4. 超管：仍确认目标 code 有效，有效则允许。
5. 普通用户：读取 effective permission code set。
6. 命中 code：允许。
7. 未命中：确认目标 code 有效；有效则返回 `false`。

超管仍检查目标 code 是否有效，这是配置校验。超管绕过的是“是否被授予该 code”，不是绕过“代码声明了不存在/禁用的 code”。

## 8. 权限发现函数

所属模块：

- `apps/admin-api/src/modules/system/discovery/discovery.service.ts`
- `apps/app-api/src/modules/system/discovery/discovery.service.ts`

| 函数                                                           | 作用                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getCandidates()`                                              | 扫描 Nest controllers/providers，读取 `RBAC_PERMISSION_CANDIDATES_METADATA_KEY`，返回树和 action 列表。 |
| `getDiscoverableItems()`                                       | 合并 `DiscoveryService.getControllers()` 和 `getProviders()`。                                          |
| `getPermissionCandidates(target)`                              | 从 class 或 method 读取候选 metadata。                                                                  |
| `mergePermissionCandidates(classCandidates, methodCandidates)` | 合并 class 与 handler 候选，按 `permissionCode` 去重。                                                  |
| `assertConsistentPermissionCode(...)`                          | 同一个 permissionCode 的展示元数据必须一致，否则抛配置错误。                                            |
| `getMethods(metatype)`                                         | 只读取 descriptor.value，避免触发 getter。                                                              |

权限发现只生成候选项，不自动落库，不自动授权。

## 9. SystemRbacGraphService 与 core graph engine

所属模块：

- `libs/rbac-core/src/graph/rbac-graph.engine.ts`
- `apps/admin-api/src/modules/system/rbac/rbac-graph.service.ts`
- `apps/app-api/src/modules/system/rbac/rbac-graph.service.ts`

职责边界：

- app `SystemRbacGraphService` 负责 Prisma 读写、事务、重写目标 effective 行、推进 user-state 版本。
- core `createRbacGraphSnapshot()` 把角色、继承、角色权限、权限、菜单行整理成索引。
- core `buildRbacEffectiveStates()` 合并用户直接角色和用户组角色，再按角色继承展开权限和菜单。
- core `resolveRbacRoleDependentIdsFromIndex()` 用于角色继承变更时找依赖角色。

用户角色来源仍同时支持：

```text
UserRole
UserGroupMember -> UserGroupRole
```

角色继承只作用在“角色 -> 权限”的展开阶段；effective user role 表记录用户直接拥有和通过用户组获得的角色，不把继承父角色伪装成用户被直接分配的角色。

## 10. 菜单与导航调用链

```text
/account/navigation
  -> AccountService.getAccountNavigation()
  -> AdminUserStateService.getCompositeStateVersion()
  -> Redis navigation cache
  -> SystemRbacGraphService.getUserEffectiveState()
  -> RBAC visible menu/effective permission read model
  -> response menus + permissions + userStateVersion
```

菜单可见性：

```text
Role -> RolePermission -> Permission.code
Menu.requiredPermissionCode -> Permission.code
UserVisibleMenu = effective permission codes ∩ enabled menus
```

## 11. SpiceDB 接入边界

SpiceDB 路由级授权保持独立装饰器、独立 Guard、独立服务入口：

```text
@SpiceDbPermission(...)
  -> SpiceDbGuard
  -> SpiceDbService.checkPermission()
```

如果一个接口同时需要 RBAC 和 SpiceDB，就同时声明两个装饰器，并注册对应 Guard。这样每条链路都明确读取自己的 metadata、调用自己的服务、返回自己的错误。

SpiceDB 独立规则：

- SpiceDB 路由级授权只读取 `SPICEDB_PERMISSION_METADATA_KEY` 和 `SPICEDB_RESOLVERS_METADATA_KEY`。
- `SpiceDbGuard` 不读取 `RBAC_PERMISSION_CODE_METADATA_KEY`，也不根据 RBAC 菜单表推导 resource。
- `SpiceDbModule` 只提供默认 subject resolver；resource 必须由 `@SpiceDbPermission({ resourceType, resourceId })` 或 `@SpiceDbResolvers({ resource })` 显式声明。
- 显式关系授权接口使用 `@SpiceDbPermission(...)`，并让对应 module 注册 `SpiceDbGuard`。

## 12. 验证命令

```bash
pnpm exec nest build rbac-core
pnpm exec jest libs/common/src/decorators/public.decorator.spec.ts apps/admin-api/src/modules/system/rbac/rbac.guard.spec.ts apps/app-api/src/modules/system/rbac/rbac.guard.spec.ts --runInBand
pnpm exec jest apps/admin-api/src/modules/system/rbac/rbac-authorization.service.spec.ts apps/app-api/src/modules/system/rbac/rbac-authorization.service.spec.ts apps/admin-api/src/modules/system/rbac/rbac-effective-permission-cache.service.spec.ts apps/app-api/src/modules/system/rbac/rbac-effective-permission-cache.service.spec.ts apps/admin-api/src/modules/system/rbac/rbac-graph.service.spec.ts apps/app-api/src/modules/system/rbac/rbac-graph.service.spec.ts --runInBand
pnpm build:admin-api
pnpm build:app-api
```

