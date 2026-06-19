const path = require('node:path');
const nodeExternals = require('webpack-node-externals');

/** 调整 Nest webpack 输出为 ESM 格式，确保在 `type: module` 下可以直接运行。 */
module.exports = (options) => {
    const rules = options.module.rules.map(rewriteTypeScriptRule);

    // 移除 NestJS 默认注入的 CommonJS libraryTarget，显式改成 ESM 输出。
    const { libraryTarget, ...outputRest } = options.output;
    const outputFilename = typeof outputRest.filename === 'string' ? outputRest.filename : 'main.js';
    const outputBasePath = outputRest.path ?? path.join(process.cwd(), 'dist');
    const outputPath =
        path.dirname(outputFilename) !== '.'
            ? path.join(outputBasePath, path.dirname(outputFilename))
            : outputBasePath;

    return {
        ...options,
        experiments: {
            ...options.experiments,
            outputModule: true
        },
        output: {
            ...outputRest,
            path: outputPath,
            filename: path.basename(outputFilename),
            module: true,
            library: {
                type: 'module'
            },
            chunkFormat: 'module'
        },
        externalsType: 'node-commonjs',
        externals: [
            // `@spicedb-toolkit/*` 只暴露 import 条件时，必须按 ESM external 输出。
            ({ request }, callback) => {
                if (/^@spicedb-toolkit(\/|$)/.test(request)) {
                    return callback(null, `module ${request}`);
                }

                callback();
            },
            nodeExternals({
                importType: 'node-commonjs',
                allowlist: [/^webpack\/hot\/poll\?100$/]
            })
        ],
        module: {
            ...options.module,
            rules
        },
        cache: {
            type: 'filesystem'
        }
    };
};

/** 将 Nest 默认的 `ts-loader` 规则整体替换为支持装饰器元数据的 `swc-loader`。 */
function rewriteTypeScriptRule(rule) {
    if (!containsTsLoader(rule)) {
        return rule;
    }

    const { use, loader, options, ...rest } = rule;

    return {
        ...rest,
        use: [createTypeScriptSwcLoader()]
    };
}

/** 判断当前规则里是否还挂着 Nest 默认注入的 `ts-loader`。 */
function containsTsLoader(rule) {
    if (rule.loader === 'ts-loader') {
        return true;
    }

    if (!Array.isArray(rule.use)) {
        return false;
    }

    return rule.use.some((useEntry) => getLoaderName(useEntry) === 'ts-loader');
}

/** 兼容 `loader` 与 `use` 两种 webpack loader 写法，统一提取 loader 名称。 */
function getLoaderName(useEntry) {
    if (typeof useEntry === 'string') {
        return useEntry;
    }

    return useEntry && typeof useEntry === 'object' ? useEntry.loader : undefined;
}

/** 生成用于业务 TypeScript 源码的 SWC 配置，保留 ESM 语义与装饰器元数据。 */
function createTypeScriptSwcLoader() {
    return {
        loader: 'swc-loader',
        options: {
            jsc: {
                parser: {
                    syntax: 'typescript',
                    decorators: true,
                    dynamicImport: true
                },
                transform: {
                    legacyDecorator: true,
                    decoratorMetadata: true
                },
                target: 'es2021'
            },
            module: {
                type: 'es6'
            }
        }
    };
}
