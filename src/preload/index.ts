import { contextBridge, ipcRenderer } from 'electron'
import type { LobbyAPI } from '../shared/types'
const api:LobbyAPI={
 window:{minimize:()=>ipcRenderer.invoke('window:minimize'),toggleMaximize:()=>ipcRenderer.invoke('window:maximize'),close:()=>ipcRenderer.invoke('window:close'),isMaximized:()=>ipcRenderer.invoke('window:isMaximized')},
 library:{list:()=>ipcRenderer.invoke('library:list'),scan:()=>ipcRenderer.invoke('library:scan'),launch:(id,route)=>ipcRenderer.invoke('library:launch',id,route),save:g=>ipcRenderer.invoke('library:save',g),remove:id=>ipcRenderer.invoke('library:remove',id),merge:(targetId,sourceId)=>ipcRenderer.invoke('library:merge',targetId,sourceId),resetPlaytime:()=>ipcRenderer.invoke('library:resetPlaytime'),setCover:(id,data)=>ipcRenderer.invoke('library:cover',id,data),chooseCover:id=>ipcRenderer.invoke('library:chooseCover',id),chooseInstallFolder:id=>ipcRenderer.invoke('library:folder',id),add:(title,target)=>ipcRenderer.invoke('library:add',title,target),connections:()=>ipcRenderer.invoke('library:connections'),saveConnections:c=>ipcRenderer.invoke('library:saveConnections',c),chooseLegendary:()=>ipcRenderer.invoke('library:chooseLegendary'),chooseGogDatabase:()=>ipcRenderer.invoke('library:chooseGogDatabase'),onChanged:callback=>{const listener=()=>callback();ipcRenderer.on('library:changed',listener);return()=>ipcRenderer.removeListener('library:changed',listener)}},
 settings:{get:()=>ipcRenderer.invoke('settings:get'),save:s=>ipcRenderer.invoke('settings:save',s),onChanged:callback=>{const listener=(_event:Electron.IpcRendererEvent,settings:Parameters<typeof callback>[0])=>callback(settings);ipcRenderer.on('settings:changed',listener);return()=>ipcRenderer.removeListener('settings:changed',listener)},open:()=>ipcRenderer.invoke('settings:open')},
 theme:{load:url=>ipcRenderer.invoke('theme:load',url),reset:()=>ipcRenderer.invoke('theme:reset')},
 emulators:{list:()=>ipcRenderer.invoke('emulators:list'),save:p=>ipcRenderer.invoke('emulators:save',p),scan:()=>ipcRenderer.invoke('emulators:scan')},
 backup:{export:()=>ipcRenderer.invoke('backup:export'),import:()=>ipcRenderer.invoke('backup:import')},
 plugins:{list:()=>ipcRenderer.invoke('plugins:list'),install:()=>ipcRenderer.invoke('plugins:install')},app:{quit:()=>ipcRenderer.invoke('app:quit')}
}
contextBridge.exposeInMainWorld('lobby',api)
