# app-api 项目总说明

## 1. 依据代码清单

- `apps/app-api/src/main.ts`
- `apps/app-api/src/modules/app.module.ts`
- `apps/app-api/src/modules/better-auth/better-auth.module.ts`
- `apps/app-api/src/modules/better-auth/better-auth.service.ts`
- `apps/app-api/src/modules/better-auth/better-auth-options.ts`
- `apps/app-api/src/modules/better-auth/better-auth-session.guard.ts`
- `apps/app-api/src/modules/account/account.controller.ts`
- `apps/app-api/src/modules/account/account.service.ts`
- `apps/app-api/src/modules/user-state/admin-user-state.service.ts`
- `apps/app-api/src/modules/app-user-admin/app-user-admin.module.ts`
- `apps/app-api/src/modules/app-user-admin/admin-control-plane-access.service.ts`
- `apps/app-api/src/modules/app-user-admin/rbac/rbac-admin-control-plane.service.ts`
- `apps/app-api/src/modules/app-user-admin/abac/abac-admin.grpc.controller.ts`
- `apps/app-api/src/modules/system/users/users-admin.grpc.controller.ts`
- `apps/app-api/src/modules/system/users/users-admin.service.ts`
- `apps/app-api/src/modules/better-auth/better-auth-admin.grpc.controller.ts`
- `apps/app-api/src/modules/system/menus/menus-policy.grpc.controller.ts`
- `apps/app-api/src/modules/chat/chat.module.ts`
- `apps/app-api/src/modules/chat/character/character.service.ts`
- `apps/app-api/src/modules/chat/session/session.service.ts`
- `apps/app-api/src/modules/chat/message/message.service.ts`
- `apps/app-api/src/modules/system/tasks/tasks.controller.ts`
- `apps/app-api/src/modules/system/tasks/tasks.service.ts`
- `apps/app-api/src/modules/system/audit-logs/audit-logs.controller.ts`
- `apps/app-api/src/modules/system/audit-logs/audit-logs.service.ts`
- `libs/common/src/interceptors/response-format.interceptor.ts`
- `libs/common/src/interceptors/http-log-context.interceptor.ts`
- `libs/common/src/middleware/http-log.middleware.ts`
- `libs/common/src/logger/audit-logs.service.ts`
- `libs/prisma-app/src/prisma.service.ts`
- `libs/mongodb/src/mongodb.module.ts`
- `proto/app-user-admin.proto`

## 2. 一句话总览

`app-api` 是用户端 Nest 应用，主 HTTP 入口使用 Better Auth session、Prisma、MongoDB、Redis 和本地 RBAC；同一进程额外暴露带 mTLS 的 `app_user_admin` gRPC 服务，供 `admin-api` 管理 App 用户、App RBAC、菜单策略和 App ABAC。

## 3. 启动入口与应用装配

- 入口在 `main.ts`，HTTP 全局前缀为 `/app`，版本通过 `version` 请求头控制。
- 同一个进程内同时启动 HTTP 服务和 `AppUserAdmin` gRPC microservice。
- `AppModule` 聚合了 `Account`、`BetterAuth`、`UserState`、`AppUserAdmin`、`Chat`、`SystemRbac`、`AuthzPermission`、`SpiceDbData`、`SpiceDbStream`、`Task`、`AuditLog`、`Menu`、`Role`、`User`、`UserGroup`、`Common`、`Sat` 以及 `Prisma`、`MongoDB`、`Redis`、`Log`。
- `BetterAuthModule.forRootAsync()` 负责组装 Better Auth 运行时，`/app/api/auth/*` 由 `nestjs-better-auth` 动态挂载。

## 4. 全局中间件、过滤器、拦截器、管道

- `HttpLogMiddleware` 记录请求、响应、请求头、响应头、审计上下文与 `x-request-id`。
- `HttpLogContextInterceptor` 在请求进入 Controller 前写入 `controllerHandler` 与 `AuditLog` 元数据。
- `ResponseFormatInterceptor` 将 Controller 的业务返回统一包装成 `{ data, code, message }`。
- 全局管道为 `ZodValidationPipe`。
- 全局过滤器顺序为 `UncatchExceptionFilter` → `HttpExceptionFilter` → `UnauthExceptionFilter` → `BusinessExceptionFilter` → `ZodValidationExceptionFilter` → `ZodSerializationExceptionFilter`。
- `UserStateService` 通过 `USER_STATE_HEADER_WRITER` 注入到过滤器链，在成功或失败响应上补写 `x-user-state-version` / `x-user-state-changed`。
- gRPC 侧额外显式注册 `ShiroGrpcExceptionFilter`，因为 hybrid 模式下 HTTP 的 `APP_FILTER` 不会自动作用到 RPC transport。

## 5. 模块分层与业务域

- 认证层：`better-auth` 负责 session、短信验证码限流、默认 RBAC 角色绑定、customSession 组装；Better Auth 自带 `role` 固定为 `user`，不作为权限判断来源。
- 账户层：`account` 直接基于会话回传当前用户信息，并通过 RBAC effective 读模型返回可见菜单与当前权限 code。
- 用户状态层：`user-state` 维护用户、角色、菜单三类版本号，并输出客户端刷新协议信号。
- App 用户管理层：`app-user-admin` 负责 gRPC 控制面装配和 access 校验，具体 gRPC controller 与服务按 `user`、`better-auth`、`menu`、`rbac`、`abac` 业务目录归档。
- RBAC / ABAC 管理层：`system/rbac` 提供 app 侧基础授权和 effective 读模型，`app-user-admin/rbac` 与 `app-user-admin/abac` 为 admin-api 控制面提供 gRPC 管理入口。
- 聊天域：`chat` 聚合 `character`、`session`、`message` 三个 Mongo 模块，分别管理角色卡、会话、消息与 swipes。
- 后台辅助域：`system/task` 管理定时任务，`system/audit-log` 查询审计日志，`common/upload` 管理切片上传，`common/dict` 管理字典。

## 6. 认证、权限、日志、缓存与数据库

- Better Auth 插件启用了 `expo`、`localization`、`admin`、`APP_BETTER_AUTH_API_KEY`、`bearer`、`openAPI`、`phoneNumber`、`customSession`；`admin` 插件只作为内部用户管理能力使用，不通过 BA role 授权。
- `AppBetterAuthService` 负责短信验证码限流、IP 识别、secondaryStorage、注册后初始化 `betterAuthUserProfile` 与默认 `user` RBAC 角色。
- 公开接口统一使用 `@app/common` 提供的 `@Public()`；它只让 Better Auth session guard 不要求 session。读取当前会话仍使用 `@thallesp/nestjs-better-auth` 的 `@Session()`。
- Better Auth 会话校验是当前认证基础；基础接口授权由 `BetterAuthSessionGuard` + `RbacGuard` 直连 RBAC effective 权限读模型。
- PostgreSQL 由 `PrismaService` 提供，Mongo 集中承载聊天模型，Redis 同时承担 Cache、BullMQ、Better Auth secondaryStorage 和用户状态版本缓存。
- 审计日志通过 `AuditLogService` 落到 `audit_log` 表；任务、用户、菜单、角色等写操作都通过 `@AuditLog` 在中间件中统一记录。

## 7. 关键调用链

- 用户端导航链路：`GET /app/account/navigation` → `AccountService.getAccountNavigation()` → `SystemRbacGraphService.getUserEffectiveState()` → RBAC 可见菜单与权限 code。
- Better Auth 新用户链路：Better Auth `databaseHooks.user.create.after` → `initializeNewUser()` → 创建 `betterAuthUserProfile` → 绑定默认 `user` RBAC 角色 → `bumpUserStateVersion()`。
- 用户状态链路：控制器正常返回/异常返回 → 过滤器调用 `UserStateService.attachUserStateHeaders()` → 响应头返回最新组合版本 → 客户端按需刷新用户资料/角色/菜单。
- 后台远程管理链路：`admin-api` HTTP → gRPC client → 领域 gRPC controller（`UserAdminGrpcController` / `BetterAuthAdminGrpcController` / `MenuPolicyGrpcController`）→ app 内部管理服务 → Better Auth internal adapter / Prisma。
- 聊天链路：`character` 维护角色卡；`session` 会创建 `chat_metadata` 与角色快照；`message` 在会话下写入用户消息、AI 候选消息和 `swipe_info`。

## 8. 环境变量与外部依赖

- HTTP/gRPC：`APP_API_PORT`、`APP_USER_ADMIN_GRPC_HOST`、`APP_USER_ADMIN_GRPC_PORT`
- gRPC TLS：`APP_USER_ADMIN_GRPC_TLS_CA_PATH`、`APP_USER_ADMIN_GRPC_TLS_SERVER_CERT_PATH`、`APP_USER_ADMIN_GRPC_TLS_SERVER_KEY_PATH`
- Better Auth：`APP_NAME`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`JWT_SIGNING_KEY`
- 数据与缓存：`APP_DATABASE_URL`、`MONGODB_URI`、`APP_REDIS_URL` 或 `APP_REDIS_HOST`、`APP_REDIS_PORT`、`APP_REDIS_USER`、`APP_REDIS_PASSWORD`

## 9. 推荐阅读顺序

- 应用总图：`project-architecture-diagrams.md`
- 认证与会话：`../src/modules/better-auth/docs/better-auth.md`
- 用户状态与跨服务管理：`../src/modules/user-state/docs/user-state.md`、`../../../docs/app-admin-control-plane.md`
- 聊天域：`../src/modules/chat/docs/chat.md`
- 基础设施：`../../../libs/prisma-app/src`、`../../../libs/mongodb/docs/mongodb.md`
