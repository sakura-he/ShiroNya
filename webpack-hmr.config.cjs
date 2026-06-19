const createWebpackConfig = require('./webpack.config.cjs');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

/** 在基础 ESM 构建配置上叠加 HMR 入口与自动重启能力。 */
module.exports = (options, webpack) => {
    const baseConfig = createWebpackConfig(options);
    const outputFileName =
        typeof baseConfig.output?.filename === 'string'
            ? baseConfig.output.filename
            : options.output.filename;

    return {
        ...baseConfig,
        entry: ['webpack/hot/poll?100', options.entry],
        plugins: [
            ...(baseConfig.plugins ?? []),
            new webpack.HotModuleReplacementPlugin(),
            new webpack.WatchIgnorePlugin({
                paths: [/\.js$/, /\.d\.ts$/]
            }),
            new RunScriptWebpackPlugin({
                name: outputFileName,
                autoRestart: false
            })
        ]
    };
};
