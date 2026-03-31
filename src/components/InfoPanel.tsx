import { useState, useCallback, useRef, useEffect } from 'react'
import { useView } from '../App'

export function InfoPanel() {
  const { state, filename, renameTo } = useView()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(state.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [project, setProject] = useState('...')

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((info) => {
        const p = info.viewsDir?.replace(/\/thoughts\/shared\/views$/, '').split('/').pop()
        if (p) setProject(p)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setDraft(state.name)
  }, [state.name])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = useCallback(async () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (!trimmed || trimmed === state.name) {
      setDraft(state.name)
      return
    }
    await renameTo(trimmed).catch(() => setDraft(state.name))
  }, [draft, state.name, renameTo])

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
      <span style={{ color: '#9A9288' }}>/</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setDraft(state.name); setEditing(false) }
          }}
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            border: '1px solid #DED4C6',
            borderRadius: 4,
            padding: '2px 6px',
            outline: 'none',
            color: '#4A443D',
            background: '#FAF9F7',
            width: Math.max(60, draft.length * 7),
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{ cursor: 'text', borderBottom: '1px dashed #DED4C6' }}
          title="Click to rename"
        >
          {filename}
        </span>
      )}
      {state.lastSaved && (
        <span style={{ color: '#9A9288', fontSize: 11 }}>
          saved {new Date(state.lastSaved).toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}
