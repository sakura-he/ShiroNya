import fs from 'fs-extra';
import nodePath from 'node:path';
import YAML from 'yaml';

import type { DeployConfig } from '../../core/types.ts';
import { ensureDeploymentCertificates } from './certificates.ts';
import { logDeployMessage } from './command.ts';
import { ensureRuntimeDirs, writeApplicationEnvFiles } from './env-files.ts';

/**
 * 文件作用：
 * 这个模块负责把 deploy-kit 自带的运行时资产复制到用户选择的部署目录。
 *
 * “运行时资产”包括：
 * - `compose.yaml`：Docker Compose 基础编排文件。
 * - `config/`：Promtail、Loki、Grafana、Cerbos、Redis、PostgreSQL 等配置模板。
 * - `compose.generated.yaml`：根据用户部署目录生成的 override 文件。
 *
 * 注意：这里生成的是部署目录里的文件，不是修改仓库源码。
 */

/**
 * 复制 Docker Compose 和配置目录。
 *
 * 逻辑说明：
 * 1. 确保目标 docker 目录存在。
 * 2. 复制内置 `runtime/docker/compose.yaml` 到目标目录。
 * 3. 复制内置 `runtime/docker/config` 到目标目录。
 * 4. 过滤 `.DS_Store`，因为它是 macOS Finder 自动生成的无意义文件。
 */
export async function copyDockerConfig(config: DeployConfig): Promise<void> {
    // 目标 docker 目录不存在时先创建；存在时不会清空，避免误删用户已有数据。
    await fs.ensureDir(config.targetDockerDir);

    // source* 是 deploy-kit 内置模板路径，target* 是用户机器上的真实部署路径。
    const sourceCompose = nodePath.join(config.runtimeDockerDir, 'compose.yaml');
    const targetCompose = nodePath.join(config.targetDockerDir, 'compose.yaml');
    const sourceConfig = nodePath.join(config.runtimeDockerDir, 'config');
    const targetConfig = nodePath.join(config.targetDockerDir, 'config');

    // 基础 compose 文件每次复制，保证部署目录拿到当前版本的服务编排定义。
    await fs.copy(sourceCompose, targetCompose);
    await logDeployMessage(config, 'docker config', `复制 compose.yaml: ${sourceCompose} -> ${targetCompose}`);

    await fs.copy(sourceConfig, targetConfig, {
        // overwrite=true 表示同名配置文件会被模板覆盖；运行时数据不放在 config 模板目录里。
        overwrite: true,
        filter(source) {
            const basename = nodePath.basename(source);
            // `.DS_Store` 是 macOS Finder 元数据文件，不参与服务配置，复制过去只会污染部署目录。
            return basename !== '.DS_Store';
        }
    });
    await logDeployMessage(config, 'docker config', `复制配置目录: ${sourceConfig} -> ${targetConfig}`);
}

/**
 * 把本机路径转成 Docker Compose 更容易识别的路径格式。
 *
 * Windows 路径默认使用反斜杠 `\`，例如 `C:\shiro-nya\logs`。
 * Docker Compose 的 volume 写法更推荐正斜杠 `/`，所以这里统一替换成 `C:/shiro-nya/logs`。
 *
 * 正则 `/\\/g` 说明：
 * - 外层 `/.../g` 是 JavaScript 正则字面量，`g` 表示全局替换。
 * - `\\` 在正则里表示匹配一个反斜杠。
 * - 因为反斜杠本身是转义字符，所以看起来会有两个。
 */
function normalizeDockerPath(input: string): string {
    // nodePath.resolve 会把相对路径变成绝对路径，同时消除 `..`、`.` 等路径片段。
    return nodePath.resolve(input).replace(/\\/g, '/');
}

/**
 * 生成 Docker Compose override 文件内容。
 *
 * 基础 compose 文件不应该写死用户机器上的绝对目录，所以这里根据 targetRoot 动态生成挂载路径。
 *
 * volume 里的特殊写法说明：
 * - `宿主机路径:容器内路径`：把宿主机目录挂载进容器。
 * - 末尾的 `:ro` 表示 read-only，只读挂载；容器可以读取配置，但不能改宿主机文件。
 * - `./config/...` 是相对 `targetDockerDir` 的路径，因为 docker compose 执行时指定了 project directory。
 */
function generatedComposeOverride(config: DeployConfig): string {
    // root 是用户选择的部署根目录，所有宿主机挂载目录都从这里派生。
    const root = config.targetRoot;

    // Loki 日志目录单独挂载给 Promtail 和两个 API，便于统一采集应用日志。
    const logs = normalizeDockerPath(nodePath.join(root, 'logs', 'loki'));

    // admin-api/app-api 的 static、uploads、chunks、merge、logs 需要持久化到宿主机。
    const shiroAdmin = normalizeDockerPath(nodePath.join(root, 'admin-api'));
    const appApp = normalizeDockerPath(nodePath.join(root, 'app-api'));

    // YAML.stringify 把 JS 对象转换成 YAML 文本，避免手写 YAML 缩进出错。
    return YAML.stringify({
        services: {
            'promtail': {
                volumes: [
                    // 只读挂载 Promtail 主配置，容器只能读取，不能改宿主机配置。
                    './config/promtail/promtail-config.yaml:/etc/promtail/config.yaml:ro',
                    // named volume 保存 Promtail 读取位置，避免重启后重复采集已读日志。
                    'promtail-positions:/positions',
                    // Loki TLS 证书只读挂载给 Promtail，用于日志推送链路。
                    './config/loki/tls:/etc/promtail/certs:ro',
                    // Cerbos audit logs 是 Docker volume，只读挂给 Promtail 采集。
                    'app-api-cerbos-audit-logs:/audit_logs:ro',
                    // 应用 Loki 日志目录来自宿主机，多个服务写入同一个日志根目录。
                    `${logs}:/shiro-nya_logs:ro`
                ]
            },
            'admin-api': {
                volumes: [
                    // 左侧是宿主机目录，右侧是容器目录；容器重建后宿主机数据仍保留。
                    `${shiroAdmin}/static:/app/static`,
                    `${shiroAdmin}/uploads:/app/uploads`,
                    `${shiroAdmin}/chunks:/app/chunks`,
                    `${shiroAdmin}/merge:/app/merge`,
                    `${shiroAdmin}/logs:/app/logs`,
                    `${logs}:/var/log/shiro-nya/loki`,
                    // env 文件只读挂载，避免应用容器运行时改写部署配置。
                    './config/admin-api/.env.production:/app/.env.production:ro',
                    // gRPC 和 Cerbos 证书目录都只读挂载，私钥由宿主部署目录统一管理。
                    './config/app-user-admin-grpc/tls:/app/certs/app-user-admin-grpc:ro',
                    './config/app-api-cerbos/tls:/app/certs/app-cerbos-tls:ro',
                    './config/admin-api-cerbos/tls:/app/certs/cerbos-admin/tls:ro'
                ]
            },
            'app-api': {
                volumes: [
                    // app-api 与 admin-api 使用同样的持久化目录结构，便于部署人员排查。
                    `${appApp}/static:/app/static`,
                    `${appApp}/uploads:/app/uploads`,
                    `${appApp}/chunks:/app/chunks`,
                    `${appApp}/merge:/app/merge`,
                    `${appApp}/logs:/app/logs`,
                    `${logs}:/var/log/shiro-nya/loki`,
                    // app-api 读取自己的生产环境文件。
                    './config/app-api/.env.production:/app/.env.production:ro',
                    './config/app-user-admin-grpc/tls:/app/certs/app-user-admin-grpc:ro',
                    './config/app-api-cerbos/tls:/app/certs/app-cerbos-tls:ro',
                    './config/admin-api-cerbos/tls:/app/certs/cerbos-admin/tls:ro'
                ]
            }
        }
    });
}

/**
 * 写入 `compose.generated.yaml` 并追加到 Compose 文件列表。
 *
 * `config.composeFiles` 的顺序很重要：
 * - 先读基础 `compose.yaml`。
 * - 再读 `compose.generated.yaml`。
 * 后面的文件会覆盖/补充前面的服务配置，这正是 override 的用途。
 */
export async function writeGeneratedComposeOverride(config: DeployConfig): Promise<void> {
    // generated override 放在目标 docker 目录，和基础 compose.yaml 放在一起，方便人工检查。
    const overridePath = nodePath.join(config.targetDockerDir, 'compose.generated.yaml');

    // 这里直接覆盖旧 generated 文件，因为它完全由当前配置生成，不需要人工维护。
    await fs.writeFile(overridePath, generatedComposeOverride(config), 'utf8');
    if (!config.composeFiles.includes(overridePath)) {
        // 追加到 composeFiles 末尾，确保它覆盖基础 compose 文件里的默认挂载配置。
        config.composeFiles.push(overridePath);
    }
    await logDeployMessage(config, 'docker config', `写入 compose override: ${overridePath}`);
}

/**
 * 准备部署所需的全部文件资产。
 *
 * 这个函数被 orchestrator 作为一个步骤调用。
 * 它内部按顺序完成：
 * 1. 复制 Docker 模板配置。
 * 2. 创建应用运行目录。
 * 3. 写入 admin-api/app-api 的 `.env.production`。
 * 4. 确保证书存在。
 * 5. 写入 compose override。
 */
export async function prepareDeploymentAssets(config: DeployConfig): Promise<void> {
    // 第一步先把基础 Docker 文件放到目标目录，后续证书/env 都会写到这个目录下的 config 子目录。
    await copyDockerConfig(config);

    // 创建应用运行目录，避免 Docker 启动时因为宿主机目录不存在而自动创建出权限不合适的目录。
    await ensureRuntimeDirs(config);

    // 写应用容器读取的 .env.production。这里 useImageDefaults=false，只使用部署配置生成。
    await writeApplicationEnvFiles(config);

    // 证书生成依赖目标 docker/config 目录，所以必须在 copyDockerConfig 之后执行。
    await ensureDeploymentCertificates(config, (source, message) => logDeployMessage(config, source, message));

    // 最后写 generated override，因为它引用了前面准备好的目标目录结构。
    await writeGeneratedComposeOverride(config);
}
