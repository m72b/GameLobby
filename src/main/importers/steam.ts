import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

function steamRoots(): string[] {
  const roots = new Set<string>()
  for (const path of ['C:/Program Files (x86)/Steam', 'C:/Program Files/Steam', 'D:/Steam']) if (existsSync(path)) roots.add(path)
  try {
    const output = require('node:child_process').execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8' })
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match) roots.add(match[1].trim().replaceAll('\\', '/'))
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { status?: number; stderr?: Buffer | string }
    const stderr = failure.stderr?.toString() || failure.message || ''
    if (!(failure.status === 1 && /unable to find the specified registry key|cannot find the specified registry key/i.test(stderr))) {
      throw new Error(`Could not locate Steam libraries: ${stderr || 'registry lookup failed'}`)
    }
  }
  let foundLibraryList = false
  for (const root of [...roots]) {
    const libraryFile = join(root, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(libraryFile)) continue
    const text = readFileSync(libraryFile, 'utf8')
    foundLibraryList = true
    for (const match of text.matchAll(/"(?:path|\d+)"\s+"([A-Za-z]:[\\/][^"]+)"/g)) roots.add(match[1].replaceAll('\\', '/'))
  }
  if (roots.size && !foundLibraryList) throw new Error('Steam libraryfolders.vdf could not be found. Existing Steam entries were left unchanged.')
  return [...roots]
}

export const steamImporter: Importer = {
  id: 'steam-installed', name: 'Steam (installed)',
  async scan() {
    const games: Game[] = []
    for (const root of steamRoots()) {
      const folder = join(root, 'steamapps')
      if (!existsSync(folder)) throw new Error(`Steam library folder is unavailable: ${folder}. Existing entries were left unchanged.`)
      for (const file of readdirSync(folder).filter(name => /^appmanifest_\d+\.acf$/i.test(name))) {
        try {
          const text = readFileSync(join(folder, file), 'utf8')
          const appId = text.match(/"appid"\s+"(\d+)"/)?.[1]
          const title = text.match(/"name"\s+"([^"]+)"/)?.[1]
          const installDir = text.match(/"installdir"\s+"([^"]+)"/)?.[1]
          if (!appId || !title) throw new Error('manifest is missing its app ID or title')
          const cover = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
          games.push({
            id: `steam:${appId}`, title, store: 'Steam', cover, defaultCover: cover,
            playtimeMinutes: 0, hidden: false, favorite: false,
            routes: [{ sourceId: 'steam', store: 'Steam', appId, launchTarget: `steam://run/${appId}`, installPath: installDir ? join(folder, 'common', installDir) : undefined, installed: true, installStates: { 'steam-installed': true } }]
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`Could not verify Steam manifest ${file}: ${reason}`)
        }
      }
    }
    return games
  }
}

interface SteamOwnedGame { appid: number; name?: string; playtime_forever?: number; rtime_last_played?: number }
export const steamOwnedImporter = {
  id: 'steam-owned', name: 'Steam (owned)',
  async scan(steamId: string, apiKey: string): Promise<Game[]> {
    if (!/^\d{17}$/.test(steamId)) throw new Error('Steam ID must be a 17-digit SteamID64.')
    const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
    url.search = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: 'true', include_played_free_games: 'true' }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}.`)
    const body = await response.json() as { response?: { games?: SteamOwnedGame[] } }
    if (!body.response || !Array.isArray(body.response.games)) throw new Error('Steam did not return an owned-games list. Check the API key and profile game-privacy settings.')
    return body.response.games.flatMap(game => {
      const appId = String(game.appid)
      const title = game.name?.trim()
      if (!appId || !title) return []
      const cover = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
      return [{
        id: `steam:${appId}`, title, store: 'Steam' as const, cover, defaultCover: cover,
        playtimeMinutes: Math.max(0, game.playtime_forever || 0),
        lastPlayed: game.rtime_last_played ? game.rtime_last_played * 1000 : undefined,
        hidden: false, favorite: false,
        routes: [{ sourceId: 'steam', store: 'Steam' as const, appId, launchTarget: `steam://run/${appId}`, owned: true, installed: false, playtimeMinutes: Math.max(0, game.playtime_forever || 0), lastPlayed: game.rtime_last_played ? game.rtime_last_played * 1000 : undefined }]
      }]
    })
  }
}
