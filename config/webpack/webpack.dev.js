const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: 'development',  // Use development mode instead of production
    devtool: 'source-map', // Add source maps for better debugging
    optimization: {
        minimize: false     // Disable minimization
    },
    output: {
        path: path.resolve(__dirname, '../../dist/dev'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'chrome/manifest.json' },
                { from: 'shared/popup.html' },
                { from: 'shared/popup.css' },
                { from: 'shared/images', to: 'images' }
            ]
        })
    ]
});