const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map',
    optimization: {
        minimize: false
    },
    output: {
        path: path.resolve(__dirname, '../../dist/dev'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifests/chrome/manifest.json' },
                { from: 'src/assets/images', to: 'images' }
            ]
        })
    ]
});