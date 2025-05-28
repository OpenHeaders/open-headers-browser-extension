const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    output: {
        path: path.resolve(__dirname, '../../dist/safari'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifests/safari/manifest.json' },
                { from: 'manifests/safari/SafariAPIs.js', to: 'js/safari/SafariAPIs.js' },
                // We no longer need to copy HTML/CSS files as HtmlWebpackPlugin handles this
                { from: 'src/assets/images', to: 'images' }
            ]
        })
    ]
});