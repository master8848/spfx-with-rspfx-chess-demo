# SPFx with RSPFX — Play Fish

> **This repository is a demo of [RSPFX](https://www.npmjs.com/package/@mbsks/rspfx-cli) (`@mbsks/rspfx`) — a modern, community toolchain for SharePoint Framework (SPFx) web parts.**
> It is *not* built with Microsoft's official `yo @microsoft/sharepoint` + Heft/webpack toolchain.
> Everything you see here — Solid.js UI, Tailwind v4, chess engine in WebAssembly, one config file — is possible because RSPFX has no framework or bundler lock-in.

The web part plays chess against **Stockfish 18 Lite** — a real chess engine
(via [stockfish.js](https://github.com/nmrugg/stockfish.js)) running in your
browser via WebAssembly (~7 MB, single-threaded, no special server headers
needed). The first build embedded a strong Rust chess engine, but it had no
small lite build for the browser — so the app now plays Stockfish 18 Lite
(~7 MB), which is still far beyond human strength. The UI is **Solid.js**
with **Tailwind v4** and **chessground** (the same board library lichess uses).

Games are saved to a **SharePoint list** (created automatically on first use) via
PnPjs; without a SharePoint context the web part gracefully falls back to a
localStorage "demo mode".

---

## Why RSPFX exists (and how it fixes the normal build chain)

Microsoft's official SPFx toolchain is **gulp + Heft + webpack**, and it has
three structural problems:

1. **Slow, legacy builds** — webpack with a decade-old plugin ecosystem. RSPFX is
   built on Rust-based bundlers and is **~5–10× faster** at both cold and
   incremental builds.
2. **Framework lock-in** — the official toolchain is React-only, and worse, it
   **hard-pins the React version** to whatever a given SPFx release ships
   (e.g. React 18 for SPFx 1.22+, React 17 for older releases). You cannot use
   React 19, or Vue, Svelte, Solid, Preact — even a newer React patch can break
   the official chain.
3. **Config sprawl** — gulpfile, Heft config, webpack config, tsconfig, plus
   version-specific patches. RSPFX is **one plugin inside your bundler config**.

### What RSPFX gives you instead

| Capability | Official Microsoft toolchain | RSPFX |
|---|---|---|
| Bundler | webpack (via Heft) | **Rspack (default), Vite, Rsbuild, Turbopack** |
| Build speed | webpack (interpreted, slow) | **Rust-based bundlers — ~5–10× faster** |
| Frontend framework | **React only** | **Any: React, Vue, Svelte, Solid, Preact, vanilla** |
| Framework version | **Hard-pinned by the SPFx release** (React 17/18) | **Any version of any framework** (this demo uses Solid.js 1.9) |
| Styling | SCSS (custom CSS pipeline) | **Tailwind v4, SCSS, or plain CSS** |
| Config | gulpfile + Heft + webpack + tsconfig | **One plugin in your bundler config** |
| Toolchain | Microsoft-only, React-only, webpack-only | **Bring your own bundler and framework** |
| SPFx versions | 1.20–1.23 (web parts) | 1.20–1.23 (web parts) |

Because RSPFX is just a plugin in your bundler config, the same project can be
built with Rspack, Vite, Rsbuild, or Turbopack (experimental) — and the
frontend can be **any framework at any version**, including the latest React 19,
which the official chain cannot run.

- Toolchain source: [github.com/mbsks/rspfx](https://github.com/mbsks/rspfx) *(public soon)*
- CLI: `npm i -g @mbsks/rspfx-cli`
- Scaffold a project: `rspfx new my-app --framework react --styling tailwind`

---

## The demo: Play Fish

### Features

- **Real engine in the browser** — Stockfish 18 Lite compiled to WebAssembly
  (embedded neural network, ~7 MB wasm, self-contained), single-threaded.
  Engine runs in a Web Worker so the UI never blocks; falls back to the main
  thread or random moves if workers are unavailable.
- **7 Elo levels** — Novice (700) → Stockfish (2800). Strength is scaled with
  time-per-move, MultiPV move pools and blunder probability, so every level plays
  naturally.
- **Full chess rules** — chess.js handles legality, castling, en passant,
  promotion picker, checkmate/stalemate/draw detection, PGN export.
- **chessground board** — drag & drop, piece-slide/capture animations, last-move
  and check highlights, legal-move dots, board flip, keyboard navigation.
- **SharePoint persistence** — games (PGN + move list + result + Elos) are saved
  to a `Chess Games` list created on demand; saved games can be reloaded onto the
  board, deleted, refreshed.
- **Animations & polish** — confetti on win, animated overlays, thinking timer,
  responsive layout, dark-mode aware, accessible (aria-live, keyboard).

### What this proves about the toolchain

- A **non-React framework** (Solid.js) with a **v1.9.x** version — something the
  official chain categorically cannot build.
- A **~7 MB WebAssembly asset** (Stockfish Lite) fetched at setup, copied into
  the bundle by a plugin — exercising code splitting, hashing and asset
  handling.
- **Tailwind v4** (PostCSS-based) alongside the framework bundle.
- A **Web Worker** engine thread — shows the bundler emitting worker chunks
  correctly.
- One config file (`rspack.config.ts`) drives the entire build.

## Prerequisites

- Node 20+, `pnpm` (or npm/yarn — lockfile is pnpm)
- Engine files are downloaded automatically on first `pnpm dev` / `pnpm build`
  (~7 MB Stockfish Lite; gitignored to keep the repo small) — no manual step
- SPFx 1.22-compatible tenant for the full demo (workbench works for UI only)

## Getting started

```sh
pnpm install
pnpm dev            # auto-fetches the ~7 MB Stockfish Lite engine if missing, then starts the HTTPS dev server + SharePoint workbench (:4321)
```

## Build / package / deploy

```sh
pnpm typecheck      # tsc --noEmit
pnpm build          # rspack production build → dist/
pnpm package        # → sharepoint/solution/spfx-chess.sppkg
pnpm deploy         # upload to the app catalog (RSPFX_ACCESS_TOKEN + RSPFX_APP_CATALOG_URL)
```

Deploy the `.sppkg` to the tenant app catalog, add the app to a site, and place
the **Play Fish** web part on a page. On first use the web part creates the
`Chess Games` list (with PGN/Moves/Result/WhiteElo/BlackElo/WhiteName/BlackName/Site
columns) if it does not exist, and reuses it afterwards. If the list or the site
permissions are unavailable, it silently falls back to demo mode.

## Updating the engine

The engine files live at `src/webparts/spfx-chess/engine/wasm/`
(`stockfish-18-lite-single.js` + `.wasm`). They are gitignored and
auto-downloaded by `pnpm dev`, `pnpm build`, and `pnpm package` whenever they
are missing — nothing to run by hand (dev only checks existence, so startup
stays fast; downloads themselves are always verified against the pinned
SHA-256). To verify the installed files against the pinned hashes:

```sh
pnpm check:engine
```

To force a re-download, or after bumping the version in
`scripts/engine-assets.mjs` (which also needs the new hashes — regenerate with
`shasum -a 256 <file>`), run:

```sh
pnpm engine:fetch
```

The files are copied verbatim into the build output by a post-build copy script
(`scripts/copy-engine-assets.mjs`). The engine is single-threaded, so no
COOP/COEP/SharedArrayBuffer headers are needed — SharePoint does not serve them.

## License / attribution

- This project is licensed under **GPL-3.0** (see `LICENSE`) because it embeds
  [stockfish.js](https://github.com/nmrugg/stockfish.js) (Stockfish 18 Lite,
  GPL-3.0) and [chessground](https://github.com/lichess-org/chessground)
  (GPL-3.0-or-later). Using them in a distributed solution means that solution
  must also be offered under GPL-3.0.
- The web part scaffold: MIT (RSPFX). The app itself is GPL-3.0 because it
  embeds Stockfish.js and chessground (both GPL-3.0).
- [chessground](https://github.com/lichess-org/chessground) (board rendering) — GPL-3.0-or-later.
- [chess.js](https://github.com/jhlywa/chess.js) (rules engine) — BSD-2-Clause.
- [cburnett](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces) chess piece artwork used by chessground's default style — CC-BY-SA 3.0.

## Theming & page chrome

- The web part automatically follows the SharePoint site theme (light/dark) via
  the theme provider: the site palette is mapped to CSS custom properties
  (`--sp-bg`, `--sp-card`, `--sp-text`, `--sp-muted`, `--sp-line`,
  `--sp-primary`, `--sp-primary-strong`, `--sp-accent-soft`) and a
  `data-theme="light|dark"` attribute, and updates live when the theme changes.
- The **Hide page chrome** web part property hides the suite bar and left nav
  best-effort (unsupported by Microsoft). As a documented alternative, appending
  `?env=WebView` or `?env=Embedded` to a page URL strips all page chrome —
  also undocumented by Microsoft.
