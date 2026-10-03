// Founder Copilot — cross-venture AI Chief of Staff.
//
// POST /copilot/ask   { question, page_context?, page_label?, venture_id?, history? }
//   → { answer, evidence, recommendation, ventures_mentioned }
//
// POST /copilot/index  { venture_id }   (internal: re-index a venture's data into the knowledge base)
// GET  /copilot/messages                (last 50 messages for the current user)

import { Router } from 'express'
import { db } from '../db.js'
import { ai, HttpError } from '../core.js'
import { aiContext, gather, readiness } from './command.js'

const r = Router()
const DAY = 864e5
const MAX_FULL = 12 // ventures gathered in full; any beyond this are listed by name only

// ---------------------------------------------------------------- which venture is the question about?

// Words too common to identify a venture on their own ("first" in "Voice-first CRM").
const STOP = new Set('for the and with your app ai first best new my our you can how what who why when where which that this from all any get has are was not but one two more most last next top build make use using venture ventures startup startups idea ideas product products market platform company business customer customers user users tool tools service data'.split(' '))
const words = (s) => String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
const squash = (s) => words(s).join('')

/** Ventures the text names: the whole name ("campus cart"), or a word only that venture uses ("crm"). */
function mentioned(text, ventures) {
  const flat = squash(text), said = new Set(words(text))
  const uses = {}
  for (const v of ventures) for (const t of new Set(words(v.name))) uses[t] = (uses[t] ?? 0) + 1
  return ventures.filter((v) => {
    const name = squash(v.name).replace(/for$/, '') // names are cut mid-sentence ("Voice-first CRM for")
    return (name.length >= 3 && flat.includes(name)) || words(v.name).some((t) => t.length >= 3 && !STOP.has(t) && uses[t] === 1 && said.has(t))
  })
}

// ponytail: stage/score heuristic for "the venture you most likely mean"; ask the model to confirm in its reply.
const STAGE_RANK = { launched: 5, building: 4, validating: 3, idea: 2, paused: 1, killed: 0 }
const mostAdvanced = (ventures) => [...ventures].sort((a, b) => (STAGE_RANK[b.stage] ?? 0) - (STAGE_RANK[a.stage] ?? 0) || (b.overall_score ?? 0) - (a.overall_score ?? 0))[0]

// ---------------------------------------------------------------- context

const SCORES = ['demand', 'competition', 'defensibility', 'revenue_potential', 'founder_fit']
const cut = (t, n) => (t == null ? t : String(t).slice(0, n))

/** One line per venture: enough to compare, rank and spot risks across the whole portfolio. */
function compact(d, rd) {
  const { v, val, board, experiments, competitors, signals, memory } = d
  const vc = val?.content
  return {
    id: v.id, name: v.name, idea: cut(v.idea, 160), stage: v.stage, overall_score: v.overall_score, verdict: v.verdict,
    validated: !!val, scores: vc && Object.fromEntries(SCORES.filter((k) => vc[k]).map((k) => [k, vc[k].score])),
    top_risk: vc?.key_risks?.[0], board: board && { decision: board.decision, confidence: board.confidence },
    competitors_tracked: competitors.length, experiments: experiments.length, market_signals: signals.length, memory_notes: memory.length,
    launch_readiness: rd.overallReadinessScore, still_missing: Object.values(rd.details).flatMap((x) => x.missing).slice(0, 4),
  }
}

/** Everything known about one venture: validation, board, competitors, MVP, notes, decisions, assumptions, signals. */
async function detailed(d, rd, question) {
  const { v, mvp, proto, signals, memory } = d
  const m = mvp?.content, rec = m?.strategy?.recommendation
  const [hits, journal, validated, failed, gtm] = await Promise.all([
    ai('/memory/search', { venture_id: v.id, query: question, k: 5 }, { timeout: 12_000 }).then((o) => o.results).catch(() => []),
    ...['decision_journal', 'validated_assumptions', 'failed_assumptions'].map((t) => db.list(t, { venture_id: v.id }, { limit: 6 }).catch(() => [])),
    db.list('gtm_runs', { venture_id: v.id }, { limit: 1 }).catch(() => []),
  ])
  const notes = hits.length ? hits.map((h) => ({ kind: h.kind, title: h.title, text: cut(h.text, 320) })) : memory.slice(0, 5).map((n) => ({ kind: n.kind, title: n.title, text: cut(n.content, 320) }))
  return {
    ...aiContext(d, rd),
    mvp: m && {
      summary: m.summary, stack: m.stack, monthly_cost: m.monthly_cost_estimate,
      features: m.features?.slice(0, 14).map((f) => `${f.name} (${f.priority}, effort ${f.effort}): ${cut(f.reason, 90)}`),
      headline: rec?.headline, prioritize: rec?.prioritize, delay: rec?.delay, biggest_challenge: rec?.biggest_challenge,
      avoid: m.strategy?.avoid, risks: m.strategy?.risks?.slice(0, 5), sprints: m.sprint_plan?.map((s) => `Sprint ${s.sprint}: ${s.goal}`),
    },
    prototype: proto?.content?.html ? { built: true, quality: proto.content.studio_score, summary: cut(proto.content.summary, 300) } : { built: false },
    go_to_market: gtm[0] ? { status: gtm[0].status, launch_score: gtm[0].launch_score } : null,
    market_signals: signals.slice(0, 6).map((s) => ({ type: s.type, title: s.title, severity: s.severity, response: cut(s.recommended_response, 160) })),
    memory_notes: notes,
    decisions: journal.map((j) => ({ decision: j.decision, why: cut(j.why, 200) })),
    validated_assumptions: validated.map((a) => ({ statement: a.statement, confidence: a.confidence })),
    failed_assumptions: failed.map((a) => ({ statement: a.statement, reason: cut(a.reason, 160) })),
  }
}

async function recentActivity(user, ventures) {
  const name = Object.fromEntries(ventures.map((v) => [v.id, v.name]))
  const rows = await db.list('activity_logs', { user_id: user.id, created_at: { gte: new Date(Date.now() - 7 * DAY).toISOString() } }, { limit: 12 }).catch(() => [])
  return rows.map((a) => ({ date: a.created_at.slice(0, 10), venture: name[a.venture_id], by: a.actor, action: a.action, detail: cut(a.detail, 120) }))
}

async function buildContext(user, question, history, venture_id) {
  const ventures = await db.list('ventures', { user_id: user.id }, { limit: 50 })
  const full = await Promise.all(ventures.slice(0, MAX_FULL).map(async (v) => { const d = await gather(v); return { d, rd: readiness(d) } }))

  // Venture(s) in question: named now, else named in the last few turns, else the one open on screen, else the most advanced.
  const pick = (ids) => full.filter((x) => ids.some((v) => v.id === x.d.v.id))
  const asked = pick(mentioned(question, ventures))
  const recent = history.filter((h) => h.role === 'user').slice(-3).reverse().map((h) => pick(mentioned(h.content, ventures))).find((x) => x.length)
  const onPage = pick(ventures.filter((v) => v.id === venture_id))
  const focus = (asked.length ? asked : recent ?? (onPage.length ? onPage : pick([mostAdvanced(full.map((x) => x.d.v))].filter(Boolean)))).slice(0, 2)

  return {
    ventures: [...full.map((x) => compact(x.d, x.rd)), ...ventures.slice(MAX_FULL).map((v) => ({ name: v.name, stage: v.stage, overall_score: v.overall_score }))],
    detailed: await Promise.all(focus.map((x) => detailed(x.d, x.rd, question))),
    recent_activity: await recentActivity(user, ventures),
    focus_names: focus.map((x) => x.d.v.name),
    named: asked.map((x) => x.d.v.name),
  }
}

// ---------------------------------------------------------------- main ask route

/** "for campuscart" right after "should I change my MVP?" answers that question: fold the venture into the previous one. */
async function withPreviousTopic(user, question, turns) {
  const prev = turns.filter((t) => t.role === 'user').at(-1)
  if (!prev || words(question).length > 5) return question
  const ventures = await db.list('ventures', { user_id: user.id }, { limit: 50 })
  const named = mentioned(question, ventures)
  return named.length && !mentioned(prev.content, ventures).length ? `${prev.content} (for ${named.map((v) => v.name).join(' and ')})` : question
}

const cleanHistory = (h) => (Array.isArray(h) ? h : [])
  .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
  .slice(-8).map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) }))

r.post('/copilot/ask', async (req, res) => {
  const { page_context, page_label, venture_id, history } = req.body ?? {}
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 2000) : ''
  if (!question) throw new HttpError(400, 'question is required')
  const turns = cleanHistory(history)
  const asked = await withPreviousTopic(req.user, question, turns)

  const ctx = await buildContext(req.user, asked, turns, venture_id)
  let out
  try {
    const page = { slug: page_context ?? 'dashboard', name: page_label ?? 'Dashboard' }
    out = await ai('/copilot/answer', { question: asked, page, ventures: ctx.ventures, detailed: ctx.detailed, recent_activity: ctx.recent_activity, history: turns }, { timeout: 60_000 })
    if (!out?.answer?.trim()) throw new Error('empty answer')
  } catch (e) {
    console.error('copilot: AI answer failed, using rule-based fallback:', e.message)
    out = ruleBasedAnswer(asked, ctx, page_label)
  }

  // Sequential so the pair keeps its order in the history; a storage hiccup must not lose the answer.
  try {
    await db.insert('copilot_messages', { user_id: req.user.id, role: 'user', content: question, metadata: { page_context } })
    await db.insert('copilot_messages', { user_id: req.user.id, role: 'assistant', content: out.answer, metadata: { ventures: ctx.focus_names } })
  } catch (e) {
    console.error('copilot: could not save messages:', e.message)
  }

  res.json({ answer: out.answer, evidence: out.evidence ?? [], recommendation: out.recommendation ?? '', ventures_mentioned: out.ventures_mentioned ?? ctx.named })
})

// ---------------------------------------------------------------- rule-based fallback (AI service down or rate limited)
// Still answers from the founder's own data; never a dead end.

const has = (q, re) => re.test(q.toLowerCase())
const line = (v) => `**${v.name}** (${v.stage}${v.overall_score != null ? `, ${v.overall_score}/100` : ', not validated yet'})`

function ruleBasedAnswer(question, ctx, page_label) {
  const { ventures, detailed: det } = ctx
  const q = question.toLowerCase()
  if (!ventures.length) {
    return { answer: "You haven't created a venture yet. Click **New venture** and I'll be able to compare, stress-test and plan next steps with real data.", evidence: [], recommendation: 'Create your first venture.' }
  }
  const best = [...ventures].sort((a, b) => (b.launch_readiness ?? 0) - (a.launch_readiness ?? 0) || (b.overall_score ?? 0) - (a.overall_score ?? 0))[0]
  // A venture snapshot only when the question names one; the default subject would hijack "compare" or "risks".
  const f = det.find((d) => ctx.named.includes(d.venture?.name))
  const focus = f && ventures.find((v) => v.name === f.venture.name)

  if (has(q, /^\s*(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you)\b/)) {
    return { answer: `Hi! You have ${ventures.length} venture${ventures.length > 1 ? 's' : ''}; **${best.name}** is the furthest along (${best.launch_readiness}% launch-ready). Want its next steps, or a comparison of all of them?`, evidence: [], recommendation: '' }
  }
  if (has(q, /what page|which page|where am i|what screen/)) {
    return { answer: `You're on the **${page_label ?? 'Dashboard'}** page. From here I can still answer questions about any of your ventures.`, evidence: [], recommendation: '' }
  }
  if (focus) {
    const steps = focus.still_missing.length ? focus.still_missing.map((m, i) => `${i + 1}. ${m}`).join('\n') : 'Everything on the launch checklist is done. Keep measuring real demand.'
    const mvp = f.mvp?.headline && /mvp|feature|build|scope/.test(q) ? `\n\nOn the MVP: ${f.mvp.headline}` : ''
    return {
      answer: `Here's where **${focus.name}** stands: ${focus.stage}, ${focus.overall_score != null ? `validation score ${focus.overall_score}/100` : 'not validated yet'}${focus.board ? `, Boardroom said ${focus.board.decision} at ${focus.board.confidence}% confidence` : ''}, ${focus.launch_readiness}% launch-ready.${focus.top_risk ? `\n\nBiggest risk: ${focus.top_risk}` : ''}${mvp}\n\nWhat's still missing:\n${steps}`,
      evidence: [`${focus.name}: ${focus.overall_score ?? '—'}/100`, `Launch readiness ${focus.launch_readiness}%`],
      recommendation: focus.still_missing[0] ?? 'Keep running experiments.',
    }
  }
  if (has(q, /compar|rank|strongest|weakest|best|worst|which/)) {
    const sorted = [...ventures].sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1))
    return { answer: `Here's how your ventures stack up:\n\n${sorted.map((v) => `- ${line(v)}, ${v.launch_readiness}% launch-ready`).join('\n')}`, evidence: [], recommendation: `${sorted[0].name} leads; ${sorted.at(-1).name} needs the most work.` }
  }
  if (has(q, /risk|danger|threat|worr|concern|blocker/)) {
    const risks = ventures.filter((v) => v.top_risk).map((v) => `- **${v.name}**: ${v.top_risk}`)
    return { answer: risks.length ? `Your top risk per venture:\n\n${risks.join('\n')}` : 'No venture has been validated yet, so the biggest risk is building before you know what people want. Run validation first.', evidence: [], recommendation: 'Test the riskiest assumption cheaply before building more.' }
  }
  const dodge = has(q, /joke|weather|news|stock|bitcoin|crypto|recipe|movie|sport/) ? "That one's outside my lane, but here's something I can sharpen. " : ''
  return {
    answer: `${dodge}You have ${ventures.length} venture${ventures.length > 1 ? 's' : ''}: ${ventures.map(line).join(', ')}.\n\nThe next best move is on **${best.name}**: ${best.still_missing?.[0] ?? 'keep measuring real demand'}.`,
    evidence: [], recommendation: best.still_missing?.[0] ?? '',
  }
}

// ---------------------------------------------------------------- chat history

r.get('/copilot/messages', async (req, res) => {
  const messages = await db.list('copilot_messages', { user_id: req.user.id }, { limit: 50, order: 'created_at', ascending: false })
  res.json(messages.reverse())
})

// ---------------------------------------------------------------- index endpoint (called by other agents to write knowledge)

r.post('/copilot/index', async (req, res) => {
  const { venture_id, source_type, source_module, title, content, metadata = {} } = req.body ?? {}
  if (!venture_id || !source_type || !title || !content) throw new HttpError(400, 'venture_id, source_type, title, content required')

  // Verify venture ownership
  const v = await db.get('ventures', venture_id)
  if (!v || v.user_id !== req.user.id) throw new HttpError(404, 'Not found')

  const entry = await db.insert('venture_knowledge_base', {
    user_id: req.user.id, venture_id, source_type, source_module: source_module ?? source_type, title, content, metadata,
  })

  // Fire-and-forget embedding via AI service
  fetch(`${process.env.AI_URL || 'http://localhost:8000'}/copilot/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.AI_INTERNAL_KEY && { 'x-internal-key': process.env.AI_INTERNAL_KEY }) },
    body: JSON.stringify({ id: entry.id, content }),
  }).catch((e) => console.error('copilot embed failed:', e.message))

  res.status(201).json({ id: entry.id })
})

export default r
