import { SetMetadata } from '@nestjs/common';
import { SPICEDB_PERMISSION_METADATA_KEY, SPICEDB_RESOLVERS_METADATA_KEY } from './constant.js';
import type { SpiceDbPermissionMetadata, SpiceDbResolversConfig } from './interfaces.js';

/**
 * Decorator to declare permission requirements on a controller method or class.
 *
 * @example Simple usage with global resolvers:
 * ```
 * @SpiceDbPermission('view')
 * ```
 *
 * @example Full configuration:
 * ```
 * @SpiceDbPermission({
 *   permission: 'edit',
 *   resourceType: 'document',
 *   resourceId: (ctx) => ctx.switchToHttp().getRequest().params.id,
 *   subject: (ctx) => ({ type: 'user', id: ctx.switchToHttp().getRequest().user.id }),
 * })
 * ```
 *
 * @example Multiple permissions with OR mode:
 * ```
 * @SpiceDbPermission({ permissions: ['view', 'edit'], mode: 'OR' })
 * ```
 */
export function SpiceDbPermission(
  config: string | string[] | SpiceDbPermissionMetadata
): MethodDecorator & ClassDecorator {
  let metadata: SpiceDbPermissionMetadata;

  if (typeof config === 'string') {
    metadata = { permission: config };
  } else if (Array.isArray(config)) {
    metadata = { permission: config[0], permissions: config, mode: 'OR' };
  } else {
    metadata = config;
  }

  return SetMetadata(SPICEDB_PERMISSION_METADATA_KEY, metadata);
}

/**
 * Override resolvers at method or controller level.
 *
 * @example
 * ```
 * @SpiceDbResolvers({
 *   subject: (ctx) => ({ type: 'user', id: ctx.switchToHttp().getRequest().user.id }),
 *   resource: (ctx) => ({ type: 'document', id: ctx.switchToHttp().getRequest().params.id }),
 * })
 * ```
 */
export function SpiceDbResolvers(
  resolvers: Partial<SpiceDbResolversConfig>
): MethodDecorator & ClassDecorator {
  return SetMetadata(SPICEDB_RESOLVERS_METADATA_KEY, resolvers);
}
