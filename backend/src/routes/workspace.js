// Workspace: profile & plan, dashboard, competitors & monitoring, experiments, knowledge base, activity, notifications.
import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { DB_MODE, db } from '../db.js'
import { HttpError, PLANS, ai, isAdmin, log, notify, own, remember, runAgent, usage, ventureCtx } from '../core.js'

const r = Router()
const text = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// ---------------------------------------------------------------- profile, plan, config

r.get('/me', async (req, res) => res.json({ ...req.user, admin: isAdmin(req.user), limits: PLANS[req.user.plan] ?? PLANS.free, usage: await usage(req.user), plans: PLANS }))

r.patch('/me', async (req, res) => {
  const patch = {}
  if (req.body.full_name !== undefined) patch.full_name = text(req.body.full_name, 80)
  if (req.body.founder_profile) {
    const f = req.body.founder_profile
    const list = (x) => (Array.isArray(x) ? x : String(x ?? '').split(',')).map((s) => text(String(s), 40)).filter(Boolean).slice(0, 20)
    patch.founder_profile = {
      skills: list(f.skills), industries: list(f.industries), years_experience: Number(f.years_experience) || 0,
      weekly_hours: Number(f.weekly_hours) || 0, capital: text(f.capital, 40), background: text(f.background, 600),
    }
  }
  if (req.body.settings) patch.settings = { ...req.user.settings, daily_monitoring: !!req.body.settings.daily_monitoring }
  res.json(await db.update('users', req.user.id, patch))
})

r.get('/config', async (req, res) => {
  const aiStatus = await ai('/health', undefined, { timeout: 3000 }).catch(() => ({ mode: 'offline' }))
  res.json({ db: DB_MODE, ai: aiStatus })
})

r.get('/dashboard', async (req, res) => {
  const u = { user_id: req.user.id }
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const [ventures, signals, runs, activity, sessions, experiments] = await Promise.all([
    db.list('ventures', u),
    db.list('market_signals', u, { limit: 8 }),
    db.count('agent_runs', { ...u, created_at: { gte: weekAgo } }),
    db.list('activity_logs', u, { limit: 10 }),
    db.count('boardroom_sessions', u),
    db.list('experiments', u, { limit: 50 }),
  ])
  const scored = ventures.filter((v) => v.overall_score != null)
  res.json({
    ventures, signals, activity,
    stats: {
      active: ventures.filter((v) => !['killed', 'paused'].includes(v.stage)).length,
      avgScore: scored.length ? Math.round(scored.reduce((a, v) => a + v.overall_score, 0) / scored.length) : null,
      boardroomSessions: sessions,
      agentRunsWeek: runs,
      runningExperiments: experiments.filter((e) => e.status === 'running').length,
    },
  })
})

// ---------------------------------------------------------------- competitor intelligence + monitoring

// Only persist known columns — agent output may carry extra fields (e.g. relevance).
const signalRow = (s) => ({
  type: s.type, title: s.title, detail: s.detail ?? null, recommended_response: s.recommended_response ?? null,
  severity: ['info', 'low', 'medium', 'high'].includes(s.severity) ? s.severity : 'info', source_url: s.source_url ?? null,
})

async function scanCompetitor(user, venture, comp) {
  const out = await runAgent(user, venture.id, 'Competitor Intelligence Agent', '/competitors/scan', {
    venture: ventureCtx(venture),
    competitor: { id: comp.id, name: comp.name, url: comp.url, description: comp.description, snapshot: comp.snapshot, threat_level: comp.threat_level },
  }, (o) => `${o.signals.length} signal(s) for ${comp.name}`)
  await db.update('competitors', comp.id, {
    snapshot: out.snapshot, last_checked_at: new Date().toISOString(),
    threat_level: out.threat_level || comp.threat_level, description: comp.description || out.description || null,
  })
  for (const s of out.signals) {
    await db.insert('market_signals', { user_id: user.id, venture_id: venture.id, competitor_id: comp.id, ...signalRow(s) })
    await remember(user, venture.id, 'competitor', s.title, `${s.detail}\nRecommended response: ${s.recommended_response}`)
    if (s.severity === 'medium' || s.severity === 'high') {
      await notify(user, venture.id, 'competitor', s.title, `${s.detail}\n\nRecommended response: ${s.recommended_response}`, `/app/competitors?venture=${venture.id}`)
    }
  }
  await log(user, venture.id, 'Competitor Intelligence Agent', `Scanned ${comp.name}`, `${out.signals.length} signal(s)`)
  return out.signals.length
}

export async function monitorUser(user) {
  let signals = 0
  for (const v of await db.list('ventures', { user_id: user.id })) {
    if (['killed', 'paused'].includes(v.stage)) continue
    for (const c of await db.list('competitors', { venture_id: v.id })) {
      signals += await scanCompetitor(user, v, c).catch((e) => (console.error('scan failed', c.name, e.message), 0))
    }
    const out = await runAgent(user, v.id, 'Monitoring Agent', '/monitor', { venture: ventureCtx(v) }, (o) => `${o.signals.length} market signal(s)`)
      .catch((e) => (console.error('monitor failed', v.name, e.message), { signals: [] }))
    for (const s of out.signals) {
      await db.insert('market_signals', { user_id: user.id, venture_id: v.id, ...signalRow(s) })
      await remember(user, v.id, 'research', s.title, `${s.detail}\nRecommended response: ${s.recommended_response}`)
      await notify(user, v.id, s.type, s.title, `${s.detail}\n\nRecommended response: ${s.recommended_response}`, `/app/competitors?venture=${v.id}`)
      signals++
    }
  }
  await log(user, null, 'Monitoring Agent', 'Completed monitoring sweep', `${signals} new signal(s)`)
  return signals
}

r.get('/competitors', async (req, res) => {
  res.json(await db.list('competitors', { user_id: req.user.id, ...(req.query.venture_id && { venture_id: String(req.query.venture_id) }) }))
})

r.post('/competitors', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const name = text(req.body.name, 80)
  if (!name) throw new HttpError(400, 'Name required')
  let url = text(req.body.url, 300) || null
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`
  const c = await db.insert('competitors', {
    user_id: req.user.id, venture_id: v.id, name, url, description: text(req.body.description, 500) || null, threat_level: 'medium',
  })
  await log(req.user, v.id, 'you', `Started tracking ${name}`, url)
  res.status(201).json(c)
})

r.patch('/competitors/:id', async (req, res) => {
  const c = await own('competitors', req.params.id, req.user)
  const patch = {}
  if (['low', 'medium', 'high'].includes(req.body.threat_level)) patch.threat_level = req.body.threat_level
  if (req.body.description !== undefined) patch.description = text(req.body.description, 500)
  res.json(await db.update('competitors', c.id, patch))
})

r.delete('/competitors/:id', async (req, res) => {
  await own('competitors', req.params.id, req.user)
  await db.remove('competitors', { id: req.params.id })
  res.json({ ok: true })
})

r.post('/competitors/:id/scan', async (req, res) => {
  const c = await own('competitors', req.params.id, req.user)
  const v = await own('ventures', c.venture_id, req.user)
  res.json({ signals: await scanCompetitor(req.user, v, c) })
})

r.get('/signals', async (req, res) => {
  res.json(await db.list('market_signals', { user_id: req.user.id, ...(req.query.venture_id && { venture_id: String(req.query.venture_id) }) }, { limit: 200 }))
})

r.post('/monitor/run', async (req, res) => res.json({ signals: await monitorUser(req.user) }))

// ---------------------------------------------------------------- experiment center

async function withMetrics(e) {
  const [visitors, signups, feedback] = await Promise.all(['visit', 'signup', 'feedback'].map((type) => db.count('experiment_events', { experiment_id: e.id, type })))
  return { ...e, metrics: { visitors, signups, feedback, conversion: visitors ? Math.round((1000 * signups) / visitors) / 10 : 0 } }
}

r.get('/experiments', async (req, res) => {
  const list = await db.list('experiments', { user_id: req.user.id, ...(req.query.venture_id && { venture_id: String(req.query.venture_id) }) })
  res.json(await Promise.all(list.map(withMetrics)))
})

r.post('/experiments', async (req, res) => {
  const v = await own('ventures', req.body.venture_id, req.user)
  const type = ['prototype', 'survey', 'interviews', 'ads', 'other'].includes(req.body.type) ? req.body.type : 'prototype'
  let prototype = null
  if (req.body.prototype_report_id) {
    const r = await own('research_reports', req.body.prototype_report_id, req.user)
    if (r.kind !== 'prototype') throw new HttpError(400, 'Not a prototype')
    if (!r.content.html) throw new HttpError(400, 'The prototype is still being built')
    prototype = { title: r.content.title, html: r.content.html }
  }
  if (type === 'prototype' && !prototype) throw new HttpError(400, 'Build a prototype for this venture first')
  const slug = `${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'venture'}-${randomBytes(3).toString('hex')}`
  const e = await db.insert('experiments', {
    user_id: req.user.id, venture_id: v.id, name: text(req.body.name, 120) || `${v.name} prototype test`,
    hypothesis: text(req.body.hypothesis, 600) || null, type, slug, prototype,
    target_conversion: Math.min(100, Math.max(0.1, Number(req.body.target_conversion) || 10)), status: 'running', result: null,
  })
  await log(req.user, v.id, 'you', `Launched experiment “${e.name}”`, e.hypothesis)
  await remember(req.user, v.id, 'experiment', `Experiment launched: ${e.name}`, `Hypothesis: ${e.hypothesis || '—'}. Target conversion ${e.target_conversion}%.`)
  res.status(201).json(await withMetrics(e))
})

r.get('/experiments/:id', async (req, res) => {
  const e = await own('experiments', req.params.id, req.user)
  const events = await db.list('experiment_events', { experiment_id: e.id }, { limit: 5000, ascending: true })
  res.json({ ...(await withMetrics(e)), events })
})

r.patch('/experiments/:id', async (req, res) => {
  const e = await own('experiments', req.params.id, req.user)
  const patch = {}
  for (const k of ['name', 'hypothesis', 'result']) if (req.body[k] !== undefined) patch[k] = text(req.body[k], 1000)
  if (['draft', 'running', 'completed'].includes(req.body.status)) patch.status = req.body.status
  if (req.body.target_conversion !== undefined) patch.target_conversion = Number(req.body.target_conversion) || e.target_conversion
  res.json(await withMetrics(await db.update('experiments', e.id, patch)))
})

r.delete('/experiments/:id', async (req, res) => {
  await own('experiments', req.params.id, req.user)
  await db.remove('experiment_events', { experiment_id: req.params.id })
  await db.remove('experiments', { id: req.params.id })
  res.json({ ok: true })
})

// Manually logged evidence: interview notes, survey answers.
r.post('/experiments/:id/events', async (req, res) => {
  const e = await own('experiments', req.params.id, req.user)
  const type = req.body.type === 'survey' ? 'survey' : 'feedback'
  const note = text(req.body.text, 2000)
  if (!note) throw new HttpError(400, 'Text required')
  const ev = await db.insert('experiment_events', { user_id: req.user.id, experiment_id: e.id, type, payload: { text: note, source: 'founder' } })
  await remember(req.user, e.venture_id, 'feedback', `Feedback on ${e.name}`, note)
  res.status(201).json(ev)
})

r.post('/experiments/:id/analyze', async (req, res) => {
  const e = await withMetrics(await own('experiments', req.params.id, req.user))
  const v = await own('ventures', e.venture_id, req.user)
  const events = await db.list('experiment_events', { experiment_id: e.id, type: ['feedback', 'survey'] }, { limit: 200 })
  const feedback = events.map((x) => x.payload.text || x.payload.answer || JSON.stringify(x.payload)).filter(Boolean)
  const out = await runAgent(req.user, v.id, 'Experiment Analyst', '/experiments/analyze', { venture: ventureCtx(v), experiment: e, feedback },
    (o) => `${o.outcome} · ${o.conversion}% conversion`)
  const report = await db.insert('research_reports', {
    user_id: req.user.id, venture_id: v.id, kind: 'experiment_analysis', title: `Experiment analysis · ${e.name}`, summary: out.summary, content: out, mode: out.mode,
  })
  await db.update('experiments', e.id, { result: `${out.outcome}: ${out.summary}` })
  await remember(req.user, v.id, 'experiment', `Experiment ${out.outcome}: ${e.name}`,
    `${out.summary}\nInsights: ${out.insights.join('; ')}\nNext: ${out.recommended_next.join('; ')}`)
  await log(req.user, v.id, 'Experiment Analyst', `Marked “${e.name}” ${out.outcome}`, out.summary)
  await notify(req.user, v.id, 'experiment', `Experiment ${out.outcome}: ${e.name}`, out.summary, `/app/experiments/${e.id}`)
  res.json({ report, analysis: out })
})

// ---------------------------------------------------------------- knowledge base (RAG)

r.get('/knowledge', async (req, res) => {
  const cols = 'id,user_id,title,category,source,url,chunk_count,status,created_at'
  const [library, mine] = await Promise.all([
    db.list('knowledge_documents', { user_id: null }, { limit: 500, columns: cols }),
    db.list('knowledge_documents', { user_id: req.user.id }, { limit: 500, columns: cols }),
  ])
  res.json([...mine, ...library].map(({ content, ...d }) => d))
})

r.get('/knowledge/:id', async (req, res) => {
  const d = await db.get('knowledge_documents', req.params.id)
  if (!d || (d.user_id && d.user_id !== req.user.id)) throw new HttpError(404, 'Not found')
  res.json(d)
})

r.post('/knowledge', async (req, res) => {
  const title = text(req.body.title, 160)
  const body = text(req.body.text, 200_000) || null
  const url = text(req.body.url, 500) || null
  if (!title || (!body && !url)) throw new HttpError(400, 'Title and either text or a URL are required')
  if (url && !/^https?:\/\//.test(url)) throw new HttpError(400, 'URL must start with http(s)://')
  const doc = await db.insert('knowledge_documents', {
    user_id: req.user.id, title, category: text(req.body.category, 60) || 'custom', source: url ? 'url' : 'upload', url, content: body, chunk_count: 0, status: 'indexing',
  })
  try {
    const out = await ai('/knowledge/ingest', { id: doc.id, title, text: body, url, owner: req.user.id, category: doc.category })
    await log(req.user, null, 'Knowledge Agent', `Indexed “${title}”`, `${out.chunks} chunks`)
    res.status(201).json(await db.update('knowledge_documents', doc.id, { chunk_count: out.chunks, content: out.content, status: 'indexed' }))
  } catch (e) {
    await db.remove('knowledge_documents', { id: doc.id })
    throw e
  }
})

r.delete('/knowledge/:id', async (req, res) => {
  await own('knowledge_documents', req.params.id, req.user)
  await ai(`/knowledge/${req.params.id}`, undefined, { method: 'DELETE' })
  await db.remove('knowledge_documents', { id: req.params.id })
  res.json({ ok: true })
})

r.post('/knowledge/search', async (req, res) => res.json(await ai('/knowledge/search', { query: text(req.body.query, 500), owner: req.user.id, k: 6 })))

r.post('/knowledge/ask', async (req, res) => {
  const question = text(req.body.question, 500)
  if (!question) throw new HttpError(400, 'Question required')
  res.json(await runAgent(req.user, null, 'Knowledge Agent', '/knowledge/ask', { question, owner: req.user.id }, () => question))
})

// ---------------------------------------------------------------- activity + notifications

r.get('/activity', async (req, res) => res.json(await db.list('activity_logs', { user_id: req.user.id }, { limit: 200 })))
r.get('/agent-runs', async (req, res) => res.json(await db.list('agent_runs', { user_id: req.user.id }, { limit: 200 })))
r.get('/notifications', async (req, res) => res.json(await db.list('notifications', { user_id: req.user.id }, { limit: 50 })))

r.post('/notifications/read', async (req, res) => {
  const unread = await db.list('notifications', { user_id: req.user.id, read: false }, { limit: 500 })
  const ids = Array.isArray(req.body.ids) ? new Set(req.body.ids) : null
  await Promise.all(unread.filter((n) => !ids || ids.has(n.id)).map((n) => db.update('notifications', n.id, { read: true })))
  res.json({ ok: true })
})

export default r
