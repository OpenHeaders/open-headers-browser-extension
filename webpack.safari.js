const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
    mode: 'production',
    output: {
        path: path.resolve(__dirname, 'dist/safari'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'shared/popup.html' },
                { from: 'shared/popup.css' },
                { from: 'shared/images', to: 'images' },
                { from: 'safari/manifest.json' },
                { from: 'safari/SafariAPIs.js', to: 'js/safari/SafariAPIs.js' }
            ]
        })
    ]
});