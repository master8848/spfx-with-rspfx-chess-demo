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
pnpm build          # rspack production build → dist/ + release/
pnpm package        # → sharepoint/solution/spfx-chess.sppkg
pnpm deploy         # upload to the app catalog (RSPFX_ACCESS_TOKEN + RSPFX_APP_CATALOG_URL)
```

Deploy the `.sppkg` to the tenant app catalog, add the app to a site, and place
the **Play Fish** web part on a page. On first use the web part creates the
`Chess Games` list (with PGN/Moves/Result/WhiteElo/BlackElo/WhiteName/BlackName/Site
columns) if it does not exist, and reuses it afterwards. If the list or the site
permissions are unavailable, it silently falls back to demo mode.

### Deployment steps in detail

1. **Build** — `pnpm build` (`rspfx build`) compiles `src/webparts/spfx-chess` via Rspack → `dist/spfx-chess.js` (AMD) + `release/manifests/<id>.manifest.json` + `release/assets/*`.
2. **Package** — `pnpm package` (`rspfx package`) zips the solution defined in `config/package-solution.json` → `sharepoint/solution/spfx-chess.sppkg` (DEFLATE zip, path from `paths.zippedPackage`).
3. **Upload to app catalog** — open the tenant app catalog `https://{tenantdomain}/sites/appcatalog` → `Apps for SharePoint` → drag-drop the `.sppkg` → **Deploy** / **Enable and add to all sites** (`skipFeatureDeployment:true` makes it tenant-scoped, required for *Sync to Teams*). See Microsoft Learn: [Publish SPFx solutions](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/package-and-deploy) · [Use the app catalog](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog) · [Tenant-scoped deployment](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/tenant-scoped-deployment).
4. **Add to site & page** — `Site Contents → Add an app → spfx-chess` (skipped when tenant-scoped) → edit a `Site Pages` page → `+` → search **Play Fish** (`preconfiguredEntries[0].title`) → Publish.
5. **Teams / Outlook** — when `teams/manifest.json` was present at package time the catalog shows **Sync to Teams**; select the app → *Sync to Teams* → in Teams Admin Center set *Allowed* → users add via `Teams → Apps → Built for your org` (personal `staticTabs`) or `Add to team` (`configurableTabs`); same app appears in new Outlook after 10–120 min sync. See [Integrate SPFx with Teams](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/integrate-with-teams-introduction) · [Teams manifest schema](https://learn.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema). Automated alternative: `pnpm deploy` / `rspfx deploy` with `RSPFX_ACCESS_TOKEN` + `RSPFX_APP_CATALOG_URL` env vars.

> Full pipeline reference: base lib [`docs/deployment.md`](../spfx/docs/deployment.md) and [`docs/project-structure.md`](../spfx/docs/project-structure.md).

### Env vars & tokens in `config/serve.json`

`config/serve.json` supports dotenv + shell expansion before `expandEnvVars()` resolves the workbench URL:

| Syntax | Meaning | Example |
|---|---|---|
| `${VAR}` | `process.env[VAR]` or `""` | `"initialPage": "https://${MY_TENANT}/_layouts/15/workbench.aspx"` |
| `${VAR:-default}` | default when unset/empty | `"initialPage": "https://${SPFX_TENANT:-contoso.sharepoint.com}/_layouts/15/workbench.aspx"` |
| `$VAR` | bare-dollar | `"hostname": "$HOSTNAME"` |
| `.env` file | `KEY=VALUE` loaded first (no override if already set) | `.env: SPFX_SERVE_TENANT_DOMAIN=contoso.sharepoint.com` |

Special token `{tenantdomain}` (case-insensitive) in `initialPage` → replaced by `dev.tenantUrl` / `SPFX_SERVE_TENANT_DOMAIN` / `--tenant`. Example used here: `https://{tenantdomain}/_layouts/15/workbench.aspx`. See [SPFx serve configuration](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/serve-configuration) and base lib `docs/deployment.md` §10.

## Project structure & file paths

| File path | Purpose | When created |
|---|---|---|
| `rspack.config.ts` | Rspack + `RspfxPlugin` (`name`, `framework`, `spfxVersion`, `teams`, `dev`, `build`). Single config drives the build. | Scaffolded |
| `config/serve.json` | Dev server: `initialPage` (`{tenantdomain}` token + env expansion), `https`, `port`, `hostname`. | Auto-created if missing |
| `config/package-solution.json` | Solution metadata (`solution.id`, `version` 4-part, `includeClientSideAssets`, `skipFeatureDeployment`, `developer`, `metadata`, `features`, `paths.zippedPackage`). | Required |
| `config/write-manifests.json` | Release `cdnBasePath` (empty → assets embedded via `ClientSideAssets/`, non-empty → external CDN). | Auto-created if missing |
| `config/config.json` | Optional explicit `bundles`/`externals`/`localizedResources`; when absent folder scan is used. | Auto-created if missing |
| `src/webparts/spfx-chess/` | Web part folder — **folder name = bundleName** (`scanComponentDir` enumerates `src/webparts/*`). | One per web part |
| `src/webparts/spfx-chess/spfx-chess.manifest.json` | Component manifest (`id` UUID, `alias`, `version:"*"`, `supportedHosts`, `preconfiguredEntries`). First `*.manifest.json` in folder wins. | One per web part |
| `src/webparts/spfx-chess/SpfxChessWebPart.ts` | Entrypoint class (`extends SolidWebPart`); resolved by `pickEntrypoint()` precedence (`index.ts` → `<name>WebPart.ts` → single `*.ts` fallback). | One per web part |
| `teams/manifest.json` | Teams app manifest v1.13 (`id`/`entityId` = component `id`, `validDomains`, tabs). Only when `teams: true` in `RspfxPlugin`. | Auto-created when `teams.enabled` |
| `teams/*_color.png` / `*_outline.png` | 192×192 / 32×32 Teams icons — filename `<id>_color.png` / `<id>_outline.png`. | With teams |
| `dist/` | Build output (`build.outDir`) — AMD bundle `dist/spfx-chess.js`, chunks. | `rspfx build` |
| `release/manifests/<id>.manifest.json` | Production manifests (`version:"*"` → `package.json` version, `loaderConfig.entryModuleId = bundleName`). | `assembleRelease()` |
| `release/assets/*` | Copy of `dist/` (no maps/manifests) embedded in `.sppkg` when `includeClientSideAssets:true`. | Same |
| `sharepoint/solution/spfx-chess.sppkg` | Solution package (DEFLATE zip) from `paths.zippedPackage`. Contains `AppManifest.xml`, `feature_*.xml`, `WebPart_*.xml`, `ClientSideAssets/*` + `teams/*`. | `rspfx package` |
| `sharepoint/solution/debug/` | Debug dump of zip entries. | Package |
| `.env` / `.env.local` | Optional dotenv for `serve.json` expansion (`SPFX_SERVE_TENANT_DOMAIN`, etc.). Gitignored. | User-provided |

More detail: [`docs/deployment.md`](../spfx/docs/deployment.md), [`docs/project-structure.md`](../spfx/docs/project-structure.md), official [Serve configuration](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/serve-configuration) and [Manifest schema](https://developer.microsoft.com/json-schemas/spfx/client-side-web-part-manifest.schema.json).

### Web part folder & naming rules

- **Folder = bundleName**. `src/webparts/spfx-chess/` → bundle `spfx-chess` → `dist/spfx-chess.js` → `loaderConfig.entryModuleId = "spfx-chess"` → `scriptResources["spfx-chess"].path = "spfx-chess.js"`. Renaming the folder renames the bundle (unless `config/config.json` `bundles` overrides it — then `bundles.<bundleName>.components[0].entrypoint` is authoritative; keep them equal to avoid confusion).
- **Manifest location**. `src/webparts/spfx-chess/spfx-chess.manifest.json` — exactly one `*.manifest.json` per folder. Convention repeats the folder name; if two exist the first lexicographic entry wins (`MULTIPLE_MANIFESTS` error when generating). See `scanComponentDir` / `generateComponentManifests` in base lib.
- **Entrypoint vs folder**. `SpfxChessWebPart.ts` is found by `pickEntrypoint()`: `index.ts` → `index.tsx` → `<folder>WebPart.ts` → `<folder>WebPart.tsx` → … → lone `*.ts` fallback. This repo uses `src/webparts/spfx-chess/SpfxChessWebPart.ts` (`<Pascal><WebPart>.ts` derived from folder `spfx-chess` → `SpfxChess`). `index.ts` would win if present.
- **ID sync with Teams manifest**. `src/webparts/spfx-chess/spfx-chess.manifest.json#id = bc14b852-5256-4137-bc0a-ef0ee88908ef` **must** equal `teams/manifest.json#id` and `staticTabs[0].entityId` (Teams `contentUrl` embeds `componentId=<id>`). Changing the web part `id` without regenerating `teams/manifest.json` breaks *Sync to Teams* (`Invalid Teams manifest`).
- **What can be changed freely vs must stay in sync**:

  | Field | Freely change? | Sync requirement |
  |---|---|---|
  | Folder `spfx-chess` | No (renames bundle) | `bundleName` → `dist/<bundle>.js` + `entryModuleId` |
  | Manifest filename | Yes if single file | Keep `<name>.manifest.json` |
  | `manifest.id` (UUID) | Generate once, freeze | Must match `teams/manifest.json#id` + `entityId`; unique globally, AMD `define('<id>_<version>',…)` |
  | `manifest.alias` | Yes | None |
  | `preconfiguredEntries[0].title/description/group` | Yes (page picker label) | None — `groupId` any GUID |
  | `supportedHosts` | Yes | At least one; include `TeamsPersonalApp`/`TeamsTab` for Teams |
  | `package.json#version` vs `package-solution.json#solution.version` | Bump together | `solution.version` 4-part is catalog upgrade key; `package.json` version is `_<version>` suffix |
  | `teams/manifest.json#packageName` | Yes (reverse-DNS) | Must be unique |
  | `teams/manifest.json#validDomains` | Add `*.outlook.office.com` etc. | Must include `*.sharepoint.com`, `*.office.com`, etc. or Teams white-screens |

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
