# Logger 模块

Shiro Nya 统一日志模块，基于 Winston 实现，提供结构化日志输出、控制台彩色打印和文件按日轮转落盘。

## 架构概览

```
writeRuntimeLog(input)
  ├── buildRuntimeEntry()          构造 RuntimeLogEntry 结构体
  └── Winston Logger
        ├── Console transport      NestJS 风格彩色控制台输出
        └── DailyRotateFile        JSON Lines 文件落盘（按 appName + logType 分文件）
                ↓
        Promtail 采集 → Grafana Loki
```

日志引擎使用 Winston，控制台输出复刻 NestJS ConsoleLogger 的配色风格，文件落盘使用 `winston-daily-rotate-file` 按日期自动轮转。审计日志只输出控制台，不落盘文件（由 `AuditLogService` 写入数据库）。

## 文件说明

| 文件                   | 职责                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `runtime-logger.ts`    | 核心日志引擎：Winston 实例管理、控制台/文件 transport、对外 API |
| `runtime-log.types.ts` | 所有日志相关的 TypeScript 类型定义                              |
| `runtime-log.util.ts`  | 工具函数：脱敏、请求上下文、操作者提取、审计推断等              |
| `audit-log.service.ts` | 审计日志落库服务（依赖 Prisma，通过 DI 注入）                   |
| `log.module.ts`        | NestJS 全局模块，注册 `AuditLogService`                         |
| `index.ts`             | 统一导出入口                                                    |

## 日志类型

| logType       | 说明                                            | 文件落盘 | 数据库落库 |
| ------------- | ----------------------------------------------- | -------- | ---------- |
| `system`      | 系统/框架日志（启动、Redis 连接、异常过滤器等） | ✅       | ❌         |
| `user_action` | 用户操作日志（HTTP 请求、业务操作）             | ✅       | ❌         |
| `audit`       | 审计日志（登录、权限变更等安全敏感操作）        | ❌       | ✅         |

## 日志级别

与 NestJS LogLevel 对齐，优先级从高到低：

| 级别      | 控制台颜色 | 输出流 | 典型场景                       |
| --------- | ---------- | ------ | ------------------------------ |
| `fatal`   | 红色       | stderr | 致命错误，进程即将退出         |
| `error`   | 红色       | stderr | 运行时错误                     |
| `warn`    | 黄色       | stdout | 警告（4xx 响应、重试等）       |
| `info`    | 绿色       | stdout | 常规信息（启动成功、请求完成） |
| `debug`   | 品红       | stdout | 调试信息                       |
| `verbose` | 青色       | stdout | 详细追踪信息                   |

颜色由 `SHIRO_LOG_COLORS` 统一定义（Winston 颜色名格式），通过 `winston.addColors()` 注册后由 `winstonColorizer.colorize()` 统一着色，代码中不存在手动 ANSI 颜色码。

## 使用方式

### 1. createRuntimeLogger — 最常用的方式

纯函数，不依赖 DI 容器，可在任意位置使用（模块顶层、main.ts、Guard、工具函数等）。

```typescript
import { createRuntimeLogger } from '@app/common';

// 模块顶层创建（推荐）
const logger = createRuntimeLogger('my_module');

// 基础用法 — 标题行 + detail（system/audit 为完整结构，user_action 为摘要）
logger.info('服务启动成功');
logger.warn('配置项缺失，使用默认值');
logger.error('数据库连接失败', { host: 'localhost', port: 5432 });
logger.fatal('进程即将退出', { reason: 'bootstrap_failed' });
logger.debug('查询参数', { userId: '123', page: 1 });
logger.verbose('详细追踪信息');

// .title() 变体 — 标题行单独输出，context 换到下一行并用同级别颜色箭头标记
logger.info.title('Redis 连接成功', { host: 'localhost', port: 6379 });
logger.warn.title('缓存未命中');

// 带结构化上下文（完整日志模式）
logger.info('用户登录成功', {
    userId: 'user-123',
    loginMethod: 'password',
    ip: '192.168.1.1'
});
```

每个级别方法（`info` / `warn` / `error` / `fatal` / `debug` / `verbose`）都支持 `.title()` 变体：

- `logger.info('msg', ctx)` — 输出标题行 + detail 结构体（非生产环境；`user_action` 会裁剪成摘要）
- `logger.info.title('msg', args)` — 输出标题行；args 不为空时换到下一行，以同级别颜色的 `▶` 标记，不附加完整 detail

### 2. writeSystemLog — 系统日志

适合在工具函数、Redis 监听器等非模块化场景中使用。

```typescript
import { writeSystemLog } from '@app/common';

writeSystemLog({
    level: 'info',
    module: 'redis_listener',
    message: 'Redis connected successfully',
    context: { connectionName: 'default' }
});
```

### 3. writeUserActionLog — 用户操作日志

通常由 `HttpLogMiddleware` 自动调用，也可手动写入。

```typescript
import { writeUserActionLog } from '@app/common';

writeUserActionLog({
    level: 'info',
    module: 'order',
    message: '用户下单成功',
    userId: 'user-123',
    requestId: 'req-abc',
    actor: { id: 'user-123', type: 'user', name: '张三' },
    resource: { type: 'order', id: 'order-456', action: 'create' },
    result: { success: true }
});
```

`user_action` 在非生产环境控制台只打印摘要字段（`id`、`ts`、`level`、`logType`、`app`、`env`、`module`、`userId`、`labels`、`message`、`event`、`requestId`、`caller`、`actor`），完整 `http / rpc / resource / result / error / context` 仍会写入 JSON Lines 文件。

### 4. writeAuditConsoleLog — 审计日志（仅控制台）

审计日志只输出到控制台，实际落库由 `AuditLogService` 处理。

```typescript
import { writeAuditConsoleLog } from '@app/common';

writeAuditConsoleLog({
    level: 'info',
    module: 'auth',
    message: '用户登录',
    userId: 'user-123',
    event: 'login'
});
```

### 5. AuditLogService — 审计日志落库（DI 注入）

在 NestJS 模块中通过依赖注入使用，自动写入数据库 + 输出控制台。
`writeAuditLog()` 会返回落库结果；落库失败时不会反向打断已发生的业务动作，但会补写一条
`system` 错误日志，并在返回值里暴露结构化错误，便于调用方按场景决定是否告警或重试。

```typescript
import { AuditLogService } from '@app/common';

@Injectable()
export class SomeService {
    constructor(private readonly auditLogService: AuditLogService) {}

    async doSomething() {
        const auditResult = await this.auditLogService.writeAuditLog({
            app: 'app-api',
            module: 'order',
            action: 'create',
            summary: '创建订单',
            resourceType: 'order',
            resourceId: 'order-456',
            actorId: 'user-123',
            result: 'SUCCESS'
        });

        if (!auditResult.persisted) {
            // 高风险场景可在这里接入告警或补偿；自动 HTTP 审计链默认只记录失败，不阻断响应。
        }
    }
}
```

## 控制台输出格式

标题行（NestJS 风格，带颜色）：

```
<LEVEL_BADGE> <PID>  - YYYY/MM/DD HH:mm:ss [<logType> <module> user:<userId>] <message> +<Xms>
```

示例：

```
  INFO  1468  - 2026/03/11 21:43:45 [system admin_bootstrap user:system] Redis connected +12ms
```

非生产环境会在标题行下方追加 `inspect()` 格式的 detail。`system` 与 `audit` 输出完整结构体；`user_action` 只输出摘要字段，避免请求头与响应体在控制台刷屏。生产环境只输出标题行。

## 文件落盘

- 目录：`{LOKI_LOG_DIR}/{appName}/`
- 文件名：`{logType}-{YYYY-MM-DD}.log`
- 格式：JSON Lines（每行一个完整的 `RuntimeLogEntry` JSON）
- 轮转：按日期自动切换文件，由 `winston-daily-rotate-file` 管理

示例文件路径：

```
logs/loki/app-api/system-2026-03-11.log
logs/loki/app-api/user_action-2026-03-11.log
```

## 环境变量

| 变量                        | 说明                                           | 默认值                                                 |
| --------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `SHIRO_APP_NAME`            | 应用名，用于日志标识和文件子目录               | `unknown-app`                                          |
| `NODE_ENV`                  | 运行环境，`production` 时跳过控制台详情输出    | `development`                                          |
| `SHIRO_LOG_CONSOLE`         | 设为 `false` 时关闭控制台 transport，仅保留文件落盘 | 未设置                                                 |
| `SHIRO_LOG_CONSOLE_DETAILS` | 设为 `false` 时关闭控制台 detail，只保留标题行 | 未设置                                                 |
| `LOKI_LOG_DIR`              | 日志文件根目录                                 | `logs/loki`（开发）/ `/var/log/shiro-nya/loki`（生产） |

环境区分建议：

- `NODE_ENV` 区分运行环境，并写入日志 `env` 字段和 Loki `env` label。
- `SHIRO_APP_NAME` 区分应用实例，并写入日志 `app` 字段、Loki `app` label 与落盘子目录。
- 本机日志上传到 J1900 Loki 时推荐使用 `NODE_ENV=development`、`SHIRO_APP_NAME=admin-api-local`，避免本机日志混入线上 `app="admin-api"` 看板。
- 链路追踪使用 `OTEL_SERVICE_NAME` 区分 Tempo service，建议与 `SHIRO_APP_NAME` 保持一致。

## RuntimeLogEntry 结构

每条日志最终都会被构造为以下结构体：

```typescript
{
    id: string;              // 日志唯一标识（ULID）
    ts: string;              // ISO 时间戳
    level: RuntimeLogLevel;  // 日志级别
    logType: RuntimeLogType; // 日志类型：system / user_action / audit
    app: string;             // 应用名
    env: string;             // 运行环境
    module: string;          // 模块名
    userId: string;          // 用户 ID
    labels: {                // Promtail 提取候选字段（仅低基数字段会被提升为 Loki labels）
        id, app, env, log_type, level, module, user_id
    };
    message: string;         // 日志消息
    event: string;           // 事件名
    requestId?: string;      // 请求 ID（ULID）
    traceId?: string;        // 当前 OpenTelemetry trace ID（用于从日志跳转链路）
    spanId?: string;         // 当前 OpenTelemetry span ID
    caller?: string;         // 调用位置（文件名:行号）
    actor?: RuntimeLogActor;           // 操作者信息
    http?: RuntimeHttpSnapshot;        // HTTP 请求/响应快照
    rpc?: RuntimeRpcSnapshot;          // gRPC 请求快照
    resource?: RuntimeLogResource;     // 资源信息
    result?: RuntimeLogResult;         // 操作结果
    error?: RuntimeLogError;           // 错误信息
    context?: Record<string, unknown>; // 自定义上下文
}
```

## 自动化日志采集

以下场景的日志由框架自动采集，无需手动调用：

| 场景                | 负责组件                                | logType       |
| ------------------- | --------------------------------------- | ------------- |
| HTTP 请求/响应      | `HttpLogMiddleware`                     | `user_action` |
| 异常过滤器          | `BaseExceptionFilter` 及子类            | `system`      |
| gRPC 异常           | `GrpcExceptionFilter`                   | `system`      |
| 审计（登录/注册等） | `HttpLogMiddleware` + `AuditLogService` | `audit`       |

## 脱敏规则

日志写入边界会统一调用 `sanitizeForLogging()`，把 BigInt、Error、Buffer、Stream、循环引用等值转换成可 JSON 化结构；生产环境还会自动脱敏以下字段（替换为 `[FILTERED]`）：

`password`, `newpassword`, `oldpassword`, `token`, `authorization`, `cookie`, `secret`, `APP_BETTER_AUTH_API_KEY`, `api_key`, `access_token`, `refresh_token`, `psalt`, `smsCode`, `verifyCode`, `otpCode`, `captcha`

开发环境保留完整值以便调试。

## 与 Loki 的集成

日志文件由 Promtail 采集后推送到 Grafana Loki。应用层不直接推送 Loki，解耦应用与日志传输：

```
应用 → Winston DailyRotateFile → 本地 JSON Lines 文件
                                        ↓
                              Promtail 采集 → Grafana Loki → Grafana 查询

Promtail 只应把 `app`、`env`、`log_type`、`level`、`module` 这类低基数字段提升为 Loki stream labels。
`id` 与 `user_id` 这类高基数字段保留在日志 JSON 里，查询时使用 `| json` 解析，避免触发 `Maximum active stream limit exceeded`。
```

### Grafana / Loki 常用查询

日志查询入口统一使用低基数 stream selector 收敛范围，再用 `| json` 解析日志体里的高基数字段：

```logql
# 按用户 ID 查请求/操作日志（推荐查 top-level userId）
{app="admin-api", log_type="user_action"} | json | userId="user_xxx"

# Promtail JSON 表达式里的 labels.user_id，查询时解析为临时字段 user_id
{app="admin-api", log_type="user_action"} | json user_id="labels.user_id" | user_id="user_xxx"

# 按 request_id 查一次 HTTP 请求
{app="admin-api"} | json | requestId="01J..."

# 按 trace_id 查同一条链路关联日志
{app="admin-api"} | json | traceId="0123456789abcdef0123456789abcdef"

# 按接口地址查请求日志
{app="admin-api", log_type="user_action"} | json http_path="http.path" | http_path="/admin/api/xxx"
```

系统内部日志不一定有 `userId` 或 `requestId`，但如果发生在 active OpenTelemetry span 内，会自动写入 `traceId` / `spanId`；控制台标题行也会打印 `trace:<traceId>`，可直接复制到 Grafana Explore 查询或通过 Loki derived field 跳转 Tempo。

Tempo TraceQL 常用入口：

```traceql
# 查 admin-api 最近链路
{resource.service.name="admin-api"}

# 按接口路径查链路（优先 http.route，动态路由更稳定；没有 route 时用 url.path）
{resource.service.name="admin-api" && span.http.route="/admin/api/xxx"}
{resource.service.name="admin-api" && span.url.path="/admin/api/xxx"}

# 按 request_id 查链路
{resource.service.name="admin-api" && span.shiro.request_id="01J..."}

# 按用户 ID 查链路
{resource.service.name="admin-api" && span.shiro.user_id="user_xxx"}

# 按接口路径查链路
{resource.service.name="admin-api" && span.http.route="/admin/api/xxx"}
```

`span.shiro.user_id` 由认证/授权关键 span 写入，`span.shiro.request_id` 会写入 HTTP/Nest/auth/authz 关键 span。它们只进入 Tempo span attributes，不提升为 Loki label，因此适合按具体用户或具体请求做排障检索，不会制造 Loki 高基数 stream。

Promtail 配置见 `docker/config/promtail/promtail-config.yaml`。
