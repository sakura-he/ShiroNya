// Feature: admin-logger-unification, Property 4: Title_Variant 标题行输出
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import stringWidth from 'string-width';
import { createRuntimeLogger } from './runtime-logger';

/**
 * 去除控制台 ANSI 颜色码，避免颜色字符影响字符串断言。
 *
 * Winston colorize 会把级别 badge / PID / 消息 / context / +Xms 全部包裹在 ANSI 转义序列中，
 * 但这些转义序列不含 `\n`，因此即使保留也不会影响"按 `\n` 切分行数"的核心断言；
 * 这里仍然剥离 ANSI 是为了让 `not.toContain('\n  logType:')` 这类基于明文的负向断言更稳健。
 */
function stripAnsi(value: string): string {
    return value.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * 单一共享的输出缓冲区。
 *
 * 不再分别从 `process.stdout.write` / `process.stderr.write` / `console._stdout.write` /
 * `console._stderr.write` 的 `mock.calls` 上读取并拼接——在 Jest 的 BufferedConsole 实现下，
 * 这四个写入入口可能指向同一个底层 Writable，多源拼接会把 Winston 的一次写入重复 N 份，
 * 制造出"虚假的多行输出"，把单行属性测试错误地判失败。
 *
 * 改用一个共享 buffer：所有 spy 的 `mockImplementation` 都把数据 push 进同一个数组，
 * Winston 每次写入只会落到 buffer 一次，行数语义与真实控制台输出一致。
 */
const capturedOutputChunks: string[] = [];

function pushChunk(chunk: unknown): true {
    capturedOutputChunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
}

function readCapturedOutput(): string {
    return capturedOutputChunks.join('');
}

/**
 * 重置共享缓冲区到空状态。
 *
 * fast-check 在 `numRuns: 100` 中会反复调用 property 函数，每次进入 property 体之前必须清空,
 * 否则上一轮捕获到的输出会污染下一轮断言。
 */
function clearCapturedOutput(): void {
    capturedOutputChunks.length = 0;
}

function displayColumnOf(source: string, search: string): number {
    const index = source.indexOf(search);
    if (index < 0) {
        return -1;
    }

    return stringWidth(source.slice(0, index));
}

function firstNonSpaceColumn(source: string): number {
    const match = source.match(/\S/);
    return match?.index === undefined ? -1 : stringWidth(source.slice(0, match.index));
}

const expectedLevelEmotions = {
    info: '(❁´◡`❁)',
    verbose: '(‾◡◝)',
    fatal: '∑( 口 ||',
    debug: '(´･ω･`)?',
    error: '〒▽〒',
    warn: '(•_•)'
} as const;

describe('runtime logger - Property 4: Title_Variant 标题行输出', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        originalNoColor = process.env.NO_COLOR;
        // 使用唯一 app 名，避免与同目录其他 spec 文件共享 winstonLoggerMap key 而互相串扰。
        process.env.SHIRO_APP_NAME = 'jest-title-variant';
        // 关键：设置为 development，让 `shouldPrintConsoleDetails()` 返回 true，
        // 从而保证非 titleOnly 路径会附加多行 `inspect(entry)` detail 块。
        // 这样 `.title()` 路径下"只输出标题行 + 可选参数行，且不含 `\n  logType:`"才有真正的验证力——
        // 如果在 NODE_ENV='test' / 'production' 下测试，detail 块本身会被 short-circuit，
        // “无 detail 块”就并非由 titleOnly 分支保证。
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-title-variant-'));
        delete process.env.NO_COLOR;
        // 把所有控制台 sink 都桩成共享 buffer 的 push 函数；
        // 一次写入只会落到 buffer 一次，避免多 spy 多源捕获造成的"虚假多行"。
        clearCapturedOutput();
        jest.spyOn(process.stdout, 'write').mockImplementation(pushChunk as never);
        jest.spyOn(process.stderr, 'write').mockImplementation(pushChunk as never);
        jest.spyOn(console._stdout, 'write').mockImplementation(pushChunk as never);
        jest.spyOn(console._stderr, 'write').mockImplementation(pushChunk as never);
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        process.env.NO_COLOR = originalNoColor;
        jest.restoreAllMocks();
    });

    /**
     * message arb：
     * - 长度 1..100，避免 fast-check 缩减阶段产生空字符串（Property 4 限定"非空 message"）。
     * - 过滤掉 `\n` / `\r`：用户消息内含的换行属于"调用方刻意写入"，会让最终输出天然多行；
     *   Property 4 想验证的是"logger 自身不附加 detail 块"，不是"调用方传入的换行也要被压缩"。
     * - 同时排除 `\u0000`（部分终端会被打印为可见字符但不影响行数；为稳妥起见去掉）。
     */
    const safeMessageArb = fc
        .string({ minLength: 1, maxLength: 100 })
        .filter((value) => !value.includes('\n') && !value.includes('\r') && !value.includes('\u0000'));

    /**
     * context value arb：标量 + 简单嵌套对象，覆盖 `inspect({ depth: 2 })` 边界但不引入随机换行。
     * - 不放 fc.string()，因为 context 值在 `breakLength: Infinity` 模式下不会自行换行，
     *   但若值内部含 `\n` 字面量，inspect 会把它转义成 `\\n`，不会成为真正的换行符——
     *   因此这里允许任意字符串，不再过滤换行（inspect 会转义）。
     */
    const contextValueArb: fc.Arbitrary<unknown> = fc.oneof(
        fc.string({ maxLength: 32 }),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.array(fc.oneof(fc.string({ maxLength: 16 }), fc.integer()), { maxLength: 4 }),
        fc.dictionary(
            fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,8}$/),
            fc.oneof(fc.string({ maxLength: 16 }), fc.integer(), fc.boolean()),
            { maxKeys: 3 }
        )
    );

    /**
     * context arb：键名约束为常规标识符，避免 inspect 输出的 key 名引入额外噪声；
     * 允许空对象（覆盖"无 titleArgs 参数行"的分支）。
     */
    const contextArb = fc.dictionary(fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,12}$/), contextValueArb, { maxKeys: 5 });

    /** 覆盖所有 facade 级别的 `.title()` 入口，error / fatal 走 stderr，其余走 stdout。 */
    const levelArb = fc.constantFrom('info', 'debug', 'verbose', 'warn', 'error', 'fatal' as const);

    /**
     * Property 4: 对任意 (level, message, context)，`logger.<level>.title(message, context)`
     * 触发的控制台输出：
     *   1. 无 context 时仅输出标题行；有 context 时输出“标题行 + 多行参数块”；
     *   2. 标题行包含与 level 对应的颜文字；有 context 时标题行末尾用 `↓` 标记展开，
     *      context 左边界对齐级别文字起点，最后一行用 `↑` 标记收束；
     *   3. 不出现 `inspect(entry)` 风格的多行 detail 块（即不含 `\n  logType:` /
     *      `\n  module:` 这类换行 + 缩进字段名的标识）。
     *
     * Validates: Requirements 2.3, 2.4, 8.2
     */
    it('logger.<level>.title(message, context) 输出标题行和可选 context 行，且不含多行 detail 块', () => {
        const logger = createRuntimeLogger('title_variant_property');

        fc.assert(
            fc.property(levelArb, safeMessageArb, contextArb, (level, message, context) => {
                clearCapturedOutput();

                logger[level].title(message, context);

                const rawOutput = readCapturedOutput();
                const stripped = stripAnsi(rawOutput);

                // Winston Console transport 在每条消息末尾追加一个 `\n`；
                // 把尾部的连续换行剥掉后再按有效行断言。
                const trimmed = stripped.replace(/[\r\n]+$/, '');
                const lines = trimmed.split(/\r?\n/);
                const hasContextLine = Object.keys(context).length > 0;

                if (hasContextLine) {
                    expect(lines.length).toBeGreaterThan(2);
                } else {
                    expect(lines.length).toBe(1);
                }

                // 负向断言：detail 块（`inspect(entry, { compact: false })`）会以
                // `\n  logType: 'system'` / `\n  module: '...'` 等形式呈现；只要任一 detail 标记出现，
                // 就说明 titleOnly 分支被错误地附加了 detail。
                expect(stripped).not.toContain('\n  logType:');
                expect(stripped).not.toContain('\n  module:');
                expect(stripped).not.toContain('\n  level:');
                expect(stripped).not.toContain('\n  labels:');

                // 标题行内容自检：必须包含调用方传入的 message（保证我们捕获到的的确是本次调用产生的输出，
                // 而不是空字符串造成的"假单行"）。message 经 winston colorize 包裹了 ANSI，
                // stripAnsi 之后应原样可见。
                expect(lines[0]).toContain(message);
                expect(lines[0]).toContain(expectedLevelEmotions[level]);

                if (hasContextLine) {
                    const firstContextKey = Object.keys(context)[0];
                    const levelStartColumn = displayColumnOf(lines[0], level.toUpperCase());
                    const blockIndent = ' '.repeat(levelStartColumn);
                    expect(stripped).toContain(firstContextKey);
                    expect(lines[0].trimEnd().endsWith('↓')).toBe(true);
                    expect(lines[1]).not.toContain('▶');
                    expect(lines[lines.length - 1]).not.toContain('◀');
                    expect(firstNonSpaceColumn(lines[1])).toBe(levelStartColumn);
                    for (const line of lines.slice(1)) {
                        expect(line.startsWith(blockIndent)).toBe(true);
                    }
                    expect(lines[lines.length - 1].trim()).toMatch(/^} .*↑$/);
                }
            }),
            { numRuns: 100 }
        );
    });
});
