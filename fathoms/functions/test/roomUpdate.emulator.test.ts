// onBallPass and the reminder sweep against the Firestore emulator (PLAN section 9).
// The handlers are called directly through the admin SDK; with FUNCTIONS_EMULATOR
// set they write rooms/{id}/outbox instead of calling FCM. Run by pnpm test:rules.
process.env['FUNCTIONS_EMULATOR'] = 'true'
process.env['GCLOUD_PROJECT'] ??= 'demo-fathoms'

import { getFirestore } from 'firebase-admin/firestore'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleRoomUpdate, NUDGE_INTERVAL_MS, sweep } from '../src/index.js'
import { HOUR_MS } from '../src/reminders.js'

const ROOM = 'fn-room-abcdefghijklmnop'
const QUIET_ROOM = 'fn-quiet-abcdefghijklmno'

function player(
  name: string,
  tokens: string[],
  quietHours: { start: string; end: string; tz: string } | null = null,
) {
  return {
    name,
    color: '#4fb3d9',
    joinedAt: 1,
    lastSeen: null,
    fcmTokens: tokens,
    quietHours,
    excludeTags: [],
    afterDarkEnabled: false,
    afterDarkConfirmedAt: null,
    lastTurnAt: null,
    rulesAgreedAt: 1,
  }
}

function roomDoc(holder: string, since: number, extra: Record<string, unknown> = {}) {
  return {
    createdAt: 1,
    version: 1,
    rules: ['one', 'two'],
    players: { alice: player('Ada', ['token-a1', 'token-a2']), bob: player('Ben', ['token-b1']) },
    order: ['alice', 'bob'],
    settings: { closerSeesOpener: false, passesPerDeck: 3, reminderHours: 10, reminderCap: null },
    deck: { seed: 's', cards: [], dealt: 1, builtAt: 1 },
    ball: { holderUid: holder, since, lastReminderAt: null, remindersSent: 0 },
    openSeq: 1,
    turn: 1,
    cardCount: 1,
    passes: { alice: 3, bob: 3 },
    lighter: null,
    paused: null,
    nudge: null,
    deleteRequests: {},
    passedCards: {},
    ...extra,
  }
}

const db = getFirestore()

async function outbox(roomId = ROOM) {
  const snap = await db.collection('rooms').doc(roomId).collection('outbox').orderBy('at').get()
  return snap.docs.map((d) => d.data())
}

beforeAll(async () => {
  // Other emulator suites leave rooms behind; the sweep must only see ours.
  const rooms = await db.collection('rooms').get()
  for (const room of rooms.docs) await room.ref.delete()
  for (const id of [ROOM, QUIET_ROOM]) {
    const existing = await db.collection('rooms').doc(id).collection('outbox').get()
    for (const d of existing.docs) await d.ref.delete()
  }
  await db.collection('rooms').doc(ROOM).set(roomDoc('alice', 1))
  await db.collection('rooms').doc(ROOM).collection('cards').doc('0001').set({
    seq: 1,
    cardId: 'c1-01',
    cardText:
      'What is a small thing that reliably makes your day better, and when did you last get it?',
    pack: 'core',
    adult: false,
    level: 1,
    type: 'question',
    dealtAt: 1,
    openerUid: 'alice',
    closerUid: 'bob',
    answers: {},
    followUps: {},
    reactions: {},
    favorite: false,
    readBy: {},
    status: 'open',
    closedAt: null,
    passedBy: null,
  })
})

describe('handleRoomUpdate', () => {
  it('sends "Your turn" with the partner name and the card to the new holder tokens', async () => {
    const before = roomDoc('alice', 1)
    const after = roomDoc('bob', 2)
    expect(await handleRoomUpdate(ROOM, before, after)).toEqual(['turn'])
    const [message] = await outbox()
    expect(message).toMatchObject({
      title: 'Your turn',
      body: 'Ada answered: What is a small thing that reliably makes your day better...',
      tokens: ['token-b1'],
      data: { roomId: ROOM, kind: 'turn' },
    })
  })

  it('does nothing when the ball did not move and there is no nudge', async () => {
    expect(
      await handleRoomUpdate(ROOM, roomDoc('bob', 2), roomDoc('bob', 2, { openSeq: 2 })),
    ).toEqual([])
  })

  it('pokes the holder on a nudge, ignores the holder nudging, and rate limits to one per ten hours', async () => {
    const base = roomDoc('bob', 2)
    expect(
      await handleRoomUpdate(ROOM, base, roomDoc('bob', 2, { nudge: { by: 'alice', at: 5 } })),
    ).toEqual(['nudge'])
    const items = await outbox()
    expect(items.at(-1)).toMatchObject({
      title: 'Your turn',
      body: 'Ada nudged you',
      tokens: ['token-b1'],
    })
    expect(
      await handleRoomUpdate(ROOM, base, roomDoc('bob', 2, { nudge: { by: 'bob', at: 6 } })),
    ).toEqual([])
    const soon = roomDoc('bob', 2, { nudge: { by: 'alice', at: 5 + NUDGE_INTERVAL_MS - 1 } })
    expect(
      await handleRoomUpdate(ROOM, roomDoc('bob', 2, { nudge: { by: 'alice', at: 5 } }), soon),
    ).toEqual([])
    const later = roomDoc('bob', 2, { nudge: { by: 'alice', at: 5 + NUDGE_INTERVAL_MS } })
    expect(
      await handleRoomUpdate(ROOM, roomDoc('bob', 2, { nudge: { by: 'alice', at: 5 } }), later),
    ).toEqual(['nudge'])
    expect(
      await handleRoomUpdate(
        ROOM,
        base,
        roomDoc('bob', 2, {
          nudge: { by: 'alice', at: 7 },
          paused: { by: 'bob', at: 7, note: '' },
        }),
      ),
    ).toEqual([])
  })

  it('shows only the pack name for an After Dark card', async () => {
    await db
      .collection('rooms')
      .doc(ROOM)
      .collection('cards')
      .doc('0001')
      .update({ adult: true, cardText: 'Explicit question' })
    expect(await handleRoomUpdate(ROOM, roomDoc('bob', 2), roomDoc('alice', 3))).toEqual(['turn'])
    const message = (await outbox()).at(-1)
    expect(message?.['body']).toBe('Ben answered an After Dark card')
    expect(String(message?.['body'])).not.toContain('Explicit')
    expect(message?.['tokens']).toEqual(['token-a1', 'token-a2'])
  })
})

describe('sweep', () => {
  it('reminds the holder past the room reminder hours, stamps the room, and skips quiet hours and paused rooms', async () => {
    const now = 50 * HOUR_MS
    await db
      .collection('rooms')
      .doc(ROOM)
      .set(roomDoc('bob', now - 12 * HOUR_MS))
    await db
      .collection('rooms')
      .doc(QUIET_ROOM)
      .set(
        roomDoc('bob', now - 12 * HOUR_MS, {
          players: {
            alice: player('Ada', ['qa']),
            bob: player('Ben', ['qb'], { start: '00:00', end: '23:59', tz: 'UTC' }),
          },
        }),
      )
    const pausedId = 'fn-paused-abcdefghijklmn'
    await db
      .collection('rooms')
      .doc(pausedId)
      .set(roomDoc('bob', now - 12 * HOUR_MS, { paused: { by: 'alice', at: 1, note: '' } }))
    const freshId = 'fn-fresh-abcdefghijklmno'
    await db
      .collection('rooms')
      .doc(freshId)
      .set(roomDoc('bob', now - 2 * HOUR_MS))

    const reminded = await sweep(now)
    expect(reminded).toEqual([ROOM])
    const message = (await outbox()).at(-1)
    expect(message).toMatchObject({
      title: 'Still your turn',
      body: 'Ada has been waiting 12 hours',
      tokens: ['token-b1'],
    })
    const room = (await db.collection('rooms').doc(ROOM).get()).data()
    expect(room?.['ball']).toMatchObject({ lastReminderAt: now, remindersSent: 1 })
    expect(await sweep(now + HOUR_MS)).toEqual([])
    // Ten hours later the first room is due again and the fresh one has been held for twelve hours.
    expect(await sweep(now + 10 * HOUR_MS)).toEqual([ROOM, freshId])
  })
})
