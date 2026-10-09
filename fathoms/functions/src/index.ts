// Fathoms Cloud Functions (PLAN section 5): onBallPass sends the turn alert and
// the nudge, reminderSweep runs hourly. Both go through a Sender so the
// emulator writes an outbox instead of calling FCM.
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import {
  deadTokens,
  nudgePayload,
  reminderPayload,
  revealPayload,
  turnPayload,
  type Payload,
  type Sender,
} from './notify.js'
import { HOUR_MS, reminderDecision, type ReminderRoom } from './reminders.js'

initializeApp()
const db = getFirestore()
// The emulator has no FCM credentials, and the direct handler tests run the same way.
const inEmulator = () => process.env['FUNCTIONS_EMULATOR'] === 'true'

export const NUDGE_INTERVAL_MS = 10 * HOUR_MS
/** The sweep looks at rooms whose ball moved at least this long ago; the per room setting decides after that. */
export const SWEEP_MIN_HOURS = 1

interface PlayerDoc {
  name: string
  fcmTokens?: string[]
  quietHours?: { start: string; end: string; tz: string } | null
}

interface RoomDoc extends ReminderRoom {
  players: Record<string, PlayerDoc>
  openSeq: number
  turn?: number
  nudge?: { by: string; at: number } | null
}

const fcmSender: Sender = {
  async send(tokens, payload) {
    if (tokens.length === 0) return { sent: 0, dead: [] }
    const response = await getMessaging().sendEachForMulticast({
      tokens: [...tokens],
      notification: { title: payload.title, body: payload.body },
      data: { ...payload.data },
      android: {
        priority: 'high',
        notification: { channelId: 'turns', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
      },
    })
    return { sent: response.successCount, dead: deadTokens(tokens, response.responses) }
  },
}

/** In the emulator FCM has no credentials, so messages land in rooms/{id}/outbox for tests to read. */
function outboxSender(roomId: string): Sender {
  return {
    async send(tokens, payload) {
      await db
        .collection('rooms')
        .doc(roomId)
        .collection('outbox')
        .add({ tokens: [...tokens], ...payload, at: Date.now() })
      return { sent: tokens.length, dead: [] }
    },
  }
}

function senderFor(roomId: string): Sender {
  return inEmulator() ? outboxSender(roomId) : fcmSender
}

async function sendToPlayer(
  roomId: string,
  room: RoomDoc,
  uid: string,
  payload: Payload,
): Promise<void> {
  const tokens = room.players[uid]?.fcmTokens ?? []
  const result = await senderFor(roomId).send(tokens, payload)
  logger.info('push', {
    roomId,
    uid,
    kind: payload.data['kind'],
    sent: result.sent,
    dead: result.dead.length,
  })
  if (result.dead.length) {
    await db
      .collection('rooms')
      .doc(roomId)
      .update({ [`players.${uid}.fcmTokens`]: FieldValue.arrayRemove(...result.dead) })
  }
}

function partnerName(room: RoomDoc, uid: string): string {
  const partner = Object.keys(room.players).find((id) => id !== uid)
  return partner ? (room.players[partner]?.name ?? 'Your partner') : 'Your partner'
}

async function cardAt(
  roomId: string,
  seq: number,
): Promise<{ text: string; adult: boolean } | null> {
  if (!seq) return null
  const snap = await db
    .collection('rooms')
    .doc(roomId)
    .collection('cards')
    .doc(String(seq).padStart(4, '0'))
    .get()
  const data = snap.data()
  if (!data) return null
  return { text: String(data['cardText'] ?? ''), adult: Boolean(data['adult']) }
}

/** A send that closed a card and dealt none: the ball stayed, the deck is finished. */
function closedLastCard(before: RoomDoc, after: RoomDoc): boolean {
  return (
    after.ball.holderUid === before.ball.holderUid &&
    (after.turn ?? 0) > (before.turn ?? 0) &&
    before.openSeq > 0 &&
    after.openSeq === 0
  )
}

/**
 * A room document changed. A ball pass sends "Your turn" to the new holder.
 * Closing the last card of a deck keeps the ball, so that send tells the
 * opener their card was answered instead. A fresh nudge from the waiting
 * player pokes the holder, at most once per NUDGE_INTERVAL_MS. Exported so
 * tests can call it against the Firestore emulator without the Functions
 * emulator.
 */
export async function handleRoomUpdate(
  roomId: string,
  before: RoomDoc,
  after: RoomDoc,
): Promise<string[]> {
  const sent: string[] = []
  if (after.ball.holderUid !== before.ball.holderUid) {
    const holder = after.ball.holderUid
    const card = await cardAt(roomId, after.openSeq)
    await sendToPlayer(roomId, after, holder, turnPayload(roomId, partnerName(after, holder), card))
    sent.push('turn')
  } else if (closedLastCard(before, after)) {
    const opener = Object.keys(after.players).find((uid) => uid !== after.ball.holderUid)
    if (opener) {
      const card = await cardAt(roomId, before.openSeq)
      await sendToPlayer(
        roomId,
        after,
        opener,
        revealPayload(roomId, partnerName(after, opener), card),
      )
      sent.push('reveal')
    }
  }

  const nudge = after.nudge
  if (
    nudge &&
    nudge.at !== before.nudge?.at &&
    nudge.by !== after.ball.holderUid &&
    !after.paused
  ) {
    const previous = before.nudge?.at
    if (previous === undefined || nudge.at - previous >= NUDGE_INTERVAL_MS) {
      await sendToPlayer(
        roomId,
        after,
        after.ball.holderUid,
        nudgePayload(roomId, partnerName(after, after.ball.holderUid)),
      )
      sent.push('nudge')
    }
  }
  return sent
}

/** Firestore trigger on rooms/{roomId}. */
export const onBallPass = onDocumentUpdated('rooms/{roomId}', async (event) => {
  const before = event.data?.before.data() as RoomDoc | undefined
  const after = event.data?.after.data() as RoomDoc | undefined
  if (!before || !after) return
  await handleRoomUpdate(event.params.roomId, before, after)
})

/** Hourly: "Still your turn" to holders who sat on the ball past the room's reminder hours. */
export const reminderSweep = onSchedule('every 60 minutes', async () => {
  await sweep(Date.now())
})

/** The sweep body, callable from tests. Returns the room ids that were reminded. */
export async function sweep(now: number): Promise<string[]> {
  const cutoff = now - SWEEP_MIN_HOURS * HOUR_MS
  const snap = await db.collection('rooms').where('ball.since', '<=', cutoff).get()
  const reminded: string[] = []
  for (const doc of snap.docs) {
    const room = doc.data() as RoomDoc
    const decision = reminderDecision(room, now)
    if (!decision.send) continue
    const holder = room.ball.holderUid
    await sendToPlayer(
      doc.id,
      room,
      holder,
      reminderPayload(doc.id, partnerName(room, holder), decision.hoursHeld),
    )
    await doc.ref.update({
      'ball.lastReminderAt': now,
      'ball.remindersSent': FieldValue.increment(1),
    })
    reminded.push(doc.id)
  }
  logger.info('reminderSweep', { checked: snap.size, reminded: reminded.length })
  return reminded
}
