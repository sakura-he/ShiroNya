import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma-app';

export type AppBetterAuthConfig = Record<string, any>;

/**
 * 组装 Better Auth 数据库存储配置时需要的依赖。
 */
export interface AppBetterAuthStorageDeps {
    prisma: PrismaService;
}

/**
 * 组装 Better Auth 运行配置时需要的基础依赖。
 */
export interface AppBetterAuthRuntimeDeps extends AppBetterAuthStorageDeps {
    configService: ConfigService;
}

/**
 * app-api Better Auth 运行时依赖的业务服务能力。
 */
export interface BetterAuthRuntimeService {
    createSecondaryStorage: () => any;
    validatePhoneNumber: (...args: any[]) => any;
    sendOtp: (...args: any[]) => Promise<void>;
    getTempEmail: (phoneNumber: string) => string;
    getTempName: (phoneNumber: string) => string;
    isSendOtpPath: (...args: any[]) => boolean;
    handleSendOtpRateLimit: (...args: any[]) => Promise<any>;
    buildCustomSession: (...args: any[]) => Promise<Record<string, unknown>>;
    initializeNewUser: (...args: any[]) => Promise<void>;
}

/**
 * 组装 app-api 对外运行版 Better Auth 配置时需要的依赖。
 */
export interface BetterAuthOptionsDeps extends AppBetterAuthRuntimeDeps {
    betterAuthService: BetterAuthRuntimeService;
}
