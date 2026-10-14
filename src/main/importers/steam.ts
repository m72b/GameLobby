import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Game } from '../../shared/types'
import type { Importer } from './types'

function steamRoots():string[] {
  const roots=new Set<string>()
  for(const p of ['C:/Program Files (x86)/Steam','C:/Program Files/Steam','D:/Steam']) if(existsSync(p)) roots.add(p)
  try { const key='HKCU\\Software\\Valve\\Steam'; const out=require('node:child_process').execFileSync('reg',['query',key,'/v','SteamPath'],{encoding:'utf8'}); const m=out.match(/SteamPath\s+REG_SZ\s+(.+)/i);if(m)roots.add(m[1].trim().replaceAll('\\','/')) } catch {}
  const base=[...roots]; for(const root of base){try{const text=readFileSync(join(root,'steamapps','libraryfolders.vdf'),'utf8');for(const m of text.matchAll(/"path"\s+"([^"]+)"/g))roots.add(m[1].replaceAll('\\','/'))}catch{}}
  return [...roots]
}
export const steamImporter:Importer={id:'steam',name:'Steam',async scan(){const games:Game[]=[];for(const root of steamRoots()){const folder=join(root,'steamapps');if(!existsSync(folder))continue;for(const file of readdirSync(folder).filter(x=>/^appmanifest_\d+\.acf$/i.test(x))){try{const text=readFileSync(join(folder,file),'utf8');const appid=text.match(/"appid"\s+"(\d+)"/)?.[1],title=text.match(/"name"\s+"([^"]+)"/)?.[1],installdir=text.match(/"installdir"\s+"([^"]+)"/)?.[1];if(!appid||!title)continue;games.push({id:`steam:${appid}`,title,store:'Steam',cover:`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,defaultCover:`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,playtimeMinutes:0,hidden:false,favorite:false,routes:[{sourceId:'steam',store:'Steam',appId:appid,launchTarget:`steam://run/${appid}`,installPath:installdir?join(folder,'common',installdir):undefined}]})}catch{}}}return games}}
