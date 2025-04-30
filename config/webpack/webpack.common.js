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
    // Use a safer devtool option that doesn't rely on eval for development
    // This ensures compatibility with strict CSP policies in browsers like Edge
    devtool: function() {
        // For Firefox, use cheap-source-map as before
        if (process.env.FIREFOX_BUILD) {
            return 'cheap-source-map';
        }

        // For production, no source maps
        if (process.env.NODE_ENV === 'production') {
            return false;
        }

        // For Edge builds (or any build with EDGE_BUILD flag), use safe option
        if (process.env.EDGE_BUILD) {
            return 'inline-source-map';
        }

        // Default for development (Chrome and others that are more permissive)
        return 'eval-cheap-source-map';
    }(),
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