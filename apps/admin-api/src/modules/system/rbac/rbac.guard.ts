import { RbacGuardBase } from '@app/rbac-core';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacAuthorizationService } from './rbac-authorization.service';

/**
 * 后台 RBAC 权限守卫。
 *
 * 它只负责把路由上的 RBAC permission code 交给 RbacAuthorizationService。
 */
@Injectable()
export class RbacGuard extends RbacGuardBase {
    constructor(reflector: Reflector, authorizationService: RbacAuthorizationService) {
        super(reflector, authorizationService);
    }
}
