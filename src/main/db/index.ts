import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EmulatorProfile, Game, GameRoute, LibraryConnectionInput, LibraryConnections, Settings } from '../../shared/types'
import { defaultSettings } from '../../shared/defaults'

let db: Database.Database
export function database() {
  if (!db) {
    const file = join(app.getPath('userData'), 'library.sqlite')
    mkdirSync(dirname(file), { recursive: true })
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(`CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,title TEXT NOT NULL COLLATE NOCASE UNIQUE,cover TEXT,defaultCover TEXT,store TEXT NOT NULL,genre TEXT,playtimeMinutes INTEGER NOT NULL DEFAULT 0,playtimeSeconds INTEGER NOT NULL DEFAULT 0,lastPlayed INTEGER,hidden INTEGER NOT NULL DEFAULT 0,favorite INTEGER NOT NULL DEFAULT 0,routes TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS emulators(id TEXT PRIMARY KEY,name TEXT NOT NULL,executable TEXT NOT NULL,args TEXT NOT NULL,romFolders TEXT NOT NULL,extensions TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY,manifest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_connections(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS secrets(key TEXT PRIMARY KEY,value BLOB NOT NULL);`)
    const gameColumns = new Set((db.pragma('table_info(games)') as Array<{ name: string }>).map(column => column.name))
    if (!gameColumns.has('playtimeSeconds')) {
      db.exec('ALTER TABLE games ADD COLUMN playtimeSeconds INTEGER NOT NULL DEFAULT 0')
      db.exec('UPDATE games SET playtimeSeconds=playtimeMinutes*60')
    }
    db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('app', JSON.stringify(defaultSettings))
  }
  return db
}

export function allGames(): Game[] {
  return database().prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE').all().map((r: any) => ({
    id: r.id, title: r.title, cover: r.cover || undefined, defaultCover: r.defaultCover || undefined,
    store: r.store, genre: r.genre || undefined, playtimeMinutes: Math.floor((r.playtimeSeconds ?? r.playtimeMinutes * 60) / 60),
    playtimeSeconds: r.playtimeSeconds ?? r.playtimeMinutes * 60, lastPlayed: r.lastPlayed || undefined,
    hidden: !!r.hidden, favorite: !!r.favorite, routes: JSON.parse(r.routes || '[]')
  }))
}

function persistGame(game: Partial<Game> & { id: string }) {
  const old = database().prepare('SELECT * FROM games WHERE id=?').get(game.id) as any
  const toNumber = (value: unknown, fallback: number) => {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : fallback
  }
  const toStringOrNull = (value: unknown, fallback: string | null) => {
    if (typeof value === 'string') return value
    if (value == null) return fallback
    if (typeof value === 'number' || typeof value === 'bigint') return String(value)
    if (typeof value === 'object' && 'URL' in value && typeof value.URL === 'string') return value.URL
    return fallback
  }
  const previousSeconds = toNumber(old?.playtimeSeconds, toNumber(old?.playtimeMinutes, 0) * 60)
  const importedSeconds = game.playtimeSeconds ?? (game.playtimeMinutes === undefined ? previousSeconds : toNumber(game.playtimeMinutes, 0) * 60)
  const seconds = toNumber(importedSeconds, previousSeconds)
  const previousTitle = toStringOrNull(old?.title, 'Untitled') || 'Untitled'
  const previousStore = toStringOrNull(old?.store, 'Custom') || 'Custom'
  const cover = toStringOrNull(game.cover, toStringOrNull(old?.cover, null))
  const defaultCover = toStringOrNull(game.defaultCover, toStringOrNull(old?.defaultCover, null))
  const genre = toStringOrNull(game.genre, toStringOrNull(old?.genre, null))
  const lastPlayed = game.lastPlayed == null ? old?.lastPlayed ?? null : toNumber(game.lastPlayed, 0)
  const currentRoutes = Array.isArray(game.routes) ? game.routes : JSON.parse(old?.routes || '[]')
  const row = {
    id: String(game.id), title: toStringOrNull(game.title, previousTitle) || previousTitle, cover,
    defaultCover, store: toStringOrNull(game.store, previousStore) || previousStore,
    genre, playtimeSeconds: seconds, playtimeMinutes: Math.floor(seconds / 60),
    lastPlayed: lastPlayed == null ? null : toNumber(lastPlayed, 0),
    hidden: game.hidden === undefined ? Number(!!old?.hidden) : Number(!!game.hidden),
    favorite: game.favorite === undefined ? Number(!!old?.favorite) : Number(!!game.favorite),
    routes: JSON.stringify(currentRoutes)
  }
  database().prepare(`INSERT INTO games(id,title,cover,defaultCover,store,genre,playtimeMinutes,playtimeSeconds,lastPlayed,hidden,favorite,routes)
    VALUES(@id,@title,@cover,@defaultCover,@store,@genre,@playtimeMinutes,@playtimeSeconds,@lastPlayed,@hidden,@favorite,@routes)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,cover=excluded.cover,defaultCover=excluded.defaultCover,store=excluded.store,genre=excluded.genre,playtimeMinutes=excluded.playtimeMinutes,playtimeSeconds=excluded.playtimeSeconds,lastPlayed=excluded.lastPlayed,hidden=excluded.hidden,favorite=excluded.favorite,routes=excluded.routes`).run(row)
  return row
}

export function saveGame(game: Partial<Game> & { id: string }) { persistGame(game); return allGames() }

function normalizedTitle(title: string) {
  return title.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
function routeIdentity(route: GameRoute) {
  return `${route.sourceId.toLocaleLowerCase()}:${(route.appId || route.launchTarget).toLocaleLowerCase()}`
}
function mergeRoute(existing: GameRoute, incoming: GameRoute): GameRoute {
  const combined: GameRoute = { ...existing, ...incoming }
  combined.appId = incoming.appId ?? existing.appId
  combined.launchArgs = incoming.launchArgs ?? existing.launchArgs
  combined.installPath = incoming.installPath ?? existing.installPath
  if (existing.owned || incoming.owned) combined.owned = true
  else if (existing.owned !== undefined || incoming.owned !== undefined) combined.owned = false
  if (existing.installed === true || incoming.installed === true) combined.installed = true
  else if (existing.installed === false || incoming.installed === false) combined.installed = false
  const times = [existing.playtimeMinutes, incoming.playtimeMinutes].filter((value): value is number => value !== undefined)
  if (times.length) combined.playtimeMinutes = Math.max(...times)
  combined.lastPlayed = Math.max(existing.lastPlayed || 0, incoming.lastPlayed || 0) || undefined
  return combined
}

export function upsertImportedGames(games: Game[]) {
  const rows = database().prepare('SELECT * FROM games').all() as any[]
  const byId = new Map(rows.map(row => [row.id, row]))
  const byTitle = new Map(rows.map(row => [normalizedTitle(row.title), row]))
  const write = database().transaction((incomingGames: Game[]) => {
    for (const game of incomingGames) {
      const existing = byId.get(game.id) || byTitle.get(normalizedTitle(game.title))
      if (!existing) {
        const inserted = persistGame(game)
        const row = { ...inserted, routes: JSON.stringify(game.routes), playtimeSeconds: game.playtimeSeconds ?? game.playtimeMinutes * 60, playtimeMinutes: game.playtimeMinutes }
        byId.set(game.id, row)
        byTitle.set(normalizedTitle(game.title), row)
        continue
      }
      const routes: GameRoute[] = JSON.parse(existing.routes || '[]')
      for (const incoming of game.routes) {
        const index = routes.findIndex(route => routeIdentity(route) === routeIdentity(incoming))
        if (index < 0) routes.push(incoming)
        else routes[index] = mergeRoute(routes[index], incoming)
      }
      const importedSeconds = game.playtimeSeconds ?? (game.playtimeMinutes || 0) * 60
      const playtimeSeconds = Math.max(existing.playtimeSeconds ?? (existing.playtimeMinutes || 0) * 60, importedSeconds)
      const lastPlayed = Math.max(existing.lastPlayed || 0, game.lastPlayed || 0) || undefined
      const updated = persistGame({
        id: existing.id, cover: existing.cover || game.cover, defaultCover: existing.defaultCover || game.defaultCover,
        genre: existing.genre || game.genre, playtimeSeconds, playtimeMinutes: Math.floor(playtimeSeconds / 60),
        lastPlayed, routes
      })
      const row = { ...existing, ...updated, routes: JSON.stringify(routes), playtimeSeconds, playtimeMinutes: Math.floor(playtimeSeconds / 60), lastPlayed }
      byId.set(existing.id, row)
      byTitle.set(normalizedTitle(existing.title), row)
    }
  })
  write(games)
}
export function upsertImported(game: Game) { upsertImportedGames([game]) }

export function addTrackedPlaytime(id: string, seconds: number, startedAt: number) {
  const amount = Math.max(0, Math.floor(seconds))
  if (!amount) return
  database().prepare(`UPDATE games SET playtimeSeconds=playtimeSeconds+?,playtimeMinutes=CAST((playtimeSeconds+?)/60 AS INTEGER),lastPlayed=MAX(COALESCE(lastPlayed,0),?) WHERE id=?`).run(amount, amount, startedAt, id)
}
export function markGamePlayed(id: string, playedAt: number) { database().prepare('UPDATE games SET lastPlayed=? WHERE id=?').run(playedAt, id) }

export function removeGame(id: string) { database().prepare('DELETE FROM games WHERE id=?').run(id); return allGames() }
export function getSettings(): Settings { const row = database().prepare('SELECT value FROM settings WHERE key=?').get('app') as { value: string } | undefined; return { ...defaultSettings, ...(row ? JSON.parse(row.value) : {}) } }
export function putSettings(patch: Partial<Settings>): Settings { const next = { ...getSettings(), ...patch }; database().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('app', JSON.stringify(next)); return next }

type ConnectionValues = Pick<LibraryConnectionInput, 'steamId' | 'legendaryPath' | 'gogDatabasePath'>
export function getLibraryConnectionValues(): ConnectionValues {
  const row = database().prepare('SELECT value FROM library_connections WHERE key=?').get('main') as { value: string } | undefined
  return { steamId: '', legendaryPath: '', gogDatabasePath: '', ...(row ? JSON.parse(row.value) : {}) }
}
export function putLibraryConnectionValues(input: ConnectionValues) {
  const clean = { steamId: input.steamId.trim(), legendaryPath: input.legendaryPath.trim(), gogDatabasePath: input.gogDatabasePath.trim() }
  database().prepare('INSERT INTO library_connections(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('main', JSON.stringify(clean))
  return clean
}
export function hasSecret(key: string) { return !!database().prepare('SELECT 1 FROM secrets WHERE key=?').get(key) }
export function readSecret(key: string) { return database().prepare('SELECT value FROM secrets WHERE key=?').get(key) as { value: Buffer } | undefined }
export function writeSecret(key: string, value: Buffer) { database().prepare('INSERT INTO secrets(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value) }

export function emulatorProfiles(): EmulatorProfile[] { return database().prepare('SELECT * FROM emulators ORDER BY name').all().map((r: any) => ({ id: r.id, name: r.name, executable: r.executable, args: r.args, romFolders: JSON.parse(r.romFolders), extensions: JSON.parse(r.extensions) })) }
export function saveEmulator(p: EmulatorProfile) { database().prepare('INSERT INTO emulators(id,name,executable,args,romFolders,extensions) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,executable=excluded.executable,args=excluded.args,romFolders=excluded.romFolders,extensions=excluded.extensions').run(p.id, p.name, p.executable, p.args, JSON.stringify(p.romFolders), JSON.stringify(p.extensions)); return emulatorProfiles() }
export function restoreBackup(data: unknown) { const parsed = data as { games?: Game[]; settings?: Settings; emulators?: EmulatorProfile[] }; database().transaction(() => { for (const game of parsed.games || []) saveGame(game); if (parsed.settings) putSettings(parsed.settings); for (const emulator of parsed.emulators || []) saveEmulator(emulator) })(); return (parsed.games || []).length }
