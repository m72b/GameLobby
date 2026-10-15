import { z } from 'zod'
import type { EmulatorProfile, Game, PluginManifest, Settings } from '../shared/types'

const stores = ['Steam', 'Epic Games', 'GOG', 'EA app', 'Battle.net', 'Xbox', 'Ubisoft', 'Emulator', 'itch.io', 'Amazon Games', 'Custom'] as const
const storeSchema = z.enum(stores)
const shortText = (max: number) => z.string().trim().min(1).max(max)
const color = z.string().regex(/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)

export const gameRouteSchema = z.object({
  sourceId: shortText(128),
  store: storeSchema,
  appId: z.string().max(256).optional(),
  launchTarget: shortText(8_192),
  launchArgs: z.string().max(8_192).optional(),
  installPath: z.string().max(8_192).optional(),
  owned: z.boolean().optional(),
  installed: z.boolean().optional(),
  installStates: z.record(z.string().max(128), z.boolean()).optional(),
  playtimeMinutes: z.number().finite().min(0).max(1_000_000_000).optional(),
  lastPlayed: z.number().finite().min(0).max(8_640_000_000_000_000).optional()
}).strict()

export const gameSchema = z.object({
  id: shortText(512),
  title: shortText(300),
  cover: z.string().max(8_192).optional(),
  defaultCover: z.string().max(8_192).optional(),
  store: storeSchema,
  genre: z.string().max(500).optional(),
  playtimeMinutes: z.number().finite().min(0).max(1_000_000_000),
  playtimeSeconds: z.number().finite().min(0).max(60_000_000_000).optional(),
  lastPlayed: z.number().finite().min(0).max(8_640_000_000_000_000).optional(),
  hidden: z.boolean(),
  favorite: z.boolean(),
  routes: z.array(gameRouteSchema).max(128)
}).strict() satisfies z.ZodType<Game>

export const librarySaveSchema = gameSchema.partial().extend({ id: shortText(512) }).strict()

const themeSchema = z.object({
  name: shortText(80),
  bg: color,
  surface: color,
  surface2: color,
  accent: color,
  text: color,
  muted: color,
  radius: z.string().regex(/^\d{1,2}px$/),
  gap: z.string().regex(/^\d{1,2}px$/),
  font: z.string().regex(/^[\w ,"'-]{1,80}$/),
  hover: z.enum(['lift', 'glow', 'none']),
  backgroundImage: z.string().url().refine(value => new URL(value).protocol === 'https:').optional()
}).strict()

export const settingsPatchSchema = z.object({
  scanIntervalHours: z.number().int().min(0).max(168).optional(),
  posterWidth: z.number().int().min(120).max(250).optional(),
  showBadges: z.boolean().optional(),
  animations: z.boolean().optional(),
  tracking: z.boolean().optional(),
  theme: themeSchema.optional(),
  themeUrl: z.string().url().refine(value => new URL(value).protocol === 'https:').optional(),
  themeName: z.string().max(80).optional()
}).strict() satisfies z.ZodType<Partial<Settings>>

export const emulatorProfileSchema = z.object({
  id: shortText(256),
  name: shortText(128),
  executable: shortText(8_192),
  args: z.string().max(8_192),
  romFolders: z.array(shortText(8_192)).max(128),
  extensions: z.array(z.string().regex(/^\.[\da-z]{1,16}$/i)).max(256)
}).strict() satisfies z.ZodType<EmulatorProfile>

export const libraryConnectionSchema = z.object({
  steamId: z.string().max(64),
  steamApiKey: z.string().max(256).optional(),
  legendaryPath: z.string().max(8_192),
  gogDatabasePath: z.string().max(8_192)
}).strict()

export const httpsUrlSchema = z.string().url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/i),
  name: shortText(128),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/).max(64),
  kind: z.literal('library'),
  store: storeSchema,
  manifestFolder: z.string().max(8_192).optional()
}).strict() satisfies z.ZodType<PluginManifest>

export const backupSchema = z.object({
  games: z.array(gameSchema).max(100_000),
  settings: z.object({
    scanIntervalHours: z.number().int().min(0).max(168),
    posterWidth: z.number().int().min(120).max(250),
    showBadges: z.boolean(),
    animations: z.boolean(),
    tracking: z.boolean(),
    theme: themeSchema,
    themeUrl: z.string().url().refine(value => new URL(value).protocol === 'https:').optional(),
    themeName: z.string().max(80).optional()
  }).strict().optional(),
  emulators: z.array(emulatorProfileSchema).max(1_000).optional()
}).strict()

export type ValidatedBackup = z.infer<typeof backupSchema>
export type ValidatedGamePatch = z.infer<typeof librarySaveSchema>
export type ValidatedSettingsPatch = z.infer<typeof settingsPatchSchema>
export type ValidatedEmulatorProfile = z.infer<typeof emulatorProfileSchema>
export type ValidatedPluginManifest = z.infer<typeof pluginManifestSchema>
