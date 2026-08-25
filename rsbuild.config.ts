import { defineConfig } from '@rsbuild/core';
import { rspfxRsbuild } from '@mbsks/rspfx-plugin';

export default defineConfig({
  plugins: [
    rspfxRsbuild({
      name: 'spfx-chess',
      version: '1.0.0',
      framework: 'solid' as const,
      spfxVersion: '1.22',
      dev: { port: 4321, https: true, hostname: 'localhost', workbench: true, openBrowser: true },
      build: { sourcemap: false, minify: true, outDir: 'dist', releaseDir: 'release' },
    }),
  ],
  output: { injectStyles: true },
});
