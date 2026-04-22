import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Tldraw, type TLComponents, type TLEditorSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import { SaveToolbar } from './components/SaveToolbar'
import { InfoPanel } from './components/InfoPanel'
import { loadView, parseViewFilename } from './lib/persistence'
import { useViewState, type ViewState } from './lib/useViewState'

function getFileFromURL(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('file') || 'current'
}


// Context to share view state across components
interface ViewContextValue {
  state: ViewState
  filename: string
  markSaved: (savedAt: string) => void
  bumpVersion: () => void
  renameTo: (name: string) => Promise<void>
}

export const ViewContext = createContext<ViewContextValue>(null!)

export function useView() {
  return useContext(ViewContext)
}

const components: TLComponents = {
  TopPanel: InfoPanel,
  SharePanel: SaveToolbar,
}

export default function App() {
  const [initialSnapshot, setInitialSnapshot] = useState<TLEditorSnapshot | null | undefined>(undefined)
  const [initialParsed, setInitialParsed] = useState<{ name: string; version: number | null }>({
    name: 'current',
    version: null,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const fileParam = getFileFromURL()
    const parsed = parseViewFilename(fileParam)
    loadView(fileParam)
      .then((data) => {
        if (data?.document) {
          setInitialParsed(parseViewFilename(data.name ?? fileParam))
          setInitialSnapshot({ document: data.document } as TLEditorSnapshot)
        } else {
          setInitialParsed(parsed)
          setInitialSnapshot(null)
        }
      })
      .catch(() => {
        setInitialParsed(parsed)
        setInitialSnapshot(null)
      })
      .finally(() => setReady(true))
  }, [])

  if (!ready) return null

  return <AppInner initialSnapshot={initialSnapshot!} initialParsed={initialParsed} />
}

function AppInner({
  initialSnapshot,
  initialParsed,
}: {
  initialSnapshot: TLEditorSnapshot | null
  initialParsed: { name: string; version: number | null }
}) {
  const viewState = useViewState(initialParsed)
  const [snapshot, setSnapshot] = useState<TLEditorSnapshot | null>(initialSnapshot)
  const [reloadKey, setReloadKey] = useState(0)
  const filenameRef = useRef(viewState.filename)
  const lastSavedRef = useRef(viewState.state.lastSaved)

  // Keep refs in sync so the SSE handler always sees the current values
  // without needing to re-subscribe on every filename change.
  useEffect(() => {
    filenameRef.current = viewState.filename
  }, [viewState.filename])

  useEffect(() => {
    lastSavedRef.current = viewState.state.lastSaved
  }, [viewState.state.lastSaved])

  // Subscribe to server-sent events and refetch when the event's name
  // matches the file currently being viewed.
  useEffect(() => {
    const es = new EventSource('/events')

    es.onmessage = async (e) => {
      let payload: { name?: string; savedAt?: string; renamed?: boolean; from?: string }
      try {
        payload = JSON.parse(e.data)
      } catch {
        return
      }
      if (!payload.name || payload.name !== filenameRef.current) return
      // Skip the echo of our own save.
      if (payload.savedAt && payload.savedAt === lastSavedRef.current) return

      try {
        const data = await loadView(filenameRef.current)
        if (data?.document) {
          setSnapshot({ document: data.document } as TLEditorSnapshot)
          setReloadKey((k) => k + 1)
        }
      } catch {
        // Silently ignore refetch failures; user can still save/edit locally.
      }
    }

    return () => es.close()
  }, [])

  return (
    <ViewContext.Provider value={viewState}>
      <div style={{ position: 'fixed', inset: 0 }}>
        <Tldraw
          key={reloadKey}
          snapshot={snapshot || undefined}
          components={components}
        />
      </div>
    </ViewContext.Provider>
  )
}
