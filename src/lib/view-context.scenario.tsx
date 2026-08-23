import { describe, expect, it, mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ViewContext, type ViewContextValue, useView } from './view-context'

function ViewConsumer() {
  const view = useView()
  return <span>{`${view.filename}:${view.state.name}:${typeof view.markSaved}`}</span>
}

describe('view context', () => {
  it('supplies the provided view state to a consumer', () => {
    const value: ViewContextValue = {
      state: { name: 'roadmap', version: 2, lastSaved: null },
      filename: 'roadmap-v2',
      markSaved: mock(() => {}),
      bumpVersion: mock(() => {}),
      renameTo: mock(async () => {}),
    }

    const markup = renderToStaticMarkup(
      <ViewContext.Provider value={value}>
        <ViewConsumer />
      </ViewContext.Provider>,
    )

    expect(markup).toContain('roadmap-v2:roadmap:function')
  })

  it('throws a named provider error without a provider', () => {
    expect(() => renderToStaticMarkup(<ViewConsumer />)).toThrow(
      new Error('useView must be used within a ViewContext.Provider'),
    )
  })
})
