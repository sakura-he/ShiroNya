import { execa } from 'execa';
import fs from 'fs-extra';
import YAML from 'yaml';

import type { DeployConfig, DeployStepContext } from '../../core/types.ts';
import { deployLogLocationText, writeDeployRuntimeErrorLog, writeDeployRuntimeLog, writeDeployRuntimeOutput } from '../../logging/deploy-logger.ts';
import {
    createDeployTerminalLogWriter,
    logDeployMessage,
    shellQuote,
    writeDeployRuntimeEntryToTerminal
} from './command.ts';
import { composeArgs, composeEnv } from './docker-compose.ts';

/**
 * 文件作用：
 * 这个模块负责执行 `docker compose pull`，并把 Docker 镜像拉取进度转换成部署进度条。
 *
 * Docker pull 的难点：
 * - 一个服务镜像可能有多个 layer。
 * - Docker Compose 的 JSON 输出是一行一个事件，不是一个完整 JSON 数组。
 * - 有些事件只告诉你“正在下载”，有些事件才有 current/total 字节数。
 * - 长时间没有输出时，用户会以为卡住，所以这里会定时写“等待镜像层输出”的提示。
 */

type ComposeService = {
    name: string;
    image: string;
};

type PullLayerProgress = {
    downloaded: number;
    total: number;
};

type ComposeProgressEvent = {
    id?: string;
    status?: string;
    text?: string;
    current?: number;
    total?: number;
    progressDetail?: {
        current?: number;
        total?: number;
    };
};

const dockerPullQuietNoticeMs = 45_000;

/**
 * 解析 compose.yaml 里 image 字段使用的 `${VAR:-fallback}` 占位符。
 *
 * 为什么这里需要自己解析：
 * - 真正执行 `docker compose pull` 时，Docker Compose 会读取 --env-file 并自动展开变量。
 * - 但本模块为了提前展示“准备拉取哪些镜像”，会直接读取 compose.yaml 原文。
 * - 如果不解析，日志里会显示 `${SHIRO_NYA_IMAGE_REGISTRY:-...}`，进度匹配也少一个真实镜像名线索。
 *
 * 当前只实现部署模板实际使用的两种形式：
 * - `${VAR}`：变量存在就替换，不存在替换为空字符串。
 * - `${VAR:-fallback}`：变量为空或不存在时使用 fallback。
 *
 * 正则说明：
 * - `\$\{` / `\}` 匹配 `${` 和 `}` 这两个 compose 变量边界。
 * - `([A-Za-z_][A-Za-z0-9_]*)` 匹配环境变量名，要求首字符不是数字。
 * - `(?::-([^}]*))?` 匹配可选的 `:-fallback`，其中 `:` 和 `-` 是 compose 默认值语法。
 */
function resolveComposeImageText(value: string, env: Record<string, string | undefined>): string {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_match, key: string, fallback?: string) => {
        // 优先使用部署向导生成的 env；没有时再看当前进程环境，方便用户临时覆盖镜像源。
        const configured = env[key]?.trim() || process.env[key]?.trim();
        if (configured) return configured;

        // fallback 为 undefined 表示 `${VAR}` 没写默认值；这种情况只能替换为空。
        return fallback ?? '';
    });
}

/**
 * 从 Compose 文件里读取需要拉取的服务镜像。
 *
 * 为什么不直接写死服务名：
 * - compose.generated.yaml 可能会补充/覆盖服务。
 * - 以后添加服务时，只要 compose 文件写了 image，这里就能自动识别。
 *
 * Map 的作用：
 * - 多个 compose 文件可能声明同一个 service。
 * - 后读取的文件会覆盖前面的同名 service，和 Docker Compose override 语义保持一致。
 */
async function readComposeServices(config: DeployConfig): Promise<ComposeService[]> {
    // key 是 service name，value 是最终使用的 image；Map 可以自然处理同名服务覆盖。
    const services = new Map<string, ComposeService>();

    for (const file of config.composeFiles) {
        // 某些 override 文件可能还没生成；不存在就跳过，不把它当错误。
        if (!(await fs.pathExists(file))) continue;

        // YAML.parse 返回 unknown 风格的数据，这里只读取 services.*.image。
        const document = YAML.parse(await fs.readFile(file, 'utf8')) as
            | { services?: Record<string, { image?: unknown }> }
            | null
            | undefined;

        for (const [name, service] of Object.entries(document?.services ?? {})) {
            // 只统计 image 是非空字符串的服务；build-only 或辅助服务不参与 pull 进度估算。
            if (typeof service.image === 'string' && service.image.trim()) {
                services.set(name, { name, image: resolveComposeImageText(service.image.trim(), config.env) });
            }
        }
    }

    return [...services.values()];
}

/**
 * 把字节数格式化成人类易读文本。
 * 例如 1536 会显示为 1.5KB。
 */
function formatByteSize(value: number): string {
    // 无效数字、0 或负数都按 0B 展示，避免出现 NaNKB 这类日志。
    if (!Number.isFinite(value) || value <= 0) return '0B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;

    // 每除以 1024 就提升一个单位：B -> KB -> MB -> GB -> TB。
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    // 小于 10 的非 B 单位保留 1 位小数，例如 1.5KB；大数字取整，更便于扫读。
    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)}${units[unitIndex]}`;
}

/**
 * 把 Docker Compose JSON 事件格式化成一行日志。
 *
 * ` · ` 是一个中点分隔符，只用于终端阅读：
 * - 左边是事件来源，例如 layer id 或服务名。
 * - 中间是状态，例如 downloading/extracting。
 * - 右边是 current/total 进度，例如 12MB/40MB。
 */
function formatComposeProgressEvent(event: ComposeProgressEvent): string {
    // id 通常是 layer id，text 有时是 service/image；两个都没有时用 compose 兜底。
    const source = [event.id, event.text].filter(Boolean).join(' ') || 'compose';
    const status = event.status ?? '';

    // Docker Compose 不同版本可能把进度放在 progressDetail，也可能直接放 current/total。
    const current = event.progressDetail?.current ?? event.current;
    const total = event.progressDetail?.total ?? event.total;
    const progress =
        typeof current === 'number' && typeof total === 'number' && total > 0
            ? `${formatByteSize(current)}/${formatByteSize(total)}`
            : '';

    return [source, status, progress].filter(Boolean).join(' · ');
}

/**
 * 创建 Docker pull 进度追踪器。
 *
 * 返回值是一个函数，调用者把 stdout/stderr chunk 传进来，它会：
 * 1. 把 chunk 拼成完整行。
 * 2. 尝试把每行解析成 Docker Compose JSON 事件。
 * 3. 根据 service 完成数和 layer 字节数估算总进度。
 * 4. 写入终端日志区域。
 */
function createDockerPullProgressTracker(
    services: ComposeService[],
    context: DeployStepContext,
    terminalWriter: ReturnType<typeof createDeployTerminalLogWriter>
): (chunk: Buffer | string) => void {
    // 记录已经完成的 service，防止同一个 service 的多条事件重复推进进度。
    const completed = new Set<string>();

    // 记录每个 layer 的 downloaded/total，用来计算总下载比例。
    const layers = new Map<string, PullLayerProgress>();

    // 至少按 1 计算，避免 compose 文件里没有 image 时出现除以 0。
    const total = Math.max(1, services.length);

    // bestProgress 保证进度只前进不后退，因为 Docker 事件顺序并不总是严格递增。
    let bestProgress = 0;

    // activityProgress 是“有输出但没有精确进度”时使用的保守进度。
    let activityProgress = 0;

    // buffer 保存尚未形成完整行的 stdout/stderr 片段。
    let buffer = '';

    /**
     * 设置步骤进度。
     *
     * 这里最大只设置到 0.99，不直接到 1：
     * 只有 docker pull 进程真正退出成功后，runDockerComposePull 才会设置为 1。
     * 这样可以避免“进度条满了但命令还没结束”的误导。
     */
    const setProgress = (progress: number): void => {
        bestProgress = Math.max(bestProgress, Math.min(0.99, Math.max(0, progress)));
        context.setProgress(bestProgress);
    };

    /**
     * 根据事件文本判断某个 service 是否已经拉取完成。
     *
     * 正则里的 `\b` 是单词边界，避免把无关单词误判成 pulled/already exists。
     */
    const markService = (event: ComposeProgressEvent): boolean => {
        // 把 id/text/status 合并成小写文本，方便用 includes/正则做宽松匹配。
        const normalized = [event.id, event.text, event.status].filter(Boolean).join(' ').toLowerCase();
        let matched = false;

        for (const service of services) {
            // 已完成的 service 不重复处理。
            if (completed.has(service.name)) continue;
            const serviceName = service.name.toLowerCase();
            const imageName = service.image.toLowerCase();

            // 事件里必须出现 service name 或 image name，否则不能判断它属于哪个服务。
            if (!normalized.includes(serviceName) && !normalized.includes(imageName)) continue;

            // 只有明确完成类状态才标记完成；downloading/extracting 不算完成。
            if (!/\b(pulled|already exists|skipped|up to date|pull complete)\b/i.test(normalized)) continue;

            completed.add(service.name);
            matched = true;
        }

        if (matched) {
            // service 级进度 = 已完成服务数 / 总服务数。
            setProgress(completed.size / total);
        }

        return matched;
    };

    /**
     * 没有精确字节进度时，给进度条一个很小的“活动增量”。
     *
     * 这样用户至少能看到工具还在收到 Docker 输出，但不会让进度虚假地快速跑满。
     */
    const bumpActivity = (): void => {
        // 分母取 max(80, total*30)，服务越多，每次活动增量越小，防止虚假跑满。
        activityProgress = Math.min(0.94, activityProgress + 1 / Math.max(80, total * 30));

        // 取最大值，确保活动进度不会把精确进度拉低。
        setProgress(Math.max(bestProgress, completed.size / total, activityProgress));
    };

    /** 汇总所有可测量 layer 的下载比例。 */
    const layerAggregateProgress = (): number | null => {
        // 只有 total>0 的 layer 才能参与精确比例计算。
        const measurable = [...layers.values()].filter((layer) => layer.total > 0);
        if (!measurable.length) return null;

        // downloaded 不能超过 total，否则 Docker 某些异常事件会导致比例大于 1。
        const downloaded = measurable.reduce((sum, layer) => sum + Math.min(layer.downloaded, layer.total), 0);
        const size = measurable.reduce((sum, layer) => sum + layer.total, 0);
        if (size <= 0) return null;

        return downloaded / size;
    };

    /** 根据 layer 下载比例更新当前步骤进度。 */
    const setLayerAwareProgress = (): void => {
        const layerProgress = layerAggregateProgress();
        if (layerProgress === null) {
            // 没有字节进度时退回活动进度。
            bumpActivity();
            return;
        }

        // activeServiceProgress 表示已经完成的服务占比。
        const activeServiceProgress = completed.size / total;

        // 当前 layer 最多只推进一个服务的占比，且最多 0.95，避免单个 layer 让总体满格。
        const layerWeight = Math.min(0.95, 1 / total);
        setProgress(Math.max(activityProgress, activeServiceProgress + layerProgress * layerWeight));
    };

    /**
     * 追踪单个镜像 layer 的状态。
     *
     * layer id 通常是 12 位以上十六进制字符串，所以用 `/^[a-f0-9]{12,}$/i` 判断：
     * - `^` / `$` 要求整串匹配。
     * - `[a-f0-9]` 表示十六进制字符。
     * - `{12,}` 表示至少 12 个字符。
     * - `i` 表示忽略大小写。
     */
    const trackLayer = (event: ComposeProgressEvent): boolean => {
        const layerId = event.id;
        if (!layerId || !/^[a-f0-9]{12,}$/i.test(layerId)) return false;

        const status = (event.status ?? event.text ?? '').toLowerCase();
        const current = event.progressDetail?.current ?? event.current;
        const totalSize = event.progressDetail?.total ?? event.total;
        if (typeof current === 'number' && typeof totalSize === 'number' && totalSize > 0) {
            // extracting 阶段通常表示下载已经完成，只是在解压；这里按接近完成估算。
            const isExtracting = /\bextracting\b/i.test(status);
            layers.set(layerId, {
                downloaded: isExtracting ? Math.max(current, totalSize * 0.98) : current,
                total: totalSize
            });
            setLayerAwareProgress();
            return true;
        }

        if (/\b(pulling fs layer|waiting|downloading|extracting|verifying checksum)\b/i.test(status)) {
            if (!layers.has(layerId)) {
                // 先登记一个 total=0 的 layer，表示它存在但还没有可计算的字节总量。
                layers.set(layerId, { downloaded: 0, total: 0 });
            }
            setLayerAwareProgress();
            return true;
        }

        if (/\b(download complete|pull complete|already exists)\b/i.test(status)) {
            const existing = layers.get(layerId);
            if (existing?.total) {
                // 已知总量时，把 downloaded 补到 total，表示该 layer 已完成。
                layers.set(layerId, { ...existing, downloaded: existing.total });
                setLayerAwareProgress();
            } else {
                // 不知道总量时，用 1/1 表示完成，仍能参与聚合比例。
                layers.set(layerId, { downloaded: 1, total: 1 });
                setLayerAwareProgress();
            }
            return true;
        }

        return false;
    };

    /**
     * 处理一行 Docker Compose 输出。
     *
     * JSON 解析失败时不丢弃，而是作为普通文本写入日志；
     * 这样 Docker 版本差异或非 JSON 警告也能被用户看到。
     */
    const handleLine = (rawLine: string): void => {
        // Docker 输出可能带前后空白；空行没有信息，直接跳过。
        const line = rawLine.trim();
        if (!line) return;

        let event: ComposeProgressEvent;
        try {
            // JSON 输出模式下一行就是一个 ComposeProgressEvent。
            event = JSON.parse(line) as ComposeProgressEvent;
        } catch {
            // 非 JSON 行通常是警告或旧版本输出，仍然展示给用户。
            terminalWriter.line(line);
            return;
        }

        terminalWriter.line(formatComposeProgressEvent(event));
        if (markService(event)) return;
        if (trackLayer(event)) return;
        if (
            /\b(downloading|extracting|pulling|waiting|verifying|download complete|pull complete)\b/i.test(
                event.status ?? event.text ?? ''
            )
        ) {
            // 事件看起来和拉取有关，但既不是 service 完成，也不是可识别 layer，就推进活动进度。
            bumpActivity();
        }
    };

    /**
     * 处理 stdout/stderr chunk。
     *
     * Docker 可能用 `\r` 回车刷新同一行进度，这里统一替换成 `\n`，
     * 让每次刷新都能作为独立日志行展示。
     */
    return (chunk) => {
        // Buffer 按 utf8 解码；Docker CLI 输出本身就是文本。
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;

        // `\r` 常用于“回到行首刷新进度”，这里转成换行，方便日志保留每次状态变化。
        buffer += text.replace(/\r/g, '\n');
        const lines = buffer.split('\n');

        // 最后一段可能还没遇到换行，留到下一次 chunk 再处理。
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            handleLine(line);
        }
    };
}

/**
 * 执行 Docker Compose 镜像拉取。
 *
 * 逻辑说明：
 * 1. 先读取 compose 文件里的服务镜像，便于后续估算进度。
 * 2. 使用 `--progress json` 请求 Docker 输出机器可解析的进度。
 * 3. stdout/stderr 同时接入日志和进度追踪器。
 * 4. 如果 45 秒没有任何输出，就写一条等待提示，并轻微推进进度条。
 * 5. 命令成功退出后才把步骤进度设为 1。
 */
export async function runDockerComposePull(config: DeployConfig, context: DeployStepContext): Promise<void> {
    // 从 compose 文件读取服务和镜像，用于日志展示和进度估算。
    const services = await readComposeServices(config);
    await logDeployMessage(
        config,
        'docker pull',
        `准备拉取 ${services.length} 个 compose 镜像: ${services.map((service) => `${service.name}=${service.image}`).join(', ')}`
    );

    // 生成 `docker compose pull` 参数，并要求 Compose 输出 JSON 进度。
    const pullArgs = composeArgs(config, ['pull'], { progress: 'json' });

    // terminalWriter 把 Docker 输出整理成按行显示的终端日志。
    const terminalWriter = createDeployTerminalLogWriter('docker pull');

    // trackPullOutput 会解析 Docker 输出并上报步骤进度。
    const trackPullOutput = createDockerPullProgressTracker(services, context, terminalWriter);

    // lastOutputAt 用来判断 Docker 是否长时间没有输出。
    let lastOutputAt = Date.now();
    let quietNoticeCount = 0;

    // commandLine 只用于日志展示，不用于执行。
    const commandLine = ['docker', ...pullArgs].map(shellQuote).join(' ');
    writeDeployRuntimeEntryToTerminal(
        writeDeployRuntimeLog(config, 'docker pull', `执行命令: ${commandLine}`, {
            command: 'docker',
            services: services.map((service) => ({
                image: service.image,
                name: service.name
            }))
        })
    );

    // 这里直接使用 execa，是因为 docker pull 需要自定义解析 stdout/stderr 来更新进度。
    const subprocess = execa('docker', pullArgs, {
        cwd: config.targetDockerDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
            ...composeEnv(config),
            COMPOSE_PROGRESS: 'json'
        }
    });

    const handleOutput = (chunk: Buffer | string): void => {
        // 只要收到任意输出，就刷新最近活动时间，避免误报“长时间无输出”。
        lastOutputAt = Date.now();

        // 原始输出写入运行日志，方便排查 Docker CLI 的真实返回。
        writeDeployRuntimeOutput(config, 'docker pull', Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk);

        // 同一份输出交给进度追踪器，转换成 UI 进度。
        trackPullOutput(chunk);
    };

    // Docker 镜像层较大时可能很久没有 stdout/stderr；定时提示可以减少“卡死”的误判。
    const quietNotice = setInterval(() => {
        if (Date.now() - lastOutputAt < dockerPullQuietNoticeMs) return;

        quietNoticeCount++;
        // 这里最多推进到 0.97，仍然把最终 1.0 留给命令成功退出。
        context.setProgress(Math.min(0.97, 0.75 + quietNoticeCount * 0.02));
        writeDeployRuntimeEntryToTerminal(
            writeDeployRuntimeLog(config, 'docker pull', 'Docker pull 等待镜像层输出超时提示', {
                quietNoticeCount
            })
        );
        // 写完提示后重置时间，下一次提示至少再等 45 秒。
        lastOutputAt = Date.now();
    }, 5_000);

    // stdout 和 stderr 都可能包含 Docker 进度事件，所以两者都接入同一个 handler。
    subprocess.stdout?.on('data', handleOutput);
    subprocess.stderr?.on('data', handleOutput);

    try {
        // 等待 docker compose pull 进程结束；非 0 退出码会进入 catch。
        await subprocess;
        context.setProgress(1);
        writeDeployRuntimeEntryToTerminal(
            writeDeployRuntimeLog(config, 'docker pull', 'Docker image pull completed successfully')
        );
    } catch (error) {
        // 失败时写结构化错误日志，并把完整命令行放进上下文，方便部署人员复现。
        writeDeployRuntimeEntryToTerminal(
            writeDeployRuntimeErrorLog(config, 'docker pull', 'Docker 镜像拉取失败', error, {
                commandLine
            })
        );
        throw new Error(`Docker 镜像拉取失败，详见部署运行日志：${deployLogLocationText(config)}`);
    } finally {
        // 不管成功失败都要清掉 interval，避免 Node 进程因为定时器还活着无法退出。
        clearInterval(quietNotice);

        // flush 最后一段未换行输出，避免 Docker 最后一行日志丢失。
        terminalWriter.flush();
    }
}
