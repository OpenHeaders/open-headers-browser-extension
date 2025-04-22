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
                    // Chrome Web Store compliant settings - no obfuscation
                    compress: {
                        drop_console: false,
                        passes: 2
                    },
                    mangle: {
                        // Only basic variable name minification, not obfuscation
                        reserved: ['chrome', 'browser'] // Prevent mangling of browser API names
                    },
                    format: {
                        comments: false
                    },
                    // Make sure the code is readable and not obfuscated
                    keep_classnames: true,
                    keep_fnames: true
                },
                extractComments: false
            })
        ]
    },
    resolve: {
        extensions: ['.js']
    }
};