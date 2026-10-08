// The online room repository against the Firestore and Auth emulators.
// Two anonymous clients create, join, and play the first turns; a third client
// is kept out. Run by pnpm test:rules.
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, getDoc, getFirestore, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defaultContentDir, readContentDir } from '../../scripts/content-node'
import { validateContent } from '../../src/content/schema'
import { roomPhase, turnView } from '../../src/game/turns'
import type { CardLookup, PoolCard, RoomSettings } from '../../src/game/types'
import {
  cardRef,
  createOnlineRoom,
  joinOnlineRoom,
  privateRef,
  runRoomAction,
  subscribeRoom,
  SyncError,
  touchPresence,
  type RoomSnapshot,
} from '../../src/sync/roomRepo'

const raw = readContentDir(defaultContentDir())
const content = validateContent(raw.shared, raw.packs)
const pool: readonly PoolCard[] = content.cards
const byId = new Map(pool.map((c) => [c.id, c]))
const lookup: CardLookup = (id) => byId.get(id)

const settings: RoomSettings = {
  packs: ['core'],
  startLevel: 3,
  progression: 'linear',
  currentEvery: 0,
  noCurrentsBefore: 3,
  excludeAnswered: true,
  customCardsEnabled: false,
  mode: 'turns',
  passedCardCooldownDays: 30,
  passesPerDeck: 3,
  closerSeesOpener: false,
  lighterWindowCards: 5,
  reminderHours: 10,
  reminderCap: null,
  afterDarkRetention: 'keep',
}

interface Client {
  app: FirebaseApp
  db: Firestore
  uid: string
}

async function client(name: string): Promise<Client> {
  const app = initializeApp(
    { projectId: 'demo-fathoms', apiKey: 'demo-key', appId: 'demo-app', authDomain: 'localhost' },
    name,
  )
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const credential = await signInAnonymously(auth)
  return { app, db, uid: credential.user.uid }
}

/** Keeps the latest snapshot of a subscription and lets a test wait for a condition on it. */
function watch(c: Client, roomId: string) {
  let latest: RoomSnapshot | null = null
  let error: Error | null = null
  const started = Date.now()
  const stop = subscribeRoom(c.db, roomId, c.uid, {
    onChange: (snapshot) => {
      latest = snapshot
      if (process.env['FATHOMS_TRACE']) {
        const cards = snapshot.kind === 'ready' ? snapshot.state.cards.length : '-'
        console.log(
          `[${c.uid.slice(0, 4)} +${Date.now() - started}ms] ${snapshot.kind} cards=${cards}`,
        )
      }
    },
    onError: (e) => {
      error = e
    },
  })
  async function until<T>(
    pick: (snapshot: RoomSnapshot) => T | null | undefined | false,
    label: string,
  ): Promise<T> {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      if (error) throw error
      if (latest) {
        const value = pick(latest)
        if (value) return value
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    const last = latest as RoomSnapshot | null
    const summary =
      last && last.kind === 'ready'
        ? `ready, version ${last.state.version}, ${last.state.cards.length} cards`
        : JSON.stringify(last)?.slice(0, 200)
    throw new Error(`timed out waiting for ${label}; last snapshot ${summary}`)
  }
  return { until, stop, latest: () => latest }
}

let alice: Client
let bob: Client
let carol: Client

beforeAll(async () => {
  ;[alice, bob, carol] = await Promise.all([client('alice'), client('bob'), client('carol')])
})

afterAll(async () => {
  await Promise.all([alice, bob, carol].map((c) => deleteApp(c.app)))
})

describe('online rooms', () => {
  it('creates, joins, keeps a third player out, and plays blind turns that both sides can read back', async () => {
    const roomId = await createOnlineRoom(alice.db, {
      uid: alice.uid,
      name: 'Ada',
      color: '#4fb3d9',
      settings,
      rules: content.shared.rules,
      pool,
      seed: 'emulator-seed',
      now: 1000,
    })
    expect(roomId).toHaveLength(20)

    const a = watch(alice, roomId)
    const pending = await a.until((s) => (s.kind === 'pending' ? s.doc : null), 'pending room')
    expect(pending.order).toEqual([alice.uid])
    expect(pending.deck.cards).toHaveLength(32)

    expect(
      await joinOnlineRoom(bob.db, roomId, {
        uid: bob.uid,
        name: 'Ben',
        color: '#e0a030',
        now: 2000,
      }),
    ).toBe('joined')
    expect(
      await joinOnlineRoom(bob.db, roomId, {
        uid: bob.uid,
        name: 'Ben',
        color: '#e0a030',
        now: 2001,
      }),
    ).toBe('already-member')
    const b = watch(bob, roomId)
    const ready = await a.until((s) => (s.kind === 'ready' ? s.state : null), 'ready room')
    expect(ready.order).toEqual([alice.uid, bob.uid])
    expect(ready.passes).toEqual({ [alice.uid]: 3, [bob.uid]: 3 })
    expect(roomPhase(ready)).toBe('rules')

    await expect(
      joinOnlineRoom(carol.db, roomId, { uid: carol.uid, name: 'Cy', color: '#7bb662', now: 3000 }),
    ).rejects.toMatchObject({ code: 'full' })
    await expect(getDoc(cardRef(carol.db, roomId, 1))).rejects.toThrow()

    await runRoomAction(alice.db, roomId, { type: 'agreeRules', by: alice.uid, at: 4000 }, lookup)
    await runRoomAction(bob.db, roomId, { type: 'agreeRules', by: bob.uid, at: 4001 }, lookup)
    await expect(
      runRoomAction(
        bob.db,
        roomId,
        { type: 'send', by: bob.uid, at: 4002, openAnswer: 'not my turn' },
        lookup,
      ),
    ).rejects.toThrow('not your turn')

    await runRoomAction(
      alice.db,
      roomId,
      { type: 'send', by: alice.uid, at: 5000, openAnswer: 'Ada opens 1' },
      lookup,
    )
    const bobSees = await b.until(
      (s) => (s.kind === 'ready' && s.state.cards.length === 1 ? s.state : null),
      'card 1 for Bob',
    )
    expect(bobSees.ball.holderUid).toBe(bob.uid)
    expect(bobSees.cards[0]?.status).toBe('open')
    expect(bobSees.cards[0]?.answers).toEqual({})
    await expect(getDoc(privateRef(bob.db, roomId, 1, alice.uid))).rejects.toThrow()
    const aliceSees = await a.until(
      (s) => (s.kind === 'ready' && s.state.cards[0]?.answers[alice.uid] ? s.state : null),
      'own private answer for Ada',
    )
    expect(aliceSees.cards[0]?.answers[alice.uid]?.text).toBe('Ada opens 1')
    const bobView = turnView(bobSees, lookup)
    expect(bobView.close?.openerAnswer).toBeNull()
    expect(bobView.open?.seq).toBe(2)

    await runRoomAction(
      bob.db,
      roomId,
      {
        type: 'send',
        by: bob.uid,
        at: 6000,
        closeAnswer: 'Ben closes 1',
        openAnswer: 'Ben opens 2',
      },
      lookup,
    )
    const bobReveal = await b.until(
      (s) =>
        s.kind === 'ready' &&
        s.state.cards[0]?.answers[alice.uid] &&
        s.state.cards[0]?.answers[bob.uid]
          ? s.state
          : null,
      'both answers on card 1 for Ben',
    )
    expect(bobReveal.cards[0]?.status).toBe('closed')
    expect(bobReveal.cards[0]?.answers[alice.uid]?.text).toBe('Ada opens 1')
    expect(bobReveal.cards[1]?.status).toBe('open')
    expect(bobReveal.cards[1]?.answers[bob.uid]?.text).toBe('Ben opens 2')

    const aliceCatchUp = await a.until(
      (s) =>
        s.kind === 'ready' && s.state.cards.length === 2 && s.state.cards[0]?.answers[bob.uid]
          ? s.state
          : null,
      'card 1 closed for Ada',
    )
    expect(turnView(aliceCatchUp, lookup).catchUp?.card.seq).toBe(1)
    expect(aliceCatchUp.cards[1]?.answers).toEqual({})
    const deadline = Date.now() + 15_000
    let materialized = false
    while (Date.now() < deadline && !materialized) {
      const snap = await getDoc(cardRef(alice.db, roomId, 1))
      const answers = (snap.data()?.answers ?? {}) as Record<string, unknown>
      materialized = alice.uid in answers
      if (!materialized) await new Promise((r) => setTimeout(r, 50))
    }
    expect(materialized).toBe(true)

    await runRoomAction(
      bob.db,
      roomId,
      { type: 'askFollowUp', by: bob.uid, at: 6500, seq: 1, text: 'Why?' },
      lookup,
    )
    const withQuestion = await a.until(
      (s) => (s.kind === 'ready' && s.state.cards[0]?.followUps[bob.uid] ? s.state : null),
      'follow-up for Ada',
    )
    expect(turnView(withQuestion, lookup).pendingFollowUps.map((p) => p.followUp.text)).toEqual([
      'Why?',
    ])

    // Later turns load only the open card inside the transaction; the rest of the list is holes.
    await runRoomAction(
      alice.db,
      roomId,
      {
        type: 'send',
        by: alice.uid,
        at: 6600,
        closeAnswer: 'Ada closes 2',
        openAnswer: 'Ada opens 3',
        replies: [{ seq: 1, text: 'Because.' }],
      },
      lookup,
    )
    const afterThree = await b.until(
      (s) => (s.kind === 'ready' && s.state.cards.length === 3 ? s.state : null),
      'card 3 for Ben',
    )
    expect(afterThree.cards[0]?.followUps[bob.uid]?.reply?.text).toBe('Because.')
    expect(afterThree.ball.holderUid).toBe(bob.uid)
    await runRoomAction(
      bob.db,
      roomId,
      { type: 'pass', by: bob.uid, at: 6700, target: 'close' },
      lookup,
    )
    // The deck is The Deep only, so Go lighter has nothing to pull forward: the transaction
    // surfaces the reducer's refusal and writes nothing.
    await expect(
      runRoomAction(bob.db, roomId, { type: 'lighter', by: bob.uid, at: 6750 }, lookup),
    ).rejects.toMatchObject({ code: 'nothing-lighter' })
    await runRoomAction(
      bob.db,
      roomId,
      { type: 'send', by: bob.uid, at: 6800, openAnswer: 'Ben opens 4' },
      lookup,
    )
    const afterFour = await a.until(
      (s) => (s.kind === 'ready' && s.state.cards.length === 4 ? s.state : null),
      'card 4 for Ada',
    )
    expect(afterFour.cards[2]?.status).toBe('passed')
    expect(afterFour.cards[2]?.passedBy).toBe(bob.uid)
    expect(afterFour.passes[bob.uid]).toBe(2)
    expect(afterFour.cards[3]?.status).toBe('open')
    expect(turnView(afterFour, lookup).catchUp?.card.seq).toBe(3)

    await touchPresence(alice.db, roomId, alice.uid, 7000)
    const seen = await b.until(
      (s) => (s.kind === 'ready' && s.state.players[alice.uid]?.lastSeen === 7000 ? s.state : null),
      'presence',
    )
    expect(seen.players[alice.uid]?.lastSeen).toBe(7000)

    a.stop()
    b.stop()
    const again = watch(alice, roomId)
    const restored = await again.until(
      (s) => (s.kind === 'ready' && s.state.cards.length === 4 ? s.state : null),
      'fresh subscription',
    )
    expect(restored.ball.holderUid).toBe(alice.uid)
    expect(restored.cards[2]?.answers[alice.uid]?.text).toBe('Ada opens 3')
    expect(restored.cards[0]?.answers[alice.uid]?.text).toBe('Ada opens 1')
    again.stop()
  })

  it('reports a missing room and refuses actions on it', async () => {
    const w = watch(alice, 'missing-abcdefghijklmnop')
    await w.until((s) => s.kind === 'missing', 'missing room')
    w.stop()
    await expect(
      runRoomAction(
        alice.db,
        'missing-abcdefghijklmnop',
        { type: 'pause', by: alice.uid, at: 1 },
        lookup,
      ),
    ).rejects.toBeInstanceOf(SyncError)
  })
})
