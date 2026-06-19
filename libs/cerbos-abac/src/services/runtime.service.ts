import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRedis } from '@nestjs-redis/client';
import type { CerbosModuleOptions, CerbosService } from '@app/cerbos';
import type { RedisClientType } from 'redis';
import {
    CERBOS_ABAC_BIND_BUILTIN,
    CERBOS_ABAC_BUILTIN_RESOURCE,
    CERBOS_ABAC_CERBOS_OPTIONS,
    CERBOS_ABAC_CERBOS_SERVICE,
    CERBOS_ABAC_DENY_UNBOUND,
    CERBOS_ABAC_MODULE_OPTIONS,
    CERBOS_ABAC_PRISMA,
    CERBOS_ABAC_RUNTIME_ROLE,
    CERBOS_ABAC_STATUS_ENABLE
} from '../constants';
import type {
    AbacPermissionOptions,
    CerbosAbacRuntimeCheckInput,
    NormalizedCerbosAbacModuleOptions,
    PrismaLike
} from '../types';

type RuntimeBinding =
    | { bound: false }
    | {
          bound: true;
          bindType: 'BUILTIN';
          resourceKind: string;
      };

type RuntimeBindingCachePayload = RuntimeBinding & {
    version: 1;
};

@Injectable()
export class CerbosAbacRuntimeService {
    constructor(
        @Inject(CERBOS_ABAC_PRISMA) private readonly prisma: PrismaLike,
        @Inject(CERBOS_ABAC_CERBOS_SERVICE) private readonly cerbosService: CerbosService,
        @Inject(CERBOS_ABAC_CERBOS_OPTIONS) private readonly cerbosOptions: CerbosModuleOptions,
        @Inject(CERBOS_ABAC_MODULE_OPTIONS) private readonly options: NormalizedCerbosAbacModuleOptions,
        @Optional() @InjectRedis('DEFAULT_REDIS') private readonly redis?: RedisClientType
    ) {}

    async check(input: CerbosAbacRuntimeCheckInput): Promise<boolean> {
        const user = await this.cerbosOptions.userFromContext(input.context);
        if (!user || !user.roles?.length) {
            throw new ForbiddenException('Cerbos ABAC 需要已登录用户和角色信息');
        }

        const req = input.context.switchToHttp().getRequest();
        const extAttr = await this.resolveAttr(input.options?.ext, req);
        const resourceAttr = await this.resolveAttr(input.options?.resourceAttr, req);
        const resourceId = await this.resolveResourceId(input.options, req);

        const result = await this.checkByRawInput({
            code: input.code,
            principalId: user.id,
            roles: user.roles,
            principalAttr: this.buildPrincipalAttr(req.session, extAttr),
            resourceId,
            resourceAttr
        });
        return result.allowed;
    }

    async checkByRawInput(input: {
        code: string;
        principalId: string;
        roles: string[];
        principalAttr?: Record<string, unknown>;
        resourceId?: string;
        resourceAttr?: Record<string, unknown>;
    }) {
        const binding = await this.resolveBinding(input.code);
        if (!binding.bound) {
            const allowed = this.options.unboundRuntimeMode !== CERBOS_ABAC_DENY_UNBOUND;
            return {
                allowed,
                bound: false,
                bindType: 'UNBOUND',
                resourceKind: null,
                reason: allowed ? 'ABAC 未绑定，按配置放行' : 'ABAC 未绑定，按配置拒绝'
            };
        }

        const allowed = await this.cerbosService.isAllowed({
            principalId: input.principalId,
            roles: this.withRuntimeRole(input.roles),
            principalAttr: input.principalAttr ?? {},
            resourceKind: binding.resourceKind,
            resourceId: input.resourceId ?? '*',
            resourceAttr: input.resourceAttr ?? {},
            action: input.code
        });
        return {
            allowed,
            bound: true,
            bindType: binding.bindType,
            resourceKind: binding.resourceKind,
            reason: allowed ? 'Cerbos ABAC 放行' : 'Cerbos ABAC 拒绝'
        };
    }

    async invalidateBindingCache(codes: string | string[]): Promise<void> {
        const normalizedCodes = this.normalizeCodes(Array.isArray(codes) ? codes : [codes]);
        if (!this.redis || normalizedCodes.length === 0) {
            return;
        }
        try {
            await this.redis.del(normalizedCodes.map((code) => this.createBindingCacheKey(code)));
        } catch {
            // Redis cache is best-effort. Runtime falls back to DB on cache misses or failures.
        }
    }

    private async resolveBinding(code: string): Promise<RuntimeBinding> {
        const cached = await this.readBindingCache(code);
        if (cached) {
            return cached;
        }
        const binding = await this.resolveBindingFromDatabase(code);
        await this.writeBindingCache(code, binding);
        return binding;
    }

    private async resolveBindingFromDatabase(code: string): Promise<RuntimeBinding> {
        const permission = await this.prisma.cerbosAbacPermission.findUnique({
            where: { code }
        });
        if (!permission || permission.deletedAt || permission.status !== CERBOS_ABAC_STATUS_ENABLE) {
            return { bound: false };
        }
        if (permission.bindType === CERBOS_ABAC_BIND_BUILTIN) {
            return {
                bound: true,
                bindType: 'BUILTIN',
                resourceKind: CERBOS_ABAC_BUILTIN_RESOURCE
            };
        }
        return { bound: false };
    }

    private async readBindingCache(code: string): Promise<RuntimeBinding | null> {
        if (!this.redis) {
            return null;
        }
        try {
            const value = await this.redis.get(this.createBindingCacheKey(code));
            if (!value) {
                return null;
            }
            const payload = JSON.parse(value) as RuntimeBindingCachePayload;
            if (payload.version !== 1 || typeof payload.bound !== 'boolean') {
                return null;
            }
            if (!payload.bound) {
                return { bound: false };
            }
            if (payload.bindType === CERBOS_ABAC_BIND_BUILTIN && payload.resourceKind) {
                return {
                    bound: true,
                    bindType: 'BUILTIN',
                    resourceKind: String(payload.resourceKind)
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    private async writeBindingCache(code: string, binding: RuntimeBinding): Promise<void> {
        if (!this.redis || this.options.runtimeBindingCacheTtlSeconds < 1) {
            return;
        }
        try {
            const payload: RuntimeBindingCachePayload = {
                version: 1,
                ...binding
            };
            await this.redis.set(this.createBindingCacheKey(code), JSON.stringify(payload), {
                EX: this.options.runtimeBindingCacheTtlSeconds
            });
        } catch {
            // Redis cache is best-effort. Authorization must not fail because cache storage failed.
        }
    }

    private createBindingCacheKey(code: string): string {
        return `cerbos-abac:${this.options.appName}:runtime-binding:${encodeURIComponent(code)}`;
    }

    private normalizeCodes(codes: string[]): string[] {
        return [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    }

    private withRuntimeRole(roles: string[]): string[] {
        return Array.from(new Set([...roles, CERBOS_ABAC_RUNTIME_ROLE]));
    }

    private async resolveAttr(attr: AbacPermissionOptions['resourceAttr'], req: any): Promise<Record<string, any>> {
        if (!attr) return {};
        if (typeof attr === 'function') return await attr(req);
        return attr;
    }

    private async resolveResourceId(options: AbacPermissionOptions | undefined, req: any): Promise<string> {
        const configured = options?.resourceId;
        if (typeof configured === 'function') {
            return await configured(req);
        }
        if (configured) {
            return configured;
        }
        return req.params?.id ?? '*';
    }

    private buildPrincipalAttr(sessionSnapshot: unknown, extAttr: Record<string, any>): Record<string, unknown> {
        const principalAttr: Record<string, unknown> = {};
        if (sessionSnapshot && typeof sessionSnapshot === 'object') {
            principalAttr.session = sessionSnapshot as Record<string, unknown>;
        }
        if (Object.keys(extAttr).length > 0) {
            principalAttr.ext = extAttr;
        }
        return principalAttr;
    }
}
