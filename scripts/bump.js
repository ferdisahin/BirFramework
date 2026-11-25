#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const pkgPath = resolve(rootDir, 'package.json');
const lockPath = resolve(rootDir, 'package-lock.json');
const versionTsPath = resolve(rootDir, 'src/version.ts');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version;

let targetVersion = process.argv[2];

if (!targetVersion) {
  // Default to patch bump
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  targetVersion = `${major}.${minor}.${patch + 1}`;
} else if (targetVersion === 'patch') {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  targetVersion = `${major}.${minor}.${patch + 1}`;
} else if (targetVersion === 'minor') {
  const [major, minor] = currentVersion.split('.').map(Number);
  targetVersion = `${major}.${minor + 1}.0`;
} else if (targetVersion === 'major') {
  const [major] = currentVersion.split('.').map(Number);
  targetVersion = `${major + 1}.0.0`;
}

console.log(`\n🚀 Bumping BirFramework: v${currentVersion} -> v${targetVersion}\n`);

// 1. Update package.json
pkg.version = targetVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`✔ Updated package.json to ${targetVersion}`);

const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
lock.version = targetVersion;
lock.packages[''].version = targetVersion;
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
console.log(`✔ Updated package-lock.json to ${targetVersion}`);


// 2. Update src/version.ts
writeFileSync(versionTsPath, `export const VERSION = '${targetVersion}';\n`, 'utf-8');
console.log(`✔ Updated src/version.ts to ${targetVersion}`);

// 3. Build & Test
console.log('\n🔨 Compiling and running tests...');
execSync('npm run build && npm test', { stdio: 'inherit', cwd: rootDir });

console.log(`\n✨ Version bumped to ${targetVersion} successfully!`);
console.log(`\nNext steps:`);
console.log(`  git add . && git commit -m "chore: release v${targetVersion}" && git push`);
console.log(`  npm publish --access public\n`);
