import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

/**
 * 文件作用：
 * 这个文件是 deploy-kit 的 tsup 打包配置。
 *
 * 打包目标：
 * - 把 TypeScript CLI 入口打成 `deploy_script/index.js`。
 * - 把 assets 和 runtime 模板复制到 `deploy_script/`。
 * - 让生成物可以脱离源码目录运行。
 *
 * 注意：这里不修改 `components` 源码，只处理打包配置。
 */

// import.meta.url 是 file:// URL，fileURLToPath 把它转成普通路径。
const configDir = path.dirname(fileURLToPath(import.meta.url));

// packageRoot 指向 packages/deploy-kit。
const packageRoot = path.resolve(configDir, '..');

// workspaceRoot 指向仓库根目录。
const workspaceRoot = path.resolve(packageRoot, '../..');

// deploy_script 是构建输出目录，也是发布脚本后续打包自解压文件的输入目录。
const outDir = path.join(workspaceRoot, 'deploy_script');

/**
 * React DevTools stub 插件。
 *
 * Ink/React 依赖链里可能引用 react-devtools-core。
 * 部署脚本不需要 DevTools，如果把真实 devtools 打进去会增加体积，也可能引入运行时不需要的依赖。
 * 所以这里用一个空实现替代它。
 */
const reactDevtoolsCoreStubPlugin = {
    name: 'react-devtools-core-stub',
    setup(build: {
        onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
        onLoad(
            options: { filter: RegExp; namespace: string },
            callback: () => { contents: string; loader: 'js' }
        ): void;
    }) {
        // 当打包器解析 react-devtools-core 时，把它导向自定义 namespace。
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
            path: 'react-devtools-core',
            namespace: 'react-devtools-core-stub'
        }));
        // 在自定义 namespace 中返回一个最小可用模块，导出空 initialize/connectToDevTools。
        build.onLoad({ filter: /.*/, namespace: 'react-devtools-core-stub' }, () => ({
            contents: 'export default { initialize() {}, connectToDevTools() {} };',
            loader: 'js'
        }));
    }
};

export default defineConfig({
    // CLI 入口。
    entry: ['cli/index.ts'],
    outDir,
    // 输出 ESM，因为项目 package.json 使用 type=module。
    format: ['esm'],
    // 运行在 Node.js，不是浏览器。
    platform: 'node',
    // 部署脚本要求 Node 22。
    target: 'node22',
    // bundle=true 表示依赖尽量打进一个入口文件。
    bundle: true,
    // splitting=false 表示不拆 chunk，发布脚本更容易整体打包。
    splitting: false,
    sourcemap: false,
    // clean=true 每次构建前清空 deploy_script，避免旧文件混入。
    clean: true,
    // shims=true 为部分 CJS/ESM 兼容场景注入 shim。
    shims: true,
    // noExternal 全量打包依赖，减少目标机器缺 node_modules 的问题。
    noExternal: [/.*/],
    define: {
        // 某些依赖会根据 process.env.DEV 走开发分支，发布包强制关闭开发模式。
        'process.env.DEV': '"false"'
    },
    esbuildPlugins: [reactDevtoolsCoreStubPlugin],
    banner: {
        // shebang `#!/usr/bin/env node` 让类 Unix 系统可以直接执行 index.js。
        // createRequire 用于少数运行时仍需要 require 的依赖兼容。
        js: "#!/usr/bin/env node\nimport { createRequire as __shiroNyaCreateRequire } from 'node:module';\nconst require = __shiroNyaCreateRequire(import.meta.url);"
    },
    async onSuccess() {
        // 构建成功后复制非 TS 运行资源：Logo 动画、Docker 模板、Prisma schema 等。
        const assetsDir = path.join(outDir, 'assets');
        const runtimeDir = path.join(outDir, 'runtime');
        const seedSqlDir = path.join(runtimeDir, 'seed-sql');
        const runtimeSpiceDbDir = path.join(runtimeDir, 'spicedb');
        const entryFile = path.join(outDir, 'index.js');
        await Promise.all([
            fs.cp(path.join(packageRoot, 'assets'), assetsDir, { recursive: true }),
            fs.cp(path.join(packageRoot, 'runtime'), runtimeDir, { recursive: true })
        ]);
        // seedSqlDir 位于 runtimeDir 里面，必须等 runtimeDir 创建完成后再复制，避免并发 mkdir 撞到 EEXIST。
        await fs.cp(path.join(workspaceRoot, 'database', 'seeds', 'open-source'), seedSqlDir, { recursive: true });
        // SpiceDB schema 和业务源码复用同一份，打包时复制到 runtime 下，发布单文件时会被一起编码进去。
        await fs.mkdir(runtimeSpiceDbDir, { recursive: true });
        await fs.copyFile(path.join(workspaceRoot, 'spicedb', 'schema.zed'), path.join(runtimeSpiceDbDir, 'schema.zed'));
        // 0o755 表示 owner 可读写执行，其他用户可读执行；Windows chmod 失败时忽略。
        await fs.chmod(entryFile, 0o755).catch(() => undefined);
    }
});
