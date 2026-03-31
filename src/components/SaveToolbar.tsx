import { useCallback, useEffect, useState } from 'react'
import { getSnapshot, useEditor } from 'tldraw'
import { saveView } from '../lib/persistence'

const VIEW_NAME = 'current'

export function SaveToolbar() {
  const editor = useEditor()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      const { document } = getSnapshot(editor.store)
      await saveView(VIEW_NAME, document)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [editor])

  // Ctrl+S / Cmd+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [save])

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', pointerEvents: 'all' }}>
      {status === 'saved' && (
        <span style={{ fontSize: 12, color: '#16a34a' }}>Saved</span>
      )}
      {status === 'error' && (
        <span style={{ fontSize: 12, color: '#dc2626' }}>Failed</span>
      )}
      <button
        onClick={save}
        disabled={status === 'saving'}
        className="tlui-button"
        style={{ fontSize: 12 }}
      >
        {status === 'saving' ? 'Saving…' : '💾 Save'}
      </button>
    </div>
  )
}
