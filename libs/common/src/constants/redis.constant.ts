export type RedisKeyPrefixDefinition = {
    prefix: string;
    module: string;
};

export const ADMIN_API_RBAC_CACHE_NAMESPACE = 'admin-api';
export const APP_API_RBAC_CACHE_NAMESPACE = 'app-api';
export const ADMIN_API_CACHE_MANAGER_REDIS_NAMESPACE = 'admin_api';
export const APP_API_CACHE_MANAGER_REDIS_NAMESPACE = 'app_api';

export const ADMIN_USER_STATE_REDIS_KEY_PREFIX = 'ver:admin:';
export const ADMIN_USER_VERSION_REDIS_KEY_PREFIX = `${ADMIN_USER_STATE_REDIS_KEY_PREFIX}user:`;
export const ADMIN_ROLE_VERSION_REDIS_KEY_PREFIX = `${ADMIN_USER_STATE_REDIS_KEY_PREFIX}role:`;
export const ADMIN_MENU_VERSION_REDIS_KEY_PREFIX = `${ADMIN_USER_STATE_REDIS_KEY_PREFIX}menu:`;
export const ADMIN_MENU_VERSION_REDIS_KEY = `${ADMIN_MENU_VERSION_REDIS_KEY_PREFIX}global`;
export const ADMIN_MENU_VERSION_DB_NAME = 'admin_global';
export const ADMIN_ROLE_VERSION_DB_NAME_PREFIX = 'admin:role:';

export const APP_API_USER_STATE_REDIS_KEY_PREFIX = 'ver:app-api:';
export const APP_API_USER_VERSION_REDIS_KEY_PREFIX = `${APP_API_USER_STATE_REDIS_KEY_PREFIX}user:`;
export const APP_API_ROLE_VERSION_REDIS_KEY_PREFIX = `${APP_API_USER_STATE_REDIS_KEY_PREFIX}role:`;
export const APP_API_MENU_VERSION_REDIS_KEY_PREFIX = `${APP_API_USER_STATE_REDIS_KEY_PREFIX}menu:`;
export const APP_API_MENU_VERSION_REDIS_KEY = `${APP_API_MENU_VERSION_REDIS_KEY_PREFIX}global`;
export const APP_API_MENU_VERSION_DB_NAME = 'app_api_global';
export const APP_API_ROLE_VERSION_DB_NAME_PREFIX = 'app-api:role:';

export const ACCOUNT_NAVIGATION_CACHE_TTL_SECONDS = 300;
export const ADMIN_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX = 'admin:account:navigation';
export const APP_API_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX = 'app-api:account:navigation';

export const ADMIN_AUTHZ_PROJECTION_REDIS_KEY_PREFIX = 'admin:authz-projection';
export const APP_API_AUTHZ_PROJECTION_REDIS_KEY_PREFIX = 'app-api:authz-projection';
export const ADMIN_AUTHZ_PROJECTION_CACHE_VERSION_REDIS_KEY = `${ADMIN_AUTHZ_PROJECTION_REDIS_KEY_PREFIX}:version`;
export const APP_API_AUTHZ_PROJECTION_CACHE_VERSION_REDIS_KEY = `${APP_API_AUTHZ_PROJECTION_REDIS_KEY_PREFIX}:version`;

export const BETTER_AUTH_SECONDARY_STORAGE_REDIS_KEY_PREFIX = 'better_auth';

export const APP_API_SMS_PHONE_LIMIT_REDIS_KEY_PREFIX = 'sms:limit:phone';
export const APP_API_SMS_PHONE_DAILY_REDIS_KEY_PREFIX = 'sms:daily:phone';
export const APP_API_SMS_IP_DAILY_REDIS_KEY_PREFIX = 'sms:limit:ip';

export const BULLMQ_DATA_SYNC_QUEUE_REDIS_KEY_PREFIX = 'bull:data-sync';
export const BULLMQ_EMAIL_QUEUE_REDIS_KEY_PREFIX = 'bull:email';
export const BULLMQ_FILE_PROCESSING_QUEUE_REDIS_KEY_PREFIX = 'bull:file-processing';
export const BULLMQ_NOTIFICATION_QUEUE_REDIS_KEY_PREFIX = 'bull:notification';

export const REDIS_KEY_PREFIX_SCAN_COUNT = 200;
export const REDIS_KEY_PREFIX_SCAN_LIMIT = 10_000;
export const REDIS_KEY_PREFIX_SAMPLE_LIMIT = 3;

const RBAC_EFFECTIVE_PERMISSION_CODES_CACHE_SEGMENT = 'effective-permission-codes';

export function createAdminUserVersionRedisKey(userId: string): string {
    return `${ADMIN_USER_VERSION_REDIS_KEY_PREFIX}${userId}`;
}

export function createAdminRoleVersionRedisKey(roleId: number): string {
    return `${ADMIN_ROLE_VERSION_REDIS_KEY_PREFIX}${roleId}`;
}

export function createAdminRoleVersionDbName(roleId: number): string {
    return `${ADMIN_ROLE_VERSION_DB_NAME_PREFIX}${roleId}`;
}

export function createAppApiUserVersionRedisKey(userId: string): string {
    return `${APP_API_USER_VERSION_REDIS_KEY_PREFIX}${userId}`;
}

export function createAppApiRoleVersionRedisKey(roleId: number): string {
    return `${APP_API_ROLE_VERSION_REDIS_KEY_PREFIX}${roleId}`;
}

export function createAppApiRoleVersionDbName(roleId: number): string {
    return `${APP_API_ROLE_VERSION_DB_NAME_PREFIX}${roleId}`;
}

export function createAdminAccountNavigationRedisKey(userId: string, userStateVersion: string): string {
    return `${ADMIN_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX}:${userId}:${userStateVersion}`;
}

export function createAppApiAccountNavigationRedisKey(userId: string, userStateVersion: string): string {
    return `${APP_API_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX}:${userId}:${userStateVersion}`;
}

export function createAdminAuthzProjectionCacheRedisKey(scope: string, version: string, parts: string[]): string {
    return [ADMIN_AUTHZ_PROJECTION_REDIS_KEY_PREFIX, scope, version, ...parts].join(':');
}

export function createAppApiAuthzProjectionCacheRedisKey(scope: string, version: string, parts: string[]): string {
    return [APP_API_AUTHZ_PROJECTION_REDIS_KEY_PREFIX, scope, version, ...parts].join(':');
}

export function createRbacEffectivePermissionCodesCachePrefix(namespace: string): string {
    return ['rbac', namespace, RBAC_EFFECTIVE_PERMISSION_CODES_CACHE_SEGMENT].join(':');
}

export function createRbacEffectivePermissionCodesCacheKey(
    namespace: string,
    userId: string,
    userStateVersion: string
): string {
    return [
        createRbacEffectivePermissionCodesCachePrefix(namespace),
        encodeURIComponent(userId),
        userStateVersion
    ].join(':');
}

export function createBetterAuthSecondaryStorageRedisKey(key: string): string {
    return `${BETTER_AUTH_SECONDARY_STORAGE_REDIS_KEY_PREFIX}:${key}`;
}

export function createAppApiSmsPhoneLimitRedisKey(phone: string): string {
    return `${APP_API_SMS_PHONE_LIMIT_REDIS_KEY_PREFIX}:${phone}`;
}

export function createAppApiSmsPhoneDailyRedisKey(phone: string): string {
    return `${APP_API_SMS_PHONE_DAILY_REDIS_KEY_PREFIX}:${phone}`;
}

export function createAppApiSmsIpDailyRedisKey(ip: string): string {
    return `${APP_API_SMS_IP_DAILY_REDIS_KEY_PREFIX}:${ip}`;
}

export const REDIS_KEY_PREFIX_DEFINITIONS = [
    {
        prefix: trimTrailingRedisSeparator(ADMIN_USER_VERSION_REDIS_KEY_PREFIX),
        module: 'Admin 用户状态版本'
    },
    {
        prefix: trimTrailingRedisSeparator(ADMIN_ROLE_VERSION_REDIS_KEY_PREFIX),
        module: 'Admin 角色状态版本'
    },
    {
        prefix: trimTrailingRedisSeparator(ADMIN_MENU_VERSION_REDIS_KEY_PREFIX),
        module: 'Admin 菜单状态版本'
    },
    {
        prefix: trimTrailingRedisSeparator(APP_API_USER_VERSION_REDIS_KEY_PREFIX),
        module: 'App 用户状态版本'
    },
    {
        prefix: trimTrailingRedisSeparator(APP_API_ROLE_VERSION_REDIS_KEY_PREFIX),
        module: 'App 角色状态版本'
    },
    {
        prefix: trimTrailingRedisSeparator(APP_API_MENU_VERSION_REDIS_KEY_PREFIX),
        module: 'App 菜单状态版本'
    },
    { prefix: ADMIN_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX, module: 'Admin 导航缓存' },
    { prefix: APP_API_ACCOUNT_NAVIGATION_REDIS_KEY_PREFIX, module: 'App 导航缓存' },
    { prefix: ADMIN_AUTHZ_PROJECTION_REDIS_KEY_PREFIX, module: 'Admin 授权投影缓存' },
    { prefix: APP_API_AUTHZ_PROJECTION_REDIS_KEY_PREFIX, module: 'App 授权投影缓存' },
    {
        prefix: createRbacEffectivePermissionCodesCachePrefix(ADMIN_API_RBAC_CACHE_NAMESPACE),
        module: 'Admin RBAC 权限缓存'
    },
    {
        prefix: createRbacEffectivePermissionCodesCachePrefix(APP_API_RBAC_CACHE_NAMESPACE),
        module: 'App RBAC 权限缓存'
    },
    { prefix: `${ADMIN_API_CACHE_MANAGER_REDIS_NAMESPACE}:rbac`, module: 'Admin CacheManager 缓存' },
    { prefix: `${APP_API_CACHE_MANAGER_REDIS_NAMESPACE}:rbac`, module: 'App CacheManager 缓存' },
    { prefix: BETTER_AUTH_SECONDARY_STORAGE_REDIS_KEY_PREFIX, module: 'Better Auth 缓存' },
    { prefix: APP_API_SMS_PHONE_LIMIT_REDIS_KEY_PREFIX, module: 'App 短信手机号频率限制' },
    { prefix: APP_API_SMS_PHONE_DAILY_REDIS_KEY_PREFIX, module: 'App 短信手机号日限额' },
    { prefix: APP_API_SMS_IP_DAILY_REDIS_KEY_PREFIX, module: 'App 短信 IP 日限额' },
    { prefix: BULLMQ_DATA_SYNC_QUEUE_REDIS_KEY_PREFIX, module: 'BullMQ data-sync 队列元数据（待确认）' },
    { prefix: BULLMQ_EMAIL_QUEUE_REDIS_KEY_PREFIX, module: 'BullMQ email 队列元数据（待确认）' },
    { prefix: BULLMQ_FILE_PROCESSING_QUEUE_REDIS_KEY_PREFIX, module: 'BullMQ file-processing 队列元数据（待确认）' },
    { prefix: BULLMQ_NOTIFICATION_QUEUE_REDIS_KEY_PREFIX, module: 'BullMQ notification 队列元数据（待确认）' }
] as const satisfies readonly RedisKeyPrefixDefinition[];

export function resolveKnownRedisKeyPrefixDefinition(key: string): RedisKeyPrefixDefinition | null {
    return REDIS_KEY_PREFIX_DEFINITIONS.find((definition) => matchesRedisKeyPrefix(key, definition.prefix)) ?? null;
}

function trimTrailingRedisSeparator(value: string): string {
    return value.endsWith(':') ? value.slice(0, -1) : value;
}

function matchesRedisKeyPrefix(key: string, prefix: string): boolean {
    return key === prefix || key.startsWith(`${prefix}:`);
}
