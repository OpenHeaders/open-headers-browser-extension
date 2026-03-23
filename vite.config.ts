import { defineConfig, build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const browser = process.env.BROWSER || 'chrome';

/**
 * Vite plugin to ensure Chrome Web Store compliance.
 * Replaces webpack's Function constructor usage and removes source map references.
 */
function chromeSafePlugin() {
    return {
        name: 'chrome-safe-plugin',
        generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
            for (const [, chunk] of Object.entries(bundle)) {
                if (chunk.type === 'chunk' && chunk.code) {
                    chunk.code = chunk.code
                        .replace(
                            /return this \|\| new Function\('return this'\)\(\)/g,
                            'return this || globalThis || self || window'
                        )
                        .replace(/\/\/# sourceMappingURL=.+$/gm, '');
                }
            }
        },
    };
}

/**
 * Simple plugin to copy static assets to the dist folder with flat paths.
 */
function copyAssetsPlugin() {
    const copies: Array<{ from: string; to: string }> = [
        { from: `manifests/${browser}/manifest.json`, to: 'manifest.json' },
        // Images
        { from: 'src/assets/images/icon16.png', to: 'images/icon16.png' },
        { from: 'src/assets/images/icon48.png', to: 'images/icon48.png' },
        { from: 'src/assets/images/icon128.png', to: 'images/icon128.png' },
        { from: 'src/assets/images/companion-app.png', to: 'images/companion-app.png' },
        { from: 'src/assets/images/firefox-certificate.png', to: 'images/firefox-certificate.png' },
        // Welcome page
        { from: 'src/assets/welcome/welcome.html', to: 'welcome.html' },
        { from: 'src/assets/welcome/welcome.js', to: 'js/welcome.js' },
        // Recording
        { from: 'src/assets/recording/inject/recorder-rrweb.js', to: 'js/recording/inject/recorder.js' },
        { from: 'src/assets/recording/inject/recording-widget.js', to: 'js/recording/inject/recording-widget.js' },
        // Vendored libs
        { from: 'src/assets/lib/rrweb.js', to: 'js/lib/rrweb.js' },
        { from: 'src/assets/lib/rrweb-player.js', to: 'js/lib/rrweb-player.js' },
        { from: 'src/assets/lib/rrweb-player.css', to: 'css/rrweb-player.css' },
        { from: 'src/assets/lib/assets/image-bitmap-data-url-worker-IJpC7g_b.js', to: 'js/lib/assets/image-bitmap-data-url-worker-IJpC7g_b.js' },
    ];

    // Safari-specific
    if (browser === 'safari') {
        copies.push({ from: 'manifests/safari/SafariAPIs.js', to: 'js/safari/SafariAPIs.js' });
    }

    return {
        name: 'copy-assets',
        writeBundle() {
            const outDir = path.resolve(__dirname, `dist/${browser}`);
            for (const { from, to } of copies) {
                const src = path.resolve(__dirname, from);
                const dest = path.resolve(outDir, to);
                if (fs.existsSync(src)) {
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.copyFileSync(src, dest);
                }
            }
        },
    };
}

/**
 * Plugin to build the content script as a separate self-contained IIFE bundle.
 * Content scripts injected via chrome.scripting.executeScript cannot use
 * ES module imports, so they must be bundled into a single file.
 */
function buildContentScriptPlugin() {
    return {
        name: 'build-content-script',
        async writeBundle() {
            await viteBuild({
                configFile: false,
                build: {
                    outDir: `dist/${browser}/js/content/workflow-recorder`,
                    emptyOutDir: false,
                    minify: false,
                    sourcemap: browser === 'firefox' ? 'inline' : false,
                    lib: {
                        entry: path.resolve(__dirname, 'src/assets/recording/content/workflow-recorder.js'),
                        formats: ['iife'],
                        name: 'WorkflowRecorder',
                        fileName: () => 'index.js',
                    },
                    rollupOptions: {
                        output: {
                            inlineDynamicImports: true,
                        },
                    },
                },
                define: {
                    'globalThis': 'globalThis',
                },
            });
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        chromeSafePlugin(),
        copyAssetsPlugin(),
        buildContentScriptPlugin(),
    ],

    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@components': path.resolve(__dirname, 'src/components'),
            '@assets': path.resolve(__dirname, 'src/assets'),
            '@styles': path.resolve(__dirname, 'src/assets/styles'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@context': path.resolve(__dirname, 'src/context'),
            '@hooks': path.resolve(__dirname, 'src/hooks'),
        },
    },

    build: {
        outDir: `dist/${browser}`,
        emptyOutDir: true,
        // Chrome Web Store requires human-readable code
        minify: false,
        sourcemap: browser === 'firefox' ? 'inline' : false,
        // Disable module preload polyfill — it references `document` which
        // crashes the background service worker.
        modulePreload: false,
        rollupOptions: {
            input: {
                popup: path.resolve(__dirname, 'popup.html'),
                background: path.resolve(__dirname, 'src/background/index.ts'),
            },
            output: {
                entryFileNames: 'js/[name]/index.js',
                chunkFileNames: 'js/chunks/[name].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.names?.[0]?.endsWith('.css')) {
                        return 'css/[name][extname]';
                    }
                    return 'assets/[name][extname]';
                },
                // Keep background service worker code separate from popup/UI chunks.
                // Shared modules used by both are duplicated into each context to
                // prevent the service worker from pulling in DOM-dependent code.
                manualChunks(id) {
                    // Popup-only: React, Ant Design, UI components
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                    // Let background and content script code stay in their own entries
                    return undefined;
                },
            },
        },
    },

    // Prevent Vite from using globalThis detection that violates CSP
    define: {
        'globalThis': 'globalThis',
    },

    css: {
        preprocessorOptions: {
            less: {
                javascriptEnabled: true,
            },
        },
    },
});
