// Product Studio: an autonomous AI product team (Python/LangGraph) turns an idea into a reviewed, refined prototype.
// The AI service writes progress straight to Supabase; this router owns auth, quota, the job queue and exports.
import { Router } from 'express'
import { db, supabase } from '../db.js'
import { HttpError, ai, own, requireQuota } from '../core.js'

const r = Router()
const TABLE = 'studio_projects'
const text = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const now = () => new Date().toISOString()

r.use('/studio', (req, res, next) => {
  if (!supabase) throw new HttpError(503, 'Product Studio needs Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) and migration 005_product_studio.sql.')
  next()
})

// ---------------------------------------------------------------- job queue (one project at a time: free-tier LLMs are rate limited per minute)

const queue = []
let draining = false

async function runProject(id) {
  const p = await db.get(TABLE, id)
  if (!p) return
  const run = await db.insert('agent_runs', { user_id: p.user_id, agent: 'Product Studio', status: 'running' })
  const t0 = Date.now()
  let out, error
  try {
    await db.update(TABLE, id, { status: 'running', error: null, updated_at: now() })
    out = await ai('/studio/run', { project_id: id }, { timeout: 3 * 3600_000 })
  } catch (e) {
    error = e.message
    await db.update(TABLE, id, { status: 'failed', error: error.slice(0, 500), updated_at: now() }).catch(() => {})
  }
  await db.update('agent_runs', run.id, {
    status: error ? 'failed' : 'succeeded', mode: 'live', error: error ?? null, duration_ms: Date.now() - t0, finished_at: now(),
    output_summary: out ? `${p.name} · v${out.best_iteration} · ${out.average}/10` : null,
  }).catch(() => {})
}

async function drain() {
  if (draining) return
  draining = true
  try {
    while (queue.length) await runProject(queue.shift()).catch((e) => console.error('studio run failed:', e.message))
  } finally {
    draining = false
  }
}

const enqueue = (id) => {
  if (!queue.includes(id)) queue.push(id)
  drain()
}

// Jobs live in memory: requeue what never started; a run that was mid-flight when the server stopped can't be resumed.
if (supabase) {
  for (const p of await db.list(TABLE, { status: ['queued', 'running'] }, { ascending: true }).catch(() => [])) {
    if (p.status === 'queued') enqueue(p.id)
    else await db.update(TABLE, p.id, { status: 'failed', error: 'Interrupted by a server restart. Press Retry to run it again.' }).catch(() => {})
  }
}

// ---------------------------------------------------------------- helpers

const check = ({ data, error }) => {
  if (error) throw error
  return data
}

async function versionHtml(id, iteration) {
  const rows = check(await supabase.from('studio_artifacts').select('html:content->>html').eq('project_id', id).eq('kind', 'code').eq('iteration', iteration).limit(1))
  if (!rows.length) throw new HttpError(404, 'Version not found')
  return rows[0].html
}

const label = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
function md(v, d = 0) {
  const pad = '  '.repeat(d)
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? `${pad}-\n${md(x, d + 1)}` : `${pad}- ${x}`)).join('\n')
  if (v && typeof v === 'object') {
    return Object.entries(v).filter(([k]) => k !== 'reasoning').map(([k, x]) => (x && typeof x === 'object' ? `${pad}- **${label(k)}**\n${md(x, d + 1)}` : `${pad}- **${label(k)}:** ${x}`)).join('\n')
  }
  return `${pad}${v}`
}

const DOCS = [['product_spec', 'Product Requirements Document'], ['ux_blueprint', 'UX Blueprint'], ['design_research_report', 'Design Research Report'],
  ['design_spec', 'Design Spec'], ['technical_spec', 'Technical Spec'], ['frontend_architecture', 'Frontend Architecture']]
const REVIEWS = [['review_report', 'Vision Review'], ['design_feedback', 'Design Critic Feedback'], ['failure_report', 'Failure Report'], ['scores', 'Scores'], ['refinement', 'Refinement']]

// ---------------------------------------------------------------- routes

r.get('/studio/projects', async (req, res) => res.json(await db.list(TABLE, { user_id: req.user.id }, { limit: 100 })))

r.post('/studio/projects', async (req, res) => {
  const idea = text(req.body.idea)
  if (idea.length < 10) throw new HttpError(400, 'Describe the startup idea in a sentence or two')
  await requireQuota(req.user, 'agentRuns')
  const p = await db.insert(TABLE, {
    user_id: req.user.id, name: text(req.body.name, 80) || idea.split(/\s+/).slice(0, 3).join(' '), idea,
    audience: text(req.body.audience, 300) || null, industry: text(req.body.industry, 100) || null, requirements: text(req.body.requirements, 1500) || null,
    max_iterations: Math.min(5, Math.max(1, Number(req.body.max_iterations) || 3)), status: 'queued',
  })
  enqueue(p.id)
  res.status(201).json(p)
})

r.get('/studio/projects/:id', async (req, res) => {
  const project = await own(TABLE, req.params.id, req.user)
  const id = project.id
  const [events, artifacts, versions] = await Promise.all([
    supabase.from('studio_events').select('*').eq('project_id', id).order('created_at', { ascending: true }).then(check),
    supabase.from('studio_artifacts').select('id,kind,iteration,content,created_at').eq('project_id', id).neq('kind', 'code').order('created_at', { ascending: true }).then(check),
    supabase.from('studio_artifacts').select('iteration,created_at,summary:content->>summary,bytes:content->bytes').eq('project_id', id).eq('kind', 'code').order('iteration', { ascending: true }).then(check),
  ])
  res.json({ project, events, artifacts, versions })
})

r.get('/studio/projects/:id/versions/:iteration', async (req, res) => {
  const p = await own(TABLE, req.params.id, req.user)
  res.json({ html: await versionHtml(p.id, Number(req.params.iteration) || 1) })
})

r.get('/studio/projects/:id/export', async (req, res) => {
  const p = await own(TABLE, req.params.id, req.user)
  const iteration = Number(req.query.iteration) || p.best_iteration || p.iteration || 1
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prototype'
  const format = req.query.format
  if (format === 'html') {
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}-prototype.html"` })
    return res.send(await versionHtml(p.id, iteration))
  }
  const arts = check(await supabase.from('studio_artifacts').select('kind,iteration,content').eq('project_id', p.id).neq('kind', 'code').order('created_at', { ascending: true }))
  const latest = (kind, it) => arts.filter((a) => a.kind === kind && (it === undefined || a.iteration === it)).pop()?.content
  if (format === 'json') {
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${slug}-studio.json"` })
    return res.send(JSON.stringify({ project: p, artifacts: arts, final_iteration: iteration }, null, 2))
  }
  if (format !== 'md') throw new HttpError(400, 'format must be html, md or json')
  const parts = [`# ${p.name} — Product Studio report\n\n> ${p.idea}\n\nFinal prototype: version ${iteration}. Scores: ${Object.entries(p.scores || {}).map(([k, v]) => `${label(k)} ${v}/10`).join(', ') || 'n/a'}.`]
  for (const [kind, title] of DOCS) {
    const c = latest(kind, 0)
    if (c) parts.push(`## ${title}\n\n${c.reasoning ? `*Reasoning:* ${c.reasoning}\n\n` : ''}${md(c)}`)
  }
  for (const [kind, title] of REVIEWS) {
    for (const a of arts.filter((x) => x.kind === kind)) parts.push(`## ${title} (version ${a.iteration})\n\n${a.content.reasoning ? `*Reasoning:* ${a.content.reasoning}\n\n` : ''}${md(a.content)}`)
  }
  res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}-studio.md"` })
  res.send(parts.join('\n\n'))
})

r.post('/studio/projects/:id/retry', async (req, res) => {
  const p = await own(TABLE, req.params.id, req.user)
  if (p.status === 'running' || queue.includes(p.id)) throw new HttpError(409, 'This project is already running')
  await requireQuota(req.user, 'agentRuns')
  await db.remove('studio_events', { project_id: p.id })
  await db.remove('studio_artifacts', { project_id: p.id })
  await ai(`/studio/${p.id}`, undefined, { method: 'DELETE' }).catch((e) => console.error('studio purge failed:', e.message))
  const out = await db.update(TABLE, p.id, { status: 'queued', stage: null, iteration: 0, best_iteration: null, scores: {}, error: null, updated_at: now() })
  enqueue(p.id)
  res.json(out)
})

r.delete('/studio/projects/:id', async (req, res) => {
  const p = await own(TABLE, req.params.id, req.user)
  if (p.status === 'running') throw new HttpError(409, 'Wait for the run to finish (or fail) before deleting')
  const i = queue.indexOf(p.id)
  if (i >= 0) queue.splice(i, 1)
  await db.remove(TABLE, { id: p.id })
  await ai(`/studio/${p.id}`, undefined, { method: 'DELETE' }).catch((e) => console.error('studio purge failed:', e.message))
  res.json({ ok: true })
})

export default r
