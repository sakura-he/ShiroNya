import { getRequestContext } from '@app/common';
import type { ExecutionContext } from '@nestjs/common';

const RBAC_REQUEST_CACHE = Symbol('admin-api.rbac.request-cache');

export type RbacGrantedCodeState = {
    codes: string[];
    codeSet: Set<string>;
    isSuperAdmin: boolean;
};

export type RbacRequestCache = {
    grantedStates: Map<string, Promise<RbacGrantedCodeState>>;
    permissionChecks: Map<string, Promise<void>>;
    superAdminStates: Map<string, Promise<boolean>>;
};

type RbacCacheRequest = Record<PropertyKey, unknown>;

export function createRbacRequestCache(): RbacRequestCache {
    return {
        grantedStates: new Map(),
        permissionChecks: new Map(),
        superAdminStates: new Map()
    };
}

function getOrCreateRbacRequestCache(carrier: RbacCacheRequest): RbacRequestCache {
    const existing = carrier[RBAC_REQUEST_CACHE] as RbacRequestCache | undefined;
    if (existing) {
        return existing;
    }

    const cache = createRbacRequestCache();
    Object.defineProperty(carrier, RBAC_REQUEST_CACHE, {
        value: cache,
        enumerable: false,
        configurable: false,
        writable: false
    });
    return cache;
}

export function getRbacRequestCache(context: ExecutionContext): RbacRequestCache {
    const request = context.switchToHttp().getRequest<RbacCacheRequest>();
    const cache = getOrCreateRbacRequestCache(request);
    const requestContext = getRequestContext() as RbacCacheRequest | undefined;
    if (requestContext && !requestContext[RBAC_REQUEST_CACHE]) {
        Object.defineProperty(requestContext, RBAC_REQUEST_CACHE, {
            value: cache,
            enumerable: false,
            configurable: false,
            writable: false
        });
    }
    return cache;
}

export function getActiveRbacRequestCache(): RbacRequestCache | undefined {
    const requestContext = getRequestContext() as RbacCacheRequest | undefined;
    if (!requestContext) {
        return undefined;
    }
    return getOrCreateRbacRequestCache(requestContext);
}
