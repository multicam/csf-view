import { useState, useCallback, useEffect } from 'react'
import { viewFilename, renameView } from './persistence'

export interface ViewState {
  name: string
  version: number | null
  lastSaved: string | null
}

export function useViewState(initial: { name: string; version: number | null }) {
  const [state, setState] = useState<ViewState>({
    name: initial.name,
    version: initial.version,
    lastSaved: null,
  })

  const filename = viewFilename(state.name, state.version)

  // Sync URL with current filename
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('file', filename)
    window.history.replaceState(null, '', url.toString())
  }, [filename])

  const markSaved = useCallback((savedAt: string) => {
    setState((s) => ({ ...s, lastSaved: savedAt }))
  }, [])

  const bumpVersion = useCallback(() => {
    setState((s) => ({
      ...s,
      version: (s.version ?? 0) + 1,
      lastSaved: null,
    }))
  }, [])

  const renameTo = useCallback(async (newName: string) => {
    const oldFilename = viewFilename(state.name, state.version)
    const newFilename = newName // reset version on rename
    await renameView(oldFilename, newFilename)
    setState({ name: newName, version: null, lastSaved: null })
  }, [state.name, state.version])

  return { state, filename, markSaved, bumpVersion, renameTo }
}
