const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        background: './src/background/index.js',
        popup: './src/popup/index.jsx'
    },
    output: {
        path: path.resolve(__dirname, '../../dist'),
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
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-env',
                            ['@babel/preset-react', { runtime: 'automatic' }]
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: [
                    process.env.NODE_ENV === 'production' 
                        ? MiniCssExtractPlugin.loader 
                        : 'style-loader',
                    'css-loader'
                ]
            },
            {
                test: /\.less$/,
                use: [
                    process.env.NODE_ENV === 'production' 
                        ? MiniCssExtractPlugin.loader 
                        : 'style-loader',
                    'css-loader',
                    {
                        loader: 'less-loader',
                        options: {
                            lessOptions: {
                                javascriptEnabled: true,
                            },
                        },
                    }
                ]
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'images/[name][ext]'
                }
            }
        ]
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
        extensions: ['.js', '.jsx', '.json'],
        alias: {
            '@': path.resolve(__dirname, '../../src'),
            '@shared': path.resolve(__dirname, '../../src/shared'),
            '@components': path.resolve(__dirname, '../../src/components'),
            '@assets': path.resolve(__dirname, '../../src/assets'),
            '@styles': path.resolve(__dirname, '../../src/assets/styles'),
            '@utils': path.resolve(__dirname, '../../src/utils'),
            '@services': path.resolve(__dirname, '../../src/services'),
            '@context': path.resolve(__dirname, '../../src/context'),
            '@hooks': path.resolve(__dirname, '../../src/hooks')
        }
    },
    plugins: [
        new CleanWebpackPlugin(),
        new MiniCssExtractPlugin({
            filename: 'css/[name].css'
        }),
        new HtmlWebpackPlugin({
            template: './src/popup/popup.html',
            filename: 'popup.html',
            chunks: ['popup'],
            cache: false
        }),
        new CopyWebpackPlugin({
            patterns: [
                { 
                    from: 'src/assets/images', 
                    to: 'images' 
                },
                {
                    from: 'shared/welcome.html',
                    to: 'welcome.html'
                },
                {
                    from: 'shared/js/welcome.js',
                    to: 'js/welcome.js'
                }
            ]
        })
    ]
};