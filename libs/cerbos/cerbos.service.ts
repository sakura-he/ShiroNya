import { ErrorCodes, createRuntimeLogger } from '@app/common';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createSecureContext, type SecureContext } from 'node:tls';
// @ts-ignore
import { GRPC } from '@cerbos/grpc';
import { assertCerbosEnvPrefix, type CerbosModuleOptions } from './cerbos.interface';

@Injectable()
export class CerbosService implements OnModuleInit {
    private readonly logger = createRuntimeLogger(CerbosService.name);
    private client!: GRPC;

    /** 环境变量前缀，由 CerbosModuleOptions.envPrefix 决定，未传时为空 */
    private readonly envPrefix: string;

    /** 由 CerbosModule.forRoot() 工厂函数直接传入 configService 和 options */
    constructor(
        private readonly configService: ConfigService,
        private readonly options?: CerbosModuleOptions
    ) {
        this.envPrefix = assertCerbosEnvPrefix(this.options?.envPrefix, 'CerbosService');
    }

    /**
     * 根据前缀拼接环境变量名，统一读取带前缀的 Cerbos 配置。
     * 例如 envPrefix='APP_' 时，key='CERBOS_ENDPOINT' → 'APP_CERBOS_ENDPOINT'
     */
    private getEnv<T extends string = string>(key: string): T | undefined;
    private getEnv<T extends string = string>(key: string, defaultValue: T): T;
    private getEnv<T extends string = string>(key: string, defaultValue?: T): T | undefined {
        const fullKey = `${this.envPrefix}${key}`;
        return defaultValue !== undefined
            ? this.configService.get<T>(fullKey, defaultValue)
            : this.configService.get<T>(fullKey);
    }

    /**
     * 根据前缀拼接环境变量名，读取必需的配置项，缺失时抛出异常。
     */
    private getEnvOrThrow<T extends string = string>(key: string): T {
        const fullKey = `${this.envPrefix}${key}`;
        return this.configService.getOrThrow<T>(fullKey);
    }

    /**
     * 初始化 Cerbos gRPC 客户端，并按配置决定是否启用 mTLS。
     * 环境变量名根据 envPrefix 拼接，支持多实例隔离。
     * endpoint 与 TLS 开关都必须显式配置，缺失时直接抛错。
     */
    async onModuleInit() {
        const endpoint = this.getEnvOrThrow('CERBOS_ENDPOINT');
        const tls = this.createTlsConfig();
        const serverName = this.getEnv('CERBOS_TLS_SERVER_NAME');

        // 构建 Admin API 凭据（如果配置了环境变量或模块选项）
        const adminCredentials = this.buildAdminCredentials();

        this.client = new GRPC(endpoint, {
            tls: tls ?? false,
            ...(adminCredentials ? { adminCredentials } : {}),
            channelOptions: serverName
                ? {
                      'grpc.ssl_target_name_override': serverName
                  }
                : undefined
        });

        if (!this.isStartupHealthCheckEnabled()) {
            this.logger.warn(`跳过 Cerbos 启动健康检查: ${endpoint}`, {
                envKey: `${this.envPrefix}CERBOS_STARTUP_HEALTH_CHECK_ENABLED`
            });
            return;
        }

        // 验证连接
        try {
            const { status } = await this.client.checkHealth();
            if (status === 'SERVING') {
                this.logger.info.title(`✅ Cerbos gRPC connected to ${endpoint}`);
            } else {
                this.logger.error(`❌ Cerbos connected but status: ${status}`);
            }
        } catch (error) {
            this.logger.error(`❌ Cerbos gRPC connection failed: ${endpoint}`, {
                errorMessage: (error as Error).message
            });
            throw error;
        }
    }

    /**
     * 按运行时配置创建 Cerbos mTLS 上下文，未开启时返回 null。
     * 所有 TLS 相关环境变量均通过 envPrefix 拼接读取。
     */
    private createTlsConfig(): SecureContext | null {
        if (!this.isTlsEnabled()) {
            return null;
        }

        const caPath = this.resolveCertPath(this.getEnvOrThrow('CERBOS_TLS_CA_PATH'));
        const clientCertPath = this.resolveCertPath(this.getEnvOrThrow('CERBOS_TLS_CLIENT_CERT_PATH'));
        const clientKeyPath = this.resolveCertPath(this.getEnvOrThrow('CERBOS_TLS_CLIENT_KEY_PATH'));

        this.assertFileExists(caPath);
        this.assertFileExists(clientCertPath);
        this.assertFileExists(clientKeyPath);

        this.logger.info(`启用 Cerbos mTLS: endpoint=${this.getEnv('CERBOS_ENDPOINT')}`);

        return createSecureContext({
            ca: readFileSync(caPath),
            cert: readFileSync(clientCertPath),
            key: readFileSync(clientKeyPath)
        });
    }

    /**
     * 解析证书路径，支持相对路径与绝对路径配置。
     */
    private resolveCertPath(filePath: string): string {
        return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
    }

    /**
     * 显式校验证书文件存在，避免 TLS 握手阶段才暴露配置错误。
     */
    private assertFileExists(filePath: string): void {
        if (!existsSync(filePath)) {
            throw new Error(ErrorCodes.CERBOS.TLS_CERT_NOT_FOUND(filePath).message);
        }
    }

    /**
     * 判断当前是否启用 Cerbos TLS，通过带前缀的环境变量读取。
     * 为避免掩盖配置错误，这里要求显式提供 true / false。
     */
    private isTlsEnabled(): boolean {
        const tlsEnabled = this.getEnvOrThrow<string>('CERBOS_TLS_ENABLED');
        if (tlsEnabled !== 'true' && tlsEnabled !== 'false') {
            throw new Error(ErrorCodes.CERBOS.TLS_ENABLED_INVALID(`${this.envPrefix}CERBOS_TLS_ENABLED`).message);
        }
        return tlsEnabled === 'true';
    }

    /**
     * 是否在应用启动时强制执行 Cerbos 健康检查。
     * 默认开启；开发环境可按实例前缀配置为 false，避免 Cerbos 暂不可达时阻塞整个应用启动。
     */
    private isStartupHealthCheckEnabled(): boolean {
        const key = 'CERBOS_STARTUP_HEALTH_CHECK_ENABLED';
        const enabled = this.getEnv<string>(key, 'true');
        if (enabled !== 'true' && enabled !== 'false') {
            throw new Error(ErrorCodes.CERBOS.BOOLEAN_FLAG_INVALID(`${this.envPrefix}${key}`).message);
        }
        return enabled === 'true';
    }

    /**
     * 构建 Admin API 凭据，优先使用环境变量，其次使用模块选项。
     * 环境变量：{PREFIX}CERBOS_ADMIN_USERNAME / {PREFIX}CERBOS_ADMIN_PASSWORD
     */
    private buildAdminCredentials(): { username: string; password: string } | undefined {
        const envUsername = this.getEnv('CERBOS_ADMIN_USERNAME');
        const envPassword = this.getEnv('CERBOS_ADMIN_PASSWORD');
        if (envUsername && envPassword) {
            return { username: envUsername, password: envPassword };
        }
        if (this.options?.adminCredentials) {
            return this.options.adminCredentials;
        }
        return undefined;
    }

    /** 获取原始客户端 */
    getClient(): GRPC {
        return this.client;
    }

    /** 检查单个资源的权限 */
    async checkResource(params: {
        principalId: string;
        roles: string[];
        principalAttr?: Record<string, any>;
        resourceKind: string;
        resourceId: string;
        resourceAttr?: Record<string, any>;
        actions: string[];
    }) {
        return this.client.checkResource({
            principal: {
                id: params.principalId,
                roles: params.roles,
                attr: params.principalAttr ?? {}
            },
            resource: {
                kind: params.resourceKind,
                id: params.resourceId,
                attr: params.resourceAttr ?? {}
            },
            actions: params.actions
        });
    }

    /** 批量检查多个资源的权限 */
    async checkResources(params: {
        principalId: string;
        roles: string[];
        principalAttr?: Record<string, any>;
        resources: Array<{
            resourceKind: string;
            resourceId: string;
            resourceAttr?: Record<string, any>;
            actions: string[];
        }>;
    }) {
        return this.client.checkResources({
            principal: {
                id: params.principalId,
                roles: params.roles,
                attr: params.principalAttr ?? {}
            },
            resources: params.resources.map((item) => ({
                resource: {
                    kind: item.resourceKind,
                    id: item.resourceId,
                    attr: item.resourceAttr ?? {}
                },
                actions: item.actions
            }))
        });
    }

    /** 检查单个操作是否允许 */
    async isAllowed(params: {
        principalId: string;
        roles: string[];
        principalAttr?: Record<string, any>;
        resourceKind: string;
        resourceId: string;
        resourceAttr?: Record<string, any>;
        action: string;
    }): Promise<boolean> {
        const result = await this.checkResource({
            ...params,
            actions: [params.action]
        });
        this.logger.debug.title('检查单个操作是否允许', {
            action: params.action,
            principalId: params.principalId,
            resourceId: params.resourceId,
            resourceKind: params.resourceKind,
            result
        });
        return result.isAllowed(params.action) ?? false;
    }
}
