# SpiceDB 授权运行时说明

## 1. 依据代码清单

- `apps/app-api/src/modules/spicedb/admin-spicedb-authorization.module.ts`
- `apps/app-api/src/modules/spicedb/admin-spicedb-authorization.service.ts`
- `apps/app-api/src/modules/spicedb/admin-spicedb-client.factory.ts`
- `spicedb.config.ts`
- `spicedb/schema.zed`

## 2. 一句话总览

`AdminSpiceDbAuthorizationService` 是 `app-api` 管理侧统一的 SpiceDB 关系读写和权限检查入口；它服务 SpiceDB 数据页、关系调试、任务对象和明确选择关系授权的业务模块。app 侧用户、角色、用户组、菜单、权限的基础授权由 RBAC 决定。

## 3. 核心能力

Schema 与原生关系：

- `readSchemaText()`
- `writeSchemaText(schemaText)`
- `readRelationshipsNative(filter)`
- `touchRelationshipsNative(relationships)`
- `deleteRelationshipsNative(filter)`
- `checkPermissionNative(input)`
- `checkBulkPermissionsNative(input)`

显式关系能力：

- `replaceUserDirectRoleIds(userId, roleIds)`
- `replaceMenuViewerRoleIds(menuId, roleIds)`
- `replaceUserGroupMemberUserIds(groupId, userIds)`
- `replaceUserGroupRoleIds(groupId, roleIds)`
- `lookupUserEffectiveRoleIds(userId)`
- `lookupUserVisibleMenuIds(userId)`
- `lookupRoleEffectiveUserIds(roleId)`
- `lookupMenuVisibleUserIds(menuId)`

这些方法用于 SpiceDB 关系功能和运维工具。app-api 管理侧基础导航使用 `rbac_menu.requiredPermissionCode` 与 RBAC effective 权限匹配。

核心 manager 授权：

- `upsertCoreManagerBases(resourceTypes?)`
- `getCoreManagerRelationOptions()`
- `upsertAdminUserBase(userId)`
- `upsertRoleBase(roleId, enabled)`
- `upsertMenuBase(menuId)`
- `upsertUserGroupBase(groupId, enabled)`
- `upsertRoleAuthzBase(roleId)`
- `upsertMenuAuthzBase(menuId)`
- `upsertUserGroupAuthzBase(groupId)`
- `replaceRoleCoreManagerRelations(roleId, resourceType, relations)`
- `checkCoreManagerPermission(resourceType, permission, userId)`
- `assertCoreManagerPermission(resourceType, permission, userId)`
- `checkCoreManagedResourcePermissions(resourceType, resourceIds, permissions, userId)`
- `assertCoreManagedResourcePermission(resourceType, resourceId, permission, userId)`

任务授权：

- `lookupUserVisibleTaskIds(userId)`
- `checkTaskManagerPermission(permission, userId)`
- `assertTaskManagerPermission(permission, userId)`
- `checkTaskPermission(taskId, permission, userId)`
- `checkTaskPermissions(taskIds, permissions, userId)`
- `assertTaskPermission(taskId, permission, userId)`
- `upsertTaskManagerBase()`
- `upsertTaskBase(taskId, creatorUserId)`

清理补偿：

- `cleanupUser(userId)`
- `cleanupRole(roleId)`
- `cleanupMenu(menuId)`
- `cleanupTask(taskId)`
- `cleanupUserGroup(groupId)`

## 4. 关系约定

身份链路：

```text
role:<roleId>#assignee@user:<userId>
role:<roleId>#assignee@user_group:<groupId>#active_member
role:<roleId>#enabled@user:*
user_group:<groupId>#member@user:<userId>
user_group:<groupId>#enabled@user:*
system:admin#admin@role:<roleId>#assigned
```

菜单入口：

```text
menu:<menuId>#system@system:admin
menu:<menuId>#viewer@role:<roleId>#assigned
menu:<menuId>#manager@role:<roleId>#assigned
```

`menu.view` 只控制导航和路由入口，不继承 `menu_manager` 的模块管理能力。

核心 manager：

```text
user_manager:default#system@system:admin
role_manager:default#system@system:admin
menu_manager:default#system@system:admin
user_group_manager:default#system@system:admin
task_manager:default#system@system:admin
*_manager:default#<relation>@role:<roleId>
```

核心对象基础关系：

```text
admin_user:<userId>#manager@user_manager:default
admin_user:<userId>#self@user:<userId>
role:<roleId>#authz_manager@role_manager:default
menu:<menuId>#authz_manager@menu_manager:default
user_group:<groupId>#authz_manager@user_group_manager:default
```

任务对象：

```text
task:<taskId>#manager@task_manager:default
task:<taskId>#creator@user:<userId>
```

## 5. Manager Relation 闭集

| 资源类型             | relation                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_manager`       | `viewer`、`creator`、`updater`、`deleter`、`password_resetter`、`session_viewer`、`session_revoker`、`manager`                                     |
| `role_manager`       | `viewer`、`creator`、`updater`、`deleter`、`user_assigner`、`user_group_assigner`、`task_capability_assigner`、`task_resource_assigner`、`manager` |
| `menu_manager`       | `viewer`、`creator`、`updater`、`deleter`、`role_assigner`、`manager`                                                                              |
| `user_group_manager` | `viewer`、`creator`、`updater`、`deleter`、`member_assigner`、`role_assigner`、`manager`                                                           |
| `task_manager`       | `viewer`、`creator`、`updater`、`deleter`、`runner`、`manager`                                                                                     |

## 6. 读写策略

通用集合替换：

1. 读取当前 relation 集合。
2. 规整目标集合，过滤不在闭集内的 relation。
3. 对新增项执行 touch。
4. 对删除项执行 delete filter。
5. 调用方负责在业务库写入失败或 SpiceDB 写入失败时做补偿。

核心 manager 特殊规则：

- `replaceRoleCoreManagerRelations()` 会先确保 manager singleton 归属 `system:admin`。
- `checkCoreManagedResourcePermissions()` 会对资源 ID 和 permission 去重，再按资源聚合结果，供列表接口一次性返回按钮能力。
- `assertCoreManagedResourcePermission()` 直接检查对象 permission，例如 `role:<id>#assign_user`、`menu:<id>#assign_role`。

## 7. 清理规则

`cleanupRole(roleId)` 会清理：

- `role:<id>` 自身所有关系。
- `menu#viewer@role:<id>#assigned` 和 `menu#manager@role:<id>#assigned`。
- `system:admin#admin@role:<id>#assigned`。
- 所有核心 manager 上所有该角色 subject relation；`task_manager` 包含在核心 manager 闭集中。

其他清理：

- `cleanupUser(userId)` 清理 role assignee、group member、system admin user relation，以及 `admin_user:<id>` 对象关系。
- `cleanupMenu(menuId)` 清理 `menu:<id>` 所有关联。
- `cleanupUserGroup(groupId)` 清理 group 自身、role assignee 中的 group subject。
- `cleanupTask(taskId)` 清理 `task:<id>` 对象关系。

## 8. 回归用例

- `upsertCoreManagerBases()` 写入 5 个 manager singleton 到 `system:admin`。
- `upsertAdminUserBase()` 写入 `manager` 与 `self`。
- `replaceRoleCoreManagerRelations()` 对目标 relation touch，对未选 relation delete。
- `checkCoreManagerPermission()` 检查 `*_manager:default#permission@user`。
- `checkCoreManagedResourcePermissions()` 保持资源聚合和权限映射顺序。
- `cleanupRole()` 清理所有核心 manager 上的角色关系；`task_manager` 已包含在核心 manager 闭集中。
- 任务列表使用 `checkTaskPermissions()` 返回行级 `viewerCanUpdate/Delete/Run/ViewLog`。
- Service 断言失败时抛出统一权限不足异常。

