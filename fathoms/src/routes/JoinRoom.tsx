import { Navigate, useNavigate, useParams } from 'react-router'
import { Screen } from '../components/ui'
import { useOnline } from '../store/online'
import { PlayerForm } from './PlayerForm'

export function JoinRoom() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const joinRoom = useOnline((s) => s.joinRoom)
  if (!roomId) return <Navigate to="/" replace />
  return (
    <Screen title="Join a room" back="/" testId="screen-join-room">
      <PlayerForm
        testId="join"
        submitLabel="Join"
        busyLabel="Joining"
        onSubmit={async (input) => {
          await joinRoom(roomId, input)
          navigate(`/room/${roomId}/rules`, { replace: true })
        }}
      >
        <p className="text-ink-muted">
          Room{' '}
          <span className="text-ink font-mono" data-testid="join-code">
            {roomId}
          </span>
          . Pick a name and a color, then the two rules.
        </p>
      </PlayerForm>
    </Screen>
  )
}
