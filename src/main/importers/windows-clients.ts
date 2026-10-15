import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { Game, Store } from '../../shared/types'
import type { Importer } from './types'

interface RegistryEntry { key: string; values: Record<string, string> }
interface RegistrySource { id: string; name: string; store: Store; keys: string[]; match?: (entry: RegistryEntry) => boolean }

function queryRegistry(key: string): RegistryEntry[] {
  if (process.platform !== 'win32') return []
  try {
    const text = execFileSync('reg.exe', ['query', key, '/s'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 10_000 })
    const entries: RegistryEntry[] = []
    let current: RegistryEntry | undefined
    for (const line of text.split(/\r?\n/)) {
      const header = line.match(/^HKEY_[^\r\n]+$/i)
      if (header) {
        if (current) entries.push(current)
        current = { key: header[0].trim(), values: {} }
        continue
      }
      const value = line.match(/^\s+(.+?)\s+REG_[A-Z0-9_]+\s+(.*)$/i)
      if (current && value) current.values[value[1].trim().toLowerCase()] = value[2].trim()
    }
    if (current) entries.push(current)
    return entries
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { status?: number; stderr?: Buffer | string }
    const stderr = failure.stderr?.toString() || failure.message || ''
    if (failure.status === 1 && /unable to find the specified registry key|cannot find the specified registry key/i.test(stderr)) return []
    throw new Error(`Could not read registry key ${key}: ${stderr || 'unknown registry error'}`)
  }
}

function expandPath(value?: string) {
  if (!value) return ''
  return value.replace(/^"|"$/g, '').replace(/%([^%]+)%/g, (match, key: string) => process.env[key] || match).trim()
}
function executablePath(entry: RegistryEntry, installPath: string) {
  const icon = expandPath(entry.values['displayicon'] || entry.values['display icon']).replace(/,\s*\d+$/, '')
  const iconPath = icon.replace(/^"|"$/g, '')
  if (/\.exe$/i.test(iconPath) && existsSync(iconPath)) return resolve(iconPath)
  if (!installPath || !existsSync(installPath)) return ''
  try {
    if (statSync(installPath).isFile() && installPath.toLowerCase().endsWith('.exe')) return resolve(installPath)
  } catch { return '' }
  const candidates: string[] = []
  const addExecutables = (folder: string) => {
    try {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        if (item.isFile() && item.name.toLowerCase().endsWith('.exe')) candidates.push(join(folder, item.name))
      }
    } catch { /* Store install directories can be access-restricted. */ }
  }
  addExecutables(installPath)
  try {
    for (const item of readdirSync(installPath, { withFileTypes: true })) if (item.isDirectory()) addExecutables(join(installPath, item.name))
  } catch { /* Keep any root-level candidates. */ }
  const ignored = /^(unins|uninstall|setup|installer|crash|unitycrashhandler|vc_redist|eac|battle\.net|updater|repair)/i
  const usable = candidates.filter(path => !ignored.test(basename(path)))
  const terms = (entry.values['displayname'] || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 3)
  const ranked = usable.map(path => ({ path, score: terms.reduce((score, term) => score + (basename(path).toLowerCase().includes(term) ? 5 : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  if (!ranked.length || (ranked.length > 1 && ranked[0].score === 0)) return ''
  return resolve(ranked[0].path)
}

const uninstallRoots = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]
let cachedUninstallEntries: RegistryEntry[] | undefined
function uninstallEntries() { return cachedUninstallEntries ||= uninstallRoots.flatMap(queryRegistry) }
function text(entry: RegistryEntry, ...keys: string[]) { return keys.map(key => entry.values[key.toLowerCase()]).find(Boolean) || '' }
function installPath(entry: RegistryEntry) { return expandPath(text(entry, 'installdir', 'install dir', 'installlocation', 'install location', 'installpath', 'install path', 'path')) }
function idFromKey(key: string) { return key.split('\\').at(-1) || key }

const sources: RegistrySource[] = [
  { id: 'ea-registry', name: 'EA app', store: 'EA app', keys: ['HKLM\\SOFTWARE\\Electronic Arts\\EA Games', 'HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts\\EA Games', 'HKLM\\SOFTWARE\\WOW6432Node\\Origin Games'], match: entry => /electronic arts|ea app|origin games/i.test(`${text(entry, 'publisher')} ${text(entry, 'uninstallstring')} ${installPath(entry)}`) },
  { id: 'battlenet-registry', name: 'Battle.net', store: 'Battle.net', keys: ['HKLM\\SOFTWARE\\Blizzard Entertainment', 'HKLM\\SOFTWARE\\WOW6432Node\\Blizzard Entertainment'], match: entry => /blizzard entertainment|battle\.net/i.test(`${text(entry, 'publisher')} ${text(entry, 'uninstallstring')} ${installPath(entry)}`) },
  { id: 'ubisoft-registry', name: 'Ubisoft Connect', store: 'Ubisoft', keys: ['HKLM\\SOFTWARE\\Ubisoft\\Launcher\\Installs', 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs'], match: entry => /ubisoft/i.test(`${text(entry, 'publisher')} ${text(entry, 'uninstallstring')} ${installPath(entry)}`) },
  { id: 'amazon-registry', name: 'Amazon Games', store: 'Amazon Games', keys: ['HKLM\\SOFTWARE\\Amazon Games', 'HKLM\\SOFTWARE\\WOW6432Node\\Amazon Games'], match: entry => /amazon games/i.test(`${text(entry, 'uninstallstring')} ${installPath(entry)} ${entry.key}`) }
]

function scanSource(source: RegistrySource): Game[] {
  const entries = [...new Map([...source.keys.flatMap(queryRegistry), ...(source.match ? uninstallEntries().filter(source.match) : [])].map(entry => [entry.key.toLowerCase(), entry])).values()]
  const found = new Map<string, Game>()
  for (const entry of entries) {
    const title = text(entry, 'displayname', 'display name') || idFromKey(entry.key)
    const folder = installPath(entry)
    const executable = executablePath(entry, folder)
    if (!title || !executable) throw new Error(`${source.name}: could not verify the installed executable for "${title}". Existing entries were left unchanged.`)
    const id = `${source.id}:${idFromKey(entry.key)}`
    found.set(id, { id, title, store: source.store, playtimeMinutes: 0, hidden: false, favorite: false, routes: [{ sourceId: source.id, store: source.store, appId: idFromKey(entry.key), launchTarget: executable, installPath: folder || dirname(executable), installed: true, installStates: { [source.id]: true } }] })
  }
  return [...found.values()]
}

function registryImporter(source: RegistrySource): Importer {
  return { id: source.id, name: source.name, async scan() { return scanSource(source) } }
}

export const eaImporter = registryImporter(sources[0])
export const battleNetImporter = registryImporter(sources[1])
export const ubisoftImporter = registryImporter(sources[2])
export const amazonImporter = registryImporter(sources[3])

export const itchImporter: Importer = {
  id: 'itch-installed', name: 'itch.io (installed)',
  async scan() {
    if (process.platform !== 'win32') return []
    const roots = [process.env.APPDATA ? join(process.env.APPDATA, 'itch', 'apps') : '', process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'itch', 'apps') : ''].filter(path => path && existsSync(path))
    const games: Game[] = []
    for (const root of roots) {
      for (const item of readdirSync(root, { withFileTypes: true })) {
        if (!item.isDirectory()) continue
        const folder = join(root, item.name)
        const executable = executablePath({ key: folder, values: { displayname: item.name } }, folder)
        if (!executable) throw new Error(`Could not verify the installed itch.io game in ${folder}. Existing entries were left unchanged.`)
        const title = item.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
        games.push({ id: `itch:${item.name.toLowerCase()}`, title, store: 'itch.io', playtimeMinutes: 0, hidden: false, favorite: false, routes: [{ sourceId: 'itch-installed', store: 'itch.io', appId: item.name, launchTarget: executable, installPath: folder, installed: true, installStates: { 'itch-installed': true } }] })
      }
    }
    return games
  }
}
