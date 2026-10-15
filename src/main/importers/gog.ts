import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

function defaultDatabasePath() {
  return [
    'C:/ProgramData/GOG.com/Galaxy/storage/galaxy-2.0.db',
    'C:/Program Files (x86)/GOG Galaxy/storage/galaxy-2.0.db'
  ].find(existsSync) || ''
}
function galaxyExecutable(databasePath: string) {
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, dirname(dirname(dirname(databasePath)))]
  return roots.map(root => root ? join(root, 'GOG Galaxy', 'GalaxyClient.exe') : '').find(path => path && existsSync(path)) || ''
}
function titleFromValue(value: unknown) {
  if (typeof value !== 'string') return ''
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'string') return parsed.trim()
    if (parsed && typeof parsed.title === 'string') return parsed.title.trim()
    if (parsed && typeof parsed.value === 'string') return parsed.value.trim()
  } catch { /* Some Galaxy database versions store a plain title string. */ }
  return value.trim()
}

export const gogImporter: Importer = {
  id: 'gog-galaxy', name: 'GOG Galaxy',
  async scan(options) {
    const file = options?.connections.gogDatabasePath || defaultDatabasePath()
    if (!file || !existsSync(file)) return []
    const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 1500 })
    try {
      const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name))
      if (!tables.has('LibraryReleases') || !tables.has('GamePieces') || !tables.has('GamePieceTypes')) {
        throw new Error('The selected GOG Galaxy database does not contain the expected library tables.')
      }
      const releases = (db.prepare("SELECT DISTINCT releaseKey FROM LibraryReleases WHERE releaseKey LIKE 'gog_%'").all() as Array<{ releaseKey: string }>).map(row => row.releaseKey)
      const getTitle = db.prepare(`SELECT GamePieces.value FROM GamePieces
        JOIN GamePieceTypes ON GamePieces.gamePieceTypeId=GamePieceTypes.id
        WHERE GamePieces.releaseKey=? AND lower(GamePieceTypes.type) IN ('originaltitle','title')
        ORDER BY CASE lower(GamePieceTypes.type) WHEN 'originaltitle' THEN 0 ELSE 1 END LIMIT 1`)
      const installedPaths = new Map<string, string>()
      if (tables.has('InstalledProducts')) {
        const columns = new Set((db.pragma('table_info(InstalledProducts)') as Array<{ name: string }>).map(column => column.name))
        if (columns.has('productId')) {
          const pathColumn = ['installationPath', 'installPath', 'path'].find(name => columns.has(name))
          const rows = db.prepare(`SELECT productId${pathColumn ? `, "${pathColumn}" AS installPath` : ''} FROM InstalledProducts`).all() as Array<{ productId: string | number; installPath?: string }>
          for (const row of rows) installedPaths.set(String(row.productId), row.installPath || '')
        }
      }
      const client = galaxyExecutable(file)
      const games: Game[] = []
      for (const releaseKey of releases) {
        const productId = releaseKey.slice('gog_'.length)
        const title = titleFromValue((getTitle.get(releaseKey) as { value?: unknown } | undefined)?.value)
        if (!productId || !title) throw new Error(`GOG release ${releaseKey} has no readable title.`)
        const installed = installedPaths.has(productId)
        const installPath = installedPaths.get(productId) || undefined
        const launchTarget = client ? client : `goggalaxy://openGameView/${encodeURIComponent(productId)}`
        games.push({
          id: `gog:${productId}`, title, store: 'GOG', playtimeMinutes: 0, hidden: false, favorite: false,
          routes: [{ sourceId: 'gog-galaxy', store: 'GOG', appId: productId, launchTarget, launchArgs: client ? JSON.stringify(['/command=runGame', `/gameId=${releaseKey}`]) : undefined, installPath, owned: true, installed, installStates: { 'gog-galaxy': installed } }]
        })
      }
      return games
    } finally {
      db.close()
    }
  }
}
