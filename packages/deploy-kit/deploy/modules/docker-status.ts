import { execa } from 'execa';

import type { DeployConfig, DockerContainerStatus } from '../../core/types.ts';
import { writeDeployRuntimeErrorLog } from '../../logging/deploy-logger.ts';
import { composeArgs, composeEnv } from './docker-compose.ts';

/**
 * 文件作用：
 * 这个模块负责在部署结束后读取 Docker Compose 容器状态，并转换成 UI 表格可展示的数据。
 *
 * 它不会影响部署结果：
 * - 状态读取成功：展示真实容器状态。
 * - 状态读取失败：返回一行 unknown，并把错误写入部署日志。
 */

type DockerComposePsRecord = {
    Health?: string;
    Name?: string;
    Names?: string;
    Ports?: string;
    Publishers?: Array<{
        PublishedPort?: number;
        Protocol?: string;
        TargetPort?: number;
        URL?: string;
    }>;
    Service?: string;
    State?: string;
    Status?: string;
};

/**
 * 解析 `docker compose ps --format json` 输出。
 *
 * Docker/Compose 版本不同，JSON 输出可能是：
 * - 一个 JSON 数组。
 * - 单个 JSON 对象。
 * - 多行 JSON，每行一个对象。
 *
 * 所以这里先按整体 JSON 尝试解析，失败后再按行解析。
 */
function parseDockerComposePsOutput(output: string): DockerComposePsRecord[] {
    // 先去掉首尾空白；空输出通常表示当前 compose 项目没有容器。
    const trimmed = output.trim();
    if (!trimmed) return [];

    try {
        // 优先按整体 JSON 解析，适配返回数组或单对象的 Compose 版本。
        const parsed = JSON.parse(trimmed) as DockerComposePsRecord | DockerComposePsRecord[];
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        // 有些 Compose 版本是一行一个 JSON 对象，所以整体解析失败后再逐行解析。
        return trimmed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .flatMap((line) => {
                try {
                    // 单行解析失败就跳过，避免一条非 JSON 警告导致整个状态读取失败。
                    return [JSON.parse(line) as DockerComposePsRecord];
                } catch {
                    return [];
                }
            });
    }
}

/**
 * 格式化端口映射。
 *
 * Docker JSON 里可能直接给 `Ports` 字符串，也可能给 `Publishers` 数组。
 * `host:published->target/protocol` 表示：
 * - host/published：宿主机监听地址和端口。
 * - target/protocol：容器内端口和协议。
 */
function formatDockerPublishers(record: DockerComposePsRecord): string {
    // 如果 Docker 已经给了可读的 Ports 字符串，直接使用它。
    if (record.Ports) return record.Ports;

    const publishers = record.Publishers ?? [];
    if (!publishers.length) return '-';

    return publishers
        .map((publisher) => {
            // Protocol 缺省时按 tcp 展示，这是 Docker 端口映射最常见协议。
            const protocol = publisher.Protocol ?? 'tcp';

            // TargetPort 是容器内端口；没有 TargetPort 时只能显示协议名。
            const target = publisher.TargetPort ? `${publisher.TargetPort}/${protocol}` : protocol;
            if (!publisher.PublishedPort) return target;

            // URL 是宿主机绑定地址；没有时用 0.0.0.0 表示监听所有地址。
            const host = publisher.URL || '0.0.0.0';
            return `${host}:${publisher.PublishedPort}->${target}`;
        })
        .join(', ');
}

/** 把 Docker 原始状态对象转换成 deploy-kit 的稳定展示结构。 */
function normalizeDockerContainerStatus(record: DockerComposePsRecord): DockerContainerStatus {
    // State 是 running/exited 等粗状态；没有时用 '-'，让表格列稳定。
    const state = record.State || '-';

    // Health 可能是 healthy/unhealthy；如果和 state 不同，就附加到 status 中。
    const health = record.Health && record.Health !== state ? ` / ${record.Health}` : '';

    return {
        name: record.Name || record.Names || '-',
        ports: formatDockerPublishers(record),
        service: record.Service || '-',
        state,
        status: record.Status || `${state}${health}` || '-'
    };
}

/**
 * 读取当前 Compose 项目的容器状态。
 *
 * `--all` 会包含已停止容器，便于用户看到启动失败或退出的服务。
 * `timeout: 30_000` 表示最多等 30 秒，避免状态读取卡住整个 CLI。
 */
export async function readDockerContainerStatuses(config: DeployConfig): Promise<DockerContainerStatus[]> {
    try {
        // --format json 让输出可解析；--all 显示 stopped/exited 容器。
        const result = await execa('docker', composeArgs(config, ['ps', '--all', '--format', 'json']), {
            cwd: config.targetDockerDir,
            env: composeEnv(config),
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 30_000
        });
        // stdout 解析成 DockerComposePsRecord，再转换成 UI 表格使用的 DockerContainerStatus。
        const records = parseDockerComposePsOutput(result.stdout);
        return records.map(normalizeDockerContainerStatus);
    } catch (error) {
        // 状态读取失败不抛给上层，因为部署命令可能已经成功；这里返回 unknown 让用户看到问题。
        const message = error instanceof Error ? error.message : String(error);
        writeDeployRuntimeErrorLog(config, 'docker compose ps', '读取 Docker 容器状态失败', error);

        return [
            {
                name: 'docker compose ps',
                ports: '-',
                service: '-',
                state: 'unknown',
                status: message
            }
        ];
    }
}
