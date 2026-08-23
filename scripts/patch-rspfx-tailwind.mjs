#!/usr/bin/env node
// Patches @mbsks/rspfx-compiler-rspack to inject postcss-loader for Tailwind v4.
// RSPFX note: `rspfx build` calls createRspackConfig() directly, bypassing rspack.config.ts.
// Its CSS rules are generated inside the compiler package (style-loader/css-loader inlining
// for SPFx sppkg). Without this patch, @import "tailwindcss" is passed through raw and
// utilities never appear. The patch keeps style-loader inlining but adds postcss-loader
// (which loads postcss.config.mjs -> @tailwindcss/postcss). For `rspack build` the same
// fix is applied via rspack.config.ts TailwindPostCSSPatch at beforeRun stage 100.
// This script is idempotent and patches all bun-isolated copies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bunDir = path.join(root, 'node_modules/.bun');

const targets = new Set();

// Find all compiler-rspack dist/config.js under .bun
if (fs.existsSync(bunDir)) {
  for (const entry of fs.readdirSync(bunDir)) {
    if (!entry.startsWith('@mbsks+rspfx-compiler-rspack@')) continue;
    const p = path.join(bunDir, entry, 'node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js');
    if (fs.existsSync(p)) targets.add(p);
  }
  const dedup = path.join(bunDir, 'node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js');
  if (fs.existsSync(dedup)) targets.add(dedup);
}
// Also check pnpm-style .store if present
if (targets.size === 0) {
  console.warn('patch-rspfx-tailwind: no targets found (node_modules/.bun missing?)');
}

for (const file of targets) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  if (!src.includes('postcssLoaderPath')) {
    src = src.replace(
      "const styleLoaderPath = require.resolve('style-loader');\nconst cssLoaderPath = require.resolve('css-loader');\nconst sassLoaderPath = require.resolve('sass-loader');",
      "const styleLoaderPath = require.resolve('style-loader');\nconst cssLoaderPath = require.resolve('css-loader');\nconst postcssLoaderPath = require.resolve('postcss-loader');\nconst sassLoaderPath = require.resolve('sass-loader');"
    );
  }
  if (src.includes("use: [cssExtractLoader, { loader: cssLoaderPath, options: { modules: { auto: true } } }]")) {
    src = src.replace(
      "use: [cssExtractLoader, { loader: cssLoaderPath, options: { modules: { auto: true } } }]",
      "use: [cssExtractLoader, { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 1 } }, { loader: postcssLoaderPath }]"
    );
  }
  if (src.includes("importLoaders: 1 } },\n            { loader: sassLoaderPath")) {
    src = src.replace(
      "{ loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 1 } },\n            { loader: sassLoaderPath",
      "{ loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 2 } },\n            { loader: postcssLoaderPath },\n            { loader: sassLoaderPath"
    );
  }
  if (src !== orig) {
    fs.writeFileSync(file, src);
    console.log(`patched ${path.relative(root, file)}`);
  } else {
    console.log(`already patched ${path.relative(root, file)}`);
  }
}
