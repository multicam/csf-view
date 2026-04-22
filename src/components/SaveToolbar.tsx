import { useCallback, useEffect, useState } from 'react'
import { getSnapshot, useEditor } from 'tldraw'
import { saveView, saveScreenshot, viewFilename } from '../lib/persistence'
import { useView } from '../App'

export function SaveToolbar() {
  const editor = useEditor()
  const { state, filename, markSaved, bumpVersion } = useView()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const captureScreenshot = useCallback(async (name: string) => {
    try {
      const allShapeIds = [...editor.getCurrentPageShapeIds()]
      if (allShapeIds.length === 0) return
      const { blob } = await editor.toImage(allShapeIds, { format: 'png', background: true })
      await saveScreenshot(name, blob)
    } catch (e) {
      console.warn('Screenshot capture failed:', e)
    }
  }, [editor])

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      const { document } = getSnapshot(editor.store)
      const result = await saveView(filename, document)
      markSaved(result.savedAt)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
      // Fire-and-forget screenshot capture
      captureScreenshot(filename)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [editor, filename, markSaved, captureScreenshot])

  const versionUp = useCallback(async () => {
    bumpVersion()
    setStatus('saving')
    try {
      const { document } = getSnapshot(editor.store)
      const newFilename = viewFilename(state.name, (state.version ?? 0) + 1)
      const result = await saveView(newFilename, document)
      markSaved(result.savedAt)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
      captureScreenshot(newFilename)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [editor, state.name, state.version, bumpVersion, markSaved, captureScreenshot])

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
        <span style={{ fontSize: 12, color: '#4A8A5C' }}>Saved</span>
      )}
      {status === 'error' && (
        <span style={{ fontSize: 12, color: '#C44030' }}>Failed</span>
      )}
      <button
        onClick={versionUp}
        disabled={status === 'saving'}
        className="tlui-button"
        style={{ fontSize: 12 }}
        title="Save as next version"
      >
        v+
      </button>
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
