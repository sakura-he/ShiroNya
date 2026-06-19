// 将 RBAC 权限类型收敛为 MENU / ACTION。
//
// 用法：
//   npx tsx scripts/migrate-rbac-permission-kind-to-action.ts
//   npx tsx scripts/migrate-rbac-permission-kind-to-action.ts --apply
//   npx tsx scripts/migrate-rbac-permission-kind-to-action.ts --target=admin --apply
//   npx tsx scripts/migrate-rbac-permission-kind-to-action.ts --target=app --apply
//
// 默认 dry-run；确认输出后加 --apply 写入数据库。
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const TARGET_ARG = process.argv.find((arg) => arg.startsWith('--target='));
const TARGET = TARGET_ARG?.slice('--target='.length);
const ALLOWED_KINDS = ['MENU', 'ACTION'] as const;
const allowedKindSet = new Set<string>(ALLOWED_KINDS);

const { Client } = pg;

type PgClient = InstanceType<typeof Client>;
type TargetName = 'admin' | 'app';

type TargetConfig = {
    name: TargetName;
    envName: 'ADMIN_DATABASE_URL' | 'APP_DATABASE_URL';
    connectionString?: string;
};

type KindCountRow = {
    kind: string;
    count: string;
};

function loadProjectEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];
    for (const envFile of envFiles) {
        if (existsSync(envFile)) {
            loadEnv({ path: envFile, override: true });
        }
    }
}

function resolveTargets(): TargetConfig[] {
    const targets: TargetConfig[] = [
        { name: 'admin', envName: 'ADMIN_DATABASE_URL', connectionString: process.env.ADMIN_DATABASE_URL },
        { name: 'app', envName: 'APP_DATABASE_URL', connectionString: process.env.APP_DATABASE_URL }
    ];

    if (!TARGET) {
        return targets;
    }

    if (TARGET !== 'admin' && TARGET !== 'app') {
        throw new Error(`--target 只支持 admin 或 app，当前值：${TARGET}`);
    }

    return targets.filter((target) => target.name === TARGET);
}

async function tableExists(client: PgClient): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(`
        select exists (
            select 1
            from information_schema.tables
            where table_schema = current_schema()
              and table_name = 'rbac_permission'
        ) as "exists"
    `);
    return result.rows[0]?.exists ?? false;
}

async function readEnumLabels(client: PgClient): Promise<string[]> {
    const result = await client.query<{ enumlabel: string }>(`
        select e.enumlabel
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
        where t.typname = 'RbacPermissionKind'
          and n.nspname = current_schema()
        order by e.enumsortorder
    `);
    return result.rows.map((row) => row.enumlabel);
}

async function readKindCounts(client: PgClient): Promise<KindCountRow[]> {
    const result = await client.query<KindCountRow>(`
        select "kind"::text as "kind", count(*)::text as "count"
        from "rbac_permission"
        group by "kind"::text
        order by "kind"::text
    `);
    return result.rows;
}

function shouldRebuildEnum(labels: string[]): boolean {
    return labels.length !== ALLOWED_KINDS.length || labels.some((label) => !allowedKindSet.has(label));
}

async function migrateTarget(client: PgClient): Promise<void> {
    await client.query('begin');
    try {
        await client.query(`
            alter table "rbac_permission" alter column "kind" drop default;

            update "rbac_permission"
            set "kind" = 'ACTION'
            where "kind"::text not in ('MENU', 'ACTION');

            alter type "RbacPermissionKind" rename to "RbacPermissionKind_old";
            create type "RbacPermissionKind" as enum ('MENU', 'ACTION');

            alter table "rbac_permission"
            alter column "kind" type "RbacPermissionKind"
            using (
                case
                    when "kind"::text = 'MENU' then 'MENU'::"RbacPermissionKind"
                    else 'ACTION'::"RbacPermissionKind"
                end
            );

            alter table "rbac_permission" alter column "kind" set default 'ACTION';
            drop type "RbacPermissionKind_old";
        `);
        await client.query('commit');
    } catch (error) {
        await client.query('rollback');
        throw error;
    }
}

async function inspectOrMigrateTarget(target: TargetConfig): Promise<void> {
    if (!target.connectionString) {
        console.log(`[${target.name}] skip: ${target.envName} 未配置`);
        return;
    }

    const client = new Client({ connectionString: target.connectionString });
    await client.connect();
    try {
        if (!(await tableExists(client))) {
            console.log(`[${target.name}] skip: rbac_permission 表不存在`);
            return;
        }

        const beforeCounts = await readKindCounts(client);
        const labels = await readEnumLabels(client);
        const obsoleteLabels = labels.filter((label) => !allowedKindSet.has(label));

        console.log(`[${target.name}] current enum labels: ${labels.join(', ') || '(missing)'}`);
        console.log(`[${target.name}] obsolete labels to fold into ACTION: ${obsoleteLabels.join(', ') || '(none)'}`);
        console.log(`[${target.name}] current kind counts:`);
        for (const row of beforeCounts) {
            console.log(`  - ${row.kind}: ${row.count}`);
        }

        if (!APPLY) {
            console.log(`[${target.name}] dry-run only; rerun with --apply to migrate`);
            return;
        }

        if (!shouldRebuildEnum(labels)) {
            console.log(`[${target.name}] already MENU/ACTION only`);
            return;
        }

        await migrateTarget(client);
        const afterCounts = await readKindCounts(client);
        const afterLabels = await readEnumLabels(client);
        console.log(`[${target.name}] migrated enum labels: ${afterLabels.join(', ')}`);
        console.log(`[${target.name}] migrated kind counts:`);
        for (const row of afterCounts) {
            console.log(`  - ${row.kind}: ${row.count}`);
        }
    } finally {
        await client.end();
    }
}

async function main(): Promise<void> {
    loadProjectEnv();
    const targets = resolveTargets();
    for (const target of targets) {
        await inspectOrMigrateTarget(target);
    }
}

main().catch((error) => {
    console.error('[migrate-rbac-permission-kind-to-action] failed', error);
    process.exitCode = 1;
});
