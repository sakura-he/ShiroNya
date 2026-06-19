import { ADMIN_API_RBAC_CACHE_NAMESPACE } from '@app/common/constants';
import { RbacEffectivePermissionCacheServiceBase } from '@app/rbac-core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';

@Injectable()
export class SystemRbacEffectivePermissionCacheService extends RbacEffectivePermissionCacheServiceBase {
    constructor(@Inject(CACHE_MANAGER) cache: Cache, adminUserStateService: AdminUserStateService) {
        super(cache, adminUserStateService, {
            namespace: ADMIN_API_RBAC_CACHE_NAMESPACE
        });
    }
}
