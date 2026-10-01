// Venture Memory: the knowledge layer over `venture_memory` (every agent writes there via remember()). Synthesis distils the raw
// stream into what we know, validated/failed assumptions and the decision journal; search is semantic (pgvector).
import { Router } from 'express'
import { db } from '../db.js'
import { HttpError, ai, log, own, runAgent, ventureCtx } from '../core.js'

const r = Router()
const DERIVED = ['venture_learnings', 'validated_assumptions', 'failed_assumptions', 'decision_journal']

r.get('/memory', async (req, res) => {
  const v = await own('ventures', String(req.query.venture_id), req.user)
  const q = (t, limit = 100) => db.list(t, { venture_id: v.id }, { limit })
  const [memories, learnings, validated, failed, decisions] = await Promise.all([q('venture_memory', 500), ...DERIVED.map((t) => q(t))])
  res.json({
    memories, validated, failed, decisions,
    known: learnings.filter((l) => l.kind === 'known').sort((a, b) => a.position - b.position),
    top: learnings.filter((l) => l.kind === 'top').sort((a, b) => a.position - b.position),
    synthesized_at: [...learnings, ...validated, ...failed, ...decisions].map((x) => x.created_at).sort().at(-1) ?? null,
  })
})

r.post('/memory/synthesize', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const memories = (await db.list('venture_memory', { venture_id: v.id }, { limit: 200 })).reverse() // oldest first
  if (!memories.length) throw new HttpError(400, 'Nothing in memory yet — run validation, the boardroom or competitive intelligence first')
  const out = await runAgent(req.user, v.id, 'Venture Historian', '/memory/synthesize', {
    venture: ventureCtx(v), memories: memories.map((m) => ({ id: m.id, kind: m.kind, title: m.title, content: m.content, at: m.created_at })),
  }, (o) => `${o.validated.length} validated · ${o.failed.length} failed · ${o.decisions.length} decisions`, 900_000)

  const row = (x) => ({ user_id: req.user.id, venture_id: v.id, ...x })
  for (const t of DERIVED) await db.remove(t, { venture_id: v.id })
  for (const [kind, list] of [['known', out.known], ['top', out.top]]) {
    for (const [position, statement] of list.entries()) await db.insert('venture_learnings', row({ kind, statement, position }))
  }
  for (const a of out.validated) await db.insert('validated_assumptions', row(a))
  for (const a of out.failed) await db.insert('failed_assumptions', row(a))
  for (const d of out.decisions) await db.insert('decision_journal', row(d))
  await log(req.user, v.id, 'Venture Historian', 'Synthesized venture memory', `${out.memories_used} memories → ${out.validated.length} validated, ${out.failed.length} failed, ${out.decisions.length} decisions`)
  res.json({ ok: true })
})

r.post('/memory/search', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const query = typeof req.body.query === 'string' ? req.body.query.trim().slice(0, 500) : ''
  if (!query) throw new HttpError(400, 'Enter something to search for')
  const { results } = await ai('/memory/search', { venture_id: v.id, query, k: 8 })
  const rows = results.length ? await db.list('venture_memory', { venture_id: v.id, id: results.map((x) => x.memory_id) }, { limit: 20 }) : []
  const by = new Map(rows.map((m) => [m.id, m]))
  res.json({ results: results.filter((x) => by.has(x.memory_id)).map((x) => ({ ...by.get(x.memory_id), score: x.score })) })
})

export default r
