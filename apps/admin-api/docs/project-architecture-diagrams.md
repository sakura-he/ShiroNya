# admin-api 架构总图

## 1. 建模说明

- 图只覆盖当前仓库里已接线的后台链路。
- 核心能力是 Better Auth cookie session、RBAC effective 读模型、PostgreSQL 元数据、Redis 缓存与用户状态版本、SpiceDB 显式关系、Cerbos ABAC，以及 Kafka Watch 投影同步。
- `system/spicedb-data` 是数据管理和排障入口；用户、角色、菜单、用户组的基础授权写入走 RBAC Service。

## 2. 应用模块总览图

```mermaid
flowchart LR
    AdminUI["管理端前端"]
    Admin["admin-api HTTP"]
    Auth["Better Auth"]
    Account["Account"]
    Rbac["RBAC"]
    Abac["Cerbos ABAC"]
    AppControl["App Control Plane"]
    DataTool["System SpiceDbData"]
    Stream["SpiceDB Stream"]
    System["Task / Audit / Common / Sat"]
    State["UserState"]
    Redis["Redis"]
    Prisma["PostgreSQL"]
    SpiceDb["SpiceDB"]
    Kafka["Kafka / Redpanda"]

    AdminUI --> Admin
    Admin --> Auth
    Admin --> Account
    Admin --> Rbac
    Admin --> Abac
    Admin --> AppControl
    Admin --> DataTool
    Admin --> Stream
    Admin --> System
    Admin --> State
    Account --> Rbac
    Rbac --> Prisma
    Abac --> Prisma
    Abac --> Cerbos
    DataTool --> SpiceDb
    AppControl --> AppApi["app-api gRPC"]
    Stream --> Kafka
    Stream --> Prisma
    Admin --> Redis
    Admin --> Prisma
```

## 3. Bootstrap 时序图

```mermaid
sequenceDiagram
    participant Main as main.ts
    participant Nest as NestFactory
    participant AppModule as AppModule
    participant BetterAuth as BetterAuthModule
    participant Rbac as SystemRbacModule
    participant SpiceDb as AdminSpiceDbAuthorizationModule
    participant Data as SpiceDbDataModule
    participant Stream as AdminSpiceDbStreamConsumerModule
    participant Cache as RedisModule
    participant Http as HTTP Server

    Main->>Nest: create(AppModule)
    Nest->>AppModule: 装配 Prisma Redis BetterAuth RBAC SpiceDB ABAC 业务模块
    AppModule->>BetterAuth: forRootAsync()
    AppModule->>Rbac: 注册 RBAC Guard 和管理服务
    AppModule->>SpiceDb: 注册授权运行时服务
    AppModule->>Data: 注册 SpiceDB 数据管理服务
    AppModule->>Stream: 注册 Watch 消费与指标
    AppModule->>Cache: forRootAsync(DEFAULT_REDIS)
    Main->>Http: setGlobalPrefix('/admin')
    Main->>Http: Swagger CORS static
    Main->>Http: listen(3000)
```

## 4. 请求处理链路图

```mermaid
flowchart TD
    Req["HTTP Request"]
    Middleware["HttpLogMiddleware"]
    Context["HttpLogContextInterceptor"]
    Auth["Better Auth Session"]
    RbacGuard["RbacGuard"]
    Controller["Controller"]
    Service["Service"]
    Downstream["Prisma / Redis / SpiceDB / Kafka"]
    Format["ResponseFormatInterceptor"]
    Filter["Exception Filters"]
    Res["HTTP Response"]

    Req --> Middleware
    Middleware --> Context
    Context --> Auth
    Auth --> RbacGuard
    RbacGuard --> Controller
    Controller --> Service
    Service --> Downstream
    Downstream --> Format
    Format --> Filter
    Filter --> Res
```

## 5. 认证与权限能力链路图

```mermaid
sequenceDiagram
    participant Client as Admin UI
    participant Auth as Better Auth
    participant Session as ShiroAdminBetterAuthService
    participant Rbac as RBAC effective roles
    participant DB as PostgreSQL
    participant Controller as Controller

    Client->>Auth: POST /admin/api/auth/sign-in/username
    Auth->>Session: buildCustomSession
    Session->>Rbac: 读取用户有效角色
    Session->>DB: 读取启用角色和 profile
    Auth-->>Client: Set-Cookie(admin-api.session)
    Client->>Controller: 携带 Cookie 访问业务接口
    Controller-->>Client: HTTP 响应
```

## 6. 数据与基础设施拓扑图

```mermaid
flowchart LR
    Admin["admin-api"]
    PG["PostgreSQL"]
    RD["Redis"]
    SpiceDb["SpiceDB"]
    Kafka["Kafka / Redpanda"]
    Web["admin-web"]

    Web -->|HTTP| Admin
    Admin -->|Prisma| PG
    Admin -->|node-redis| RD
    Admin -->|gRPC client| SpiceDb
    Admin -->|watch consume| Kafka
```

## 7. 权限关系写入图

```mermaid
sequenceDiagram
    participant UI as Admin UI
    participant User as SystemUsersService
    participant Role as SystemRolesService
    participant Menu as SystemMenusService
    participant Group as SystemUserGroupsService
    participant Rbac as SystemRbacGraphService
    participant State as AdminUserStateService

    UI->>User: 分配用户直接角色
    User->>Rbac: 重建用户 effective
    User->>State: bumpUserStateVersion

    UI->>Role: 保存角色任务授权
    Role->>Rbac: 重建受影响用户 effective
    Role->>State: bumpRoleStateVersion

    UI->>Menu: 创建删除菜单或分配菜单角色
    Menu->>Rbac: 按 requiredPermissionCode 重建可见菜单
    Menu->>State: bumpMenuStateVersion

    UI->>Group: 保存用户组成员和角色
    Group->>Rbac: 重建用户组影响用户 effective
    Group->>State: bump 用户和角色版本
```
