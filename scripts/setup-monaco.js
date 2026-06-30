// scripts/setup-monaco.js
//
// Runs automatically after `npm install` (see package.json "postinstall").
// Copies the prebuilt Monaco editor assets from node_modules/monaco-editor
// into public/monaco/vs, which is what index.html loads at runtime.
//
// public/monaco/ is in .gitignore (too large to commit — ~16 MB of files),
// so every fresh clone needs this step to regenerate it locally.
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC  = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
const DEST = path.join(__dirname, '..', 'public', 'monaco', 'vs');

function copyRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath  = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

if (!fs.existsSync(SRC)) {
    console.error('[setup-monaco] monaco-editor not found in node_modules — did npm install run correctly?');
    process.exit(1);
}

if (fs.existsSync(DEST)) {
    console.log('[setup-monaco] public/monaco/vs already exists, skipping copy.');
    process.exit(0);
}

console.log('[setup-monaco] Copying Monaco editor assets into public/monaco/vs ...');
copyRecursive(SRC, DEST);
console.log('[setup-monaco] Done.');