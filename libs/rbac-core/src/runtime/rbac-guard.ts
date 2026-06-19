import { CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY } from './rbac-permission.metadata';
import { getRbacRequestCache, type RbacRequestCache } from './rbac-request-cache';

export type RbacPermissionChecker = {
    checkPermission(userId: string, permissionCode: string, options?: { cache?: RbacRequestCache }): Promise<boolean>;
};

type RbacSessionRequest = {
    session?: {
        user?: {
            id?: string;
        };
        session?: {
            userId?: string;
        };
    };
};

export class RbacGuardBase implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly authorizationService: RbacPermissionChecker
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const permissionCodes = this.readRequiredPermissionCodes(context);
        if (permissionCodes.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest<RbacSessionRequest>();
        const userId = request.session?.user?.id || request.session?.session?.userId;
        if (!userId) {
            throw new UnauthorizedException('当前请求缺少后台会话，无法执行 RBAC 权限校验');
        }

        const cache = getRbacRequestCache(context);
        for (const permissionCode of permissionCodes) {
            const allowed = await this.authorizationService.checkPermission(userId, permissionCode, { cache });
            if (!allowed) {
                throw new ForbiddenException('RBAC 权限不足');
            }
        }

        return true;
    }

    private readRequiredPermissionCodes(context: ExecutionContext): string[] {
        const classCodes =
            this.reflector.get<string[]>(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, context.getClass()) ?? [];
        const handlerCodes =
            this.reflector.get<string[]>(RBAC_REQUIRED_PERMISSION_CODES_METADATA_KEY, context.getHandler()) ?? [];

        return [...new Set([...classCodes, ...handlerCodes].map((code) => code.trim()).filter(Boolean))];
    }
}
