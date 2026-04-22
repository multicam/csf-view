const API_BASE = '/api'

export async function saveView(name: string, document: unknown): Promise<{ savedAt: string }> {
  const res = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, document }),
  })
  if (!res.ok) throw new Error(`Save failed: ${res.status}`)
  return res.json()
}

export async function loadView(name: string): Promise<{ name: string; savedAt: string; document: unknown } | null> {
  const res = await fetch(`${API_BASE}/load?name=${encodeURIComponent(name)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Load failed: ${res.status}`)
  return res.json()
}

export async function renameView(from: string, to: string): Promise<{ name: string }> {
  const res = await fetch(`${API_BASE}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  })
  if (!res.ok) throw new Error(`Rename failed: ${res.status}`)
  return res.json()
}

export async function listViews(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/list`)
  if (!res.ok) throw new Error(`List failed: ${res.status}`)
  return res.json()
}

/** Compute the filename for a given name + version */
export function viewFilename(name: string, version: number | null): string {
  if (version === null || version === 0) return name
  return `${name}-v${version}`
}

export async function saveScreenshot(name: string, blob: Blob): Promise<void> {
  const res = await fetch(`${API_BASE}/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-View-Name': name },
    body: blob,
  })
  if (!res.ok) throw new Error(`Screenshot save failed: ${res.status}`)
}

/** Parse a filename into name + version */
export function parseViewFilename(filename: string): { name: string; version: number | null } {
  const match = filename.match(/^(.+)-v(\d+)$/)
  if (match) return { name: match[1]!, version: parseInt(match[2]!, 10) }
  return { name: filename, version: null }
}
