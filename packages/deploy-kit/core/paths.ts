import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 文件作用：
 * 这里集中计算 deploy-kit 运行时资源的位置。
 *
 * deploy-kit 有两种运行形态：
 * 1. 在源码仓库内通过 `tsx cli/index.ts` 运行，此时当前文件在 `packages/deploy-kit/core/paths.ts`。
 * 2. 被 tsup 打包后通过 `deploy_script/index.js` 运行，此时资源目录会被复制到打包输出目录旁边。
 *
 * 所以不要在业务代码里硬编码 `packages/deploy-kit/...`。
 * 所有需要找 `runtime/docker`、`runtime/prisma`、Logo 动画资源的地方，都应该从这里取路径。
 */

const __filename = fileURLToPath(import.meta.url);

// `import.meta.url` 是 file:// URL，不是普通文件路径；
// fileURLToPath 会把它转换成当前操作系统能识别的路径。
const __dirname = nodePath.dirname(__filename);

/**
 * 源码运行时 `__dirname` 结尾是 `core`，资源根目录要回到上一层。
 * 打包运行时入口文件和资源目录在同一层，`__dirname` 本身就是资源根目录。
 */
const runningFromSource = nodePath.basename(__dirname) === 'core';

const sourceRoot = runningFromSource ? nodePath.dirname(__dirname) : __dirname;

/** deploy-kit 资源根目录，下面包含 assets、runtime、cli 等目录。 */
export const deployToolRoot = sourceRoot;

/** Docker Compose 模板、Grafana/Loki/Promtail/Cerbos 配置模板所在目录。 */
export const runtimeDockerDir = nodePath.join(deployToolRoot, 'runtime', 'docker');

/** Prisma schema 模板所在目录，用于部署时执行 `prisma db push`。 */
export const runtimePrismaDir = nodePath.join(deployToolRoot, 'runtime', 'prisma');

/**
 * 开源版初始化 SQL 所在目录。
 *
 * 源码运行时直接指向仓库根目录的 `database/seeds/open-source`，这样业务项目和 deploy-kit 复用同一份 SQL。
 * 打包运行时指向 `deploy_script/runtime/seed-sql`，这些文件由 tsup 成功构建后从同一份源码 SQL 复制进去，
 * 后续 release 脚本会把整个 deploy_script 压缩编码进单文件部署脚本。
 */
export const runtimeSeedSqlDir = runningFromSource
    ? nodePath.join(deployToolRoot, '..', '..', 'database', 'seeds', 'open-source')
    : nodePath.join(deployToolRoot, 'runtime', 'seed-sql');

/**
 * SpiceDB schema 文件路径。
 *
 * 源码运行时直接读取仓库根目录的 `spicedb/schema.zed`，避免 deploy-kit 和项目各维护一份 schema。
 * 打包运行时读取 `deploy_script/runtime/spicedb/schema.zed`，该文件由 tsup 构建成功后从同一份源码 schema 复制过去，
 * 后续 release 脚本会把它压缩编码进单文件部署脚本。
 */
export const runtimeSpiceDbSchemaPath = runningFromSource
    ? nodePath.join(deployToolRoot, '..', '..', 'spicedb', 'schema.zed')
    : nodePath.join(deployToolRoot, 'runtime', 'spicedb', 'schema.zed');

/** 终端顶部 Logo 动画帧文件，UI 启动时会读取它渲染动效。 */
export const deployHeaderLogoPath = nodePath.join(deployToolRoot, 'assets', 'deploy-header-keyframes.json');
