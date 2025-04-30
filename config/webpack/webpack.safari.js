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
                { from: 'shared/popup.html' },
                { from: 'shared/popup.css' },
                { from: 'shared/images', to: 'images' },
                { from: 'manifests/safari/manifest.json' },
                { from: 'manifests/safari/SafariAPIs.js', to: 'js/safari/SafariAPIs.js' },
                { from: 'shared/welcome.html' },
                { from: 'shared/js/welcome.js', to: 'js/welcome.js' }
            ]
        })
    ]
});