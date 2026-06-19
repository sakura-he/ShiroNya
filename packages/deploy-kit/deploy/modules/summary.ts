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
 * - 首次登录和排查问题时常用的账号、密码、token 是什么。
 *
 * 安全说明：
 * - 这个部署工具面向用户自己的服务器，部署完成后需要把明文密码直接显示在控制台，方便用户第一次登录和排查。
 * - 这里不做脱敏；如果以后要改成脱敏，必须先确认用户仍能在其他地方清楚拿到首次登录凭据。
 */

/** 开源 SQL 初始化的后台管理管理员账号。 */
const ADMIN_API_ADMIN_USERNAME = 'admin';

/** 开源 SQL 初始化的后台管理管理员密码。 */
const ADMIN_API_ADMIN_PASSWORD = 'Admin@123456';

/** 开源 SQL 初始化的后台管理演示账号。 */
const ADMIN_API_DEMO_USERNAME = 'demo';

/** 开源 SQL 初始化的后台管理演示账号密码。 */
const ADMIN_API_DEMO_PASSWORD = 'Demo@123456';

/** 开源 SQL 初始化的 app-api 管理数据账号。 */
const APP_API_ADMIN_USERNAME = 'admin';

/** 开源 SQL 初始化的 app-api 管理数据账号密码。 */
const APP_API_ADMIN_PASSWORD = 'Admin@123456';

/** 开源 SQL 初始化的 app-api 演示数据账号。 */
const APP_API_DEMO_USERNAME = 'demo';

/** 开源 SQL 初始化的 app-api 演示数据账号密码。 */
const APP_API_DEMO_PASSWORD = 'Demo@123456';

/**
 * 读取配置值，缺失时显示中文占位。
 *
 * 这里不抛错，因为摘要只负责展示；真正的必填校验已经在 config/index.ts 的 buildConfig 阶段完成。
 */
function summaryValue(value: string | undefined): string {
    return value?.trim() || '未配置';
}

/** 生成服务账号密码速查区块。 */
function serviceCredentialSummary(config: DeployConfig): string[] {
    const grafanaUser = 'admin';
    const redpandaConsoleAuth = '未启用账号密码';
    const lokiAuth = '未启用账号密码，供 Grafana/Promtail 在 Docker 网络内访问';
    const tempoAuth = '未启用账号密码，供 Grafana 在 Docker 网络内访问';

    return [
        '服务账号密码:',
        `  PostgreSQL 主库: host=localhost port=15432 user=${summaryValue(config.env.POSTGRES_USER)} password=${summaryValue(config.env.POSTGRES_PASSWORD)} default_db=${summaryValue(config.env.POSTGRES_DB)}`,
        `  PostgreSQL Admin 数据库: database=${summaryValue(config.env.ADMIN_POSTGRES_DB)} user=${summaryValue(config.env.POSTGRES_USER)} password=${summaryValue(config.env.POSTGRES_PASSWORD)}`,
        `  PostgreSQL App 数据库: database=${summaryValue(config.env.APP_POSTGRES_DB)} user=${summaryValue(config.env.POSTGRES_USER)} password=${summaryValue(config.env.POSTGRES_PASSWORD)}`,
        `  PostgreSQL SpiceDB 数据库: database=${summaryValue(config.env.SPICEDB_POSTGRES_DB)} user=${summaryValue(config.env.SPICEDB_POSTGRES_USER)} password=${summaryValue(config.env.SPICEDB_POSTGRES_PASSWORD)}`,
        `  Admin Redis: host=localhost port=${summaryValue(config.env.ADMIN_REDIS_PORT)} user=${summaryValue(config.env.ADMIN_REDIS_USER)} password=${summaryValue(config.env.ADMIN_REDIS_PASSWORD)}`,
        `  App Redis: host=localhost port=${summaryValue(config.env.APP_REDIS_PORT)} user=${summaryValue(config.env.APP_REDIS_USER)} password=${summaryValue(config.env.APP_REDIS_PASSWORD)}`,
        `  MongoDB: host=localhost port=27017 user=${summaryValue(config.env.MONGO_USER)} password=${summaryValue(config.env.MONGO_PASSWORD)} database=${summaryValue(config.env.MONGO_DB)} authSource=admin`,
        `  SpiceDB gRPC: endpoint=localhost:50052 token=${summaryValue(config.env.SPICEDB_GRPC_PRESHARED_KEY)}`,
        `  Grafana: user=${grafanaUser} password=${summaryValue(config.grafanaEnv.GF_SECURITY_ADMIN_PASSWORD)}`,
        `  Redpanda Console: ${redpandaConsoleAuth}`,
        `  Loki: ${lokiAuth}`,
        `  Tempo: ${tempoAuth}`
    ];
}

/** 生成开源版初始化业务账号速查区块。 */
function applicationCredentialSummary(): string[] {
    return [
        '内置业务账号:',
        `  admin-api 管理员: username=${ADMIN_API_ADMIN_USERNAME} password=${ADMIN_API_ADMIN_PASSWORD}`,
        `  admin-api 演示用户: username=${ADMIN_API_DEMO_USERNAME} password=${ADMIN_API_DEMO_PASSWORD}`,
        `  app-api 管理数据账号: username=${APP_API_ADMIN_USERNAME} password=${APP_API_ADMIN_PASSWORD}`,
        `  app-api 演示数据账号: username=${APP_API_DEMO_USERNAME} password=${APP_API_DEMO_PASSWORD}`,
        '  说明: Admin Web 登录使用 admin-api 账号；app-api 账号主要用于后台 App 用户管理、RBAC 关系和演示数据。'
    ];
}

/** 生成部署摘要文本。 */
export function summary(config: DeployConfig): string {
    const adminApiPort = config.env.ADMIN_API_PORT ?? '57300';
    const appApiPort = config.env.APP_API_PORT ?? '57303';
    const adminWebPort = config.env.ADMIN_WEB_PORT ?? '57301';
    const grafanaPort = config.env.GRAFANA_PORT ?? '57302';
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
        ...serviceCredentialSummary(config),
        '',
        ...applicationCredentialSummary(),
        '',
        '主配置:',
        envSummary,
        '',
        'Grafana 配置:',
        grafanaSummary,
        '',
        '访问地址:',
        `  Grafana: http://localhost:${grafanaPort}`,
        `  Admin API 健康检查: ${adminApiOrigin}/admin/api/auth/get-session`,
        `  App API 健康检查: ${appApiOrigin}/app/api/auth/get-session`,
        `  Admin Web: ${adminWebOrigin}`,
        `  Redpanda Console: http://localhost:18080`
    ].join('\n');
}
