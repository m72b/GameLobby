import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

const manifestRoots=['C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests','C:/ProgramData/EpicGames/Launcher/Data/Manifests']
export const epicImporter:Importer={id:'epic',name:'Epic Games',async scan(){const games:Game[]=[];for(const root of manifestRoots){if(!existsSync(root))continue;for(const file of readdirSync(root).filter(x=>x.endsWith('.item'))){try{const m=JSON.parse(readFileSync(join(root,file),'utf8'));const id=String(m.CatalogItemId||m.InstallationGuid||file),title=m.DisplayName||m.AppName;if(!title)continue;games.push({id:`epic:${id}`,title,store:'Epic Games',cover:m.LargePreviewImage||m.KeyImages?.[0]?.URL,defaultCover:m.LargePreviewImage||m.KeyImages?.[0]?.URL,playtimeMinutes:0,hidden:false,favorite:false,routes:[{sourceId:'epic',store:'Epic Games',appId:id,launchTarget:`com.epicgames.launcher://apps/${encodeURIComponent(m.AppName||id)}?action=launch&silent=true`,installPath:m.InstallLocation}]})}catch{}}}return games}}
