import { RspfxPlugin, rspfxResolve } from '@mbsks/rspfx-plugin';

export default {
  resolve: rspfxResolve(),
  module: {
    rules: [
      { test: /\.wasm$/, type: 'asset/resource' },
      // Native Rspack + Tailwind v4 per https://tailwindcss.com/docs/installation/framework-guides/rspack/react
      // Rspack handles CSS natively via type:"css" + postcss-loader (postcss.config.mjs -> @tailwindcss/postcss)
      // No custom TailwindFixPlugin — direct rspack rule, rspfx has no native tailwind handling
      {
        test: /\.css$/,
        use: ['postcss-loader'],
        type: 'css',
      },
    ],
  },
  plugins: [
    new RspfxPlugin({
      name: 'spfx-chess',
      version: '1.0.0',
      framework: 'solid',
      spfxVersion: '1.22',
      fluent: false,
      language: 'typescript',
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
