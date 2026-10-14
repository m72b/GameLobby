# Database

`src/main/db/index.ts` owns the SQLite schema and migrations. The database is created in Electron's user data folder with WAL mode and foreign-key checks enabled. JSON backups preserve game metadata, routes, settings and emulator profiles.
