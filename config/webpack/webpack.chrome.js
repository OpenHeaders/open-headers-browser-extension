const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map',
    output: {
        path: path.resolve(__dirname, '../../dist/chrome'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifests/chrome/manifest.json' },
                { from: 'shared/popup.html' },
                { from: 'shared/popup.css' },
                { from: 'shared/images', to: 'images' }
            ]
        })
    ]
});