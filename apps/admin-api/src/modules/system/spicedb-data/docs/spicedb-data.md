# SpiceDB 数据管理说明

## 1. 依据代码清单

- `apps/admin-api/src/modules/system/spicedb-data/spicedb-data.module.ts`
- `apps/admin-api/src/modules/system/spicedb-data/spicedb-data.controller.ts`
- `apps/admin-api/src/modules/system/spicedb-data/spicedb-data.service.ts`
- `apps/admin-api/src/modules/system/spicedb-data/spicedb-projection-reconcile.service.ts`
- `apps/admin-api/src/modules/system/spicedb-data/dto/spicedb-data.dto.ts`

## 2. 一句话总览

`SpiceDbDataService` 是后台 SpiceDB 运维入口，提供 schema、relationship、permission check、投影同步概况和对账历史，方便直观看当前 SpiceDB 状态。它不负责 admin 基础菜单、角色、用户组或按钮授权；这些由 RBAC 源表和 effective 读模型决定。

## 3. 接口清单

| 方法   | 路径                                             | 作用                                     |
| ------ | ------------------------------------------------ | ---------------------------------------- |
| `GET`  | `/system/spicedb-data/schema`                    | 获取 SpiceDB schema                      |
| `GET`  | `/system/spicedb-data/graph`                     | 获取 schema 图谱                         |
| `POST` | `/system/spicedb-data/schema/publish-preview`    | 预览草稿 schema 与远端当前 schema 的差异 |
| `POST` | `/system/spicedb-data/schema/publish`            | 发布草稿 schema 到 SpiceDB               |
| `GET`  | `/system/spicedb-data/schema/publications`       | 查询 schema 发布历史                     |
| `GET`  | `/system/spicedb-data/relationships`             | 分页查询 relationships                   |
| `POST` | `/system/spicedb-data/relationships`             | 写入单条 relationship                    |
| `POST` | `/system/spicedb-data/relationships/delete`      | 删除单条 relationship                    |
| `POST` | `/system/spicedb-data/permissions/check`         | 检查 permission                          |
| `GET`  | `/system/spicedb-data/projection-sync/overview`  | 投影同步概况                             |
| `POST` | `/system/spicedb-data/projection-sync/reconcile` | 手动对账                                 |
| `GET`  | `/system/spicedb-data/projection-sync/runs`      | 对账历史                                 |

## 4. 页面功能

- 查看 schema 和 graph。
- 读取远端当前 schema 到草稿编辑器，预览差异后发布到 SpiceDB。
- 查询 relationship 列表。
- 直写或删除单条 relationship。
- 检查某个 subject 对某个 permission 的结果。
- 查看投影同步概况。
- 触发 reconcile。

## 5. 边界与注意事项

- 直改接口必须填写 `reason`。
- schema 发布来源是页面草稿。
- `AuditLog` 记录运维入口；业务写日志由对应业务模块负责。
- 直改后会触发 SpiceDB 投影修复和漂移检查；RBAC 权限、角色或菜单配置仍由 RBAC 管理入口维护。

## 6. 回归用例

- 写入 relationship 后，schema graph 和投影概况能立即变化。
- 删除 relationship 后，查询和投影能同步收敛。
- 手动对账能把投影 drift 修回去。
