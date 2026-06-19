import type { RbacGrantedCodeState, RbacRequestCache } from './rbac-request-cache';
import { getActiveRbacRequestCache } from './rbac-request-cache';

export type RbacAuthorizationCheckOptions = {
    cache?: RbacRequestCache;
};

export type RbacEffectivePermissionCache = {
    getPermissionCodes(userId: string): Promise<string[] | null>;
    setPermissionCodes(userId: string, codes: string[]): Promise<void>;
};

export type RbacAuthorizationStore = {
    assertPermissionConfigured(permissionCode: string): Promise<void>;
    assertPermissionsConfigured(permissionCodes: string[]): Promise<void>;
    hasEffectiveSuperAdminRole(userId: string): Promise<boolean>;
    getAllEnabledPermissionCodes(): Promise<string[]>;
    getEffectivePermissionCodesForUser(userId: string): Promise<string[]>;
};

export type RbacAuthorizationErrorFactory = {
    permissionDenied(input: { userId: string; permissionCode: string }): Error;
    configInvalid(input: { summary: string; [key: string]: unknown }): Error;
};

export class RbacAuthorizationServiceBase {
    constructor(
        private readonly store: RbacAuthorizationStore,
        private readonly errors: RbacAuthorizationErrorFactory,
        private readonly effectivePermissionCache?: RbacEffectivePermissionCache
    ) {}

    async assertPermission(
        userId: string,
        permissionCode: string,
        options: RbacAuthorizationCheckOptions = {}
    ): Promise<void> {
        const allowed = await this.checkPermission(userId, permissionCode, options);
        if (!allowed) {
            throw this.errors.permissionDenied({
                userId,
                permissionCode
            });
        }
    }

    async checkPermission(
        userId: string,
        permissionCode: string,
        options: RbacAuthorizationCheckOptions = {}
    ): Promise<boolean> {
        this.assertUserId(userId);
        const cache = this.resolveRequestCache(options);
        const code = this.normalizePermissionCode(permissionCode);
        if (await this.isEffectiveSuperAdmin(userId, cache)) {
            await this.assertPermissionConfigured(code, cache);
            return true;
        }

        const grantedState = await this.getGrantedState(userId, cache, false);
        if (grantedState.codeSet.has(code)) {
            return true;
        }

        await this.assertPermissionConfigured(code, cache);
        return false;
    }

    async checkPermissions(
        userId: string,
        permissionCodes: string[],
        options: RbacAuthorizationCheckOptions = {}
    ): Promise<Map<string, boolean>> {
        const normalizedCodes = [...new Set(permissionCodes.map((code) => this.normalizePermissionCode(code)))];
        this.assertUserId(userId);
        const cache = this.resolveRequestCache(options);
        if (normalizedCodes.length === 0) {
            throw this.errors.configInvalid({
                summary: 'RBAC 批量权限检查缺少 permission codes'
            });
        }

        if (await this.isEffectiveSuperAdmin(userId, cache)) {
            await this.assertPermissionsConfigured(normalizedCodes, cache);
            return new Map(normalizedCodes.map((code) => [code, true]));
        }

        const grantedState = await this.getGrantedState(userId, cache, false);
        await this.assertPermissionsConfigured(
            normalizedCodes.filter((code) => !grantedState.codeSet.has(code)),
            cache
        );
        return new Map(normalizedCodes.map((code) => [code, grantedState.codeSet.has(code)]));
    }

    async getGrantedCodes(userId: string, options: RbacAuthorizationCheckOptions = {}): Promise<string[]> {
        this.assertUserId(userId);
        return (await this.getGrantedState(userId, this.resolveRequestCache(options))).codes;
    }

    private resolveRequestCache(options: RbacAuthorizationCheckOptions): RbacRequestCache | undefined {
        return options.cache ?? getActiveRbacRequestCache();
    }

    private async getGrantedState(
        userId: string,
        cache?: RbacRequestCache,
        knownSuperAdmin?: boolean
    ): Promise<RbacGrantedCodeState> {
        if (!cache) {
            return await this.createGrantedState(userId, undefined, knownSuperAdmin);
        }

        const existing = cache.grantedStates.get(userId);
        if (existing) {
            return await existing;
        }

        const promise = this.createGrantedState(userId, cache, knownSuperAdmin);
        cache.grantedStates.set(userId, promise);
        return await promise;
    }

    private async createGrantedState(
        userId: string,
        cache?: RbacRequestCache,
        knownSuperAdmin?: boolean
    ): Promise<RbacGrantedCodeState> {
        if (knownSuperAdmin ?? (await this.isEffectiveSuperAdmin(userId, cache))) {
            const codes = await this.store.getAllEnabledPermissionCodes();
            return {
                codes,
                codeSet: new Set(codes),
                isSuperAdmin: true
            };
        }

        const codes = await this.getEffectivePermissionCodesForUser(userId);
        return {
            codes,
            codeSet: new Set(codes),
            isSuperAdmin: false
        };
    }

    private async assertPermissionConfigured(permissionCode: string, cache?: RbacRequestCache): Promise<void> {
        if (!cache) {
            await this.store.assertPermissionConfigured(permissionCode);
            return;
        }

        const existing = cache.permissionChecks.get(permissionCode);
        if (existing) {
            await existing;
            return;
        }

        const promise = this.store.assertPermissionConfigured(permissionCode);
        cache.permissionChecks.set(permissionCode, promise);
        await promise;
    }

    private async assertPermissionsConfigured(permissionCodes: string[], cache?: RbacRequestCache): Promise<void> {
        const uniqueCodes = [...new Set(permissionCodes)];
        if (uniqueCodes.length === 0) {
            return;
        }

        if (cache) {
            await Promise.all(uniqueCodes.map((code) => this.assertPermissionConfigured(code, cache)));
            return;
        }

        await this.store.assertPermissionsConfigured(uniqueCodes);
    }

    private async isEffectiveSuperAdmin(userId: string, cache?: RbacRequestCache): Promise<boolean> {
        if (!cache) {
            return await this.store.hasEffectiveSuperAdminRole(userId);
        }

        const existing = cache.superAdminStates.get(userId);
        if (existing) {
            return await existing;
        }

        const promise = this.store.hasEffectiveSuperAdminRole(userId);
        cache.superAdminStates.set(userId, promise);
        return await promise;
    }

    private async getEffectivePermissionCodesForUser(userId: string): Promise<string[]> {
        const cachedCodes = await this.effectivePermissionCache?.getPermissionCodes(userId);
        if (cachedCodes !== undefined && cachedCodes !== null) {
            return cachedCodes;
        }

        const codes = await this.store.getEffectivePermissionCodesForUser(userId);
        await this.effectivePermissionCache?.setPermissionCodes(userId, codes);
        return codes;
    }

    private assertUserId(userId: string): void {
        if (!userId?.trim()) {
            throw this.errors.configInvalid({
                summary: 'RBAC 权限校验缺少 userId'
            });
        }
    }

    private normalizePermissionCode(permissionCode: string): string {
        const code = permissionCode?.trim();
        if (!code) {
            throw this.errors.configInvalid({
                summary: 'RBAC 权限校验缺少 permission code'
            });
        }
        return code;
    }
}
