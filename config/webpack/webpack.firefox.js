const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    output: {
        path: path.resolve(__dirname, '../../dist/firefox'),
    },
    // Add this to prevent webpack from using eval() in development mode
    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
    optimization: {
        // Avoid using eval in Firefox builds
        minimize: process.env.NODE_ENV === 'production',
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifests/firefox/manifest.json' },
                // We no longer need to copy HTML/CSS files as HtmlWebpackPlugin handles this
                { from: 'src/assets/images', to: 'images' }
            ]
        })
    ]
});