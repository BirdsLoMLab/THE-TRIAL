import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { getContent } from './content'
import { ContentError } from './content/schema'
import { Home } from './routes/Home'

// Hash routing keeps every screen reachable from a single index.html inside the
// Capacitor WebView without a server side fallback.
const router = createHashRouter([{ path: '/', Component: Home }])

type ContentState = { ok: true } | { ok: false; message: string }

function loadContentState(): ContentState {
  try {
    getContent()
    return { ok: true }
  } catch (error) {
    const message = error instanceof ContentError ? error.message : String(error)
    return { ok: false, message }
  }
}

const contentState = loadContentState()

export function App() {
  if (!contentState.ok) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold">Content failed to load</h1>
        <pre className="text-ink-muted mt-4 overflow-x-auto text-sm whitespace-pre-wrap">
          {contentState.message}
        </pre>
      </main>
    )
  }
  return <RouterProvider router={router} />
}
