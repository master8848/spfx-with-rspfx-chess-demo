import { defineConfig } from 'vite';
import { rspfxVite } from '@mbsks/rspfx-plugin';
export default defineConfig({
  plugins: [rspfxVite({ name:'spfx-chess', framework:'solid' as const, spfxVersion:'1.22', version:'1.0.0', dev:{port:4321,https:true,hostname:'localhost',workbench:true,openBrowser:true}, build:{sourcemap:false,minify:true,splitChunks:false,outDir:'dist',releaseDir:'release'} })],
  assetsInclude: ['**/*.wasm'],
  worker: { format:'es' }
});
