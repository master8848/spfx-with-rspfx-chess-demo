#!/usr/bin/env node
// Copies the Stockfish Lite engine assets from src/ into dist/ next to the
// bundles, so the engine worker can fetch them at runtime. Plain Node, no deps.
// Usage: pnpm build (runs automatically after rspfx build)

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = resolve(ROOT, 'src/webparts/spfx-chess/engine/wasm');
const OUT_DIR = resolve(ROOT, 'dist');
const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const name of FILES) {
    const src = resolve(SRC_DIR, name);
    const out = resolve(OUT_DIR, name);
    await copyFile(src, out);
    const size = ((await stat(out)).size / (1024 * 1024)).toFixed(2);
    console.log(`copied ${name} -> dist/ (${size} MB)`);
  }
}

main().catch((err) => {
  console.error(`copy-engine-assets failed: ${err.message}`);
  process.exit(1);
});
