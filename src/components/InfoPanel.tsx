import { useEffect, useState } from 'react'

interface ViewInfo {
  viewsDir: string
  uptime: number
}

export function InfoPanel() {
  const [info, setInfo] = useState<ViewInfo | null>(null)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  // Fetch server health for project context
  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {})
  }, [])

  // Listen for save events to show last saved time
  useEffect(() => {
    const sse = new EventSource('/events')
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.savedAt) {
          setLastSaved(new Date(data.savedAt).toLocaleTimeString())
        }
      } catch {}
    }
    return () => sse.close()
  }, [])

  const project = info?.viewsDir
    ? info.viewsDir.replace(/\/thoughts\/shared\/views$/, '').split('/').pop()
    : '...'

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: '4px 12px',
        fontSize: 12,
        fontFamily: 'var(--font-body)',
        color: '#4A443D',
        pointerEvents: 'all',
      }}
    >
      <span style={{ fontWeight: 600 }}>{project}</span>
      <span style={{ color: '#9A9288' }}>current</span>
      {lastSaved && (
        <span style={{ color: '#9A9288', fontSize: 11 }}>saved {lastSaved}</span>
      )}
    </div>
  )
}
