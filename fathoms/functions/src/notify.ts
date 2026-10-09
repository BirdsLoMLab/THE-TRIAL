// Notification text (mirrors content/shared.json notifications; a test keeps them equal)
// and the token fan out with pruning of dead tokens.

export const TEXT = {
  turnTitle: 'Your turn',
  turnBody: '{partner} answered: {card}',
  turnBodyAdult: '{partner} answered an After Dark card',
  revealTitle: 'Last card answered',
  reminderTitle: 'Still your turn',
  reminderBody: '{partner} has been waiting {hours} hours',
  nudgeBody: '{partner} nudged you',
} as const

export const CARD_PREVIEW_LENGTH = 60

export interface Payload {
  readonly title: string
  readonly body: string
  readonly data: Readonly<Record<string, string>>
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

/** The first 60 characters of the card, cut at a word boundary, with an ellipsis when shortened. */
export function preview(cardText: string): string {
  const trimmed = cardText.trim()
  if (trimmed.length <= CARD_PREVIEW_LENGTH) return trimmed
  let cut = trimmed.slice(0, CARD_PREVIEW_LENGTH)
  const space = cut.lastIndexOf(' ')
  if (space >= CARD_PREVIEW_LENGTH / 2) cut = cut.slice(0, space)
  return `${cut.replace(/[\s,;:]+$/, '')}...`
}

/** "Your turn" with the partner name and the card, or only the pack name for After Dark (PLAN 4.9). */
export function turnPayload(
  roomId: string,
  partner: string,
  card: { text: string; adult: boolean } | null,
): Payload {
  const body = card
    ? card.adult
      ? fill(TEXT.turnBodyAdult, { partner })
      : fill(TEXT.turnBody, { partner, card: preview(card.text) })
    : `${partner} sent a turn`
  return { title: TEXT.turnTitle, body, data: { roomId, kind: 'turn' } }
}

/**
 * The last card of a deck was closed and the ball stayed with the closer, so
 * no turn alert goes out: the opener is told their card was answered instead.
 */
export function revealPayload(
  roomId: string,
  partner: string,
  card: { text: string; adult: boolean } | null,
): Payload {
  const body = card
    ? card.adult
      ? fill(TEXT.turnBodyAdult, { partner })
      : fill(TEXT.turnBody, { partner, card: preview(card.text) })
    : `${partner} answered your card`
  return { title: TEXT.revealTitle, body, data: { roomId, kind: 'reveal' } }
}

export function reminderPayload(roomId: string, partner: string, hours: number): Payload {
  return {
    title: TEXT.reminderTitle,
    body: fill(TEXT.reminderBody, { partner, hours: String(hours) }),
    data: { roomId, kind: 'reminder' },
  }
}

export function nudgePayload(roomId: string, partner: string): Payload {
  return {
    title: TEXT.turnTitle,
    body: fill(TEXT.nudgeBody, { partner }),
    data: { roomId, kind: 'nudge' },
  }
}

/** The FCM error codes that mean a token is dead and should be pruned. */
export const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export interface SendResult {
  readonly sent: number
  readonly dead: string[]
}

export interface Sender {
  /** Sends to each token and reports which ones are dead. */
  send(tokens: readonly string[], payload: Payload): Promise<SendResult>
}

/** Classifies a multicast response: which tokens are dead. Pure, for tests. */
export function deadTokens(
  tokens: readonly string[],
  responses: readonly { success: boolean; error?: { code?: string } | null | undefined }[],
): string[] {
  const dead: string[] = []
  responses.forEach((response, index) => {
    const token = tokens[index]
    if (!response.success && token && DEAD_TOKEN_CODES.has(response.error?.code ?? ''))
      dead.push(token)
  })
  return dead
}
