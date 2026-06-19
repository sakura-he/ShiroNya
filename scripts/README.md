# scripts 目录说明

本目录存放项目当前仍在使用的运维、证书、菜单维护和联调脚本，主要包括：

- TLS / mTLS 证书生成
- 本地 Loki 隧道与 Promtail 联调
- `admin-api` / `app-api` RBAC 内置权限、菜单和角色初始化
- AuthZ 只读巡检与 manager 关系重建

## 1. 脚本清单

| 脚本                                     | 作用                                                   | 默认输出 / 行为                                         |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `generate-mutual-tls-certs.ps1`          | 通用 mTLS 证书生成底层脚本（CA + server + client）     | 输出到传入的 `-OutputDir`                               |
| `generate-app-user-admin-grpc-certs.ps1` | 生成 `app-api` AppUserAdmin gRPC 服务使用的 mTLS 证书 | `docker/config/app-user-admin-grpc/tls`                 |
| `generate-cerbos-tls-certs.ps1`          | 生成 `app-api-cerbos` 与 gRPC 代理使用的 mTLS 证书    | `docker/config/app-api-cerbos/tls`                     |
| `generate-admin-cerbos-tls-certs.ps1`    | 生成 `admin-api-cerbos` 与 gRPC 代理使用的 mTLS 证书 | `docker/config/admin-api-cerbos/tls`                  |
| `generate-loki-tls-certs.ps1`            | 生成 Promtail、Grafana 与 Loki 通信用 mTLS 证书        | `docker/config/loki/tls`                                |
| `start-local-loki.ps1`                   | 启动本机 Promtail，一键推送本机日志到 J1900 Loki       | 自动发现 `bin\promtail-windows-amd64.exe`               |
| `seed-admin-api-rbac.ts`               | 初始化 `admin-api` RBAC 自有权限、菜单和内置角色     | 默认 dry-run；`--apply` 写 `rbac_*` 表            |
| `seed-app-api-rbac.ts`                  | 初始化 `app-api` RBAC 自有权限、菜单和内置角色        | 默认 dry-run；`--apply` 写 `rbac_*` 表             |
| `inspect-authz-state.ts`                 | 只读巡检后台 AuthZ 源表、投影表与 SpiceDB tuple 漂移   | 输出汇总到 stdout，完整报告写入 `.tmp/authz-state.json` |
| `sync-admin-api-manager-authz.ts`      | 从业务库源表重建后台核心 manager 与对象基础关系        | 读取 `.env*` 后写 SpiceDB；支持 `--dry-run`             |

## 2. 常用命令

在仓库根目录执行：

```powershell
# 1) 生成 AppUserAdmin gRPC mTLS
pwsh ./scripts/generate-app-user-admin-grpc-certs.ps1

# 2) 生成 Loki mTLS
pwsh ./scripts/generate-loki-tls-certs.ps1

# 3) 初始化 app-api RBAC 自有数据
pnpm rbac:seed:app-api
pnpm rbac:seed:app-api -- --apply --user-id=<better-auth-user-id>

# 4) 只读巡检 AuthZ 状态
pnpm authz:inspect

# 5) schema validate + 运行态 AuthZ 巡检
pnpm authz:verify:runtime

# 6) dry-run 检查 manager AuthZ 重建规模
pnpm authz:sync:admin-api-managers -- --dry-run

# 7) 本机 Promtail 推送到 J1900 Loki
pwsh ./scripts/start-local-loki.ps1

# 8) RBAC 自有数据 dry-run / 初始化
pnpm rbac:seed
pnpm rbac:seed -- --apply --user-id=<better-auth-user-id>
```

## 3. Loki 本地联调

1. 先准备 Loki 证书：

```powershell
pwsh ./scripts/generate-loki-tls-certs.ps1
```

2. 推荐给本机开发进程设置独立 app 名，避免和生产日志混在一起：

```powershell
$env:NODE_ENV = "development"
$env:SHIRO_APP_NAME = "admin-api-local"
$env:OTEL_SERVICE_NAME = "admin-api-local"
$env:LOKI_LOG_DIR = "E:/app/Shiro Nya/logs/loki"
```

3. 一键启动本机 Promtail，默认通过 Tailscale IP `100.68.195.89` 推送到 J1900 Loki：

```powershell
pwsh ./scripts/start-local-loki.ps1
```

> 说明：J1900 公网 `47.250.135.168:3101` 当前 TCP 可连但 TLS push 会被 reset / EOF；
> 本机开发默认走 Tailscale `100.68.195.89:3101`，不依赖 Docker，也不依赖本机 SSH。

脚本会自动发现 `bin\promtail-windows-amd64.exe`。也可手动指定：

```powershell
pwsh ./scripts/start-local-loki.ps1 -PromtailBin "E:\tools\promtail\promtail-windows-amd64.exe"
```

如果需要换成其他 Loki 地址，可以通过环境变量或参数覆盖：

```powershell
$env:J1900_LOKI_HOST = "100.68.195.89"
pwsh ./scripts/start-local-loki.ps1
```

如果不用 Tailscale，也可以走 SSH 隧道，但要求本机 SSH 能登录 J1900：

```powershell
pwsh ./scripts/start-local-loki.ps1 -UseSshTunnel -SshHost "shironeko@100.68.195.89"
```

## 4. 参数说明

### `generate-mutual-tls-certs.ps1`

- 必填：
    - `-OutputDir`
    - `-CaCommonName`
    - `-ServerCommonName`
    - `-ClientCommonName`
- 可选：
    - `-ServerDnsNames`
    - `-ServerIpAddresses`
    - `-CaValidYears`（默认 `10`）
    - `-LeafValidYears`（默认 `5`）

输出文件固定为：

- `ca.crt`
- `ca.key`
- `server.crt`
- `server.key`
- `client.crt`
- `client.key`

补充说明：

- 该脚本不会写死签发日期，而是使用执行当下的 UTC 时间。
- 默认有效期：`-CaValidYears=10`，`-LeafValidYears=5`。
- 该脚本会直接写出固定文件名的 6 个文件，不会自动生成时间戳备份。
- 目标目录只保留运行时需要的证书与私钥；重新生成前先清理 `csr`、`srl`、`ext.cnf` 等中间产物。

### `start-local-loki.ps1`

- `-PromtailBin`：Promtail 可执行文件路径（可选；默认自动发现 `bin\promtail-windows-amd64.exe`，或从环境变量 `PROMTAIL_BIN` 获取）
- `-HttpPort`：Promtail HTTP 端口（默认 `9082`）
- `-RemoteLokiUrl`：Loki Push API（默认 `https://100.68.195.89:3101/loki/api/v1/push`；启用 `-UseSshTunnel` 时为 `https://127.0.0.1:31011/loki/api/v1/push`）
- `-LokiHost`：J1900 Loki 主机（默认 `100.68.195.89`；也可用环境变量 `J1900_LOKI_HOST`）
- `-LokiServerName`：TLS SNI（默认 `loki`）
- `-DropOlderThan`：本机日志回灌保护窗口（默认 `90m`）
- `-LogDate`：采集哪一天的日志文件（默认当天，格式 `yyyy-MM-dd`）
- `-UseSshTunnel`：启用 SSH 隧道；仅在本机 SSH 已配置好 J1900 登录时使用
- `-SshBin`：SSH 可执行文件（默认 `ssh`）
- `-SshHost`：远端 SSH 主机（默认 `shironeko@100.68.195.89`，也可用环境变量 `J1900_SSH_HOST`）
- `-LocalPort`：本地隧道监听端口（默认 `31011`）
- `-RemotePort`：远端 Loki 端口（默认 `3101`）

### 菜单维护脚本

- 当前菜单权威来源是 admin/app 各自数据库中的 `rbac_menu`。菜单只声明 `requiredPermissionCode`，用户可见性由 effective 权限 code 匹配出来。
- `seed-admin-api-rbac.ts` 维护 `admin-api` 内置 RBAC 权限、权限分组、菜单和超级管理员角色。
- `seed-app-api-rbac.ts` 维护 `app-api` 内置 RBAC 权限、权限分组、菜单和超级管理员角色。
- `migrate-rbac-permission-kind-to-action.ts` 将 admin/app 已有权限类型中的非 `MENU` 值统一折叠为 `ACTION`，并收窄 Postgres enum。

### AuthZ 脚本

- `inspect-authz-state.ts` 只读检查数据库菜单、角色、用户组、任务、核心 manager、对象基础关系和对象例外授权的漂移与孤儿 tuple。
- `pnpm authz:verify:runtime` 组合执行 `pnpm spicedb:admin:schema:validate` 和 `pnpm authz:inspect`，适合发布后或联调环境巡检；它依赖运行态 DB/SpiceDB，不适合放进纯 CI。
- `sync-admin-api-manager-authz.ts` 复用后端 `core-manager-authz.constants.ts` 中的 relation 闭集，按源表重建可推导的 manager/object base 关系。
- manager 授权写入以 `AuthzPermissionService.applyMatrixChanges()` 和源表 `authz_resource_role_binding` 为准。

## 5. 注意事项

- 证书私钥（如 `*.key`）属于敏感材料，提交前请确认不会泄露到公开仓库。
- `start-local-loki.ps1` 启动前会校验 `docker/config/loki/tls/` 下的 `ca.crt`、`client.crt`、`client.key` 是否存在。
- RBAC seed 脚本带 `--apply` 时会直接写数据库，执行前请确认当前环境变量对应的是正确实例。
- 本 README 只覆盖当前使用的脚本；授权维护以本文件列出的入口为准。

