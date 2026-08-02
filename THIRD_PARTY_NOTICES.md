# Third-Party Notices

This project incorporates components from the following third parties. Each entry
lists the component name, its license, and its purpose within this project.

## Runtime / source components

- **Stockfish.js / Stockfish 18 Lite** — GPL-3.0 — chess engine, downloaded at
  build time via `pnpm engine:fetch` (not committed);
  upstream: https://github.com/nmrugg/stockfish.js;
  engine copyright Chess.com, LLC (c) 2026; based on Stockfish
  (T. Romstad, M. Costalba, J. Kiiski, G. Linscott and others);
  nets by Linmiao Xu (linrock)
- **chess.js** — BSD-2-Clause — move legality and rules engine
- **chessground** — GPL-3.0-or-later — board rendering; cburnett piece artwork
  CC-BY-SA 3.0
- **Solid.js** — MIT — reactive UI library
- **Tailwind CSS v4** — MIT — styling
- **PnPjs (`@pnp/sp`)** — MIT — SharePoint list persistence
- **TanStack Solid Query / Table** — MIT — server-state and data tables

## Tooling

- **RSPFX toolchain** — MIT — build tooling (`@mbsks/rspfx-*` packages)
- **Microsoft SPFx packages** — property of Microsoft, distributed under the
  Microsoft Software License Terms (as shipped by npm)

---

The Stockfish engine files are fetched at setup time (`pnpm engine:fetch`) and
are not shipped in this repository.

This project itself is licensed under **GPL-3.0** (see `LICENSE`).
