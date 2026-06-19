import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
    mixin,
    Type
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CerbosService } from './cerbos.service';
import { CERBOS_POLICY_KEY } from './cerbos.decorator';
import type { CerbosPolicyOptions, AttrValue } from './cerbos.decorator';
import { assertCerbosEnvPrefix, getCerbosServiceToken, getCerbosOptionsToken } from './cerbos.interface';
import type { CerbosModuleOptions } from './cerbos.interface';
import { ErrorCodes, appendAuditContext, createRuntimeLogger, setRequestAuditContext } from '@app/common';

/** 缓存已生成的 mixin Guard 类，避免同一 prefix 重复生成 */
const guardCache = new Map<string, Type<CanActivate>>();

/**
 * 工厂函数：为指定的 envPrefix 生成一个绑定了对应 CerbosService 实例的 Guard 类。
 * Guard 在构造时通过 DI 直接注入正确的 CerbosService 和 CerbosModuleOptions。
 *
 * @example @UseGuards(CerbosGuardFor('APP_'))
 * @example @UseGuards(CerbosGuardFor('ADMIN_'))
 */
export function CerbosGuardFor(prefix: string): Type<CanActivate> {
    const resolvedPrefix = assertCerbosEnvPrefix(prefix, 'CerbosGuardFor');

    const cached = guardCache.get(resolvedPrefix);
    if (cached) return cached;

    @Injectable()
    class CerbosGuardMixin implements CanActivate {
        private readonly logger = createRuntimeLogger(`CerbosGuard[${resolvedPrefix}]`);

        constructor(
            @Inject(getCerbosServiceToken(resolvedPrefix))
            private readonly cerbosService: CerbosService,
            @Inject(getCerbosOptionsToken(resolvedPrefix))
            private readonly options: CerbosModuleOptions,
            private readonly reflector: Reflector
        ) {}

        async canActivate(context: ExecutionContext): Promise<boolean> {
            const policy = this.reflector.get<CerbosPolicyOptions>(CERBOS_POLICY_KEY, context.getHandler());

            if (!policy) {
                return true;
            }

            const user = await this.options.userFromContext(context);

            if (user && !user.roles?.length) {
                throw new ForbiddenException(ErrorCodes.CERBOS.USER_ROLE_MISSING.message);
            }

            // 游客：用固定身份去 Cerbos 鉴权，由策略决定是否放行
            const principal = user
                ? { id: user.id, roles: user.roles }
                : { id: 'anonymous', roles: ['guest'] };

            const req = context.switchToHttp().getRequest();

            // 解析 resourceAttr
            const resourceAttr = await this.resolveAttr(policy.resourceAttr, req);

            // 解析 principalAttr：装饰器优先，否则用全局默认
            let principalAttr: Record<string, any>;
            if (policy.principalAttr !== undefined) {
                principalAttr = await this.resolveAttr(policy.principalAttr, req);
            } else if (this.options.principalAttrFromContext) {
                principalAttr = await this.options.principalAttrFromContext(context);
            } else {
                principalAttr = {};
            }

            // 角色展开由调用方（userFromContext）负责，Guard 直接使用 principal.roles
            const roles = [...principal.roles];

            try {
                const allowed = await this.cerbosService.isAllowed({
                    principalId: principal.id,
                    roles,
                    principalAttr,
                    resourceKind: policy.resource,
                    resourceId: req.params?.id ?? '*',
                    resourceAttr,
                    action: policy.action
                });
                if (!allowed) {
                    setRequestAuditContext(req, {
                        module: policy.resource.split('.').shift() || 'security',
                        action: policy.action,
                        summary: '权限拒绝',
                        resourceType: policy.resource,
                        resourceIdPath: req.params?.id ? 'params.id' : undefined,
                        context: {
                            resource: policy.resource,
                            action: policy.action
                        }
                    });
                    appendAuditContext(req, {
                        principalRoles: roles,
                        principalId: principal.id
                    });
                    throw new ForbiddenException(ErrorCodes.CERBOS.ACCESS_DENIED.message);
                }
            } catch (error) {
                if (error instanceof ForbiddenException) throw error;
                this.logger.error('Cerbos 权限检查异常', {
                    message: (error as Error).message,
                    stack: (error as Error).stack,
                    resource: policy.resource,
                    action: policy.action
                });
                throw new ForbiddenException(ErrorCodes.CERBOS.CHECK_FAILED.message);
            }

            return true;
        }

        private async resolveAttr(attr: AttrValue | undefined, req: any): Promise<Record<string, any>> {
            if (!attr) return {};
            if (typeof attr === 'function') return await attr(req);
            return attr;
        }
    }

    const mixed = mixin(CerbosGuardMixin);
    guardCache.set(resolvedPrefix, mixed);
    return mixed;
}
