/**
 * 文件作用：
 * 这个文件只放 deploy-kit 的共享类型，不包含实际执行逻辑。
 * 这些类型像“说明书目录”一样，把配置向导、部署编排器、进度 UI、Docker 状态读取之间的数据契约统一起来。
 *
 * 新手阅读建议：
 * - 想知道部署需要哪些配置，看 DeployConfig。
 * - 想知道部署步骤长什么样，看 DeployStep。
 * - 想知道进度条如何被步骤驱动，看 DeployStepContext 和 DeployProgressReporter。
 * - 想知道终端 Logo 动画资源格式，看 DeployLogoKeyframeFile 相关类型。
 */

/** 密钥处理方式：auto 表示部署工具自动生成，manual 表示用户手动输入。 */
export type SecretMode = 'auto' | 'manual';

/** GHCR 登录方式：skip 表示不登录，login 表示部署工具调用 `docker login ghcr.io`。 */
export type GhcrMode = 'skip' | 'login';

/** Logo 动画中的一个字符单元。char 是字符，color/bgColor 是前景色和背景色。 */
export type MotionCell = {
    char?: string;
    color?: string;
    bgColor?: string;
};

/** Logo 动画帧，data 的 key 通常是 `x,y` 坐标字符串，例如 `12,4`。 */
export type MotionFrame = {
    id?: string;
    name?: string;
    startFrame?: number;
    duration?: number;
    durationFrames?: number;
    data?: Record<string, MotionCell>;
};

export type DeployLogoKeyframeFile = {
    format?: 'shiro-nya-cli-logo-keyframes';
    name?: string;
    canvas?: {
        width?: number;
        height?: number;
    };
    fontMetrics?: {
        characterWidth?: number;
        characterHeight?: number;
        aspectRatio?: number;
        fontSize?: number;
        fontFamily?: string;
    };
    frames?: MotionFrame[];
    runtime?: {
        frameRate?: number;
        holdSeconds?: number;
        transitionFrames?: number;
        looping?: boolean;
    };
};

export type RuntimeLogoCell = Required<MotionCell> & {
    key: string;
    x: number;
    y: number;
};

export type RuntimeFrameDataCell = Required<MotionCell> & {
    __priority?: number;
};

export type RuntimeFrameData = Record<string, RuntimeFrameDataCell>;

export type Rgb = {
    r: number;
    g: number;
    b: number;
};

export type DeployLogoFrame = {
    duration: number;
    text: string;
};

export type DeployLogoPlayback = {
    height: number;
    looping: boolean;
    frameCount: number;
    frameAt: (index: number) => DeployLogoFrame;
};

export type DeployProgressLogo = {
    height: number;
    textAt: (fromProgress: number, toProgress: number, fallProgress: number) => string;
};

export type DeployPromptSelectOption<T extends string = string> = {
    value: T;
    label?: string;
    hint?: string;
    disabled?: boolean;
};

export type DeployPromptKind = 'confirm' | 'password' | 'select' | 'text';

export type DeployPromptRequest = {
    allowBack: boolean;
    initialValue: string;
    kind: DeployPromptKind;
    message: string;
    options?: DeployPromptSelectOption<string>[];
    validate?: (value: string) => string | undefined;
};

/**
 * 部署进度 UI 控制器。
 * 每个方法都由部署步骤调用或由进度 reporter 调用，用来更新终端里的步骤状态。
 */
export type DeployProgressUiController = {
    completeStep: (currentStep: number, durationMs: number) => void;
    failStep: (currentStep: number, durationMs: number) => void;
    setProgress: (currentStep: number, progress: number) => void;
    startStep: (currentStep: number) => void;
    stop: () => void;
    writeLog: (text: string) => void;
};

/**
 * 顶部 Logo 和进度条控制器。
 * 这个控制器把“顶部动画”和“步骤进度”连接起来，所以 CLI 入口会把它传给 progress reporter。
 */
export type DeployHeaderLogoController = {
    getFlowTop?: () => number;
    getFlowRows?: () => number;
    runPrompt?: (props: DeployPromptRequest) => Promise<string>;
    setFlowInsetRows?: (rows: number) => void;
    setHeaderStep?: (currentStep: number, totalSteps: number) => void;
    setProgress: (progress: number) => void;
    startDeployProgress?: (steps: DeployStep[]) => DeployProgressUiController;
    startProgress: () => void;
    stop: () => void;
};

/**
 * 一个可执行部署步骤。
 * title 用于 UI 和日志；action 是真正执行的异步函数。
 */
export type DeployStep = {
    title: string;
    action: (context: DeployStepContext) => Promise<void>;
};

/**
 * 单个部署步骤拿到的上下文。
 * 当前只暴露 setProgress，用于像 Docker pull 这种长时间步骤上报 0~1 的局部进度。
 */
export type DeployStepContext = {
    setProgress: (progress: number) => void;
};

/**
 * 跨步骤进度上报器。
 * 编排器只调用这个接口，不关心底层是 Ink UI、Logo 动画，还是普通文本输出。
 */
export type DeployProgressReporter = {
    start: (steps: DeployStep[]) => void;
    setStep: (currentStep: number, totalSteps: number) => void;
    setStepProgress: (currentStep: number, totalSteps: number, stepProgress: number) => void;
    stepStarted: (currentStep: number, totalSteps: number, title: string) => void;
    stepCompleted: (currentStep: number, totalSteps: number, title: string, durationMs: number) => void;
    stepFailed: (currentStep: number, totalSteps: number, title: string, durationMs: number) => void;
    stop: () => void;
};

/** `docker compose ps --format json` 读取后展示给用户的容器状态。 */
export type DockerContainerStatus = {
    name: string;
    ports: string;
    service: string;
    state: string;
    status: string;
};

/**
 * 部署工具的核心配置对象。
 *
 * 字段来源：
 * - `runtime*` 来自 deploy-kit 自带模板目录。
 * - `target*` 来自用户选择的部署根目录。
 * - `env` 和 `grafanaEnv` 来自配置向导，并写入目标机器的 env 文件。
 * - `composeFiles` 会先包含基础 compose.yaml，后续 assets 模块会追加 compose.generated.yaml。
 */
export type DeployConfig = {
    /** deploy-kit 内置 Docker Compose 模板目录。 */
    runtimeDockerDir: string;
    /** deploy-kit 内置 Prisma schema 模板目录。 */
    runtimePrismaDir: string;
    /** 开源版初始化 SQL 目录；源码运行时指向 database/seeds/open-source，打包后指向 runtime/seed-sql。 */
    runtimeSeedSqlDir: string;
    /** SpiceDB schema 文件；源码运行时指向 spicedb/schema.zed，打包后指向 runtime/spicedb/schema.zed。 */
    runtimeSpiceDbSchemaPath: string;
    /** 用户选择的部署根目录，例如 Windows 的 C:\shiro-nya 或 Linux 的 /opt/shiro-nya。 */
    targetRoot: string;
    /** 目标 Docker 配置目录，通常是 `${targetRoot}/docker`。 */
    targetDockerDir: string;
    /** Loki/运行日志目录，Promtail 和 deploy 日志都会用到。 */
    targetLogDir: string;
    /** 主 `.env` 文件路径，Docker Compose 通过 `--env-file` 读取。 */
    envFile: string;
    /** Grafana 单独使用的 env 文件路径。 */
    grafanaEnvFile: string;
    /** Docker Compose 文件列表，顺序会影响 override 覆盖关系。 */
    composeFiles: string[];
    /** 是否在生成配置后立即执行部署命令。 */
    deployNow: boolean;
    /** GHCR 登录模式。 */
    ghcrMode: GhcrMode;
    /** GHCR token，只在 ghcrMode=login 时需要。 */
    ghcrToken?: string;
    /** GHCR 用户名，只在 ghcrMode=login 时需要。 */
    ghcrUsername?: string;
    /** Redpanda 暴露给宿主机/局域网访问的地址。 */
    redpandaOutsideHost: string;
    /** TLS 证书 SAN 中写入的服务端 IP 列表。 */
    certServerIps: string[];
    /** 写入主 `.env` 的键值。 */
    env: Record<string, string>;
    /** 写入 Grafana env 的键值。 */
    grafanaEnv: Record<string, string>;
};
