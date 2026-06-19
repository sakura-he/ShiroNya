import { execa } from 'execa';

import type { DeployConfig } from '../../core/types.ts';
import { commandExists, logDeployMessage, resolvePrismaCliCommand } from './command.ts';

/**
 * 文件作用：
 * 这个模块负责部署前置条件检查。
 *
 * 检查目标：
 * - Docker CLI 是否可执行。
 * - Docker Compose 子命令是否可执行。
 * - Prisma CLI 是否可执行。
 * - Docker daemon 是否正在运行且当前终端能连接。
 */

/**
 * 检查 Docker daemon 是否可连接。
 *
 * `docker --version` 只能证明 Docker CLI 存在；
 * `docker info` 才能证明 Docker 服务端/桌面运行时已经启动。
 */
export async function ensureDockerDaemon(config?: DeployConfig): Promise<void> {
    try {
        // --format '{{.ServerVersion}}' 只取服务端版本，减少输出噪音。
        await execa('docker', ['info', '--format', '{{.ServerVersion}}'], { stdout: 'ignore', stderr: 'ignore' });
        if (config) await logDeployMessage(config, 'docker daemon', 'docker info 检查通过');
    } catch {
        const message = [
            'Docker daemon 未运行或当前终端无法连接 Docker。',
            '请先启动 Docker 运行时，并确认当前终端能执行 docker info。'
        ];

        // 如果已经有 DeployConfig，就把失败原因也写入部署日志。
        if (config) await logDeployMessage(config, 'docker daemon', message.join('\n'));
        throw new Error(message.join('\n'));
    }
}

/**
 * 检查部署所需命令是否齐全。
 *
 * 这里先收集 missing 列表，最后一次性报错；
 * 这样用户能一次看到缺哪些依赖，而不是修一个再跑一次才看到下一个。
 */
export async function ensureDeployPrerequisites(config: DeployConfig): Promise<void> {
    const missing: string[] = [];

    // 检查 Docker CLI 本体。
    const dockerReady = await commandExists('docker', ['--version']);
    await logDeployMessage(config, 'deps', `${dockerReady ? 'OK' : 'MISSING'} docker`);
    if (!dockerReady) missing.push('docker');

    // 检查 Docker Compose v2 子命令。
    const composeReady = await commandExists('docker', ['compose', 'version']);
    await logDeployMessage(config, 'deps', `${composeReady ? 'OK' : 'MISSING'} docker compose`);
    if (!composeReady) missing.push('docker compose');

    // Prisma CLI 可能来自 npx、PATH、本地 node_modules 或 pnpm exec。
    const prisma = await resolvePrismaCliCommand();
    await logDeployMessage(config, 'deps', `${prisma ? 'OK' : 'MISSING'} prisma CLI`);
    if (prisma) {
        await logDeployMessage(config, 'deps', `Prisma CLI: ${prisma.label}`);
    } else {
        missing.push('prisma CLI');
    }

    if (missing.length > 0) {
        // join(', ') 把缺失项拼成适合用户阅读的一行。
        throw new Error(`缺少依赖：${missing.join(', ')}`);
    }

    // CLI 都存在后，再检查 Docker daemon；daemon 不运行时 compose 仍然无法部署。
    await ensureDockerDaemon(config);
}
