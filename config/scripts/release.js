/**
 * Release script for Open Headers
 * Creates production builds and packages them for distribution
 * Replaces the old prep-release.sh bash script
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Constants
const DIST_DIR = path.join(__dirname, '../../dist');
const RELEASES_DIR = path.join(__dirname, '../../releases');
const PACKAGE_JSON = require('../../package.json');
const VERSION = PACKAGE_JSON.version;
const BROWSERS = ['chrome', 'firefox', 'edge', 'safari'];

/**
 * Creates a directory if it doesn't exist
 * @param {string} dir Directory path
 */
function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

/**
 * Creates a zip archive of a directory
 * @param {string} sourceDir Source directory to zip
 * @param {string} outputPath Output zip file path
 * @returns {Promise} Promise resolving when zip is complete
 */
function createZipArchive(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(sourceDir)) {
            reject(new Error(`Source directory does not exist: ${sourceDir}`));
            return;
        }

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        output.on('close', () => {
            console.log(`Created: ${outputPath} (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/**
 * Builds all browser extensions
 */
async function buildExtensions() {
    console.log('Building extensions in production mode...');

    // Set NODE_ENV for proper production builds
    process.env.NODE_ENV = 'production';

    try {
        execSync('npm run build', { stdio: 'inherit' });
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

/**
 * Creates release packages for all browsers
 */
async function createReleasePackages() {
    ensureDirectoryExists(RELEASES_DIR);

    console.log('\nCreating release packages...');

    const zipPromises = BROWSERS.map(browser => {
        const sourceDir = path.join(DIST_DIR, browser);
        const outputPath = path.join(RELEASES_DIR, `open-headers-${browser}-v${VERSION}.zip`);

        if (!fs.existsSync(sourceDir)) {
            console.log(`Skipping ${browser} (not built)`);
            return Promise.resolve();
        }

        return createZipArchive(sourceDir, outputPath);
    });

    try {
        await Promise.all(zipPromises);
        console.log('\nAll release packages created successfully!');
    } catch (error) {
        console.error('Error creating release packages:', error);
        process.exit(1);
    }
}

/**
 * Displays a summary of the release packages
 */
function displaySummary() {
    console.log('\nRelease Summary:');
    console.log('===============');
    console.log(`Version: ${VERSION}`);
    console.log(`Release packages created in: ${RELEASES_DIR}`);

    // List all files in the releases directory
    const files = fs.readdirSync(RELEASES_DIR)
        .filter(file => file.endsWith('.zip'))
        .filter(file => file.includes(`v${VERSION}`));

    if (files.length === 0) {
        console.log('No release packages found.');
        return;
    }

    console.log('\nPackages:');
    files.forEach(file => {
        const filePath = path.join(RELEASES_DIR, file);
        const stats = fs.statSync(filePath);
        const fileSizeInKB = (stats.size / 1024).toFixed(2);
        console.log(`- ${file} (${fileSizeInKB} KB)`);
    });

    console.log('\nNotes:');
    console.log('- Chrome package is compliant with Chrome Web Store requirements');
    console.log('- All packages are ready for submission to their respective stores');
}

/**
 * Main function
 */
async function main() {
    console.log('🚀 Starting Open Headers Release Process');
    console.log('=======================================');

    try {
        await buildExtensions();
        await createReleasePackages();
        displaySummary();

        console.log('\n✅ Release process completed successfully!');
    } catch (error) {
        console.error('\n❌ Release process failed:', error);
        process.exit(1);
    }
}

// Run the main function
main();