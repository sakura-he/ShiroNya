/**
 * 保护脚本。
 *
 * admin-api 的 APP_RBAC_* 控制面权限属于 admin 数据库的 rbac_* 数据。
 * app 数据库只保存 app-api 自有 RBAC 数据。
 *
 * app-api 自有 RBAC 初始化请使用：
 *   pnpm rbac:seed:app-api -- --apply
 *
 * admin-api 控制面入口和 APP_RBAC_* 权限应由 admin 数据库的
 * rbac_* 数据维护，不写入 app 数据库。
 */

console.error(
    [
        'scripts/sync-app-api-rbac-admin.ts 是保护脚本，未执行任何写入。',
        '不要把 admin-api 的 APP_RBAC_* 权限同步到 app 数据库的 rbac_* 表。',
        '请改用 pnpm rbac:seed:app-api 初始化 app-api 自有 RBAC 数据。'
    ].join('\n')
);

process.exitCode = 1;
