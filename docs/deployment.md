# Deployment & project structure — spfx-chess (RSPFX)

> Demo app `spfx-chess` (Play Fish) built with Solid.js + Tailwind v4 + Stockfish Lite. One-line toolchain: `RspfxPlugin` in `rspack.config.ts`.

## Project structure file paths

| File path | Purpose |
|---|---|
| `config/serve.json` | Dev server (`initialPage` with `{tenantdomain}` + `${VAR}` expansion, `https`, `port`, `hostname`) — [serve schema](https://developer.microsoft.com/json-schemas/spfx-build/spfx-serve.schema.json), [Serve config docs](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/serve-configuration) |
| `config/package-solution.json` | Solution id/version/features/`paths.zippedPackage` — [package-solution schema](https://developer.microsoft.com/json-schemas/spfx-build/package-solution.schema.json) |
| `config/write-manifests.json` | Release `cdnBasePath` — [write-manifests schema](https://developer.microsoft.com/json-schemas/spfx-build/write-manifests.schema.json) |
| `config/config.json` | Optional explicit bundles/externals/localizedResources (when absent, folder scan used) |
| `src/webparts/spfx-chess/` | Web part folder — folder name = `bundleName` → `dist/spfx-chess.js` |
| `src/webparts/spfx-chess/spfx-chess.manifest.json` | Component manifest (`id`, `alias`, `version:"*"`, `supportedHosts`) |
| `src/webparts/spfx-chess/SpfxChessWebPart.ts` | Entrypoint (`pickEntrypoint` precedence: `index.ts` → `<name>WebPart.ts` → lone `*.ts`) |
| `teams/manifest.json` | Teams app manifest v1.13 — `id`/`entityId` = component `id`; icons `<id>_color.png` / `<id>_outline.png` |
| `dist/` | `build.outDir` — AMD bundles |
| `release/manifests/` + `release/assets/` | Production manifests + assets for packaging |
| `sharepoint/solution/spfx-chess.sppkg` | DEFLATE zip from `config/package-solution.json#paths.zippedPackage` — upload to app catalog |

Base lib reference: [`../spfx/docs/project-structure.md`](../../spfx/docs/project-structure.md) · [`../spfx/docs/building-packages.md`](../../spfx/docs/building-packages.md).

## Web part naming rules

- **Folder = bundleName**: `src/webparts/spfx-chess/` → `dist/spfx-chess.js`, `entryModuleId = "spfx-chess"`. Renaming the folder renames the bundle unless `config/config.json` `bundles.<name>` overrides it.
- **Manifest**: exactly one `*.manifest.json` per folder; convention `spfx-chess.manifest.json`. First lexicographic file wins.
- **Entrypoint**: `SpfxChessWebPart.ts` matched by `pickEntrypoint()`; `index.ts` would win if present.
- **ID sync**: `spfx-chess.manifest.json#id (bc14b852-5256-4137-bc0a-ef0ee88908ef)` must equal `teams/manifest.json#id` and `staticTabs[0].entityId` — Teams `contentUrl` embeds `componentId=<id>`.
- **Freely changeable**: `alias`, `preconfiguredEntries.title/description/group`, `packageName`, adding `supportedHosts`/`validDomains`. **Must stay in sync**: folder name ↔ bundleName ↔ `entryModuleId`, manifest `id` ↔ Teams `id`/`entityId`, `package.json#version` ↔ `solution.version` (4-part) on deploy.

## Deployment

```sh
pnpm build    # rspfx build → dist/ + release/
pnpm package  # rspfx package → sharepoint/solution/spfx-chess.sppkg
```

1. **Upload** `sharepoint/solution/spfx-chess.sppkg` to tenant app catalog `https://{tenantdomain}/sites/appcatalog` → *Apps for SharePoint* → **Deploy** (*Enable to all sites* when `skipFeatureDeployment:true`) — [Package and deploy](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/toolchain/package-and-deploy) · [Use app catalog](https://learn.microsoft.com/en-us/sharepoint/use-app-catalog) · [Tenant-scoped deployment](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/tenant-scoped-deployment).
2. **Add to site/page**: `Site Contents → Add an app` (skip if tenant-scoped) → edit page → `+` → **Play Fish** → Publish.
3. **Teams/Outlook**: catalog → **Sync to Teams** → Teams Admin Center → *Allowed* → `Teams → Apps → Built for your org` (also appears in new Outlook after sync) — [Integrate with Teams](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/integrate-with-teams-introduction) · [Teams manifest schema](https://learn.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema).
4. **Automated**: `RSPFX_ACCESS_TOKEN` + `RSPFX_APP_CATALOG_URL` → `pnpm deploy` (`rspfx deploy`).

Detailed pipeline: [`../spfx/docs/deployment.md`](../../spfx/docs/deployment.md).

## Env vars in `config/serve.json`

`serve.json` string values expand via dotenv + shell interpolation before `resolveServeSettings()`:

- `${VAR}` → `process.env[VAR]` or `""`
- `${VAR:-default}` / `${VAR-default}` → default when unset/empty
- `$VAR` → bare-dollar
- `.env` (`KEY=VALUE`) loaded first, no override if already set
- Special token `{tenantdomain}` in `initialPage` → replaced by `--tenant` / `dev.tenantUrl` / `SPFX_SERVE_TENANT_DOMAIN` (example here: `https://{tenantdomain}/_layouts/15/workbench.aspx`)

See base lib `docs/deployment.md` §10 and `packages/dev-runtime/src/project.ts:expandEnvVars` / `buildWorkbenchUrl`.
