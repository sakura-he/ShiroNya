import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trace } from '@opentelemetry/api';
import { configureRuntimeLogger, createRuntimeLogger } from './runtime-logger';
import { LogModule } from './log.module';
import { sanitizeForLogging } from './runtime-log.util';
import { runWithRequestContext } from './request-context';

/**
 * 等待 Winston 文件 transport 完成异步落盘，避免测试在文件生成前读取。
 */
async function waitForFileContent(filePath: string): Promise<string> {
    for (let index = 0; index < 60; index += 1) {
        if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf8').trim();
            if (content.length > 0) {
                return content;
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`日志文件未按预期生成: ${filePath}`);
}

/**
 * 等待目录内生成匹配前缀的日志文件，并返回完整路径。
 */
async function waitForLogFilePath(directoryPath: string, filePrefix: string): Promise<string> {
    for (let index = 0; index < 60; index += 1) {
        if (existsSync(directoryPath)) {
            const fileName = readdirSync(directoryPath).find((entry) => entry.startsWith(filePrefix));
            if (fileName) {
                return path.join(directoryPath, fileName);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`日志目录未按预期生成文件: ${directoryPath}\\${filePrefix}*`);
}

/**
 * 去除控制台 ANSI 颜色码，避免颜色字符影响字符串断言。
 */
function stripAnsi(value: string): string {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('runtime logger', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        originalNoColor = process.env.NO_COLOR;
        process.env.SHIRO_APP_NAME = 'jest-app';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-runtime-logger-'));
        delete process.env.NO_COLOR;
        configureRuntimeLogger();
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        jest.spyOn(console._stdout, 'write').mockImplementation(() => true);
        jest.spyOn(console._stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        process.env.NO_COLOR = originalNoColor;
        configureRuntimeLogger();
        jest.restoreAllMocks();
    });

    /**
     * 验证手动 logger 入口会输出统一的 labels 和日志结构。
     */
    it('should create unified labels for manual user action log', () => {
        const logger = createRuntimeLogger('manual_debug');
        const entry = logger.userAction({
            level: 'info',
            message: 'manual log entry',
            event: 'manual_debug',
            userId: 'user-100',
            requestId: 'req-100',
            context: {
                feature: 'logger'
            }
        });

        expect(entry.logType).toBe('user_action');
        expect(entry.app).toBe('jest-app');
        expect(entry.labels.user_id).toBe('user-100');
        expect(entry.labels.log_type).toBe('user_action');
        expect(entry.module).toBe('manual_debug');
        expect(entry.requestId).toBe('req-100');
        expect(entry.context).toEqual({
            feature: 'logger'
        });
    });

    /**
     * 验证 active OpenTelemetry span 会注入日志和控制台上下文，方便从日志跳转 Tempo trace。
     */
    it('should attach active trace identifiers to log entry and console context', () => {
        jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
            spanContext: () => ({
                traceId: '0123456789abcdef0123456789abcdef',
                spanId: '0123456789abcdef',
                traceFlags: 1
            })
        } as ReturnType<typeof trace.getActiveSpan>);
        const logger = createRuntimeLogger('trace_console');

        const entry = logger.info('trace linked output');

        expect(entry.traceId).toBe('0123456789abcdef0123456789abcdef');
        expect(entry.spanId).toBe('0123456789abcdef');

        const stdoutMessage = stripAnsi((console._stdout.write as jest.Mock).mock.calls.flat().join(''));
        expect(stdoutMessage).toContain('trace:0123456789abcdef0123456789abcdef');
    });

    /**
     * 验证开发环境控制台输出详情，并且普通级别走 stdout。
     */
    it('should write development console log to stdout with details', () => {
        const logger = createRuntimeLogger('colored_console');

        expect(() => {
            logger.info('colored output', {
                feature: 'console'
            });
        }).not.toThrow();

        const stdoutCalls = (console._stdout.write as jest.Mock).mock.calls.flat();
        const stdoutMessage = stripAnsi(stdoutCalls.join(''));

        expect(stdoutCalls.length).toBeGreaterThan(0);
        expect(stdoutMessage).toContain(` INFO   (❁´◡\`❁)  ${process.pid}  - `);
        expect(stdoutMessage).toContain('[system colored_console user:system] colored output');
        expect(stdoutMessage).toContain('colored output');
        expect(stdoutMessage).toContain("logType: 'system'");
    });

    /**
     * 验证 user_action 在控制台只输出摘要字段，但文件落盘仍保留完整 HTTP 明细。
     */
    it('should trim user action console details and keep full file payload', async () => {
        process.env.SHIRO_APP_NAME = 'jest-user-action-console';
        const logger = createRuntimeLogger('http_console');
        logger.userAction({
            level: 'info',
            message: 'GET /admin/account/menus',
            event: 'http_request',
            userId: 'user-100',
            requestId: 'req-200',
            actor: {
                id: 'user-100',
                type: 'user',
                name: 'Admin',
                roles: ['super_admin']
            },
            http: {
                method: 'GET',
                path: '/admin/account/menus',
                requestHeaders: {
                    authorization: 'Bearer test-token'
                },
                responseBody: {
                    data: [{ id: 1 }]
                },
                statusCode: 304
            }
        });

        const stdoutMessage = stripAnsi((console._stdout.write as jest.Mock).mock.calls.flat().join(''));

        expect(stdoutMessage).toContain("logType: 'user_action'");
        expect(stdoutMessage).toContain('actor: {');
        expect(stdoutMessage).not.toContain('http:');
        expect(stdoutMessage).not.toContain('requestHeaders');
        expect(stdoutMessage).not.toContain('responseBody');

        const userActionLogDir = path.join(process.env.LOKI_LOG_DIR as string, 'jest-user-action-console');
        const userActionLogPath = await waitForLogFilePath(userActionLogDir, 'user_action-');
        const fileContent = await waitForFileContent(userActionLogPath);

        expect(fileContent).toContain('"http"');
        expect(fileContent).toContain('"requestHeaders"');
        expect(fileContent).toContain('"responseBody"');
    });

    /**
     * 验证错误级 user_action 在控制台输出完整详情，方便直接定位 500 的响应体和错误上下文。
     */
    it('should print full user action console details for errors', () => {
        process.env.SHIRO_APP_NAME = 'jest-user-action-error-console';
        const logger = createRuntimeLogger('http_console');

        logger.userAction({
            level: 'error',
            message: 'GET /admin/rbac/effective/overview',
            event: 'http_response',
            userId: 'user-100',
            requestId: 'req-500',
            http: {
                method: 'GET',
                path: '/admin/rbac/effective/overview',
                requestHeaders: {
                    authorization: 'Bearer test-token'
                },
                responseBody: {
                    code: 1301,
                    message: '数据库操作失败'
                },
                statusCode: 500,
                bizCode: 1301
            },
            error: {
                code: '1301',
                message: '数据库操作失败'
            },
            context: {
                prismaCode: 'P2022'
            }
        });

        const stderrMessage = stripAnsi((console._stderr.write as jest.Mock).mock.calls.flat().join(''));

        expect(stderrMessage).toContain("logType: 'user_action'");
        expect(stderrMessage).toContain('http: {');
        expect(stderrMessage).toContain('requestHeaders');
        expect(stderrMessage).toContain('responseBody');
        expect(stderrMessage).toContain("prismaCode: 'P2022'");
    });

    /**
     * 验证生产环境只输出标题行，不追加 inspect 详情。
     */
    it('should write production console log without details', () => {
        process.env.NODE_ENV = 'production';
        const logger = createRuntimeLogger('production_console');

        logger.info('production output', {
            feature: 'console'
        });

        const stdoutMessage = stripAnsi((console._stdout.write as jest.Mock).mock.calls.flat().join(''));
        expect(stdoutMessage).toContain(` INFO   (❁´◡\`❁)  ${process.pid}  - `);
        expect(stdoutMessage).toContain('production output');
        expect(stdoutMessage).not.toContain("logType: 'system'");
    });

    /**
     * 验证 error 级别日志走 stderr 输出。
     */
    it('should write error log to stderr', () => {
        const logger = createRuntimeLogger('error_console');

        logger.error('broken output', {
            feature: 'console'
        });

        const stderrMessage = stripAnsi((console._stderr.write as jest.Mock).mock.calls.flat().join(''));
        expect(stderrMessage).toContain(` ERROR  〒▽〒    ${process.pid}  - `);
        expect(stderrMessage).toContain('broken output');
    });

    /**
     * 验证单个 logger 初始化时可以覆盖颜文字和级别颜色。
     */
    it('should apply console style passed to createRuntimeLogger options', () => {
        const logger = createRuntimeLogger('custom_console_style', {
            consoleStyle: {
                levelEmotions: {
                    warn: '[WARN]'
                },
                colors: {
                    warn: 'red',
                    badge_warn: 'bold white redBG'
                }
            }
        });

        logger.warn.title('warning color configured');

        const stdoutMessage = (console._stdout.write as jest.Mock).mock.calls.flat().join('');
        expect(stripAnsi(stdoutMessage)).toContain(' WARN   [WARN]');
        expect(stdoutMessage).toContain('\u001b[31mwarning color configured');
    });

    /**
     * 验证 LogModule 初始化时可以配置 runtime logger 的全局控制台样式。
     */
    it('should apply global console style configured by LogModule', () => {
        LogModule.forRoot({
            consoleStyle: {
                levelEmotions: {
                    info: '[INFO]'
                },
                colors: {
                    info: 'blue',
                    badge_info: 'bold white blueBG'
                }
            }
        });

        const logger = createRuntimeLogger('module_configured_console_style');
        logger.info.title('info color configured');

        const stdoutMessage = (console._stdout.write as jest.Mock).mock.calls.flat().join('');
        expect(stripAnsi(stdoutMessage)).toContain(' INFO   [INFO]');
        expect(stdoutMessage).toContain('\u001b[34minfo color configured');
    });

    /**
     * 验证 fatal 级别也有与其他级别一致的 facade 方法，并且走 stderr。
     */
    it('should expose fatal log method and write it to stderr', () => {
        const logger = createRuntimeLogger('fatal_console');

        const entry = logger.fatal('fatal output');

        const stderrMessage = stripAnsi((console._stderr.write as jest.Mock).mock.calls.flat().join(''));
        expect(entry.level).toBe('fatal');
        expect(stderrMessage).toContain(` FATAL  ∑( 口 || ${process.pid}  - `);
        expect(stderrMessage).toContain('fatal output');
    });

    /**
     * 验证 facade 普通调用会自动继承请求范围内的 ALS 上下文。
     */
    it('should merge request context into facade log calls', () => {
        const logger = createRuntimeLogger('request_context_console', {
            domain: 'logger',
            resource: {
                type: 'request'
            }
        });

        const entry = runWithRequestContext(
            {
                requestId: 'req-logger-1',
                actor: {
                    id: 'user-logger-1',
                    type: 'user',
                    roles: ['admin']
                },
                http: {
                    method: 'GET',
                    path: '/system/logger'
                },
                extra: {
                    requestSource: 'jest'
                }
            },
            () =>
                logger.info('request scoped log', {
                    resource: {
                        id: 'request-1',
                        action: 'read'
                    },
                    feature: 'runtime-logger'
                })
        );

        expect(entry.requestId).toBe('req-logger-1');
        expect(entry.userId).toBe('user-logger-1');
        expect(entry.actor).toEqual({
            id: 'user-logger-1',
            type: 'user',
            roles: ['admin']
        });
        expect(entry.http).toEqual({
            method: 'GET',
            path: '/system/logger'
        });
        expect(entry.resource).toEqual({
            type: 'request',
            id: 'request-1',
            action: 'read'
        });
        expect(entry.context).toEqual({
            requestSource: 'jest',
            domain: 'logger',
            feature: 'runtime-logger'
        });
    });

    /**
     * 验证显式 context.error 会结构化提升到 RuntimeLogEntry.error，
     * 避免排障时 stack 只藏在 context.error 里。
     */
    it('should promote context.error into RuntimeLogEntry.error', () => {
        const logger = createRuntimeLogger('error_promotion');
        const error = Object.assign(new Error('database unavailable'), { code: 'DB_DOWN' });

        const entry = logger.error('failed to query database', {
            error,
            feature: 'database'
        });

        expect(entry.error).toEqual(
            expect.objectContaining({
                name: 'Error',
                code: 'DB_DOWN',
                message: 'database unavailable',
                stack: expect.stringContaining('database unavailable')
            })
        );
        expect(entry.context).toEqual({
            feature: 'database'
        });
    });

    /**
     * 验证审计日志仅输出控制台，不会写入 Loki 文件。
     */
    it('should skip file write for audit log', async () => {
        const logger = createRuntimeLogger('audit_console');
        const entry = logger.audit({
            level: 'warn',
            message: 'audit only'
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const auditLogPath = path.join(
            process.env.LOKI_LOG_DIR as string,
            'jest-app',
            `audit-${entry.ts.slice(0, 10)}.log`
        );
        expect(existsSync(auditLogPath)).toBe(false);
    });

    /**
     * 验证生产环境会脱敏敏感字段，开发环境保留完整值。
     */
    it('should mask sensitive fields only in production', () => {
        process.env.NODE_ENV = 'production';
        expect(
            sanitizeForLogging({
                password: 'plain-text',
                bizCode: 200,
                errorCode: 'DB_DOWN',
                nested: {
                    token: 'abc',
                    smsCode: '123456'
                }
            })
        ).toEqual({
            password: '[FILTERED]',
            bizCode: 200,
            errorCode: 'DB_DOWN',
            nested: {
                token: '[FILTERED]',
                smsCode: '[FILTERED]'
            }
        });

        process.env.NODE_ENV = 'development';
        expect(
            sanitizeForLogging({
                password: 'plain-text'
            })
        ).toEqual({
            password: 'plain-text'
        });
    });

    /**
     * 验证共享对象不会被误判为循环引用；只有递归链路上的重复对象才标为 [Circular]。
     */
    it('should distinguish shared references from circular references during sanitization', () => {
        const shared = { id: 'shared' };
        const circular: Record<string, unknown> = { id: 'root' };
        circular.self = circular;

        expect(
            sanitizeForLogging({
                first: shared,
                second: shared,
                circular
            })
        ).toEqual({
            first: { id: 'shared' },
            second: { id: 'shared' },
            circular: {
                id: 'root',
                self: '[Circular]'
            }
        });
    });
});
