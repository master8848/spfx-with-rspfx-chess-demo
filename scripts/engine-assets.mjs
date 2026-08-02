#!/usr/bin/env node
// Shared engine asset helpers. Downloads the Stockfish.js Lite engine
// (js + wasm) into src/webparts/spfx-chess/engine/wasm/ when files are
// missing. Plain Node 20+ script, no deps.
//
// CLI:
//   node scripts/engine-assets.mjs             # fetch only if missing (fast, no hashing)
//   node scripts/engine-assets.mjs --force     # re-download everything (hash-verified)
//   node scripts/engine-assets.mjs --check     # verify installed files against pinned SHA-256

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '18.0.8';
export const RELEASE = 'v18.0.0';
export const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'];

// SHA-256 of the expected files, pinned so a corrupted or tampered download
// is never shipped. Regenerate with `shasum -a 256 <file>` after bumping
// VERSION in this file.
export const EXPECTED_HASHES = {
  'stockfish-18-lite-single.js': '5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391',
  'stockfish-18-lite-single.wasm': 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'
};

export const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/webparts/spfx-chess/engine/wasm');

const UNPKG = (file) => `https://unpkg.com/stockfish@${VERSION}/bin/${file}`;
const GITHUB = (file) => `https://github.com/nmrugg/stockfish.js/releases/download/${RELEASE}/${file}`;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// Fast check — existence only. Used by dev/build so startup stays quick.
export function missingEngineFiles() {
  return FILES.filter((name) => !existsSync(resolve(OUT_DIR, name)));
}

// Full integrity check — reads and hashes every file.
// Returns the names of missing or corrupt files.
export async function checkEngineIntegrity() {
  const bad = [];
  for (const name of FILES) {
    const out = resolve(OUT_DIR, name);
    try {
      const data = await readFile(out);
      const actual = sha256(data);
      if (actual !== EXPECTED_HASHES[name]) {
        console.error(`engine: ${name}: hash mismatch (expected ${EXPECTED_HASHES[name].slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
        bad.push(name);
      }
    } catch {
      console.error(`engine: ${name}: missing`);
      bad.push(name);
    }
  }
  return bad;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Downloads are always verified against the pinned hash before being written.
async function fetchFile(name) {
  const expected = EXPECTED_HASHES[name];
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    for (const url of [UNPKG(name), GITHUB(name)]) {
      try {
        const data = await download(url);
        if (sha256(data) !== expected) {
          lastErr = new Error(`SHA-256 mismatch from ${url}`);
          console.error(`  failed: ${lastErr.message}`);
          continue;
        }
        return { data, url };
      } catch (err) {
        lastErr = err;
        console.error(`  failed: ${err.message}`);
      }
    }
  }
  throw lastErr;
}

// Fetches the engine if any file is missing (or all files when force).
// Returns the names of the files that were downloaded.
export async function ensureEngineAssets({ force = false } = {}) {
  const missing = force ? FILES : missingEngineFiles();
  if (missing.length === 0) {
    console.log('engine: assets present, nothing to fetch');
    return [];
  }
  await mkdir(OUT_DIR, { recursive: true });
  const fetched = [];
  for (const name of missing) {
    const { data, url } = await fetchFile(name);
    await writeFile(resolve(OUT_DIR, name), data);
    const size = (data.length / (1024 * 1024)).toFixed(2);
    console.log(`engine: wrote ${name} (${size} MB, sha256 ${sha256(data).slice(0, 12)}…) <- ${url}`);
    fetched.push(name);
  }
  return fetched;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const run = args.includes('--check')
    ? checkEngineIntegrity().then((bad) => {
        if (bad.length === 0) console.log('engine: all files present and hashes match');
        else {
          console.error(`engine: check failed (${bad.length} file(s)) — run "pnpm engine:fetch"`);
          process.exitCode = 1;
        }
      })
    : ensureEngineAssets({ force: args.includes('--force') }).then(() => console.log('engine: done.'));
  run.catch((err) => {
    console.error(`engine: failed: ${err.message}`);
    process.exit(1);
  });
}
