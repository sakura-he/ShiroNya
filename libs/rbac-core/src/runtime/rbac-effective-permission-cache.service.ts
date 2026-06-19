import { createRbacEffectivePermissionCodesCacheKey } from '@app/common/constants';
import type { Cache } from 'cache-manager';

const DEFAULT_RBAC_EFFECTIVE_PERMISSION_CODES_CACHE_TTL_MS = 5 * 60 * 1000;

type PermissionCodesCachePayload = {
    codes: string[];
};

export type RbacUserStateReader = {
    getUserVersion(userId: string): Promise<string>;
};

export type RbacEffectivePermissionCacheOptions = {
    namespace: string;
    ttlMs?: number;
};

export class RbacEffectivePermissionCacheServiceBase {
    private readonly ttlMs: number;

    constructor(
        private readonly cache: Cache,
        private readonly userStateService: RbacUserStateReader,
        private readonly options: RbacEffectivePermissionCacheOptions
    ) {
        this.ttlMs = options.ttlMs ?? DEFAULT_RBAC_EFFECTIVE_PERMISSION_CODES_CACHE_TTL_MS;
    }

    async getPermissionCodes(userId: string): Promise<string[] | null> {
        try {
            const cacheKey = await this.createPermissionCodesCacheKey(userId);
            const payload = await this.cache.get<PermissionCodesCachePayload>(cacheKey);
            if (!this.isPermissionCodesCachePayload(payload)) {
                if (payload !== undefined) {
                    await this.cache.del(cacheKey);
                }
                return null;
            }

            return payload.codes;
        } catch {
            return null;
        }
    }

    async setPermissionCodes(userId: string, codes: string[]): Promise<void> {
        try {
            const cacheKey = await this.createPermissionCodesCacheKey(userId);
            await this.cache.set(
                cacheKey,
                {
                    codes
                },
                this.ttlMs
            );
        } catch {
            return;
        }
    }

    private async createPermissionCodesCacheKey(userId: string): Promise<string> {
        const userVersion = await this.userStateService.getUserVersion(userId);
        return createRbacEffectivePermissionCodesCacheKey(this.options.namespace, userId, userVersion);
    }

    private isPermissionCodesCachePayload(payload: unknown): payload is PermissionCodesCachePayload {
        if (!payload || typeof payload !== 'object') {
            return false;
        }

        const candidate = payload as Partial<PermissionCodesCachePayload>;
        return Array.isArray(candidate.codes) && candidate.codes.every((code) => typeof code === 'string');
    }
}
