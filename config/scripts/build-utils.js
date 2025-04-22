/**
 * Utility script for post-processing build files
 * This is a replacement for the old build.js, but without code obfuscation
 * to comply with Chrome Web Store requirements
 */

const fs = require('fs');
const path = require('path');

/**
 * Reports information about generated files
 */
function reportBuildInfo() {
    const browsers = ['chrome', 'firefox', 'edge', 'safari'];

    console.log('Build Information:');
    console.log('=================');

    browsers.forEach(browser => {
        const distDir = path.join(__dirname, '../../dist', browser);

        if (!fs.existsSync(distDir)) {
            console.log(`${browser.toUpperCase()}: Not built`);
            return;
        }

        const backgroundFile = path.join(distDir, 'js/background/index.js');
        const popupFile = path.join(distDir, 'js/popup/index.js');
        const manifestFile = path.join(distDir, 'manifest.json');

        console.log(`\n${browser.toUpperCase()}:`);

        if (fs.existsSync(backgroundFile)) {
            const stats = fs.statSync(backgroundFile);
            console.log(`- Background script: ${(stats.size / 1024).toFixed(2)} KB`);
        } else {
            console.log('- Background script: Not found');
        }

        if (fs.existsSync(popupFile)) {
            const stats = fs.statSync(popupFile);
            console.log(`- Popup script: ${(stats.size / 1024).toFixed(2)} KB`);
        } else {
            console.log('- Popup script: Not found');
        }

        if (fs.existsSync(manifestFile)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
                console.log(`- Manifest version: ${manifest.manifest_version}`);
                console.log(`- Extension version: ${manifest.version}`);
            } catch (e) {
                console.log('- Error reading manifest');
            }
        } else {
            console.log('- Manifest: Not found');
        }
    });

    console.log('\nBuild process completed successfully!');
    console.log('Note: Code obfuscation has been removed to comply with Chrome Web Store requirements.');
}

/**
 * Main function
 */
function main() {
    reportBuildInfo();
}

// Run the main function
main();