import type { Settings, ThemeTokens } from '../shared/types'

export function applyTheme(theme: ThemeTokens, settings?: Settings) {
  const root = document.documentElement
  root.style.setProperty('--bg', theme.bg)
  root.style.setProperty('--surface', theme.surface)
  root.style.setProperty('--surface-2', theme.surface2)
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--text', theme.text)
  root.style.setProperty('--muted', theme.muted)
  root.style.setProperty('--radius', theme.radius)
  root.style.setProperty('--gap', theme.gap)
  root.style.setProperty('--font', theme.font)

  let background = 'none'
  try {
    const url = new URL(theme.backgroundImage || '')
    if (url.protocol === 'https:') background = 'url("' + url.href.replace(/["\\\r\n]/g, '') + '")'
  } catch { /* A missing or invalid persisted image falls back to the token background. */ }
  root.style.setProperty('--background-image', background)
  root.dataset.hover = theme.hover
  if (settings) root.dataset.animations = settings.animations ? 'on' : 'off'
}
