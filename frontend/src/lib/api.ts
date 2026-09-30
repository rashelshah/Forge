import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function headers() {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null
  return { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }
}

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: await headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || res.statusText, res.status)
  return data as T
}

/** POST that returns a server-sent event stream; calls onEvent for each `data:` payload. */
export async function stream<E>(path: string, body: unknown, onEvent: (e: E) => void) {
  const res = await fetch(`${BASE}/api${path}`, { method: 'POST', headers: await headers(), body: JSON.stringify(body) })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error || res.statusText, res.status)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).replace(/^data: /, '')
      buf = buf.slice(i + 2)
      if (line) onEvent(JSON.parse(line))
    }
  }
}

export const publicPageUrl = (slug: string) => `${BASE || window.location.origin}/p/${slug}`
