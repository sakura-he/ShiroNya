import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({
    path: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    quiet: true
});

const TARGETS = [
    ['ADMIN_DATABASE_URL', process.env.ADMIN_DATABASE_URL],
    ['APP_DATABASE_URL', process.env.APP_DATABASE_URL]
] as const;

async function migrateDatabase(label: string, url: string) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        await client.query('BEGIN');
        const table = await client.query<{ exists: boolean }>(
            "select to_regclass('public.cerbos_manual_policy') is not null as exists"
        );
        if (!table.rows[0]?.exists) {
            await client.query('COMMIT');
            console.log(`[${label}] cerbos_manual_policy 不存在，跳过`);
            return;
        }

        const idColumn = await client.query<{ data_type: string }>(
            `
                select data_type
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'cerbos_manual_policy'
                  and column_name = 'id'
            `
        );
        const codeColumn = await client.query<{ exists: boolean }>(
            `
                select exists (
                    select 1
                    from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'cerbos_manual_policy'
                      and column_name = 'code'
                ) as exists
            `
        );

        if (idColumn.rows[0]?.data_type === 'integer') {
            await dropCodeColumn(client);
            await client.query('COMMIT');
            console.log(`[${label}] id 已是 integer，已确认 code 列移除`);
            return;
        }

        await client.query('alter table cerbos_manual_policy add column if not exists id_new integer');
        await client.query(`
            with numbered as (
                select
                    ctid,
                    row_number() over (order by created_at, updated_at, id) as rn
                from cerbos_manual_policy
            )
            update cerbos_manual_policy target
            set id_new = numbered.rn
            from numbered
            where target.ctid = numbered.ctid
              and target.id_new is null
        `);
        await client.query('create sequence if not exists cerbos_manual_policy_id_seq');
        await client.query(`
            select setval(
                'cerbos_manual_policy_id_seq',
                coalesce((select max(id_new) from cerbos_manual_policy), 1),
                (select count(*) > 0 from cerbos_manual_policy)
            )
        `);
        await client.query(`
            alter table cerbos_manual_policy
                alter column id_new set default nextval('cerbos_manual_policy_id_seq'::regclass),
                alter column id_new set not null
        `);
        await dropPrimaryKey(client);
        if (codeColumn.rows[0]?.exists) {
            await dropCodeColumn(client);
        }
        await client.query('alter table cerbos_manual_policy drop column id');
        await client.query('alter table cerbos_manual_policy rename column id_new to id');
        await client.query('alter sequence cerbos_manual_policy_id_seq owned by cerbos_manual_policy.id');
        await client.query('alter table cerbos_manual_policy add constraint cerbos_manual_policy_pkey primary key (id)');
        await client.query('COMMIT');
        console.log(`[${label}] cerbos_manual_policy 已迁移为自增 integer id，并移除 code 列`);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        await client.end();
    }
}

async function dropPrimaryKey(client: Client) {
    const constraints = await client.query<{ conname: string }>(`
        select conname
        from pg_constraint
        where conrelid = 'public.cerbos_manual_policy'::regclass
          and contype = 'p'
    `);
    for (const row of constraints.rows) {
        await client.query(`alter table cerbos_manual_policy drop constraint "${row.conname}"`);
    }
}

async function dropCodeColumn(client: Client) {
    const constraints = await client.query<{ conname: string }>(`
        select distinct c.conname
        from pg_constraint c
        join unnest(c.conkey) key(attnum) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key.attnum
        where c.conrelid = 'public.cerbos_manual_policy'::regclass
          and a.attname = 'code'
    `);
    for (const row of constraints.rows) {
        await client.query(`alter table cerbos_manual_policy drop constraint "${row.conname}"`);
    }
    await client.query('alter table cerbos_manual_policy drop column if exists code');
}

async function main() {
    for (const [label, url] of TARGETS) {
        if (!url) {
            console.log(`[${label}] 未配置，跳过`);
            continue;
        }
        await migrateDatabase(label, url);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
