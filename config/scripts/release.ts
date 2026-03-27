/**
 * Release script — builds all browsers and packages them as .zip files.
 *
 * Usage:
 *   npm run release           # Build all + zip
 *   npm run release -- --skip-build  # Zip existing builds (skip npm run build)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');
const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const BROWSERS = ['chrome', 'firefox', 'edge', 'safari'] as const;

const skipBuild = process.argv.includes('--skip-build');

// ── Helpers ─────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
}

function zip(sourceDir: string, outputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(sourceDir)) {
            reject(new Error(`Missing: ${sourceDir}`));
            return;
        }

        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(archive.pointer()));
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

// ── Steps ───────────────────────────────────────────────────────────

async function build(): Promise<void> {
    if (skipBuild) {
        console.log('  Skipping build (--skip-build)\n');
        return;
    }

    console.log('  Building all browsers...\n');
    try {
        execSync('npm run build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
        console.log();
    } catch {
        console.error('\n  Build failed. Fix errors above and retry.\n');
        process.exit(1);
    }
}

async function package_(): Promise<void> {
    fs.mkdirSync(RELEASES, { recursive: true });

    console.log('  Packaging...\n');

    for (const browser of BROWSERS) {
        const sourceDir = path.join(DIST, browser);
        const zipPath = path.join(RELEASES, `open-headers-${browser}-v${VERSION}.zip`);

        if (!fs.existsSync(sourceDir)) {
            console.log(`    ${browser.padEnd(8)} skipped (not built)`);
            continue;
        }

        const bytes = await zip(sourceDir, zipPath);
        console.log(`    ${browser.padEnd(8)} ${formatSize(bytes).padStart(10)}  ${path.basename(zipPath)}`);
    }
}

function summary(): void {
    const files = fs.readdirSync(RELEASES)
        .filter(f => f.endsWith('.zip') && f.includes(`v${VERSION}`))
        .sort();

    if (files.length === 0) {
        console.log('\n  No packages created.\n');
        return;
    }

    console.log(`\n  Release v${VERSION} ready`);
    console.log('  ' + '─'.repeat(50));

    let totalSize = 0;
    for (const file of files) {
        const size = fs.statSync(path.join(RELEASES, file)).size;
        totalSize += size;
        console.log(`    ${formatSize(size).padStart(10)}  ${file}`);
    }
    console.log('  ' + '─'.repeat(50));
    console.log(`    ${formatSize(totalSize).padStart(10)}  total (${files.length} packages)`);
    console.log(`\n  Output: ${RELEASES}\n`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log(`\n  Open Headers Release  v${VERSION}`);
    console.log('  ' + '='.repeat(40) + '\n');

    try {
        await build();
        await package_();
        summary();
    } catch (error) {
        console.error('\n  Release failed:', (error as Error).message, '\n');
        process.exit(1);
    }
}

main();
