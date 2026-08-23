import { createContext, useContext } from 'react'
import type { ViewState } from './useViewState'

export interface ViewContextValue {
  state: ViewState
  filename: string
  markSaved: (savedAt: string) => void
  bumpVersion: () => void
  renameTo: (name: string) => Promise<void>
}

export const ViewContext = createContext<ViewContextValue | null>(null)

export function useView(): ViewContextValue {
  const view = useContext(ViewContext)
  if (view === null) {
    throw new Error('useView must be used within a ViewContext.Provider')
  }
  return view
}
