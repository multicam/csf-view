import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import wireframe from './fixtures/wireframe.json'
import flow from './fixtures/flow.json'
import empty from './fixtures/empty.json'

const PORT = 7292 // different test port
let server: { stop: () => void }
let viewsDir: string
const base = `http://localhost:${PORT}`

beforeAll(async () => {
  viewsDir = await mkdtemp(join(tmpdir(), 'csf-view-persist-'))
  const mod = await import('../server.ts')
  server = mod.startServer({ port: PORT, viewsDir })
})

afterAll(async () => {
  server?.stop()
  await rm(viewsDir, { recursive: true, force: true })
})

async function save(name: string, document: unknown) {
  return fetch(`${base}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, document }),
  })
}

async function load(name: string) {
  const res = await fetch(`${base}/api/load?name=${name}`)
  if (res.status === 404) return null
  return res.json()
}

describe('round-trip persistence', () => {
  it('wireframe fixture: save → load preserves all shapes', async () => {
    await save('wireframe', wireframe)
    const data = await load('wireframe')

    expect(data).not.toBeNull()
    expect(data.document.store['shape:header']).toBeDefined()
    expect(data.document.store['shape:content']).toBeDefined()
    expect(data.document.store['shape:sidebar']).toBeDefined()
    expect(data.document.store['shape:note1']).toBeDefined()
  })

  it('flow fixture: save → load preserves arrow bindings', async () => {
    await save('flow', flow)
    const data = await load('flow')

    expect(data).not.toBeNull()
    expect(data.document.store['binding:arrow1-start']).toBeDefined()
    expect(data.document.store['binding:arrow1-end']).toBeDefined()
    expect(data.document.store['binding:arrow2-start']).toBeDefined()
    expect(data.document.store['binding:arrow2-end']).toBeDefined()
  })

  it('empty fixture: save → load produces valid document', async () => {
    await save('empty', empty)
    const data = await load('empty')

    expect(data).not.toBeNull()
    expect(data.document.store['page:page1']).toBeDefined()
    // Only the page, no shapes
    const shapeKeys = Object.keys(data.document.store).filter((k: string) =>
      k.startsWith('shape:')
    )
    expect(shapeKeys.length).toBe(0)
  })

  it('sanitizes special characters in name for filesystem safety', async () => {
    await save('my idea/v2', wireframe)
    const data = await load('my idea/v2')

    // Should still work — server sanitizes the name for filesystem
    // The file should exist without path traversal
    expect(data).not.toBeNull()
    expect(data.name).toBe('my idea/v2')
  })

  it('overwriting existing view replaces content', async () => {
    await save('overwrite-test', wireframe)
    const first = await load('overwrite-test')
    expect(Object.keys(first.document.store).length).toBeGreaterThan(1)

    await save('overwrite-test', empty)
    const second = await load('overwrite-test')

    // Should now have only the page, not the wireframe shapes
    const shapeKeys = Object.keys(second.document.store).filter((k: string) =>
      k.startsWith('shape:')
    )
    expect(shapeKeys.length).toBe(0)
  })
})
