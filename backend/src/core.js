// Auth, plans/quotas, AI client, and the side effects every agent run shares (runs, memory, activity, notifications).
import { db, supabase } from './db.js'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------- auth

const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'founder@forge.local', full_name: 'Demo Founder' }

async function ensureUser({ id, email, full_name }) {
  return (await db.get('users', id)) ?? db.insert('users', {
    id, email, full_name: full_name || email?.split('@')[0], founder_profile: {}, plan: 'free',
    settings: { daily_monitoring: true },
  })
}

const ADMINS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean)
export const isAdmin = (user) => !!user.email && ADMINS.includes(user.email.toLowerCase())

export async function auth(req, res, next) {
  if (!supabase) {
    req.user = await ensureUser(DEMO_USER)
    return next()
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Sign in required' })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Session expired' })
  req.user = await ensureUser({ id: data.user.id, email: data.user.email, full_name: data.user.user_metadata?.full_name })
  next()
}

export async function own(table, id, user) {
  const row = await db.get(table, id)
  if (!row || row.user_id !== user.id) throw new HttpError(404, 'Not found')
  return row
}

// ---------------------------------------------------------------- plans (billing-ready: swap plan via Stripe webhook)

export const PLANS = {
  free: { name: 'Free', price: 0, ventures: 3, agentRuns: 150 },
  pro: { name: 'Pro', price: 49, ventures: 25, agentRuns: 3000 },
  studio: { name: 'Studio', price: 199, ventures: Infinity, agentRuns: 20000 },
}

export async function usage(user) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  return {
    ventures: await db.count('ventures', { user_id: user.id }),
    agentRuns: await db.count('agent_runs', { user_id: user.id, created_at: { gte: monthStart } }),
  }
}

export async function requireQuota(user, key) {
  const plan = PLANS[user.plan] ?? PLANS.free
  if ((await usage(user))[key] >= plan[key]) {
    throw new HttpError(402, `Your ${plan.name} plan allows ${plan[key]} ${key === 'ventures' ? 'ventures' : 'agent runs per month'}. Upgrade in Settings.`)
  }
}

// ---------------------------------------------------------------- AI service

const AI_URL = process.env.AI_URL || 'http://localhost:8000'
const aiHeaders = { 'content-type': 'application/json', ...(process.env.AI_INTERNAL_KEY && { 'x-internal-key': process.env.AI_INTERNAL_KEY }) }

export async function ai(path, body, { method = body === undefined ? 'GET' : 'POST', raw = false, timeout = 300_000 } = {}) {
  let res
  try {
    res = await fetch(AI_URL + path, { method, headers: aiHeaders, body: body && JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
  } catch (e) {
    if (e.name === 'TimeoutError') throw new HttpError(504, 'The AI service took too long to answer (the free AI models may be rate limited). Please try again in a minute.')
    throw new HttpError(503, `AI service unreachable at ${AI_URL} (${e.cause?.code || e.name}). Start it with: npm run dev:ai`)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new HttpError([422, 503].includes(res.status) ? res.status : 502, err.detail || `AI service error ${res.status}`)
  }
  if (raw) return res
  const data = await res.json()
  // Long jobs stream whitespace keep-alives, so failures arrive inside the body instead of as a status code.
  if (data?.__error) throw new HttpError([422, 503].includes(data.__status) ? data.__status : 502, data.__error)
  return data
}

export const ventureCtx = (v) => ({ id: v.id, name: v.name, idea: v.idea, stage: v.stage, overall_score: v.overall_score, scores: v.scores })

export async function runAgent(user, ventureId, agent, path, body, summarize = () => null) {
  await requireQuota(user, 'agentRuns')
  const run = await db.insert('agent_runs', { user_id: user.id, venture_id: ventureId, agent, status: 'running' })
  const t0 = Date.now()
  try {
    const out = await ai(path, body)
    await db.update('agent_runs', run.id, {
      status: 'succeeded', mode: out.mode, output_summary: summarize(out), duration_ms: Date.now() - t0, finished_at: new Date().toISOString(),
    })
    return out
  } catch (e) {
    await db.update('agent_runs', run.id, { status: 'failed', error: e.message, duration_ms: Date.now() - t0, finished_at: new Date().toISOString() })
    throw e
  }
}

// ---------------------------------------------------------------- shared side effects

export async function remember(user, ventureId, kind, title, content, metadata = {}) {
  const m = await db.insert('venture_memory', { user_id: user.id, venture_id: ventureId, kind, title, content, metadata })
  ai('/memory/add', { venture_id: ventureId, id: m.id, kind, title, content }).catch((e) => console.error('memory index failed:', e.message))
  return m
}

export const log = (user, ventureId, actor, action, detail = null, metadata = {}) =>
  db.insert('activity_logs', { user_id: user.id, venture_id: ventureId, actor, action, detail, metadata })

export const notify = (user, ventureId, type, title, body = null, link = null) =>
  db.insert('notifications', { user_id: user.id, venture_id: ventureId, type, title, body, link, read: false })

export async function latestReport(ventureId, kind) {
  return (await db.list('research_reports', { venture_id: ventureId, kind }, { limit: 1 }))[0] ?? null
}
