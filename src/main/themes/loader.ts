import { z } from 'zod'
import type { ThemeTokens } from '../../shared/types'
import { defaultTheme } from '../../shared/defaults'

const MAX_THEME_BYTES = 64 * 1024
const schema = z.object({
  name: z.string().max(80).optional(),
  bg: z.string().optional(),
  surface: z.string().optional(),
  surface2: z.string().optional(),
  accent: z.string().optional(),
  text: z.string().optional(),
  muted: z.string().optional(),
  radius: z.string().optional(),
  gap: z.string().optional(),
  font: z.string().optional(),
  hover: z.enum(['lift', 'glow', 'none']).optional(),
  backgroundImage: z.string().url().optional()
}).strict()
const color = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i

export async function readLimitedThemeBody(response: Response, maxBytes = MAX_THEME_BYTES): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel()
    throw new Error('Theme file is too large.')
  }
  if (!response.body) throw new Error('Theme response did not contain a file.')

  const reader = response.body.getReader()
  const bytes = new Uint8Array(maxBytes)
  let used = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (used + value.byteLength > maxBytes) {
        await reader.cancel()
        throw new Error('Theme file is too large.')
      }
      bytes.set(value, used)
      used += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used))
  } catch {
    throw new Error('Theme file must be valid UTF-8.')
  }
}

function safeValue(key: string, value: string) {
  if (key === 'name') return value.trim().slice(0, 80)
  if (['bg', 'surface', 'surface2', 'accent', 'text', 'muted'].includes(key)) return color.test(value) ? value : undefined
  if (key === 'radius' || key === 'gap') return /^\d{1,2}px$/.test(value) ? value : undefined
  if (key === 'font') return /^[\w ,"'-]{1,80}$/.test(value) ? value : undefined
  if (key === 'hover') return ['lift', 'glow', 'none'].includes(value) ? value : undefined
  if (key === 'backgroundImage') {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : undefined } catch { return undefined }
  }
  return undefined
}

export async function loadRemoteTheme(rawUrl: string): Promise<ThemeTokens> {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Theme URLs must use HTTPS without credentials.')
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Theme server returned ${response.status}.`)
  const body = await readLimitedThemeBody(response)
  let raw: unknown
  if (url.pathname.toLowerCase().endsWith('.css')) {
    const block = body.match(/:root\s*\{([^}]*)\}/i)?.[1]
    if (!block) throw new Error('CSS theme must define tokens in :root.')
    const values: Record<string, string> = {}
    for (const [, key, value] of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) {
      values[key.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase())] = value.trim()
    }
    raw = values
  } else {
    try { raw = JSON.parse(body) } catch { throw new Error('Theme file must contain valid JSON or token-only CSS.') }
  }
  const parsed = schema.parse(raw)
  const theme = {
    ...defaultTheme,
    ...Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? safeValue(key, value) : value]).filter(([, value]) => value !== undefined))
  }
  return theme as ThemeTokens
}
