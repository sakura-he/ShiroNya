// Feature: admin-logger-unification, Property 1: Static_Context 不可变性
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { createRuntimeLogger } from './runtime-logger';
import type { RuntimeLoggerStaticContext } from './runtime-log.types';

/**
 * Property 1: Static_Context 不可变性
 * Validates: Requirements 3.5
 *
 * 设计要求：当 staticContext 已绑定到一个 RuntimeLogger 实例后，后续任意级别方法调用
 * （含 .title 与非 .title 分支、含合并优先级处理）SHALL 不修改原始 staticContext 对象。
 * 详见 design.md §3 与 requirements.md §3.5。
 *
 * 验证策略（与 task 4.4 描述一致）：
 *   1. 生成随机 staticContext 形态：
 *        fc.record({ module, domain, resource: { type, id }, actor: { id, type, name, roles },
 *                    context: { ... } })
 *      所有字段都通过 fc.option(..., { nil: undefined }) 设为可选；
 *   2. 在创建 logger 前对原始对象做 `JSON.stringify(staticContext)` 快照（before）;
 *   3. 调用 createRuntimeLogger('test', staticContext) 绑定 staticContext；
 *   4. 生成一个随机 ops 列表，每个 op 含 (level, isTitle, message, context)，
 *      逐个在 logger 上执行；
 *   5. 在所有 ops 执行完毕后再次做 `JSON.stringify(staticContext)` 快照（after）；
 *   6. 断言 before === after，确保 staticContext 在合并 / 调用过程中保持完全不变。
 *
 * 之所以使用 JSON.stringify 比较：
 *   - JSON 序列化能稳定捕获嵌套结构变化（actor.roles 数组、context.* 子字段）
 *   - 由于本测试只生成 JSON-safe 的标量（string / number / boolean / undefined），
 *     不会触碰循环引用 / 函数 / Symbol 等场景，比较结果可信
 *   - undefined 字段在 JSON.stringify 中会被略去，但因为 before / after 两次序列化
 *     使用同一对象 → 即便某条字段被外部置为 undefined（不应发生），也会被检测到
 *     （键被删除 / 添加都会反映到序列化结果上）
 */

/**
 * 仅生成 JSON-safe 的原子值，避免序列化时因 NaN / Infinity / Symbol / function 引发歧义。
 * - 字符串通过正则限制，避免 Unicode 控制字符干扰快照对比
 * - 数字限制在安全整数范围内
 */
const jsonSafeAtomArb = fc.oneof(
    fc.stringMatching(/^[\x20-\x7e]{0,16}$/),
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.boolean()
);

const optionalShortStringArb = fc.option(fc.stringMatching(/^[\x20-\x7e]{1,16}$/), {
    nil: undefined
});

/** RuntimeLoggerStaticContext.actor.roles：字符串数组（保留可能的重复，验证不被回写）。 */
const rolesArb = fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,8}$/), { maxLength: 5 });

/** RuntimeLoggerStaticContext.actor：所有子字段可选；roles 可选。 */
const staticActorArb = fc.option(
    fc.record(
        {
            id: optionalShortStringArb,
            type: fc.option(fc.constantFrom('user', 'service', 'system'), { nil: undefined }),
            name: optionalShortStringArb,
            roles: fc.option(rolesArb, { nil: undefined })
        },
        { requiredKeys: [] }
    ),
    { nil: undefined }
);

/** RuntimeLoggerStaticContext.resource：仅 type / id（与类型定义一致）。 */
const staticResourceArb = fc.option(
    fc.record(
        {
            type: optionalShortStringArb,
            id: optionalShortStringArb
        },
        { requiredKeys: [] }
    ),
    { nil: undefined }
);

/** 自由扩展 context 字段：非保留 key + JSON-safe 原子值。 */
const staticContextRecordArb = fc.option(
    fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/), jsonSafeAtomArb, { maxKeys: 4 }),
    { nil: undefined }
);

/** 完整 staticContext 形态：与 design.md §3.1 中字段集合一致。 */
const staticContextArb: fc.Arbitrary<RuntimeLoggerStaticContext> = fc.record(
    {
        module: fc.option(fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/), { nil: undefined }),
        domain: fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/), { nil: undefined }),
        resource: staticResourceArb,
        actor: staticActorArb,
        context: staticContextRecordArb
    },
    { requiredKeys: [] }
);

/** 单个 logger 操作描述：log level + 是否走 .title 分支 + message + 显式 context。 */
interface LoggerOp {
    level: 'info' | 'debug' | 'warn' | 'error';
    isTitle: boolean;
    message: string;
    context: Record<string, unknown> | undefined;
}

/**
 * 生成 explicit context：含与 staticContext 部分重叠的保留 key（actor / resource / context.*），
 * 用于触发 mergeLogContext 的"显式覆盖 Static"分支，确保该路径下也不会回写原始 staticContext。
 */
const explicitContextArb: fc.Arbitrary<Record<string, unknown> | undefined> = fc.option(
    fc.record(
        {
            actor: fc.option(
                fc.record(
                    {
                        id: optionalShortStringArb,
                        type: fc.option(fc.constantFrom('user', 'service', 'system'), {
                            nil: undefined
                        }),
                        roles: fc.option(rolesArb, { nil: undefined })
                    },
                    { requiredKeys: [] }
                ),
                { nil: undefined }
            ),
            resource: fc.option(
                fc.record(
                    {
                        type: optionalShortStringArb,
                        id: optionalShortStringArb
                    },
                    { requiredKeys: [] }
                ),
                { nil: undefined }
            ),
            extra: fc.option(
                fc.dictionary(fc.stringMatching(/^[a-z][a-z0-9_]{0,7}$/), jsonSafeAtomArb, {
                    maxKeys: 3
                }),
                { nil: undefined }
            )
        },
        { requiredKeys: [] }
    ).map((raw) => {
        const merged: Record<string, unknown> = {};
        if (raw.actor !== undefined) merged.actor = raw.actor;
        if (raw.resource !== undefined) merged.resource = raw.resource;
        if (raw.extra !== undefined) {
            for (const [k, v] of Object.entries(raw.extra)) merged[k] = v;
        }
        return merged;
    }),
    { nil: undefined }
);

/** 单个操作 arbitrary：level / isTitle / message / context 四元组。 */
const loggerOpArb: fc.Arbitrary<LoggerOp> = fc.record({
    level: fc.constantFrom<'info' | 'debug' | 'warn' | 'error'>('info', 'debug', 'warn', 'error'),
    isTitle: fc.boolean(),
    message: fc.stringMatching(/^[\x20-\x7e]{1,32}$/),
    context: explicitContextArb
});

/** 操作序列 arbitrary：1 ~ 8 次调用，覆盖 .title 与非 .title 双分支。 */
const opsArb: fc.Arbitrary<LoggerOp[]> = fc.array(loggerOpArb, { minLength: 1, maxLength: 8 });

describe('runtime logger - Property 1: Static_Context 不可变性', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
        // 保存并设置环境变量，与 runtime-logger.spec.ts 的设置保持一致，
        // 确保测试期间不污染真实 logs 目录、不输出彩色字符。
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        originalNoColor = process.env.NO_COLOR;
        process.env.SHIRO_APP_NAME = 'jest-static-context-immutability';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-static-ctx-'));
        delete process.env.NO_COLOR;
        // 屏蔽控制台输出，避免大量随机日志刷屏
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
        jest.restoreAllMocks();
    });

    /**
     * Property 1 主体：随机 staticContext 在创建 logger + N 次调用后，
     * `JSON.stringify(staticContext)` 前后快照恒等。
     */
    it('staticContext should remain structurally identical after createRuntimeLogger and N random log calls', () => {
        fc.assert(
            fc.property(staticContextArb, opsArb, (staticContext, ops) => {
                // (2) 创建 logger 前对原始对象做快照
                const before = JSON.stringify(staticContext);

                // (3) 绑定 staticContext 创建 logger
                const logger = createRuntimeLogger('test', staticContext);

                // (4) 顺序执行随机 ops，覆盖 .title 与非 .title 两条分支
                for (const op of ops) {
                    const method = logger[op.level];
                    if (op.isTitle) {
                        method.title(op.message, op.context);
                    } else {
                        method(op.message, op.context);
                    }
                }

                // (5) 再次做快照
                const after = JSON.stringify(staticContext);

                // (6) 断言原始 staticContext 对象的结构在调用前后完全一致
                expect(after).toBe(before);
            }),
            { numRuns: 100 }
        );
    });
});
