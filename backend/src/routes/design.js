// Design Intelligence Knowledge Base (admin only): queue SaaS sites for crawling + analysis by the AI service.
import { Router } from 'express'
import { db, supabase } from '../db.js'
import { HttpError, ai, isAdmin } from '../core.js'

const r = Router()
const TABLE = 'design_references'
// Everything except the long markdown report, which is only fetched for the detail view.
const LIST_COLUMNS = 'id,name,url,industry,subcategory,target_audience,style,metadata_json,homepage_screenshot,dashboard_screenshot,mobile_screenshot,status,error,created_at,updated_at'

r.use('/design', (req, res, next) => {
  if (!supabase) throw new HttpError(503, 'Design Intelligence needs Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) for screenshot storage.')
  if (!isAdmin(req.user)) throw new HttpError(403, 'Design Intelligence is admin only. Add your email to ADMIN_EMAILS in .env.')
  next()
})

// ---------------------------------------------------------------- analysis queue (one site at a time: LLM free tiers are per-minute limited)

const queue = []
let draining = false

async function analyze(id) {
  const row = await db.get(TABLE, id)
  if (!row) return
  await db.update(TABLE, id, { status: 'analyzing', error: null, updated_at: new Date().toISOString() })
  try {
    const out = await ai('/design/analyze', { id, url: row.url }, { timeout: 600_000 })
    if (!(await db.get(TABLE, id))) return ai(`/design/${id}`, undefined, { method: 'DELETE' }) // deleted while analysing
    await db.update(TABLE, id, { ...out, status: 'done', error: null, updated_at: new Date().toISOString() })
  } catch (e) {
    await db.update(TABLE, id, { status: 'failed', error: e.message.slice(0, 500), updated_at: new Date().toISOString() })
  }
}

async function drain() {
  if (draining) return
  draining = true
  try {
    while (queue.length) await analyze(queue.shift()).catch((e) => console.error('design analysis failed:', e.message))
  } finally {
    draining = false
  }
}

const enqueue = (id) => {
  if (!queue.includes(id)) queue.push(id)
  drain()
}

// Jobs only live in memory, so pick up anything a restart interrupted.
if (supabase) {
  for (const row of await db.list(TABLE, { status: ['queued', 'analyzing'] }, { ascending: true, columns: 'id' }).catch(() => [])) enqueue(row.id)
}

// ---------------------------------------------------------------- helpers

function normalize(raw) {
  let s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!u.hostname.includes('.')) return null
    u.hash = ''
    return u.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

// Same site however it was typed: foo.com, https://www.foo.com/ and http://foo.com#x are one reference.
const siteKey = (url) => { const u = new URL(url); return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) }

async function add(url, extra = {}) {
  if ((await db.list(TABLE, { url }, { limit: 1, columns: 'id' })).length) return null
  const row = await db.insert(TABLE, { name: extra.name || new URL(url).hostname.replace(/^www\./, ''), url, status: 'queued', ...(extra.industry && { industry: extra.industry }) })
  enqueue(row.id)
  return row
}

// ---------------------------------------------------------------- routes

r.get('/design/references', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 300) : ''
  if (!q) return res.json(await db.list(TABLE, {}, { limit: 500, columns: LIST_COLUMNS }))
  const { results } = await ai('/design/search', { query: q, k: 12 })
  const rows = await db.list(TABLE, { id: results.map((h) => h.reference_id) }, { columns: LIST_COLUMNS })
  res.json(results.flatMap((h) => {
    const row = rows.find((x) => x.id === h.reference_id)
    return row ? [{ ...row, score: h.score, match: { kind: h.kind, text: h.text } }] : []
  }))
})

r.get('/design/references/:id', async (req, res) => {
  const row = await db.get(TABLE, req.params.id)
  if (!row) throw new HttpError(404, 'Not found')
  res.json(row)
})

r.post('/design/references', async (req, res) => {
  const url = normalize(req.body.url)
  if (!url) throw new HttpError(400, 'Enter a valid website URL, e.g. https://linear.app')
  const key = siteKey(url)
  const dup = (await db.list(TABLE, {}, { limit: 20000, columns: 'url' })).some((x) => { try { return siteKey(x.url) === key } catch { return false } })
  const row = dup ? null : await add(url)
  if (!row) throw new HttpError(409, `${url} is already in the knowledge base`)
  res.status(201).json(row)
})

const BATCH_MAX = 500
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// Accepts `urls: string[]` or `items: [{ url, name?, industry? }]` (a CSV import). Names and industry only label a row while it is
// queued; the analysis replaces them with what the site actually is.
r.post('/design/references/batch', async (req, res) => {
  const raw = Array.isArray(req.body.items) ? req.body.items : Array.isArray(req.body.urls) ? req.body.urls.map((url) => ({ url })) : null
  if (!raw) throw new HttpError(400, 'urls or items must be an array')
  if (raw.length > BATCH_MAX) throw new HttpError(400, `Import at most ${BATCH_MAX} websites per request`)
  const known = new Set((await db.list(TABLE, {}, { limit: 20000, columns: 'url' })).flatMap((x) => { try { return [siteKey(x.url)] } catch { return [] } }))
  const added = [], skipped = [], invalid = []
  for (const it of raw) {
    const url = normalize(typeof it === 'string' ? it : it?.url)
    if (!url) { invalid.push(String(typeof it === 'string' ? it : it?.url ?? '').slice(0, 100)); continue }
    const key = siteKey(url)
    if (known.has(key)) { skipped.push(url); continue }
    known.add(key)
    await add(url, { name: clip(it.name, 120), industry: clip(it.industry, 80) })
    added.push(url)
  }
  res.status(201).json({ added, skipped, invalid })
})

r.post('/design/references/:id/rerun', async (req, res) => {
  const row = await db.get(TABLE, req.params.id)
  if (!row) throw new HttpError(404, 'Not found')
  if (row.status === 'analyzing' || queue.includes(row.id)) throw new HttpError(409, 'Already being analysed')
  const out = await db.update(TABLE, row.id, { status: 'queued', error: null, updated_at: new Date().toISOString() })
  enqueue(row.id)
  res.json(out)
})

r.delete('/design/references/:id', async (req, res) => {
  const i = queue.indexOf(req.params.id)
  if (i >= 0) queue.splice(i, 1)
  await db.remove(TABLE, { id: req.params.id })
  await ai(`/design/${req.params.id}`, undefined, { method: 'DELETE' }).catch((e) => console.error('design purge failed:', e.message))
  res.json({ ok: true })
})

export default r
