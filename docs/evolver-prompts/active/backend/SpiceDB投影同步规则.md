# SpiceDB 投影同步提示词

适用范围：`admin-api` SpiceDB Watch、Redpanda/Kafka、显式关系授权投影、`/system/spicedb-data` 运维直改、投影对账和监控指标。

## Prompt

你在 ShiroAdmin 中处理 SpiceDB 投影同步时，必须区分 admin 基础授权和显式关系授权。admin 用户、角色、用户组、菜单、权限的权威源是 `rbac_*`；SpiceDB 负责明确选择关系授权的模块。PostgreSQL 投影表是 SpiceDB 关系读模型，用于关系运维、调试、对账和特定关系授权查询；Redpanda/Kafka 是 Watch 事件持久化通道。Kafka projection 启用时，Watch Relay 需要纳入当前 root compose 口径后再开启消费。

## 核心结论

```text
RBAC 是 admin 基础授权事实来源
SpiceDB 是显式关系授权事实来源
PostgreSQL 投影表是 SpiceDB 关系读模型
Redpanda/Kafka 是 Watch 事件持久化通道
业务写路径负责 SpiceDB 与投影双写补偿
reconcile 负责从 SpiceDB 全量对账修复漂移
```

不要把 `spicedb_*_projection` 当成 admin 基础授权来源。后台导航、按钮和接口 Guard 走 RBAC effective 读模型；只有显式关系授权模块才以 SpiceDB check/lookup 为准。

## 架构职责

- `AdminSpiceDbAuthorizationService` 负责业务写路径里的 SpiceDB 关系和 attribute 维护。
- `BaseRelationProjectionService` 负责投影表的 replace、upsert、delete、查询、inspect、reconcile、rebuild。
- Watch Relay 只写 Kafka 和 Redis snap token，不能写业务库。
- `AdminSpiceDbKafkaProjectionConsumerService` 不连接 SpiceDB，只消费 Kafka 并写投影、事件日志、游标、DLQ。
- `SpiceDbProjectionReconcileService` 从 SpiceDB 全量读取事实关系，再修复本地投影漂移。
- `@willsoto/nestjs-prometheus` 负责暴露 `/metrics`；项目自定义 controller 只补充 `@Public()`，不手写 registry 或渲染逻辑。

## 关系投影表

当前只投影会被 SpiceDB 运维和显式关系功能读取的关系：

| SpiceDB 关系                             | 投影表                                       | 主键                         | 主要读取场景                     |
| ---------------------------------------- | -------------------------------------------- | ---------------------------- | -------------------------------- |
| `user_group#member@user`                 | `spicedb_user_group_member_projection` | `user_id, group_id`          | 用户属于哪些组、组里有哪些用户   |
| `role#assignee@user`                     | `spicedb_user_role_projection`         | `user_id, role_id`           | 用户直接角色、角色直接用户       |
| `role#assignee@user_group#active_member` | `spicedb_user_group_role_projection`   | `group_id, role_id`          | 用户组继承角色、角色分配到哪些组 |
| `menu#viewer@role#assigned`              | `spicedb_menu_role_projection`         | `menu_id, role_id, relation` | SpiceDB 关系工具中的菜单关系查看 |
| `menu#manager@role#assigned`             | `spicedb_menu_role_projection`         | `menu_id, role_id, relation` | SpiceDB 关系工具中的管理关系扩展 |

SpiceDB 关系工具中如果仍维护菜单关系，可以直接通过投影表查询该角色关联的菜单：

```sql
select menu_id
from spicedb_menu_role_projection
where role_id = 1
  and relation = 'viewer'
order by menu_id asc;
```

对应代码入口：

- `BaseRelationProjectionService.getRoleMenuIds(roleId)`
- `BaseRelationProjectionService.getMenuIdsByRoleIds(roleIds)`
- `BaseRelationProjectionService.getMenuViewerRoleIds(menuId)`

## 后台关系表查询

系统管理页的关系表筛选和分页由后端处理。admin 基础授权页面优先走 RBAC 源表和 effective 读模型；SpiceDB 运维页和明确关系授权页面才走 SpiceDB 投影表，避免前端拉取完整候选集合后在浏览器侧自行筛选。

当前投影表适合支撑：

- 角色直接用户、角色分配用户组。
- 用户直接角色、用户所属用户组。
- 用户组成员、用户组分配角色。
- SpiceDB 关系工具中的菜单分配角色、角色拥有菜单。

需要完整 SpiceDB 语义裁决的查询继续使用 SpiceDB lookup/check，例如：

- `POST /role/query_effective_users`：角色有效用户，需要考虑角色启用和用户组 active_member。
- 对象、任务或业务模块明确声明为关系授权时的 lookup/check。

admin 基础菜单不要通过 SpiceDB lookup 计算。当前菜单可见性口径为：菜单声明 `rbac_menu.required_permission_code`，角色授予 `rbac_role_permission`，`SystemRbacGraphService` 展开用户 effective 权限后写入 `rbac_user_visible_menu`。

前端关系抽屉通过 `GiTable :request` 请求这些后端分页接口；初始化接口只返回 ID、能力字段和抽屉状态。

当前初始化接口里的 ID 集来源：

- `SystemRolesService.getRoleRelations()`：`directUserIds`、`userGroupIds`、`effectiveUserIds` 优先走投影服务。
- `SystemUsersService.getUserRelations()`：`userGroupIds` 和 `visibleMenuIds` 走 RBAC effective / RBAC 源表。
- `SystemUserGroupsService.getUserGroupRelations()`：`visibleMenuIds` 通过 RBAC 角色权限和菜单 `requiredPermissionCode` 推导。
- `SystemMenusService.getMenuRelations()`：`roleIds` 通过菜单 `requiredPermissionCode` 对应的 RBAC 角色权限推导，`visibleUserIds` 走 `rbac_user_visible_menu`。

## 业务写路径同步

显式关系授权 Service 的写路径遵循“先记录变更前关系快照，再写 SpiceDB，再写本地投影，最后刷新状态版本”的策略。admin 基础授权写路径写 `rbac_*` 并重建 effective 读模型。

失败补偿规则：

- 角色直接用户写入：`SystemRolesService.assignDirectUsers()` 替换 `role#assignee@user` 和用户角色投影，投影失败时恢复变更前关系快照。
- 角色用户组写入：`SystemRolesService.assignUserGroups()` 替换 `role#assignee@user_group#active_member` 和用户组角色投影，投影失败时恢复变更前关系快照。
- 权限管理页 manager 授权写入：`AuthzPermissionService.applyMatrixChanges()` 先批量预览并校验源表快照，再更新 `authz_resource_role_binding`，随后替换受影响角色的 SpiceDB manager relation；SpiceDB 写失败时恢复源表和变更前 relation 快照。
- 对象例外授权写入：`AuthzObjectExceptionService.applyBindings()` 写源表、写 SpiceDB，并在失败时补偿恢复。
- 菜单可见角色写入：`SystemMenusService.assignRoles()` 替换菜单 `requiredPermissionCode` 对应的 `rbac_role_permission`，并重建 RBAC effective 读模型。
- 用户组成员或角色写入：`SystemUserGroupsService.assignMembers()` / `assignRoles()` 替换 SpiceDB 用户组关系和本地投影，投影失败时恢复变更前关系快照。
- 创建用户失败时执行 `cleanupUser(user.id)`，再删除用户投影，最后移除 Better Auth 用户。
- 创建角色、菜单、用户组失败时会清理 SpiceDB 和本地投影，避免留下脏读模型。
- 后续 Watch/Kafka 到达的重复事件使用 upsert 或 deleteMany 处理，保持幂等。

## Kafka 消费规则

- `ADMIN_SPICEDB_KAFKA_ENABLED=true` 时才启动 Kafka projection consumer。
- 事件 topic 默认是 `admin-api.spicedb.watch-events.v1`。
- DLQ topic 默认是 `admin-api.spicedb.watch-dlq.v1`。
- Kafka consumer 使用 `autoCommit=false`、`eachBatchAutoResolve=false`、`partitionsConsumedConcurrently=1`。
- 每条消息的投影写入、事件日志、游标写入在同一个数据库事务中完成。
- DB 事务成功后手动提交下一 offset。
- DLQ 消息保留原 topic、partition、offset、reason、payload、failedAt。
- 事件日志以 `topic/partition/offset` 唯一，便于审计和幂等排查。
- 批量 Watch payload 中只有 token 完全一致时才记录 ZedToken，避免混合 token 被误当作单一进度。
- DB/Prisma 短暂失败时写 failed event log，不提交 offset，让 Kafka 重放。
- 连续失败达到 `ADMIN_SPICEDB_KAFKA_PROJECTION_CONSUMER_MAX_FAILURES` 后暂停 partition，等待告警和人工处理。
- `OPERATION_CREATE` 和 `OPERATION_TOUCH` 走 upsert；`OPERATION_DELETE` 走 deleteMany；重复事件必须幂等。

当前 `BaseRelationProjectionService` 只把以下事件解析为 SpiceDB 关系投影变更：

- `user_group#member@user`
- `role#assignee@user`
- `role#assignee@user_group`
- `menu#viewer@role`
- `menu#manager@role`

## 对账修复规则

`SpiceDbProjectionReconcileService` 每 5 分钟执行一次 drift dry-run；发现 missing/stale 后自动 apply 修复。对账通过 Redis 分布式锁保护，避免多实例同时全量扫描和写投影表。

发布后或联调环境巡检优先执行：

```powershell
pnpm authz:verify:runtime
```

该命令组合执行 `pnpm spicedb:admin:schema:validate` 和 `pnpm authz:inspect`；`authz:inspect` 依赖运行态 DB/SpiceDB，不放进纯 CI。发现投影漂移后，再通过现有 projection reconcile 入口修复。

对账模式：

- `dry_run`：只检测 SpiceDB 与投影表差异。
- `apply`：只增删 missing/stale 差异行。
- `rebuild`：清空四张投影表后重建，只允许手动调用。

对外 API：

- `GET /system/spicedb-data/projection-sync/overview`
- `POST /system/spicedb-data/projection-sync/reconcile`
- `GET /system/spicedb-data/projection-sync/runs`

手动对账请求必须填写 `reason`：

```json
{
    "mode": "apply",
    "reason": "manual repair after deployment"
}
```

## SpiceDB 直改同步

`/system/spicedb-data` 是受控运维修复入口，不是普通业务写入口。当前 DTO/Service 对 create/delete relationship 和 attribute 写入会校验 `reason`。

关系直改后的 targeted repair：

- `user_group#member@user`：重建该用户组成员投影，并 bump 用户版本和组继承角色版本。
- `role#assignee@user`：重建该角色直接用户投影，并 bump 用户和角色版本。
- `role#assignee@user_group#active_member`：重建该角色的用户组投影，并 bump 组内用户和角色版本。
- `menu#viewer@role`：只修复 SpiceDB 菜单关系投影和关系工具展示；admin 导航可见性仍由 RBAC effective 决定。
- `menu#manager@role`：只修复 SpiceDB 菜单 manager 投影和关系工具展示；不作为基础菜单管理权限来源。
- `role.enabled`：只影响 SpiceDB 关系功能里的 role attribute；admin 角色启停以 `rbac_role.status` 为准。
- `user_group.enabled`：只影响 SpiceDB 关系功能里的 user_group attribute；admin 用户组启停以 `rbac_user_group.status` 为准。

非基础关系允许写入 SpiceDB，但只记录审计并触发 drift dry-run，不直接写四张基础投影表。

## 生产与联调边界

- 当前远程开发拓扑可以是本地 `admin-api` 连接远端 Redpanda、Redis、PostgreSQL、SpiceDB。
- 单节点 Redpanda 只适合远程开发/联调，不是严格生产 HA 集群。
- 生产 HA 建议至少 3 broker，`replication.factor=3`，`min.insync.replicas=2`，producer 使用 `acks=-1`、`idempotent=true`。
- topic v1 保持单分区，优先保证 SpiceDB 事件全局顺序。

## 回归用例

- SpiceDB 菜单关系写入后，`spicedb_menu_role_projection` 可按 `role_id` 查到关系工具中的菜单关系。
- SpiceDB 菜单关系重复 Watch create 事件不会产生重复投影行。
- SpiceDB 菜单关系重复 Watch delete 事件不会报错，最终投影为空。
- malformed JSON 或 unknown operation 进入 DLQ，并记录 event log。
- SpiceDB 写成功但本地投影失败时，业务写路径能回滚 SpiceDB 并恢复变更前投影。
- consumer 崩溃后另一个 admin 实例通过 Kafka group 接管。
- 定时 dry_run 检测到 missing/stale 后自动 apply 修复。
- 手动 rebuild 后四张投影表与 SpiceDB 全量基础关系一致。
- SpiceDB 直改 `menu#viewer@role` 后，投影立即更新并触发 drift dry-run，但不会改变 admin RBAC 导航可见性。
- SpiceDB 直改 `role.enabled` 后，本地角色状态和受影响用户版本刷新。
- `/metrics` 能看到 consumer lag、事件计数和 drift 指标。

