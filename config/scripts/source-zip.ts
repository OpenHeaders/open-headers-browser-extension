/**
 * Creates a source code zip for Firefox AMO submission.
 * Firefox requires reviewable source when the extension is built/bundled.
 *
 * Usage: npm run source-zip
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const RELEASES = path.join(ROOT, 'releases');
const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const EXCLUDE = [
    'node_modules/**',
    '.git/**',
    '.idea/**',
    '.claude/**',
    'dist/**',
    'build/**',
    'releases/**',
    'coverage/**',
    '.tmp/**',
    'manifests/safari/xcode_project/**',
    '.DS_Store',
    '*.log',
    '*.zip',
    '*.crx',
    '*.pem',
    '*.tgz',
    '.env*',
    '.eslintcache',
];

// ── Helpers ─────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`;
}

// ── Main ────────────────────────────────────────────────────────────

fs.mkdirSync(RELEASES, { recursive: true });

const outputPath = path.join(RELEASES, `open-headers-source-v${VERSION}.zip`);
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

console.log(`\n  Firefox Source Zip  v${VERSION}`);
console.log('  ' + '─'.repeat(40));
console.log(`  Excluding: node_modules, dist, .git, IDE files\n`);

output.on('close', () => {
    console.log(`  Created  ${formatSize(archive.pointer()).padStart(10)}  ${path.basename(outputPath)}`);
    console.log(`  Output: ${RELEASES}\n`);
});

archive.on('error', (err: Error) => {
    console.error('  Failed:', err.message, '\n');
    process.exit(1);
});

archive.on('warning', (err: Error & { code?: string }) => {
    if (err.code !== 'ENOENT') throw err;
});

archive.pipe(output);
archive.glob('**/*', { cwd: ROOT, ignore: EXCLUDE, dot: true });
archive.finalize();
