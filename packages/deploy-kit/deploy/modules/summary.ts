import nodePath from 'node:path';

import type { DeployConfig } from '../../core/types.ts';
import { deployLogLocationText } from '../../logging/deploy-logger.ts';
import { shiroNyaAppImage, shiroNyaAppImageRegistry, shiroNyaAppImageTag } from './constants.ts';

/**
 * 文件作用：
 * 这个模块生成部署结束后展示给用户的摘要文本。
 *
 * 摘要的目标不是给机器读取，而是让部署人员能快速复制/检查：
 * - 部署目录在哪里。
 * - env 文件在哪里。
 * - 证书目录在哪里。
 * - 常用访问地址是什么。
 */

/** 生成部署摘要文本。 */
export function summary(config: DeployConfig): string {
    const adminApiPort = config.env.ADMIN_API_PORT ?? '57300';
    const appApiPort = config.env.APP_API_PORT ?? '3001';
    const adminWebPort = config.env.ADMIN_WEB_PORT ?? '57301';
    const adminApiOrigin = config.env.ADMIN_API_PUBLIC_ORIGIN ?? `http://localhost:${adminApiPort}`;
    const appApiOrigin = config.env.APP_API_PUBLIC_ORIGIN ?? `http://localhost:${appApiPort}`;
    const adminWebOrigin = config.env.ADMIN_WEB_PUBLIC_ORIGIN ?? `http://localhost:${adminWebPort}`;

    // 主 env 逐行展示，便于用户确认数据库、Redis、MongoDB、SpiceDB 等配置。
    const envSummary = Object.entries(config.env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // Grafana env 单独展示，和主 env 的职责边界保持一致。
    const grafanaSummary = Object.entries(config.grafanaEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    // 使用数组拼接摘要，比一个大模板字符串更容易插入可选块。
    return [
        `部署目录: ${config.targetRoot}`,
        `Docker 配置目录: ${config.targetDockerDir}`,
        `日志目录: ${config.targetLogDir}`,
        `部署运行日志: ${deployLogLocationText(config)}`,
        `应用镜像仓库: ${config.env.SHIRO_NYA_IMAGE_REGISTRY ?? shiroNyaAppImageRegistry}`,
        `应用镜像版本: ${config.env.SHIRO_NYA_IMAGE_TAG ?? shiroNyaAppImageTag}`,
        `应用镜像:`,
        `  admin-api: ${shiroNyaAppImage('admin-api', config.env)}`,
        `  app-api: ${shiroNyaAppImage('app-api', config.env)}`,
        `  admin-web: ${shiroNyaAppImage('admin-web', config.env)}`,
        `主 env: ${config.envFile}`,
        `Grafana env: ${config.grafanaEnvFile}`,
        `证书目录:`,
        // 这些路径和 certificates.ts 中生成的证书目录一一对应。
        `  ${nodePath.join(config.targetDockerDir, 'config', 'app-user-admin-grpc', 'tls')}`,
        `  ${nodePath.join(config.targetDockerDir, 'config', 'app-api-cerbos', 'tls')}`,
        `  ${nodePath.join(config.targetDockerDir, 'config', 'admin-api-cerbos', 'tls')}`,
        `  ${nodePath.join(config.targetDockerDir, 'config', 'loki', 'tls')}`,
        '',
        '主配置:',
        envSummary,
        '',
        'Grafana 配置:',
        grafanaSummary,
        '',
        '访问地址:',
        `  Grafana: http://localhost:3100`,
        `  Admin API: ${adminApiOrigin}/admin`,
        `  App API: ${appApiOrigin}/app`,
        `  Admin Web: ${adminWebOrigin}`,
        `  Redpanda Console: http://localhost:18080`
    ].join('\n');
}
