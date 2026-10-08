import { getContent } from '../../../src/content'
import type { RoomSettings } from '../../../src/game/types'

/** Room settings built from content/shared.json defaults, with core and partner enabled. */
export function defaultSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  const d = getContent().shared.defaults
  return {
    packs: ['core', 'partner'],
    startLevel: d.startLevel,
    progression: d.progression,
    currentEvery: d.currentEvery,
    noCurrentsBefore: d.noCurrentsBefore,
    excludeAnswered: d.excludeAnswered,
    customCardsEnabled: false,
    mode: d.mode,
    passedCardCooldownDays: d.passedCardCooldownDays,
    passesPerDeck: d.passesPerDeck,
    closerSeesOpener: d.closerSeesOpener,
    lighterWindowCards: d.lighterWindowCards,
    reminderHours: d.reminderHours,
    reminderCap: d.reminderCap,
    afterDarkRetention: d.afterDarkRetention,
    ...overrides,
  }
}
