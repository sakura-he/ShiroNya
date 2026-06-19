import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** 单个命中：文件相对路径 / 行号 / 行内片段。 */
export interface ComplianceHit {
    file: string;
    line: number;
    snippet: string;
}

const CONSOLE_METHODS = new Set(['log', 'warn', 'error', 'info', 'debug']);
const NEST_LOGGER_STATIC_METHODS = new Set(['log', 'error', 'warn', 'debug', 'verbose']);

function createSourceFile(content: string, fileLabel: string): ts.SourceFile {
    return ts.createSourceFile(fileLabel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function buildHit(sourceFile: ts.SourceFile, content: string, fileLabel: string, node: ts.Node): ComplianceHit {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const snippet = content.split(/\r?\n/)[line]?.trim() ?? '';
    return {
        file: fileLabel,
        line: line + 1,
        snippet
    };
}

function isIdentifierNamed(node: ts.Node, name: string): node is ts.Identifier {
    return ts.isIdentifier(node) && node.text === name;
}

function isForbiddenConsoleCall(node: ts.CallExpression): boolean {
    const expression = node.expression;
    return (
        ts.isPropertyAccessExpression(expression) &&
        isIdentifierNamed(expression.expression, 'console') &&
        CONSOLE_METHODS.has(expression.name.text)
    );
}

function isForbiddenNestLoggerStaticCall(node: ts.CallExpression): boolean {
    const expression = node.expression;
    return (
        ts.isPropertyAccessExpression(expression) &&
        isIdentifierNamed(expression.expression, 'Logger') &&
        NEST_LOGGER_STATIC_METHODS.has(expression.name.text)
    );
}

function isForbiddenNestLoggerConstructor(node: ts.NewExpression): boolean {
    return isIdentifierNamed(node.expression, 'Logger');
}

/**
 * 使用 TypeScript AST 扫描真实代码节点。
 * 注释和字符串不会进入对应 CallExpression/NewExpression 节点，因此不需要手写去注释解析器。
 */
export function scanFile(content: string, fileLabel: string = ''): ComplianceHit[] {
    const sourceFile = createSourceFile(content, fileLabel || 'virtual.ts');
    const hits: ComplianceHit[] = [];

    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && (isForbiddenConsoleCall(node) || isForbiddenNestLoggerStaticCall(node))) {
            hits.push(buildHit(sourceFile, content, fileLabel, node));
        }

        if (ts.isNewExpression(node) && isForbiddenNestLoggerConstructor(node)) {
            hits.push(buildHit(sourceFile, content, fileLabel, node));
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return hits.sort((a, b) => a.line - b.line);
}

/** 从 `__dirname` 推导仓库根：libs/common/src/logger -> 4 级回退。 */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ADMIN_SRC_ROOT = path.join(REPO_ROOT, 'apps', 'admin-api', 'src');

/** 递归收集 admin 源文件，跳过测试文件。 */
function collectAdminTsFiles(dir: string): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectAdminTsFiles(full));
            continue;
        }
        if (!entry.isFile()) continue;
        if (!full.endsWith('.ts')) continue;
        if (full.endsWith('.spec.ts') || full.endsWith('.test.ts')) continue;
        result.push(full);
    }
    return result;
}

describe('admin logger compliance scan', () => {
    it('admin source has zero console.* / NestJS default Logger usage', () => {
        const files = collectAdminTsFiles(ADMIN_SRC_ROOT);
        expect(files.length).toBeGreaterThan(0);

        const allHits: ComplianceHit[] = [];
        for (const absolutePath of files) {
            const relativePath = path.relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');
            const content = readFileSync(absolutePath, 'utf8');
            allHits.push(...scanFile(content, relativePath));
        }

        if (allHits.length > 0) {
            const formatted = allHits.map((hit) => `  - ${hit.file}:${hit.line}  ${hit.snippet}`).join('\n');
            process.stderr.write(`\n[admin-logger-compliance] 命中如下：\n${formatted}\n`);
        }

        expect(allHits).toEqual([]);
    });

    it('ignores comments and string literals, reports only executable logger calls', () => {
        const content = `
// console.log('ignored')
const text = "Logger.error('ignored')";
console.warn('visible');
new Logger('Visible');
Logger.debug('visible');
`;

        expect(scanFile(content, 'virtual.ts')).toEqual([
            { file: 'virtual.ts', line: 4, snippet: "console.warn('visible');" },
            { file: 'virtual.ts', line: 5, snippet: "new Logger('Visible');" },
            { file: 'virtual.ts', line: 6, snippet: "Logger.debug('visible');" }
        ]);
    });
});
