import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { allGames, database, emulatorProfiles, getLibraryConnectionValues, getSettings, markGamePlayed, putLibraryConnectionValues, putSettings, removeGame, restoreBackup, saveEmulator, saveGame, upsertImportedGames } from './db'
import { steamImporter, steamOwnedImporter } from './importers/steam'
import { epicImporter, epicLegendaryImporter } from './importers/epic'
import { gogImporter } from './importers/gog'
import { amazonImporter, battleNetImporter, eaImporter, itchImporter, ubisoftImporter } from './importers/windows-clients'
import { xboxImporter } from './importers/xbox'
import { loadRemoteTheme } from './themes/loader'
import { watchGameProcess } from './process-tracker'
import { getSteamApiKey, hasSteamApiKey, setSteamApiKey } from './secrets'
import type { Game, LibraryConnectionInput, LibraryConnections } from '../shared/types'

protocol.registerSchemesAsPrivileged([{ scheme: 'lobby-cover', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
let mainWindow: BrowserWindow | undefined, settingsWindow: BrowserWindow | undefined
const coverRoot = () => join(app.getPath('userData'), 'covers')

function safeSender(event: Electron.IpcMainInvokeEvent) {
  const win = BrowserWindow.fromWebContents(event.sender), frame = event.senderFrame
  if (!win || (win !== mainWindow && win !== settingsWindow) || !frame || frame !== event.sender.mainFrame) throw new Error('Untrusted IPC sender')
  let allowed = false
  try {
    const url = new URL(frame.url), dev = process.env.ELECTRON_RENDERER_URL
    if (dev) { const base = new URL(dev); allowed = url.origin === base.origin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['/', '/index.html', '/settings.html'].includes(url.pathname) }
    else if (url.protocol === 'file:') { const path = resolve(fileURLToPath(url)); allowed = [resolve(__dirname, '../renderer/index.html'), resolve(__dirname, '../renderer/settings.html')].includes(path) }
  } catch { /* Reject malformed frame URLs. */ }
  if (!allowed) throw new Error('Untrusted IPC sender')
}

function createWindow(settings = false) {
  const win = new BrowserWindow({ width: settings ? 760 : 1440, height: settings ? 820 : 900, minWidth: settings ? 640 : 800, minHeight: 600, show: false, frame: false, backgroundColor: '#101113', title: settings ? 'Game Lobby Settings' : 'Game Lobby', webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.once('ready-to-show', () => win.show())
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) win.loadURL(`${devUrl}${settings ? '/settings.html' : ''}`)
  else win.loadFile(join(__dirname, settings ? '../renderer/settings.html' : '../renderer/index.html'))
  win.on('closed', () => { if (settings) settingsWindow = undefined; else mainWindow = undefined })
  return win
}
function openSettings() { if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return }; settingsWindow = createWindow(true) }
function safeCoverName(id: string, ext: string) { return `${id.replace(/[^\w.-]/g, '_')}-${randomUUID()}${ext.toLowerCase()}` }
function dataUrlCover(id: string, dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp|gif|avif);base64,([A-Za-z\d+/=]+)$/)
  if (!match || match[2].length > 18_000_000) throw new Error('Choose an image smaller than 12 MB.')
  const ext = match[1] === 'jpeg' ? '.jpg' : `.${match[1]}`
  mkdirSync(coverRoot(), { recursive: true })
  const name = safeCoverName(id, ext)
  writeFileSync(join(coverRoot(), name), Buffer.from(match[2], 'base64'))
  return `lobby-cover://${encodeURIComponent(name)}`
}

function libraryConnections(): LibraryConnections {
  return { ...getLibraryConnectionValues(), steamApiKeySet: hasSteamApiKey() }
}
function saveLibraryConnections(input: LibraryConnectionInput): LibraryConnections {
  const values = putLibraryConnectionValues(input)
  if (input.steamApiKey?.trim()) setSteamApiKey(input.steamApiKey)
  return { ...values, steamApiKeySet: hasSteamApiKey() }
}

async function scanLibraries() {
  const connections = getLibraryConnectionValues()
  const discovered: Game[] = [], errors: string[] = []
  const run = async (name: string, scan: () => Promise<Game[]>) => {
    try { discovered.push(...await scan()) }
    catch (error) { const message = error instanceof Error ? error.message : String(error); errors.push(`${name}: ${message}`); console.error(`Could not scan ${name}`, error) }
  }
  await run('Steam installed', () => steamImporter.scan())
  await run('Epic Games installed', () => epicImporter.scan())
  await run('EA app installed', () => eaImporter.scan())
  await run('Battle.net installed', () => battleNetImporter.scan())
  await run('Ubisoft Connect installed', () => ubisoftImporter.scan())
  await run('itch.io installed', () => itchImporter.scan())
  await run('Amazon Games installed', () => amazonImporter.scan())
  await run('Xbox / Microsoft Store installed', () => xboxImporter.scan())
  if (connections.steamId && hasSteamApiKey()) await run('Steam owned games', async () => {
    const key = getSteamApiKey()
    if (!key) return []
    return steamOwnedImporter.scan(connections.steamId, key)
  })
  if (connections.legendaryPath) await run('Epic Games via Legendary', () => epicLegendaryImporter.scan(connections.legendaryPath))
  await run('GOG Galaxy', () => gogImporter.scan({ connections }))
  upsertImportedGames(discovered)
  return { total: allGames().length, imported: discovered.length, errors, scannedAt: Date.now() }
}

function parseLaunchArguments(value?: string): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed) && parsed.every(argument => typeof argument === 'string')) return parsed
  } catch { /* Older custom routes may contain one plain argument string. */ }
  return value.split(/\s+/).filter(Boolean)
}
function spawnDetached(executable: string, args: string[]) {
  return new Promise<void>((resolveSpawn, rejectSpawn) => {
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true })
    child.once('error', rejectSpawn)
    child.once('spawn', () => { child.unref(); resolveSpawn() })
  })
}
async function launchGame(game: Game, routeIndex = 0) {
  const route = game.routes[routeIndex]
  if (!route) throw new Error('No launch route is configured.')
  if (route.launchTarget.includes('://')) {
    await shell.openExternal(route.launchTarget)
  } else if (route.launchTarget.startsWith('shell:AppsFolder\\')) {
    await spawnDetached('explorer.exe', [route.launchTarget])
  } else if (route.launchArgs) {
    const executable = resolve(route.launchTarget)
    if (!existsSync(executable)) throw new Error('Launch target was not found.')
    if (route.sourceId === 'epic') {
      const configured = getLibraryConnectionValues().legendaryPath
      if (!configured || executable.toLowerCase() !== resolve(configured).toLowerCase()) throw new Error('The configured Legendary executable changed. Update it in Library settings and scan again.')
    }
    await spawnDetached(executable, parseLaunchArguments(route.launchArgs))
  } else {
    const target = resolve(route.launchTarget)
    if (!existsSync(target)) throw new Error('Launch target was not found.')
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  }
  const tracking = route.installed !== false && watchGameProcess(game.id, route.installPath, () => mainWindow?.webContents.send('library:changed'))
  if (!tracking && route.installed !== false) markGamePlayed(game.id, Date.now())
  return true
}

function registerIpc() {
  const handle = (channel: string, fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any) => ipcMain.handle(channel, (event, ...args) => { safeSender(event); return fn(event, ...args) })
  handle('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  handle('window:maximize', event => { const win = BrowserWindow.fromWebContents(event.sender); win?.isMaximized() ? win.unmaximize() : win?.maximize() })
  handle('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())
  handle('window:isMaximized', event => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
  handle('library:list', () => allGames())
  handle('library:scan', () => scanLibraries())
  handle('library:connections', () => libraryConnections())
  handle('library:saveConnections', (_event, input: LibraryConnectionInput) => saveLibraryConnections(input))
  handle('library:chooseLegendary', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Legendary executable', extensions: ['exe'] }] }); return result.canceled ? null : result.filePaths[0] || null })
  handle('library:chooseGogDatabase', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }] }); return result.canceled ? null : result.filePaths[0] || null })
  handle('library:launch', async (_event, id: string, route = 0) => { const game = allGames().find(entry => entry.id === id); if (!game) throw new Error('Game not found.'); return launchGame(game, route) })
  handle('library:save', (_event, game: Partial<Game> & { id: string }) => saveGame(game))
  handle('library:remove', (_event, id: string) => removeGame(id))
  handle('library:add', (_event, title: string, target: string) => saveGame({ id: `custom:${randomUUID()}`, title, store: 'Custom', playtimeMinutes: 0, hidden: false, favorite: false, routes: [{ sourceId: 'custom', store: 'Custom', launchTarget: target, installed: true }] }))
  handle('library:cover', (_event, id: string, dataUrl: string | null) => { const game = allGames().find(entry => entry.id === id); if (!game) throw new Error('Game not found.'); return saveGame({ ...game, cover: dataUrl ? dataUrlCover(id, dataUrl) : game.defaultCover }) })
  handle('library:chooseCover', async (_event, id: string) => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }] }); if (result.canceled || !result.filePaths[0]) return allGames(); const game = allGames().find(entry => entry.id === id); if (game) { const source = result.filePaths[0], ext = extname(source) || '.jpg', name = safeCoverName(id, ext); mkdirSync(coverRoot(), { recursive: true }); require('node:fs').copyFileSync(source, join(coverRoot(), name)); saveGame({ ...game, cover: `lobby-cover://${encodeURIComponent(name)}` }) } return allGames() })
  handle('library:folder', async (_event, id: string) => { const game = allGames().find(entry => entry.id === id), folder = game?.routes.find(route => route.installPath)?.installPath; if (folder && existsSync(folder)) await shell.openPath(folder) })
  handle('settings:get', () => getSettings())
  handle('settings:save', (_event, settings) => putSettings(settings))
  handle('settings:open', () => openSettings())
  handle('theme:load', async (_event, url: string) => { const theme = await loadRemoteTheme(url); return putSettings({ theme, themeUrl: url, themeName: theme.name }) })
  handle('theme:reset', () => putSettings({ theme: { name: 'Game Lobby Dark', bg: '#101113', surface: '#181a1d', surface2: '#22252a', accent: '#75d18a', text: '#f2f3f4', muted: '#969ba3', radius: '10px', gap: '9px', font: 'Inter, Segoe UI, sans-serif', hover: 'lift' }, themeUrl: undefined, themeName: undefined }))
  handle('emulators:list', () => emulatorProfiles())
  handle('emulators:save', (_event, profile) => saveEmulator(profile))
  handle('emulators:scan', () => ({ total: 0, scannedAt: Date.now() }))
  handle('plugins:list', () => database().prepare('SELECT manifest FROM plugins').all().map((row: any) => JSON.parse(row.manifest)))
  handle('plugins:install', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Plugin manifests', extensions: ['json'] }] }); if (!result.canceled && result.filePaths[0]) { const manifest = JSON.parse(readFileSync(result.filePaths[0], 'utf8')); database().prepare('INSERT OR REPLACE INTO plugins(id,manifest) VALUES(?,?)').run(manifest.id, JSON.stringify(manifest)) }; return database().prepare('SELECT manifest FROM plugins').all().map((row: any) => JSON.parse(row.manifest)) })
  handle('backup:export', async () => { const result = await dialog.showSaveDialog({ defaultPath: 'game-lobby-backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (result.canceled || !result.filePath) return null; writeFileSync(result.filePath, JSON.stringify({ games: allGames(), settings: getSettings(), emulators: emulatorProfiles() }, null, 2)); return result.filePath })
  handle('backup:import', async () => { const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] }); if (result.canceled || !result.filePaths[0]) return 0; return restoreBackup(JSON.parse(readFileSync(result.filePaths[0], 'utf8'))) })
  handle('app:quit', () => app.quit())
}

app.whenReady().then(() => {
  database()
  protocol.handle('lobby-cover', request => {
    const url = new URL(request.url), name = decodeURIComponent(url.hostname + url.pathname).replace(/^\//, ''), file = resolve(coverRoot(), basename(name))
    if (!file.startsWith(resolve(coverRoot()))) return new Response('Not found', { status: 404 })
    try { return new Response(new Uint8Array(readFileSync(file))) } catch { return new Response('Not found', { status: 404 }) }
  })
  registerIpc()
  mainWindow = createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
