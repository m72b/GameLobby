import { useEffect, useState } from 'react'
import { ArrowLeft, Blocks, ChevronRight, CircleHelp, Cloud, Gamepad2, Image, Keyboard, Library, Palette, Puzzle, RotateCcw, Settings2, SlidersHorizontal, Sparkles, Star } from 'lucide-react'
import type { EmulatorProfile, LibraryConnections, Settings } from '../shared/types'
import { defaultSettings } from '../shared/defaults'
import packageInfo from '../../package.json'
import { applyTheme } from './theme'
import { createRoot } from 'react-dom/client'
import './styles.css'

const sections = [
  ['Libraries', 'Connect stores and choose how often Game Lobby scans.', Library],
  ['Emulators', 'Manage emulator profiles and ROM folders.', Gamepad2],
  ['Covers and Metadata', 'Choose metadata sources and configure artwork.', Image],
  ['Themes (MyUI)', 'Load themes from a remote JSON or CSS link.', Palette],
  ['Appearance', 'Tune poster size, badges and motion.', SlidersHorizontal],
  ['Startup and Behavior', 'Choose how the app opens and closes.', Settings2],
  ['Playtime and Stats', 'Control local playtime tracking.', Star],
  ['Collections and Tags', 'Organize the library into collections.', Blocks],
  ['Backup and Sync', 'Export or restore your local library.', Cloud],
  ['Keyboard Shortcuts', 'Browse available keyboard controls.', Keyboard],
  ['Plugins / Add-ons', 'Install declarative community library plugins.', Puzzle],
  ['About and Updates', 'Version and project information.', CircleHelp]
] as const

type Section = typeof sections[number][0]

export function SettingsApp() {
  const [section, setSection] = useState<Section>('Libraries')
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [plugins, setPlugins] = useState<any[]>([])
  const [emulators, setEmulators] = useState<EmulatorProfile[]>([])
  const [themeUrl, setThemeUrl] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [connections, setConnections] = useState<LibraryConnections>({ steamId: '', steamApiKeySet: false, legendaryPath: '', gogDatabasePath: '' })
  const [steamApiKey, setSteamApiKey] = useState('')

  useEffect(() => {
    const offSettings = window.lobby.settings.onChanged(setSettings)
    void Promise.all([
      window.lobby.settings.get().then(setSettings),
      window.lobby.plugins.list().then(setPlugins),
      window.lobby.emulators.list().then(setEmulators),
      window.lobby.library.connections().then(setConnections)
    ])
    return offSettings
  }, [])
  useEffect(() => { applyTheme(settings.theme, settings) }, [settings])

  const say = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 3500)
  }
  const save = async (patch: Partial<Settings>) => {
    try { setSettings(await window.lobby.settings.save(patch)) }
    catch (error) { say(error instanceof Error ? error.message : 'Settings could not be saved') }
  }
  const doTheme = async () => {
    setBusy(true)
    try {
      const next = await window.lobby.theme.load(themeUrl.trim())
      setSettings(next)
      say('Loaded remote theme: ' + next.theme.name)
    } catch (error) { say(error instanceof Error ? error.message : 'Theme could not be loaded') }
    finally { setBusy(false) }
  }
  const resetTheme = async () => {
    const next = await window.lobby.theme.reset()
    setSettings(next)
    setThemeUrl('')
    say('Restored built-in dark theme')
  }
  const exportBackup = async () => {
    const path = await window.lobby.backup.export()
    if (path) say('Backup saved to ' + path)
  }
  const importBackup = async () => say('Imported ' + await window.lobby.backup.import() + ' games')
  const installPlugin = async () => {
    const list = await window.lobby.plugins.install()
    setPlugins(list)
    say('Plugin manifest added')
  }
  const addEmulator = async () => {
    const profile: EmulatorProfile = { id: crypto.randomUUID(), name: 'New emulator', executable: '', args: '{rom}', romFolders: [], extensions: ['.iso', '.rom'] }
    await window.lobby.emulators.save(profile)
    setEmulators(current => [...current, profile])
    say('Emulator profile created')
  }
  const updateEmulator = (id: string, patch: Partial<EmulatorProfile>) => {
    setEmulators(current => current.map(profile => profile.id === id ? { ...profile, ...patch } : profile))
  }
  const saveEmulator = async (profile: EmulatorProfile) => {
    try {
      await window.lobby.emulators.save(profile)
      say('Saved ' + profile.name)
    } catch (error) { say(error instanceof Error ? error.message : 'Emulator profile could not be saved') }
  }
  const saveConnections = async () => {
    try {
      const next = await window.lobby.library.saveConnections({ ...connections, steamApiKey: steamApiKey.trim() || undefined })
      setConnections(next)
      setSteamApiKey('')
      say('Library connections saved. The Steam key is encrypted locally.')
    } catch (error) { say(error instanceof Error ? error.message : 'Could not save library connections') }
  }
  const scanLibraries = async () => {
    try {
      const result = await window.lobby.library.scan()
      say(result.errors?.length ? 'Imported ' + (result.imported || 0) + ' records. ' + result.errors[0] : 'Scan complete · ' + result.total + ' games in library')
    } catch (error) { say(error instanceof Error ? error.message : 'Library scan failed') }
  }
  const resetPlaytime = async () => {
    await window.lobby.library.resetPlaytime()
    say('Playtime and last-played statistics reset')
  }

  return <div className="settings-shell">
    <header className="titlebar settings-titlebar">
      <button className="back-button" onClick={() => window.close()}><ArrowLeft size={15} /></button>
      <div className="brand">Game Lobby <span>/ Settings</span></div><div className="drag-space" />
      <button className="title-action" onClick={() => window.lobby.window.minimize()}>—</button>
      <button className="title-action" onClick={() => window.lobby.window.toggleMaximize()}>□</button>
      <button className="title-action close" onClick={() => window.lobby.window.close()}>×</button>
    </header>
    <div className="settings-layout">
      <nav className="settings-nav">
        <div className="settings-nav-label">PREFERENCES</div>
        {sections.map(([name, , Icon]) => <button key={name} className={section === name ? 'selected' : ''} onClick={() => setSection(name)}><Icon size={16} /><span>{name}</span><ChevronRight size={13} /></button>)}
      </nav>
      <main className="settings-content">
        <div className="eyebrow">SETTINGS</div><h1>{section}</h1>
        <p className="settings-description">{sections.find(item => item[0] === section)?.[1]}</p>

        {section === 'Libraries' && <>
          <div className="settings-card">
            <h3>Library sources</h3>
            <p className="muted-text">Steam and Epic support installed-game scans. Owned-game imports are available through a public Steam profile, Legendary, and a local GOG Galaxy database. Store credentials stay on this PC. Other stores scan local install data only and do not fetch complete account catalogs.</p>
            {[
              ['Steam', 'Installed manifests + public-profile ownership', connections.steamApiKeySet ? 'Ownership ready' : 'Installed scan'],
              ['Epic Games', 'Installed manifests + Legendary account list', connections.legendaryPath ? 'Legendary configured' : 'Installed scan'],
              ['GOG', 'Owned library from Galaxy database', connections.gogDatabasePath ? 'Database configured' : 'Auto-detect Galaxy']
            ].map(([name, description, status]) => <div className="feature-row" key={name}><span className="store-badge small">{name[0]}</span><span className="feature-name">{name}<small>{description}</small></span><span className="status-pill">{status}</span></div>)}
            {['EA app', 'Battle.net', 'Xbox / Microsoft Store', 'Ubisoft Connect', 'itch.io', 'Amazon Games'].map(name => <div className="feature-row" key={name}><span className="store-badge small">{name[0]}</span><span className="feature-name">{name}</span><span className="status-pill">Local scan</span></div>)}
          </div>
          <div className="settings-card">
            <h3>Ownership imports</h3>
            <p>Steam’s Web API requires your 17-digit SteamID64, an API key, and public game details. The API key is encrypted by Windows before local storage. For Epic, install and sign in to Legendary separately, then select its executable here.</p>
            <label className="setting-row">SteamID64<input value={connections.steamId} onChange={event => setConnections({ ...connections, steamId: event.target.value })} placeholder="7656119…" inputMode="numeric" autoComplete="off" /></label>
            <label className="setting-row">Steam Web API key<input type="password" value={steamApiKey} onChange={event => setSteamApiKey(event.target.value)} placeholder={connections.steamApiKeySet ? 'Saved encrypted · enter a new key to replace' : 'Not configured'} autoComplete="new-password" /></label>
            <label className="setting-row">Legendary executable<input value={connections.legendaryPath} onChange={event => setConnections({ ...connections, legendaryPath: event.target.value })} placeholder="Path to legendary.exe" /></label>
            <button className="secondary-button" onClick={async () => { const path = await window.lobby.library.chooseLegendary(); if (path) setConnections({ ...connections, legendaryPath: path }) }}>Browse for Legendary</button>
            <label className="setting-row">GOG Galaxy database<input value={connections.gogDatabasePath} onChange={event => setConnections({ ...connections, gogDatabasePath: event.target.value })} placeholder="Auto-detected if installed" /></label>
            <button className="secondary-button" onClick={async () => { const path = await window.lobby.library.chooseGogDatabase(); if (path) setConnections({ ...connections, gogDatabasePath: path }) }}>Browse for Galaxy database</button>
            <div className="settings-actions"><button className="secondary-button" onClick={() => void saveConnections()}>Save connections</button><button className="primary-button" onClick={() => void scanLibraries()}><Library size={15} /> Scan libraries</button></div>
          </div>
          <label className="setting-row">Scan interval<select value={settings.scanIntervalHours} onChange={event => void save({ scanIntervalHours: +event.target.value })}><option value={0}>Manual only</option><option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily</option></select></label>
        </>}

        {section === 'Emulators' && <>
          <div className="settings-card">
            <div className="card-heading"><div><h3>Emulator profiles</h3><p>Profiles can target RetroArch, Dolphin, PCSX2, RPCS3, Ryujinx, Cemu, PPSSPP and DuckStation.</p></div><button className="secondary-button" onClick={() => void addEmulator()}><span>＋</span> Add profile</button></div>
            {emulators.length === 0 && <div className="empty-inline">No profiles configured yet.</div>}
            {emulators.map(profile => <div className="emulator-row" key={profile.id}>
              <input aria-label="Profile name" value={profile.name} onChange={event => updateEmulator(profile.id, { name: event.target.value })} />
              <input aria-label="Executable path" value={profile.executable} placeholder="Executable path" onChange={event => updateEmulator(profile.id, { executable: event.target.value })} />
              <input aria-label="Launch arguments" value={profile.args} placeholder="Arguments, use {rom}" onChange={event => updateEmulator(profile.id, { args: event.target.value })} />
              <button className="secondary-button" onClick={() => void saveEmulator(profile)}>Save</button>
            </div>)}
          </div>
          <div className="feature-row"><span>Automatic ROM scanning and launching</span><span className="coming-soon">COMING SOON</span></div>
        </>}

        {section === 'Covers and Metadata' && <div className="settings-card">
          <h3>Metadata providers</h3><p>Steam cover art is used automatically when an app ID is available.</p>
          <div className="feature-row"><span>SteamGridDB cover search</span><span className="coming-soon">COMING SOON</span></div>
          <div className="feature-row"><span>Default artwork style</span><span>Poster (2:3)</span></div>
          <div className="feature-row"><span>Cover cache</span><span className="status-pill">Stored locally</span></div>
          <div className="feature-row"><span>Custom cover images</span><span className="status-pill">User data folder</span></div>
        </div>}

        {section === 'Themes (MyUI)' && <>
          <div className="settings-card">
            <h3>Remote MyUI theme</h3><p>Load token-only JSON or CSS from a trusted HTTPS URL. Theme content is validated and applied live in both windows. No remote scripts are executed.</p>
            <label className="field-label">Theme URL<input value={themeUrl || settings.themeUrl || ''} onChange={event => setThemeUrl(event.target.value)} placeholder="https://example.com/my-theme.json" /></label>
            <div className="settings-actions"><button className="primary-button" disabled={busy || !themeUrl.trim()} onClick={() => void doTheme()}><Sparkles size={15} />{busy ? 'Loading…' : 'Load theme'}</button><button className="secondary-button" onClick={() => void resetTheme()}><RotateCcw size={15} /> Reset to default</button></div>
            {settings.themeName && settings.themeUrl && <div className="remote-tag">REMOTE THEME · {settings.themeName}</div>}
          </div>
          <div className="settings-card"><h3>Theme repository</h3><p>Theme repository browsing is not available yet.</p><label className="field-label">Repository index URL<input value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="Coming soon" disabled /></label><span className="coming-soon">COMING SOON</span></div>
        </>}

        {section === 'Appearance' && <div className="settings-card">
          <label className="setting-row">Poster width <span>{settings.posterWidth}px</span><input type="range" min="120" max="250" value={settings.posterWidth} onChange={event => void save({ posterWidth: +event.target.value })} /></label>
          <div className="toggle-row"><div><b>Store badges</b><small>Show a store mark on each poster</small></div><input type="checkbox" checked={settings.showBadges} onChange={event => void save({ showBadges: event.target.checked })} /></div>
          <div className="toggle-row"><div><b>Animations</b><small>Enable poster hover motion</small></div><input type="checkbox" checked={settings.animations} onChange={event => void save({ animations: event.target.checked })} /></div>
          <div className="feature-row"><span>Grid density</span><span className="coming-soon">COMING SOON</span></div>
        </div>}

        {section === 'Startup and Behavior' && <div className="settings-card">
          {['Launch on boot', 'Minimize to tray', 'Close to tray'].map(label => <div className="feature-row" key={label}><span>{label}</span><span className="coming-soon">COMING SOON</span></div>)}
        </div>}

        {section === 'Playtime and Stats' && <div className="settings-card">
          <div className="toggle-row"><div><b>Track playtime</b><small>Store session time in the local library</small></div><input type="checkbox" checked={settings.tracking} onChange={event => void save({ tracking: event.target.checked })} /></div>
          <button className="secondary-button" onClick={() => void resetPlaytime()}>Reset playtime stats</button>
        </div>}

        {section === 'Collections and Tags' && <div className="settings-card">
          <h3>Collections</h3><p>Collection creation and tags are not available yet.</p>
          <button className="secondary-button coming-soon-control" disabled>Manage collections · Coming soon</button>
        </div>}

        {section === 'Backup and Sync' && <div className="settings-card">
          <h3>Local backup</h3><p>Export titles, routes, settings and emulator profiles to JSON. Cover image files remain in the local covers folder.</p>
          <div className="settings-actions"><button className="primary-button" onClick={() => void exportBackup()}>Export library</button><button className="secondary-button" onClick={() => void importBackup()}>Import backup</button></div>
          <div className="feature-row"><span>Automatic backup</span><span className="coming-soon">COMING SOON</span></div>
        </div>}

        {section === 'Keyboard Shortcuts' && <div className="settings-card shortcuts">
          {[
            ['Ctrl + K', 'Focus search'], ['Enter', 'Launch focused game'], ['Escape', 'Close detail or modal'],
            ['Arrow keys', 'Move grid focus and scroll'], ['Right click', 'Open game menu']
          ].map(([key, action]) => <div className="feature-row" key={key}><kbd>{key}</kbd><span>{action}</span></div>)}
        </div>}

        {section === 'Plugins / Add-ons' && <div className="settings-card">
          <div className="card-heading"><div><h3>Community plugins</h3><p>Install declarative JSON manifests. Plugin JavaScript is not downloaded or executed.</p></div><button className="secondary-button" onClick={() => void installPlugin()}><Puzzle size={14} /> Add manifest</button></div>
          {plugins.map(plugin => <div className="feature-row" key={plugin.id}>{plugin.name}<span className="status-pill">v{plugin.version}</span></div>)}
          <a className="external-link" href="https://playnite.link/addons.html">Browse the Playnite add-on catalog</a>
        </div>}

        {section === 'About and Updates' && <div className="settings-card">
          <div className="about-mark"><Gamepad2 /></div><h2>Game Lobby</h2>
          <p>Version {packageInfo.version} · Local-first library manager</p>
          <p>Built with Electron, React, TypeScript and SQLite.</p>
          <button className="secondary-button coming-soon-control" disabled>Check for updates · Coming soon</button>
        </div>}
        {message && <div className="settings-toast">{message}</div>}
      </main>
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<SettingsApp />)
