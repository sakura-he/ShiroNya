# app-api 架构总图

## 1. 建模说明
- 图中只描述当前源码里已经接线的运行链路。
- HTTP 链路统一带 `/app` 前缀；Better Auth 运行时路由由 `nestjs-better-auth` 挂载，不额外在本文件展开内部实现。
- gRPC 图只覆盖 `AppUserAdmin` 服务，因为这是当前代码里唯一对外微服务。
- `AppModule` 装配 Better Auth session、RBAC effective 读模型、Prisma、MongoDB、Redis 与业务服务，协同完成角色、菜单、用户状态和控制面链路。

## 2. 应用模块总览图
```mermaid
flowchart LR
    Client["移动端 / Web 客户端"]
    App["app-api HTTP"]
    BA["Better Auth Runtime"]
    Account["Account"]
    Chat["Chat"]
    System["System"]
    Rbac["RBAC"]
    Abac["Cerbos ABAC"]
    Common["Common"]
    UserState["UserState"]
    Grpc["app_user_admin gRPC"]
    Prisma["PostgreSQL via Prisma"]
    Mongo["MongoDB"]
    Redis["Redis"]

    Client --> App
    App --> BA
    App --> Account
    App --> Chat
    App --> System
    App --> Rbac
    App --> Abac
    App --> Common
    App --> UserState
    App --> Grpc
    Account --> Prisma
    BA --> Prisma
    BA --> Redis
    Chat --> Mongo
    System --> Prisma
    Common --> Prisma
    UserState --> Prisma
    UserState --> Redis
    Rbac --> Prisma
    Abac --> Prisma
```

## 3. Bootstrap 时序图
```mermaid
sequenceDiagram
    participant Main as main.ts
    participant Nest as NestFactory
    participant AppModule as AppModule
    participant BetterAuth as BetterAuthModule
    participant Rbac as SystemRbacModule
    participant Grpc as app_user_admin gRPC
    participant Http as HTTP Server

    Main->>Nest: create(AppModule)
    Nest->>AppModule: 装配 Config / Redis / Prisma / Mongo / BetterAuth / RBAC / AppUserAdmin
    AppModule->>BetterAuth: forRootAsync()
    AppModule->>Rbac: 注册 RBAC Guard 和 effective 读模型服务
    Main->>Main: setGlobalPrefix('/app')
    Main->>Grpc: connectMicroservice()
    Main->>Grpc: useGlobalFilters(ShiroGrpcExceptionFilter)
    Main->>Http: useGlobalInterceptors / Pipes / Swagger
    Main->>Grpc: startAllMicroservices()
    Main->>Http: listen(APP_API_PORT)
```

## 4. 请求处理链路图
```mermaid
flowchart TD
    Req["HTTP Request"]
    Middleware["HttpLogMiddleware"]
    InterceptorA["HttpLogContextInterceptor"]
    Session["Better Auth Session / Public 判定"]
    Controller["Controller / Better Auth Handler"]
    Service["Service"]
    Store["Prisma / Mongo / Redis / Better Auth API"]
    InterceptorB["ResponseFormatInterceptor"]
    Filter["Exception Filters + UserState Header Writer"]
    Res["HTTP Response"]

    Req --> Middleware
    Middleware --> InterceptorA
    InterceptorA --> Session
    Session --> Controller
    Controller --> Service
    Service --> Store
    Store --> InterceptorB
    InterceptorB --> Filter
    Filter --> Res
```

## 5. 认证与业务状态链路图
```mermaid
sequenceDiagram
    participant Client as Client
    participant Auth as Better Auth Runtime
    participant BA as AppBetterAuthService
    participant State as UserStateService
    participant Controller as Business Controller
    participant Service as Business Service

    Client->>Auth: 登录或会话请求
    Auth->>BA: 校验手机号 / Session
    BA->>State: 新用户初始化或版本刷新
    Client->>Controller: 携带 session 访问业务接口
    Controller->>Service: 读取 @Session() / request.session
    Service-->>Client: 业务数据
```

## 6. 数据与基础设施拓扑图
```mermaid
flowchart LR
    App["app-api"]
    PG["PostgreSQL"]
    MG["MongoDB"]
    RD["Redis"]
    BA["Better Auth internal adapter"]

    App -->|Prisma| PG
    App -->|Mongoose| MG
    App -->|Cache / Bull / secondaryStorage / UserState| RD
    App -->|进程内调用| BA
```

## 7. 跨服务交互图
```mermaid
flowchart LR
    Admin["admin-api"]
    App["app-api"]
    BA["Better Auth internal adapter"]
    PG["PostgreSQL"]
    MG["MongoDB"]
    RD["Redis"]

    Admin -->|mTLS gRPC: app_user_admin| App
    App -->|进程内调用| BA
    App --> PG
    App --> MG
    App --> RD
```
