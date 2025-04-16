const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        background: './js/background/index.js',
        popup: './js/popup/index.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'js/[name]/index.js'
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false, // Set to true to remove console logs
                        passes: 2
                    },
                    mangle: {
                        reserved: ['chrome'] // Prevent mangling of Chrome API names
                    },
                    format: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'manifest.json' },
                { from: 'popup.html' },
                { from: 'popup.css' },
                { from: 'images', to: 'images' }
            ]
        })
    ],
    resolve: {
        extensions: ['.js']
    }
};