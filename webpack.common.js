const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    entry: {
        background: './shared/js/background/index.js',
        popup: './shared/js/popup/index.js'
    },
    output: {
        filename: 'js/[name]/index.js',
        clean: true
    },
    optimization: {
        minimize: process.env.NODE_ENV === 'production', // Only minimize in production
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false,
                        passes: 2
                    },
                    mangle: {
                        reserved: ['chrome', 'browser'] // Prevent mangling of browser API names
                    },
                    format: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    resolve: {
        extensions: ['.js']
    }
};