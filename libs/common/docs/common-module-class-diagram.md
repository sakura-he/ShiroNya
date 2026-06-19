# common 关系图

## 1. 建模说明
本图只画当前两个应用确实使用到的公共能力：请求日志、审计日志、统一响应、异常归一和 gRPC 错误传输。

## 2. 模块分层结论
- `decorators` 定义声明式元数据。
- `interceptors` 与 `middleware` 负责运行期上下文收集。
- `filters` 负责错误出口统一。
- `logger` 负责最终落库。
- `grpc helpers` 负责跨服务传输一致性。

```mermaid
classDiagram
    class ApiOkResByZod
    class AuditLogDecorator
    class HttpLogContextInterceptor
    class ResponseFormatInterceptor
    class HttpLogMiddleware
    class AuditLogService
    class BusinessExceptionFilter
    class HttpExceptionFilter
    class UnauthExceptionFilter
    class UncatchExceptionFilter
    class ZodValidationExceptionFilter
    class ZodSerializationExceptionFilter
    class GrpcErrorHelpers

    AuditLogDecorator --> HttpLogContextInterceptor
    HttpLogContextInterceptor --> HttpLogMiddleware
    HttpLogMiddleware --> AuditLogService
    ResponseFormatInterceptor --> ApiOkResByZod
    BusinessExceptionFilter --> AuditLogService
    HttpExceptionFilter --> AuditLogService
    UnauthExceptionFilter --> AuditLogService
    UncatchExceptionFilter --> AuditLogService
    ZodValidationExceptionFilter --> AuditLogService
    ZodSerializationExceptionFilter --> AuditLogService
    GrpcErrorHelpers --> HttpExceptionFilter
```

```mermaid
flowchart TD
    Decorator["@AuditLog / @ApiOkResByZod / @Public"]
    Interceptor["HttpLogContextInterceptor"]
    Middleware["HttpLogMiddleware"]
    Filters["异常过滤器组"]
    Logger["AuditLogService"]
    Grpc["gRPC helpers"]

    Decorator --> Interceptor
    Interceptor --> Middleware
    Middleware --> Logger
    Filters --> Logger
    Filters --> Grpc
```

```mermaid
sequenceDiagram
    participant Req as Request
    participant I as HttpLogContextInterceptor
    participant C as Controller
    participant R as ResponseFormatInterceptor
    participant M as HttpLogMiddleware
    participant A as AuditLogService

    Req->>I: 注入 controllerHandler / audit 元数据
    I->>C: 执行业务
    C-->>R: 返回业务数据
    R-->>M: 统一包装
    M->>A: writeAuditLog()
```

```mermaid
erDiagram
    audit_log {
        string app
        string module
        string action
        string requestId
        string result
        json requestBody
        json responseBody
    }
```

