import { RspfxPlugin } from '@mbsks/rspfx-plugin';

export default {
  mode: 'development',
  module: {
    rules: [
      { test: /\.wasm$/, type: 'asset/resource' }
    ]
  },
  plugins: [
    new RspfxPlugin({
      name: 'spfx-chess',
      version: '1.0.0',
      framework: 'solid',
      spfxVersion: '1.22',
      fluent: false,
      language: 'typescript',
      styling: 'tailwind',
      dev: {
        port: 4321,
        https: true,
        hostname: 'localhost',
        workbench: true,
        openBrowser: true
      },
      build: {
        sourcemap: false,
        minify: true,
        splitChunks: false,
        outDir: 'dist',
        releaseDir: 'release'
      }
    })
  ]
};
