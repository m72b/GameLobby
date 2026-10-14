# Game Lobby

**Game Lobby** is a local-first desktop app for bringing installed PC games and emulator libraries together in one browsable library. It pairs a cover-art grid with store-aware launch routes, local metadata, custom covers, collections, and a separate settings window.

Game Lobby is an independent community project with its own name, codebase, and roadmap. It is not the official One Game Launcher app and is not affiliated with or endorsed by its developers.

## What it offers

- A dark, responsive, virtualized poster library with search, store filters, game details, and launch actions.
- Local SQLite storage for games, launch routes, settings, emulator profiles, and theme data.
- Installed-game discovery for Steam and Epic on Windows.
- Custom cover management and JSON library backup and restore.
- A separate settings window for library sources, appearance, emulator profiles, and remote MyUI themes.
- A narrow preload API between the Electron renderer and main process.

## Library and emulator support

The current built-in scanners read local Steam `appmanifest_*.acf` files and Epic `.item` manifests. They discover installed games and use store launch routes where available. Game Lobby does not request store credentials or currently retrieve a full catalog of games that are owned but not installed. Other storefronts may appear in the interface, but their importers are not yet implemented.

Emulator profiles can store an executable path, launch arguments, ROM folders, and supported file extensions. Automatic ROM discovery and launching are not yet wired into the current build.

## Extensions

Library integrations follow the `Importer` contract in `src/main/importers/types.ts`. An importer discovers games in the main process and returns normalized game records with one or more launch routes. The source registry currently lives in `src/main/index.ts`.

Community integrations are intended to use declarative manifests for identity and metadata. A manifest does not make downloaded code safe: third-party JavaScript should not be downloaded and executed inside the renderer or main process.

```json
{
  "id": "example-library",
  "name": "Example Library",
  "version": "1.0.0",
  "kind": "library",
  "store": "Custom"
}
```

## MyUI themes

Game Lobby ships with a built-in dark fallback theme. Additional themes can be loaded from HTTPS JSON or token-only CSS URLs and applied without restarting the app. Theme values are validated design tokens; remote CSS is not injected as executable stylesheet content. A theme may define its name, colors, font, corner radius, spacing, hover effect, and an HTTPS background image. Loaded theme data is cached locally for offline use.

Theme JSON example: [`themes/example.json`](themes/example.json). CSS themes should define supported `--token-name` values inside a `:root` block.

## Local data and privacy

The SQLite database is managed by `src/main/db/index.ts` and is stored in Electron's per-user application data directory. It uses write-ahead logging and foreign-key checks. JSON backups include game metadata, launch routes, settings, and emulator profiles. The app's built-in local scanners do not require store account credentials.

## License

Game Lobby uses a custom source-available license. It permits private modification and use, while restricting redistribution. Since the repository is public, GitHub users can still view and fork it through GitHub's service under GitHub's terms. See [`LICENSE`](LICENSE) for the full terms. This is not an OSI-approved open-source license.

## Project status

Game Lobby is an early-stage reconstruction. Steam and Epic local discovery, the core library interface, custom covers, local backups, emulator profile storage, and remote token-based themes are represented in the current build. Additional storefront importers, ROM scanning, richer metadata services, and broader plugin support remain future work.

## Acknowledgements

The project takes inspiration from the unified-library experience of [Playnite](https://playnite.link/) and the library presentation patterns of game storefronts. Game Lobby is an independent project and does not include or redistribute proprietary code or assets from those products.
