// RBAC 状态刷新脚本：直接维护菜单权限声明后，强制刷新相关状态版本，
// 让 /account/navigation 与 user-state 头部全部脱缓存，前端登录后立即拉到有效菜单。
//
// 必做的 4 件事：
// 1. bump menu 全局版本（admin_global），所有用户的 composite 版本都会变化
// 2. bump 每个角色的版本，前端 session header 比对会触发刷新
// 3. bump 每个用户的 Redis 版本（用户版本不落 app_state_version，和 AdminUserStateService 保持一致）
// 4. 删除 Redis 中所有 admin:account:navigation:* 与 ver:admin:composite:* 缓存
//
// 用法：
//   npx tsx scripts/bump-authz-state-versions.ts          # dry-run
//   npx tsx scripts/bump-authz-state-versions.ts --apply  # 真正执行
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from 'redis';
import { ulid } from 'ulid';
import { createAdminRoleVersionDbName } from '../libs/common/src/constants';
import { ExtendedPrismaClient } from '../libs/prisma-admin/src/extended-client';
import { StateVersionType } from '../libs/prisma-admin/src/generated/enums';

const APPLY = process.argv.includes('--apply');

// 加载项目级 env，与其他脚本一致。
function loadProjectEnv(): void {
    const envName = process.env.NODE_ENV || 'development';
    const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), `.env.${envName}`)];
    for (const envFile of envFiles) {
        if (!existsSync(envFile)) continue;
        loadEnv({ path: envFile, override: true });
    }
}

// 构造 redis 客户端。env 里的密码含 @ 必须用 username/password 字段而不是塞 url。
function buildRedisClient() {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT || 6379);
    const username = process.env.REDIS_USER || undefined;
    const password = process.env.REDIS_PASSWORD || undefined;
    if (!host) throw new Error('缺少 REDIS_HOST');

    return createClient({
        socket: { host, port },
        username,
        password
    });
}

/**
 * 删除符合 pattern 的所有 redis key，适配 Redis 客户端 scanIterator 的返回形态。
 */
async function deleteByPattern(client: ReturnType<typeof createClient>, pattern: string): Promise<number> {
    let total = 0;
    for await (const scannedKeys of client.scanIterator({ MATCH: pattern, COUNT: 200 })) {
        const keys = Array.isArray(scannedKeys) ? scannedKeys : [scannedKeys];
        if (keys.length === 0) {
            continue;
        }
        if (APPLY) {
            await client.unlink(keys);
        }
        total += keys.length;
    }
    return total;
}

async function main() {
    loadProjectEnv();
    const prisma = new ExtendedPrismaClient();
    const redis = buildRedisClient();

    try {
        await redis.connect();
        console.log(`=== bump-authz-state-versions ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===`);

        // ---- 1. menu 全局版本 ----
        const newMenuVersion = ulid();
        console.log(`\n--- 1) menu 全局版本 ---`);
        console.log(`  stateVersion(type=menu, name=admin_global) -> version=${newMenuVersion}`);
        if (APPLY) {
            await prisma.stateVersion.upsert({
                where: { type_name: { type: StateVersionType.menu, name: 'admin_global' } },
                update: { version: newMenuVersion },
                create: { type: StateVersionType.menu, name: 'admin_global', version: newMenuVersion }
            });
            await redis.set('ver:admin:menu:global', newMenuVersion);
        }

        // ---- 2. 每个角色版本 ----
        const roles = await prisma.rbacRole.findMany({
            select: { id: true, name: true },
            orderBy: { id: 'asc' }
        });
        console.log(`\n--- 2) 每个角色版本（共 ${roles.length} 个） ---`);
        for (const role of roles) {
            const v = ulid();
            const roleVersionName = createAdminRoleVersionDbName(role.id);
            console.log(`  role:${role.id}(${role.name}) stateVersion(${roleVersionName}) -> version=${v}`);
            if (APPLY) {
                await prisma.stateVersion.upsert({
                    where: { type_name: { type: StateVersionType.role, name: roleVersionName } },
                    update: { version: v },
                    create: { type: StateVersionType.role, name: roleVersionName, version: v }
                });
                await redis.set(`ver:admin:role:${role.id}`, v);
            }
        }

        // ---- 3. 每个后台用户 Redis 版本 ----
        const users = await prisma.betterAuthUser.findMany({
            select: { id: true, username: true },
            orderBy: { createdAt: 'asc' }
        });
        console.log(`\n--- 3) 每个用户版本（共 ${users.length} 个） ---`);
        for (const user of users) {
            const v = ulid();
            console.log(`  user:${user.id}(${user.username}) -> version=${v}`);
            if (APPLY) {
                // 用户版本只写入 Redis，DB 版本表目前只保留 menu/role 两类稳定版本。
                await redis.set(`ver:admin:user:${user.id}`, v);
            }
        }

        // ---- 4. 清掉所有相关 navigation / composite redis 缓存 ----
        console.log(`\n--- 4) 清理 Redis 缓存 ---`);
        const navCount = await deleteByPattern(redis, 'admin:account:navigation:*');
        console.log(`  admin:account:navigation:*    -> ${navCount} 个 key${APPLY ? ' 已删除' : ' 待删除'}`);
        const compositeCount = await deleteByPattern(redis, 'ver:admin:composite:*');
        console.log(`  ver:admin:composite:*         -> ${compositeCount} 个 key${APPLY ? ' 已删除' : ' 待删除'}`);

        console.log('\n=== 完成 ===');
        if (!APPLY) {
            console.log('当前是 DRY-RUN，加 --apply 才会写库 / 写 Redis / 删 Redis。');
        } else {
            console.log('已 APPLY。请通知前端用户：刷新浏览器（Ctrl+Shift+R 强刷）即可拿到新菜单。');
        }
    } finally {
        await prisma.$disconnect();
        try {
            await redis.quit();
        } catch {
            // 忽略关闭错误
        }
    }
}

void main().catch((error) => {
    console.error('[bump-authz-state-versions] 失败', error);
    process.exitCode = 1;
});
