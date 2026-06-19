import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CerbosService } from './cerbos.service';
import {
    CerbosModuleOptions,
    getCerbosServiceToken,
    getCerbosOptionsToken
} from './cerbos.interface';

@Global()
@Module({})
export class CerbosModule {
    /** 便捷方法：获取指定 prefix 的 CerbosService 注入令牌 */
    static getServiceToken(envPrefix: string): string {
        return getCerbosServiceToken(envPrefix);
    }

    /** 便捷方法：获取指定 prefix 的 Options 注入令牌 */
    static getOptionsToken(envPrefix: string): string {
        return getCerbosOptionsToken(envPrefix);
    }

    /**
     * 同步注册 Cerbos 模块实例。
     * 每次调用必须显式传入 envPrefix，并注册独立的 CerbosService 实例。
     * 不提供默认实例，避免因前缀缺失掩盖配置错误。
     *
     * @example
     * // 注册 API 权限实例
     * CerbosModule.forRoot({ envPrefix: 'APP_', userFromContext: ... })
     * // 注册后台实例
     * CerbosModule.forRoot({ envPrefix: 'ADMIN_', userFromContext: ... })
     */
    static forRoot<TSession = unknown>(options: CerbosModuleOptions<TSession>): DynamicModule {
        const serviceToken = getCerbosServiceToken(options.envPrefix);
        const optionsToken = getCerbosOptionsToken(options.envPrefix);

        return {
            module: CerbosModule,
            imports: [ConfigModule],
            providers: [
                {
                    provide: optionsToken,
                    useValue: options
                },
                {
                    provide: serviceToken,
                    useFactory: (configService: ConfigService) => new CerbosService(configService, options),
                    inject: [ConfigService]
                }
            ],
            exports: [serviceToken, optionsToken]
        };
    }

    /**
     * 异步注册 Cerbos 模块实例，支持依赖注入。
     * @param options.envPrefix - 环境变量前缀，必须与 useFactory 返回的 envPrefix 一致
     * @param options.imports - 需要导入的模块（如 UserModule）
     * @param options.inject - 注入到 useFactory 的依赖（如 UserService）
     * @param options.useFactory - 工厂函数，返回 CerbosModuleOptions 配置
     */
    static forRootAsync<TSession = unknown>(options: {
        envPrefix: string;
        imports?: any[];
        inject?: any[];
        useFactory: (...args: any[]) => CerbosModuleOptions<TSession> | Promise<CerbosModuleOptions<TSession>>;
    }): DynamicModule {
        const serviceToken = getCerbosServiceToken(options.envPrefix);
        const optionsToken = getCerbosOptionsToken(options.envPrefix);

        return {
            module: CerbosModule,
            imports: [...(options.imports ?? []), ConfigModule],
            providers: [
                {
                    provide: optionsToken,
                    useFactory: options.useFactory,
                    inject: options.inject ?? []
                },
                {
                    provide: serviceToken,
                    useFactory: (configService: ConfigService, moduleOptions: CerbosModuleOptions<TSession>) =>
                        new CerbosService(configService, moduleOptions),
                    inject: [ConfigService, optionsToken]
                }
            ],
            exports: [serviceToken, optionsToken]
        };
    }

    /** 测试入口；模块没有默认实例相关的静态状态。 */
    static resetForTesting(): void {
        return;
    }
}
