// Competitive Intelligence Officer: one run profiles every tracked competitor, then writes the brief, actions, feature gaps,
// radar and positioning map. Results are stored per venture; competitor memory is built from snapshots of every run.
import { Router } from 'express'
import { db } from '../db.js'
import { HttpError, ai, latestReport, log, notify, own, remember, requireQuota, ventureCtx } from '../core.js'

const r = Router()
const now = () => new Date().toISOString()
const STALE_MS = 15 * 60_000
const isBuilding = (rep) => rep?.content?.build?.status === 'running' && Date.now() - new Date(rep.content.build.started_at).getTime() < STALE_MS

// ---------------------------------------------------------------- memory

/** Per competitor and metric: the first and latest value we recorded, and whether it changed. */
function buildMemory(snaps) {
  const by = {}
  for (const s of snaps) for (const m of s.metrics ?? []) ((by[s.competitor_id] ??= {})[m.name] ??= []).push({ value: m.value, at: s.created_at })
  return Object.fromEntries(Object.entries(by).map(([id, metrics]) => [id, Object.entries(metrics).map(([name, pts]) => {
    const first = pts[0], last = pts.at(-1)
    return { name, first, last, changed: first.value.trim().toLowerCase() !== last.value.trim().toLowerCase(), points: pts.length }
  })]))
}

// ---------------------------------------------------------------- run

export async function beginIntel(v) {
  const existing = await latestReport(v.id, 'intel')
  const build = { status: 'running', started_at: now() }
  if (existing) return db.update('research_reports', existing.id, { content: { ...existing.content, build } })
  return db.insert('research_reports', { user_id: v.user_id, venture_id: v.id, kind: 'intel', title: `Competitive intelligence · ${v.name}`, summary: 'Analysing competitors…', content: { build }, mode: 'live' })
}

export async function runIntelForVenture(user, v, rep) {
  rep ??= await beginIntel(v)
  const run = await db.insert('agent_runs', { user_id: user.id, venture_id: v.id, agent: 'Competitive Intelligence Officer', status: 'running' })
  const t0 = Date.now()
  try {
    const [competitors, snaps, signals, mvp] = await Promise.all([
      db.list('competitors', { venture_id: v.id }), db.list('competitor_snapshots', { venture_id: v.id }, { limit: 500, ascending: true }),
      db.list('market_signals', { venture_id: v.id }, { limit: 300 }), latestReport(v.id, 'mvp'),
    ])
    if (!competitors.length) throw new HttpError(400, 'Track at least one competitor first')
    const name = (id) => competitors.find((c) => c.id === id)?.name
    const out = await ai('/intel/run', {
      venture: ventureCtx(v),
      competitors: competitors.map((c) => ({ id: c.id, name: c.name, url: c.url, description: c.description,
        history: snaps.filter((s) => s.competitor_id === c.id).map((s) => ({ at: s.created_at, metrics: s.metrics })) })),
      mvp_features: (mvp?.content?.features ?? []).filter((f) => f.priority !== 'could').map((f) => f.name),
      recent_events: signals.filter((s) => s.competitor_id && s.occurred_on && name(s.competitor_id)).map((s) => ({ competitor: name(s.competitor_id), type: s.type, date: (s.occurred_on ?? s.created_at).slice(0, 10) })),
    }, { timeout: 900_000 })

    for (const c of out.competitors) {
      const cur = competitors.find((x) => x.id === c.id)
      await db.update('competitors', c.id, {
        category: c.category, strategic_threat: c.strategic_threat, threat_level: c.threat_level, profile: c.profile, snapshot: c.snapshot ?? cur.snapshot,
        description: cur.description || c.profile.summary, last_checked_at: now(),
      })
      await db.insert('competitor_snapshots', { competitor_id: c.id, user_id: user.id, venture_id: v.id, metrics: c.metrics, features: c.features })
    }
    const seen = new Set(signals.map((s) => `${s.competitor_id}|${s.title.toLowerCase()}`))
    let fresh = 0
    for (const s of out.signals) {
      if (seen.has(`${s.competitor_id}|${s.title.toLowerCase()}`)) continue
      await db.insert('market_signals', { user_id: user.id, venture_id: v.id, competitor_id: s.competitor_id, type: s.type, title: s.title, detail: s.detail,
        recommended_response: s.recommended_response, severity: s.severity, source_url: s.source_url, occurred_on: s.occurred_on ?? now().slice(0, 10) })
      fresh++
    }
    const prev = rep.content
    const content = { ...out.report, generated_at: now(), build: null, history: [...(prev.history ?? []), ...(prev.brief ? [{ at: prev.generated_at, market_trend: prev.brief.market_trend, recommendation: prev.brief.recommendation }] : [])].slice(-12) }
    rep = await db.update('research_reports', rep.id, { content, summary: out.report.brief.recommendation.slice(0, 280), created_at: now() })
    await remember(user, v.id, 'competitor', 'Competitive intelligence brief', `${out.report.insight.insight}\nRecommendation: ${out.report.insight.recommendation}`)
    await log(user, v.id, 'Competitive Intelligence Officer', 'Updated the competitive intelligence brief', `${out.competitors.length} competitors, ${fresh} new event(s)`)
    await notify(user, v.id, 'competitor', 'Competitive brief updated', out.report.brief.recommendation, `/app/competitive-intelligence?venture=${v.id}`)
    await db.update('agent_runs', run.id, { status: 'succeeded', mode: 'live', duration_ms: Date.now() - t0, finished_at: now(), output_summary: `${out.competitors.length} competitors · ${fresh} new event(s)` })
    return rep
  } catch (e) {
    await db.update('research_reports', rep.id, { content: { ...rep.content, build: { status: 'error', error: e.message.slice(0, 400) } } }).catch(() => {})
    await db.update('agent_runs', run.id, { status: 'failed', error: e.message, duration_ms: Date.now() - t0, finished_at: now() }).catch(() => {})
    throw e
  }
}

// ---------------------------------------------------------------- routes

r.get('/intel', async (req, res) => {
  const v = await own('ventures', String(req.query.venture_id), req.user)
  const [report, competitors, signals, snaps] = await Promise.all([
    latestReport(v.id, 'intel'), db.list('competitors', { venture_id: v.id }), db.list('market_signals', { venture_id: v.id }, { limit: 300 }),
    db.list('competitor_snapshots', { venture_id: v.id }, { limit: 500, ascending: true }),
  ])
  res.json({ report, competitors, signals: signals.filter((s) => s.competitor_id), market: signals.filter((s) => !s.competitor_id && s.type !== 'radar').slice(0, 8), memory: buildMemory(snaps) })
})

r.post('/intel/run', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const existing = await latestReport(v.id, 'intel')
  if (isBuilding(existing)) return res.status(202).json(existing)
  if (!(await db.count('competitors', { venture_id: v.id }))) throw new HttpError(400, 'Track at least one competitor first')
  await requireQuota(req.user, 'agentRuns')
  const rep = await beginIntel(v)
  runIntelForVenture(req.user, v, rep).catch((e) => console.error('intel failed:', e.message))
  res.status(202).json(rep)
})

export default r
