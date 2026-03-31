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
