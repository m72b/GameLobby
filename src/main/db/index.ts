import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EmulatorProfile, Game, Settings } from '../../shared/types'
import { defaultSettings } from '../../shared/defaults'

let db: Database.Database
export function database() {
  if (!db) {
    const file = join(app.getPath('userData'), 'library.sqlite')
    mkdirSync(dirname(file), { recursive: true })
    db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(`CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,title TEXT NOT NULL COLLATE NOCASE UNIQUE,cover TEXT,defaultCover TEXT,store TEXT NOT NULL,genre TEXT,playtimeMinutes INTEGER NOT NULL DEFAULT 0,lastPlayed INTEGER,hidden INTEGER NOT NULL DEFAULT 0,favorite INTEGER NOT NULL DEFAULT 0,routes TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS emulators(id TEXT PRIMARY KEY,name TEXT NOT NULL,executable TEXT NOT NULL,args TEXT NOT NULL,romFolders TEXT NOT NULL,extensions TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plugins(id TEXT PRIMARY KEY,manifest TEXT NOT NULL);`)
    db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('app', JSON.stringify(defaultSettings))
  }
  return db
}
export function allGames(): Game[] {
  return database().prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE').all().map((r: any) => ({ id:r.id,title:r.title,cover:r.cover||undefined,defaultCover:r.defaultCover||undefined,store:r.store,genre:r.genre||undefined,playtimeMinutes:r.playtimeMinutes,lastPlayed:r.lastPlayed||undefined,hidden:!!r.hidden,favorite:!!r.favorite,routes:JSON.parse(r.routes||'[]') }))
}
export function saveGame(game: Partial<Game> & { id:string }) {
  const old = database().prepare('SELECT * FROM games WHERE id=?').get(game.id) as any
  const row = { id:game.id,title:game.title||old?.title||'Untitled',cover:game.cover??old?.cover??null,defaultCover:game.defaultCover??old?.defaultCover??null,store:game.store||old?.store||'Custom',genre:game.genre??old?.genre??null,playtimeMinutes:game.playtimeMinutes??old?.playtimeMinutes??0,lastPlayed:game.lastPlayed??old?.lastPlayed??null,hidden:game.hidden===undefined?!!old?.hidden:+game.hidden,favorite:game.favorite===undefined?!!old?.favorite:+game.favorite,routes:JSON.stringify(game.routes??JSON.parse(old?.routes||'[]')) }
  database().prepare(`INSERT INTO games(id,title,cover,defaultCover,store,genre,playtimeMinutes,lastPlayed,hidden,favorite,routes) VALUES(@id,@title,@cover,@defaultCover,@store,@genre,@playtimeMinutes,@lastPlayed,@hidden,@favorite,@routes)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,cover=excluded.cover,defaultCover=excluded.defaultCover,store=excluded.store,genre=excluded.genre,playtimeMinutes=excluded.playtimeMinutes,lastPlayed=excluded.lastPlayed,hidden=excluded.hidden,favorite=excluded.favorite,routes=excluded.routes`).run(row)
  return allGames()
}
export function upsertImported(game: Game) {
  const existing = database().prepare('SELECT * FROM games WHERE title=? COLLATE NOCASE').get(game.title) as any
  if (existing) {
    const routes = [...JSON.parse(existing.routes||'[]')]
    for (const route of game.routes) if (!routes.some((r:any)=>r.store===route.store&&r.appId===route.appId)) routes.push(route)
    database().prepare('UPDATE games SET routes=?,defaultCover=COALESCE(defaultCover,?),cover=COALESCE(cover,?) WHERE id=?').run(JSON.stringify(routes),game.defaultCover||null,game.cover||null,existing.id)
  } else {
    saveGame(game)
  }
}
export function removeGame(id:string) { database().prepare('DELETE FROM games WHERE id=?').run(id); return allGames() }
export function getSettings():Settings { const row=database().prepare('SELECT value FROM settings WHERE key=?').get('app') as {value:string}|undefined; return { ...defaultSettings,...(row?JSON.parse(row.value):{}) } }
export function putSettings(patch:Partial<Settings>):Settings { const next={...getSettings(),...patch}; database().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('app',JSON.stringify(next)); return next }
export function emulatorProfiles():EmulatorProfile[] { return database().prepare('SELECT * FROM emulators ORDER BY name').all().map((r:any)=>({id:r.id,name:r.name,executable:r.executable,args:r.args,romFolders:JSON.parse(r.romFolders),extensions:JSON.parse(r.extensions)})) }
export function saveEmulator(p:EmulatorProfile) { database().prepare('INSERT INTO emulators(id,name,executable,args,romFolders,extensions) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,executable=excluded.executable,args=excluded.args,romFolders=excluded.romFolders,extensions=excluded.extensions').run(p.id,p.name,p.executable,p.args,JSON.stringify(p.romFolders),JSON.stringify(p.extensions));return emulatorProfiles() }
export function restoreBackup(data:unknown) { const parsed=data as {games?:Game[];settings?:Settings;emulators?:EmulatorProfile[]}; database().transaction(()=>{ for(const g of parsed.games||[]) saveGame(g); if(parsed.settings) putSettings(parsed.settings); for(const e of parsed.emulators||[]) saveEmulator(e) })(); return (parsed.games||[]).length }
