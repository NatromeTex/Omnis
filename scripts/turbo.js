#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TURBO_MODULE_DIR_CANDIDATES = [
  path.join(ROOT, 'engine', 'turbomodules'),
  path.join(ROOT, 'engine', 'TurboModules'),
];

function resolveTurboModulesDir() {
  for (const dir of TURBO_MODULE_DIR_CANDIDATES) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return TURBO_MODULE_DIR_CANDIDATES[0];
}

const TURBO_MODULES_DIR = resolveTurboModulesDir();

const PATHS = {
  crypto: {
    source: path.join(TURBO_MODULES_DIR, 'crypto'),
    target: path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'omnis', 'app', 'crypto'),
  },
  media: {
    source: path.join(TURBO_MODULES_DIR, 'media'),
    target: path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'omnis', 'app', 'media'),
  },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyKtFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source folder not found: ${sourceDir}`);
  }

  ensureDir(targetDir);

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const kotlinFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.kt'));

  if (kotlinFiles.length === 0) {
    throw new Error(`No Kotlin files found in: ${sourceDir}`);
  }

  for (const file of kotlinFiles) {
    const fromPath = path.join(sourceDir, file.name);
    const toPath = path.join(targetDir, file.name);
    fs.copyFileSync(fromPath, toPath);
    console.log(`Copied ${fromPath} -> ${toPath}`);
  }
}

function init() {
  copyKtFiles(PATHS.crypto.source, PATHS.crypto.target);
  copyKtFiles(PATHS.media.source, PATHS.media.target);
  console.log('TurboModule Kotlin files synced to android.');
}

init();
