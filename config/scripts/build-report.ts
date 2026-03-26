/**
 * Post-build report — prints size breakdown for all built browsers.
 * Runs automatically via the `postbuild` npm hook.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const BROWSERS = ['chrome', 'firefox', 'edge', 'safari'] as const;

interface FileInfo {
    name: string;
    size: number;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
}

function getFiles(dir: string, prefix = ''): FileInfo[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: FileInfo[] = [];
    for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...getFiles(path.join(dir, entry.name), rel));
        } else {
            files.push({ name: rel, size: fs.statSync(path.join(dir, entry.name)).size });
        }
    }
    return files;
}

function printBrowserReport(browser: string): void {
    const distDir = path.join(DIST, browser);
    if (!fs.existsSync(distDir)) {
        console.log(`  ${browser.padEnd(8)} skipped (not built)`);
        return;
    }

    const manifestPath = path.join(distDir, 'manifest.json');
    let version = '?';
    if (fs.existsSync(manifestPath)) {
        try {
            version = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
        } catch { /* ignore */ }
    }

    const files = getFiles(distDir);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const jsFiles = files.filter(f => f.name.endsWith('.js'));
    const cssFiles = files.filter(f => f.name.endsWith('.css'));
    const jsSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
    const cssSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
    const otherSize = totalSize - jsSize - cssSize;

    console.log(`  ${browser.padEnd(8)} v${version}  ${formatSize(totalSize).padStart(10)}  (JS ${formatSize(jsSize)}, CSS ${formatSize(cssSize)}, other ${formatSize(otherSize)})`);

    // Show largest JS files
    const sorted = jsFiles.sort((a, b) => b.size - a.size).slice(0, 5);
    for (const f of sorted) {
        console.log(`           ${formatSize(f.size).padStart(10)}  ${f.name}`);
    }
}

// ── Main ────────────────────────────────────────────────────────────

console.log('\n  Build Report');
console.log('  ' + '─'.repeat(60));

let anyBuilt = false;
for (const browser of BROWSERS) {
    if (fs.existsSync(path.join(DIST, browser))) {
        anyBuilt = true;
        printBrowserReport(browser);
        console.log();
    }
}

if (!anyBuilt) {
    console.log('  No builds found. Run `npm run build` first.\n');
}
