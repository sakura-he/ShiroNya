# Shiro Nya 开源版初始化 SQL

本目录保存公开开源部署使用的初始化数据。业务源码和 deploy-kit 共用这里的 SQL 文件，部署脚本不会在 TypeScript 源码里复制 SQL 内容。

## 文件作用

- `admin-api.sql`：填充后台管理库的默认账号、RBAC 角色、用户组、权限、菜单、effective 读模型、界面偏好、字典和演示任务。
- `app-api.sql`：填充应用侧业务库的默认账号、RBAC 角色、用户组、权限、菜单、effective 读模型、字典和演示任务。

## 执行顺序

部署流程先使用 Prisma 同步数据库结构，再执行这里的 SQL 文件填充数据。SQL 文件只写入业务数据，不创建表、不修改表结构、不替代 Prisma schema。

deploy-kit 在源码运行时直接读取本目录。构建单文件部署脚本时，构建流程会把本目录复制到 `deploy_script/runtime/seed-sql`，发布脚本再把它们压缩进最终的单文件部署脚本。

## 默认账号

后台管理库：

- 管理员：`admin` / `Admin@123456`
- 演示用户：`demo` / `Demo@123456`

应用侧业务库：

- 管理员数据账号：`admin` / `Admin@123456`
- 演示数据账号：`demo` / `Demo@123456`

app-api 当前运行配置默认不启用邮箱密码登录，应用侧账号主要用于后台 App 用户管理、RBAC 关系和演示数据。后台管理登录使用 admin-api 账号。

首次部署后应立即修改默认密码，并按实际公开环境更换 Better Auth、JWT、数据库、Redis、MongoDB、SpiceDB 和 Grafana 密钥。

## 幂等规则

SQL 使用稳定 code、username、email 和固定种子 ID 做 UPSERT。重复执行会刷新开源版内置数据，不会重复创建同一批账号、角色、用户组、权限、菜单和读模型。

不要在这些 SQL 中添加 `CREATE TABLE`、`ALTER TABLE` 或 schema migration 语句。表结构变更应进入 Prisma schema，再由部署流程执行 `prisma db push`。
