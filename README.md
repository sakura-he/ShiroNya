<p align="center">
  <img src="./docs/assets/logo.svg" alt="Shiro Nya" width="720" />
</p>

# Shiro Nya

Shiro Nya 是一个面向后台管理与 App 用户体系的全栈 monorepo。项目使用 NestJS、Vue、Prisma、PostgreSQL、Redis、MongoDB、SpiceDB 与 Cerbos，提供后台管理、用户管理、RBAC/ABAC 权限管理、对象关系授权和运行时可观测性基础设施。

## 项目组成

- `apps/admin-api`：后台管理 API，负责后台账号、菜单、角色、权限、ABAC/RBAC 管理和 App 侧控制能力。
- `apps/app-api`：App 侧 API，负责 App 用户、业务侧 RBAC、ABAC 授权、Better Auth 会话，以及供后台调用的 gRPC 管理接口。
- `apps/admin-web`：后台管理前端，基于 Vue 3、Vite、Pinia、Vue Router 和 Arco Design。
- `libs/common`：通用异常、响应格式、日志、Redis、gRPC、CORS 等基础能力。
- `libs/cerbos`、`libs/cerbos-abac`、`libs/rbac-core`：权限运行时、策略编译、授权检查和 RBAC 图计算能力。
- `packages/deploy-kit`：交互式一键部署工具，负责生成配置、同步数据库结构、导入开源初始数据并启动 Docker Compose。
- `packages/spicedb-toolkit`：SpiceDB schema、relationship、permission 操作工具包。
- `database/seeds/open-source`：开源版初始 SQL 数据，部署工具和源码项目共用这份数据。
- `docker/`：Docker Compose 运行资产和容器配置。
- `prisma/`：admin/app 两套 Prisma schema。

## 一键部署

一键部署适合直接体验开源版。目标机器需要 Node.js 22.12+、Docker 和 Docker Compose。部署脚本会交互式生成 `.env`、TLS 证书、Docker Compose 配置，执行 Prisma schema 同步，导入开源初始数据，并拉取公开镜像启动服务。

下载 Release 中的单文件部署脚本并运行：

```bash
node -e "fetch('https://github.com/sakura-he/ShiroNya/releases/latest/download/shiro-nya-deploy.mjs').then(async r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); require('node:fs').writeFileSync('shiro-nya-deploy.mjs', Buffer.from(await r.arrayBuffer())); })"
node shiro-nya-deploy.mjs
```

交互向导默认使用 `127.0.0.1` 作为本机访问主机，端口可在向导里填写。默认端口下的访问入口是：

- Admin Web：`http://127.0.0.1:57301`
- Admin API：`http://127.0.0.1:57300/admin`
- App API：`http://127.0.0.1:57303/app`
- Grafana：`http://127.0.0.1:57302`
- Redpanda Console：`http://127.0.0.1:18080`

部署完成后，终端会打印数据库、Redis、MongoDB、SpiceDB、Grafana 以及内置 admin/demo 业务账号密码。更详细的 Docker 运行资产说明见 [docker/README.md](docker/README.md)。

源码仓库内也可以直接启动同一个部署工具：

```bash
pnpm run deploy
```

生成发布脚本时执行：

```bash
pnpm run deploy-script:build
pnpm run deploy-script:release
```

发布产物会写入 `release/deploy/shiro-nya-deploy.mjs`。

## 本地开发启动

本地开发适合修改源码。推荐先用一键部署把 PostgreSQL、Redis、MongoDB、Redpanda、SpiceDB、Cerbos、Grafana 等依赖服务跑起来，再启动源码中的三个应用进程。

安装依赖并生成 Prisma Client：

```bash
corepack enable
pnpm install
pnpm prisma:generate
```

准备本地运行配置：

- 后端进程读取 `.env.development` 和 `.env`。
- 如果依赖服务来自一键部署，请按照部署完成摘要，在 `.env.development` 中写入对应的数据库、Redis、MongoDB、SpiceDB、Better Auth 和 CORS 端口、账号和密码。
- 本地 API 开发端口建议保持 `admin-api=3000`、`app-api=3001`，Admin Web 由 Vite 使用 `5173`。
- `APP_USER_ADMIN_GRPC_TLS_*` 和 Cerbos mTLS 证书路径需要指向当前机器上存在的证书；仓库内证书脚本见 [scripts/README.md](scripts/README.md)。

分别启动三个开发进程：

```bash
pnpm start:admin-api:dev
pnpm start:app-api:dev
pnpm start:admin-web:dev
```

常用开发命令：

```bash
pnpm test
pnpm build:admin-api
pnpm build:app-api
pnpm build:admin-web
pnpm spicedb:admin:schema:validate
```

## 基础设施

项目默认面向 Docker 化部署，当前 Compose 资产包含：

- PostgreSQL：保存 admin/app 业务数据与 SpiceDB datastore。
- Redis：会话、缓存、任务队列等运行时依赖。
- MongoDB：App 侧文档数据。
- Redpanda：SpiceDB Watch 事件和投影消费链路。
- SpiceDB：细粒度关系授权和对象关系图。
- Cerbos：ABAC 策略评估服务。
- Loki、Promtail、Tempo、Grafana：日志、审计和链路追踪观测能力。
- `admin-api`、`app-api`、`admin-web`：后台 API、App API 和后台前端。

## 权限管理

Shiro Nya 同时支持 RBAC 与 ABAC：

- RBAC 菜单、权限、角色、用户组和用户授权管理。
- 后台与 App 两套权限域隔离，避免控制面和业务侧权限互相污染。
- 基于数据库菜单元数据生成后台可见菜单和动态标签页。
- SpiceDB 负责对象关系和细粒度授权检查。
- Cerbos 负责属性策略判断，支持策略预览、发布和运行时校验。
- 权限变更后可刷新有效权限、可见菜单和用户状态版本。

## App 管理功能

后台控制面可以管理 App 侧用户与授权数据：

- App 用户列表、创建、编辑、禁用、封禁和重置密码。
- App 用户角色、用户组、权限分配和有效权限查看。
- App 侧 RBAC 菜单、权限分组、角色和用户组维护。
- 通过 mTLS gRPC 调用 `app-api` 内部管理接口，避免直接暴露 App 管理能力。
- 统一审计日志、操作记录和用户状态同步。
