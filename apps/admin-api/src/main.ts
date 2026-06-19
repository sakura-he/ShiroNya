import './tracing'; // OpenTelemetry SDK 必须在所有其他 import 之前初始化
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { AppModule } from './modules/app.module';
import { createCorsOriginResolver, createRuntimeLogger, normalizeCreatedStatusToOkMiddleware } from '@app/common';

process.env.SHIRO_APP_NAME ||= 'admin-api';
const bootstrapLogger = createRuntimeLogger('admin_bootstrap');
type BetterAuthOpenApiService = AuthService<{
    api: {
        generateOpenAPISchema: () => Promise<Record<string, unknown>>;
    };
}>;

/** 为 OpenAPI 文档的所有响应统一注入用户状态响应头说明。 */
function patchUserStateHeadersForOpenApi(document: Record<string, any>) {
    const responseHeaders = {
        'x-user-state-version': {
            description: '用户状态版本号；前端用于检测用户信息/角色/菜单是否变化',
            schema: { type: 'string' }
        },
        'x-user-state-changed': {
            description: '可选；当版本发生变化时返回 1',
            schema: { type: 'string', enum: ['1'] }
        },
        'x-admin-api-devtools-enabled': {
            description: 'Admin API Devtools 后端调试是否开启；前端据此决定是否请求 debug.spicedb',
            schema: { type: 'string', enum: ['0', '1'] }
        }
    };

    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            // 跳过非 HTTP 方法节点（如 parameters），避免误写 OpenAPI 结构。
            if (!httpMethods.includes(method.toLowerCase())) continue;
            if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;

            for (const [, response] of Object.entries((operation as any).responses ?? {})) {
                if (!response || typeof response !== 'object') continue;

                (response as any).headers = {
                    ...((response as any).headers ?? {}),
                    ...responseHeaders
                };
            }
        }
    }
}

/** 将 NestJS/Better Auth 文档中的 201 成功响应统一展示为 200。 */
function normalizeCreatedResponsesForOpenApi(document: Record<string, any>) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            if (!httpMethods.includes(method.toLowerCase())) continue;
            if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;

            const responses = (operation as any).responses;
            if (!responses?.['201']) continue;

            responses['200'] ??= responses['201'];
            delete responses['201'];
        }
    }
}

/** 直接从 Better Auth 实例生成 OpenAPI schema，避免内建 generate-schema 路由长时间不结束导致 Scalar 一直 pending。 */
async function generateBetterAuthOpenApiDocument(app: NestExpressApplication) {
    const authService = app.get<BetterAuthOpenApiService>(AuthService);
    return authService.api.generateOpenAPISchema();
}

/**
 * 在 admin 应用启动成功后输出一组不同等级、不同模块、不同长度的演示日志。
 * 使用 .title() 变体仅输出标题行，不附加 detail 结构体。
 */
function emitAdminStartupPreviewLogs(): void {
    bootstrapLogger.info.title('NestJS 应用启动成功', {
        port: process.env.ADMIN_API_PORT || process.env.PORT || 3000,
        mode: process.env.NODE_ENV || 'development'
    });
    bootstrapLogger.info.title('应用启动流程完成');
}

function resolveHttpPort(config: ConfigService): number {
    const rawPort = config.get<string>('ADMIN_API_PORT') || config.get<string>('PORT') || '3000';
    const port = Number(rawPort);

    if (Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
    }

    bootstrapLogger.warn('HTTP 端口配置非法，回退到默认端口 3000', {
        rawPort
    });
    return 3000;
}

function resolveAdminCorsOrigin(config: ConfigService) {
    const rawOrigins =
        config.get<string>('ADMIN_CORS_ORIGINS') || config.getOrThrow<string>('ADMIN_BETTER_AUTH_TRUSTED_ORIGINS');

    return createCorsOriginResolver(rawOrigins);
}

/**
 * 启动 admin-api 应用
 */
async function bootstrap() {
    const app: NestExpressApplication = await NestFactory.create(AppModule);
    bootstrapLogger.info.title('NestFactory.create 完成');
    app.use(normalizeCreatedStatusToOkMiddleware);
    const config = app.get(ConfigService);
    const corsOrigin = resolveAdminCorsOrigin(config);
    const corsAllowedHeaders = [
        'content-type',
        'authorization',
        'x-request-id',
        'x-user-state-version',
        'x-admin-api-devtools',
        'x-visitor-id',
        'x-pow-solution'
    ];
    const corsExposedHeaders = [
        'x-request-id',
        'x-user-state-version',
        'x-user-state-changed',
        'x-admin-api-devtools-enabled',
        'enabled',
        'x-pow-challenge',
        'x-pow-reason'
    ];

    // 设置全局 API 前缀
    app.setGlobalPrefix('admin');
    app.set('trust proxy', 1);

    app.enableVersioning({
        type: VersioningType.HEADER,
        header: 'version'
    });

    // Swagger 配置 - 通过环境变量控制启用/禁用
    const swaggerEnabled = config.get<string>('SWAGGER_ENABLED', 'true') !== 'false';

    if (swaggerEnabled) {
        bootstrapLogger.info.title('开始构建 Swagger 文档');
        const swaggerConfig = new DocumentBuilder()
            .setTitle('ShiroAdmin API')
            .setDescription('后台管理系统 API 文档')
            .setVersion('1.0')
            .addGlobalResponse({
                status: 500,
                description: '内部错误'
            })
            .addGlobalResponse({
                status: 401,
                description: '鉴权失败'
            })
            .addBearerAuth(
                {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Bearer Token 认证令牌'
                },
                'bearer'
            )
            .build();

        // 加载 CLI 插件生成的元数据

        const document = SwaggerModule.createDocument(app, swaggerConfig);

        // 统一使用清理后的 OpenAPI 文档，避免 zod 中间标记影响展示。
        const cleanedDocument = cleanupOpenApiDoc(document);
        normalizeCreatedResponsesForOpenApi(cleanedDocument as Record<string, any>);
        // 管理后台也会返回用户状态版本响应头，文档里一并补齐说明。
        patchUserStateHeadersForOpenApi(cleanedDocument as Record<string, any>);
        const betterAuthDocument = await generateBetterAuthOpenApiDocument(app);
        normalizeCreatedResponsesForOpenApi(betterAuthDocument);

        SwaggerModule.setup('api-docs', app, cleanedDocument);
        app.use(
            '/docs',
            apiReference({
                sources: [
                    {
                        content: cleanedDocument,
                        title: '主文档'
                    },
                    {
                        content: betterAuthDocument,
                        title: 'betterAuth文档'
                    }
                ]
            })
        );
        bootstrapLogger.info.title('Swagger 文档构建完成');
    }

    // 设置静态文件目录
    app.useStaticAssets('static', {
        prefix: '/static'
    });
    // CORS 配置：允许前端携带用户状态版本请求头，并暴露版本相关响应头给浏览器读取。
    app.enableCors({
        origin: corsOrigin,
        credentials: true,
        allowedHeaders: corsAllowedHeaders,
        exposedHeaders: corsExposedHeaders,
        methods: 'GET,POST,HEAD,PUT,PATCH,DELETE,OPTIONS'
    });

    // app.useGlobalGuards(new GlobalGuard());
    const port = resolveHttpPort(config);
    bootstrapLogger.info.title('开始监听 HTTP 端口', {
        port
    });
    await app.listen(port);
    bootstrapLogger.info.title('HTTP 端口监听完成', {
        port
    });
    emitAdminStartupPreviewLogs();
}

// Webpack HMR 支持
declare const module: any;

bootstrap()
    .then(async () => {
        // 启用 HMR
        if (module.hot) {
            module.hot.accept();
            module.hot.dispose(() => {
                bootstrapLogger.warn('HMR 模块已卸载');
            });
        }
    })
    .catch(async (e) => {
        bootstrapLogger.error('应用启动失败', {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined
        });
        process.exit(1);
    });
