import assert from 'node:assert/strict'
import test from 'node:test'
import { backupSchema, emulatorProfileSchema, gameSchema, librarySaveSchema, pluginManifestSchema, settingsPatchSchema } from '../src/main/validation.ts'
import { validateLaunchUri } from '../src/main/security.ts'
import { readLimitedThemeBody, loadRemoteTheme } from '../src/main/themes/loader.ts'
import { steamStateFlagsIndicateInstalled } from '../src/main/importers/steam.ts'

const route = { sourceId: 'steam', store: 'Steam', appId: '570', launchTarget: 'steam://run/570', installed: true }
const game = { id: 'steam:570', title: 'Dota 2', store: 'Steam', playtimeMinutes: 0, hidden: false, favorite: false, routes: [route] }
const settings = { scanIntervalHours: 0, posterWidth: 172, showBadges: true, animations: true, tracking: true, theme: { name: 'Default', bg: '#101113', surface: '#181a1d', surface2: '#22252a', accent: '#75d18a', text: '#f2f3f4', muted: '#969ba3', radius: '10px', gap: '9px', font: 'Inter, Segoe UI, sans-serif', hover: 'lift' } }

test('library and backup schemas accept the app data shape and reject unexpected fields', () => {
  assert.equal(librarySaveSchema.parse({ ...game, favorite: true }).favorite, true)
  assert.equal(gameSchema.parse(game).routes.length, 1)
  assert.equal(backupSchema.parse({ games: [game], settings }).games.length, 1)
  assert.throws(() => librarySaveSchema.parse({ ...game, arbitrary: 'value' }))
  assert.throws(() => backupSchema.parse({ games: [{ ...game, unexpected: true }] }))
})

test('settings, emulator, and plugin manifest schemas enforce bounds and known fields', () => {
  assert.equal(settingsPatchSchema.parse({ posterWidth: 220, tracking: false }).posterWidth, 220)
  assert.throws(() => settingsPatchSchema.parse({ posterWidth: 999 }))
  assert.throws(() => settingsPatchSchema.parse({ tracking: true, unknownSetting: true }))
  assert.equal(emulatorProfileSchema.parse({ id: 'dolphin', name: 'Dolphin', executable: 'Dolphin.exe', args: '--exec {rom}', romFolders: ['D:/Roms'], extensions: ['.iso'] }).extensions[0], '.iso')
  assert.throws(() => emulatorProfileSchema.parse({ id: 'bad', name: 'Bad', executable: '', args: '', romFolders: [], extensions: ['iso'] }))
  const manifest = { id: 'sample-library', name: 'Sample', version: '1.2.3', kind: 'library', store: 'Custom' }
  assert.equal(pluginManifestSchema.parse(manifest).name, 'Sample')
  assert.throws(() => pluginManifestSchema.parse({ ...manifest, id: '../bad' }))
})

test('external game launch links are limited to approved store schemes', () => {
  assert.equal(validateLaunchUri('steam://run/570'), 'steam://run/570')
  assert.equal(validateLaunchUri('com.epicgames.launcher://apps/example?action=launch'), 'com.epicgames.launcher://apps/example?action=launch')
  assert.throws(() => validateLaunchUri('javascript://alert(1)'))
  assert.throws(() => validateLaunchUri('https://example.com'))
  assert.throws(() => validateLaunchUri('steam://user:pass@host/run/570'))
})

test('theme response size is checked before the full body is buffered', async () => {
  const declaredTooLarge = new Response('ignored', { headers: { 'content-length': '17' } })
  await assert.rejects(readLimitedThemeBody(declaredTooLarge, 16), /too large/i)

  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(17)); controller.close() } })
  await assert.rejects(readLimitedThemeBody(new Response(stream), 16), /too large/i)
})

test('theme fetching refuses redirects and loads a valid bounded HTTPS theme', async () => {
  const originalFetch = globalThis.fetch
  let redirectMode: RequestRedirect | undefined
  globalThis.fetch = async (_input, init) => {
    redirectMode = init?.redirect
    return new Response(JSON.stringify({ name: 'Remote', accent: '#abcdef' }), { headers: { 'content-type': 'application/json' } })
  }
  try {
    const theme = await loadRemoteTheme('https://themes.example/game-lobby.json')
    assert.equal(theme.name, 'Remote')
    assert.equal(theme.accent, '#abcdef')
    assert.equal(redirectMode, 'error')
    await assert.rejects(loadRemoteTheme('http://themes.example/theme.json'), /HTTPS/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Steam manifest state flags include the fully installed bit', () => {
  assert.equal(steamStateFlagsIndicateInstalled('"StateFlags" "4"'), true)
  assert.equal(steamStateFlagsIndicateInstalled('"StateFlags" "6"'), true)
  assert.equal(steamStateFlagsIndicateInstalled('"StateFlags" "2"'), false)
  assert.throws(() => steamStateFlagsIndicateInstalled('"appid" "570"'), /state flags/i)
})
