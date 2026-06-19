import { DynamicModule, Module } from '@nestjs/common';
import { getCerbosOptionsToken, getCerbosServiceToken } from '@app/cerbos';
import {
    CERBOS_ABAC_CERBOS_OPTIONS,
    CERBOS_ABAC_CERBOS_SERVICE,
    CERBOS_ABAC_MODULE_OPTIONS,
    CERBOS_ABAC_PRISMA,
    CERBOS_ABAC_ALLOW_UNBOUND,
    CERBOS_ABAC_RUNTIME_BINDING_CACHE_TTL_SECONDS
} from './constants';
import { CerbosAbacCompilerService } from './services/compiler.service';
import { CerbosAbacControlPlaneService } from './services/control-plane.service';
import { CerbosAbacPolicyValidatorService } from './services/policy-validator.service';
import { CerbosAbacPublisherService } from './services/publisher.service';
import { CerbosAbacRuntimeService } from './services/runtime.service';
import { CerbosAbacGuard } from './runtime.guard';
import type { CerbosAbacModuleOptions, NormalizedCerbosAbacModuleOptions } from './types';

@Module({})
export class CerbosAbacModule {
    static forRoot(options: CerbosAbacModuleOptions): DynamicModule {
        const normalized: NormalizedCerbosAbacModuleOptions = {
            appName: options.appName,
            cerbosEnvPrefix: options.cerbosEnvPrefix,
            unboundRuntimeMode: options.unboundRuntimeMode ?? CERBOS_ABAC_ALLOW_UNBOUND,
            runtimeBindingCacheTtlSeconds: normalizeCacheTtl(options.runtimeBindingCacheTtlSeconds)
        };

        return {
            module: CerbosAbacModule,
            imports: options.imports ?? [],
            providers: [
                {
                    provide: CERBOS_ABAC_MODULE_OPTIONS,
                    useValue: normalized
                },
                {
                    provide: CERBOS_ABAC_PRISMA,
                    useExisting: options.prismaServiceToken
                },
                {
                    provide: CERBOS_ABAC_CERBOS_SERVICE,
                    useExisting: getCerbosServiceToken(options.cerbosEnvPrefix)
                },
                {
                    provide: CERBOS_ABAC_CERBOS_OPTIONS,
                    useExisting: getCerbosOptionsToken(options.cerbosEnvPrefix)
                },
                CerbosAbacCompilerService,
                CerbosAbacPolicyValidatorService,
                CerbosAbacPublisherService,
                CerbosAbacControlPlaneService,
                CerbosAbacRuntimeService,
                CerbosAbacGuard
            ],
            exports: [
                CerbosAbacCompilerService,
                CerbosAbacPolicyValidatorService,
                CerbosAbacPublisherService,
                CerbosAbacControlPlaneService,
                CerbosAbacRuntimeService,
                CerbosAbacGuard
            ]
        };
    }
}

function normalizeCacheTtl(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        return CERBOS_ABAC_RUNTIME_BINDING_CACHE_TTL_SECONDS;
    }
    return value;
}
