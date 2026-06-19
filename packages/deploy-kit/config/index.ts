import { cancel } from '@clack/prompts';
import { randomBytes } from 'node:crypto';
import nodePath from 'node:path';

import {
    PromptBackRequested,
    PromptCancelled,
    clearPromptFlowState,
    closeConfigPromptSession,
    setPromptFlowState,
    promptConfirm,
    promptNonEmpty,
    promptPassword,
    promptSelect
} from '../ui/ink-prompts.ts';
import { runtimeDockerDir, runtimePrismaDir, runtimeSeedSqlDir, runtimeSpiceDbSchemaPath } from '../core/paths.ts';
import type { DeployConfig, GhcrMode, SecretMode } from '../core/types.ts';
import { shiroNyaAppImageRegistry, shiroNyaAppImageTag } from '../deploy/modules/constants.ts';

/**
 * 文件作用：
 * 这个文件负责“部署配置向导”。
 *
 * 用户运行部署工具后，会先经过这里的一系列问题：
 * - 部署根目录放在哪里。
 * - 密码和密钥自动生成还是手动输入。
 * - PostgreSQL / Redis / MongoDB / SpiceDB / Grafana 使用什么账号和密码。
 * - 是否登录 GHCR。
 * - 生成配置后是否立即执行 Docker Compose 部署。
 *
 * 这个文件只负责收集和整理配置，不直接启动 Docker，不直接写文件。
 * 真正写文件和执行命令的动作在 deploy/modules 目录里。
 */

const appImageRegistryHost = 'ghcr.io';

/**
 * 向导过程中的“临时答案”。
 *
 * 这里每个字段都是可选的，因为用户是一步一步回答问题；
 * 在 buildConfig 阶段才会用 ensureRequired 检查必填字段是否齐全。
 */
type DeployAnswers = {
    targetRoot?: string;
    secretMode?: SecretMode;
    redpandaOutsideHost?: string;
    certServerIpsInput?: string;
    adminApiPort?: string;
    appApiPort?: string;
    adminWebPort?: string;
    grafanaPort?: string;
    adminWebPublicOrigin?: string;
    adminApiPublicOrigin?: string;
    appApiPublicOrigin?: string;
    postgresUser?: string;
    postgresPassword?: string;
    postgresDb?: string;
    adminPostgresDb?: string;
    appPostgresDb?: string;
    adminRedisUser?: string;
    adminRedisPassword?: string;
    adminRedisPort?: string;
    appRedisUser?: string;
    appRedisPassword?: string;
    appRedisPort?: string;
    mongoUser?: string;
    mongoPassword?: string;
    mongoDb?: string;
    spicedbPostgresUser?: string;
    spicedbPostgresPassword?: string;
    spicedbPostgresDb?: string;
    spicedbGrpcPresharedKey?: string;
    adminBetterAuthSecret?: string;
    appBetterAuthSecret?: string;
    jwtSigningKey?: string;
    timezone?: string;
    ghcrMode?: GhcrMode;
    ghcrUsername?: string;
    ghcrToken?: string;
    deployNow?: boolean;
};

/** 单个向导步骤拿到的上下文。allowBack 表示当前步骤是否允许返回上一步。 */
type WizardContext = {
    allowBack: boolean;
};

/**
 * 一个向导步骤。
 *
 * canRun：
 * - 控制这个步骤是否需要执行。
 * - 例如只有 ghcrMode=login 时才询问 GHCR 用户名/token。
 *
 * isInteractive：
 * - 控制这个步骤是否算作 UI 进度里的“交互步骤”。
 * - 自动生成密码时，相关步骤会执行但不需要用户输入，所以不计入可见步骤数。
 */
type WizardStep = {
    canRun?: (answers: DeployAnswers) => boolean;
    isInteractive?: (answers: DeployAnswers) => boolean;
    run: (context: WizardContext) => Promise<void>;
};

/**
 * 生成写入 env 的随机 secret 字符串。
 *
 * 这里生成的是数据库密码、Redis 密码、Better Auth secret、JWT signing key 这类“文本密钥”。
 * 它不是 TLS 私钥，也不负责生成证书；TLS 证书和 RSA 私钥在 certificates.ts 中交给 node-forge 生成。
 *
 * base64url 不包含 `+`、`/`、`=`，放进 env、URL、Docker Compose 参数时更不容易被误解析。
 */
function generateRandomSecretString(bytes = 24): string {
    return randomBytes(bytes).toString('base64url');
}

/**
 * 生成写入 env 的十六进制随机 token。
 *
 * 当前用于 SpiceDB preshared key。它同样只是共享 token，不是 TLS 私钥。
 */
function generateRandomHexToken(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
}

/** Windows 默认部署目录。SystemDrive 通常是 `C:`，没有时用 `C:` 兜底。 */
function defaultWindowsRoot(): string {
    const systemDrive = process.env.SystemDrive ?? process.env.SYSTEMDRIVE ?? 'C:';
    // `${systemDrive}\\` 里的双反斜杠表示一个 Windows 路径分隔符。
    return nodePath.join(`${systemDrive}\\`, 'shiro-nya');
}

/** 根据当前操作系统选择默认部署根目录。 */
function defaultRoot(): string {
    return process.platform === 'win32' ? defaultWindowsRoot() : '/opt/shiro-nya';
}

/**
 * 把用户输入的“公开访问网址/主机”规范化成 URL origin。
 *
 * 输入规则：
 * - `localhost` / `127.0.0.1` 这类不带协议的主机，会按 HTTP 加上对应服务端口。
 * - `https://admin.example.com` 这类完整 URL，会保留协议、域名和显式端口。
 * - 不允许在这里输入 `/admin`、`/app` 之类路径；这些服务路径属于应用代码约定，不由部署脚本配置。
 */
function normalizePublicOrigin(input: string, fallbackPort: string, name: string): string {
    const trimmed = input.trim().replace(/\/+$/, '');
    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    const rawUrl = hasProtocol ? trimmed : `http://${trimmed}`;

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error(`${name} 不是有效的网址或主机：${input}`);
    }

    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${name} 只能填写协议、主机和端口，不能包含路径、查询参数或 hash：${input}`);
    }

    if (!hasProtocol && !url.port) {
        url.port = fallbackPort;
    }

    return url.origin;
}

/**
 * 必填值检查。
 *
 * TypeScript 层面 DeployAnswers 字段是可选的；
 * buildConfig 需要把它们变成 DeployConfig 的必填字段，所以必须在运行时检查。
 */
function ensureRequired<T>(value: T | undefined, name: string): T {
    if (value === undefined) {
        throw new Error(`部署配置缺少 ${name}`);
    }
    return value;
}

/**
 * 根据密钥模式决定“自动生成密码”还是“询问用户输入密码”。
 *
 * answers.secretMode=auto：
 * - 调用 fallback 生成随机值。
 *
 * answers.secretMode=manual：
 * - 调用 promptPassword，用户输入时终端不会明文显示。
 */
async function promptPasswordOrGenerate(
    answers: DeployAnswers,
    key: keyof DeployAnswers,
    message: string,
    fallback: () => string,
    allowBack: boolean
): Promise<void> {
    if (answers.secretMode === 'auto') {
        // `as never` 是为了把 keyof DeployAnswers 对应的动态字段赋值给具体 key。
        answers[key] = fallback() as never;
        return;
    }

    // 手动模式下，密码类输入统一走 promptPassword。
    answers[key] = (await promptPassword(message, allowBack)) as never;
}

/** 判断当前是否需要用户手动输入密钥。 */
function isManualSecretMode(answers: DeployAnswers): boolean {
    return answers.secretMode !== 'auto';
}

function previousRunnableStep(steps: WizardStep[], answers: DeployAnswers, fromIndex: number): number | null {
    // 从当前步骤前一个位置开始向前找，跳过 canRun=false 的步骤。
    for (let index = fromIndex; index >= 0; index--) {
        if (!steps[index].canRun || steps[index].canRun(answers)) return index;
    }
    // 找不到可返回的步骤时返回 null，UI 就不会显示“返回”能力。
    return null;
}

function nextRunnableStep(steps: WizardStep[], answers: DeployAnswers, fromIndex: number): number {
    // 从 fromIndex 向后找第一个可执行步骤。
    for (let index = fromIndex; index < steps.length; index++) {
        if (!steps[index].canRun || steps[index].canRun(answers)) return index;
    }
    // 返回 steps.length 表示已经走到向导末尾。
    return steps.length;
}

function interactiveRunnableStepIndexes(steps: WizardStep[], answers: DeployAnswers): number[] {
    const indexes: number[] = [];
    for (let index = 0; index < steps.length; index++) {
        const step = steps[index];
        // canRun=false 的步骤不会执行，也不应该计入进度。
        const canRun = !step.canRun || step.canRun(answers);

        // isInteractive=false 的步骤是自动填值，不需要用户操作，也不计入可见进度。
        const isInteractive = !step.isInteractive || step.isInteractive(answers);
        if (canRun && isInteractive) indexes.push(index);
    }
    return indexes;
}

function currentPromptStepIndex(steps: WizardStep[], answers: DeployAnswers, currentIndex: number): number {
    // indexes 是所有“需要用户看到/操作”的步骤索引。
    const indexes = interactiveRunnableStepIndexes(steps, answers);
    const exactIndex = indexes.indexOf(currentIndex);
    if (exactIndex >= 0) return exactIndex;

    // 当前步骤如果是自动步骤，就用它前面已经出现过的交互步骤数量作为当前进度。
    const previousCount = indexes.filter((index) => index < currentIndex).length;
    return Math.max(0, previousCount);
}

function promptStepCount(steps: WizardStep[], answers: DeployAnswers): number {
    // 至少返回 1，防止 UI 显示 0/0。
    return Math.max(1, interactiveRunnableStepIndexes(steps, answers).length);
}

async function runWizard(steps: WizardStep[], answers: DeployAnswers): Promise<void> {
    // 从第一个可执行步骤开始；有些步骤可能因为 canRun=false 被跳过。
    let index = nextRunnableStep(steps, answers, 0);

    while (index < steps.length) {
        const step = steps[index];
        // previousIndex 决定当前步骤是否允许用户按返回键。
        const previousIndex = previousRunnableStep(steps, answers, index - 1);

        try {
            // 把当前步骤进度同步给 prompt UI，让用户看到“第几步/共几步”。
            setPromptFlowState({
                stepCount: promptStepCount(steps, answers),
                stepIndex: currentPromptStepIndex(steps, answers, index)
            });
            await step.run({ allowBack: previousIndex !== null });

            // 每个步骤结束都清理 prompt flow 状态，避免下一步沿用旧状态。
            clearPromptFlowState();
            index = nextRunnableStep(steps, answers, index + 1);
        } catch (error) {
            clearPromptFlowState();
            if (error instanceof PromptBackRequested) {
                // 用户请求返回上一步时，不把它当错误，而是把 index 移回 previousIndex。
                index = previousIndex ?? 0;
                continue;
            }
            throw error;
        }
    }
}

function createConfigSteps(answers: DeployAnswers): WizardStep[] {
    // 默认自动生成密码，适合第一次部署；用户可在第二步改成 manual。
    answers.secretMode ??= 'auto';

    // 默认跳过 GHCR 登录，适合镜像公开或用户已经提前 docker login 的环境。
    answers.ghcrMode ??= 'skip';

    return [
        {
            async run({ allowBack }) {
                // nodePath.resolve 把相对路径转成绝对路径，后续写文件/挂载目录都使用绝对路径。
                answers.targetRoot = nodePath.resolve(
                    await promptNonEmpty('部署根目录', answers.targetRoot ?? defaultRoot(), allowBack)
                );
            }
        },
        {
            async run({ allowBack }) {
                // secretMode 会影响后面所有密码步骤：auto 自动填值，manual 才显示密码输入框。
                answers.secretMode = await promptSelect(
                    '密钥和密码如何处理？',
                    answers.secretMode ?? 'auto',
                    [
                        { value: 'auto', label: '自动生成', hint: '推荐，新机器部署直接可用' },
                        { value: 'manual', label: '手动输入', hint: '用于复用既有凭据' }
                    ],
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // Redpanda 控制台或 Kafka advertised listener 需要宿主机/局域网可访问地址。
                answers.redpandaOutsideHost = await promptNonEmpty(
                    'Redpanda 局域网/宿主机访问地址',
                    answers.redpandaOutsideHost ?? '127.0.0.1',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                const redpandaOutsideHost = ensureRequired(answers.redpandaOutsideHost, 'redpandaOutsideHost');
                // SAN 是 Subject Alternative Name，TLS 客户端校验证书时会检查 IP/DNS 是否在 SAN 中。
                // 多个 IP 用英文逗号分隔，buildConfig 里会 split(',')。
                answers.certServerIpsInput = await promptNonEmpty(
                    '证书 SAN IP 列表（英文逗号分隔）',
                    answers.certServerIpsInput ??
                        process.env.SHIRO_NYA_CERT_SERVER_IPS ??
                        `127.0.0.1,${redpandaOutsideHost}`,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // admin-api 是后台管理接口服务；deploy 环境默认使用 57300，避免和本机开发端口 3000 冲突。
                answers.adminApiPort = await promptNonEmpty(
                    'Admin API HTTP 端口',
                    answers.adminApiPort ?? '57300',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // app-api 是应用侧接口服务；部署默认使用 57303，避开 Windows 常见的 2977-3076 动态保留端口段。
                answers.appApiPort = await promptNonEmpty(
                    'App API HTTP 端口',
                    answers.appApiPort ?? '57303',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // admin-web 是浏览器访问的后台前端入口；Better Auth trustedOrigins 和 CORS 会引用这个端口。
                answers.adminWebPort = await promptNonEmpty(
                    'Admin Web 宿主端口',
                    answers.adminWebPort ?? '57301',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // Grafana 默认宿主端口使用 57302，避开 Windows 常见的 3077-3176 动态保留端口段。
                // 容器内部仍然是 Grafana 官方默认 3000；这里问的是宿主机浏览器访问用的端口。
                answers.grafanaPort = await promptNonEmpty(
                    'Grafana 宿主端口',
                    answers.grafanaPort ?? '57302',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // 只填写公开访问来源，不填写 /admin 之类应用路径；路径由当前应用代码固定。
                answers.adminWebPublicOrigin = await promptNonEmpty(
                    'Admin Web 公开访问网址或主机',
                    answers.adminWebPublicOrigin ?? 'localhost',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // admin-api 的公开来源用于 Better Auth baseURL、CORS 和 admin-web 静态资源 API 地址。
                answers.adminApiPublicOrigin = await promptNonEmpty(
                    'Admin API 公开访问网址或主机',
                    answers.adminApiPublicOrigin ?? 'localhost',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // app-api 的公开来源用于 app-api Better Auth baseURL、trustedOrigins 和 CORS。
                answers.appApiPublicOrigin = await promptNonEmpty(
                    'App API 公开访问网址或主机',
                    answers.appApiPublicOrigin ?? 'localhost',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // PostgreSQL 主用户会拥有 admin/app 业务数据库。
                answers.postgresUser = await promptNonEmpty(
                    'PostgreSQL 用户名',
                    answers.postgresUser ?? 'shironeko',
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // auto 模式下这一步不显示给用户，直接生成随机 PostgreSQL 密码。
                await promptPasswordOrGenerate(
                    answers,
                    'postgresPassword',
                    'PostgreSQL 密码',
                    generateRandomSecretString,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // POSTGRES_DB 是 PostgreSQL 容器初始化时使用的默认库，不等同于 admin/app 业务库。
                answers.postgresDb = await promptNonEmpty(
                    'PostgreSQL 数据库名',
                    answers.postgresDb ?? 'app_db',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // admin-api 使用的业务库名。
                answers.adminPostgresDb = await promptNonEmpty(
                    'Admin PostgreSQL 数据库名',
                    answers.adminPostgresDb ?? 'admin_api_db',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // app-api 使用的业务库名。
                answers.appPostgresDb = await promptNonEmpty(
                    'App PostgreSQL 数据库名',
                    answers.appPostgresDb ?? 'app_api_db',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // Admin Redis ACL 用户，用于 admin-api 连接自己的 Redis 实例。
                answers.adminRedisUser = await promptNonEmpty(
                    'Admin Redis ACL 用户名',
                    answers.adminRedisUser ?? 'shironeko',
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // auto 模式下随机生成 Admin Redis 密码。
                await promptPasswordOrGenerate(
                    answers,
                    'adminRedisPassword',
                    'Admin Redis ACL 密码',
                    generateRandomSecretString,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // 宿主端口用于本机或调试工具访问 Admin Redis，容器内部端口由 compose 控制。
                answers.adminRedisPort = await promptNonEmpty(
                    'Admin Redis 宿主端口',
                    answers.adminRedisPort ?? '17379',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // App Redis ACL 用户，用于 app-api 连接自己的 Redis 实例。
                answers.appRedisUser = await promptNonEmpty(
                    'App Redis ACL 用户名',
                    answers.appRedisUser ?? 'shironeko',
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // auto 模式下随机生成 App Redis 密码。
                await promptPasswordOrGenerate(
                    answers,
                    'appRedisPassword',
                    'App Redis ACL 密码',
                    generateRandomSecretString,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // App Redis 映射到宿主机的端口，默认和 Admin Redis 分开。
                answers.appRedisPort = await promptNonEmpty(
                    'App Redis 宿主端口',
                    answers.appRedisPort ?? '26379',
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // MongoDB root 用户名；如果数据卷已存在，mongodb-sync 会同步该用户密码。
                answers.mongoUser = await promptNonEmpty('MongoDB 用户名', answers.mongoUser ?? 'shironeko', allowBack);
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // auto 模式下随机生成 MongoDB root 密码。
                await promptPasswordOrGenerate(
                    answers,
                    'mongoPassword',
                    'MongoDB 密码',
                    generateRandomSecretString,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // app-api 默认使用的 MongoDB 业务库名。
                answers.mongoDb = await promptNonEmpty('MongoDB 数据库名', answers.mongoDb ?? 'app_db', allowBack);
            }
        },
        {
            async run({ allowBack }) {
                // SpiceDB 单独使用 PostgreSQL role，避免和业务库主用户混用。
                answers.spicedbPostgresUser = await promptNonEmpty(
                    'SpiceDB PostgreSQL 用户名',
                    answers.spicedbPostgresUser ?? 'spicedb_admin',
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // auto 模式下随机生成 SpiceDB PostgreSQL 密码。
                await promptPasswordOrGenerate(
                    answers,
                    'spicedbPostgresPassword',
                    'SpiceDB PostgreSQL 密码',
                    generateRandomSecretString,
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // SpiceDB datastore 使用的 PostgreSQL 数据库名。
                answers.spicedbPostgresDb = await promptNonEmpty(
                    'SpiceDB PostgreSQL 数据库名',
                    answers.spicedbPostgresDb ?? 'spicedb_admin',
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // SpiceDB gRPC preshared key 是 API 访问 SpiceDB 的共享密钥，用 hex 生成便于复制。
                await promptPasswordOrGenerate(
                    answers,
                    'spicedbGrpcPresharedKey',
                    'SpiceDB gRPC preshared key',
                    generateRandomHexToken,
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // admin-api Better Auth secret 用于签名会话相关数据；公开部署必须为每个环境独立生成。
                await promptPasswordOrGenerate(
                    answers,
                    'adminBetterAuthSecret',
                    'Admin Better Auth secret',
                    () => generateRandomSecretString(32),
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // app-api Better Auth secret 独立于 admin-api，避免两个认证域共享签名密钥。
                await promptPasswordOrGenerate(
                    answers,
                    'appBetterAuthSecret',
                    'App Better Auth secret',
                    () => generateRandomSecretString(32),
                    allowBack
                );
            }
        },
        {
            isInteractive: isManualSecretMode,
            async run({ allowBack }) {
                // JWT_SIGNING_KEY 用于 app-api Better Auth cookieCache 的 JWT 签名，不能沿用镜像里的示例值。
                await promptPasswordOrGenerate(
                    answers,
                    'jwtSigningKey',
                    'App JWT signing key',
                    () => generateRandomSecretString(32),
                    allowBack
                );
            }
        },
        {
            async run({ allowBack }) {
                // TZ 会写入主 env，影响容器内日志时间和应用时间格式。
                answers.timezone = await promptNonEmpty('时区', answers.timezone ?? 'Asia/Shanghai', allowBack);
            }
        },
        {
            async run({ allowBack }) {
                // GHCR 是 GitHub Container Registry；私有镜像需要 login，公开镜像可以 skip。
                answers.ghcrMode = await promptSelect(
                    `${appImageRegistryHost} 镜像仓库登录`,
                    answers.ghcrMode ?? 'skip',
                    [
                        { value: 'skip', label: '跳过', hint: '已经 docker login 或镜像是公开的' },
                        { value: 'login', label: '现在登录', hint: '输入用户名和 token/密码' }
                    ],
                    allowBack
                );
            }
        },
        {
            canRun: () => answers.ghcrMode === 'login',
            async run({ allowBack }) {
                // 只有选择 login 时才询问用户名。
                answers.ghcrUsername = await promptNonEmpty(
                    `${appImageRegistryHost} 用户名`,
                    answers.ghcrUsername ?? '',
                    allowBack
                );
            }
        },
        {
            canRun: () => answers.ghcrMode === 'login',
            async run({ allowBack }) {
                // token/密码通过 password prompt 输入，不会明文显示。
                answers.ghcrToken = await promptPassword(`${appImageRegistryHost} token / 密码`, allowBack);
            }
        },
        {
            async run({ allowBack }) {
                // true 表示生成配置后马上执行 pull、同步凭据、db push、compose up。
                answers.deployNow = await promptConfirm(
                    '生成配置后立即执行 docker compose 部署？',
                    answers.deployNow ?? true,
                    allowBack
                );
            }
        }
    ];
}

function buildConfig(answers: DeployAnswers): DeployConfig {
    // targetRoot 是所有部署产物的根目录，后续 docker/env/logs 都从它派生。
    const targetRoot = ensureRequired(answers.targetRoot, 'targetRoot');

    // Docker 相关文件统一放在 targetRoot/docker，便于部署人员直接进入该目录执行 compose 命令。
    const targetDockerDir = nodePath.join(targetRoot, 'docker');

    // Loki 日志目录也是应用日志采集目录。
    const targetLogDir = nodePath.join(targetRoot, 'logs', 'loki');

    // 主 env 文件放在部署根目录，Docker Compose 通过 --env-file 读取。
    const envFile = nodePath.join(targetRoot, '.env');

    // Grafana env 单独放，避免 Grafana 密码和主 compose env 混在一起。
    const grafanaEnvFile = nodePath.join(targetRoot, 'grafana-loki', '.env');

    // 用户输入英文逗号分隔的 IP，这里拆成数组并去掉空白项。
    const certServerIps = ensureRequired(answers.certServerIpsInput, 'certServerIpsInput')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    // 这些密码需要重复使用：既写原始值，也写 URL 编码值。
    const postgresPassword = ensureRequired(answers.postgresPassword, 'postgresPassword');
    const mongoPassword = ensureRequired(answers.mongoPassword, 'mongoPassword');
    const spicedbPostgresPassword = ensureRequired(answers.spicedbPostgresPassword, 'spicedbPostgresPassword');
    const adminApiPort = ensureRequired(answers.adminApiPort, 'adminApiPort');
    const appApiPort = ensureRequired(answers.appApiPort, 'appApiPort');
    const adminWebPort = ensureRequired(answers.adminWebPort, 'adminWebPort');
    const grafanaPort = ensureRequired(answers.grafanaPort, 'grafanaPort');
    const adminApiPublicOrigin = normalizePublicOrigin(
        ensureRequired(answers.adminApiPublicOrigin, 'adminApiPublicOrigin'),
        adminApiPort,
        'Admin API 公开访问网址或主机'
    );
    const appApiPublicOrigin = normalizePublicOrigin(
        ensureRequired(answers.appApiPublicOrigin, 'appApiPublicOrigin'),
        appApiPort,
        'App API 公开访问网址或主机'
    );
    const adminWebPublicOrigin = normalizePublicOrigin(
        ensureRequired(answers.adminWebPublicOrigin, 'adminWebPublicOrigin'),
        adminWebPort,
        'Admin Web 公开访问网址或主机'
    );

    return {
        runtimeDockerDir,
        runtimePrismaDir,
        runtimeSeedSqlDir,
        runtimeSpiceDbSchemaPath,
        targetRoot,
        targetDockerDir,
        targetLogDir,
        envFile,
        grafanaEnvFile,
        // 一开始只有基础 compose.yaml；assets.ts 后续会追加 compose.generated.yaml。
        composeFiles: [nodePath.join(targetDockerDir, 'compose.yaml')],
        deployNow: ensureRequired(answers.deployNow, 'deployNow'),
        ghcrMode: ensureRequired(answers.ghcrMode, 'ghcrMode'),
        ghcrToken: answers.ghcrToken,
        ghcrUsername: answers.ghcrUsername,
        redpandaOutsideHost: ensureRequired(answers.redpandaOutsideHost, 'redpandaOutsideHost'),
        certServerIps,
        env: {
            // 应用展示名和公开访问端口；后续应用 env、Better Auth URL、CORS 和 Compose 健康检查都从这里派生。
            APP_NAME: 'Shiro Nya',
            // 业务镜像默认使用开源公开镜像。高级用户可在生成后的 .env 中改 registry/tag，再重新 docker compose pull。
            SHIRO_NYA_IMAGE_REGISTRY: shiroNyaAppImageRegistry,
            SHIRO_NYA_IMAGE_TAG: shiroNyaAppImageTag,
            ADMIN_API_PORT: adminApiPort,
            APP_API_PORT: appApiPort,
            ADMIN_WEB_PORT: adminWebPort,
            // Grafana 只给浏览器和运维查看日志/链路使用，不参与 Better Auth/CORS 派生。
            GRAFANA_PORT: grafanaPort,
            ADMIN_WEB_PUBLIC_ORIGIN: adminWebPublicOrigin,
            ADMIN_API_PUBLIC_ORIGIN: adminApiPublicOrigin,
            APP_API_PUBLIC_ORIGIN: appApiPublicOrigin,
            // admin-web 是静态前端，VITE_API_BASE_URL 在镜像构建时已经固化。
            // 这里继续写已有的前端 API 基地址；`/admin` 是当前 admin-web 调后台接口的固定根路径，不暴露成向导配置项。
            // 部署时会在 admin-web 容器启动脚本中用这个值替换旧的构建期 API 地址。
            ADMIN_WEB_API_BASE_URL: `${adminApiPublicOrigin}/admin`,
            // PostgreSQL 主账号和默认库。
            POSTGRES_USER: ensureRequired(answers.postgresUser, 'postgresUser'),
            POSTGRES_PASSWORD: postgresPassword,
            // URLENCODED 用于连接串，避免密码里的 @/:# 等字符破坏 URL 结构。
            POSTGRES_PASSWORD_URLENCODED: encodeURIComponent(postgresPassword),
            POSTGRES_DB: ensureRequired(answers.postgresDb, 'postgresDb'),
            // admin-api/app-api 各自的业务数据库。
            ADMIN_POSTGRES_DB: ensureRequired(answers.adminPostgresDb, 'adminPostgresDb'),
            APP_POSTGRES_DB: ensureRequired(answers.appPostgresDb, 'appPostgresDb'),
            // Admin Redis 配置。
            ADMIN_REDIS_USER: ensureRequired(answers.adminRedisUser, 'adminRedisUser'),
            ADMIN_REDIS_PASSWORD: ensureRequired(answers.adminRedisPassword, 'adminRedisPassword'),
            ADMIN_REDIS_PORT: ensureRequired(answers.adminRedisPort, 'adminRedisPort'),
            // App Redis 配置。
            APP_REDIS_USER: ensureRequired(answers.appRedisUser, 'appRedisUser'),
            APP_REDIS_PASSWORD: ensureRequired(answers.appRedisPassword, 'appRedisPassword'),
            APP_REDIS_PORT: ensureRequired(answers.appRedisPort, 'appRedisPort'),
            // MongoDB root 用户和业务库。
            MONGO_USER: ensureRequired(answers.mongoUser, 'mongoUser'),
            MONGO_PASSWORD: mongoPassword,
            MONGO_PASSWORD_URLENCODED: encodeURIComponent(mongoPassword),
            MONGO_DB: ensureRequired(answers.mongoDb, 'mongoDb'),
            // Redpanda 对宿主机或局域网暴露的地址。
            REDPANDA_OUTSIDE_HOST: ensureRequired(answers.redpandaOutsideHost, 'redpandaOutsideHost'),
            // SpiceDB datastore 使用的 PostgreSQL 账号和数据库。
            SPICEDB_POSTGRES_USER: ensureRequired(answers.spicedbPostgresUser, 'spicedbPostgresUser'),
            SPICEDB_POSTGRES_PASSWORD: spicedbPostgresPassword,
            SPICEDB_POSTGRES_PASSWORD_URLENCODED: encodeURIComponent(spicedbPostgresPassword),
            SPICEDB_POSTGRES_DB: ensureRequired(answers.spicedbPostgresDb, 'spicedbPostgresDb'),
            // API 服务访问 SpiceDB gRPC 时使用的共享密钥。
            SPICEDB_GRPC_PRESHARED_KEY: ensureRequired(answers.spicedbGrpcPresharedKey, 'spicedbGrpcPresharedKey'),
            // Better Auth / JWT 签名密钥。写入主 env 后，应用 env 文件会从同一份配置派生。
            ADMIN_BETTER_AUTH_SECRET: ensureRequired(answers.adminBetterAuthSecret, 'adminBetterAuthSecret'),
            BETTER_AUTH_SECRET: ensureRequired(answers.appBetterAuthSecret, 'appBetterAuthSecret'),
            JWT_SIGNING_KEY: ensureRequired(answers.jwtSigningKey, 'jwtSigningKey'),
            // 容器时区。
            TZ: ensureRequired(answers.timezone, 'timezone')
        },
        grafanaEnv: {
            // Grafana 官方镜像默认管理员是 admin/admin；这里显式写同样的默认密码，避免新手需要额外回答一个密码问题。
            // 注意：Grafana 只会在 grafana-data 数据卷首次初始化时读取这个值，已有数据卷不会因为 env 变化自动改密码。
            GF_SECURITY_ADMIN_PASSWORD: 'admin'
        }
    };
}

/**
 * 收集部署配置。
 *
 * 这是 CLI 入口调用的唯一配置函数。
 * 它负责启动向导、处理取消、关闭 prompt session，最后返回 DeployConfig。
 */
export async function collectConfig(): Promise<DeployConfig> {
    // answers 是可变对象，向导每一步都会把答案写入这里。
    const answers: DeployAnswers = {};
    try {
        await runWizard(createConfigSteps(answers), answers);
    } catch (error) {
        if (error instanceof PromptCancelled) {
            // 用户主动取消部署时，关闭 prompt session 并以 0 退出，表示不是程序异常。
            await closeConfigPromptSession();
            cancel('部署已取消');
            process.exit(0);
        }

        // 其他错误继续抛给 CLI 入口，由入口显示失败 toast。
        throw error;
    } finally {
        // 无论成功、取消还是报错，都关闭 prompt session，释放终端输入状态。
        await closeConfigPromptSession();
    }

    // 向导回答完成后，把临时 answers 转成强类型 DeployConfig。
    return buildConfig(answers);
}
