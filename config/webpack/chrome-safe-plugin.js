/**
 * Webpack plugin to ensure Chrome Web Store compliance
 * Removes patterns that Chrome considers obfuscated
 */
class ChromeSafePlugin {
    apply(compiler) {
        compiler.hooks.compilation.tap('ChromeSafePlugin', (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: 'ChromeSafePlugin',
                    stage: compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY
                },
                (assets) => {
                    Object.keys(assets).forEach(filename => {
                        if (filename.endsWith('.js')) {
                            const asset = assets[filename];
                            let source = asset.source();
                            
                            // Only process if source is a string
                            if (typeof source === 'string') {
                                // Replace webpack's Function constructor usage
                                source = source.replace(
                                    /return this \|\| new Function\('return this'\)\(\)/g,
                                    'return this || globalThis || self || window'
                                );
                                
                                // Remove any source map references
                                source = source.replace(/\/\/# sourceMappingURL=.+$/gm, '');
                                
                                // Update the asset
                                const { RawSource } = compiler.webpack.sources;
                                assets[filename] = new RawSource(source);
                            }
                        }
                    });
                }
            );
        });
    }
}

module.exports = ChromeSafePlugin;