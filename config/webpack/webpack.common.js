const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ChromeSafePlugin = require('./chrome-safe-plugin');

module.exports = {
    entry: {
        background: './src/background/index.js',
        popup: './src/popup/index.jsx',
        'content/record-recorder': './src/assets/recording/content/record-recorder.js'
    },
    output: {
        path: path.resolve(__dirname, '../../dist'),
        filename: 'js/[name]/index.js',
        clean: true,
        // Prevent webpack from using Function constructor for global object detection
        globalObject: 'this'
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
        minimize: false, // Disable minification to comply with Chrome Web Store
        // Chrome Web Store requires all code to be human-readable
        // and considers minified code as obfuscated
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
                    from: 'src/assets/welcome/welcome.html',
                    to: 'welcome.html'
                },
                {
                    from: 'src/assets/welcome/welcome.js',
                    to: 'js/welcome.js'
                },
                {
                    from: 'src/assets/recording/inject/recorder-rrweb.js',
                    to: 'js/recording/inject/recorder.js'
                },
                {
                    from: 'src/assets/recording/inject/recording-widget.js',
                    to: 'js/recording/inject/recording-widget.js'
                },
                {
                    from: 'src/assets/recording/viewer/record-viewer.html',
                    to: 'record-viewer.html'
                },
                {
                    from: 'src/assets/lib/rrweb.js',
                    to: 'js/lib/rrweb.js'
                },
                {
                    from: 'src/assets/lib/rrweb-player.js',
                    to: 'js/lib/rrweb-player.js'
                },
                {
                    from: 'src/assets/lib/rrweb-player.css',
                    to: 'css/rrweb-player.css'
                },
                {
                    from: 'src/assets/lib/assets/*.js',
                    to: 'js/lib/assets/[name][ext]'
                }
            ]
        }),
        new ChromeSafePlugin()
    ]
};