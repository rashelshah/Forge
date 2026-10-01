// Market Signals: an AI market radar per venture. One run refreshes the overview, opportunities, threats, trends and outlook,
// and adds new signals to the feed (which also carries the daily monitoring agent's market findings).
import { Router } from 'express'
import { db } from '../db.js'
import { latestReport, log, notify, own, remember, runAgent, ventureCtx } from '../core.js'

const r = Router()
const REPLACED = ['market_opportunities', 'market_threats', 'market_trends', 'industry_outlooks', 'signal_sources']
const day = (s) => s.occurred_on ?? s.created_at.slice(0, 10)

r.get('/market', async (req, res) => {
  const v = await own('ventures', String(req.query.venture_id), req.user)
  const q = (t, n) => db.list(t, { venture_id: v.id }, { limit: n })
  const [outlooks, signals, opportunities, threats, trends, sources] = await Promise.all([
    q('industry_outlooks', 1), q('market_signals', 200), q('market_opportunities', 20), q('market_threats', 20), q('market_trends', 20), q('signal_sources', 20),
  ])
  res.json({
    outlook: outlooks[0] ?? null, opportunities: opportunities.sort((a, b) => b.score - a.score), threats, trends, sources,
    signals: signals.filter((s) => !s.competitor_id).sort((a, b) => day(b).localeCompare(day(a))).slice(0, 50),
  })
})

r.post('/market/run', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const [competitors, intel, memories, known] = await Promise.all([
    db.list('competitors', { venture_id: v.id }), latestReport(v.id, 'intel'),
    db.list('venture_memory', { venture_id: v.id }, { limit: 20 }), db.list('market_signals', { venture_id: v.id }, { limit: 100 }),
  ])
  const out = await runAgent(req.user, v.id, 'Market Intelligence Analyst', '/market/run', {
    venture: ventureCtx(v),
    context: {
      competitors: competitors.map((c) => c.name), intel: intel?.content?.brief ?? null,
      memories: memories.filter((m) => m.kind !== 'signal').map(({ kind, title, content }) => ({ kind, title, content })),
      known_signals: known.map((s) => s.title),
    },
  }, (o) => `${o.signals.length} signal(s) · ${o.opportunities.length} opportunities · ${o.threats.length} threats`, 900_000)

  const row = (x) => ({ user_id: req.user.id, venture_id: v.id, ...x })
  for (const t of REPLACED) await db.remove(t, { venture_id: v.id })
  const { overview: ov, outlook } = out
  await db.insert('industry_outlooks', row({ health: ov.health, confidence: ov.confidence, drivers: ov.drivers, risks: ov.risks, summary: outlook.summary, best_area: outlook.best_area, live: out.live }))
  for (const o of out.opportunities) await db.insert('market_opportunities', row({ title: o.title, description: o.description, score: o.score, market_size: o.market_size, difficulty: o.difficulty, time_horizon: o.time_horizon }))
  for (const t of out.threats) await db.insert('market_threats', row(t))
  for (const t of out.trends) await db.insert('market_trends', row(t))
  for (const s of out.sources) await db.insert('signal_sources', row(s))

  const seen = new Set(known.map((s) => s.title.toLowerCase()))
  const fresh = out.signals.filter((s) => !seen.has(s.title.toLowerCase()))
  for (const s of fresh) {
    await db.insert('market_signals', row({ type: 'radar', title: s.title, detail: s.summary, impact: s.impact, opportunity: s.opportunity, recommended_response: s.opportunity,
      severity: s.strength, confidence: s.confidence, source: s.source, source_url: s.source_url, occurred_on: s.occurred_on }))
  }

  await remember(req.user, v.id, 'signal', `Market radar: ${ov.health} outlook`,
    `${outlook.summary}\nMost promising area: ${outlook.best_area}\nTop opportunity: ${out.opportunities[0]?.title ?? 'none'}. Top threat: ${out.threats[0]?.title ?? 'none'}.`
    + (fresh.length ? `\nNew signals: ${fresh.map((s) => s.title).join('; ')}` : ''))
  await log(req.user, v.id, 'Market Intelligence Analyst', 'Refreshed the market radar', `${fresh.length} new signal(s), ${out.opportunities.length} opportunities, ${out.threats.length} threats`)
  if (fresh.length) await notify(req.user, v.id, 'market', `${fresh.length} new market signal${fresh.length > 1 ? 's' : ''}`, fresh.map((s) => s.title).join('\n'), `/app/market-signals?venture=${v.id}`)
  res.json({ signals: fresh.length })
})

export default r
