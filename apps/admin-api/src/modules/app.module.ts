import {
    ZodValidationExceptionFilter,
    HttpLogContextInterceptor,
    HttpLogMiddleware,
    LogModule,
    BusinessExceptionFilter,
    UnauthExceptionFilter,
    HttpExceptionFilter,
    UncatchExceptionFilter,
    USER_STATE_HEADER_WRITER,
    createRuntimeLogger,
    resolveRedisConnectionConfig
} from '@app/common';
import { ResponseFormatInterceptor } from '../common/interceptors/response-format.interceptor';
import { AdminUserStateModule } from './user-state/admin-user-state.module';
import { AdminUserStateService } from './user-state/admin-user-state.service';
import { PrismaModule, PrismaService } from '@app/prisma-admin';
import { CerbosModule } from '@app/cerbos';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SpiceDbModule } from '@spicedb-toolkit/nestjs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { DefaultRedisListenerService } from '../common/services/default-redis-listener.service';
import { AccountModule } from './account/account.module';
import { AuthzPermissionModule } from './authz-permission/authz-permission.module';
import { CommonModule } from './common/common.module';
import defaultConfig from './config/default.config';
import { SystemMenusModule } from './system/menus/menus.module';
import { AppApiModule } from './app-api/app-api.module';
import { SystemRbacModule } from './system/rbac/rbac.module';
import { RbacTestModule } from './rbac-test/rbac-test.module';
import { SystemRolesModule } from './system/roles/roles.module';
import { SystemDictsModule } from './system/dicts/dicts.module';
import { SatModule } from './sat/sat.module';
import { SystemTasksModule } from './system/tasks/tasks.module';
import { SystemAuditLogsModule } from './system/audit-logs/audit-logs.module';
import { SpiceDbDataModule } from './system/spicedb-data/spicedb-data.module';
import { SystemMonitorModule } from './system/monitor/monitor.module';
import { SystemUsersModule } from './system/users/users.module';
import { SystemUserGroupsModule } from './system/user-groups/user-groups.module';
import { AdminPreferencesModule } from './system/admin-preferences/admin-preferences.module';
import { RedisModule } from '@nestjs-redis/client';
import { BetterAuthModule } from './better-auth/better-auth.module';
import { BetterAuthSessionGuard } from './better-auth/better-auth-session.guard';
import { AdminSpiceDbAuthorizationModule } from './spicedb/admin-spicedb-authorization.module';
import { createSpiceDbNestOptions } from './spicedb/admin-spicedb-nestjs-resolvers';
import { AdminSpiceDbStreamConsumerModule } from './spicedb-stream/admin-spicedb-stream-consumer.module';
import { OpenTelemetryModule } from 'nestjs-otel';
import { RbacAuthorizationModule } from './system/rbac/rbac-authorization.module';
import { RbacGuard } from './system/rbac/rbac.guard';
import { SystemAbacModule } from './system/abac/abac.module';
import type { BetterAuthSession } from './better-auth/better-auth-session.type';

const defaultRedisLogger = createRuntimeLogger('admin_default_redis');
const ADMIN_CERBOS_PREFIX = 'ADMIN_';

function resolveCerbosRoleCodes(session: BetterAuthSession): string[] {
    return Array.from(
        new Set((session.roles ?? []).map((role) => role.code?.trim()).filter((code): code is string => Boolean(code)))
    );
}

@Module({
    imports: [
        // OpenTelemetry 链路追踪模块
        OpenTelemetryModule.forRoot({
            metrics: {
                hostMetrics: false // 已有 @willsoto/nestjs-prometheus，不重复采集
            }
        }),
        SystemTasksModule,
        AppApiModule,
        SystemUsersModule,
        SystemUserGroupsModule,
        AdminPreferencesModule,
        PrismaModule,
        CommonModule,
        SystemDictsModule,
        SystemMonitorModule,
        LogModule.forPrisma(PrismaModule, PrismaService),
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
            load: [
                () => {
                    return { name: 'name' };
                },
                defaultConfig
            ],
            cache: true
        }),
        // 任务模块
        ScheduleModule.forRoot(),
        BetterAuthModule.forRootAsync(),
        SpiceDbModule.forRootAsync({
            inject: [AuthService],
            useFactory: createSpiceDbNestOptions
        }),
        CerbosModule.forRoot<BetterAuthSession>({
            envPrefix: ADMIN_CERBOS_PREFIX,
            userFromContext: async (ctx) => {
                const req = ctx.switchToHttp().getRequest() as { session?: BetterAuthSession };
                const session = req.session;
                if (!session?.user) {
                    return null;
                }

                return {
                    id: session.user.id,
                    roles: resolveCerbosRoleCodes(session),
                    session
                };
            }
        }),
        AdminSpiceDbAuthorizationModule,
        RbacAuthorizationModule,
        SystemRolesModule,
        SystemMenusModule,
        AccountModule,
        AuthzPermissionModule,
        SystemRbacModule,
        SystemAbacModule,
        RbacTestModule,
        SatModule,
        SystemAuditLogsModule,
        SpiceDbDataModule,
        AdminSpiceDbStreamConsumerModule,
        // 用户状态版本号模块，提供 AdminUserStateService 供拦截器和异常过滤器使用
        AdminUserStateModule,
        // nestjs node-redis 模块(社区)
        RedisModule.forRootAsync({
            connectionName: 'DEFAULT_REDIS',
            isGlobal: true,
            useFactory: async (configService) => {
                const redisConfig = resolveRedisConnectionConfig(configService, 'ADMIN');
                return {
                    options: {
                        connectionName: 'client',
                        type: 'client',
                        url: redisConfig.url,
                        socket: {
                            connectTimeout: 10000,
                            reconnectStrategy: (retries: number) => {
                                defaultRedisLogger.warn('Redis 正在重连', {
                                    retries
                                });
                                return Math.min(retries * 100, 3000);
                            }
                        }
                    }
                };
            },
            inject: [ConfigService]
        })
    ],

    providers: [
        DefaultRedisListenerService,
        // 注册用户状态头写入器，供 BaseExceptionFilter 在异常响应中写入版本头
        {
            provide: USER_STATE_HEADER_WRITER,
            useExisting: AdminUserStateService
        },
        {
            provide: APP_GUARD,
            useClass: BetterAuthSessionGuard
        },
        {
            provide: APP_GUARD,
            useClass: RbacGuard
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: HttpLogContextInterceptor
        },
        // 过滤器注册顺序：后注册的先执行
        // 执行顺序：ZodValidation -> BusinessException -> UnauthException -> HttpException -> Uncatch(兜底)
        // 注意：更具体的异常过滤器要后注册（先执行）
        {
            provide: APP_FILTER,
            useClass: UncatchExceptionFilter
        },
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter
        },
        {
            provide: APP_FILTER,
            useClass: UnauthExceptionFilter
        },
        {
            provide: APP_FILTER,
            useClass: BusinessExceptionFilter
        },
        {
            provide: APP_FILTER,
            useClass: ZodValidationExceptionFilter
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ResponseFormatInterceptor
        },

        {
            provide: APP_PIPE,
            useClass: ZodValidationPipe
        }
    ]
})
export class AppModule implements NestModule {
    /**
     * 注册全局 HTTP 日志中间件
     */
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(HttpLogMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
    }
}
