export type Store = 'Steam' | 'Epic Games' | 'GOG' | 'EA app' | 'Battle.net' | 'Xbox' | 'Ubisoft' | 'Emulator' | 'itch.io' | 'Amazon Games' | 'Custom'
export interface GameRoute { sourceId: string; store: Store; appId?: string; launchTarget: string; launchArgs?: string; installPath?: string; owned?: boolean; installed?: boolean; installStates?: Record<string, boolean>; playtimeMinutes?: number; lastPlayed?: number }
export interface Game { id: string; title: string; cover?: string; defaultCover?: string; store: Store; genre?: string; playtimeMinutes: number; playtimeSeconds?: number; lastPlayed?: number; hidden: boolean; favorite: boolean; routes: GameRoute[] }
export interface LibraryStats { total: number; imported?: number; errors?: string[]; scannedAt?: number }
export interface LibraryConnections { steamId: string; steamApiKeySet: boolean; legendaryPath: string; gogDatabasePath: string }
export interface LibraryConnectionInput { steamId: string; steamApiKey?: string; legendaryPath: string; gogDatabasePath: string }
export interface ThemeTokens { name: string; bg: string; surface: string; surface2: string; accent: string; text: string; muted: string; radius: string; gap: string; font: string; hover: string; backgroundImage?: string }
export interface Settings { scanIntervalHours: number; posterWidth: number; showBadges: boolean; animations: boolean; tracking: boolean; theme: ThemeTokens; themeUrl?: string; themeName?: string }
export interface EmulatorProfile { id: string; name: string; executable: string; args: string; romFolders: string[]; extensions: string[] }
export interface PluginManifest { id: string; name: string; version: string; kind: 'library'; store: Store; manifestFolder?: string }
export interface LobbyAPI {
  window: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean> }
  library: { list(): Promise<Game[]>; scan(): Promise<LibraryStats>; launch(id: string, route?: number): Promise<void>; save(game: Partial<Game> & { id: string }): Promise<Game[]>; remove(id: string): Promise<Game[]>; merge(targetId: string, sourceId: string): Promise<Game[]>; resetPlaytime(): Promise<Game[]>; setCover(id: string, dataUrl: string | null): Promise<Game[]>; chooseCover(id: string): Promise<Game[]>; chooseInstallFolder(id: string): Promise<void>; add(title: string, target: string): Promise<Game[]>; connections(): Promise<LibraryConnections>; saveConnections(input: LibraryConnectionInput): Promise<LibraryConnections>; chooseLegendary(): Promise<string | null>; chooseGogDatabase(): Promise<string | null>; onChanged(callback: () => void): () => void }
  settings: { get(): Promise<Settings>; save(settings: Partial<Settings>): Promise<Settings>; onChanged(callback: (settings: Settings) => void): () => void; open(): Promise<void> }
  theme: { load(url: string): Promise<Settings>; reset(): Promise<Settings> }
  emulators: { list(): Promise<EmulatorProfile[]>; save(profile: EmulatorProfile): Promise<EmulatorProfile[]>; scan(): Promise<LibraryStats> }
  backup: { export(): Promise<string | null>; import(): Promise<number> }
  plugins: { list(): Promise<PluginManifest[]>; install(): Promise<PluginManifest[]> }
  app: { quit(): Promise<void> }
}
declare global { interface Window { lobby: LobbyAPI } }
