// Firestore security rules (PLAN section 5), run against the emulator by
// pnpm test:rules. Every negative case the plan names is here: non member
// writes, a third player joining, listing rooms, writing another player's
// answer, and reading a private answer before the card closes.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const PROJECT = 'demo-fathoms'
const ALICE = 'alice-uid'
const BOB = 'bob-uid'
const CAROL = 'carol-uid'
const ROOM = 'room-abcdefghijklmnop'
const SOLO = 'solo-abcdefghijklmnop'

let env: RulesTestEnvironment

function db(uid: string | null): Firestore {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()
  return ctx.firestore() as unknown as Firestore
}

function player(name: string) {
  return {
    name,
    color: '#4fb3d9',
    joinedAt: 1,
    lastSeen: null,
    fcmTokens: [],
    quietHours: null,
    excludeTags: [],
    afterDarkEnabled: false,
    afterDarkConfirmedAt: null,
    lastTurnAt: null,
    rulesAgreedAt: null,
  }
}

function roomDoc(uids: string[], extra: Record<string, unknown> = {}) {
  const players: Record<string, unknown> = {}
  const passes: Record<string, number> = {}
  for (const uid of uids) {
    players[uid] = player(uid)
    passes[uid] = 3
  }
  return {
    createdAt: 1,
    version: 1,
    rules: ['one', 'two'],
    players,
    order: uids,
    settings: { closerSeesOpener: false, passesPerDeck: 3, packs: ['core'] },
    deck: { seed: 's', cards: ['c1-01', 'c1-02'], dealt: 0, builtAt: 1 },
    ball: { holderUid: uids[0], since: 1, lastReminderAt: null, remindersSent: 0 },
    openSeq: 0,
    turn: 0,
    passes,
    lighter: null,
    paused: null,
    nudge: null,
    passedCards: {},
    ...extra,
  }
}

function cardDoc(opener: string, closer: string, extra: Record<string, unknown> = {}) {
  return {
    seq: 1,
    cardId: 'c1-01',
    cardText: 'Question',
    pack: 'core',
    adult: false,
    level: 1,
    type: 'question',
    dealtAt: 2,
    openerUid: opener,
    closerUid: closer,
    answers: {},
    followUps: {},
    reactions: {},
    favorite: false,
    readBy: {},
    status: 'open',
    closedAt: null,
    passedBy: null,
    ...extra,
  }
}

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data)
  })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await seed(`rooms/${ROOM}`, roomDoc([ALICE, BOB]))
  await seed(`rooms/${SOLO}`, roomDoc([ALICE]))
})

describe('rooms', () => {
  it('can be read by members, and by any signed in player while a seat is free', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), `rooms/${ROOM}`)))
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}`)))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}`)))
    await assertFails(getDoc(doc(db(null), `rooms/${ROOM}`)))
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${SOLO}`)))
    await assertFails(getDoc(doc(db(null), `rooms/${SOLO}`)))
    await assertSucceeds(getDoc(doc(db(CAROL), 'rooms/missing-abcdefghijklmnop')))
    await assertFails(getDoc(doc(db(null), 'rooms/missing-abcdefghijklmnop')))
  })

  it('can never be listed, not even by a member', async () => {
    await assertFails(getDocs(collection(db(ALICE), 'rooms')))
    await assertFails(getDocs(collection(db(null), 'rooms')))
  })

  it('are created by a signed in player who is the only member, with a long id', async () => {
    await assertSucceeds(setDoc(doc(db(CAROL), 'rooms/new-abcdefghijklmnop'), roomDoc([CAROL])))
    await assertFails(setDoc(doc(db(CAROL), 'rooms/short'), roomDoc([CAROL])))
    await assertFails(setDoc(doc(db(CAROL), 'rooms/two-abcdefghijklmnop'), roomDoc([CAROL, BOB])))
    await assertFails(setDoc(doc(db(CAROL), 'rooms/other-abcdefghijklmnop'), roomDoc([BOB])))
    await assertFails(setDoc(doc(db(null), 'rooms/anon-abcdefghijklmnop'), roomDoc([CAROL])))
    await assertFails(
      setDoc(doc(db(CAROL), 'rooms/ver-abcdefghijklmnopq'), roomDoc([CAROL], { version: 4 })),
    )
  })

  it('let a second player join by adding only themselves', async () => {
    const join = {
      [`players.${BOB}`]: player('Bob'),
      order: [ALICE, BOB],
      [`passes.${BOB}`]: 3,
      version: 2,
    }
    await assertSucceeds(updateDoc(doc(db(BOB), `rooms/${SOLO}`), join))
  })

  it('refuse a third player, a join that changes anything else, or a join on behalf of someone', async () => {
    await assertFails(
      updateDoc(doc(db(CAROL), `rooms/${ROOM}`), {
        [`players.${CAROL}`]: player('Carol'),
        order: [ALICE, BOB, CAROL],
        [`passes.${CAROL}`]: 3,
        version: 2,
      }),
    )
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${SOLO}`), {
        [`players.${BOB}`]: player('Bob'),
        order: [ALICE, BOB],
        [`passes.${BOB}`]: 3,
        version: 2,
        'settings.closerSeesOpener': true,
      }),
    )
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${SOLO}`), {
        [`players.${CAROL}`]: player('Carol'),
        order: [ALICE, CAROL],
        [`passes.${CAROL}`]: 3,
        version: 2,
      }),
    )
  })

  it('accept member updates that add nobody, from members only', async () => {
    await assertSucceeds(updateDoc(doc(db(ALICE), `rooms/${ROOM}`), { openSeq: 1, version: 2 }))
    await assertSucceeds(
      updateDoc(doc(db(BOB), `rooms/${ROOM}`), {
        paused: { by: BOB, at: 5, note: '' },
        version: 3,
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}`), { [`players.${ALICE}.lastSeen`]: 9 }),
    )
    await assertFails(updateDoc(doc(db(CAROL), `rooms/${ROOM}`), { openSeq: 2, version: 4 }))
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}`), {
        [`players.${CAROL}`]: player('Carol'),
        version: 4,
      }),
    )
  })

  it('can be deleted by a member only', async () => {
    await assertFails(deleteDoc(doc(db(CAROL), `rooms/${ROOM}`)))
    await assertSucceeds(deleteDoc(doc(db(BOB), `rooms/${ROOM}`)))
  })
})

describe('cards', () => {
  beforeEach(async () => {
    await seed(`rooms/${ROOM}/cards/0001`, cardDoc(ALICE, BOB))
  })

  it('are readable by members only', async () => {
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`)))
    await assertSucceeds(getDocs(collection(db(ALICE), `rooms/${ROOM}/cards`)))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001`)))
    await assertFails(getDocs(collection(db(CAROL), `rooms/${ROOM}/cards`)))
  })

  it('are dealt by their opener with no answers, open or passed', async () => {
    await assertSucceeds(
      setDoc(doc(db(BOB), `rooms/${ROOM}/cards/0002`), cardDoc(BOB, ALICE, { seq: 2 })),
    )
    await assertSucceeds(
      setDoc(
        doc(db(BOB), `rooms/${ROOM}/cards/0003`),
        cardDoc(BOB, ALICE, { seq: 3, status: 'passed', passedBy: BOB }),
      ),
    )
    await assertFails(
      setDoc(doc(db(BOB), `rooms/${ROOM}/cards/0004`), cardDoc(ALICE, BOB, { seq: 4 })),
    )
    await assertFails(
      setDoc(
        doc(db(BOB), `rooms/${ROOM}/cards/0005`),
        cardDoc(BOB, ALICE, { seq: 5, answers: { [BOB]: { text: 'x', at: 1 } } }),
      ),
    )
    await assertFails(
      setDoc(
        doc(db(BOB), `rooms/${ROOM}/cards/0006`),
        cardDoc(BOB, ALICE, { seq: 6, status: 'closed' }),
      ),
    )
    await assertFails(
      setDoc(doc(db(BOB), `rooms/${ROOM}/cards/0007`), cardDoc(BOB, BOB, { seq: 7 })),
    )
    await assertFails(
      setDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0008`), cardDoc(CAROL, ALICE, { seq: 8 })),
    )
    await assertFails(deleteDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`)))
  })

  it('take an answer only under the writer’s own key', async () => {
    await assertSucceeds(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        [`answers.${BOB}`]: { text: 'mine', at: 3 },
      }),
    )
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        [`answers.${ALICE}`]: { text: 'forged', at: 3 },
      }),
    )
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), {
        [`answers.${BOB}`]: { text: 'forged', at: 3 },
      }),
    )
    await assertFails(
      updateDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001`), {
        [`answers.${CAROL}`]: { text: 'x', at: 3 },
      }),
    )
  })

  it('close only by the closer, pass from open, and never reopen', async () => {
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), { status: 'closed', closedAt: 3 }),
    )
    await assertSucceeds(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        status: 'closed',
        closedAt: 3,
        [`answers.${BOB}`]: { text: 'closing', at: 3 },
      }),
    )
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), { status: 'open', closedAt: null }),
    )
    await assertFails(updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), { status: 'passed' }))
    await seed(`rooms/${ROOM}/cards/0002`, cardDoc(ALICE, BOB, { seq: 2 }))
    await assertSucceeds(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0002`), {
        status: 'passed',
        closedAt: 4,
        passedBy: BOB,
      }),
    )
  })

  it('keep the dealt fields fixed', async () => {
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), { cardText: 'rewritten' }),
    )
    await assertFails(updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), { closerUid: ALICE }))
    await assertFails(updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), { level: 3 }))
    await assertSucceeds(updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), { favorite: true }))
  })

  it('take one follow-up per player and replies only inside the partner’s entry', async () => {
    await seed(`rooms/${ROOM}/cards/0001`, cardDoc(ALICE, BOB, { status: 'closed', closedAt: 3 }))
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}`]: { text: 'Why?', at: 4, reply: { text: 'self reply', at: 4 } },
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}`]: { text: 'Why?', at: 4, reply: null },
      }),
    )
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}.text`]: 'Rewritten question',
      }),
    )
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}`]: { text: 'Why?', at: 4, reply: { text: 'Because', at: 5 } },
        [`followUps.${ALICE}`]: { text: 'And you?', at: 5, reply: { text: 'no', at: 5 } },
      }),
    )
    await assertSucceeds(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}.reply`]: { text: 'Because', at: 5 },
        [`followUps.${ALICE}`]: { text: 'And you?', at: 5, reply: null },
      }),
    )
    await assertFails(
      updateDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${BOB}.reply`]: { text: 'Changed my mind', at: 6 },
        [`followUps.${BOB}.text`]: 'Also changed',
      }),
    )
    await assertFails(
      updateDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001`), {
        [`followUps.${CAROL}`]: { text: 'Hi', at: 6, reply: null },
      }),
    )
  })
})

describe('private answers', () => {
  beforeEach(async () => {
    await seed(`rooms/${ROOM}/cards/0001`, cardDoc(ALICE, BOB))
    await seed(`rooms/${ROOM}/cards/0001/private/${ALICE}`, { text: 'blind', at: 2 })
  })

  it('are written by their author only', async () => {
    await assertSucceeds(
      setDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${BOB}`), { text: 'mine', at: 3 }),
    )
    await assertFails(
      setDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${ALICE}`), { text: 'forged', at: 3 }),
    )
    await assertFails(
      setDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001/private/${CAROL}`), { text: 'x', at: 3 }),
    )
  })

  it('stay hidden from the partner while the card is open', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await assertFails(getDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await assertFails(getDoc(doc(db(null), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
  })

  it('open to the partner once the card is closed or passed, never to strangers', async () => {
    await seed(`rooms/${ROOM}/cards/0001`, cardDoc(ALICE, BOB, { status: 'closed', closedAt: 3 }))
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await seed(
      `rooms/${ROOM}/cards/0001`,
      cardDoc(ALICE, BOB, { status: 'passed', closedAt: 3, passedBy: BOB }),
    )
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
  })

  it('open to the partner while open only when the room lets the closer see the opener', async () => {
    await seed(
      `rooms/${ROOM}`,
      roomDoc([ALICE, BOB], {
        settings: { closerSeesOpener: true, passesPerDeck: 3, packs: ['core'] },
      }),
    )
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}/cards/0001/private/${ALICE}`)))
  })
})

describe('custom cards', () => {
  it('belong to members', async () => {
    const card = {
      text: 'Custom',
      level: 1,
      type: 'question',
      pack: 'custom',
      adult: false,
      createdBy: ALICE,
      createdAt: 1,
    }
    await assertSucceeds(setDoc(doc(db(ALICE), `rooms/${ROOM}/customCards/x1`), card))
    await assertSucceeds(getDoc(doc(db(BOB), `rooms/${ROOM}/customCards/x1`)))
    await assertFails(setDoc(doc(db(CAROL), `rooms/${ROOM}/customCards/x2`), card))
    await assertFails(getDoc(doc(db(CAROL), `rooms/${ROOM}/customCards/x1`)))
  })
})
