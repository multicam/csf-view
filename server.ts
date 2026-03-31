import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

type SSEClient = WritableStreamDefaultWriter<Uint8Array>

interface ServerOptions {
  port?: number
  viewsDir?: string
}

const startTime = Date.now()

export function startServer(opts: ServerOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT) ?? 7201
  const viewsDir = opts.viewsDir ?? process.env.VIEWS_DIR ?? './thoughts/shared/views'
  const clients = new Set<SSEClient>()

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  function sanitizeFilename(name: string): string {
    return name.replace(/[\/\\:*?"<>|]/g, '_')
  }

  async function pushSSE(data: Record<string, unknown>) {
    const payload = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
    const dead: SSEClient[] = []
    for (const client of clients) {
      try {
        await client.write(payload)
      } catch {
        dead.push(client)
      }
    }
    for (const c of dead) clients.delete(c)
  }

  const server = Bun.serve({
    port,
    idleTimeout: 255, // max seconds for SSE connections
    fetch: async (req) => {
      const url = new URL(req.url)

      if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
      }

      if (url.pathname === '/health') {
        return Response.json(
          { viewsDir, uptime: Math.floor((Date.now() - startTime) / 1000) },
          { headers: corsHeaders }
        )
      }

      if (req.method === 'POST' && url.pathname === '/api/save') {
        let body: { name?: string; document?: unknown }
        try {
          body = await req.json()
        } catch {
          return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
        }

        if (!body.name || !body.document) {
          return new Response('Missing name or document', { status: 400, headers: corsHeaders })
        }

        const savedAt = new Date().toISOString()
        const filename = sanitizeFilename(body.name) + '.json'
        const filepath = join(viewsDir, filename)

        await mkdir(viewsDir, { recursive: true })
        await Bun.write(
          filepath,
          JSON.stringify({ name: body.name, savedAt, document: body.document }, null, 2)
        )

        await pushSSE({ name: body.name, savedAt })

        return Response.json({ ok: true, savedAt }, { headers: corsHeaders })
      }

      if (req.method === 'GET' && url.pathname === '/api/load') {
        const name = url.searchParams.get('name')
        if (!name) {
          return new Response('Missing name param', { status: 400, headers: corsHeaders })
        }

        const filename = sanitizeFilename(name) + '.json'
        const file = Bun.file(join(viewsDir, filename))

        if (!(await file.exists())) {
          return new Response('Not found', { status: 404, headers: corsHeaders })
        }

        return new Response(await file.text(), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        })
      }

      if (url.pathname === '/events') {
        const stream = new TransformStream<Uint8Array, Uint8Array>()
        const writer = stream.writable.getWriter()
        clients.add(writer)

        // Send initial comment to flush headers
        writer.write(new TextEncoder().encode(': connected\n\n')).catch(() => {})

        // Clean up on disconnect
        req.signal.addEventListener('abort', () => {
          clients.delete(writer)
          writer.close().catch(() => {})
        })

        return new Response(stream.readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...corsHeaders,
          },
        })
      }

      return new Response('Not found', { status: 404, headers: corsHeaders })
    },
  })

  return {
    stop: () => {
      for (const client of clients) {
        client.close().catch(() => {})
      }
      clients.clear()
      server.stop()
    },
  }
}

// Run as standalone if executed directly
if (import.meta.main) {
  const s = startServer()
  console.log(`csf-view API server running on :${process.env.PORT ?? 7201}`)
  console.log(`Views dir: ${process.env.VIEWS_DIR ?? './thoughts/shared/views'}`)
}
