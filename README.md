# Game Lobby

**Game Lobby** is a local-first desktop app for bringing installed PC games and emulator libraries together in one browsable library. It pairs a cover-art grid with store-aware launch routes, local metadata, custom covers, collections, and a separate settings window.

Game Lobby is an independent community project with its own name, codebase, and roadmap. It is not the official One Game Launcher app and is not affiliated with or endorsed by its developers.

## What it offers

- A dark, responsive, virtualized poster library with search, store filters, game details, and launch actions.
- Local SQLite storage for games, launch routes, settings, emulator profiles, and theme data.
- Store library discovery with optional ownership imports for Steam, Epic, and GOG.
- Unified duplicate entries with a per-store “Play from” choice.
- Windows playtime tracking for launched games and sorting by last played or playtime.
- Custom cover management and JSON library backup and restore.
- A separate settings window for library sources, appearance, emulator profiles, and remote MyUI themes.
- A narrow preload API between the Electron renderer and main process.

## Library and emulator support

### Store libraries

The Windows scanners support these sources:

| Store | Current import method |
| --- | --- |
| Steam | Installed `appmanifest_*.acf` files; optional owned-game import through Steam Web API |
| Epic Games | Installed `.item` manifests; optional owned-game import through the Legendary CLI |
| GOG | Owned titles from the local GOG Galaxy database, with installed state when available |
| EA app, Battle.net, Ubisoft Connect, Amazon Games | Best-effort installed-game discovery from Windows registry and uninstall records |
| itch.io | Installed games found in the local itch app folders |
| Xbox / Microsoft Store | Best-effort installed game-package scan; package-name matching can miss games |

To import Steam ownership, enter a SteamID64 and Web API key in **Settings → Libraries**. Steam must make the profile's game details public for the API to return the library. The key is stored using Windows secure storage. For Epic ownership, install and sign in to [Legendary](https://github.com/legendary-gl/legendary), then select its executable in the same settings page. GOG Galaxy is auto-detected when possible; otherwise, select its database file.

Scanning combines routes when their stable source and external app identity match. Games with the same title remain separate unless a source provides a shared identity; use **Link another game** in a game's detail panel to manually combine cross-store duplicates. This avoids merging unrelated games such as different releases with identical names. Open a game's detail panel to choose **Play from** a particular store. Installed discovery for the other listed stores is local-only; those integrations do not retrieve complete online account catalogs.

Windows playtime tracking looks for a running process inside the selected game's install folder while Game Lobby is open. It records elapsed time and last-played time locally. Routes without a usable install folder can still update last-played when launched, but cannot be process-tracked.

Emulator profiles can store an executable path, launch arguments, ROM folders, and supported file extensions. Automatic ROM discovery and emulator launching are not yet wired into the current build.

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

The SQLite database is managed by `src/main/db/index.ts` and is stored in Electron's per-user application data directory. It uses write-ahead logging and foreign-key checks. JSON backups include game metadata, launch routes, settings, and emulator profiles. Only the optional Steam ownership import uses a credential entered in Game Lobby; the Steam API key is encrypted with Windows secure storage. Epic ownership uses the separately installed Legendary client and its existing sign-in.

## License

Game Lobby is licensed under the GNU General Public License v3.0 only (GPL-3.0-only). You may use, modify, and redistribute the project under that license. When you distribute a modified version, GPL-3.0 requires you to preserve the same freedoms and provide the corresponding source code. See [`LICENSE`](LICENSE) for the complete terms. Third-party dependencies retain their own licenses.

## Project status

Game Lobby is an early-stage independent project. Steam, Epic, GOG, and best-effort local discovery for the listed Windows storefronts are available, with ownership coverage varying by source as described above. Broader account-catalog imports, ROM scanning and launching, richer metadata services, and executable plugin support remain future work.

## Acknowledgements

The project takes inspiration from the unified-library experience of [Playnite](https://playnite.link/) and the library presentation patterns of game storefronts. Game Lobby is an independent project and does not include or redistribute proprietary code or assets from those products.
