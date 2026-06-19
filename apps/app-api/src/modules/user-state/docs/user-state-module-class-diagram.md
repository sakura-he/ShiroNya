# UserState 模块关系图

## 1. 建模说明

`AdminUserStateModule` 是后台“状态版本同步”模块。它自身没有 controller，也不直接承接业务写请求，但它横跨正常响应链路、异常响应链路和后台写操作链路，是权限菜单刷新、用户态刷新、前端缓存失效判断的共同支点。

## 2. 模块分层结论

- `AdminUserStateService` 是唯一的业务核心，实现版本读写、综合版本计算和响应头写入
- 综合版本只做 request 内 Promise memo；跨请求缓存由账号导航的版本化 Redis key 承担
- `ResponseFormatInterceptor` 负责正常响应场景下的版本头落盘
- `BaseExceptionFilter` 通过 `USER_STATE_HEADER_WRITER` 在异常响应场景复用同一套头写入能力
- `SystemRolesService`、`SystemMenusService`、`SystemUsersService`、`SystemUserGroupsService` 是主要版本 bump 上游
- `PrismaService` 和 `DEFAULT_REDIS` 分别承担持久化和缓存职责

```mermaid
classDiagram
    class AppModule
    class AdminUserStateModule
    class AdminUserStateService {
        +getUserVersion(userId)
        +bumpUserStateVersion(userId)
        +getRoleStateVersion(roleId, roleName)
        +bumpRoleStateVersion(roleId, roleName)
        +getMenuStateVersion()
        +bumpMenuStateVersion()
        +getCompositeStateVersion(input)
        +attachUserStateHeaders(request, response)
    }
    class ResponseFormatInterceptor
    class BaseExceptionFilter
    class UserStateHeaderWriter
    class SystemRolesService
    class SystemMenusService
    class SystemUsersService
    class SystemUserGroupsService
    class PrismaService
    class RedisClient

    AppModule --> AdminUserStateModule
    AppModule --> ResponseFormatInterceptor
    AppModule --> BaseExceptionFilter
    AdminUserStateModule --> AdminUserStateService
    AdminUserStateService ..|> UserStateHeaderWriter
    ResponseFormatInterceptor --> AdminUserStateService
    BaseExceptionFilter --> UserStateHeaderWriter
    SystemRolesService --> AdminUserStateService
    SystemMenusService --> AdminUserStateService
    SystemUsersService --> AdminUserStateService
    SystemUserGroupsService --> AdminUserStateService
    AdminUserStateService --> PrismaService
    AdminUserStateService --> RedisClient
```

```mermaid
flowchart LR
    Role["SystemRolesService"]
    Menu["SystemMenusService"]
    User["SystemUsersService"]
    Group["SystemUserGroupsService"]
    State["AdminUserStateService"]
    Redis["DEFAULT_REDIS"]
    DB["state_version"]
    Response["ResponseFormatInterceptor"]
    Filter["BaseExceptionFilter"]
    Client["管理后台前端"]

    Role --> State
    Menu --> State
    User --> State
    Group --> State
    State --> Redis
    State --> DB
    Response --> State
    Filter --> State
    State --> Client
```

```mermaid
sequenceDiagram
    participant Client as 前端
    participant Interceptor as ResponseFormatInterceptor
    participant Handler as 业务 handler
    participant State as AdminUserStateService
    participant Redis as DEFAULT_REDIS
    participant DB as StateVersion

    Client->>Interceptor: 请求（可携带 x-user-state-version）
    Interceptor->>Handler: next.handle()
    Handler-->>Interceptor: 业务结果
    Interceptor->>State: attachUserStateHeaders(req, res)
    State->>Redis: 读取 menu / user / role 版本
    alt Redis 未命中
        State->>DB: 查询角色 app-api:role:<roleId> 或菜单版本
        DB-->>State: 已有版本或空
        alt DB 也为空
            State->>DB: create / upsert 新版本
        end
        State->>Redis: 回填缓存
    end
    State->>State: 计算 sha256 综合版本
    Note over State: 综合版本只在请求内 memo
    State-->>Interceptor: x-user-state-version
    Interceptor-->>Client: 响应体 + 版本头
```

```mermaid
sequenceDiagram
    participant Role as SystemRolesService / SystemMenusService / SystemUsersService / SystemUserGroupsService
    participant State as AdminUserStateService
    participant DB as StateVersion
    participant Redis as DEFAULT_REDIS

    Role->>State: bump*Version(...)
    alt 角色或菜单版本
        State->>DB: upsert(type, name, version)
        State->>Redis: set(ver:app-api:...)
    else 用户版本
        State->>Redis: set(ver:app-api:user:{userId}, version)
    end
    State-->>Role: nextVersion
```

```mermaid
stateDiagram-v2
    [*] --> SessionCheck
    SessionCheck --> SkipWrite: session 不存在
    SessionCheck --> LoadVersions: session 有效
    LoadVersions --> CacheHit: Redis 命中
    LoadVersions --> DbFallback: Redis 未命中
    DbFallback --> CacheHydrated: DB 命中并回填 Redis
    DbFallback --> Initialized: DB 无记录时初始化版本
    CacheHit --> Compose
    CacheHydrated --> Compose
    Initialized --> Compose
    Compose --> HeaderWritten
    HeaderWritten --> ChangedFlag: 请求头版本不一致
    HeaderWritten --> [*]: 请求头版本一致或未携带
    ChangedFlag --> [*]
```

```mermaid
erDiagram
    state_version {
        int id PK
        string type
        string name
        string version
        datetime created_at
        datetime updated_at
    }
```

