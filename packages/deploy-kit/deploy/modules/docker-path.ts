import nodePath from 'node:path';

/**
 * 把本机路径转成 Docker Compose 更容易识别的宿主机路径格式。
 *
 * 这里不直接做字符串替换，而是用 Node 的 path API 拆解再重组：
 * - `nodePath.resolve`：先得到当前系统下的绝对路径。
 * - `nodePath.win32.parse/relative`：在 Windows 下识别盘符根目录和路径段。
 * - `nodePath.posix.join`：把路径段组装成 Docker Compose 更稳定识别的 `D:/shiro-nya/logs`。
 *
 * Linux/macOS 本身使用 `/` 分隔，直接返回 resolve 后的路径。
 */
export function normalizeDockerPath(input: string): string {
    const resolved = nodePath.resolve(input);
    if (process.platform !== 'win32') return resolved;

    const parsed = nodePath.win32.parse(resolved);
    const root = parsed.root;
    if (!root) return resolved;

    const relativePath = nodePath.win32.relative(root, resolved);
    const rootName = root.endsWith(nodePath.win32.sep)
        ? root.slice(0, -nodePath.win32.sep.length)
        : root;
    if (!relativePath) return rootName;

    const segments = relativePath.split(nodePath.win32.sep).filter(Boolean);
    return nodePath.posix.join(rootName, ...segments);
}
