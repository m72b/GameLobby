import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import Fuse from 'fuse.js'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Boxes, ChevronDown, Clock3, CloudDownload, EyeOff, Gamepad2, Heart, Library, ListFilter, MoreHorizontal, Pencil, Play, Plus, Search, Settings2, Star, X } from 'lucide-react'
import type { Game, Settings, Store as StoreName } from '../shared/types'
import { defaultSettings } from '../shared/defaults'
import { applyTheme } from './theme'

type View = 'All Games' | 'Favorites' | 'Recently Played' | 'Hidden'
type SortBy = 'title' | 'lastPlayed' | 'playtime'
type MenuAction = 'Play' | 'Edit metadata' | 'Set custom cover' | 'Hide' | 'Unhide' | 'Add to collection' | 'Link another game' | 'Open install folder' | 'Remove'

const stores: StoreName[] = ['Steam', 'Epic Games', 'GOG', 'EA app', 'Battle.net', 'Xbox', 'Ubisoft', 'Emulator', 'itch.io', 'Amazon Games', 'Custom']
const colors = ['#224d67', '#563339', '#32513d', '#544433', '#34394e', '#6c3c2b']
const storeIcon: Record<string, string> = { Steam: 'S', 'Epic Games': 'E', GOG: 'G', 'EA app': 'EA', 'Battle.net': 'B', Xbox: 'X', Ubisoft: 'U', Emulator: '⌘', 'itch.io': 'i', 'Amazon Games': 'a', Custom: '+' }

function coverImage(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value, window.location.href)
    if (url.protocol !== 'https:' && url.protocol !== 'lobby-cover:') return undefined
    const escaped = url.href.replace(/[\\"\r\n\f]/g, character => `\\${character}`)
    return `url("${escaped}")`
  } catch { return undefined }
}

function coverStyle(game: Game, index: number): CSSProperties {
  const color = colors[index % colors.length]
  const image = coverImage(game.cover)
  return {
    background: 'linear-gradient(155deg, ' + color + ', #161719)',
    backgroundImage: image ? `linear-gradient(0deg,rgba(0,0,0,.22),transparent 50%),${image}` : undefined
  }
}

export default function App() {
  const [games, setGames] = useState<Game[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [query, setQuery] = useState('')
  const [store, setStore] = useState('All Games')
  const [view, setView] = useState<View>('All Games')
  const [sortBy, setSortBy] = useState<SortBy>('title')
  const [selected, setSelected] = useState<Game | null>(null)
  const [linkingGame, setLinkingGame] = useState<Game | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; game: Game } | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editGenre, setEditGenre] = useState('')
  const [editFavorite, setEditFavorite] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [gridWidth, setGridWidth] = useState(1200)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const filteredRef = useRef<Game[]>([])
  const focusedIdRef = useRef<string | null>(null)
  const colsRef = useRef(6)
  const scrollToRowRef = useRef<(row: number) => void>(() => {})

  const refresh = async () => {
    const [nextGames, nextSettings] = await Promise.all([window.lobby.library.list(), window.lobby.settings.get()])
    setGames(nextGames)
    setSettings(nextSettings)
  }
  const notice = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2500)
  }
  const launch = async (game: Game, route = 0) => {
    try {
      await window.lobby.library.launch(game.id, route)
      await refresh()
      notice('Launching ' + game.title)
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Could not launch game')
    }
  }
  const detail = (game: Game) => {
    setSelected(game)
    setMenu(null)
  }
  const beginEdit = (game: Game) => {
    setEditingGame(game)
    setEditTitle(game.title)
    setEditGenre(game.genre || '')
    setEditFavorite(game.favorite)
    setMenu(null)
  }
  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingGame || !editTitle.trim()) return
    try {
      await window.lobby.library.save({ ...editingGame, title: editTitle.trim(), genre: editGenre.trim() || undefined, favorite: editFavorite })
      const nextGames = await window.lobby.library.list()
      setGames(nextGames)
      setSelected(nextGames.find(game => game.id === editingGame.id) || null)
      setEditingGame(null)
      notice('Game details saved')
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Could not save game details')
    }
  }
  const setCover = async (game: Game) => {
    await window.lobby.library.chooseCover(game.id)
    await refresh()
    setSelected((await window.lobby.library.list()).find(item => item.id === game.id) || null)
  }
  const linkAnotherGame = (game: Game) => {
    setLinkingGame(game)
    setLinkQuery('')
    setMenu(null)
  }
  const mergeIntoKeptGame = async (source: Game) => {
    if (!linkingGame) return
    try {
      const nextGames = await window.lobby.library.merge(linkingGame.id, source.id)
      setGames(nextGames)
      setSelected(nextGames.find(game => game.id === linkingGame.id) || null)
      setLinkingGame(null)
      notice(`Linked ${source.title} to ${linkingGame.title}`)
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Could not link these games')
    }
  }
  const menuAction = async (action: MenuAction, game: Game) => {
    setMenu(null)
    if (action === 'Play') return launch(game)
    if (action === 'Edit metadata') return beginEdit(game)
    if (action === 'Set custom cover') return setCover(game)
    if (action === 'Link another game') return linkAnotherGame(game)
    if (action === 'Hide' || action === 'Unhide') {
      const nextGames = await window.lobby.library.save({ ...game, hidden: action === 'Hide' })
      setGames(nextGames)
      setSelected(current => current?.id === game.id ? nextGames.find(item => item.id === game.id) || null : current)
      return
    }
    if (action === 'Open install folder') return window.lobby.library.chooseInstallFolder(game.id)
    if (action === 'Remove' && window.confirm('Remove ' + game.title + ' from your library?')) {
      await window.lobby.library.remove(game.id)
      await refresh()
    }
  }
  const scan = async () => {
    setScanBusy(true)
    try {
      const result = await window.lobby.library.scan()
      await refresh()
      notice(result.errors?.length ? 'Imported ' + (result.imported || 0) + ' records · ' + result.errors[0] : 'Library updated · ' + result.total + ' games')
    } catch (error) {
      notice(error instanceof Error ? error.message : 'Library scan failed')
    } finally {
      setScanBusy(false)
    }
  }
  const addGame = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await window.lobby.library.add(String(data.get('title')), String(data.get('target')))
    setAdding(false)
    await refresh()
    notice('Game added')
  }

  useEffect(() => {
    void refresh()
    const offLibrary = window.lobby.library.onChanged(() => void refresh())
    const offSettings = window.lobby.settings.onChanged(setSettings)
    const resize = () => setGridWidth(scrollRef.current?.clientWidth || window.innerWidth - 90)
    const observer = new ResizeObserver(resize)
    if (scrollRef.current) observer.observe(scrollRef.current)
    resize()
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key === 'Escape') {
        setSelected(null)
        setMenu(null)
        setAdding(false)
        setEditingGame(null)
        return
      }
      if (!typing && !selected && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        const list = filteredRef.current
        if (!list.length) return
        let index = list.findIndex(game => game.id === focusedIdRef.current)
        if (index < 0) index = 0
        else {
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? colsRef.current : -colsRef.current
          index = Math.max(0, Math.min(list.length - 1, index + delta))
        }
        const next = list[index]
        setFocusedId(next.id)
        scrollToRowRef.current(Math.floor(index / colsRef.current))
        return
      }
      if (event.key === 'Enter' && !typing) {
        const game = filteredRef.current.find(item => item.id === focusedIdRef.current) || selected
        if (game && !menu && !adding && !editingGame) {
          event.preventDefault()
          void launch(game)
        }
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      offLibrary()
      offSettings()
      observer.disconnect()
      window.removeEventListener('keydown', key)
    }
  }, [selected, menu, adding, editingGame])

  useEffect(() => { applyTheme(settings.theme, settings) }, [settings])

  const fuzzy = useMemo(() => new Fuse(games, { keys: ['title', 'genre', 'store'], threshold: 0.38, ignoreLocation: true }), [games])
  const filtered = useMemo(() => {
    const candidates = query.trim() ? fuzzy.search(query).map(result => result.item) : games
    return candidates.filter(game =>
      (view === 'Hidden' ? game.hidden : !game.hidden) &&
      (store === 'All Games' || game.store === store) &&
      (view !== 'Favorites' || game.favorite) &&
      (view !== 'Recently Played' || !!game.lastPlayed)
    )
  }, [games, query, store, view, fuzzy])
  const ordered = useMemo(() => {
    if (query.trim()) return filtered
    return [...filtered].sort((a, b) =>
      sortBy === 'lastPlayed' ? (b.lastPlayed || 0) - (a.lastPlayed || 0) :
        sortBy === 'playtime' ? b.playtimeMinutes - a.playtimeMinutes : a.title.localeCompare(b.title)
    )
  }, [filtered, query, sortBy])
  const cols = Math.max(2, Math.floor(gridWidth / (settings.posterWidth + Number.parseInt(settings.theme.gap || '9'))))
  filteredRef.current = ordered
  focusedIdRef.current = focusedId
  colsRef.current = cols
  const rows = useMemo(() => Array.from({ length: Math.ceil(ordered.length / cols) }, (_, index) => ordered.slice(index * cols, (index + 1) * cols)), [ordered, cols])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => settings.posterWidth * 1.5 + 62, overscan: 3 })
  scrollToRowRef.current = row => virtual.scrollToIndex(row, { align: 'auto' })
  const visibleRowsKey = virtual.getVirtualItems().map(row => row.index).join(',')
  useEffect(() => {
    if (!focusedId) return
    const escaped = CSS.escape(focusedId)
    scrollRef.current?.querySelector<HTMLElement>('[data-game-id="' + escaped + '"]')?.focus({ preventScroll: true })
  }, [focusedId, visibleRowsKey])
  useEffect(() => {
    if (focusedId && !ordered.some(game => game.id === focusedId)) setFocusedId(null)
  }, [ordered, focusedId])

  const menuOptions: Array<{ action: MenuAction; label: string; disabled?: boolean }> = [
    { action: 'Play', label: 'Play' },
    { action: 'Edit metadata', label: 'Edit metadata' },
    { action: 'Set custom cover', label: 'Set custom cover' },
    { action: 'Link another game', label: 'Link another game' },
    { action: menu?.game.hidden ? 'Unhide' : 'Hide', label: menu?.game.hidden ? 'Unhide' : 'Hide' },
    { action: 'Add to collection', label: 'Add to collection · Coming soon', disabled: true },
    { action: 'Open install folder', label: 'Open install folder' },
    { action: 'Remove', label: 'Remove' }
  ]

  return <div className="app-shell">
    <header className="titlebar">
      <div className="brand">Game Lobby</div><div className="drag-space" />
      <button className="title-action" onClick={() => window.lobby.window.minimize()} aria-label="Minimize">—</button>
      <button className="title-action" onClick={() => window.lobby.window.toggleMaximize()} aria-label="Maximize">□</button>
      <button className="title-action close" onClick={() => window.lobby.window.close()} aria-label="Close">×</button>
    </header>
    <aside className={'rail ' + (collapsed ? 'compact' : '')}>
      <button className="rail-button" onClick={() => setCollapsed(!collapsed)} title="Menu"><Boxes /></button>
      <button className="rail-button search-button" onClick={() => searchRef.current?.focus()} title="Search"><Search /></button>
      <div className="rail-sep" />
      <button className={'rail-button ' + (view === 'All Games' ? 'active' : '')} onClick={() => { setView('All Games'); setStore('All Games') }} title="All games"><Library /></button>
      <button className={'rail-button ' + (view === 'Favorites' ? 'active' : '')} onClick={() => setView('Favorites')} title="Favorites"><Heart /></button>
      <button className={'rail-button ' + (view === 'Recently Played' ? 'active' : '')} onClick={() => setView('Recently Played')} title="Recently played"><Clock3 /></button>
      <button className={'rail-button ' + (view === 'Hidden' ? 'active' : '')} onClick={() => setView('Hidden')} title="Hidden games"><EyeOff /></button>
      <div className="rail-sep" />
      <div className="rail-stores">{stores.slice(0, 8).map(item =>
        <button key={item} className={'rail-button mini ' + (store === item ? 'active' : '')} title={item} onClick={() => { setStore(store === item ? 'All Games' : item); setView('All Games') }}>{storeIcon[item]}</button>
      )}<button className="rail-button mini" title="Add source" onClick={() => window.lobby.settings.open()}><Plus /></button></div>
      <div className="rail-bottom">
        <button className="rail-button" title="Export library" onClick={() => void window.lobby.backup.export()}><CloudDownload /></button>
        <button className={'rail-button ' + (editMode ? 'active' : '')} title="Edit mode" onClick={() => setEditMode(!editMode)}><Pencil /></button>
        <button className="rail-button" title="Settings" onClick={() => window.lobby.settings.open()}><Settings2 /></button>
        <button className="rail-button" title="Quit" onClick={() => window.lobby.app.quit()}><X /></button>
      </div>
    </aside>
    <main className="main">
      <div className="toolbar">
        <div><div className="eyebrow">YOUR COLLECTION</div><h1>{view === 'All Games' ? (store === 'All Games' ? 'All games' : store) : view}</h1></div>
        <div className="toolbar-actions">
          <label className="searchbox"><Search size={16} /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your library" /><kbd>Ctrl K</kbd></label>
          <button className="icon-button" title="Scan libraries" onClick={() => void scan()} disabled={scanBusy}><CloudDownload size={17} className={scanBusy ? 'spin' : ''} /></button>
          <button className="primary-button" onClick={() => setAdding(true)}><Plus size={16} /> Add game</button>
        </div>
      </div>
      <div className="library-meta">
        <span>{filtered.length} GAMES</span><span className="meta-dot" />
        <button onClick={() => setView('Recently Played')}><ListFilter size={13} /> Recently played</button>
        <label className="sort-control">Sort<select value={sortBy} onChange={event => setSortBy(event.target.value as SortBy)}><option value="title">Title</option><option value="lastPlayed">Last played</option><option value="playtime">Playtime</option></select></label>
        <span className="meta-spacer" />
        <button onClick={() => setView('Favorites')}><Star size={13} /> Favorites</button>
      </div>
      <section className="grid-scroll" ref={scrollRef} onContextMenu={event => { if (!(event.target as HTMLElement).closest('.game-card')) event.preventDefault() }}>
        <div className="virtual-content" style={{ height: virtual.getTotalSize() }}>
          {virtual.getVirtualItems().map(row => {
            const gamesInRow = rows[row.index]
            return <div className="game-row" key={row.key} ref={virtual.measureElement} data-index={row.index} style={{ transform: 'translateY(' + row.start + 'px)', gridTemplateColumns: 'repeat(' + cols + ',minmax(0,1fr))' }}>
              {gamesInRow.map((game, index) => <article
                key={game.id}
                data-game-id={game.id}
                tabIndex={focusedId === game.id ? 0 : -1}
                className="game-card"
                onFocus={() => setFocusedId(game.id)}
                onClick={() => detail(game)}
                onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, game }) }}
              >
                <div className="poster" style={{ ...coverStyle(game, row.index * cols + index), aspectRatio: '2 / 3' }}>
                  <div className="poster-vignette" />
                  <div className="poster-title-mark">{!game.cover && game.title.toUpperCase()}</div>
                  {settings.showBadges && <span className="store-badge" title={game.store}>{storeIcon[game.store] || '•'}</span>}
                  <button className="play-overlay" onClick={event => { event.stopPropagation(); void launch(game) }}><Play size={14} fill="currentColor" /> Play</button>
                  <button className="card-more" aria-label="Game actions" onClick={event => { event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY, game }) }}><MoreHorizontal size={17} /></button>
                </div>
                <div className="card-title">{game.title}</div>
                <div className="card-subtitle">{game.store}{game.playtimeMinutes > 0 ? ' · ' + Math.floor(game.playtimeMinutes / 60) + 'h played' : ''}</div>
              </article>)}
            </div>
          })}
        </div>
        {!filtered.length && <div className="empty"><Gamepad2 size={30} /><h3>{query ? 'No matching games' : view === 'Hidden' ? 'No hidden games' : 'Your library is empty'}</h3><p>{view === 'Hidden' ? 'Games you hide will appear here.' : 'Scan your stores or add a game manually.'}</p><button className="primary-button" onClick={() => void scan()}><CloudDownload size={15} /> Scan libraries</button></div>}
      </section>
    </main>
    {selected && <><div className="panel-scrim" onClick={() => setSelected(null)} /><aside className="detail-panel">
      <button className="panel-close" onClick={() => setSelected(null)}><X size={17} /></button>
      <div className="detail-cover" style={coverStyle(selected, games.findIndex(game => game.id === selected.id))} />
      <div className="detail-store">{selected.store}</div><h2>{selected.title}</h2>
      <div className="detail-tags"><span>{selected.genre || 'Game'}</span><span>·</span><span>{Math.floor(selected.playtimeMinutes / 60)}h played</span></div>
      <button className="primary-button wide" onClick={() => void launch(selected)}><Play size={15} fill="currentColor" /> Play</button>
      <button className="secondary-button wide" onClick={() => beginEdit(selected)}>Edit metadata</button>
      <button className="secondary-button wide" onClick={() => linkAnotherGame(selected)}>Link another game</button>
      <div className="detail-section"><div className="detail-label">PLAY FROM</div>{selected.routes.map((route, index) =>
        <button className="route-row" key={route.sourceId + '-' + index} onClick={() => void launch(selected, index)}>
          <span className="store-badge small">{storeIcon[route.store] || '•'}</span>
          <span className="route-name">{route.store}<small>{route.installed ? 'Installed' : route.owned ? 'Owned · not installed' : 'Launch route'}</small></span><ChevronDown size={14} />
        </button>
      )}</div>
      <div className="detail-section"><div className="detail-label">LAST PLAYED</div><div className="muted-text">{selected.lastPlayed ? new Date(selected.lastPlayed).toLocaleDateString() : 'Not played yet'}</div></div>
      <button className="text-button" onClick={() => void setCover(selected)}>Set custom cover</button>
      <button className="text-button" onClick={() => void menuAction(selected.hidden ? 'Unhide' : 'Hide', selected)}>{selected.hidden ? 'Unhide game' : 'Hide game'}</button>
      <button className="text-button danger" onClick={() => void menuAction('Remove', selected)}>Remove from library</button>
    </aside></>}
    {menu && <><div className="menu-dismiss" onMouseDown={() => setMenu(null)} /><div className="context-menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 330) }}>
      {menuOptions.map(option => <button key={option.action} disabled={option.disabled} className={(option.action === 'Remove' ? 'danger ' : '') + (option.disabled ? 'menu-item-disabled' : '')} onClick={() => { if (!option.disabled) void menuAction(option.action, menu.game) }}>{option.label}</button>)}
    </div></>}
    {adding && <div className="modal-scrim"><form className="modal" onSubmit={addGame}>
      <div className="modal-head"><h2>Add a game</h2><button type="button" onClick={() => setAdding(false)}><X size={17} /></button></div>
      <label>Title<input required name="title" placeholder="Game title" autoFocus /></label>
      <label>Executable or launch URI<input required name="target" placeholder="C:\\Games\\game.exe or steam://run/123" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdding(false)}>Cancel</button><button className="primary-button">Add game</button></div>
    </form></div>}
    {editingGame && <div className="modal-scrim"><form className="modal edit-modal" onSubmit={saveEdit}>
      <div className="modal-head"><h2>Edit metadata</h2><button type="button" aria-label="Close" onClick={() => setEditingGame(null)}><X size={17} /></button></div>
      <label>Title<input required value={editTitle} onChange={event => setEditTitle(event.target.value)} autoFocus /></label>
      <label>Genre<input value={editGenre} onChange={event => setEditGenre(event.target.value)} placeholder="Optional" /></label>
      <label className="toggle-row"><span>Favorite</span><input type="checkbox" checked={editFavorite} onChange={event => setEditFavorite(event.target.checked)} /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditingGame(null)}>Cancel</button><button className="primary-button">Save changes</button></div>
    </form></div>}
    {linkingGame && <div className="modal-scrim"><div className="modal link-modal">
      <div className="modal-head"><h2>Link another game</h2><button type="button" aria-label="Close" onClick={() => setLinkingGame(null)}><X size={17} /></button></div>
      <p>Choose a duplicate to combine into <b>{linkingGame.title}</b>. Its title and metadata stay as the primary entry; launch sources and playtime are combined.</p>
      <label>Find a game<input value={linkQuery} onChange={event => setLinkQuery(event.target.value)} placeholder="Search your library" autoFocus /></label>
      <div className="link-game-list">
        {games.filter(game => game.id !== linkingGame.id && (!linkQuery.trim() || game.title.toLocaleLowerCase().includes(linkQuery.trim().toLocaleLowerCase()))).slice(0, 100).map(game =>
          <button className="link-game-row" key={game.id} onClick={() => void mergeIntoKeptGame(game)}><span><b>{game.title}</b><small>{game.store} · {game.routes.length} launch source{game.routes.length === 1 ? '' : 's'}</small></span><span>Merge</span></button>
        )}
        {games.filter(game => game.id !== linkingGame.id && (!linkQuery.trim() || game.title.toLocaleLowerCase().includes(linkQuery.trim().toLocaleLowerCase()))).length === 0 && <div className="empty-inline">No other matching games.</div>}
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={() => setLinkingGame(null)}>Cancel</button></div>
    </div></div>}
    {editMode && <div className="edit-banner">Edit mode is on · select a title to edit its metadata <button onClick={() => setEditMode(false)}>Done</button></div>}
    {toast && <div className="toast">{toast}</div>}
  </div>
}
