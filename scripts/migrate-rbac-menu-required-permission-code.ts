// 将 rbac_menu.permission 改为 required_permission_code，并删除旧菜单-权限绑定表。
//
// 用法：
//   npx tsx scripts/migrate-rbac-menu-required-permission-code.ts
//   npx tsx scripts/migrate-rbac-menu-required-permission-code.ts --apply
//
// 默认 dry-run。脚本只处理 RBAC 菜单模型结构迁移，不做旧接口兼容字段。
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const { Client } = pg;

type PgClient = InstanceType<typeof Client>;

function loadProjectEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];
    for (const envFile of envFiles) {
        if (!existsSync(envFile)) {
            continue;
        }
        loadEnv({ path: envFile, override: true });
    }
}

async function tableExists(client: PgClient, tableName: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>('select to_regclass($1) is not null as exists', [tableName]);
    return result.rows[0]?.exists === true;
}

async function columnExists(client: PgClient, tableName: string, columnName: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
        `
            select exists (
                select 1
                from information_schema.columns
                where table_schema = current_schema()
                  and table_name = $1
                  and column_name = $2
            ) as exists
        `,
        [tableName, columnName]
    );
    return result.rows[0]?.exists === true;
}

async function countRows(client: PgClient, tableName: string): Promise<number> {
    const result = await client.query<{ count: string }>(`select count(*)::text as count from "${tableName}"`);
    return Number(result.rows[0]?.count ?? 0);
}

async function assertNoConflictingMenuCodes(client: PgClient): Promise<void> {
    const result = await client.query<{
        id: number;
        permission: string | null;
        required_permission_code: string | null;
    }>(
        `
            select id, permission, required_permission_code
            from "rbac_menu"
            where permission is not null
              and required_permission_code is not null
              and permission <> required_permission_code
            order by id asc
            limit 20
        `
    );

    if (result.rows.length > 0) {
        const sample = result.rows
            .map((row) => `menu:${row.id} permission=${row.permission} required=${row.required_permission_code}`)
            .join('; ');
        throw new Error(`rbac_menu 新旧权限列存在冲突，请先人工处理：${sample}`);
    }
}

async function assertRequiredPermissionCodeFilled(client: PgClient): Promise<void> {
    const result = await client.query<{ count: string }>(
        `
            select count(*)::text as count
            from "rbac_menu"
            where required_permission_code is null
               or required_permission_code = ''
        `
    );
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) {
        throw new Error(`rbac_menu.required_permission_code 仍有 ${count} 行为空，不能继续删除旧列或落库`);
    }
}

async function runDryRun(client: PgClient): Promise<void> {
    const hasMenuTable = await tableExists(client, 'rbac_menu');
    const hasMenuPermissionTable = await tableExists(client, 'rbac_menu_permission');
    const hasOldColumn = hasMenuTable ? await columnExists(client, 'rbac_menu', 'permission') : false;
    const hasNewColumn = hasMenuTable ? await columnExists(client, 'rbac_menu', 'required_permission_code') : false;
    const menuCount = hasMenuTable ? await countRows(client, 'rbac_menu') : 0;
    const menuPermissionCount = hasMenuPermissionTable ? await countRows(client, 'rbac_menu_permission') : 0;

    console.log('[dry-run] rbac_menu exists:', hasMenuTable);
    console.log('[dry-run] rbac_menu rows:', menuCount);
    console.log('[dry-run] old column permission exists:', hasOldColumn);
    console.log('[dry-run] new column required_permission_code exists:', hasNewColumn);
    console.log('[dry-run] rbac_menu_permission exists:', hasMenuPermissionTable);
    console.log('[dry-run] rbac_menu_permission rows:', menuPermissionCount);

    if (!hasMenuTable) {
        throw new Error('缺少 rbac_menu，不能迁移 RBAC 菜单模型');
    }
    if (!hasOldColumn && !hasNewColumn) {
        throw new Error('rbac_menu 同时缺少 permission 和 required_permission_code，不能判断迁移状态');
    }
    if (hasOldColumn && hasNewColumn) {
        await assertNoConflictingMenuCodes(client);
        console.log('[dry-run] apply 时会把 permission 中缺失的新列值复制到 required_permission_code，然后删除旧 permission 列');
    }
    if (hasOldColumn && !hasNewColumn) {
        console.log('[dry-run] apply 时会 rename permission -> required_permission_code');
    }
    if (hasMenuPermissionTable) {
        console.log('[dry-run] apply 时会删除 rbac_menu_permission 表');
    }
}

async function runApply(client: PgClient): Promise<void> {
    await client.query('begin');
    try {
        const hasMenuTable = await tableExists(client, 'rbac_menu');
        if (!hasMenuTable) {
            throw new Error('缺少 rbac_menu，不能迁移 RBAC 菜单模型');
        }

        const hasOldColumn = await columnExists(client, 'rbac_menu', 'permission');
        const hasNewColumn = await columnExists(client, 'rbac_menu', 'required_permission_code');
        if (!hasOldColumn && !hasNewColumn) {
            throw new Error('rbac_menu 同时缺少 permission 和 required_permission_code，不能判断迁移状态');
        }

        if (hasOldColumn && !hasNewColumn) {
            console.log('[apply] rename rbac_menu.permission -> required_permission_code');
            await client.query('alter table "rbac_menu" rename column "permission" to "required_permission_code"');
        } else if (hasOldColumn && hasNewColumn) {
            await assertNoConflictingMenuCodes(client);
            console.log('[apply] copy rbac_menu.permission -> required_permission_code where empty');
            await client.query(`
                update "rbac_menu"
                set required_permission_code = permission
                where (required_permission_code is null or required_permission_code = '')
                  and permission is not null
                  and permission <> ''
            `);
            await assertRequiredPermissionCodeFilled(client);
            console.log('[apply] drop old rbac_menu.permission');
            await client.query('alter table "rbac_menu" drop column "permission"');
        } else {
            await assertRequiredPermissionCodeFilled(client);
            console.log('[apply] required_permission_code already exists');
        }

        await client.query(`
            do $$
            begin
                if to_regclass('"rbac_menu_permission_status_idx"') is not null
                   and to_regclass('"rbac_menu_required_permission_code_status_idx"') is null then
                    alter index "rbac_menu_permission_status_idx" rename to "rbac_menu_required_permission_code_status_idx";
                end if;
            end $$;
        `);

        if (await tableExists(client, 'rbac_menu_permission')) {
            console.log('[apply] drop rbac_menu_permission');
            await client.query('drop table "rbac_menu_permission"');
        }

        await client.query('commit');
        console.log('[apply] done');
    } catch (error) {
        await client.query('rollback');
        throw error;
    }
}

async function main(): Promise<void> {
    loadProjectEnv();
    const connectionString = process.env.ADMIN_DATABASE_URL;
    if (!connectionString) {
        throw new Error('ADMIN_DATABASE_URL 未配置，无法连接数据库');
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
        if (APPLY) {
            await runApply(client);
        } else {
            await runDryRun(client);
        }
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
