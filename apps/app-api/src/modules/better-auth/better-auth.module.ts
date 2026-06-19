import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { betterAuth } from 'better-auth';
import { PrismaService } from '@app/prisma-app';
import { buildBetterAuthOptions } from './better-auth-options';
import { BetterAuthService } from './better-auth.service';
import { AdminUserStateModule } from '../user-state/admin-user-state.module';
import { RbacAuthorizationModule } from '../system/rbac/rbac-authorization.module';
import { AdminUserAdminService } from './admin-user-admin.service';

@Module({})
export class BetterAuthModule {
    /** 注册 app-api 专用 Better Auth 动态模块 */
    static forRootAsync(): DynamicModule {
        const authModule = AuthModule.forRootAsync({
            isGlobal: true,
            // 关闭 Better Auth 默认注册的全局守卫，交由 BetterAuthSessionGuard + RbacGuard 控制认证与基础 RBAC 授权。
            disableGlobalAuthGuard: true,
            imports: [AdminUserStateModule, RbacAuthorizationModule],
            inject: [PrismaService, ConfigService, BetterAuthService],
            useFactory: (
                prisma: PrismaService,
                configService: ConfigService,
                betterAuthService: BetterAuthService
            ) => {
                // 组装 app-api 的 Better Auth 配置并创建 auth 实例
                const authConfig = buildBetterAuthOptions({
                    prisma,
                    configService,
                    betterAuthService
                });
                const auth = betterAuth(authConfig);

                return {
                    auth,
                    disableTrustedOriginsCors: true
                };
            }
        });

        // 确保 Better Auth 运行时可注入本地业务服务
        authModule.providers = [...(authModule.providers || []), BetterAuthService, AdminUserAdminService];
        authModule.exports = [...(authModule.exports || []), BetterAuthService, AdminUserAdminService];
        return authModule;
    }
}
