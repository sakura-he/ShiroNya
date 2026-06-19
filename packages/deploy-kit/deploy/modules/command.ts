import { execa } from 'execa';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import which from 'which';

import {
    configureDeployRuntimeLogger,
    deployLogLocationText,
    formatDeployRuntimeConsoleLine,
    normalizeDeployCommandOutput,
    normalizeDeployLogSource,
    writeDeployRuntimeErrorLog,
    writeDeployRuntimeLog,
    writeDeployRuntimeOutput
} from '../../logging/deploy-logger.ts';
import { deployToolRoot } from '../../core/paths.ts';
import type { DeployRuntimeLogEntry } from '../../logging/deploy-logger.ts';
import type { DeployConfig } from '../../core/types.ts';
import { shiroNyaAppImage, shiroNyaAppImageRegistry, shiroNyaAppImageTag } from './constants.ts';

/**
 * 文件作用：
 * 这个模块封装部署过程里的“命令执行”和“部署日志”。
 *
 * 为什么要集中封装：
 * - Docker、Prisma 等外部命令都会输出 stdout/stderr。
 * - 这些输出需要同时进入终端 UI 和 runtime logger 文件，方便部署人员直接排查。
 * - 命令失败时要写入运行日志，并给用户一个能定位日志目录的错误信息。
 * - 终端 UI 运行时不能直接随意 `console.log`，否则会破坏进度条布局。
 */

type LoggedCommandOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    terminalOutput?: boolean;
    title?: string;
};

export type ResolvedCommand = {
    args: string[];
    command: string;
    cwd?: string;
    label: string;
};

const prismaCliPackage = 'prisma@7.5.0';

let activeDeployTerminalOutput: ((text: string) => void) | undefined;

/**
 * 写部署终端输出。
 *
 * 如果进度 UI 已经接管输出，就写入 UI 的日志区域。
 * 如果没有 UI，比如测试或早期初始化阶段，就直接写 stdout。
 */
function writeDeployTerminalOutput(text: string): void {
    if (activeDeployTerminalOutput) {
        // 进度 UI 活跃时，所有命令输出都写到 UI 日志区域，避免打乱步骤面板。
        activeDeployTerminalOutput(text);
        return;
    }

    // 没有 UI 接管时，直接写标准输出，便于单元测试或纯文本运行。
    process.stdout.write(text);
}

/**
 * 按“来源 + 单行文本”的形式输出日志。
 * 空行会被跳过，避免终端日志区域被无意义空白刷屏。
 */
function writeDeployTerminalLine(source: string, line: string): void {
    // trimEnd 只去掉行尾空白，保留行首缩进，方便 shell 脚本输出仍然可读。
    const text = line.trimEnd();
    if (!text.trim()) return;

    // os.EOL 使用当前系统换行符，Windows 是 CRLF，Linux/macOS 是 LF。
    writeDeployTerminalOutput(`[${normalizeDeployLogSource(source)}] ${text}${os.EOL}`);
}

/** 让进度 UI 接管或释放部署命令输出。 */
export function setActiveDeployTerminalOutput(writer: ((text: string) => void) | undefined): void {
    activeDeployTerminalOutput = writer;
}

/** 把结构化运行日志条目同步打印到终端日志区域。 */
export function writeDeployRuntimeEntryToTerminal(entry: DeployRuntimeLogEntry): void {
    writeDeployTerminalOutput(`${formatDeployRuntimeConsoleLine(entry)}${os.EOL}`);
}

/** 批量打印结构化运行日志条目。 */
function writeDeployRuntimeEntriesToTerminal(entries: DeployRuntimeLogEntry[]): void {
    for (const entry of entries) {
        writeDeployRuntimeEntryToTerminal(entry);
    }
}

/**
 * 创建“流式输出转行输出”的写入器。
 *
 * 子进程 stdout/stderr 到达时不保证刚好按行切分，可能半行半行地来。
 * 所以这里用 pendingLine 暂存尚未遇到换行符的内容：
 * - write(text)：接收任意片段，遇到 `\n` 才输出完整行。
 * - line(line)：强制输出一整行，适合已经解析好的 Docker JSON 进度。
 * - flush()：命令结束时把最后半行吐出来。
 */
export function createDeployTerminalLogWriter(source: string): {
    flush: () => void;
    line: (line: string) => void;
    write: (text: string) => void;
} {
    let pendingLine = '';

    return {
        flush() {
            if (pendingLine.trim()) {
                // 命令结束时，如果最后一段没有换行，也要作为一行输出，避免丢日志。
                writeDeployTerminalLine(source, pendingLine);
            }
            pendingLine = '';
        },
        line(line) {
            if (pendingLine.trim()) {
                // 如果之前 write() 累积了半行，先输出它，再输出当前完整行。
                writeDeployTerminalLine(source, pendingLine);
                pendingLine = '';
            }
            writeDeployTerminalLine(source, line);
        },
        write(text) {
            // 先清洗 ANSI 控制字符和 CRLF，再拼到 pendingLine。
            pendingLine += normalizeDeployCommandOutput(text);

            // stdout/stderr 可能一次给多行，也可能给半行；split 后最后一段继续暂存。
            const lines = pendingLine.split('\n');
            pendingLine = lines.pop() ?? '';

            for (const line of lines) {
                // 只有已经遇到换行符的完整行才输出。
                writeDeployTerminalLine(source, line);
            }
        }
    };
}

/**
 * 给命令参数做安全展示用的 shell quote。
 *
 * 正则 `/^[\w./:=@+-]+$/` 说明：
 * - `^` 和 `$` 表示必须从开头到结尾完整匹配。
 * - `\w` 表示字母、数字和下划线。
 * - `./:=@+-` 是允许直接显示的常见命令字符。
 * - 不在这个安全集合里的值会用 JSON.stringify 包起来，避免空格、引号等字符让日志看起来像多个参数。
 *
 * 这只是“日志展示”，真正执行命令仍然使用 execa 的 args 数组，不会走 shell 拼接。
 */
export function shellQuote(value: string): string {
    // 简单安全字符不加引号，日志更接近日常命令行写法。
    if (/^[\w./:=@+-]+$/.test(value)) return value;

    // 含空格、引号、换行等复杂字符时，用 JSON 字符串形式展示。
    return JSON.stringify(value);
}

/**
 * 写一条部署日志，并同步显示到终端 UI。
 *
 * message 可以包含多行；这里会拆成多条日志，方便终端和 runtime logger 按行阅读。
 */
export async function logDeployMessage(config: DeployConfig, source: string, message: string): Promise<void> {
    // source 会出现在日志 module 字段里，过长会影响表格和日志检索，所以统一规范化。
    const normalizedSource = normalizeDeployLogSource(source);

    // 同一条 message 可能包含多行，例如 Docker 错误或用户提示，这里拆成独立日志行。
    const lines = normalizeDeployCommandOutput(message)
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim());
    if (!lines.length) return;

    for (const line of lines) {
        // writeDeployRuntimeLog 写结构化日志；writeDeployRuntimeEntryToTerminal 同步显示到终端。
        writeDeployRuntimeEntryToTerminal(writeDeployRuntimeLog(config, normalizedSource, line));
    }
}

/**
 * 初始化部署运行日志。
 *
 * 这一步必须在其他部署步骤之前执行，因为后续错误都依赖日志目录定位。
 */
export async function initializeDeployLog(config: DeployConfig): Promise<void> {
    // 配置底层 runtime logger，让 deploy 日志写到 config.targetLogDir。
    configureDeployRuntimeLogger(config);

    // 日志目录不存在时创建，避免第一条日志写入失败。
    await fs.ensureDir(config.targetLogDir);
    writeDeployRuntimeEntryToTerminal(
        writeDeployRuntimeLog(config, 'deploy log', 'Shiro Nya deploy log initialized', {
            appImageRegistry: config.env.SHIRO_NYA_IMAGE_REGISTRY ?? shiroNyaAppImageRegistry,
            appImageTag: config.env.SHIRO_NYA_IMAGE_TAG ?? shiroNyaAppImageTag,
            appImages: {
                adminApi: shiroNyaAppImage('admin-api', config.env),
                adminWeb: shiroNyaAppImage('admin-web', config.env),
                appApi: shiroNyaAppImage('app-api', config.env)
            },
            targetDockerDir: config.targetDockerDir,
            targetRoot: config.targetRoot
        })
    );
    await logDeployMessage(config, 'deploy log', `部署运行日志目录: ${deployLogLocationText(config)}`);
}

/**
 * 执行一个带日志能力的外部命令。
 *
 * 关键点：
 * - command 是可执行文件名，例如 `docker`。
 * - args 是参数数组，例如 `['compose', 'up', '-d']`。
 * - 不使用拼接后的 shell 字符串执行命令，可以降低空格/引号导致的注入风险。
 * - stdout 和 stderr 都原样写入部署运行日志。
 */
export async function runLoggedCommand(
    config: DeployConfig,
    command: string,
    args: string[],
    options: LoggedCommandOptions = {}
): Promise<void> {
    // commandLine 只用于日志展示；实际执行仍然使用 command + args 数组。
    const commandLine = [command, ...args].map(shellQuote).join(' ');

    // terminalOutput=false 时仍写运行日志，但不刷终端；适合后台检查这类不需要用户实时看完整输出的命令。
    const mirrorToTerminal = options.terminalOutput !== false;

    // 命令开始时先写一条结构化日志，后续排查能知道到底执行了什么。
    const commandStartedEntry = writeDeployRuntimeLog(config, options.title ?? command, `执行命令: ${commandLine}`, {
        command,
        cwd: options.cwd,
        title: options.title
    });
    if (mirrorToTerminal) writeDeployRuntimeEntryToTerminal(commandStartedEntry);

    // execa 不通过 shell 拼接字符串，args 中的空格、引号都会作为参数值传递，不会变成 shell 语法。
    const subprocess = execa(command, args, {
        cwd: options.cwd,
        env: options.env,
        input: options.input,
        stdout: 'pipe',
        stderr: 'pipe'
    });

    subprocess.stdout?.on('data', (chunk) => {
        // chunk 可能是 Buffer，也可能是字符串；统一转成 utf8 文本写入日志。
        const output = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const entries = writeDeployRuntimeOutput(config, options.title ?? command, output);
        if (mirrorToTerminal) writeDeployRuntimeEntriesToTerminal(entries);
    });
    subprocess.stderr?.on('data', (chunk) => {
        // stderr 也写 info 输出条目，真正的失败由 catch 中的 error 日志记录。
        const output = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const entries = writeDeployRuntimeOutput(config, options.title ?? command, output);
        if (mirrorToTerminal) writeDeployRuntimeEntriesToTerminal(entries);
    });

    try {
        // await subprocess 会等待命令退出；非 0 退出码会进入 catch。
        await subprocess;
        const commandCompletedEntry = writeDeployRuntimeLog(config, options.title ?? command, '命令执行完成', {
            command,
            exitCode: 0
        });
        if (mirrorToTerminal) writeDeployRuntimeEntryToTerminal(commandCompletedEntry);
    } catch (error) {
        // 失败时记录原始 error 和完整 commandLine，方便日志排查。
        const commandFailedEntry = writeDeployRuntimeErrorLog(config, options.title ?? command, '命令执行失败', error, {
            command,
            commandLine
        });
        if (mirrorToTerminal) writeDeployRuntimeEntryToTerminal(commandFailedEntry);

        // 抛给上层的错误信息保持简短，并告诉用户去部署运行日志看详情。
        throw new Error(`命令执行失败：${commandLine}${os.EOL}详见部署运行日志：${deployLogLocationText(config)}`);
    }
}

/**
 * 检查命令是否存在并可执行。
 *
 * 默认会执行 `command --version`。
 * 如果 args 传空数组，只检查 PATH 中能否找到命令，不额外执行。
 */
export async function commandExists(command: string, args: string[] = ['--version']): Promise<boolean> {
    try {
        // which 只负责找可执行文件路径；nothrow=true 表示找不到时返回 null 而不是抛错。
        const resolvedCommand = await which(command, { nothrow: true });
        if (!resolvedCommand) return false;
        if (args.length === 0) return true;

        // 找到命令后再实际运行一次版本命令，确认不是坏的 shim 或不可执行文件。
        await execa(resolvedCommand, args, { stdout: 'ignore', stderr: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/** 检查一个已经带默认参数/cwd 的命令规格是否可用。 */
async function commandSpecExists(spec: ResolvedCommand, args: string[]): Promise<boolean> {
    try {
        // 绝对路径不需要 which；命令名才需要从 PATH 里解析。
        const resolvedCommand = nodePath.isAbsolute(spec.command) ? spec.command : await which(spec.command, { nothrow: true });
        if (!resolvedCommand) return false;

        // spec.args 是候选命令自带参数，args 是这次检查追加的参数，例如 --version。
        await execa(resolvedCommand, [...spec.args, ...args], {
            cwd: spec.cwd,
            stdout: 'ignore',
            stderr: 'ignore'
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * 寻找可用的 Prisma CLI。
 *
 * 查找顺序：
 * 1. `npx -y prisma@7.5.0`：最通用，适合发布脚本运行时没有本地 node_modules 的情况。
 * 2. 全局或 PATH 中的 `prisma`。
 * 3. deploy-kit 自身或打包输出旁边的 `node_modules/.bin/prisma`。
 * 4. 在包根目录里通过 `pnpm exec prisma` 执行。
 *
 * `-y` 是 npx 的确认参数，表示自动同意临时安装/执行指定包，避免部署过程卡在交互确认。
 */
export async function resolvePrismaCliCommand(): Promise<ResolvedCommand | null> {
    // Windows 下 npm/pnpm bin 通常是 .cmd；类 Unix 系统直接叫 prisma。
    const executableName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';

    // deployToolRoot 可能是源码包根，也可能是打包后的 dist/输出目录。
    const packageRoots = [
        deployToolRoot,
        // 如果当前根目录名是 dist，再额外尝试 dist 的上一级，覆盖常见打包目录结构。
        ...(nodePath.basename(deployToolRoot) === 'dist' ? [nodePath.dirname(deployToolRoot)] : [])
    ];

    // 候选顺序从“最通用”到“最依赖本地安装”。
    const candidates: ResolvedCommand[] = [
        {
            args: ['-y', prismaCliPackage],
            command: 'npx',
            label: `npx -y ${prismaCliPackage}`
        },
        {
            args: [],
            command: 'prisma',
            label: 'prisma'
        },
        ...packageRoots.flatMap((packageRoot) => [
            {
                args: [],
                command: nodePath.join(packageRoot, 'node_modules', '.bin', executableName),
                label: nodePath.join(packageRoot, 'node_modules', '.bin', executableName)
            },
            {
                args: ['exec', 'prisma'],
                command: 'pnpm',
                cwd: packageRoot,
                label: `pnpm exec prisma (${packageRoot})`
            }
        ])
    ];

    for (const candidate of candidates) {
        // 每个候选都执行 --version 验证，第一条可用的立即返回。
        if (await commandSpecExists(candidate, ['--version'])) {
            return candidate;
        }
    }

    // 返回 null 让调用方决定如何报错；这里不直接 throw，方便依赖检查聚合多个缺失项。
    return null;
}
