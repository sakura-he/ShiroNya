import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { lastValueFrom, of, tap, throwError } from 'rxjs';
import { attachSpiceDbDebugTraces, recordSpiceDbDebugTrace } from '../../modules/spicedb/spicedb-debug-trace';
import { ResponseFormatInterceptor } from './response-format.interceptor';

jest.mock('@app/common', () => ({
    ErrorCodes: {
        SUCCESS: {
            code: 200,
            message: 'success'
        }
    },
    createRuntimeLogger: () => ({
        debug: jest.fn()
    })
}));

function createExecutionContext(request: Partial<Request>, response: Partial<Response>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
            getResponse: () => response
        })
    } as ExecutionContext;
}

describe('ResponseFormatInterceptor', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdminApiDevtoolsDebug = process.env.APP_API_DEVTOOLS_DEBUG;

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        process.env.NODE_ENV = originalNodeEnv;
        if (originalAdminApiDevtoolsDebug === undefined) {
            delete process.env.APP_API_DEVTOOLS_DEBUG;
        } else {
            process.env.APP_API_DEVTOOLS_DEBUG = originalAdminApiDevtoolsDebug;
        }
    });

    it('正常响应应在业务 handler 完成后写用户状态头，再包装响应体', async () => {
        const events: string[] = [];
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => {
                events.push('attach');
            })
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path: '/system/role', url: '/system/role', method: 'POST', headers: {} };
        const response = {
            setHeader: jest.fn()
        };
        const next: CallHandler = {
            handle: () =>
                of({ ok: true }).pipe(
                    tap(() => {
                        events.push('handler');
                    })
                )
        };

        const result = await lastValueFrom(interceptor.intercept(createExecutionContext(request, response), next));

        expect(events).toEqual(['handler', 'attach']);
        expect(adminUserStateService.attachUserStateHeaders).toHaveBeenCalledWith(request, response);
        expect(result).toEqual({
            data: { ok: true },
            code: 200,
            message: 'success'
        });
    });

    it('正常响应 undefined 应包装为 null', async () => {
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path: '/system/role', url: '/system/role', method: 'GET', headers: {} };
        const response = {};

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response), {
                handle: () => of(undefined)
            })
        );

        expect(result).toEqual({
            data: null,
            code: 200,
            message: 'success'
        });
    });

    it('异常响应不应被拦截器吞掉，也不应由正常响应路径写用户状态头', async () => {
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path: '/system/role', url: '/system/role', method: 'GET', headers: {} };
        const response = {};
        const error = new Error('boom');

        await expect(
            lastValueFrom(
                interceptor.intercept(createExecutionContext(request, response), {
                    handle: () => throwError(() => error)
                })
            )
        ).rejects.toBe(error);
        expect(adminUserStateService.attachUserStateHeaders).not.toHaveBeenCalled();
    });

    it.each(['/metrics', '/app/metrics'])('%s 应保持原始响应且不写用户状态头', async (path) => {
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path, url: path, method: 'GET', headers: {} };
        const response = {};

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response), {
                handle: () => of('metric 1')
            })
        );

        expect(result).toBe('metric 1');
        expect(adminUserStateService.attachUserStateHeaders).not.toHaveBeenCalled();
    });

    it('开发态且 devtools header 开启时，应返回 http 和 SpiceDB debug 信息', async () => {
        process.env.NODE_ENV = 'development';
        process.env.APP_API_DEVTOOLS_DEBUG = 'true';
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = {
            path: '/system/role',
            url: '/system/role',
            method: 'GET',
            headers: {
                'x-app-api-devtools': '1'
            },
            __shiroLogContext: {
                startAt: 958
            }
        };
        const response = {
            setHeader: jest.fn()
        };
        const payload = attachSpiceDbDebugTraces(
            {
                ok: true
            },
            [
                {
                    operation: 'CheckBulkPermissions',
                    status: 'success',
                    durationMs: 12.34,
                    startedAt: 10,
                    finishedAt: 22.34,
                    count: 3
                }
            ]
        );

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request as any, response), {
                handle: () => of(payload)
            })
        );

        expect(result).toEqual({
            data: {
                ok: true
            },
            code: 200,
            message: 'success',
            debug: {
                http: {
                    serverDurationMs: 42
                },
                spicedb: {
                    count: 1,
                    totalMs: 12.34,
                    operations: [
                        {
                            operation: 'CheckBulkPermissions',
                            durationMs: 12.34,
                            count: 3,
                            status: 'success',
                            errorCode: undefined
                        }
                    ]
                }
            }
        });
        expect(response.setHeader).toHaveBeenCalledWith('x-app-api-devtools-enabled', '1');
    });

    it('devtools header 开启时，应收集当前请求期间直接记录的 SpiceDB RPC trace', async () => {
        process.env.APP_API_DEVTOOLS_DEBUG = 'true';
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = {
            path: '/system/spicedb-data/schema',
            url: '/system/spicedb-data/schema',
            method: 'GET',
            headers: {
                'x-app-api-devtools': '1'
            },
            __shiroLogContext: {
                startAt: 900
            }
        };
        const response = {
            setHeader: jest.fn()
        };

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request as any, response), {
                handle: () => {
                    recordSpiceDbDebugTrace({
                        operation: 'ReadSchema',
                        status: 'success',
                        durationMs: 8,
                        startedAt: 10,
                        finishedAt: 18,
                        count: 1
                    });
                    return of({ schema: 'definition user {}' });
                }
            })
        );

        expect(result.debug).toEqual({
            http: {
                serverDurationMs: 100
            },
            spicedb: {
                count: 1,
                totalMs: 8,
                operations: [
                    {
                        operation: 'ReadSchema',
                        durationMs: 8,
                        count: 1,
                        status: 'success',
                        errorCode: undefined
                    }
                ]
            }
        });
    });

    it('devtools header 开启时，应在 debug 信息中返回 requestId', async () => {
        process.env.APP_API_DEVTOOLS_DEBUG = 'true';
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = {
            path: '/system/role',
            url: '/system/role',
            method: 'GET',
            headers: {
                'x-app-api-devtools': '1'
            },
            __shiroLogContext: {
                requestId: 'req-debug-1',
                startAt: 900
            }
        };
        const response = {
            setHeader: jest.fn()
        };

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request as any, response), {
                handle: () => of({ ok: true })
            })
        );

        expect(result.debug).toEqual({
            requestId: 'req-debug-1',
            http: {
                serverDurationMs: 100
            }
        });
    });

    it('未开启服务端 devtools debug 开关时，即使带 header 也不应返回 debug', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.APP_API_DEVTOOLS_DEBUG;
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = {
            path: '/system/role',
            url: '/system/role',
            method: 'GET',
            headers: {
                'x-app-api-devtools': '1'
            }
        };
        const response = {
            setHeader: jest.fn()
        };
        const payload = attachSpiceDbDebugTraces(
            {
                ok: true
            },
            [
                {
                    operation: 'CheckBulkPermissions',
                    status: 'success',
                    durationMs: 12.34,
                    startedAt: 10,
                    finishedAt: 22.34,
                    count: 3
                }
            ]
        );

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response), {
                handle: () => of(payload)
            })
        );

        expect(result).toEqual({
            data: {
                ok: true
            },
            code: 200,
            message: 'success'
        });
        expect(response.setHeader).toHaveBeenCalledWith('x-app-api-devtools-enabled', '0');
    });

    it('服务端 devtools debug 开关开启时，应通过响应头通知前端开启下一次 SpiceDB debug 请求', async () => {
        process.env.NODE_ENV = 'development';
        process.env.APP_API_DEVTOOLS_DEBUG = '1';
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path: '/system/role', url: '/system/role', method: 'GET', headers: {} };
        const response = {
            setHeader: jest.fn()
        };

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response as any), {
                handle: () => of({ ok: true })
            })
        );

        expect(result).toEqual({
            data: {
                ok: true
            },
            code: 200,
            message: 'success'
        });
        expect(response.setHeader).toHaveBeenCalledWith('x-app-api-devtools-enabled', '1');
    });

    it('未开启 devtools header 时不应返回 debug', async () => {
        process.env.NODE_ENV = 'development';
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = { path: '/system/role', url: '/system/role', method: 'GET', headers: {} };
        const response = {};
        const payload = attachSpiceDbDebugTraces(
            {
                ok: true
            },
            [
                {
                    operation: 'CheckBulkPermissions',
                    status: 'success',
                    durationMs: 12.34,
                    startedAt: 10,
                    finishedAt: 22.34,
                    count: 3
                }
            ]
        );

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response), {
                handle: () => of(payload)
            })
        );

        expect(result).toEqual({
            data: {
                ok: true
            },
            code: 200,
            message: 'success'
        });
    });

    it('后端 devtools debug 阀门是唯一条件，开启时即使 NODE_ENV=production 也应返回 debug', async () => {
        process.env.NODE_ENV = 'production';
        process.env.APP_API_DEVTOOLS_DEBUG = 'true';
        jest.spyOn(Date, 'now').mockReturnValue(1000);
        const adminUserStateService = {
            attachUserStateHeaders: jest.fn(async () => undefined)
        };
        const interceptor = new ResponseFormatInterceptor(adminUserStateService as any);
        const request = {
            path: '/system/role',
            url: '/system/role',
            method: 'GET',
            headers: {
                'x-app-api-devtools': '1'
            }
        };
        const response = {
            setHeader: jest.fn()
        };
        const payload = attachSpiceDbDebugTraces(
            {
                ok: true
            },
            [
                {
                    operation: 'CheckBulkPermissions',
                    status: 'success',
                    durationMs: 12.34,
                    startedAt: 10,
                    finishedAt: 22.34,
                    count: 3
                }
            ]
        );

        const result = await lastValueFrom(
            interceptor.intercept(createExecutionContext(request, response), {
                handle: () => of(payload)
            })
        );

        expect(result).toEqual({
            data: {
                ok: true
            },
            code: 200,
            message: 'success',
            debug: {
                http: {
                    serverDurationMs: 0
                },
                spicedb: {
                    count: 1,
                    totalMs: 12.34,
                    operations: [
                        {
                            operation: 'CheckBulkPermissions',
                            durationMs: 12.34,
                            count: 3,
                            status: 'success',
                            errorCode: undefined
                        }
                    ]
                }
            }
        });
        expect(response.setHeader).toHaveBeenCalledWith('x-app-api-devtools-enabled', '1');
    });
});
