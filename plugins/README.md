# Library plugins

Implement `Importer` from `src/main/importers/types.ts` and return normalized game entries and launch routes. Add the importer to the scan list in `src/main/index.ts`. Keep store-specific discovery in the main process, validate paths, and never run third-party JavaScript downloaded from a plugin index.
