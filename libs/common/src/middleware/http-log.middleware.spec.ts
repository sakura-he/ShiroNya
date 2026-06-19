import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import { HttpLogMiddleware } from './http-log.middleware';
import { createRuntimeLogger } from '../logger/runtime-logger';
import { getRequestContext } from '../logger/request-context';
import { mergeRequestLogContext } from '../logger/runtime-log.util';
import type { RuntimeRequestContext } from '../logger/runtime-log.types';
import type { HttpLoggingRequest } from '../logger/http-log.types';

jest.mock('@opentelemetry/api', () => ({
    SpanKind: {
        CLIENT: 2
    },
    SpanStatusCode: {
        ERROR: 2
    },
    trace: {
        getActiveSpan: jest.fn(),
        getTracer: jest.fn(() => ({
            startActiveSpan: (_name: string, _options: unknown, callback: (span: unknown) => unknown) =>
                callback({
                    recordException: jest.fn(),
                    setStatus: jest.fn(),
                    end: jest.fn()
                })
        }))
    }
}));

class MockHttpResponse extends EventEmitter {
    statusCode = 200;
    private readonly headersStore: Record<string, unknown> = {};
    json = jest.fn((body: unknown) => body);
    send = jest.fn((body: unknown) => body);

    /**
     * 记录响应头，模拟 Express Response 的行为。
     */
    setHeader(name: string, value: unknown) {
        this.headersStore[name.toLowerCase()] = value;
    }

    /**
     * 返回当前已写入的响应头快照。
     */
    getHeaders() {
        return this.headersStore;
    }
}

describe('HttpLogMiddleware', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        process.env.SHIRO_APP_NAME = 'jest-app';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-http-log-'));
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'debug').mockImplementation(() => undefined);
        (trace.getActiveSpan as jest.Mock).mockReturnValue(undefined);
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        jest.restoreAllMocks();
    });

    /**
     * 等待目录内生成匹配前缀的日志文件，并返回完整路径。
     */
    async function waitForLogFilePath(directoryPath: string, filePrefix: string): Promise<string> {
        for (let index = 0; index < 60; index += 1) {
            try {
                const fileName = readdirSync(directoryPath).find((entry) => entry.startsWith(filePrefix));
                if (fileName) {
                    return path.join(directoryPath, fileName);
                }
            } catch {
                // 目录尚未创建时继续重试。
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        throw new Error(`日志目录未按预期生成文件: ${directoryPath}\\${filePrefix}*`);
    }

    /**
     * 等待日志文件出现指定内容，避免异步落盘导致断言过早执行。
     */
    async function waitForLogContent(filePath: string, expectedText: string): Promise<string> {
        for (let index = 0; index < 60; index += 1) {
            try {
                const content = readFileSync(filePath, 'utf8');
                if (content.includes(expectedText)) {
                    return content;
                }
            } catch {
                // 文件尚未生成时继续重试。
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        throw new Error(`日志文件未按预期包含内容: ${expectedText}`);
    }

    /**
     * 验证自动 HTTP 日志只保留一条完成态日志，并在标题中直接展示最终状态码。
     */
    it('should write a single completion log title with final status code', async () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'GET',
            url: '/app/account/permissions',
            originalUrl: '/app/account/permissions',
            headers: {
                'x-request-id': 'req-finish-title',
                'user-agent': 'jest-agent'
            },
            query: {},
            params: {},
            body: undefined,
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            },
            route: {
                path: '/app/account/permissions'
            },
            session: {
                user: {
                    id: 'user-100',
                    name: 'tester'
                },
                roles: [{ code: 'member' }]
            },
            __shiroLogContext: {
                module: 'Account',
                controllerHandler: 'AccountController.getAccountPermissions'
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();
        response.statusCode = 403;

        middleware.use(request, response as any, jest.fn() as NextFunction);
        request.params = {
            permission: 'account.permissions'
        };
        response.json({
            code: 403,
            message: '没有权限执行此操作',
            data: null
        });
        response.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));

        const logDir = path.join(process.env.LOKI_LOG_DIR as string, 'jest-app');
        const logPath = await waitForLogFilePath(logDir, 'user_action-');
        const logContent = await waitForLogContent(logPath, '[完成 403] GET /app/account/permissions');
        const logLines = logContent
            .trim()
            .split(/\r?\n/)
            .filter((line) => line.length > 0);

        expect(logLines).toHaveLength(1);
        expect(logContent).toContain('"message":"[完成 403] GET /app/account/permissions"');
        expect(logContent).toContain('"event":"http_response"');
        expect(logContent).toContain('"requestParams":{"permission":"account.permissions"}');
        expect(logContent).not.toContain('"message":"[请求] GET /app/account/permissions"');
    });

    it('should attach request id to current OpenTelemetry span', () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const setAttributes = jest.fn();
        (trace.getActiveSpan as jest.Mock).mockReturnValue({ setAttributes });
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'GET',
            url: '/admin/dict/get_dict_list',
            originalUrl: '/admin/dict/get_dict_list?page=1&pageSize=100',
            headers: {
                'x-request-id': 'req-otel-1',
                'user-agent': 'jest-agent'
            },
            query: {},
            params: {},
            body: undefined,
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();

        middleware.use(request, response as any, jest.fn() as NextFunction);

        expect(setAttributes).toHaveBeenCalledWith({
            'request.id': 'req-otel-1',
            'http.request_id': 'req-otel-1',
            'shiro.request_id': 'req-otel-1'
        });
    });

    it('should create fallback request id when request header is absent', () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const setAttributes = jest.fn();
        (trace.getActiveSpan as jest.Mock).mockReturnValue({ setAttributes });
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'GET',
            url: '/admin/dict/get_dict_list',
            originalUrl: '/admin/dict/get_dict_list?page=1&pageSize=100',
            headers: {
                'user-agent': 'jest-agent'
            },
            query: {},
            params: {},
            body: undefined,
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();

        middleware.use(request, response as any, jest.fn() as NextFunction);

        const generatedRequestId = request.__shiroLogContext?.requestId;
        expect(generatedRequestId).toEqual(expect.any(String));
        expect(response.getHeaders()).toHaveProperty('x-request-id', generatedRequestId);
        expect(request.headers).toHaveProperty('x-request-id', generatedRequestId);
        expect(setAttributes).toHaveBeenCalledWith({
            'request.id': generatedRequestId,
            'http.request_id': generatedRequestId,
            'shiro.request_id': generatedRequestId
        });
    });

    /**
     * 验证即使中间件被重复注册到同一路由，也不会在同一个响应对象上重复绑定 finish。
     */
    it('should bind finish listener only once when applied multiple times', async () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'GET',
            url: '/admin/app/user/list',
            originalUrl: '/admin/app/user/list',
            headers: {
                'x-request-id': 'req-duplicate-middleware',
                'user-agent': 'jest-agent'
            },
            query: {},
            params: {},
            body: undefined,
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            },
            route: {
                path: '/admin/app/user/list'
            },
            __shiroLogContext: {
                audit: {
                    module: 'user',
                    action: 'list',
                    summary: '查询用户列表',
                    resourceType: 'user'
                }
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();
        const next = jest.fn() as NextFunction;

        middleware.use(request, response as any, next);
        middleware.use(request, response as any, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(response.listenerCount('finish')).toBe(1);

        response.json({
            code: 0,
            message: 'ok'
        });
        response.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));

        expect(auditLogService.writeAuditLog).toHaveBeenCalledTimes(1);
    });

    /**
     * 验证显式审计上下文会把完整请求/响应快照传入审计服务。
     */
    it('should write full request and response snapshots for explicit audit context', async () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'POST',
            url: '/admin/app/user/update',
            originalUrl: '/admin/app/user/update',
            headers: {
                'x-request-id': 'req-1',
                'user-agent': 'jest-agent'
            },
            query: {
                includeRoles: '1'
            },
            params: {},
            body: {
                id: 'user-1',
                password: 'plain-password'
            },
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            },
            route: {
                path: '/admin/app/user/update'
            },
            session: {
                user: {
                    id: 'user-1',
                    name: 'tester'
                },
                roles: [{ code: 'admin' }]
            },
            __shiroLogContext: {
                module: 'AppUser',
                controllerHandler: 'AppUserController.updateUser',
                audit: {
                    module: 'app_user',
                    action: 'update',
                    summary: '更新 App 用户',
                    resourceType: 'app_user',
                    resourceIdPath: 'body.id'
                }
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();

        middleware.use(request, response as any, jest.fn() as NextFunction);
        response.json({
            code: 0,
            message: 'ok',
            data: {
                id: 'user-1',
                password: 'plain-password'
            }
        });
        response.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));

        expect(auditLogService.writeAuditLog).toHaveBeenCalledTimes(1);
        expect(auditLogService.writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: 'req-1',
                module: 'app_user',
                action: 'update',
                resourceId: 'user-1',
                requestMethod: 'POST',
                requestPath: '/admin/app/user/update',
                requestHeaders: expect.objectContaining({
                    'x-request-id': 'req-1'
                }),
                requestBody: expect.objectContaining({
                    id: 'user-1',
                    password: 'plain-password'
                }),
                responseBody: expect.objectContaining({
                    code: 0
                })
            })
        );
    });

    /**
     * 验证无显式装饰器时也会根据认证路径推断审计动作，并在生产环境脱敏。
     */
    it('should infer auth audit context and mask sensitive fields in production', async () => {
        process.env.NODE_ENV = 'production';
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = {
            method: 'POST',
            url: '/app/auth/login_by_username',
            originalUrl: '/app/auth/login_by_username',
            headers: {
                'user-agent': 'jest-agent'
            },
            query: {},
            params: {},
            body: {
                uid: '1001',
                password: 'plain-password'
            },
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            },
            route: {
                path: '/app/auth/login_by_username'
            },
            __shiroLogContext: {
                module: 'Auth',
                controllerHandler: 'AuthController.loginByUsername'
            }
        } as unknown as HttpLoggingRequest;
        const response = new MockHttpResponse();
        response.statusCode = 401;

        middleware.use(request, response as any, jest.fn() as NextFunction);
        response.json({
            code: 401001,
            message: 'bad credentials'
        });
        response.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));

        expect(auditLogService.writeAuditLog).toHaveBeenCalledTimes(1);
        expect(auditLogService.writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({
                module: 'auth',
                action: 'login',
                result: 'DENY',
                requestBody: expect.objectContaining({
                    uid: '1001',
                    password: '[FILTERED]'
                })
            })
        );
    });
});

// admin-logger-unification: middleware + interceptor + ALS integration tests
//
// Validates: Requirements 4.2, 4.3, 4.6, 4.7, 8.8
//
// 这一组测试覆盖 HttpLogMiddleware 与 HttpLogContextInterceptor 在 Request_Context_Store
// （AsyncLocalStorage）上的端到端协作：
// - 中间件入口阶段构造的 RuntimeRequestContext 能被 next() 内部 getRequestContext() 读到，
//   且包含已脱敏的 requestId / actor / http(method, path, route, body, query, params, headers)。
// - HttpLogContextInterceptor 回填 module / controllerHandler 后，
//   下游同一请求范围内的调用方能读到归一化后的值。
// - response.emit('finish') 后 ALS 上下文释放，外层栈 getRequestContext() 必须为 undefined。
// - shouldSkip 命中路径下中间件不进入 ALS，next() 内 getRequestContext() 始终为 undefined。
describe('HttpLogMiddleware + HttpLogContextInterceptor + ALS integration', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        process.env.SHIRO_APP_NAME = 'jest-app';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-http-log-als-'));
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'debug').mockImplementation(() => undefined);

        // 防御性断言：每个用例开始前外层栈不应残留上下文
        if (getRequestContext() !== undefined) {
            throw new Error('Pre-test invariant violated: outer getRequestContext() should be undefined');
        }
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        jest.restoreAllMocks();
    });

    /**
     * 构造一份用于本组测试的 mock request；包含会被 sanitize 的敏感字段，
     * 用于验证 http 快照在中间件入口已经脱敏。
     */
    function buildRequest(overrides?: Partial<HttpLoggingRequest>): HttpLoggingRequest {
        const baseRequest = {
            method: 'POST',
            url: '/admin/app/user/update?includeRoles=1',
            originalUrl: '/admin/app/user/update?includeRoles=1',
            headers: {
                'x-request-id': 'req-als-int-1',
                'user-agent': 'jest-agent',
                'authorization': 'Bearer secret-token'
            },
            query: {
                includeRoles: '1'
            },
            params: {
                userId: 'user-77'
            },
            body: {
                id: 'user-77',
                password: 'plain-password'
            },
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            },
            route: {
                path: '/admin/app/user/update'
            },
            session: {
                user: {
                    id: 'user-77',
                    name: 'tester'
                },
                roles: [{ code: 'admin' }]
            }
        } as unknown as HttpLoggingRequest;

        if (!overrides) {
            return baseRequest;
        }

        return Object.assign(baseRequest, overrides);
    }

    /**
     * 用例 a：在中间件链 next() 回调内调用 getRequestContext()，断言返回的 RuntimeRequestContext
     * 包含 requestId / actor / http(method, path, route, sanitized body/query/params/headers)。
     */
    it('next() 回调内 getRequestContext() 返回包含 requestId / actor / http(已脱敏) 的完整上下文', () => {
        // 强制生产环境，确保 sensitive 字段被 sanitizeForLogging 替换为 [FILTERED]
        process.env.NODE_ENV = 'production';

        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = buildRequest();
        const response = new MockHttpResponse();

        let captured: RuntimeRequestContext | undefined;
        const next: NextFunction = () => {
            captured = getRequestContext();
        };

        middleware.use(request, response as any, next);

        expect(captured).toBeDefined();
        // requestId 应来自 x-request-id header
        expect(captured?.requestId).toBe('req-als-int-1');

        // actor 由 extractActorFromRequest(session.user / session.roles) 推断
        expect(captured?.actor).toEqual(
            expect.objectContaining({
                id: 'user-77',
                type: 'user',
                name: 'tester',
                roles: ['admin']
            })
        );

        // http 快照：method / path / route 三个核心字段
        expect(captured?.http).toBeDefined();
        expect(captured?.http?.method).toBe('POST');
        expect(captured?.http?.path).toBe('/admin/app/user/update?includeRoles=1');
        expect(captured?.http?.route).toBe('/admin/app/user/update');

        // sanitized 字段：requestQuery / requestParams 走 sanitize 后保持原值（无敏感 key）
        expect(captured?.http?.requestQuery).toEqual({ includeRoles: '1' });
        expect(captured?.http?.requestParams).toEqual({ userId: 'user-77' });

        // body 中的 password 字段在生产环境必须被脱敏
        expect(captured?.http?.requestBody).toEqual(
            expect.objectContaining({
                id: 'user-77',
                password: '[FILTERED]'
            })
        );

        // headers 中的 authorization 字段在生产环境必须被脱敏
        const requestHeaders = captured?.http?.requestHeaders as Record<string, unknown> | undefined;
        expect(requestHeaders?.['authorization']).toBe('[FILTERED]');
        expect(requestHeaders?.['x-request-id']).toBe('req-als-int-1');

        // 整理：触发 finish 让 ALS 释放，避免污染后续用例
        response.emit('finish');
    });

    /**
     * 用例 b：模拟 HttpLogContextInterceptor 在 next() 期间回填 request.__shiroLogContext
     * 回填 module / controllerHandler，断言下游同一请求范围内能读到归一化后的值。
     */
    it('interceptor 模拟回填后 getRequestContext().module / controllerHandler 反映归一化值', () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = buildRequest();
        const response = new MockHttpResponse();

        // 注意：getRequestContext() 与 request.__shiroLogContext 指向同一份对象。
        // 拦截器只需要更新 request 上的对象，ALS 内的调用方会读到同一引用的最新字段。
        let beforeRef: RuntimeRequestContext | undefined;
        let beforeModule: string | undefined;
        let beforeControllerHandler: string | undefined;
        let updatedRef: RuntimeRequestContext | undefined;
        let afterRef: RuntimeRequestContext | undefined;
        let afterModule: string | undefined;
        let afterControllerHandler: string | undefined;
        let serviceLogEntry: ReturnType<ReturnType<typeof createRuntimeLogger>['info']> | undefined;

        const next: NextFunction = () => {
            // 中间件入口阶段：module / controllerHandler 尚未回填
            beforeRef = getRequestContext();
            beforeModule = beforeRef?.module;
            beforeControllerHandler = beforeRef?.controllerHandler;

            // 模拟 HttpLogContextInterceptor 的关键调用：
            // module 已是归一化后的值（normalizeModuleName('UserController') === 'User'）
            updatedRef = mergeRequestLogContext(request, {
                module: 'User',
                controllerHandler: 'UserController.create',
                actor: {
                    id: 'user-77',
                    type: 'user',
                    name: 'tester',
                    roles: ['admin']
                },
                http: {
                    controllerHandler: 'UserController.create',
                    route: '/admin/app/user/update',
                    requestParams: {
                        userId: 'user-77'
                    }
                }
            });

            afterRef = getRequestContext();
            afterModule = afterRef?.module;
            afterControllerHandler = afterRef?.controllerHandler;
            serviceLogEntry = createRuntimeLogger('UserService').info('service log after interceptor');
        };

        middleware.use(request, response as any, next);

        // 入口阶段：module / controllerHandler 应为 undefined（中间件不主动覆盖）
        expect(beforeModule).toBeUndefined();
        expect(beforeControllerHandler).toBeUndefined();

        // 拦截器回填后：getRequestContext() 必须立刻反映新的字段值，
        // 且 request 写入函数返回的对象、ALS 读出的对象、入口对象都是同一引用。
        expect(updatedRef).toBe(beforeRef);
        expect(afterRef).toBe(beforeRef);
        expect(afterModule).toBe('User');
        expect(afterControllerHandler).toBe('UserController.create');
        expect(serviceLogEntry?.actor).toEqual(
            expect.objectContaining({
                id: 'user-77',
                type: 'user',
                name: 'tester',
                roles: ['admin']
            })
        );
        expect(serviceLogEntry?.http).toEqual(
            expect.objectContaining({
                controllerHandler: 'UserController.create',
                route: '/admin/app/user/update',
                requestParams: {
                    userId: 'user-77'
                }
            })
        );

        response.emit('finish');
    });

    /**
     * 用例 c：response.emit('finish') 之后从外层调用 getRequestContext() 必须返回 undefined。
     * （ALS 上下文随着 runWithRequestContext 同步返回而释放；finish 事件本身不参与 ALS 释放，
     *   但因为 next() 已经同步返回，再触发 finish 后外层栈 getRequestContext() 必然为 undefined。）
     */
    it('response.emit("finish") 之后外层 getRequestContext() 必须为 undefined', async () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);
        const request = buildRequest({
            __shiroLogContext: {
                module: 'User',
                controllerHandler: 'UserController.update',
                audit: {
                    module: 'app_user',
                    action: 'update',
                    summary: '更新用户',
                    resourceType: 'app_user'
                }
            } as RuntimeRequestContext
        } as Partial<HttpLoggingRequest>);
        const response = new MockHttpResponse();

        // 中间件包裹下，next() 内可见上下文
        let seenInsideNext: RuntimeRequestContext | undefined;
        middleware.use(request, response as any, () => {
            seenInsideNext = getRequestContext();
        });

        expect(seenInsideNext).toBeDefined();

        // 中间件 next() 同步返回后，外层栈立即不可见
        expect(getRequestContext()).toBeUndefined();

        // 触发响应完成（含 audit / user_action 落盘的异步副作用）
        response.json({ code: 0, message: 'ok' });
        response.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));

        // finish 异步副作用执行完毕后，外层栈仍然不可见
        expect(getRequestContext()).toBeUndefined();
    });

    /**
     * 用例 d：shouldSkip 命中路径（如 /health / /favicon.ico）下，中间件不应进入 ALS，
     * next() 回调内 getRequestContext() 必须为 undefined。
     */
    it('shouldSkip 命中路径下 next() 回调内 getRequestContext() 始终为 undefined', () => {
        const auditLogService = {
            writeAuditLog: jest.fn().mockResolvedValue(undefined)
        };
        const middleware = new HttpLogMiddleware(auditLogService as any);

        const skippedPaths = ['/health', '/favicon.ico', '/api-docs', '/docs/swagger', '/static/app.js'];

        for (const skippedPath of skippedPaths) {
            const request = {
                method: 'GET',
                url: skippedPath,
                originalUrl: skippedPath,
                headers: {
                    'x-request-id': 'req-skipped',
                    'user-agent': 'jest-agent'
                },
                query: {},
                params: {},
                body: undefined,
                ip: '127.0.0.1',
                socket: {
                    remoteAddress: '127.0.0.1'
                }
            } as unknown as HttpLoggingRequest;
            const response = new MockHttpResponse();

            let captured: RuntimeRequestContext | undefined | 'unset' = 'unset';
            const next: NextFunction = () => {
                captured = getRequestContext();
            };

            middleware.use(request, response as any, next);

            // 跳过路径下 next() 必须被调用，但 getRequestContext() 必须为 undefined
            expect(captured).toBeUndefined();

            // 同时 finish listener 不应被绑定（中间件直接 next 退出）
            expect(response.listenerCount('finish')).toBe(0);

            // 跳过路径下不应该 patch response.json / send（保留原始 jest mock）
            // MockHttpResponse 中 json / send 是 jest.fn，调用一次确认仍是同一引用
            const originalJsonRef = response.json;
            const originalSendRef = response.send;
            response.json({ code: 0 });
            response.send('ok');
            expect(response.json).toBe(originalJsonRef);
            expect(response.send).toBe(originalSendRef);
        }
    });
});
