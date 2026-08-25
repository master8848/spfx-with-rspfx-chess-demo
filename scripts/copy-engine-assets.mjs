#!/usr/bin/env node
// Copies the Stockfish Lite engine assets from src/ into dist/ next to the
// bundles, so the engine worker can fetch them at runtime. Downloads the
// assets first if they are missing (fast existence check only — full SHA-256
// verification lives in `pnpm check:engine`). Plain Node, no deps.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, OUT_DIR, ensureEngineAssets } from './engine-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = resolve(ROOT, 'dist');

async function main() {
  await ensureEngineAssets();
  await mkdir(DIST_DIR, { recursive: true });
  const assetsDir = resolve(DIST_DIR, 'assets');
  await mkdir(assetsDir, { recursive: true });
  for (const name of FILES) {
    const src = resolve(OUT_DIR, name);
    const out = resolve(DIST_DIR, name);
    await copyFile(src, out);
    const size = ((await stat(out)).size / (1024 * 1024)).toFixed(2);
    console.log(`copied ${name} -> dist/ (${size} MB)`);
    const outAssets = resolve(assetsDir, name);
    await copyFile(src, outAssets);
    console.log(`copied ${name} -> dist/assets/ (${size} MB)`);
  }
}

main().catch((err) => {
  console.error(`copy-engine-assets failed: ${err.message}`);
  process.exit(1);
});
