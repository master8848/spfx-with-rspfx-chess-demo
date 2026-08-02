# Engine wasm assets

This folder holds the prebuilt chess engine shipped with the web part:

| File | Purpose |
| ---- | ------- |
| `stockfish-18-lite-single.js` | Emscripten UMD loader (classic web worker entry) |
| `stockfish-18-lite-single.wasm` | The compiled engine (~7 MB) |

## Provenance

Stockfish.js 18 Lite — single-threaded build from
https://github.com/nmrugg/stockfish.js — downloaded via
`pnpm engine:fetch`.

License: GPL-3.0 (see https://github.com/nmrugg/stockfish.js).

## Why the Lite build

The Lite build is single-threaded, so it runs without special
`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers,
which SharePoint pages do not set. It is loaded as a classic worker and
fetches its `.wasm` from the same directory as the `.js` file.

## Updating

Edit the version in `scripts/fetch-engine.mjs` and run:

```sh
pnpm engine:fetch
```

This re-downloads both files into this folder (they are gitignored).
