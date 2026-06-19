import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CERBOS_ABAC_PERMISSION_KEY } from './constants';
import type { AbacPermissionMetadata } from './types';
import { CerbosAbacRuntimeService } from './services/runtime.service';

@Injectable()
export class CerbosAbacGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly runtime: CerbosAbacRuntimeService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const metadata = this.reflector.get<AbacPermissionMetadata>(
            CERBOS_ABAC_PERMISSION_KEY,
            context.getHandler()
        );
        if (!metadata) {
            return true;
        }
        const allowed = await this.runtime.check({
            code: metadata.code,
            context,
            options: metadata
        });
        if (!allowed) {
            throw new ForbiddenException('Cerbos ABAC 权限拒绝');
        }
        return true;
    }
}
