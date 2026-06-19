import { DynamicModule, Global, InjectionToken, Module, ModuleMetadata } from '@nestjs/common';
import { AUDIT_LOG_PRISMA_CLIENT, AuditLogService, type AuditLogPrismaClient } from './audit-log.service';
import { configureRuntimeLogger } from './runtime-logger';
import type { RuntimeLoggerModuleOptions } from './runtime-log.types';

/**
 * 日志模块
 * 提供审计日志落库服务
 */
@Global()
@Module({})
export class LogModule {
    static forRoot(options: RuntimeLoggerModuleOptions = {}): DynamicModule {
        configureRuntimeLogger(options);

        return {
            module: LogModule,
            global: true
        };
    }

    static forPrisma(
        prismaModule: NonNullable<ModuleMetadata['imports']>[number],
        prismaServiceToken: InjectionToken<AuditLogPrismaClient>,
        options: RuntimeLoggerModuleOptions = {}
    ): DynamicModule {
        configureRuntimeLogger(options);

        return {
            module: LogModule,
            global: true,
            imports: [prismaModule],
            providers: [
                {
                    provide: AUDIT_LOG_PRISMA_CLIENT,
                    useFactory: (prisma: AuditLogPrismaClient) => prisma,
                    inject: [prismaServiceToken]
                },
                AuditLogService
            ],
            exports: [AuditLogService]
        };
    }
}
