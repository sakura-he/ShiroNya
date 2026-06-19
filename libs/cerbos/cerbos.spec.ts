/**
 * libs/cerbos 公共模块单元测试
 *
 * 覆盖范围：
 * - envPrefix 环境变量前缀拼接逻辑（CerbosService）
 * - CerbosGuard 角色直通行为（角色展开由调用方负责）
 * - forRootAsync() 异步注册与依赖注入（CerbosModule）
 *
 * Validates: Requirements US-2.3, US-2.5
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CerbosModule } from './cerbos.module';
import { CerbosService } from './cerbos.service';
import { CerbosGuardFor } from './cerbos.guard';
import { CerbosModuleOptions, getCerbosServiceToken, getCerbosOptionsToken } from './cerbos.interface';

/* Mock: @cerbos/grpc — 测试环境无 Cerbos 服务器 */
const mockGrpcClient = {
    checkHealth: jest.fn().mockResolvedValue({ status: 'SERVING' }),
    checkResource: jest.fn(),
    checkResources: jest.fn(),
    isAllowed: jest.fn()
};
jest.mock('@cerbos/grpc', () => ({
    GRPC: jest.fn().mockImplementation(() => mockGrpcClient)
}));

/* Mock: @app/common — 避免引入真实日志和审计依赖 */
jest.mock('@app/common', () => {
    const actual = jest.requireActual('@app/common');
    return {
        ...actual,
        createRuntimeLogger: () => ({
            info: Object.assign(jest.fn(), { title: jest.fn() }),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        }),
        appendAuditContext: jest.fn(),
        setRequestAuditContext: jest.fn()
    };
});

/* ================================================================== */
/*  1. envPrefix 环境变量前缀拼接逻辑                                   */
/* ================================================================== */
describe('CerbosService — envPrefix 环境变量前缀', () => {
    afterEach(() => jest.clearAllMocks());

    /** 辅助函数：根据给定的 envPrefix 和环境变量创建测试模块 */
    async function createServiceModule(
        envPrefix: string | undefined,
        envVars: Record<string, string>
    ): Promise<TestingModule> {
        const resolvedPrefix = envPrefix ?? 'TEST_';
        const serviceToken = getCerbosServiceToken(resolvedPrefix);
        return Test.createTestingModule({
            imports: [
                // ignoreEnvFile: true 避免读取项目 .env 中的真实配置干扰测试
                ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => envVars] })
            ],
            providers: [
                {
                    provide: serviceToken,
                    useFactory: (configService: ConfigService) =>
                        new CerbosService(configService, {
                            userFromContext: () => null,
                            envPrefix
                        } satisfies CerbosModuleOptions),
                    inject: [ConfigService]
                }
            ]
        }).compile();
    }

    /** APP_ 前缀（app-api 场景）：读取 APP_CERBOS_ENDPOINT */
    it('APP_ 前缀时应读取 APP_CERBOS_ENDPOINT', async () => {
        const { GRPC } = require('@cerbos/grpc');
        const mod = await createServiceModule('APP_', {
            APP_CERBOS_ENDPOINT: '127.0.0.1:3593',
            APP_CERBOS_TLS_ENABLED: 'false'
        });
        await mod.get<CerbosService>(getCerbosServiceToken('APP_')).onModuleInit();
        expect(GRPC).toHaveBeenCalledWith('127.0.0.1:3593', expect.objectContaining({ tls: false }));
        await mod.close();
    });

    /** ADMIN_ 前缀（admin-api 场景）：读取 ADMIN_CERBOS_ENDPOINT */
    it('ADMIN_ 前缀时应读取 ADMIN_CERBOS_ENDPOINT', async () => {
        const { GRPC } = require('@cerbos/grpc');
        const mod = await createServiceModule('ADMIN_', {
            ADMIN_CERBOS_ENDPOINT: '127.0.0.1:3693',
            ADMIN_CERBOS_TLS_ENABLED: 'false'
        });
        await mod.get<CerbosService>(getCerbosServiceToken('ADMIN_')).onModuleInit();
        expect(GRPC).toHaveBeenCalledWith('127.0.0.1:3693', expect.objectContaining({ tls: false }));
        await mod.close();
    });

    /** 未配置 endpoint 时应直接抛错，避免落到隐式默认实例 */
    it('未配置 endpoint 时应抛错', async () => {
        const mod = await createServiceModule('ADMIN_', { ADMIN_CERBOS_TLS_ENABLED: 'false' });
        await expect(mod.get<CerbosService>(getCerbosServiceToken('ADMIN_')).onModuleInit()).rejects.toThrow(
            'ADMIN_CERBOS_ENDPOINT'
        );
        await mod.close();
    });
});

/* ================================================================== */
/*  2. CerbosGuard 角色直通行为                                      */
/* ================================================================== */
describe('CerbosGuardFor — 角色直通行为', () => {
    afterEach(() => jest.clearAllMocks());

    const TEST_PREFIX = 'TEST_';

    /** 创建 mock ExecutionContext */
    function createMockContext(user: { id: string; roles: string[] } | null) {
        const req = { user, params: { id: '1' } };
        return {
            getHandler: jest.fn().mockReturnValue(() => {}),
            getClass: jest.fn(),
            switchToHttp: () => ({ getRequest: () => req })
        } as unknown as ExecutionContext;
    }

    /** 创建 mock Reflector，返回指定的策略装饰器值 */
    function createMockReflector(policy: any) {
        return { get: jest.fn().mockReturnValue(policy) } as unknown as Reflector;
    }

    /** 辅助：通过 DI 创建 guard 实例 */
    async function createGuard(mockService: any, reflector: any, options: CerbosModuleOptions) {
        const GuardClass = CerbosGuardFor(TEST_PREFIX);
        const mod = await Test.createTestingModule({
            providers: [
                GuardClass,
                { provide: getCerbosServiceToken(TEST_PREFIX), useValue: mockService },
                { provide: getCerbosOptionsToken(TEST_PREFIX), useValue: options },
                { provide: Reflector, useValue: reflector }
            ]
        }).compile();
        return mod.get(GuardClass);
    }

    /** Guard 直接使用 userFromContext 返回的角色，不做二次展开 */
    it('应直接使用 userFromContext 返回的角色列表', async () => {
        const mockService = { isAllowed: jest.fn().mockResolvedValue(true) } as unknown as CerbosService;
        const options: CerbosModuleOptions = {
            envPrefix: TEST_PREFIX,
            userFromContext: (ctx) => {
                const req = (ctx as any).switchToHttp().getRequest();
                return req.user ? { id: req.user.id, roles: req.user.roles, session: {} } : null;
            }
        };
        const guard = await createGuard(mockService, createMockReflector({ resource: 'test', action: 'read' }), options);
        await guard.canActivate(createMockContext({ id: '1', roles: ['admin'] }));
        // isAllowed 应收到原样角色列表，Guard 不做展开
        expect(mockService.isAllowed).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['admin'] })
        );
    });

    /** 无 @CerbosPolicy 装饰器时，Guard 应直接放行 */
    it('无策略装饰器时应直接放行', async () => {
        const mockService = { isAllowed: jest.fn() } as unknown as CerbosService;
        const options: CerbosModuleOptions = { envPrefix: TEST_PREFIX, userFromContext: () => null };
        const guard = await createGuard(mockService, createMockReflector(undefined), options);
        const result = await guard.canActivate(createMockContext(null));
        expect(result).toBe(true);
        expect(mockService.isAllowed).not.toHaveBeenCalled();
    });

    /** Cerbos 拒绝时应抛出 ForbiddenException */
    it('权限被拒绝时应抛出 ForbiddenException', async () => {
        const mockService = { isAllowed: jest.fn().mockResolvedValue(false) } as unknown as CerbosService;
        const options: CerbosModuleOptions = {
            envPrefix: TEST_PREFIX,
            userFromContext: (ctx) => {
                const req = (ctx as any).switchToHttp().getRequest();
                return req.user ? { id: req.user.id, roles: req.user.roles, session: {} } : null;
            }
        };
        const guard = await createGuard(
            mockService,
            createMockReflector({ resource: 'admin_user', action: 'delete_user' }),
            options
        );
        await expect(guard.canActivate(createMockContext({ id: '1', roles: ['viewer'] }))).rejects.toThrow(
            ForbiddenException
        );
    });
});

/* ================================================================== */
/*  3. forRootAsync() 异步注册与依赖注入                                */
/* ================================================================== */
describe('CerbosModule.forRootAsync — 异步注册', () => {
    afterEach(() => jest.clearAllMocks());

    /** 用于验证 forRootAsync 依赖注入的 token 和 mock 实现 */
    const MOCK_USER_SERVICE = 'MOCK_USER_SERVICE';
    const mockUserService = {
        /** 根据用户 ID 查询角色 codes */
        getRolesByID: jest.fn().mockResolvedValue(['admin', 'editor'])
    };

    /** forRootAsync 应正确注入依赖并生成 CerbosModuleOptions */
    it('useFactory 应接收注入的依赖并返回正确的 CerbosModuleOptions', async () => {
        // 创建一个导出 mock 服务的临时模块，模拟真实场景中的 UserModule
        const MockUserModule = {
            module: class MockUserModule {},
            providers: [{ provide: MOCK_USER_SERVICE, useValue: mockUserService }],
            exports: [MOCK_USER_SERVICE]
        };

        const mod = await Test.createTestingModule({
            imports: [
                // 忽略 .env 避免真实环境变量干扰
                ConfigModule.forRoot({ ignoreEnvFile: true }),
                CerbosModule.forRootAsync({
                    envPrefix: 'ADMIN_',
                    // 通过 imports 引入 mock 模块，模拟 admin 项目注入 UserModule 的场景
                    imports: [MockUserModule],
                    inject: [MOCK_USER_SERVICE],
                    useFactory: (userService: typeof mockUserService) => ({
                        envPrefix: 'ADMIN_',
                        userFromContext: async (ctx: ExecutionContext) => {
                            const req = ctx.switchToHttp().getRequest();
                            const user = req.user;
                            if (!user?.id) return null;
                            const roles = await userService.getRolesByID(user.id);
                            return { id: String(user.id), roles, session: user };
                        }
                    })
                })
            ]
        }).compile();

        // 验证 CERBOS_MODULE_OPTIONS 被正确注入
        const options = mod.get<CerbosModuleOptions>(getCerbosOptionsToken('ADMIN_'));
        expect(options).toBeDefined();
        expect(options.envPrefix).toBe('ADMIN_');
        expect(typeof options.userFromContext).toBe('function');

        // 验证 CerbosService 被正确注入
        const service = mod.get<CerbosService>(getCerbosServiceToken('ADMIN_'));
        expect(service).toBeDefined();

        await mod.close();
    });

    /** forRootAsync 应导出当前 envPrefix 对应的 CerbosService 和 options token */
    it('应导出当前 envPrefix 对应的 CerbosService 和 options token', async () => {
        const mod = await Test.createTestingModule({
            imports: [
                // 先注册 ConfigModule 并忽略 .env，避免真实环境变量干扰
                ConfigModule.forRoot({ ignoreEnvFile: true }),
                CerbosModule.forRootAsync({
                    envPrefix: 'APP_',
                    useFactory: () => ({
                        envPrefix: 'APP_',
                        userFromContext: () => null
                    })
                })
            ]
        }).compile();

        // 两个动态 token 都应可从模块中获取
        expect(mod.get<CerbosService>(getCerbosServiceToken('APP_'))).toBeInstanceOf(CerbosService);
        expect(mod.get<CerbosModuleOptions>(getCerbosOptionsToken('APP_'))).toBeDefined();

        await mod.close();
    });

    /** forRootAsync 传 APP_ 前缀时应读取 APP_CERBOS_ENDPOINT */
    it('传 APP_ envPrefix 时应读取 APP_CERBOS_ENDPOINT', async () => {
        const { GRPC } = require('@cerbos/grpc');
        const mod = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    ignoreEnvFile: true,
                    load: [() => ({ APP_CERBOS_ENDPOINT: '127.0.0.1:3593', APP_CERBOS_TLS_ENABLED: 'false' })]
                }),
                CerbosModule.forRootAsync({
                    envPrefix: 'APP_',
                    useFactory: () => ({
                        envPrefix: 'APP_',
                        userFromContext: () => null
                    })
                })
            ]
        }).compile();

        const service = mod.get<CerbosService>(getCerbosServiceToken('APP_'));
        await service.onModuleInit();

        expect(GRPC).toHaveBeenCalledWith('127.0.0.1:3593', expect.objectContaining({ tls: false }));

        await mod.close();
    });
});
