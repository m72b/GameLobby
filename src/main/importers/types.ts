import type { Game } from '../../shared/types'
export interface Importer { id:string; name:string; scan():Promise<Game[]> }
