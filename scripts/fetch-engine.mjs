#!/usr/bin/env node
// Downloads the Stockfish.js Lite engine (js + wasm) into
// src/webparts/spfx-chess/engine/wasm/. Plain Node 20+ script, no deps.
// Usage: pnpm engine:fetch

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '18.0.8';
const RELEASE = 'v18.0.0';
const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/webparts/spfx-chess/engine/wasm');

const UNPKG = (file) => `https://unpkg.com/stockfish@${VERSION}/bin/${file}`;
const GITHUB = (file) => `https://github.com/nmrugg/stockfish.js/releases/download/${RELEASE}/${file}`;

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchFile(name) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const url of [UNPKG(name), GITHUB(name)]) {
      try {
        return { data: await download(url), url };
      } catch (err) {
        lastErr = err;
        console.error(`  failed: ${err.message}`);
      }
    }
  }
  throw lastErr;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const name of FILES) {
    const { data, url } = await fetchFile(name);
    const out = resolve(OUT_DIR, name);
    await writeFile(out, data);
    const size = (data.length / (1024 * 1024)).toFixed(2);
    console.log(`wrote ${out} (${size} MB) <- ${url}`);
  }
  console.log('engine:fetch complete.');
}

main().catch((err) => {
  console.error(`engine:fetch failed: ${err.message}`);
  process.exit(1);
});
