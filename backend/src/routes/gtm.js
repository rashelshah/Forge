// Go-To-Market Studio: brand, positioning, messaging, launch assets, growth plan, ads and investor deck for a venture.
// The AI service writes progress and files straight to Supabase; this router owns auth, quota, the job queue and the checklist.
import { Router } from 'express'
import { db, supabase } from '../db.js'
import { HttpError, ai, log, notify, own, remember, requireQuota } from '../core.js'
import { gather, readiness } from './command.js'

const r = Router()
const TABLE = 'gtm_runs'
const now = () => new Date().toISOString()
const check = ({ data, error }) => {
  if (error) throw error
  return data
}

let ready = false
r.use('/ventures/:id/gtm', async (req, res, next) => {
  if (!supabase) throw new HttpError(503, 'Go-To-Market Studio needs Supabase (database + file storage) and migration 008_gtm_studio.sql.')
  if (!ready) {
    const { error } = await supabase.from(TABLE).select('id').limit(1)
    if (error) throw new HttpError(503, 'Go-To-Market Studio isn\'t set up yet: run supabase/migrations/008_gtm_studio.sql in the Supabase SQL editor, then reload.')
    ready = true
  }
  next()
})

// ---------------------------------------------------------------- context: the measured facts every agent works from

async function buildContext(v) {
  const d = await gather(v)
  const rd = readiness(d)
  const { val, mvp, proto, intel, board, experiments, competitors } = d
  const vc = val?.content
  const spec = proto?.content?.studio_project_id
    ? Object.fromEntries(check(await supabase.from('studio_artifacts').select('kind,content').eq('project_id', proto.content.studio_project_id).in('kind', ['product_spec', 'design_spec'])).map((a) => [a.kind, a.content]))
    : {}
  return {
    venture: { name: v.name, idea: v.idea, stage: v.stage },
    audience: v.opportunity?.potential_customers || spec.product_spec?.target_audience || 'the target customers described in the idea',
    opportunity: v.opportunity && { problem: v.opportunity.problem, frequency: v.opportunity.frequency, market_size: v.opportunity.market_size, pain_level: v.opportunity.pain_level },
    validation: vc && { overall: v.overall_score, summary: vc.summary, key_risks: vc.key_risks, scores: Object.fromEntries(['demand', 'competition', 'defensibility', 'revenue_potential', 'founder_fit'].filter((k) => vc[k]).map((k) => [k, { score: vc[k].score, summary: vc[k].summary }])) },
    competitors: competitors.map((c) => ({ name: c.name, category: c.category, threat: c.strategic_threat, strengths: c.profile?.strengths?.slice(0, 2), weaknesses: c.profile?.weaknesses?.slice(0, 2) })),
    intel: intel?.content && { insight: intel.content.insight?.insight, recommendation: intel.content.brief?.recommendation, white_space: intel.content.radar?.white_space?.map((w) => w.feature) },
    prototype: { built: !!proto?.content?.html, quality: proto?.content?.studio_score, tagline: spec.product_spec?.tagline, value_proposition: spec.product_spec?.value_proposition,
      design: spec.design_spec && { personality: spec.design_spec.personality, heading_font: spec.design_spec.heading_font, body_font: spec.design_spec.body_font, palette: spec.design_spec.palette } },
    mvp: mvp?.content && { summary: mvp.content.summary, must_have: mvp.content.features?.filter((f) => f.priority === 'must').map((f) => f.name), monthly_cost_estimate: mvp.content.monthly_cost_estimate },
    boardroom: board && { decision: board.decision, confidence: board.confidence, summary: board.summary },
    traction: experiments.map((e) => ({ name: e.name, type: e.type, visitors: e.visitors, signups: e.signups })),
    readiness: { overall: rd.overallReadinessScore, by_module: Object.fromEntries(Object.keys(rd.details).map((k) => [k, rd[k]])) },
  }
}

// ---------------------------------------------------------------- job queue (one run at a time: free-tier LLMs are rate limited per minute)

const queue = []
let draining = false

async function runOne(id) {
  const run = await db.get(TABLE, id)
  if (!run) return
  const v = await db.get('ventures', run.venture_id)
  const user = await db.get('users', run.user_id)
  const agent = await db.insert('agent_runs', { user_id: run.user_id, venture_id: run.venture_id, agent: 'Go-To-Market Studio', status: 'running' })
  const t0 = Date.now()
  let out, error
  try {
    await db.update(TABLE, id, { status: 'running', error: null, updated_at: now() })
    out = await ai('/gtm/run', { run_id: id, context: await buildContext(v) }, { timeout: 3 * 3600_000 })
    for (const m of out.memory) await remember(user, v.id, 'decision', m.title, m.content)  // future agents recall these
    await log(user, v.id, 'Go-To-Market Studio', 'Built the launch package', `Launch score ${out.launch_score}/10`)
    await notify(user, v.id, 'decision', `Your ${v.name} launch package is ready`, `Brand, positioning, messaging, assets, deck and growth plan. Launch score ${out.launch_score}/10.`, `/app/ventures/${v.id}?tab=gtm`)
  } catch (e) {
    error = e.message
    await db.update(TABLE, id, { status: 'failed', error: error.slice(0, 500), updated_at: now() }).catch(() => {})
  }
  await db.update('agent_runs', agent.id, { status: error ? 'failed' : 'succeeded', mode: 'live', error: error ?? null, duration_ms: Date.now() - t0, finished_at: now(), output_summary: out ? `Launch score ${out.launch_score}/10` : null }).catch(() => {})
}

async function drain() {
  if (draining) return
  draining = true
  try {
    while (queue.length) await runOne(queue.shift()).catch((e) => console.error('gtm run failed:', e.message))
  } finally {
    draining = false
  }
}

const enqueue = (id) => {
  if (!queue.includes(id)) queue.push(id)
  drain()
}

if (supabase) {
  for (const run of await db.list(TABLE, { status: ['queued', 'running'] }, { ascending: true }).catch(() => [])) {
    if (run.status === 'queued') enqueue(run.id)
    else await db.update(TABLE, run.id, { status: 'failed', error: 'Interrupted by a server restart. Press Retry to resume — finished agents are reused.' }).catch(() => {})
  }
}

// ---------------------------------------------------------------- routes

const latestByKind = (rows) => Object.fromEntries(rows.map((a) => [a.kind, a.content])) // rows are ordered oldest-first, so the newest wins

r.get('/ventures/:id/gtm', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const run = (await db.list(TABLE, { venture_id: v.id }, { limit: 1 }))[0] ?? null
  const d = await gather(v)
  const prerequisites = { validation: !!d.val, prototype: !!d.proto?.content?.html, mvp: !!d.mvp, ready: !!d.val }
  if (!run) return res.json({ run: null, events: [], artifacts: {}, prerequisites })
  const [events, arts] = await Promise.all([
    supabase.from('gtm_events').select('*').eq('run_id', run.id).order('created_at', { ascending: true }).then(check),
    supabase.from('gtm_artifacts').select('kind,content').eq('run_id', run.id).order('created_at', { ascending: true }).then(check),
  ])
  res.json({ run, events, artifacts: latestByKind(arts), prerequisites })
})

r.post('/ventures/:id/gtm', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const d = await gather(v)
  if (!d.val) throw new HttpError(400, 'Validate the venture first: the brand and positioning are built from its validation results.')
  let run = (await db.list(TABLE, { venture_id: v.id }, { limit: 1 }))[0]
  if (run && (run.status === 'running' || queue.includes(run.id))) return res.status(202).json(run)
  await requireQuota(req.user, 'agentRuns')
  const fresh = req.body.fresh === true || run?.status === 'done'  // a finished package is rebuilt from scratch; a failed one resumes
  if (!run) run = await db.insert(TABLE, { user_id: req.user.id, venture_id: v.id, status: 'queued' })
  else {
    if (fresh) {
      await db.remove('gtm_events', { run_id: run.id })
      await db.remove('gtm_artifacts', { run_id: run.id })
      await ai(`/gtm/${run.id}`, undefined, { method: 'DELETE' }).catch((e) => console.error('gtm purge failed:', e.message))
    }
    run = await db.update(TABLE, run.id, { status: 'queued', stage: null, error: null, ...(fresh && { launch_score: null }), updated_at: now() })
  }
  enqueue(run.id)
  res.status(202).json(run)
})

r.post('/ventures/:id/gtm/checklist', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const run = (await db.list(TABLE, { venture_id: v.id }, { limit: 1 }))[0]
  if (!run) throw new HttpError(404, 'Build the launch package first')
  const id = String(req.body.id ?? '').slice(0, 20)
  const cur = (await db.list('gtm_artifacts', { run_id: run.id, kind: 'checklist_state' }, { limit: 1 }))[0]
  const done = new Set(cur?.content?.done ?? [])
  req.body.done ? done.add(id) : done.delete(id)
  if (cur) await db.update('gtm_artifacts', cur.id, { content: { done: [...done] } })
  else await db.insert('gtm_artifacts', { run_id: run.id, kind: 'checklist_state', content: { done: [...done] } })
  res.json({ done: [...done] })
})

export default r
