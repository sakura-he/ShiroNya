import { SetMetadata } from '@nestjs/common';
import { CERBOS_ABAC_PERMISSION_KEY } from './constants';
import type { AbacPermissionMetadata, AbacPermissionOptions } from './types';

/**
 * Marks a route for database-driven built-in ABAC policy checks.
 * request.session is added to request.principal.attr.session automatically.
 * Use ext for request.principal.attr.ext and resourceAttr for request.resource.attr.
 */
export function AbacPermission(code: string, options: AbacPermissionOptions = {}) {
    const metadata: AbacPermissionMetadata = {
        code,
        ...options
    };
    return SetMetadata(CERBOS_ABAC_PERMISSION_KEY, metadata);
}
