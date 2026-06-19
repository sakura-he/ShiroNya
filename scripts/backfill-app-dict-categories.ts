// 回填 dict_category，让字典分类查询热路径直接使用分类表。
//
// 用法：
//   npx tsx scripts/backfill-app-dict-categories.ts
//   npx tsx scripts/backfill-app-dict-categories.ts --apply
//
// 默认 dry-run；确认输出后加 --apply 写入缺失分类。
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
        if (existsSync(envFile)) {
            loadEnv({ path: envFile, override: true });
        }
    }
}

async function readMissingCategories(client: PgClient): Promise<string[]> {
    const result = await client.query<{ category: string }>(`
        select distinct d.category
        from "app_dict" d
        left join "dict_category" c on c.name = d.category
        where c.id is null
        order by d.category asc
    `);
    return result.rows.map((row) => row.category);
}

async function backfillCategories(client: PgClient, categories: string[]): Promise<void> {
    if (categories.length === 0) {
        return;
    }
    await client.query(
        `
            insert into "dict_category" ("name")
            select unnest($1::text[])
            on conflict ("name") do nothing
        `,
        [categories]
    );
}

async function main(): Promise<void> {
    loadProjectEnv();
    if (!process.env.APP_DATABASE_URL) {
        throw new Error('APP_DATABASE_URL 未配置，无法回填 dict_category');
    }

    const client = new Client({ connectionString: process.env.APP_DATABASE_URL });
    await client.connect();
    try {
        const missingCategories = await readMissingCategories(client);
        console.log(`missing categories: ${missingCategories.length}`);
        for (const category of missingCategories) {
            console.log(`- ${category}`);
        }

        if (!APPLY) {
            console.log('dry-run only; rerun with --apply to insert categories');
            return;
        }

        await backfillCategories(client, missingCategories);
        console.log('backfill complete');
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('[backfill-app-dict-categories] failed', error);
    process.exitCode = 1;
});
