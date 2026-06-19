import './tracing'; // OpenTelemetry SDK 必须在所有其他 import 之前初始化
import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc, ZodSerializerInterceptor } from 'nestjs-zod';
import { AppModule } from './modules/app.module';
import './utils/bigInt_tostring';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
    APP_USER_ADMIN_GRPC_LOADER_OPTIONS,
    APP_USER_ADMIN_GRPC_PACKAGE,
    createCorsOriginResolver,
    createRuntimeLogger,
    normalizeCreatedStatusToOkMiddleware,
    resolveAppUserAdminProtoPath,
    ShiroGrpcExceptionFilter,
    ShiroGrpcLogContextInterceptor
} from '@app/common';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { ServerCredentials } from '@grpc/grpc-js';

process.env.SHIRO_APP_NAME ||= 'app-api';
const bootstrapLogger = createRuntimeLogger('app_bootstrap');
type BetterAuthOpenApiService = AuthService<{
    api: {
        generateOpenAPISchema: () => Promise<Record<string, unknown>>;
    };
}>;

/** 为 OpenAPI 文档的所有 2xx 响应统一注入用户状态响应头说明 */
function patchUserStateHeadersForOpenApi(document: Record<string, any>) {
    const userStateHeaders = {
        'x-user-state-version': {
            description: '用户状态版本1号；前端用于检测用户信息/角色/菜单是否变化',
            schema: { type: 'string' }
        },
        'x-user-state-changed': {
            description: '可选；当版本发生变化时返回 1',
            schema: { type: 'string', enum: ['1'] }
        }
    };

    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    for (const pathItem of Object.values(document.paths ?? {})) {
        for (const [method, operation] of Object.entries(pathItem ?? {})) {
            // 跳过非 HTTP 方法节点（如 parameters）
            if (!httpMethods.includes(method.toLowerCase())) continue;
            if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;

            for (const [, response] of Object.entries((operation as any).responses ?? {})) {
                // 统一处理当前接口声明的全部响应码（2xx/4xx/5xx/default），
                // 避免仅 200 有头说明导致调用方误以为错误响应不返回版本信息。
                if (!response || typeof response !== 'object') continue;

                (response as any).headers = {
                    ...((response as any).headers ?? {}),
                    ...userStateHeaders
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

function resolveCorsOrigin(config: ConfigService) {
    const rawOrigins =
        config.get<string>('APP_CORS_ORIGINS') ||
        config.get<string>('APP_BETTER_AUTH_TRUSTED_ORIGINS') ||
        config.get<string>('BETTER_AUTH_TRUSTED_ORIGINS') ||
        '*';

    return createCorsOriginResolver(rawOrigins);
}

/**
 * 启动 app-api 应用
 */
async function bootstrap_app() {
    const app: NestExpressApplication = await NestFactory.create(AppModule, {
        // gRPC microservice 需要向 modulesContainer 注册 RPC 元数据，snapshot 模式会导致该能力不可用。
        snapshot: false
        // bodyParser: false // nestjs-better-auth  禁用 NestJS 自带的请求体解析器，以允许 Better Auth 处理原始请求体：
    });
    app.use(normalizeCreatedStatusToOkMiddleware);

    // 设置全局 API 前缀
    app.setGlobalPrefix('app');

    app.enableVersioning({
        type: VersioningType.HEADER,
        header: 'version'
    });

    // Swagger 配置 - 通过环境变量控制启用/禁用
    const config = app.get(ConfigService);
    const grpcHost = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_HOST');
    const grpcPort = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_PORT');
    const httpPort = Number(config.get<string>('APP_API_PORT', '3001'));
    const grpcCaPath = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_TLS_CA_PATH');
    const grpcServerCertPath = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_TLS_SERVER_CERT_PATH');
    const grpcServerKeyPath = config.getOrThrow<string>('APP_USER_ADMIN_GRPC_TLS_SERVER_KEY_PATH');
    const swaggerEnabled = config.get<string>('SWAGGER_ENABLED', 'true') !== 'false';

    const resolvedCaPath = isAbsolute(grpcCaPath) ? grpcCaPath : resolve(process.cwd(), grpcCaPath);
    const resolvedServerCertPath = isAbsolute(grpcServerCertPath)
        ? grpcServerCertPath
        : resolve(process.cwd(), grpcServerCertPath);
    const resolvedServerKeyPath = isAbsolute(grpcServerKeyPath)
        ? grpcServerKeyPath
        : resolve(process.cwd(), grpcServerKeyPath);

    // 当前安装的 @nestjs/core 不包含 addRpcTarget，但 @nestjs/microservices 运行时会调用它。
    // 这里补一个空实现，保证官方 gRPC transport 能在这套依赖版本上完成启动。
    const modulesContainer = (app as any).container.getModules();
    if (typeof modulesContainer.addRpcTarget !== 'function') {
        modulesContainer.addRpcTarget = () => undefined;
    }

    const grpcMicroservice = app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            package: APP_USER_ADMIN_GRPC_PACKAGE,
            protoPath: resolveAppUserAdminProtoPath(),
            url: `${grpcHost}:${grpcPort}`,
            loader: APP_USER_ADMIN_GRPC_LOADER_OPTIONS,
            credentials: ServerCredentials.createSsl(
                readFileSync(resolvedCaPath),
                [
                    {
                        cert_chain: readFileSync(resolvedServerCertPath),
                        private_key: readFileSync(resolvedServerKeyPath)
                    }
                ],
                true
            )
        }
    });
    // gRPC 成功响应保持 protobuf 原样；这里仅补齐 requestId、metadata、耗时和结构化日志上下文。
    grpcMicroservice.useGlobalInterceptors(new ShiroGrpcLogContextInterceptor());
    // Hybrid 模式下 HTTP 的 APP_FILTER 不会自动作用到 gRPC transport，这里显式注册全局 gRPC 异常过滤器。
    grpcMicroservice.useGlobalFilters(new ShiroGrpcExceptionFilter());

    if (swaggerEnabled) {
        const swaggerConfig = new DocumentBuilder()
            .setTitle('应用 API')
            .setDescription('应用 API 文档')
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

                    description: 'JWT 认证令牌'
                },
                'bearer'
            )
            .build();

        // 加载 CLI 插件生成的元数据

        const document = SwaggerModule.createDocument(app, swaggerConfig);
        // 统一使用清理后的 OpenAPI 文档，避免 zod 中间标记影响展示
        const cleanedDocument = cleanupOpenApiDoc(document);
        normalizeCreatedResponsesForOpenApi(cleanedDocument as Record<string, any>);
        // 全局补充用户状态版本响应头文档（所有 2xx 响应）
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
                    { content: betterAuthDocument, title: 'betterAuth文档' }
                ]
            })
        );
    }

    // 设置静态文件目录
    app.useStaticAssets('static', {
        prefix: '/static'
    });
    // 信任代理，以便正确获取客户端 IP（x-forwarded-for, x-real-ip）
    app.set('trust proxy', true);

    app.enableCors({
        origin: resolveCorsOrigin(config),
        credentials: true,
        allowedHeaders: [
            'content-type',
            'authorization',
            'x-request-id',
            'x-user-state-version',
            'x-visitor-id',
            'x-pow-solution'
        ],
        exposedHeaders: ['x-request-id', 'x-user-state-version', 'x-user-state-changed', 'enabled'],
        methods: 'GET,POST,HEAD,PUT,PATCH,DELETE,OPTIONS'
    });

    // 注册 ZodSerializerInterceptor 使 @ZodSerializerDto 生效
    app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));

    await app.startAllMicroservices();
    // 允许开发环境通过 APP_API_PORT 覆盖 HTTP 端口，避免与本机已运行实例冲突。
    await app.listen(httpPort);
    bootstrapLogger.info('NestJS 应用启动成功', {
        port: httpPort,
        grpc: `${grpcHost}:${grpcPort}`,
        mode: process.env.NODE_ENV || 'development'
    });
    return app;
}

// Webpack HMR 支持
declare const module: any;
let app: NestExpressApplication;

if (process.env.NODE_ENV === 'development') {
    // development
    bootstrapLogger.info.title('当前运行模式', {
        mode: 'development'
    });
} else {
    // production
    bootstrapLogger.info.title('当前运行模式', {
        mode: 'production'
    });
}

/**
 * 启动 Nest 应用并接入 HMR 生命周期。
 */
async function bootstrapApp() {
    app = await bootstrap_app();

    if (module.hot) {
        module.hot.accept();
        module.hot.dispose(async () => {
            if (app) {
                await app.close();
            }
        });
    }
}

bootstrapApp().catch((e) => {
    bootstrapLogger.error('应用启动失败', {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
    });
    process.exit(1);
});
