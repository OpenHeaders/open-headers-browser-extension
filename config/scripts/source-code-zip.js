const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const rootDir = path.join(__dirname, '..', '..');
const outputDir = path.join(rootDir, 'releases');
const version = require(path.join(rootDir, 'package.json')).version;
const zipFileName = `open-headers-source-v${version}.zip`;
const outputPath = path.join(outputDir, zipFileName);

// Ensure releases directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create a file stream for the output zip
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Patterns to exclude (using glob patterns)
const excludePatterns = [
  'node_modules/**',
  '.idea/**',
  '.claude/**',
  'dist/**',
  'build/**',
  'releases/**',
  '.git/**',
  '.DS_Store',
  '*.log',
  '*.zip',
  '*.crx',
  '*.pem',
  '.env*',
  'CLAUDE.md',
  'release-*.md',
  'manifests/safari/xcode_project/**',
  '.eslintcache',
  'coverage/**',
  '.tmp/**',
  '*.tgz'
];

// Listen for archive events
output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ Source code zip created successfully!`);
  console.log(`📦 File: ${outputPath}`);
  console.log(`📏 Size: ${sizeMB} MB`);
  console.log(`\n🦊 Ready for Firefox submission!`);
});

archive.on('error', (err) => {
  console.error('❌ Error creating zip:', err);
  throw err;
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('⚠️  Warning:', err);
  } else {
    throw err;
  }
});

// Pipe archive data to the file
archive.pipe(output);

console.log('📦 Creating source code zip for Firefox submission...');
console.log(`📝 Version: ${version}`);
console.log(`🚫 Excluding: node_modules, dist, build, IDE files, etc.\n`);

// Add the entire directory with exclusions
archive.glob('**/*', {
  cwd: rootDir,
  ignore: excludePatterns,
  dot: true // Include dot files (except those excluded)
});


// Finalize the archive
archive.finalize();