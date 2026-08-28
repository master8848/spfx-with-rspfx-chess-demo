import { defineConfig } from 'vite';
import { rspfxVite } from '@mbsks/rspfx-plugin';
import solidPlugin from 'vite-plugin-solid';
export default defineConfig({
  plugins: [
    rspfxVite({
      name: 'spfx-chess',
      framework: 'solid' as const,
      spfxVersion: '1.22',
      version: '1.0.0',
      dev: { port: 4321, https: true, hostname: 'localhost', workbench: true, openBrowser: true },
      build: { sourcemap: false, minify: true, splitChunks: false, outDir: 'dist', releaseDir: 'release' },
    }),
    // solidPlugin must be here explicitly: rspfxVite's dynamic plugin injection via `config` hook
    // does not trigger Vite's config hooks for the injected plugin, so its resolve.conditions
    // and transform are missed. Adding it here ensures JSX is compiled and `solid` condition is set.
    solidPlugin(),
    // Fix @mbsks/rspfx-framework-solid preset that sets resolveExtensions to ['.tsx','.jsx'] only,
    // which breaks extensionless imports of .ts files like './engine/elo' (Rollup: Could not resolve).
    // And fix Rollup 4 compat: rspfx sets assetFileNames with [query] which is invalid in Rollup 4.
    // This plugin runs after rspfxVite and restores the full extension list.
    {
      name: 'fix-solid-resolve-extensions',
      config() {
        return {
          resolve: {
            extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
          },
          build: {
            rollupOptions: {
              output: {
                assetFileNames: 'assets/[hash][extname]',
              },
            },
          },
        };
      },
      configEnvironment(name, config) {
        config.resolve ??= {};
        const conds = (config.resolve.conditions ??= []);
        if (!conds.includes('solid')) conds.unshift('solid');
      },
    },
  ],
  assetsInclude: ['**/*.wasm'],
  worker: { format: 'es' },
});
