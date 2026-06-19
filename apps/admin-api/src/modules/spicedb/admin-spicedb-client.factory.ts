import { BusinessException, createRuntimeLogger } from '@app/common';
import { createSpiceDbToolkit, loadConfig, type SpiceDbToolkit } from '@spicedb-toolkit/core';
import { Injectable } from '@nestjs/common';
import { AdminErrorCodes } from '../../common/constants/index';
import { isSpiceDbDebugTraceStoreActive, recordSpiceDbDebugTrace } from './spicedb-debug-trace';

export interface AdminSpiceDbClientContext {
    toolkit: SpiceDbToolkit;
}

/**
 * 创建并缓存 admin 侧 SpiceDB toolkit，供授权服务和数据管理服务复用。
 */
@Injectable()
export class AdminSpiceDbClientFactory {
    private readonly logger = createRuntimeLogger(AdminSpiceDbClientFactory.name);
    private clientContextPromise?: Promise<AdminSpiceDbClientContext>;

    /**
     * 获取缓存的 SpiceDB toolkit 上下文，初始化失败时允许下一次重新创建。
     */
    async getClientContext(): Promise<AdminSpiceDbClientContext> {
        if (!this.clientContextPromise) {
            this.clientContextPromise = this.createClientContext().catch((error) => {
                this.clientContextPromise = undefined;
                throw error;
            });
        }

        return await this.clientContextPromise;
    }

    /**
     * 从项目根目录的 spicedb.config.ts 读取连接配置并创建 toolkit。
     */
    private async createClientContext(): Promise<AdminSpiceDbClientContext> {
        try {
            const config = await loadConfig('spicedb.config.ts');
            const toolkit = createSpiceDbToolkit({
                ...config,
                tracing: {
                    ...config.tracing,
                    enabled: () => isSpiceDbDebugTraceStoreActive(),
                    nativeCheckDebug: () => isSpiceDbDebugTraceStoreActive(),
                    onTrace: recordSpiceDbDebugTrace
                }
            });

            this.logger.info.title('Admin SpiceDB toolkit 初始化成功', {
                endpoint: config.client.endpoint,
                insecure: config.client.insecure === true
            });

            return {
                toolkit
            };
        } catch (error) {
            throw this.createSpiceDbError('初始化 SpiceDB toolkit 失败', error);
        }
    }

    /**
     * 统一包装 SpiceDB 配置和客户端初始化错误，避免启动阶段丢失上下文。
     */
    private createSpiceDbError(summary: string, error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // 保留完整 detail 调用：SpiceDB 上游错误是关键调试断点，需要保留 message 字段便于排查初始化失败
        this.logger.error(summary, { message });

        return new BusinessException(AdminErrorCodes.SPICEDB.UPSTREAM_FAILED, {
            summary,
            message
        });
    }
}
