# Docker 部署

本目录只保留当前 Shiro Nya 的 Docker Compose 运行资产。运行入口统一为 `docker/compose.yaml`，容器配置放在 `docker/config/<容器名>/`，TLS 证书由部署 CLI 在目标机器生成。

## 目录

- `compose.yaml`：Shiro Nya 单一 compose 入口。
- `config/postgres/`：PostgreSQL 配置。
- `config/redis/`：Admin Redis 与 App Redis 共用 Redis 配置；ACL 用户和密码由 `/opt/shiro-nya/.env` 注入。
- `config/app-api-cerbos/`：`app-api-cerbos` 配置、policy 目录、SQLite 数据卷挂载入口和 mTLS 证书挂载目录。
- `config/app-api-cerbos-grpc-proxy/`：`app-api-cerbos-grpc-proxy` nginx gRPC TLS 代理配置。
- `config/admin-api-cerbos/`：`admin-api-cerbos` 配置、policy 目录、SQLite 数据卷挂载入口和 mTLS 证书挂载目录。
- `config/admin-api-cerbos-grpc-proxy/`：`admin-api-cerbos-grpc-proxy` nginx gRPC TLS 代理配置。
- `config/app-user-admin-grpc/`：`admin-api` 调用 `app-api` AppUserAdmin gRPC 服务的 mTLS 证书挂载目录。
- `config/loki/`：Loki 配置和 mTLS 证书挂载目录。
- `config/promtail/`：Promtail 生产采集配置和本机联调配置。
- `config/tempo/`：Tempo 配置。
- `config/grafana/`：Grafana datasource 和 dashboard provisioning。
- `admin-api/`、`app-api/`、`admin-web/`：镜像构建用 Dockerfile 或 nginx 配置。

## 命名口径

Compose service 名、`container_name` 和实际运行容器名保持一致，例如 `shiro-nya-admin-redis` 就是 compose service，也是 `docker ps` 里看到的容器名。持久化卷是另一类 Docker 资源，统一用容器名前缀加用途后缀，例如 `shiro-nya-admin-redis-data`。

Admin Redis 与 App Redis 是两个独立容器：

- `shiro-nya-admin-redis`
- `shiro-nya-app-redis`

它们共用同一份 `config/redis/redis.conf`，但使用不同端口和不同数据卷。

## 环境变量

主环境文件放在服务器 `/opt/shiro-nya/.env`，不要提交到仓库。统一 compose 至少需要：

```env
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
ADMIN_REDIS_USER=
ADMIN_REDIS_PASSWORD=
ADMIN_REDIS_PORT=17379
APP_REDIS_USER=
APP_REDIS_PASSWORD=
APP_REDIS_PORT=26379
MONGO_USER=
MONGO_PASSWORD=
MONGO_DB=
REDPANDA_OUTSIDE_HOST=
SPICEDB_POSTGRES_USER=
SPICEDB_POSTGRES_PASSWORD=
SPICEDB_POSTGRES_DB=
SPICEDB_GRPC_PRESHARED_KEY=
TZ=Asia/Shanghai
```

Grafana 管理员密码放在服务器 `/opt/grafana-loki/.env`：

```env
GF_SECURITY_ADMIN_PASSWORD=
```

仓库不提交 env、TLS 私钥或生成后的证书文件。需要变更真实配置时，直接更新 `compose.yaml` 或 `config/<容器名>/` 下的当前配置文件。

## TLS 证书

部署 CLI 使用 Node.js 生成以下 mTLS 证书目录：

- `/opt/shiro-nya/docker/config/app-user-admin-grpc/tls`
- `/opt/shiro-nya/docker/config/app-api-cerbos/tls`
- `/opt/shiro-nya/docker/config/admin-api-cerbos/tls`
- `/opt/shiro-nya/docker/config/loki/tls`

部署 CLI 会保留目标目录中已经存在且完整的证书。缺少证书时自动生成；需要主动轮换时执行：

```bash
SHIRO_NYA_REGENERATE_CERTS=1 node shiro-nya-deploy.mjs
```

证书默认包含 `localhost`、容器服务名和 `127.0.0.1`。需要把额外宿主机 IP 写入 SAN 时执行：

```bash
SHIRO_NYA_CERT_SERVER_IPS=127.0.0.1 node shiro-nya-deploy.mjs
```

## 部署

交互式一键部署入口提供步骤进度、选择器、密码输入和部署摘要。部署脚本以 Node.js 22.12+ 为唯一运行时；目标机器必须安装 Node.js 22.12+、Docker 和 Docker Compose。服务器部署使用 GitHub Release 发布脚本，不需要在目标机器拉取源码，也不需要执行仓库级 `pnpm install`。

目标机器下载 Release 里的 `shiro-nya-deploy.mjs` 后直接执行：

```text
node -e "fetch('https://github.com/sakura-he/Shiro Nya/releases/latest/download/shiro-nya-deploy.mjs').then(async r => { if (r.ok === false) throw new Error(r.statusText); require('node:fs').writeFileSync('shiro-nya-deploy.mjs', Buffer.from(await r.arrayBuffer())); })"
node shiro-nya-deploy.mjs
```

发布脚本内嵌交互式部署入口、Docker Compose 配置和 Prisma schema，首次执行时会用 Node.js 解到本机临时缓存目录并启动部署 CLI；应用服务由部署 CLI 拉取已发布镜像。证书生成、环境文件写入、部署目录准备和 compose override 生成都由 Node.js 完成，不需要在目标机器安装 OpenSSL，也不需要维护分平台部署脚本。业务数据库结构同步使用固定版本 `npx -y prisma@7.5.0` 执行，首次运行会从 npm registry 下载 Prisma CLI；如果目标机器不能访问 npm registry，需要预先把 `prisma` 放入 PATH。

源码仓库内开发或运维调试时可以直接执行：

```bash
pnpm run deploy
```

部署脚本构建和实际部署入口分开维护。源码仓库中生成 Release 部署脚本时先执行：

```bash
pnpm run deploy-script:build
pnpm run deploy-script:release
```

第一步生成仓库根目录 `deploy_script/`，第二步生成 `release/deploy/shiro-nya-deploy.mjs`。GitHub tag 发布流程会上传这个脚本和 `checksums.txt` 到对应 Release。

交互部署会提示用户输入必需配置，密码和密钥可选择自动生成。CLI 会写入目标机器的 env 文件、生成缺失 TLS 证书、输出配置摘要，然后执行 `docker compose config`、`docker compose pull` 和 `docker compose up -d`。部署目录会由 CLI 给出当前机器的默认值，也可以在交互流程中改成其他目录。

## 当前服务

统一 compose 管理以下 Shiro Nya 容器：

- `shiro-nya-postgres`
- `shiro-nya-admin-redis`
- `shiro-nya-app-redis`
- `shiro-nya-mongodb`
- `shiro-nya-redpanda`
- `shiro-nya-redpanda-console`
- `admin-api-spicedb`
- `app-api-cerbos`
- `app-api-cerbos-grpc-proxy`
- `admin-api-cerbos`
- `admin-api-cerbos-grpc-proxy`
- `loki`
- `promtail`
- `tempo`
- `grafana`
- `admin-api`
- `app-api`
- `admin-web`

Dokploy 自身和 `sub2api` 不属于 Shiro Nya 统一 compose，不放进本目录。

## Cerbos 端口

- `3592`：`app-api-cerbos` HTTP Admin API，仅绑定 `127.0.0.1`。
- `3593`：`app-api-cerbos-grpc-proxy` 对外 gRPC TLS 入口。
- `3692`：`admin-api-cerbos` HTTP Admin API，仅绑定 `127.0.0.1`。
- `3693`：`admin-api-cerbos-grpc-proxy` 对外 gRPC TLS 入口。

App 与 Admin 的 Cerbos 都采用同一结构：一个 Cerbos 容器加一个 nginx gRPC TLS 代理容器。

## 检查

```bash
docker compose --env-file /opt/shiro-nya/.env --project-directory /opt/shiro-nya/docker -f /opt/shiro-nya/docker/compose.yaml config --quiet
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```
