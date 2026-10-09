import { z } from 'zod'

// Shape of content/shared.json and content/packs/*.json. The shape is fixed by
// PLAN.md section 11 and the content test in section 9. Adding a field means
// changing this schema and the content test in the same commit.

export const LEVEL_IDS = [1, 2, 3] as const
export type LevelId = (typeof LEVEL_IDS)[number]

export const MODES = ['live', 'async'] as const
export type Mode = (typeof MODES)[number]

export const MAX_CARD_TEXT = 220
export const MIN_CARDS_PER_LEVEL = 16

const nonEmpty = z.string().trim().min(1, 'must not be empty')
const idString = z
  .string()
  .min(1, 'id must not be empty')
  .max(64, 'id is too long')
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be lowercase letters, digits, and dashes')
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a 6 digit hex color')
const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')

export const levelIdSchema = z.literal([1, 2, 3])

export const cardTextSchema = z
  .string()
  .min(1, 'card text must not be empty')
  .max(MAX_CARD_TEXT, `card text must be at most ${MAX_CARD_TEXT} characters`)
  .refine((text) => !text.includes('"'), 'card text must not contain a double quote')
  .refine((text) => text.trim() === text, 'card text must not start or end with whitespace')

const promptTextSchema = z
  .string()
  .min(1, 'text must not be empty')
  .max(MAX_CARD_TEXT, `text must be at most ${MAX_CARD_TEXT} characters`)

export const questionCardSchema = z.strictObject({
  id: idString,
  level: levelIdSchema,
  type: z.literal('question'),
  text: cardTextSchema,
  tags: z.array(nonEmpty),
})

export const currentCardSchema = z.strictObject({
  id: idString,
  level: z.null(),
  type: z.literal('current'),
  modes: z.array(z.enum(MODES)).min(1, 'a Current needs at least one mode'),
  text: cardTextSchema,
  tags: z.array(nonEmpty),
})

export const cardSchema = z.discriminatedUnion('type', [questionCardSchema, currentCardSchema])

export type QuestionCard = z.infer<typeof questionCardSchema>
export type CurrentCard = z.infer<typeof currentCardSchema>
export type Card = z.infer<typeof cardSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const packFileSchema = z
  .strictObject({
    pack: idString,
    adult: z.boolean().default(false),
    cards: z.array(cardSchema).min(1, 'a pack needs at least one card'),
  })
  .superRefine(
    (pack, ctx) => {
      // Runs even when a card failed to parse (when: () => true), so a pack with
      // a type error still reports its duplicate ids and short levels in the
      // same pass. The guards below keep it safe on partially parsed input.
      const cards: unknown[] = Array.isArray(pack.cards) ? pack.cards : []
      const packName = typeof pack.pack === 'string' ? pack.pack : '?'
      for (const level of LEVEL_IDS) {
        const count = cards.filter(
          (c) => isRecord(c) && c.type === 'question' && c.level === level,
        ).length
        if (count < MIN_CARDS_PER_LEVEL) {
          ctx.addIssue({
            code: 'custom',
            path: ['cards'],
            message: `pack ${packName} has ${count} level ${level} cards, needs at least ${MIN_CARDS_PER_LEVEL}`,
          })
        }
      }
      const seen = new Set<string>()
      cards.forEach((card, index) => {
        if (!isRecord(card) || typeof card.id !== 'string') return
        if (seen.has(card.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['cards', index, 'id'],
            message: `duplicate card id ${card.id}`,
          })
        }
        seen.add(card.id)
      })
    },
    { when: () => true },
  )

export type PackFile = z.infer<typeof packFileSchema>

export const levelDefSchema = z.strictObject({
  id: levelIdSchema,
  name: nonEmpty,
  blurb: nonEmpty,
  color: hexColor,
})

export const packRefSchema = z.strictObject({
  id: idString,
  name: nonEmpty,
  blurb: nonEmpty,
  file: nonEmpty,
  adult: z.boolean().default(false),
})

export const promptSchema = z.strictObject({
  id: idString,
  text: promptTextSchema,
})

export const quietHoursSchema = z
  .strictObject({ start: timeHHMM, end: timeHHMM, tz: nonEmpty })
  .nullable()

export const defaultsSchema = z.strictObject({
  mode: z.enum(['turns', 'live']),
  startLevel: levelIdSchema,
  progression: z.enum(['linear', 'mixed']),
  currentEvery: z.number().int().min(0),
  noCurrentsBefore: z.number().int().min(0),
  passesPerDeck: z.number().int().min(0),
  passedCardCooldownDays: z.number().int().min(0),
  excludeAnswered: z.boolean(),
  closerSeesOpener: z.boolean(),
  reminderHours: z.number().positive(),
  reminderCap: z.number().int().positive().nullable(),
  quietHours: quietHoursSchema,
  lighterWindowCards: z.number().int().min(1),
  afterDarkRetention: z.enum(['keep', 'hide-after-read']),
  maxPlayers: z.literal(2),
})

export const notificationsSchema = z.strictObject({
  turnTitle: nonEmpty,
  turnBody: nonEmpty,
  turnBodyAdult: nonEmpty,
  revealTitle: nonEmpty,
  reminderTitle: nonEmpty,
  reminderBody: nonEmpty,
  nudgeBody: nonEmpty,
})

export const sharedSchema = z.strictObject({
  version: z.number().int().positive(),
  appName: nonEmpty,
  levels: z
    .array(levelDefSchema)
    .length(3, 'exactly three levels')
    .refine((levels) => levels.map((l) => l.id).join(',') === '1,2,3', 'levels must be 1, 2, 3 in order'),
  currentColor: hexColor,
  afterDarkColor: hexColor,
  rules: z.tuple([nonEmpty, nonEmpty]),
  packs: z.array(packRefSchema).min(1),
  defaults: defaultsSchema,
  notifications: notificationsSchema,
  reactions: z.array(nonEmpty).min(1),
  openers: z.array(promptSchema).min(1),
  closers: z.array(promptSchema).min(1),
  followUps: z.array(promptSchema).min(1),
  daily: z.array(promptSchema).min(1),
})

export type Shared = z.infer<typeof sharedSchema>
export type LevelDef = z.infer<typeof levelDefSchema>
export type PackRef = z.infer<typeof packRefSchema>

/** A card from a pack, stamped with the pack it came from. */
export type PoolCard = Card & { readonly pack: string; readonly adult: boolean }

/** A pack as the app sees it: the shared.json entry merged with its file. */
export interface PackEntry {
  readonly id: string
  readonly name: string
  readonly blurb: string
  readonly file: string
  readonly adult: boolean
  readonly cards: readonly Card[]
}

export interface Content {
  readonly shared: Shared
  readonly packs: readonly PackEntry[]
  readonly cards: readonly PoolCard[]
}

export class ContentError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid content (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n` + issues.map((i) => `  ${i}`).join('\n'))
    this.name = 'ContentError'
    this.issues = issues
  }
}

function formatZodError(label: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? ` at ${issue.path.map(String).join('.')}` : ''
    return `${label}${path}: ${issue.message}`
  })
}

/**
 * Validate shared.json plus every pack file and merge them.
 *
 * `packFiles` is keyed by the path shared.json uses to reference a pack, for
 * example `packs/core.json`. Throws ContentError listing every problem found.
 */
export function validateContent(sharedRaw: unknown, packFiles: Readonly<Record<string, unknown>>): Content {
  const issues: string[] = []

  const sharedResult = sharedSchema.safeParse(sharedRaw)
  if (!sharedResult.success) issues.push(...formatZodError('shared.json', sharedResult.error))

  const parsedPacks = new Map<string, PackFile>()
  for (const [file, raw] of Object.entries(packFiles)) {
    const result = packFileSchema.safeParse(raw)
    if (result.success) parsedPacks.set(file, result.data)
    else issues.push(...formatZodError(file, result.error))
  }

  if (!sharedResult.success) throw new ContentError(issues)
  const shared = sharedResult.data

  const referenced = new Set<string>()
  const packs: PackEntry[] = []
  for (const ref of shared.packs) {
    referenced.add(ref.file)
    const pack = parsedPacks.get(ref.file)
    if (!pack) {
      if (!(ref.file in packFiles)) issues.push(`shared.json: pack ${ref.id} points at ${ref.file}, which was not loaded`)
      continue
    }
    if (pack.pack !== ref.id) issues.push(`${ref.file}: pack is ${pack.pack} but shared.json lists it as ${ref.id}`)
    if (pack.adult !== ref.adult) issues.push(`${ref.file}: adult is ${pack.adult} but shared.json says ${ref.adult}`)
    packs.push({ id: ref.id, name: ref.name, blurb: ref.blurb, file: ref.file, adult: ref.adult, cards: pack.cards })
  }
  for (const file of Object.keys(packFiles)) {
    if (!referenced.has(file)) issues.push(`${file}: pack file is not listed in shared.json packs`)
  }

  const seenCardIds = new Map<string, string>()
  for (const pack of packs) {
    for (const card of pack.cards) {
      const owner = seenCardIds.get(card.id)
      if (owner && owner !== pack.id) issues.push(`${pack.file}: card id ${card.id} is also used in ${owner}`)
      seenCardIds.set(card.id, pack.id)
    }
  }

  const seenPromptIds = new Set<string>()
  for (const list of ['openers', 'closers', 'followUps', 'daily'] as const) {
    for (const prompt of shared[list]) {
      if (seenPromptIds.has(prompt.id)) issues.push(`shared.json: duplicate prompt id ${prompt.id} in ${list}`)
      seenPromptIds.add(prompt.id)
    }
  }

  if (issues.length) throw new ContentError(issues)

  const cards: PoolCard[] = packs.flatMap((pack) =>
    pack.cards.map((card) => Object.freeze({ ...card, pack: pack.id, adult: pack.adult })),
  )

  return Object.freeze({ shared, packs: Object.freeze(packs), cards: Object.freeze(cards) })
}

export interface PackCount {
  readonly packId: string
  readonly name: string
  readonly adult: boolean
  readonly levels: Readonly<Record<LevelId, number>>
  readonly currents: number
  readonly total: number
}

/** Card counts per pack and level, in shared.json pack order. */
export function countCards(content: Content): PackCount[] {
  return content.packs.map((pack) => {
    const levels: Record<LevelId, number> = { 1: 0, 2: 0, 3: 0 }
    let currents = 0
    for (const card of pack.cards) {
      if (card.type === 'question') levels[card.level] += 1
      else currents += 1
    }
    return { packId: pack.id, name: pack.name, adult: pack.adult, levels, currents, total: pack.cards.length }
  })
}
