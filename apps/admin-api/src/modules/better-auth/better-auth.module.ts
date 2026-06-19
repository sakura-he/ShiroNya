import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { betterAuth } from 'better-auth';
import { PrismaService } from '@app/prisma-admin';
import { buildBetterAuthOptions } from './better-auth-options';
import { BetterAuthService } from './better-auth.service';
import { AdminUserAdminService } from './admin-user-admin.service';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';

@Module({})
export class BetterAuthModule {
    /**
     * 注册 admin-api 专用 Better Auth 动态模块。
     */
    static forRootAsync(): DynamicModule {
        const authModule = AuthModule.forRootAsync({
            isGlobal: true,
            disableGlobalAuthGuard: true,
            imports: [AdminUserStateModule, RbacAuthorizationModule],
            inject: [
                PrismaService,
                ConfigService,
                AdminUserStateService,
                RbacAuthorizationService,
                BetterAuthService
            ],
            useFactory: (
                prisma: PrismaService,
                configService: ConfigService,
                adminUserStateService: AdminUserStateService,
                rbacAuthorizationService: RbacAuthorizationService,
                betterAuthService: BetterAuthService
            ) => {
                const authConfig = buildBetterAuthOptions({
                    prisma,
                    configService,
                    adminUserStateService,
                    rbacAuthorizationService,
                    betterAuthService
                });
                const auth = betterAuth(authConfig);

                return {
                    auth,
                    // CORS 由 main.ts 统一管理，禁止 nestjs-better-auth 自动覆盖
                    disableTrustedOriginsCors: true
                };
            }
        });

        authModule.providers = [...(authModule.providers || []), BetterAuthService, AdminUserAdminService];
        authModule.exports = [...(authModule.exports || []), BetterAuthService, AdminUserAdminService];

        return authModule;
    }
}
