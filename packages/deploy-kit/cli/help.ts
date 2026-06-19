/**
 * 文件作用：
 * 这个文件只负责 deploy-kit 的命令行帮助和 Logo 开关判断。
 * 把帮助文字单独放在这里，可以让入口文件保持清晰：入口决定“做什么”，这里决定“如何说明给用户看”。
 */

/**
 * 判断用户是否请求帮助。
 *
 * `process.argv` 是 Node.js 提供的命令行参数数组，例如：
 * - `node index.js --help` 会包含 `--help`
 * - `node index.js -h` 会包含 `-h`
 */
export function shouldShowHelp(): boolean {
    return process.argv.includes('--help') || process.argv.includes('-h');
}

/**
 * 打印帮助信息。
 *
 * 这里的反引号 `...` 是 JavaScript 的模板字符串语法，可以保留多行换行。
 * 帮助文案里列出两种使用方式：
 * - 开发仓库内执行 `pnpm run deploy`
 * - 发布包里执行自解压脚本 `node shiro-nya-deploy.mjs`
 */
export function printHelp(): void {
    console.log(`Shiro Nya interactive deploy

Deploy:
  pnpm run deploy
  node shiro-nya-deploy.mjs

Release script generation:
  pnpm run deploy-script:build
  pnpm run deploy-script:release

Options:
  --no-logo                  Skip the terminal logo animation
  -h, --help                 Show this help
`);
}

/**
 * 判断是否显示终端 Logo 动画。
 *
 * 需要同时满足：
 * - 当前 stdout 是 TTY，也就是用户真的在终端里看输出，而不是被重定向到文件。
 * - 没有传 `--no-logo`。
 * - 不是 CI 环境。
 * - 没有设置 `SHIRO_NYA_DEPLOY_NO_LOGO=true`。
 *
 * 这样做是为了避免 CI 日志、脚本日志里出现大量动画控制字符。
 */
export function shouldShowLogo(): boolean {
    return (
        process.stdout.isTTY &&
        !process.argv.includes('--no-logo') &&
        process.env.CI !== 'true' &&
        process.env.SHIRO_NYA_DEPLOY_NO_LOGO !== 'true'
    );
}
