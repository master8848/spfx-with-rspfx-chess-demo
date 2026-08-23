#!/usr/bin/env node
// Patches @mbsks/rspfx-compiler-rspack to enable Tailwind v4 via postcss-loader
// and fixes RspfxPlugin wasm rule overwrite. Re-run after every `bun install`.
// This is needed because rspfx 0.0.9 ships `styling:'tailwind'` as no-op.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync, readdirSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');

async function patchCompilerConfig(file) {
  let content = await readFile(file, 'utf8');
  let changed = false;

  if (!content.includes('postcssLoaderPath')) {
    content = content.replace(
      "const styleLoaderPath = require.resolve('style-loader');\nconst cssLoaderPath = require.resolve('css-loader');\nconst sassLoaderPath = require.resolve('sass-loader');",
      "const styleLoaderPath = require.resolve('style-loader');\nconst cssLoaderPath = require.resolve('css-loader');\nconst postcssLoaderPath = require.resolve('postcss-loader');\nconst sassLoaderPath = require.resolve('sass-loader');"
    );
    changed = true;
  }

  // Fix loader order: [style, css (importLoaders), postcss] - postcss must be rightmost
  const oldCss = "    rules.push({\n        test: /\\.css$/,\n        use: [styleLoaderPath, { loader: cssLoaderPath, options: { modules: { auto: true } } }]\n    });";
  const newCss = "    rules.push({\n        test: /\\.css$/,\n        use: [styleLoaderPath, { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 1 } }, { loader: postcssLoaderPath }]\n    });";
  if (content.includes(oldCss)) {
    content = content.replace(oldCss, newCss);
    changed = true;
  } else if (content.includes("[styleLoaderPath, { loader: postcssLoaderPath }, { loader: cssLoaderPath")) {
    // Fix wrong order from earlier patch: [style, postcss, css] -> [style, css, postcss]
    content = content.replace(
      "        use: [styleLoaderPath, { loader: postcssLoaderPath }, { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 1 } }]",
      "        use: [styleLoaderPath, { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 1 } }, { loader: postcssLoaderPath }]"
    );
    content = content.replace(
      "            { loader: postcssLoaderPath },\n            { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 2 } },",
      "            { loader: cssLoaderPath, options: { modules: { auto: true }, importLoaders: 2 } },\n            { loader: postcssLoaderPath },"
    );
    changed = true;
  }

  if (changed) {
    await writeFile(file, content, 'utf8');
    console.log(`patched ${file}`);
  }
}

async function patchRspackPlugin(file) {
  let content = await readFile(file, 'utf8');
  const oldRule = "            options.module = { ...options.module, rules: full.module?.rules };";
  const newRule = "            options.module = { ...options.module, rules: [...(options.module?.rules ?? []), ...(full.module?.rules ?? [])] };";
  if (content.includes(oldRule)) {
    content = content.replace(oldRule, newRule);
    await writeFile(file, content, 'utf8');
    console.log(`patched ${file}`);
  }
}

async function main() {
  // Find all copies of compiler config (hoisted + isolated)
  const patterns = [
    'node_modules/.bun/@mbsks+rspfx-compiler-rspack@0.0.9+c630354b2f2d8bcc/node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js',
    'node_modules/.bun/node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js',
    'node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js'
  ];
  for (const rel of patterns) {
    const full = resolve(ROOT, rel);
    if (existsSync(full)) {
      try { await patchCompilerConfig(full); } catch (e) { console.warn(`skip ${rel}: ${e.message}`); }
    }
  }

  const pluginPatterns = [
    'node_modules/.bun/@mbsks+rspfx-plugin@0.0.9+864bfab94e6ccb0a/node_modules/@mbsks/rspfx-plugin/dist/rspack.js',
    'node_modules/.bun/node_modules/@mbsks/rspfx-plugin/dist/rspack.js',
    'node_modules/@mbsks/rspfx-plugin/dist/rspack.js'
  ];
  for (const rel of pluginPatterns) {
    const full = resolve(ROOT, rel);
    if (existsSync(full)) {
      try { await patchRspackPlugin(full); } catch (e) { console.warn(`skip ${rel}: ${e.message}`); }
    }
  }

  // bun hoisting fix
  try {
    // dynamic import for mkdirSync
    const { mkdirSync } = await import('node:fs');
    const rspackDir = resolve(ROOT, 'node_modules/@rspack');
    if (!existsSync(rspackDir)) mkdirSync(rspackDir, { recursive: true });
    // core
    const coreLink = resolve(rspackDir, 'core');
    if (!existsSync(coreLink) || !lstatSync(coreLink).isSymbolicLink()) {
      const bunDir = resolve(ROOT, 'node_modules/.bun');
      if (existsSync(bunDir)) {
        const entries = readdirSync(bunDir);
        const corePkg = entries.find(n => n.startsWith('@rspack+core@'));
        const dsPkg = entries.find(n => n.startsWith('@rspack+dev-server@'));
        if (corePkg) {
          const target = resolve(bunDir, `${corePkg}/node_modules/@rspack/core`);
          if (existsSync(target)) {
            try { unlinkSync(coreLink); } catch {}
            symlinkSync(target, coreLink);
            console.log(`linked @rspack/core`);
          }
        }
        if (dsPkg) {
          const target = resolve(bunDir, `${dsPkg}/node_modules/@rspack/dev-server`);
          const devLink = resolve(rspackDir, 'dev-server');
          if (existsSync(target)) {
            try { unlinkSync(devLink); } catch {}
            symlinkSync(target, devLink);
            console.log(`linked @rspack/dev-server`);
          }
        }
      }
    }
  } catch (e) {
    console.warn(`rspack symlink fix failed: ${e.message}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
