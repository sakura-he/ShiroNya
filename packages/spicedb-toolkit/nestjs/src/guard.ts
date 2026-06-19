import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SPICEDB_MODULE_OPTIONS, SPICEDB_PERMISSION_METADATA_KEY, SPICEDB_RESOLVERS_METADATA_KEY } from './constant.js';
import type { SpiceDbPermissionMetadata, SpiceDbModuleOptions, SpiceDbResolversConfig, SpiceDbSubject, SpiceDbResource } from './interfaces.js';
import { SpiceDbService } from './service.js';

@Injectable()
export class SpiceDbGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly spiceDbService: SpiceDbService,
    @Inject(SPICEDB_MODULE_OPTIONS) private readonly options: SpiceDbModuleOptions
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get permission metadata from @SpiceDbPermission.
    const metadata = this.reflector.getAllAndOverride<SpiceDbPermissionMetadata | undefined>(
      SPICEDB_PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()]
    );

    // No @SpiceDbPermission decorator means no SpiceDB restriction.
    if (!metadata) return true;

    // Resolve subject
    const subject = await this.resolveSubject(context, metadata);
    if (!subject) {
      throw new ForbiddenException('Unable to resolve subject for permission check');
    }

    // Resolve resource
    const resource = await this.resolveResource(context, metadata);
    if (!resource) {
      throw new ForbiddenException('Unable to resolve resource for permission check');
    }

    // Determine permissions to check
    const permissions = metadata.permissions ?? [metadata.permission];
    if (permissions.length === 0 || permissions.some((permission) => !isValidPermissionName(permission))) {
      throw new ForbiddenException('Permission metadata is empty');
    }
    const mode = metadata.mode ?? 'AND';

    const results = permissions.length === 1
      ? [
          await this.spiceDbService.checkPermission({
            resource,
            permission: permissions[0],
            subject,
          }),
        ]
      : (
          await this.spiceDbService.checkBulkPermissions({
            items: permissions.map((permission) => ({
              resource,
              permission,
              subject,
            })),
          })
        ).results;

    if (results.length !== permissions.length) {
      throw new ForbiddenException('Permission check result mismatch');
    }

    const allowed = mode === 'AND'
      ? results.every((r: any) => r.allowed)
      : results.some((r: any) => r.allowed);

    if (!allowed) {
      const behavior = this.options.defaultGuardBehavior ?? 'throw';
      if (behavior === 'throw') {
        throw new ForbiddenException('Permission denied');
      }
      return false;
    }

    return true;
  }

  private async resolveSubject(
    context: ExecutionContext,
    metadata: SpiceDbPermissionMetadata
  ): Promise<SpiceDbSubject | null> {
    // Priority: metadata.subject > method resolvers > class resolvers > global resolvers
    if (metadata.subject) {
      if (typeof metadata.subject === 'function') {
        const result = await metadata.subject(context);
        return normalizeSubject(result);
      }
      return normalizeSubject(metadata.subject);
    }

    const methodResolvers = this.reflector.get<Partial<SpiceDbResolversConfig> | undefined>(
      SPICEDB_RESOLVERS_METADATA_KEY,
      context.getHandler()
    );
    if (methodResolvers?.subject) {
      const result = await methodResolvers.subject(context);
      return normalizeSubject(result);
    }

    const classResolvers = this.reflector.get<Partial<SpiceDbResolversConfig> | undefined>(
      SPICEDB_RESOLVERS_METADATA_KEY,
      context.getClass()
    );
    if (classResolvers?.subject) {
      const result = await classResolvers.subject(context);
      return normalizeSubject(result);
    }

    if (this.options.resolvers?.subject) {
      const result = await this.options.resolvers.subject(context);
      return normalizeSubject(result);
    }

    return null;
  }

  private async resolveResource(
    context: ExecutionContext,
    metadata: SpiceDbPermissionMetadata
  ): Promise<SpiceDbResource | null> {
    const resourceType = metadata.resourceType;

    // Resolve resourceId
    if (metadata.resourceId && resourceType) {
      const id = typeof metadata.resourceId === 'function'
        ? await metadata.resourceId(context)
        : metadata.resourceId;
      return { type: resourceType, id };
    }

    // Try method/class/global resolvers
    const methodResolvers = this.reflector.get<Partial<SpiceDbResolversConfig> | undefined>(
      SPICEDB_RESOLVERS_METADATA_KEY,
      context.getHandler()
    );
    if (methodResolvers?.resource) {
      const result = await methodResolvers.resource(context);
      return normalizeResource(result);
    }

    const classResolvers = this.reflector.get<Partial<SpiceDbResolversConfig> | undefined>(
      SPICEDB_RESOLVERS_METADATA_KEY,
      context.getClass()
    );
    if (classResolvers?.resource) {
      const result = await classResolvers.resource(context);
      return normalizeResource(result);
    }

    if (this.options.resolvers?.resource) {
      const result = await this.options.resolvers.resource(context);
      return normalizeResource(result);
    }

    return null;
  }
}

function normalizeSubject(value: SpiceDbSubject | string): SpiceDbSubject | null {
  if (typeof value === 'string') {
    // Parse "type:id" or "type:id#relation"
    const match = value.match(/^([^:]+):([^#]+)(?:#(.+))?$/);
    if (!match) return null;
    return { type: match[1], id: match[2], relation: match[3] };
  }
  return value;
}

function normalizeResource(value: SpiceDbResource | string): SpiceDbResource | null {
  if (typeof value === 'string') {
    const match = value.match(/^([^:]+):(.+)$/);
    if (!match) return null;
    return { type: match[1], id: match[2] };
  }
  return value;
}

function isValidPermissionName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
