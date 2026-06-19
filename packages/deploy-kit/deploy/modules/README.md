# Deploy Modules 中文说明

这个目录存放 deploy-kit 的部署执行模块。每个文件只负责一个运行时关注点，入口编排器 `../orchestrator.ts` 会按固定顺序调用这些模块。

## 调用顺序

`../orchestrator.ts` 负责组装基础步骤：

1. `command.ts` 初始化部署运行日志。
2. `prerequisites.ts` 检查 Docker、Docker Compose、Prisma CLI 和 Docker daemon。
3. `docker-compose.ts` 根据用户选择决定是否登录 GHCR。
4. `env-files.ts` 写入主 `.env` 和 Grafana `.env`。
5. `assets.ts` 复制 Docker 配置、创建运行目录、写应用 env、生成证书、写 Compose override。

当 `deployNow=true` 时，`deploy-steps.ts` 会追加实际部署步骤：

1. `docker-pull.ts` 拉取 Compose 镜像并解析进度。
2. `env-files.ts` 刷新应用 `.env.production`，可读取镜像默认 env 后覆盖部署值。
3. `stateful-sync.ts` 串联 PostgreSQL、SpiceDB datastore migration、SpiceDB schema 发布、MongoDB 有状态服务同步。
4. `database-schema.ts` 使用 Prisma `db push` 同步业务库表结构。
5. `seed-data.ts` 执行开源版初始化 SQL，填充账号、权限、菜单和演示数据。
6. `docker-compose.ts` 执行 `docker compose up -d --pull never`。

## 文件职责

- `assets.ts`：复制 `runtime/docker` 模板到目标部署目录，生成 `compose.generated.yaml`，准备应用运行目录和 TLS 证书。
- `certificates.ts`：生成 gRPC、Cerbos、Loki 使用的 CA/server/client 证书，证书完整时默认复用。
- `command.ts`：统一执行外部命令，负责 stdout/stderr 原样写入部署日志、终端 UI 输出转发、Prisma CLI 解析。
- `connection-strings.ts`：从 `DeployConfig` 生成 PostgreSQL、MongoDB、SpiceDB datastore 连接串。
- `constants.ts`：存放部署模块共享常量，例如应用镜像仓库前缀。
- `database-schema.ts`：使用内置 Prisma schema 对 admin-api 和 app-api 数据库执行 `prisma db push`。
- `deploy-steps.ts`：定义 `deployNow=true` 时追加的部署步骤列表。
- `docker-compose.ts`：统一拼装 `docker compose` 参数、Compose 环境变量、GHCR 登录和 Compose 命令执行。
- `docker-pull.ts`：执行 `docker compose pull --progress json`，解析镜像 layer 事件并更新部署进度。
- `docker-status.ts`：部署完成后读取 `docker compose ps --all --format json` 并格式化容器状态表。
- `env-files.ts`：生成主 env、Grafana env、admin-api/app-api `.env.production`，并创建运行目录。
- `mongodb-sync.ts`：在已有 MongoDB 数据卷场景下，用临时 noauth 维护容器同步 root 用户。
- `prerequisites.ts`：检查本机部署依赖和 Docker daemon 连接状态。
- `progress.ts`：统一执行步骤，写 START/DONE/FAIL 日志，并把步骤内部进度折算成整体进度。
- `spicedb-sync.ts`：同步 PostgreSQL 角色/数据库，执行 SpiceDB datastore migration，并把 `spicedb/schema.zed` 发布到 SpiceDB。
- `stateful-sync.ts`：按正确顺序串联 PostgreSQL、SpiceDB、MongoDB 的有状态同步。
- `summary.ts`：生成部署完成后的摘要文本。

## 特殊写法说明

- `:ro`：Docker volume 只读挂载，配置和证书通常只读挂载给容器。
- `0o600` / `0o644` / `0o755`：八进制 Unix 权限，私钥用 `0o600`，普通证书用 `0o644`，可执行脚本用 `0o755`。
- `--password-stdin`：Docker 登录时从标准输入读取 token，避免 token 出现在命令行参数里。
- `--pull never`：启动服务时不隐式拉镜像，镜像拉取由独立步骤处理，进度和错误更清晰。
- `\gexec`：PostgreSQL `psql` 元命令，会把查询结果当作 SQL 再执行，用于安全生成 `CREATE DATABASE` / `ALTER ROLE` 语句。
- `<<'SQL'`：shell here-doc，单引号写法表示内容不由 shell 展开，变量交给 `psql -v` 处理。
- `COMPOSE_PROGRESS=json`：让 Docker Compose 输出一行一个 JSON 事件，便于 `docker-pull.ts` 解析进度。
