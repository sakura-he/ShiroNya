/**
 * 文件作用：
 * 这个文件存放部署模块共享的固定常量。
 * 当前主要存放 Shiro Nya 业务镜像的默认仓库和默认版本。
 *
 * 为什么镜像地址要集中在这里：
 * - Docker Compose 模板、应用 env 生成、部署日志和部署摘要都要展示或读取同一组镜像。
 * - 如果这些位置各自手写镜像名，很容易出现 compose 拉的是 A，env 读取的是 B 的问题。
 * - 开源版默认使用公开镜像；高级用户仍可以通过环境变量覆盖仓库或 tag。
 */

export type ShiroNyaAppImageName = 'admin-api' | 'app-api' | 'admin-web';

/** Shiro Nya 公开镜像默认所在的 GHCR namespace；和 GitHub 仓库 owner `sakura-he` 保持一致。 */
export const defaultShiroNyaAppImageRegistry = 'ghcr.io/sakura-he';

/** Shiro Nya 公开镜像默认版本；和当前开源项目 package.json 版本保持一致。 */
export const defaultShiroNyaAppImageTag = '0.0.1';

/**
 * 读取镜像仓库前缀。
 *
 * 参数 env 可以传 process.env，也可以传部署向导生成的 config.env：
 * - process.env 允许运行部署脚本前临时覆盖默认镜像仓库。
 * - config.env 允许后续部署步骤严格复用本次向导写入的镜像仓库。
 *
 * replace(/\/+$/, '') 会删除末尾斜杠，避免拼接成 `ghcr.io/sakura-he//admin-api`。
 */
export function resolveShiroNyaAppImageRegistry(env: Record<string, string | undefined> = process.env): string {
    return (env.SHIRO_NYA_IMAGE_REGISTRY?.trim() || defaultShiroNyaAppImageRegistry).replace(/\/+$/, '');
}

/**
 * 读取镜像 tag。
 *
 * tag 是 Docker 镜像版本号，例如 `0.0.1`。
 * 这里不默认使用 `latest`，因为 latest 会移动，用户很难复现一次部署到底拉到了哪个版本。
 */
export function resolveShiroNyaAppImageTag(env: Record<string, string | undefined> = process.env): string {
    return env.SHIRO_NYA_IMAGE_TAG?.trim() || defaultShiroNyaAppImageTag;
}

/** 当前进程环境下的默认应用镜像仓库；部署摘要和日志会展示它。 */
export const shiroNyaAppImageRegistry = resolveShiroNyaAppImageRegistry();

/** 当前进程环境下的默认应用镜像 tag。 */
export const shiroNyaAppImageTag = resolveShiroNyaAppImageTag();

/**
 * 生成完整业务镜像名。
 *
 * 返回值示例：
 * - `ghcr.io/sakura-he/admin-api:0.0.1`
 * - `ghcr.io/sakura-he/app-api:0.0.1`
 * - `ghcr.io/sakura-he/admin-web:0.0.1`
 */
export function shiroNyaAppImage(
    imageName: ShiroNyaAppImageName,
    env: Record<string, string | undefined> = process.env
): string {
    return `${resolveShiroNyaAppImageRegistry(env)}/${imageName}:${resolveShiroNyaAppImageTag(env)}`;
}
