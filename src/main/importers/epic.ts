import { execFile as execFileCallback } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { join } from 'node:path'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

const execFile = promisify(execFileCallback)
const manifestRoots = ['C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests', 'C:/ProgramData/Epic/EpicGames/Launcher/Data/Manifests']

export const epicImporter: Importer = {
  id: 'epic-installed', name: 'Epic Games (installed)',
  async scan() {
    const games: Game[] = []
    for (const root of manifestRoots) {
      if (!existsSync(root)) continue
      for (const file of readdirSync(root).filter(name => name.endsWith('.item'))) {
        try {
          const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
          const appName = String(manifest.AppName || manifest.CatalogItemId || manifest.InstallationGuid || file)
          const title = String(manifest.DisplayName || manifest.AppName || '').trim()
          if (!title) throw new Error('manifest has no display title')
          const cover = manifest.LargePreviewImage || manifest.KeyImages?.[0]?.URL
          games.push({
            id: `epic:${appName}`, title, store: 'Epic Games', cover, defaultCover: cover,
            playtimeMinutes: 0, hidden: false, favorite: false,
            routes: [{ sourceId: 'epic', store: 'Epic Games', appId: appName, launchTarget: `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch&silent=true`, installPath: manifest.InstallLocation, installed: true, installStates: { 'epic-installed': true } }]
          })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`Could not verify Epic manifest ${file}: ${reason}`)
        }
      }
    }
    return games
  }
}

interface LegendaryGame { app_name?: string; app_title?: string; title?: string; install_path?: string; installPath?: string }
async function readLegendaryList(executable: string, command: string): Promise<LegendaryGame[]> {
  const { stdout } = await execFile(executable, [command, '--json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  const parsed: unknown = JSON.parse(stdout.trim())
  if (!Array.isArray(parsed)) throw new Error(`Legendary returned an unexpected ${command} result.`)
  return parsed as LegendaryGame[]
}

export const epicLegendaryImporter = {
  id: 'epic-legendary', name: 'Epic Games (Legendary)',
  async scan(executable: string): Promise<Game[]> {
    if (!existsSync(executable)) throw new Error('The configured Legendary executable was not found.')
    const owned = await readLegendaryList(executable, 'list')
    let installedGames: LegendaryGame[] = []
    try { installedGames = await readLegendaryList(executable, 'list-installed') } catch { /* Older Legendary versions may not support JSON here. */ }
    const installed = new Map(installedGames.flatMap(game => game.app_name ? [[game.app_name, game] as const] : []))
    return owned.flatMap(game => {
      const appName = game.app_name?.trim()
      const title = (game.app_title || game.title || '').trim()
      if (!appName || !title) return []
      const local = installed.get(appName)
      const installPath = local?.install_path || local?.installPath
      const isInstalled = !!local && !!installPath
      const launchTarget = isInstalled ? executable : `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=install&silent=true`
      return [{
        id: `epic:${appName}`, title, store: 'Epic Games' as const,
        playtimeMinutes: 0, hidden: false, favorite: false,
        routes: [{ sourceId: 'epic', store: 'Epic Games' as const, appId: appName, launchTarget, launchArgs: isInstalled ? JSON.stringify(['launch', appName]) : undefined, installPath, owned: true, installed: isInstalled, installStates: { 'epic-legendary': isInstalled } }]
      }]
    })
  }
}
