import { execFile as execFileCallback } from 'node:child_process'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addTrackedPlaytime, getSettings, markGamePlayed } from './db'

const execFile = promisify(execFileCallback)
interface Watch { gameId: string; installPath: string; requestedAt: number; onChanged?: () => void; startedAt?: number; lastSeenAt?: number; lastSavedAt?: number; lastNotifiedMinute?: number }
const watches = new Map<string, Watch>()
let timer: NodeJS.Timeout | undefined
let polling = false

async function processPaths(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const command = 'Get-CimInstance -ClassName Win32_Process | ForEach-Object { $_.ExecutablePath } | Where-Object { $_ } | ConvertTo-Json -Compress'
  const { stdout } = await execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 8_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })
  const text = stdout.trim()
  if (!text) return []
  const parsed: unknown = JSON.parse(text)
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((value): value is string => typeof value === 'string')
}

function isInside(folder: string, file: string) {
  const path = relative(resolve(folder), resolve(file))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

async function poll() {
  if (polling || !watches.size) return
  polling = true
  try {
    const paths = await processPaths()
    const now = Date.now()
    for (const [key, watch] of watches) {
      if (!getSettings().tracking) { watches.delete(key); continue }
      const alive = paths.some(path => isInside(watch.installPath, path))
      if (alive) {
        if (!watch.startedAt) {
          watch.startedAt = now
          watch.lastSavedAt = now
          markGamePlayed(watch.gameId, now)
          watch.lastNotifiedMinute = 0
          watch.onChanged?.()
        } else {
          const seconds = Math.floor((now - (watch.lastSavedAt || now)) / 1000)
          addTrackedPlaytime(watch.gameId, seconds, watch.startedAt)
          watch.lastSavedAt = now
          const playedMinutes = Math.floor((now - watch.startedAt) / 60_000)
          if (playedMinutes > (watch.lastNotifiedMinute ?? 0)) {
            watch.lastNotifiedMinute = playedMinutes
            watch.onChanged?.()
          }
        }
        watch.lastSeenAt = now
      } else if (watch.startedAt && now - (watch.lastSeenAt || now) > 30_000) {
        watches.delete(key)
      } else if (!watch.startedAt && now - watch.requestedAt > 10 * 60_000) {
        watches.delete(key)
      }
    }
  } catch (error) {
    console.warn('Game process tracking could not read process paths', error)
  } finally {
    polling = false
    if (!watches.size && timer) { clearInterval(timer); timer = undefined }
  }
}

export function watchGameProcess(gameId: string, installPath?: string, onChanged?: () => void) {
  if (!getSettings().tracking || process.platform !== 'win32' || !installPath) return false
  watches.set(gameId, { gameId, installPath, requestedAt: Date.now(), onChanged })
  if (!timer) { timer = setInterval(() => void poll(), 15_000); timer.unref() }
  void poll()
  return true
}
