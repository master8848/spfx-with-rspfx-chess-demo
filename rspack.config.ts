import { RspfxPlugin, rspfxResolve } from '@mbsks/rspfx-plugin';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcssLoaderPath = require.resolve('postcss-loader');

/**
 * Minimal PostCSS fix for Tailwind v4 + SPFx.
 * SPFx bundles must inline CSS via style-loader/css-loader (no external .css in sppkg),
 * so the native Rspack `type:"css"` approach from the Tailwind docs breaks SPFx.
 * This plugin patches the css/scss rules created by RspfxPlugin (via createRspackConfig)
 * to inject postcss-loader (which loads postcss.config.mjs -> @tailwindcss/postcss).
 * Runs at stage 100 so it executes after RspfxPlugin's beforeRun (default stage 0) that
 * overlays the full compiler config. Works for `rspack build`/`rspack dev` via RspfxPlugin.
 * For `rspfx build` (direct createRspackConfig, bypasses rspack.config.ts) the companion
 * patch in node_modules/@mbsks/rspfx-compiler-rspack/dist/config.js injects the same loader.
 */
class TailwindPostCSSPatch {
  apply(compiler: any) {
    const patch = () => {
      const rules: any[] = compiler.options?.module?.rules ?? [];
      for (const rule of rules) {
        const testStr = String(rule.test ?? '');
        const isCss = testStr.includes('\\.css') && !testStr.includes('s[ac]ss');
        const isScss = testStr.includes('s[ac]ss') || testStr.includes('scss') || testStr.includes('sass');
        if (!isCss && !isScss) continue;
        if (!Array.isArray(rule.use)) continue;
        // avoid double-patch
        if (rule.use.some((u: any) => typeof u === 'string' ? u.includes('postcss-loader') : String(u?.loader ?? '').includes('postcss-loader'))) continue;
        // find css-loader index
        const cssIdx = rule.use.findIndex((u: any) => {
          const l = typeof u === 'string' ? u : u?.loader ?? '';
          return String(l).includes('css-loader');
        });
        if (cssIdx === -1) continue;
        // ensure importLoaders accounts for postcss (and sass)
        const cssUse = rule.use[cssIdx];
        if (cssUse && typeof cssUse === 'object' && cssUse.options) {
          const extra = isScss ? 2 : 1;
          cssUse.options.importLoaders = Math.max(cssUse.options.importLoaders ?? 0, extra);
        }
        const postcssEntry: any = { loader: postcssLoaderPath };
        // for scss, insert after css-loader but before sass-loader (which is last)
        // css: [style, css, postcss]
        // scss: [style, css, postcss, sass] -> insert at cssIdx+1
        rule.use.splice(cssIdx + 1, 0, postcssEntry);
      }
    };
    // stage 100 runs after RspfxPlugin (stage 0) which creates the rules
    compiler.hooks.beforeRun.tapPromise({ name: 'tailwind-postcss-patch', stage: 100 }, async () => { patch(); });
    compiler.hooks.watchRun.tapPromise({ name: 'tailwind-postcss-patch', stage: 100 }, async () => { patch(); });
  }
}

export default {
  resolve: rspfxResolve(),
  module: {
    rules: [
      { test: /\.wasm$/, type: 'asset/resource' },
    ],
  },
  plugins: [
    new TailwindPostCSSPatch(),
    new RspfxPlugin({
      name: 'spfx-chess',
      version: '1.0.0',
      framework: 'solid',
      spfxVersion: '1.22',
      dev: {
        port: 4321,
        https: true,
        hostname: 'localhost',
        workbench: true,
        openBrowser: true,
      },
      build: {
        sourcemap: false,
        minify: true,
        splitChunks: false,
        outDir: 'dist',
        releaseDir: 'release',
      },
    }),
  ],
};
