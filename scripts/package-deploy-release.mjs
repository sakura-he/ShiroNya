import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

/**
 * 文件作用：
 * 这个脚本把 `deploy_script/` 目录打包成单个可分发的 `shiro-nya-deploy.mjs`。
 *
 * 发布文件的运行方式：
 * 1. 用户执行 `node shiro-nya-deploy.mjs`。
 * 2. 自解压脚本把内嵌 payload 解压到系统临时目录。
 * 3. 再用当前 Node.js 运行解压出来的 `index.js`。
 *
 * 这样做的好处：
 * - 用户只需要拿一个 mjs 文件。
 * - Docker/Prisma/Grafana 等运行模板仍能以文件形式存在。
 * - payloadHash 可以作为缓存目录名，内容没变时不需要重复解压。
 */

// Node 的 gzip 是回调 API，promisify 后可以用 await。
const gzipAsync = promisify(gzip);

// 仓库根目录。
const rootDir = path.resolve(import.meta.dirname, '..');

// `pnpm deploy-script:build` 生成的目录。
const deployScriptDir = path.join(rootDir, 'deploy_script');

// 发布产物目录。
const releaseDir = path.join(rootDir, 'release', 'deploy');

// 最终给用户分发的自解压脚本名。
const selfExtractingScript = 'shiro-nya-deploy.mjs';

/** 判断路径是否存在。 */
async function pathExists(target) {
    try {
        // fs.access 成功表示当前进程能访问该路径。
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

/** 计算文件 sha256，用于生成 checksums.txt。 */
async function sha256File(file) {
    const hash = createHash('sha256');
    await new Promise((resolve, reject) => {
        // 用 stream 读取，避免大文件一次性读入内存。
        createReadStream(file)
            .on('data', (chunk) => hash.update(chunk))
            .on('error', reject)
            .on('end', resolve);
    });
    return hash.digest('hex');
}

/**
 * 收集 deploy_script 目录下所有文件。
 *
 * 每个文件会被转换成：
 * - path：相对路径，统一使用 `/`，保证跨平台解压一致。
 * - mode：文件权限，入口 index.js 可执行，其他文件普通可读。
 * - content：base64 内容，方便嵌入 JSON。
 */
async function collectDeployFiles(baseDir) {
    const files = [];

    async function visit(currentDir) {
        // withFileTypes=true 可以直接判断是目录还是文件，不需要额外 stat。
        const dirents = await fs.readdir(currentDir, { withFileTypes: true });

        // 排序保证每次生成 payload 的文件顺序稳定，hash 也更稳定。
        for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
            const absolutePath = path.join(currentDir, dirent.name);
            if (dirent.isDirectory()) {
                // 递归进入子目录。
                await visit(absolutePath);
                continue;
            }
            if (!dirent.isFile()) continue;

            // Windows 路径分隔符是 `\`，payload 里统一替换成 `/`，避免跨平台解压差异。
            const relativePath = path.relative(baseDir, absolutePath).split(path.sep).join('/');
            files.push({
                // 二进制/文本都按 base64 存，避免 JSON 字符串编码损坏内容。
                content: (await fs.readFile(absolutePath)).toString('base64'),
                // 0o755 给入口执行权限，0o644 给普通资源文件。
                mode: dirent.name === 'index.js' ? 0o755 : 0o644,
                path: relativePath
            });
        }
    }

    await visit(baseDir);
    return files;
}

/**
 * 生成自解压脚本文本。
 *
 * payload 是 gzip 后再 base64 的文件列表。
 * payloadHash 是 payload 的短 hash，用于缓存目录名和完整性标记。
 */
function createSelfExtractingScript(payload, payloadHash) {
    return `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const requiredNodeVersion = { major: 22, minor: 12, patch: 0 };
const payload = ${JSON.stringify(payload)};
const payloadHash = ${JSON.stringify(payloadHash)};

function parseNodeVersion(value) {
    // process.version 形如 v22.12.0，先去掉开头 v，再按点号拆分。
    const [major = 0, minor = 0, patch = 0] = value.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10));
    return { major, minor, patch };
}

function isSupportedNodeVersion(version) {
    // 大版本更高直接允许；大版本相同再比较 minor；minor 相同再比较 patch。
    if (version.major !== requiredNodeVersion.major) return version.major > requiredNodeVersion.major;
    if (version.minor !== requiredNodeVersion.minor) return version.minor > requiredNodeVersion.minor;
    return version.patch >= requiredNodeVersion.patch;
}

function assertNodeRuntime() {
    const version = parseNodeVersion(process.version);
    if (isSupportedNodeVersion(version)) return;

    // Node 版本不满足时直接退出，避免后续语法或依赖在旧 Node 上报更难懂的错误。
    console.error(
        \`Shiro Nya deploy requires Node.js >= \${requiredNodeVersion.major}.\${requiredNodeVersion.minor}.\${requiredNodeVersion.patch}. Current runtime: \${process.version}\`
    );
    process.exit(1);
}

function isInside(parent, child) {
    // path.relative(parent, child) 如果以 .. 开头，说明 child 跳出了 parent。
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function extractDeployScript() {
    // 用户可通过 SHIRO_NYA_DEPLOY_CACHE_DIR 指定缓存目录；默认放系统临时目录。
    const cacheRoot = path.resolve(process.env.SHIRO_NYA_DEPLOY_CACHE_DIR || path.join(os.tmpdir(), 'shiro-nya-deploy'));
    const extractDir = path.resolve(cacheRoot, payloadHash);
    if (!isInside(cacheRoot, extractDir)) {
        throw new Error(\`Unsafe deploy extraction path: \${extractDir}\`);
    }

    const marker = path.join(extractDir, '.payload-hash');
    const entry = path.join(extractDir, 'index.js');
    try {
        // marker 内容等于当前 payloadHash 且入口存在时，说明缓存可复用。
        if ((await fs.readFile(marker, 'utf8')).trim() === payloadHash) {
            await fs.access(entry);
            return entry;
        }
    } catch {
        // 缓存缺失或损坏时，删除旧目录重新解压。
        await fs.rm(extractDir, { recursive: true, force: true });
    }

    await fs.mkdir(extractDir, { recursive: true });
    // payload: base64 -> gzip buffer -> JSON 文本 -> 文件数组。
    const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
    for (const file of files) {
        const target = path.resolve(extractDir, file.path);
        if (!isInside(extractDir, target)) {
            // 防御路径穿越，例如 payload 里出现 ../../evil.js 时必须拒绝。
            throw new Error(\`Unsafe deploy payload path: \${file.path}\`);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        // content 是 base64，还原成 Buffer 后写入真实文件。
        await fs.writeFile(target, Buffer.from(file.content, 'base64'));
        await fs.chmod(target, file.mode).catch(() => undefined);
    }
    // marker 写入 hash，下一次运行可判断缓存是否仍对应当前 payload。
    await fs.writeFile(marker, \`\${payloadHash}\\n\`);
    return entry;
}

assertNodeRuntime();
const entry = await extractDeployScript();
// 使用当前 Node 可执行文件运行解压后的入口，并透传用户命令行参数。
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
});

child.on('exit', (code, signal) => {
    if (signal) {
        // 如果子进程被信号终止，父进程也用相同信号终止，保持行为一致。
        process.kill(process.pid, signal);
        return;
    }
    // code 为 null 时用 1 兜底，表示异常退出。
    process.exit(code ?? 1);
});
`;
}

/** 写出单文件自解压脚本。 */
async function writeSelfExtractingScript() {
    const files = await collectDeployFiles(deployScriptDir);
    // JSON 文件列表先 gzip 压缩，level=9 表示尽量压小。
    const payloadBuffer = await gzipAsync(Buffer.from(JSON.stringify(files), 'utf8'), { level: 9 });
    const payload = payloadBuffer.toString('base64');
    // 取 hash 前 16 位作为缓存目录名，足够区分发布 payload，路径也不会太长。
    const payloadHash = createHash('sha256').update(payloadBuffer).digest('hex').slice(0, 16);
    const output = path.join(releaseDir, selfExtractingScript);

    await fs.writeFile(output, createSelfExtractingScript(payload, payloadHash), 'utf8');
    // 类 Unix 系统上允许直接执行；Windows 上 chmod 失败也不影响 node xxx.mjs 运行。
    await fs.chmod(output, 0o755).catch(() => undefined);
}

/** 写 checksums.txt，便于发布后校验文件完整性。 */
async function writeChecksums(files) {
    const lines = [];
    for (const file of files) {
        const filePath = path.join(releaseDir, file);
        // checksums.txt 常见格式是 `<sha256>  <filename>`，中间两个空格。
        lines.push(`${await sha256File(filePath)}  ${file}`);
    }
    await fs.writeFile(path.join(releaseDir, 'checksums.txt'), `${lines.join('\n')}\n`);
}

async function main() {
    if (!(await pathExists(path.join(deployScriptDir, 'index.js')))) {
        // release 依赖 build 输出，缺少 index.js 说明还没构建。
        throw new Error('deploy_script/index.js does not exist. Run `pnpm run deploy-script:build` first.');
    }

    // 每次发布前清空 release/deploy，避免旧产物残留。
    await fs.rm(releaseDir, { recursive: true, force: true });
    await fs.mkdir(releaseDir, { recursive: true });

    await writeSelfExtractingScript();
    await writeChecksums([selfExtractingScript]);

    console.log(`Deploy release asset written to ${path.relative(rootDir, path.join(releaseDir, selfExtractingScript))}`);
}

await main();
