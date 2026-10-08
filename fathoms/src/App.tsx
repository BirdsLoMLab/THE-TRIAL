import { createHashRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { getContent } from './content'
import { ContentError } from './content/schema'
import { routes } from './routes/routes'

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
// Hash routing keeps every screen reachable from a single index.html inside the
// Capacitor WebView without a server side fallback.
const router = contentState.ok ? createHashRouter(routes) : null

export function App() {
  if (!contentState.ok || !router) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold">Content failed to load</h1>
        <pre className="text-ink-muted mt-4 overflow-x-auto text-sm whitespace-pre-wrap">
          {contentState.ok ? '' : contentState.message}
        </pre>
      </main>
    )
  }
  return <RouterProvider router={router} />
}
