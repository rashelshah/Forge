// Venture command centre: Founder Brief, Next Recommended Actions and Launch Readiness for the Overview page.
// Readiness is computed here from the modules' existing outputs (no separate data). The brief and actions are written by the
// Chief of Staff agent and cached; until it has run, or if it fails, honest rule-based versions built from the same data are served.
import crypto from 'node:crypto'
import { Router } from 'express'
import { db } from '../db.js'
import { latestReport, own, runAgent } from '../core.js'

const r = Router()
const now = () => new Date().toISOString()
const DAY = 864e5
const WEIGHTS = { validation: 0.2, research: 0.1, competitors: 0.15, boardroom: 0.15, prototype: 0.2, experiments: 0.2 }
const STAGE_FOCUS = { idea: ['validation', 'research'], validating: ['validation', 'competitors', 'boardroom', 'research'], building: ['prototype', 'experiments'], launched: ['experiments'], paused: [], killed: [] }
const SCORE_LABEL = { demand: 'Demand', competition: 'Competition', defensibility: 'Defensibility', revenue_potential: 'Revenue potential', founder_fit: 'Founder fit' }

// ---------------------------------------------------------------- data

async function gather(v) {
  const [reports, sessions, exps, competitors, signals, memory] = await Promise.all([
    db.list('research_reports', { venture_id: v.id }, { limit: 200 }), db.list('boardroom_sessions', { venture_id: v.id }, { limit: 20 }),
    db.list('experiments', { venture_id: v.id }, { limit: 50 }), db.list('competitors', { venture_id: v.id }),
    db.list('market_signals', { venture_id: v.id }, { limit: 50 }), db.list('venture_memory', { venture_id: v.id }, { limit: 100 }),
  ])
  const experiments = await Promise.all(exps.map(async (e) => ({ ...e, visitors: await db.count('experiment_events', { experiment_id: e.id, type: 'visit' }), signups: await db.count('experiment_events', { experiment_id: e.id, type: 'signup' }) })))
  const latest = (kind) => reports.find((x) => x.kind === kind)
  const done = sessions.filter((s) => s.status === 'completed' && s.verdict)
  return {
    v, val: latest('validation'), mvp: latest('mvp'), proto: latest('prototype'), intel: latest('intel'), analyses: reports.filter((x) => x.kind === 'experiment_analysis'),
    sessions: done, board: done[0]?.verdict, experiments, competitors, signals, memory,
  }
}

// ---------------------------------------------------------------- readiness (one list of requirements drives progress, gaps and fallback actions)

const need = (label, met, title, description, source) => ({ label, met: !!met, action: { title, description, source } })

function categories(d) {
  const { v, val, mvp, proto, intel, board, experiments, competitors, signals, memory, analyses } = d
  const vc = val?.content
  const scores = Object.keys(SCORE_LABEL).filter((k) => vc?.[k])
  const weakest = scores.sort((a, b) => vc[a].score - vc[b].score)[0]
  const evidenced = scores.filter((k) => vc[k].evidence?.length).length
  const researchNotes = memory.filter((m) => m.kind === 'research').length
  const visitors = Math.max(0, ...experiments.map((e) => e.visitors))
  const intelAge = intel?.content?.generated_at ? (Date.now() - new Date(intel.content.generated_at).getTime()) / DAY : Infinity
  const studioScore = proto?.content?.studio_score
  const testing = experiments.some((e) => e.type === 'prototype' && e.status !== 'draft')
  const outcomes = analyses.map((a) => a.content?.outcome)
  return {
    validation: { tab: 'overview', reqs: [
      need('Run validation', val, 'Run validation', 'Score demand, competition, defensibility, revenue potential and founder fit, each backed by cited evidence.', 'Validation Agent'),
      need('Overall score of 60+', (v.overall_score ?? 0) >= 60, `Raise your ${weakest ? SCORE_LABEL[weakest].toLowerCase() : 'validation'} score`, weakest ? `${SCORE_LABEL[weakest]} is your weakest score (${vc[weakest].score}/100): ${vc[weakest].summary}` : 'The overall score is below 60 — find out what is dragging it down.', 'Validation Agent'),
      need('Evidence for at least 3 of 5 scores', evidenced >= 3, 'Gather evidence for every score', `Only ${evidenced} of 5 scores cite evidence. Re-run validation with web research enabled or add your own findings to memory.`, 'Validation Agent'),
      need('Key risks identified', vc?.key_risks?.length, 'Write down your key risks', 'List what would make this venture fail so you can test the riskiest assumption first.', 'Validation Agent'),
    ], current: val ? `Score ${v.overall_score ?? '—'}/100 · ${evidenced} of 5 scores evidenced · ${vc.key_risks?.length ?? 0} risks listed` : 'Not validated yet' },
    research: { tab: 'memory', reqs: [
      need('Opportunity research', v.opportunity, 'Document the opportunity', 'Capture the problem, who has it, how often and how big the market is.', 'Research Agent'),
      need('3+ research notes in memory', researchNotes >= 3, 'Record what you learn about customers', `You have ${researchNotes} research note(s). Add interview takeaways and findings so every agent can use them.`, 'Research Agent'),
      need('Market monitoring active', signals.length >= 1, 'Run a market monitoring sweep', 'Watch news and community chatter for demand signals and shifts.', 'Research Agent'),
      need('3+ web sources cited', (vc?.web_sources ?? 0) >= 3, 'Back your claims with sources', `Validation cited ${vc?.web_sources ?? 0} web source(s). Connect search and re-run validation to ground it in the market.`, 'Research Agent'),
    ], current: `${researchNotes} research notes · ${signals.length} market signals · ${vc?.web_sources ?? 0} web sources cited` },
    competitors: { tab: 'competitors', reqs: [
      need('Track 3+ competitors', competitors.length >= 3, 'Track at least three competitors', `You are tracking ${competitors.length}. Add the products your customers use today, including informal alternatives.`, 'Competitor Agent'),
      need('Competitive analysis run', intel?.content?.brief, 'Run the competitive analysis', 'Get the weekly brief, feature gaps and recommended actions.', 'Competitor Agent'),
      need('White space identified', intel?.content?.radar?.white_space?.length, 'Find your white space', 'Identify the features no tracked competitor offers and decide which one to lead with.', 'Competitor Agent'),
      need('Analysis refreshed in the last 14 days', intelAge <= 14, 'Refresh the competitive analysis', 'Competitor moves go stale quickly; re-run the analysis to catch price and feature changes.', 'Competitor Agent'),
    ], current: `${competitors.length} tracked · ${intel?.content?.brief ? `analysis ${Math.max(0, Math.round(intelAge))}d old` : 'no analysis yet'}${intel?.content?.radar?.white_space?.length ? ` · ${intel.content.radar.white_space.length} white-space features` : ''}` },
    boardroom: { tab: 'boardroom', reqs: [
      need('Boardroom session held', board, 'Put your venture in front of the Boardroom', 'Six agents debate your idea; you get a GO / PIVOT / KILL verdict with objections to address.', 'Boardroom Agent'),
      need('Board verdict is GO or PIVOT', board && board.decision !== 'KILL', 'Address the board\'s objections', board ? `The board voted ${board.decision}. ${board.disagreements?.[0] ?? board.summary}` : 'Hold a session first.', 'Boardroom Agent'),
      need('Board confidence 60%+', (board?.confidence ?? 0) >= 60, 'Test the board\'s critical assumptions', board?.critical_assumptions?.[0] ? `Test: ${board.critical_assumptions[0].assumption} — ${board.critical_assumptions[0].test}` : 'Raise confidence by testing the riskiest assumptions.', 'Boardroom Agent'),
    ], current: board ? `${board.decision} at ${board.confidence}% confidence` : 'No boardroom session yet' },
    prototype: { tab: 'prototype', reqs: [
      need('MVP plan created', mvp, 'Finalize the MVP scope', 'Generate the MVP blueprint: must-have features, user stories, schema and a sprint plan.', 'MVP Architect'),
      need('Prototype built', proto?.content?.html, 'Build the interactive prototype', 'Let the Product Studio team design, build, review and refine a working prototype.', 'Product Studio'),
      need('Prototype reviewed (quality 7+/10)', (studioScore ?? 0) >= 7, 'Improve the prototype quality', studioScore ? `The prototype scored ${studioScore}/10. Use "Change anything" to fix the weakest screens.` : 'Build it with the Product Studio to get a reviewed quality score.', 'Product Studio'),
      need('Shared with testers', testing, 'Put the prototype in front of real users', 'Launch a prototype test and share the link with target customers.', 'Experiment Agent'),
    ], current: `${mvp ? 'MVP plan ready' : 'No MVP plan'} · ${proto?.content?.html ? `prototype built${studioScore ? ` (quality ${studioScore}/10)` : ''}` : 'no prototype yet'}` },
    experiments: { tab: 'experiments', reqs: [
      need('Experiment launched', experiments.length, 'Launch your first experiment', 'Test one risky assumption with real people: a prototype test, landing page or interviews.', 'Experiment Agent'),
      need('30+ visitors', visitors >= 30, 'Drive traffic to your experiment', `The busiest experiment has ${visitors} visitor(s). Share it in the communities where your customers are.`, 'Experiment Agent'),
      need('Results analysed', analyses.length, 'Analyse your experiment results', 'Let the Experiment Analyst judge whether the hypothesis held.', 'Experiment Agent'),
      need('Hypothesis validated', outcomes.includes('validated'), 'Validate willingness to pay', 'Run an experiment that asks for a real commitment (pre-order, waitlist with price, deposit).', 'Experiment Agent'),
    ], current: `${experiments.length} experiment(s) · ${visitors} visitors in the busiest${outcomes.length ? ` · ${outcomes.filter((o) => o === 'validated').length} validated` : ''}` },
  }
}

function readiness(d) {
  const cats = categories(d)
  const details = Object.fromEntries(Object.entries(cats).map(([k, c]) => {
    const met = c.reqs.filter((x) => x.met).length
    const progress = Math.round((100 * met) / c.reqs.length)
    return [k, { progress, status: progress === 100 ? 'complete' : progress === 0 ? 'not_started' : 'in_progress', current: c.current, missing: c.reqs.filter((x) => !x.met).map((x) => x.label), tab: c.tab }]
  }))
  const overallReadinessScore = Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + w * details[k].progress, 0))
  return { ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, details[k].progress])), overallReadinessScore, details, _cats: cats }
}

// ---------------------------------------------------------------- rule-based fallback (same data, no AI)

/** First sentence(s) of a long text, up to ~limit characters. */
const short = (t, limit = 230) => {
  const out = []
  for (const sent of String(t).match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [t]) {
    if (out.join('').length + sent.length > limit && out.length) break
    out.push(sent)
  }
  return out.join('').trim()
}

function fallback(d, rd) {
  const { v, val, board, intel } = d
  const vc = val?.content
  const modulesDone = Object.values(rd.details).filter((x) => x.progress > 0).length
  const status = !val ? 'Not validated yet' : (v.overall_score ?? 0) < 40 || board?.decision === 'KILL' ? 'At risk'
    : rd.overallReadinessScore >= 85 ? 'Ready to launch' : (v.overall_score ?? 0) >= 60 && board?.decision !== 'PIVOT' ? 'Promising' : 'Needs evidence'
  const focus = STAGE_FOCUS[v.stage] ?? []
  const open = Object.entries(rd._cats).flatMap(([cat, c]) => c.reqs.filter((x) => !x.met).map((x) => ({ cat, ...x.action, tab: c.tab })))
  const rank = (cat) => (focus.includes(cat) ? focus.indexOf(cat) : 10 + Object.keys(WEIGHTS).indexOf(cat))
  const sorted = open.sort((a, b) => rank(a.cat) - rank(b.cat))
  const actions = sorted.slice(0, 5).map((a, i) => ({ title: a.title, description: a.description, priority: focus.includes(a.cat) ? (i < 2 ? 'High' : 'Medium') : 'Low', source: a.source }))
  if (!actions.length) actions.push({ title: 'Keep measuring real demand', description: 'Every readiness requirement is met. Keep running experiments and track activation and retention.', priority: 'Medium', source: 'Experiment Agent' })
  const weakest = Object.keys(SCORE_LABEL).filter((k) => vc?.[k]).sort((a, b) => vc[a].score - vc[b].score)[0]
  return {
    brief: {
      status,
      opportunity: v.opportunity?.problem ? `${v.opportunity.problem}${v.opportunity.potential_customers ? ` Customers: ${v.opportunity.potential_customers}.` : ''}` : vc?.demand?.summary ?? v.idea,
      risk: vc?.key_risks?.[0] ?? (weakest ? `${SCORE_LABEL[weakest]} is the weakest area (${vc[weakest].score}/100): ${vc[weakest].summary}` : 'No validation yet, so the biggest risk is building something nobody wants.'),
      recommendation: board?.decision === 'KILL'
        ? `The Boardroom voted to stop (${board.confidence}% confidence). Before investing more, ${board.critical_assumptions?.[0] ? `test the riskiest assumption cheaply: ${board.critical_assumptions[0].test}` : 'decide whether a pivot is worth a small, time-boxed test.'}`
        : short(intel?.content?.insight?.recommendation ?? '') || `Focus next on “${actions[0].title.toLowerCase()}”: ${actions[0].description}`,
      confidence: Math.max(10, Math.min(95, Math.round(0.6 * (v.overall_score ?? 30) + 0.4 * rd.overallReadinessScore) - (modulesDone < 3 ? 10 : 0))),
    },
    actions,
  }
}

// ---------------------------------------------------------------- AI synthesis

const signature = (d) => crypto.createHash('sha1').update(JSON.stringify([
  d.v.stage, d.val?.id, d.val?.created_at, d.mvp?.id, d.proto?.created_at, d.proto?.content?.studio_score, d.intel?.created_at, d.sessions.map((s) => s.id),
  d.experiments.map((e) => [e.id, e.status, e.visitors, e.signups]), d.analyses.length, d.competitors.length,
])).digest('hex').slice(0, 16)

function aiContext(d, rd) {
  const { v, val, mvp, proto, intel, board, experiments, competitors, analyses } = d
  const vc = val?.content, ic = intel?.content
  return {
    venture: { name: v.name, idea: v.idea, stage: v.stage, overall_score: v.overall_score, verdict: v.verdict },
    opportunity: v.opportunity && { problem: v.opportunity.problem, frequency: v.opportunity.frequency, pain_level: v.opportunity.pain_level, market_size: v.opportunity.market_size, customers: v.opportunity.potential_customers },
    validation: vc && { summary: vc.summary, verdict: vc.verdict, scores: Object.fromEntries(Object.keys(SCORE_LABEL).filter((k) => vc[k]).map((k) => [k, { score: vc[k].score, summary: vc[k].summary }])), key_risks: vc.key_risks, web_sources: vc.web_sources },
    competitors: { tracked: competitors.map((c) => ({ name: c.name, threat: c.strategic_threat ?? c.threat_level })), weekly_recommendation: ic?.brief?.recommendation, strategic_insight: ic?.insight?.insight, top_actions: ic?.actions?.slice(0, 3).map((a) => a.title), white_space: ic?.radar?.white_space?.map((w) => w.feature) },
    boardroom: board && { decision: board.decision, confidence: board.confidence, summary: board.summary, disagreements: board.disagreements, critical_assumptions: board.critical_assumptions, next_steps: board.next_steps },
    mvp: mvp && { summary: mvp.content?.summary, must_have: mvp.content?.features?.filter((f) => f.priority === 'must').map((f) => f.name) },
    prototype: proto?.content?.html ? { built: true, quality: proto.content.studio_score } : { built: false },
    experiments: experiments.map((e) => ({ name: e.name, type: e.type, status: e.status, visitors: e.visitors, signups: e.signups, target_conversion: e.target_conversion, result: e.result })),
    readiness: { overall: rd.overallReadinessScore, by_module: Object.fromEntries(Object.entries(rd.details).map(([k, x]) => [k, x.progress])), readiness_missing: Object.fromEntries(Object.entries(rd.details).map(([k, x]) => [k, x.missing])) },
  }
}

async function synthesize(user, v, rep, d, rd, sig) {
  try {
    const out = await runAgent(user, v.id, 'Chief of Staff', '/chief/brief', { context: aiContext(d, rd) }, (o) => `${o.brief.status} · ${o.brief.confidence}% confidence`)
    const cap = 40 + 10 * Object.values(rd.details).filter((x) => x.progress > 0).length // little evidence caps confidence
    const seen = new Set()
    const actions = out.actions.filter((a) => a.title && !seen.has(a.title.toLowerCase()) && seen.add(a.title.toLowerCase())).slice(0, 6)
    let highs = 0
    for (const a of actions) if (a.priority === 'High' && ++highs > 2) a.priority = 'Medium'
    // The model may not paint a positive picture against negative evidence.
    const negative = d.board?.decision === 'KILL' || (d.v.overall_score ?? 100) < 40
    if (!d.val) out.brief.status = 'Not validated yet'
    else if (negative) out.brief.status = 'At risk'
    await db.update('research_reports', rep.id, {
      title: `Founder brief · ${v.name}`, summary: out.brief.recommendation.slice(0, 280), created_at: now(),
      content: { brief: { ...out.brief, confidence: Math.min(out.brief.confidence, cap) }, actions, signature: sig, generated_at: now(), build: null },
    })
  } catch (e) {
    await db.update('research_reports', rep.id, { content: { ...rep.content, build: { status: 'error', error: e.message.slice(0, 300), signature: sig } } }).catch(() => {})
  }
}

async function begin(v, sig) {
  const existing = await latestReport(v.id, 'brief')
  const build = { status: 'running', started_at: now(), signature: sig }
  if (existing) return db.update('research_reports', existing.id, { content: { ...existing.content, build } })
  return db.insert('research_reports', { user_id: v.user_id, venture_id: v.id, kind: 'brief', title: `Founder brief · ${v.name}`, summary: 'Preparing…', content: { build }, mode: 'live' })
}

// ---------------------------------------------------------------- routes

async function state(v, d) {
  d ??= await gather(v)
  const rd = readiness(d), sig = signature(d)
  const rep = await latestReport(v.id, 'brief')
  const c = rep?.content
  const ai = c?.brief ? { brief: c.brief, actions: c.actions } : null
  const fb = ai ? null : fallback(d, rd)
  const { _cats, ...readinessOut } = rd
  const generating = c?.build?.status === 'running' && Date.now() - new Date(c.build.started_at).getTime() < 5 * 60_000
  return {
    ...(ai ?? fb), readiness: readinessOut, source: ai ? 'ai' : 'rules', generatedAt: c?.generated_at ?? null,
    stale: !c?.brief || c.signature !== sig, generating,
    error: c?.build?.status === 'error' && c.build.signature === sig ? c.build.error : null,
    _sig: sig, _rd: rd, _d: d,
  }
}

const publicState = ({ _sig, _rd, _d, ...s }) => s

r.get('/ventures/:id/command', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  res.json(publicState(await state(v)))
})

r.post('/ventures/:id/command/refresh', async (req, res) => {
  const v = await own('ventures', req.params.id, req.user)
  const s = await state(v)
  if (s.generating) return res.status(202).json(publicState(s))
  const rep = await begin(v, s._sig)
  synthesize(req.user, v, rep, s._d, s._rd, s._sig).catch((e) => console.error('founder brief failed:', e.message))
  res.status(202).json({ ...publicState(s), generating: true, error: null })
})

export default r
