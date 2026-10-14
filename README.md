# Game Lobby

Game Lobby is a local-first Electron game library and launcher. It provides a virtualized poster grid, local SQLite storage, Steam and Epic installed-game scans, custom covers, a separate Settings window, emulator profile storage, JSON backup/restore, and runtime MyUI themes.

## Requirements

- Windows 10/11 (the Steam and Epic local scanners target Windows)
- Node.js 22 or newer and npm
- Python and a C++ build toolchain may be needed if `better-sqlite3` must compile for your Electron version

## Run from source

```powershell
npm install
npm run dev
```

Electron 42 and newer download the Electron executable on demand. The `predev` hook runs Electron's installer before starting Vite. If the binary download was interrupted, run `npx install-electron --no` from the project folder, then rerun `npm run dev`.

Build the app with `npm run build`; package an installer and portable build with `npm run dist`. The SQLite database and custom covers are stored under Electron's per-user `userData` directory.

## Current integration behavior

Steam scans installed `appmanifest_*.acf` files and Steam library folders. Epic scans local `.item` manifests. Both use store launch URIs where available and use Steam's public CDN for library cover images. This build does not ask for account credentials or scrape uninstalled account-owned catalogs. Other stores are represented in the source list and can be implemented as plugins. ROM folder settings are stored per emulator profile; ROM scanning is a placeholder in this recovery build.

## Library plugin format

The plugin interface is in `src/main/importers/types.ts`. Built-in integrations implement `Importer.scan()` and return canonical `Game` records with one or more launch `routes`. Extend the source registry in `src/main/index.ts` to run an importer during library scans. A community plugin manifest should declare metadata only; do not execute downloaded JavaScript in the renderer or main process.

Example declarative manifest:

```json
{
  "id": "example-library",
  "name": "Example Library",
  "version": "1.0.0",
  "kind": "library",
  "store": "Custom"
}
```

## MyUI remote themes

Themes are loaded at runtime from HTTPS JSON or token-only CSS. See `themes/example.json` and `themes/example.css`. JSON may set `name`, `bg`, `surface`, `surface2`, `accent`, `text`, `muted`, `radius`, `gap`, `font`, `hover`, and an HTTPS `backgroundImage`. CSS themes must place supported `--token-name: value` variables inside `:root { ... }`. Values are parsed and validated; theme CSS is not injected as executable style content. Themes are saved locally in SQLite after loading.

The plugin directory supports future library integration manifests. The layout follows the separation of library integrations, metadata sources, and themes used by community launcher catalogs such as [Playnite add-ons](https://playnite.link/addons.html).

## Security notes

The renderer has no Node integration. It communicates through the narrow typed preload API. Remote themes are fetched as data and sanitized to validated design tokens. Review integrations before enabling any third-party store access.
