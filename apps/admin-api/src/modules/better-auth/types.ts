import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma-admin';

export type AdminBetterAuthConfig = Record<string, any>;

/**
 * 组装 admin Better Auth 运行配置时需要的依赖。
 */
export interface BetterAuthOptionsDeps {
    prisma: PrismaService;
    configService: ConfigService;
    adminUserStateService: {
        getCompositeStateVersion: (input: {
            userId: string;
            roles: Array<{ id: number; name: string }>;
        }) => Promise<string>;
    };
    rbacAuthorizationService: {
        assertPermission: (actorId: string, permissionCode: string) => Promise<void>;
    };
    betterAuthService: {
        validateAdminUsername: (username: string) => boolean | Promise<boolean>;
        initializeNewUser: (...args: any[]) => Promise<void>;
        touchLastLoginAt: (...args: any[]) => Promise<void>;
        buildCustomSession: (...args: any[]) => Promise<Record<string, unknown>>;
    };
}
