const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    // Explicitly use a source map option that doesn't rely on eval
    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
    output: {
        path: path.resolve(__dirname, '../../dist/edge'),
    },
    optimization: {
        // Ensure we don't use eval in Edge builds
        minimize: process.env.NODE_ENV === 'production',
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifests/edge/manifest.json' },
                // We no longer need to copy HTML/CSS files as HtmlWebpackPlugin handles this
                { from: 'src/assets/images', to: 'images' }
            ]
        })
    ]
});