# cerbos 关系图

## 1. 建模说明

本图覆盖 `libs/cerbos` 当前运行链路：

- `CerbosModule` 通过 `envPrefix` 注册独立实例。
- `CerbosGuardFor(prefix)` 通过 DI 注入对应实例。
- `@CerbosPolicy()` 在 handler 上声明 resource/action/attr。
- `CerbosAbacModule` 通过同一 prefix 复用 Cerbos 实例。

## 2. 当前应用接线

```mermaid
flowchart LR
    AdminApp["admin-api AppModule"]
    AppApp["app-api AppModule"]
    AdminCerbos["Cerbos ADMIN_"]
    AppCerbos["Cerbos APP_"]
    AdminAbac["admin-api SystemAbac"]
    AppAbac["app-api AppUserAdmin ABAC"]

    AdminApp --> AdminCerbos
    AppApp --> AppCerbos
    AdminAbac --> AdminCerbos
    AppAbac --> AppCerbos
```

说明：

- `ADMIN_` 服务 admin-api 的 Cerbos Policy 和 ABAC。
- `APP_` 服务 app-api 的 Cerbos Policy 和 ABAC。
- 两个实例使用独立环境变量前缀和 provider token。

## 3. 类图

```mermaid
classDiagram
    class CerbosModule {
        +forRoot(options) DynamicModule
        +forRootAsync(options) DynamicModule
        +getServiceToken(prefix) string
        +getOptionsToken(prefix) string
    }
    class CerbosGuardFor {
        +CerbosGuardFor(prefix) Type~CanActivate~
    }
    class CerbosGuardMixin {
        -cerbosService: CerbosService
        -options: CerbosModuleOptions
        -reflector: Reflector
        +canActivate(context) Promise~boolean~
    }
    class CerbosService {
        +checkResource(params)
        +checkResources(params)
        +isAllowed(params) Promise~boolean~
        +getClient() GRPC
    }
    class CerbosPolicy {
        +prefix: string
        +resource: string
        +action: string
    }
    class InjectCerbos
    class CerbosAbacModule

    CerbosModule --> CerbosService : envPrefix token
    CerbosGuardFor --> CerbosGuardMixin : mixin cache
    CerbosGuardMixin --> CerbosService : DI by prefix
    CerbosGuardMixin --> CerbosPolicy : reads metadata
    InjectCerbos --> CerbosService : inject by prefix
    CerbosAbacModule --> CerbosService : useExisting by prefix
```

## 4. 普通 HTTP 鉴权流程

```mermaid
flowchart TD
    Req["HTTP 请求"]
    Guard["CerbosGuardFor(prefix)"]
    Policy{"handler 有 @CerbosPolicy"}
    User["userFromContext"]
    Attr["resolve principal/resource attrs"]
    Check["CerbosService.isAllowed"]
    Allow{"allowed"}
    Handler["进入 handler"]
    Deny["403 Forbidden"]

    Req --> Guard
    Guard --> Policy
    Policy -->|否| Handler
    Policy -->|是| User
    User --> Attr
    Attr --> Check
    Check --> Allow
    Allow -->|是| Handler
    Allow -->|否| Deny
```

## 5. ABAC 复用流程

```mermaid
sequenceDiagram
    participant Guard as CerbosAbacGuard
    participant Runtime as CerbosAbacRuntimeService
    participant Cerbos as CerbosService
    participant Server as Cerbos gRPC

    Guard->>Runtime: check(code, context, options)
    Runtime->>Runtime: 读取 ABAC binding 和 principal/resource attr
    Runtime->>Cerbos: isAllowed(action=code)
    Cerbos->>Server: checkResource
    Server-->>Cerbos: allow / deny
    Cerbos-->>Runtime: boolean
    Runtime-->>Guard: allowed
```

## 6. 配置关系

```text
admin-api
  -> ADMIN_CERBOS_ENDPOINT
  -> ADMIN_CERBOS_TLS_*
  -> CerbosService[ADMIN_]

app-api
  -> APP_CERBOS_ENDPOINT
  -> APP_CERBOS_TLS_*
  -> CerbosService[APP_]
```

## 7. 回归检查

- `CerbosGuardFor('ADMIN_')` 注入 `ADMIN_` 实例。
- `CerbosGuardFor('APP_')` 注入 `APP_` 实例。
- 没有 `@CerbosPolicy()` 的 handler 放行。
- `@CerbosPolicy()` 缺 prefix 时在装饰器阶段报错。
- ABAC 模块按 `cerbosEnvPrefix` 复用正确实例。
