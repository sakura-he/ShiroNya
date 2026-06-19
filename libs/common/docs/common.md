# common 共享库说明

## 1. 依据代码清单

- `libs/common/src/common.module.ts`
- `libs/common/src/decorators/api-res.decorator.ts`
- `libs/common/src/decorators/audit-log.decorator.ts`
- `libs/common/src/decorators/public.decorator.ts`
- `libs/common/src/interceptors/response-format.interceptor.ts`
- `libs/common/src/interceptors/http-log-context.interceptor.ts`
- `libs/common/src/middleware/http-log.middleware.ts`
- `libs/common/src/filters/http-exception.filter.ts`
- `libs/common/src/filters/biz-exception.filter.ts`
- `libs/common/src/filters/unauth-exception.filter.ts`
- `libs/common/src/filters/uncatch-exception.filter.ts`
- `libs/common/src/filters/zod-exception.filter.ts`
- `libs/common/src/filters/zod-serialization-exception.filter.ts`
- `libs/common/src/logger/log.module.ts`
- `libs/common/src/logger/audit-log.service.ts`
- `libs/common/src/grpc/app-user-admin.helpers.ts`
- `libs/common/src/grpc/grpc-error.helpers.ts`

## 2. 库定位

`common` 提供项目通用的装饰器、过滤器、拦截器、中间件、日志、gRPC 辅助函数和错误约定。RBAC、SpiceDB 和 Cerbos ABAC 的权限分发由各自应用模块或专门库负责。

## 3. 子能力划分

- `decorators`：`@Public()`、`@AuditLog()`、`@ApiOkResByZod()` 等组合装饰器。
- `filters`：把 `BusinessException`、`UnauthException`、`HttpException`、Zod 校验错误和未捕获异常统一映射成 Shiro 错误结构。
- `interceptors`：请求上下文注入与统一响应包装。
- `middleware`：采集请求/响应快照、生成 `x-request-id`、记录用户行为日志和审计日志。
- `logger`：`LogModule` 与 `AuditLogService`，把审计数据落到审计表。
- `grpc`：gRPC wrapper、metadata、错误负载解析和 `AppUserAdmin` 契约辅助函数。
- `pipes` / `utils` / `constants`：参数校验、错误码、Redis 监听辅助等。

## 4. 关键能力说明

- `@Public()` 只写 `PUBLIC_KEY`，由各应用的 `BetterAuthSessionGuard` 读取，用来表示当前路由不要求 Better Auth session。
- `ApiOkResByZod()` 同时完成 `ApiOperation`、Swagger 200 响应定义和 `ZodSerializerDto` 注册，但 Controller 仍只返回业务数据。
- `ResponseFormatInterceptor` 统一把业务结果包装成 `{ data, code, message }`。
- `HttpLogContextInterceptor` 把 Controller/Handler 名称和 `@AuditLog()` 元数据写入请求对象。
- `HttpLogMiddleware` 在响应结束后输出用户行为日志，并调用 `AuditLogService.writeAuditLog()` 写库。
- HTTP 过滤器在输出错误响应前会尝试附带用户状态版本头，因此 `common` 与各应用 user-state 模块存在接口级协作。
- `grpc-error.helpers.ts` 把 HTTP/业务错误转换成带 metadata 的 gRPC 错误负载，供 `admin-api` 回放为本地异常。

## 5. 授权边界

基础 RBAC 授权在应用内实现：

- `apps/admin-api/src/modules/system/rbac/rbac.guard.ts`
- `apps/app-api/src/modules/system/rbac/rbac.guard.ts`
- `apps/*/src/modules/system/rbac/rbac-authorization.service.ts`

SpiceDB 路由级检查由对应应用或专门库提供自己的装饰器和 Guard。`common` 不承载 RBAC 表查询、菜单逻辑、投影表逻辑、Better Auth session 结构解析、Cerbos 策略或 SpiceDB tuple 同步。

## 6. 真实使用示例

```ts
@Post('create')
@AuditLog({ module: 'app_user', action: 'create', summary: '创建 App 用户', resourceType: 'app_user' })
@ApiOkResByZod({ summary: '创建用户', type: AppUserInfoDto })
async createUser() {
    return await this.userService.createUser(...);
}
```

运行时实际效果：

- Controller 只返回业务对象。
- `ResponseFormatInterceptor` 追加统一包装。
- `HttpLogMiddleware` 写操作日志与审计日志。
- 异常由过滤器统一转成 `{ code, message, data }`。

## 7. 相关文档

- 关系图：`common-module-class-diagram.md`
- logger 专项：`../src/logger/README.md`
- logger 关系图：`../src/logger/logger-module-class-diagram.md`
- gRPC 契约专项：`../src/grpc/docs/app-user-admin-grpc-contract.md`
- RBAC 运行时链路：`../../../docs/rbac-runtime-call-chain.md`
