const launchSchemes = new Set([
  'steam:',
  'com.epicgames.launcher:',
  'goggalaxy:',
  'eaapp:',
  'origin2:',
  'battlenet:',
  'uplay:',
  'xbox:',
  'ms-xbox-gamepass:'
])

export function validateLaunchUri(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('Launch link is not a valid URL.') }
  if (!launchSchemes.has(url.protocol) || url.username || url.password || url.port) {
    throw new Error(`Launch links using ${url.protocol || 'this'} are not allowed.`)
  }
  return url.toString()
}
