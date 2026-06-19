# SpiceDB 关系投影说明

## 1. 依据代码清单

- `apps/admin-api/src/modules/spicedb-projection/spicedb-projection.module.ts`
- `apps/admin-api/src/modules/spicedb-projection/base-relation-projection.service.ts`
- `apps/admin-api/src/modules/spicedb-projection/spicedb-projection.constants.ts`
- `prisma/admin/authz.prisma`

## 2. 一句话总览

`BaseRelationProjectionService` 把 SpiceDB 的显式关系授权数据同步到本地投影表，给 SpiceDB 数据页、关系调试和特定关系授权模块提供低成本读取。admin 基础授权已经由 RBAC 接管，导航和全局 Guard 不读取这些投影表。

## 3. 投影表

- `spicedb_user_group_member_projection`
- `spicedb_user_role_projection`
- `spicedb_user_group_role_projection`
- `spicedb_menu_role_projection`

## 4. 核心方法

- `rebuildFromSpiceDb()`
- `inspectFullSync()`
- `reconcileFromSpiceDb()`
- `replaceGroupMembers()`
- `replaceUserRoles()`
- `replaceRoleDirectUsers()`
- `replaceGroupRoles()`
- `replaceRoleGroups()`
- `replaceMenuRoles()`
- `replaceRoleMenus()`
- `removeGroup()`
- `removeUser()`
- `removeRole()`
- `removeMenu()`
- `getRoleMenuIds()`
- `getMenuViewerRoleIds()`
- `getBatchUserDirectRoleIds()`
- `getBatchUserEffectiveRoleIds()`

## 5. 边界与注意事项

- 投影表不是事实来源，显式关系授权事实来源仍是 SpiceDB。
- admin 基础菜单可见性来自 `rbac_menu.requiredPermissionCode` 与 RBAC effective 权限匹配，不从 `spicedb_menu_role_projection` 推导。
- `zedToken` 只用于记录同步位置。
- 关系视图优先读投影，不建议在列表页逐条回查 SpiceDB。

## 6. 回归用例

- SpiceDB 数据页和关系工具能从投影表快速回显关系数据。
- 全量 rebuild 后，投影表能回到 SpiceDB 当前事实状态。

