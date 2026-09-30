// Ventures and the venture pipeline: discovery -> validation -> boardroom -> MVP -> prototype -> memory.
import vm from 'node:vm'
import { Router } from 'express'
import { db, supabase } from '../db.js'
import { startVenturePrototype, studioEdit } from './studio.js'
import { HttpError, ai, latestReport, log, notify, own, remember, requireQuota, runAgent, ventureCtx } from '../core.js'

const r = Router()
const SCORE_KEYS = ['demand', 'competition', 'defensibility', 'revenue_potential', 'founder_fit']
const STAGES = ['idea', 'validating', 'building', 'launched', 'paused', 'killed']
const text = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const saveReport = (user, ventureId, kind, title, out, summary) =>
  db.insert('research_reports', { user_id: user.id, venture_id: ventureId, kind, title, summary, content: out, mode: out.mode || 'live' })

// ---------------------------------------------------------------- ventures CRUD

r.get('/ventures', async (req, res) => res.json(await db.list('ventures', { user_id: req.user.id })))

r.post('/ventures', async (req, res) => {
  const idea = text(req.body.idea)
  if (idea.length < 8) throw new HttpError(400, 'Describe the idea in at least a few words')
  await requireQuota(req.user, 'ventures')
  const now = new Date().toISOString()
  const v = await db.insert('ventures', {
    user_id: req.user.id, name: text(req.body.name, 80) || idea.split(/\s+/).slice(0, 3).join(' '), idea,
    stage: 'idea', scores: {}, opportunity: req.body.opportunity ?? null, created_at: now, updated_at: now,
  })
  await log(req.user, v.id, 'you', 'Created venture', v.name)
  const opp = req.body.opportunity
  await remember(req.user, v.id, 'research', 'Venture thesis', opp
    ? `${idea}\nProblem: ${opp.problem}\nFrequency: ${opp.frequency}. Pain ${opp.pain_level}/10. Customers: ${opp.potential_customers}. Market: ${opp.market_size}.`
    : idea)
  res.status(201).json(v)
})

r.get('/ventures/:id', async (req, res) => res.json(await own('ventures', req.params.id, req.user)))

r.patch('/ventures/:id', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const patch = { updated_at: new Date().toISOString() }
  if (req.body.name) patch.name = text(req.body.name, 80)
  if (req.body.idea) patch.idea = text(req.body.idea)
  if (req.body.stage) {
    if (!STAGES.includes(req.body.stage)) throw new HttpError(400, 'Invalid stage')
    patch.stage = req.body.stage
  }
  const updated = await db.update('ventures', v.id, patch)
  if (patch.stage && patch.stage !== v.stage) {
    await log(req.user, v.id, 'you', `Moved to ${patch.stage}`, v.name)
    await remember(req.user, v.id, 'decision', `Stage changed to ${patch.stage}`, `Founder moved ${v.name} from ${v.stage} to ${patch.stage}.`)
  }
  res.json(updated)
})

r.delete('/ventures/:id', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  for (const t of ['research_reports', 'competitors', 'market_signals', 'agent_runs', 'boardroom_sessions', 'experiments',
    'experiment_events', 'venture_memory', 'notifications', 'activity_logs']) {
    if (t === 'experiment_events') {
      const ids = (await db.list('experiments', { venture_id: v.id }, { limit: 1000 })).map((e) => e.id)
      if (ids.length) await db.remove(t, { experiment_id: ids })
    } else await db.remove(t, { venture_id: v.id })
  }
  await db.remove('ventures', { id: v.id })
  ai(`/memory/${v.id}`, undefined, { method: 'DELETE' }).catch(() => {})
  res.json({ ok: true })
})

// ---------------------------------------------------------------- discovery

r.post('/discover', async (req, res) => {
  const seed = text(req.body.seed, 300) || null
  const out = await runAgent(req.user, null, 'Opportunity Discovery Agent', '/discover',
    { seed, founder: req.user.founder_profile }, (o) => `${o.opportunities.length} opportunities from ${o.sources_scanned} sources`)
  const report = await saveReport(req.user, null, 'discovery', `Opportunities · ${seed || 'Founder profile'}`, out,
    out.opportunities.map((o) => o.title).join(' · '))
  await log(req.user, null, 'Opportunity Discovery Agent', 'Scanned Reddit, Product Hunt, Hacker News, G2 and App Store', seed)
  res.json(report)
})

// ---------------------------------------------------------------- validation engine

r.post('/ventures/:id/validate', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const out = await runAgent(req.user, v.id, 'Validation Engine', '/validate',
    { venture: ventureCtx(v), founder: req.user.founder_profile }, (o) => `Overall ${o.overall}/100 · ${o.verdict}`)
  const report = await saveReport(req.user, v.id, 'validation', `Validation · ${v.name}`, out, out.summary)
  const updated = await db.update('ventures', v.id, {
    scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, out[k].score])), overall_score: out.overall, verdict: out.verdict,
    stage: v.stage === 'idea' ? 'validating' : v.stage, updated_at: new Date().toISOString(),
  })

  const existing = new Set((await db.list('competitors', { venture_id: v.id })).map((c) => c.name.toLowerCase()))
  for (const c of out.competitors ?? []) {
    if (existing.has(c.name.toLowerCase())) continue
    await db.insert('competitors', { user_id: req.user.id, venture_id: v.id, name: c.name, url: c.url, description: c.description, threat_level: 'medium' })
  }

  await remember(req.user, v.id, 'research', `Validation: ${out.overall}/100 (${out.verdict})`,
    `${out.summary}\nScores: ${SCORE_KEYS.map((k) => `${k} ${out[k].score} — ${out[k].summary}`).join('; ')}\nKey risks: ${out.key_risks.join('; ')}`)
  await log(req.user, v.id, 'Validation Engine', `Scored ${v.name} ${out.overall}/100`, out.verdict)
  await notify(req.user, v.id, 'validation', `${v.name} scored ${out.overall}/100`, out.summary, `/app/ventures/${v.id}`)
  res.json({ venture: updated, report })
})

// ---------------------------------------------------------------- reports

r.get('/research', async (req, res) => {
  const match = { user_id: req.user.id, ...(req.query.kind && { kind: String(req.query.kind) }), ...(req.query.venture_id && { venture_id: String(req.query.venture_id) }) }
  res.json(await db.list('research_reports', match, { limit: 300 }))
})
r.get('/research/:id', async (req, res) => res.json(await own('research_reports', req.params.id, req.user)))
r.delete('/research/:id', async (req, res) => {
  await own('research_reports', req.params.id, req.user)
  await db.remove('research_reports', { id: req.params.id })
  res.json({ ok: true })
})

// ---------------------------------------------------------------- boardroom (streams the debate)

r.get('/boardroom', async (req, res) => {
  const match = { user_id: req.user.id, ...(req.query.venture_id && { venture_id: String(req.query.venture_id) }) }
  res.json(await db.list('boardroom_sessions', match, { limit: 100 }))
})
r.get('/boardroom/:id', async (req, res) => res.json(await own('boardroom_sessions', req.params.id, req.user)))

r.post('/ventures/:id/boardroom', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const question = text(req.body.question, 500) || `Should we commit to building ${v.name}?`
  const rounds = Math.min(3, Math.max(1, Number(req.body.rounds) || 2))
  const validation = (await latestReport(v.id, 'validation'))?.content ?? null
  // Every board member speaks each round; count them against the quota up front.
  await requireQuota(req.user, 'agentRuns')
  const aiRes = await ai('/boardroom', { venture: ventureCtx(v), question, rounds, validation, owner: req.user.id }, { raw: true, timeout: 900_000 })

  const session = await db.insert('boardroom_sessions', {
    user_id: req.user.id, venture_id: v.id, question, rounds, transcript: [], verdict: null, status: 'running',
  })
  const run = await db.insert('agent_runs', { user_id: req.user.id, venture_id: v.id, agent: 'Boardroom', status: 'running' })
  const t0 = Date.now()
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  res.write(`data: ${JSON.stringify({ type: 'session', id: session.id })}\n\n`)

  const transcript = []
  let verdict = null
  let mode = null
  let error = null
  let buf = ''
  const decoder = new TextDecoder()
  // Keep consuming even if the browser disconnects, so the session is always stored.
  try {
    for await (const chunk of aiRes.body) {
      buf += decoder.decode(chunk, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, '')
        buf = buf.slice(i + 2)
        if (!line) continue
        const e = JSON.parse(line)
        if (e.type === 'start') mode = e.mode
        if (e.type === 'message') {
          transcript.push(e.message)
          // Saved as it happens, so a reload or another tab can follow the live session.
          await db.update('boardroom_sessions', session.id, { transcript, mode })
        }
        if (e.type === 'verdict') verdict = e.verdict
        if (e.type === 'error') error = e.error
        if (!res.writableEnded) res.write(`data: ${line}\n\n`)
      }
    }
  } catch (e) {
    error = `Stream interrupted: ${e.message}`
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`)
  }

  await db.update('boardroom_sessions', session.id, { transcript, verdict, mode, status: verdict ? 'completed' : 'failed' })
  await db.update('agent_runs', run.id, {
    status: verdict ? 'succeeded' : 'failed', mode, error, duration_ms: Date.now() - t0, finished_at: new Date().toISOString(),
    output_summary: verdict ? `${verdict.decision} · ${verdict.confidence}% confidence · ${transcript.length} turns` : null,
  })
  if (verdict) {
    await db.update('ventures', v.id, { verdict: verdict.decision, updated_at: new Date().toISOString() })
    await remember(req.user, v.id, 'boardroom', `Boardroom: ${verdict.decision} — ${question}`,
      `${verdict.summary}\nConsensus: ${verdict.consensus.join('; ')}\nDisagreements: ${verdict.disagreements.join('; ')}\n` +
      `Critical assumptions: ${verdict.critical_assumptions.map((a) => `${a.assumption} (test: ${a.test})`).join('; ')}\n` +
      `Failure Agent: ${transcript.filter((t) => t.agent === 'failure').map((t) => t.key_point).join('; ')}`)
    await log(req.user, v.id, 'Boardroom', `Voted ${verdict.decision} on "${question}"`, `${verdict.confidence}% confidence`)
    await notify(req.user, v.id, 'boardroom', `Boardroom verdict for ${v.name}: ${verdict.decision}`, verdict.summary, `/app/boardroom/${session.id}`)
  }
  res.end()
})

// ---------------------------------------------------------------- MVP architect

r.post('/ventures/:id/mvp', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const out = await runAgent(req.user, v.id, 'MVP Architect', '/mvp', { venture: ventureCtx(v), founder: req.user.founder_profile },
    (o) => `${o.features.length} features · ${o.apis.length} endpoints · ${o.sprint_plan.length} sprints`)
  const report = await saveReport(req.user, v.id, 'mvp', `MVP blueprint · ${v.name}`, out, out.summary)
  await remember(req.user, v.id, 'roadmap', 'MVP blueprint', `${out.summary}\nMust-haves: ${out.features.filter((f) => f.priority === 'must').map((f) => f.name).join(', ')}\n` +
    `Sprints: ${out.sprint_plan.map((s) => `S${s.sprint} ${s.goal}`).join('; ')}`)
  await log(req.user, v.id, 'MVP Architect', 'Generated MVP blueprint', out.summary)
  res.json(report)
})

// ---------------------------------------------------------------- prototype builder

// Compile (never execute) inline scripts to catch syntax errors the model introduced. JSX (text/babel) can't be compiled
// here; those prototypes are verified by actually running them in a browser (Product Studio) or by the preview's error reporter.
export function scriptError(html) {
  for (const [, code] of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*text\/babel)[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      new vm.Script(code)
    } catch (e) {
      return e.message
    }
  }
  return null
}

async function repairScripts(v, html) {
  for (let i = 0; i < 2; i++) {
    const err = scriptError(html)
    if (!err) return html
    html = (await ai('/prototype/edit', { venture: ventureCtx(v), html, instruction: `Fix this JavaScript syntax error so the script parses, without changing behaviour: ${err}` })).html
  }
  if (scriptError(html)) throw new HttpError(502, 'The generated code had errors we could not auto-repair. Please try again.')
  return html
}

// Builds run in the background (1-4 min on free models) and save their progress on the report, so the user can
// switch tabs or reload and still see where the build is.
async function buildPrototype(user, v, report) {
  const setBuild = async (build) => {
    const cur = await db.get('research_reports', report.id)
    await db.update('research_reports', report.id, { content: { ...cur.content, build } })
  }
  const run = await db.insert('agent_runs', { user_id: user.id, venture_id: v.id, agent: 'Prototype Builder', status: 'running' })
  const t0 = Date.now()
  let result = null
  let error = null
  try {
    // Enrich the venture context with the latest MVP plan and validation scores so the
    // prototype builder can produce a product-specific UI instead of a generic dashboard.
    const [mvpReport, validationReport] = await Promise.all([
      latestReport(v.id, 'mvp'),
      latestReport(v.id, 'validation'),
    ])
    const enrichedVenture = {
      ...ventureCtx(v),
      mvp_plan: mvpReport?.content ?? null,
      validation: validationReport?.content ?? null,
    }
    const aiRes = await ai('/prototype', { venture: enrichedVenture }, { raw: true, timeout: 900_000 })
    let buf = ''
    const decoder = new TextDecoder()
    for await (const chunk of aiRes.body) {
      buf += decoder.decode(chunk, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).replace(/^data: /, '')
        buf = buf.slice(i + 2)
        if (!line) continue
        const e = JSON.parse(line)
        if (e.type === 'stage') await setBuild({ status: 'building', stage: e.stage, app_name: e.app_name, screens: e.screens, started_at: new Date(t0).toISOString() })
        if (e.type === 'done') result = e.result
        if (e.type === 'error') error = e.error
      }
    }
    if (result) {
      await setBuild({ status: 'building', stage: 'check', app_name: result.title, started_at: new Date(t0).toISOString() })
      result.html = await repairScripts(v, result.html)
    }
  } catch (e) {
    error = e.message
  }
  const cur = await db.get('research_reports', report.id)
  if (result) {
    await db.update('research_reports', report.id, {
      title: `Prototype · ${v.name}`, summary: result.summary,
      content: { ...result, history: [], previous_html: cur.content.html ?? null, build: null },
    })
    await remember(user, v.id, 'roadmap', 'Prototype built', `A clickable first prototype of ${v.name} was generated: ${result.summary}.`)
    await log(user, v.id, 'Prototype Builder', 'Built a working prototype', result.title)
    await notify(user, v.id, 'prototype', `Your ${result.title} prototype is ready`, result.summary, `/app/ventures/${v.id}?tab=prototype`)
  } else {
    await db.update('research_reports', report.id, { content: { ...cur.content, build: { status: 'error', error: error || 'The build failed. Please try again.' } } })
  }
  await db.update('agent_runs', run.id, {
    status: result ? 'succeeded' : 'failed', mode: result?.mode, error: result ? null : error, duration_ms: Date.now() - t0,
    finished_at: new Date().toISOString(), output_summary: result ? `${result.title} · ${Math.round(result.html.length / 1024)}KB` : null,
  })
}

r.post('/ventures/:id/prototype', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  // With Supabase the venture prototype is built by the Product Studio team (strategy, UX, design research, build, visual review, refinement).
  if (supabase) return res.status(202).json(await startVenturePrototype(req.user, v))
  await requireQuota(req.user, 'agentRuns')
  const existing = await latestReport(v.id, 'prototype')
  const building = existing?.content.build?.status === 'building' && Date.now() - new Date(existing.content.build.started_at).getTime() < 15 * 60_000
  if (building) return res.status(202).json(existing)
  const build = { status: 'building', stage: 'spec', started_at: new Date().toISOString() }
  const report = existing
    ? await db.update('research_reports', existing.id, { content: { ...existing.content, build } })
    : await saveReport(req.user, v.id, 'prototype', `Prototype · ${v.name}`, { title: v.name, html: null, summary: 'Building…', history: [], previous_html: null, build, mode: 'live' }, 'Building…')
  buildPrototype(req.user, v, report).catch((e) => console.error('prototype build crashed', e))
  res.status(202).json(report)
})

r.post('/research/:id/prototype/edit', async (req, res) => {
  const report = await own('research_reports', req.params.id, req.user)
  if (report.kind !== 'prototype') throw new HttpError(400, 'Not a prototype')
  if (!report.content.html) throw new HttpError(400, 'The prototype is still being built')
  const instruction = text(req.body.instruction, 1500)
  if (!instruction) throw new HttpError(400, 'Describe the change you want')
  const v = await own('ventures', report.venture_id, req.user)
  const studio = !!report.content.studio_project_id
  const out = studio
    ? await studioEdit(req.user, v, report.content.html, instruction)
    : await runAgent(req.user, v.id, 'Prototype Builder', '/prototype/edit', { venture: ventureCtx(v), html: report.content.html, instruction }, (o) => o.summary)
  const html = studio ? out.html : await repairScripts(v, out.html)
  const history = [...(report.content.history ?? []), { instruction, summary: out.summary, at: new Date().toISOString() }].slice(-30)
  const updated = await db.update('research_reports', report.id, {
    content: { ...report.content, html, history, previous_html: report.content.html }, summary: out.summary,
  })
  await log(req.user, v.id, 'Prototype Builder', 'Updated the prototype', out.summary)
  res.json(updated)
})

r.post('/research/:id/prototype/undo', async (req, res) => {
  const report = await own('research_reports', req.params.id, req.user)
  if (report.kind !== 'prototype' || !report.content.previous_html) throw new HttpError(400, 'Nothing to undo')
  const history = (report.content.history ?? []).slice(0, -1)
  res.json(await db.update('research_reports', report.id, {
    content: { ...report.content, html: report.content.previous_html, previous_html: null, history },
  }))
})

// ---------------------------------------------------------------- venture memory

r.get('/ventures/:id/memory', async (req, res) => {
  await own('ventures', req.params.id, req.user)
  res.json(await db.list('venture_memory', { venture_id: req.params.id }, { limit: 500 }))
})

r.post('/ventures/:id/memory', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const content = text(req.body.content, 5000)
  if (!content) throw new HttpError(400, 'Content required')
  res.status(201).json(await remember(req.user, v.id, text(req.body.kind, 30) || 'feedback', text(req.body.title, 120) || 'Founder note', content))
})

r.post('/ventures/:id/memory/search', async (req, res) => {
  await own('ventures', req.params.id, req.user)
  res.json(await ai('/memory/search', { venture_id: req.params.id, query: text(req.body.query, 500), k: 8 }))
})

export default r
