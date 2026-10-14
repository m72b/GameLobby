import type { Settings, ThemeTokens } from './types'
export const defaultTheme: ThemeTokens = { name:'Game Lobby Dark',bg:'#101113',surface:'#181a1d',surface2:'#22252a',accent:'#75d18a',text:'#f2f3f4',muted:'#969ba3',radius:'10px',gap:'9px',font:'Inter, Segoe UI, sans-serif',hover:'lift',backgroundImage:undefined }
export const defaultSettings: Settings = { scanIntervalHours:0,posterWidth:172,showBadges:true,animations:true,tracking:true,theme:defaultTheme }
