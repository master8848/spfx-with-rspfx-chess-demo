# Engine wasm assets

This folder holds the prebuilt chess engine shipped with the web part:

| File | Purpose |
| ---- | ------- |
| `stockfish-18-lite-single.js` | Emscripten UMD loader (classic web worker entry) |
| `stockfish-18-lite-single.wasm` | The compiled engine (~7 MB) |

## Provenance

Stockfish.js 18 Lite — single-threaded build from
https://github.com/nmrugg/stockfish.js — downloaded automatically by
`pnpm dev` / `pnpm build` / `pnpm package` when missing (downloads are
hash-verified). Verify the installed files with `pnpm check:engine`; run
`pnpm engine:fetch` to force a re-download.

License: GPL-3.0 (see https://github.com/nmrugg/stockfish.js).

## Why the Lite build

The Lite build is single-threaded, so it runs without special
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers,
which SharePoint pages do not set. It is loaded as a classic worker and
fetches its `.wasm` from the same directory as the `.js` file.

## Updating

Edit the version and hashes in `scripts/engine-assets.mjs` and run:

```sh
pnpm engine:fetch
```

This re-downloads both files into this folder (they are gitignored).
