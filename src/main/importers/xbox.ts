import { execFile as execFileCallback } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

const execFile = promisify(execFileCallback)
interface AppPackage { Name: string; PackageFamilyName: string; InstallLocation: string }
const likelyGameName = /game|minecraft|forza|halo|gears|flight|seaofthieves|stateofdecay|starfield|fallout|elder|outerworld|ori|psychonauts|fable|killerinstinct|asphalt/i
const excludedName = /gamingservices|gamingapp|gamebar|xboxidentity|xboxspeech|xbox.tcui/i

export const xboxImporter: Importer = {
  id: 'xbox-appx', name: 'Xbox / Microsoft Store (installed)',
  async scan() {
    if (process.platform !== 'win32') return []
    const script = 'Get-AppxPackage | Where-Object { -not $_.IsFramework -and $_.InstallLocation } | Select-Object Name,PackageFamilyName,InstallLocation | ConvertTo-Json -Compress'
    const { stdout } = await execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30_000, maxBuffer: 12 * 1024 * 1024, windowsHide: true })
    const output = stdout.trim()
    if (!output) return []
    const parsed: unknown = JSON.parse(output)
    const packages = (Array.isArray(parsed) ? parsed : [parsed]) as AppPackage[]
    const games: Game[] = []
    for (const appPackage of packages) {
      if (!appPackage.Name || !appPackage.PackageFamilyName || !appPackage.InstallLocation || excludedName.test(appPackage.Name) || !likelyGameName.test(appPackage.Name)) continue
      const manifestPath = join(appPackage.InstallLocation, 'AppxManifest.xml')
      if (!existsSync(manifestPath)) continue
      const manifest = readFileSync(manifestPath, 'utf8')
      const appId = manifest.match(/<Application\b[^>]*\bId="([^"]+)"/)?.[1]
      if (!appId) continue
      const title = appPackage.Name.split('.').slice(1).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim() || appPackage.Name
      games.push({
        id: `xbox:${appPackage.PackageFamilyName}:${appId}`, title, store: 'Xbox',
        playtimeMinutes: 0, hidden: false, favorite: false,
        routes: [{ sourceId: 'xbox-appx', store: 'Xbox', appId: `${appPackage.PackageFamilyName}!${appId}`, launchTarget: `shell:AppsFolder\\${appPackage.PackageFamilyName}!${appId}`, installPath: appPackage.InstallLocation, installed: true, installStates: { 'xbox-appx': true } }]
      })
    }
    return games
  }
}
