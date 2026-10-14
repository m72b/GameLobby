import type { Game } from '../../shared/types'
import type { LibraryConnectionInput } from '../../shared/types'
export interface ImporterOptions { connections: Pick<LibraryConnectionInput, 'steamId' | 'legendaryPath' | 'gogDatabasePath'>; steamApiKey?: string }
export interface Importer { id: string; name: string; scan(options?: ImporterOptions): Promise<Game[]> }
