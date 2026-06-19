// Feature: admin-logger-unification, Property 10: Transport 复用单一性
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 跟踪 DailyRotateFile 构造调用次数。
 *
 * 由于 `winstonLoggerMap` / `fileTransportSet` 是 runtime-logger.ts 的模块内部变量，
 * 不对外导出（参见任务 5.1：不修改 transport 注册逻辑），这里通过 `jest.mock` 拦截
 * `winston-daily-rotate-file` 的默认导出，将其替换为一个继承自原始类的子类，
 * 在构造函数中记录调用以间接验证 transport 的复用单一性：
 *
 *   - `mockDailyRotateFileTracker` 每次被调用 ⇔ `ensureFileTransport` 触发了
 *     一次 `new DailyRotateFile(...)` 并将其挂到 `winstonLoggerMap.get(app)` 上；
 *   - 因此 `tracker.mock.calls.length === fileTransportSet.size === Logger.transports
 *     中 DailyRotateFile 实例数`（在同一 app + logType 维度上）。
 *
 * 注：变量必须以 `mock` 前缀开头才能在 `jest.mock` 工厂内被引用（`babel-plugin-jest-hoist` 静态检查）。
 */
const mockDailyRotateFileTracker = jest.fn();

jest.mock('winston-daily-rotate-file', () => {
    const ActualDailyRotateFile = jest.requireActual('winston-daily-rotate-file');
    return class TrackedDailyRotateFile extends ActualDailyRotateFile {
        constructor(opts: unknown) {
            super(opts);
            mockDailyRotateFileTracker(opts);
        }
    };
});

import { createRuntimeLogger } from './runtime-logger';

describe('runtime logger transport reuse', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        originalNoColor = process.env.NO_COLOR;
        // 使用唯一 app 名，避免与其他测试文件 / 同文件其他测试共享 winstonLoggerMap key
        process.env.SHIRO_APP_NAME = 'jest-transport-reuse';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-transport-reuse-'));
        delete process.env.NO_COLOR;
        // 屏蔽控制台输出，避免污染测试报告
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        jest.spyOn(console._stdout, 'write').mockImplementation(() => true);
        jest.spyOn(console._stderr, 'write').mockImplementation(() => true);
        // 重置构造调用计数到当前测试初始状态
        mockDailyRotateFileTracker.mockClear();
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        process.env.NO_COLOR = originalNoColor;
        jest.restoreAllMocks();
    });

    /**
     * Property 10：连续 50 次 `createRuntimeLogger('a', {  ... })` + `info` 调用后，
     * 同一 `(appName, logType=system)` 对应的 DailyRotateFile transport 仅创建 1 份。
     *
     * Validates: Requirements 7.4, 8.6
     *
     * 验证两个语义：
     *   1. `transport instanceof DailyRotateFile` 在 winston Logger 上恒为 1（由构造调用次数 === 1 推得）
     *   2. `fileTransportSet` 对应 key 数量为 1（由构造调用次数 === 1 推得：
     *      runtime-logger.ts 中 `fileTransportSet.has(transportKey)` 命中即短路，
     *      所以构造调用 === 1 ⇔ Set 中该 key 的引用 === 1）
     */
    it('should reuse a single DailyRotateFile transport across 50 createRuntimeLogger + info calls', () => {
        for (let index = 0; index < 50; index += 1) {
            const logger = createRuntimeLogger(`module_${index}`, {
                domain: 'd',
                resource: { type: 't' }
            });
            logger.info('transport reuse iteration', { iteration: index });
        }

        // 50 次调用后，对 (jest-transport-reuse, system) 这一对 (app, logType) 来说，
        // DailyRotateFile 构造仅触发 1 次 ⇔ winston Logger 上的 transport 数 === 1
        // ⇔ fileTransportSet 对应 key 数量 === 1。
        expect(mockDailyRotateFileTracker).toHaveBeenCalledTimes(1);
    });
});
