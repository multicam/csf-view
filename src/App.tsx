import { useEffect, useState } from 'react'
import { Tldraw, loadSnapshot, type TLComponents } from 'tldraw'
import 'tldraw/tldraw.css'
import { SaveToolbar } from './components/SaveToolbar'
import { InfoPanel } from './components/InfoPanel'
import { loadView } from './lib/persistence'

const VIEW_NAME = 'current'

const components: TLComponents = {
  TopPanel: InfoPanel,
  SharePanel: SaveToolbar,
}

export default function App() {
  const [initialSnapshot, setInitialSnapshot] = useState<unknown | null>(undefined)

  useEffect(() => {
    loadView(VIEW_NAME).then((data) => {
      if (data?.document) {
        setInitialSnapshot({ document: data.document })
      } else {
        setInitialSnapshot(null)
      }
    }).catch(() => {
      setInitialSnapshot(null)
    })
  }, [])

  // Wait for load attempt before rendering
  if (initialSnapshot === undefined) return null

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        snapshot={initialSnapshot ?? undefined}
        components={components}
      />
    </div>
  )
}
