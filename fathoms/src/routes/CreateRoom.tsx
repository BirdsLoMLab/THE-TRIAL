import { useNavigate } from 'react-router'
import { Screen } from '../components/ui'
import { useOnline } from '../store/online'
import { PlayerForm } from './PlayerForm'

export function CreateRoom() {
  const navigate = useNavigate()
  const createRoom = useOnline((s) => s.createRoom)
  return (
    <Screen title="Create a room" back="/" testId="screen-create-room">
      <PlayerForm
        testId="create"
        submitLabel="Create the room"
        busyLabel="Creating"
        onSubmit={async (input) => {
          const roomId = await createRoom(input)
          navigate(`/room/${roomId}`, { replace: true })
        }}
      >
        <p className="text-ink-muted">
          You get a link to send your partner. The room lives for as long as you both want it;
          nobody else can find it.
        </p>
      </PlayerForm>
    </Screen>
  )
}
