// Founder Copilot — cross-venture AI Chief of Staff.
//
// POST /copilot/ask   { question, page_context?, history? }
//   → { answer, evidence, recommendation, retrieved, ventures_mentioned, intent }
//
// POST /copilot/index  { venture_id }   (internal: re-index a venture's data into the knowledge base)
// GET  /copilot/messages                (last 50 messages for the current user)

import { Router } from 'express'
import { db } from '../db.js'
import { ai, HttpError } from '../core.js'

const r = Router()

// ---------------------------------------------------------------- intent classification

const INTENT_MAP = {
  comparison:  ['compare', 'versus', 'vs', 'which venture', 'between', 'strongest', 'weakest', 'best', 'worst', 'rank'],
  strategy:    ['focus', 'prioritize', 'next step', 'what should i', 'recommend', 'action', 'plan', 'roadmap'],
  risk:        ['risk', 'danger', 'threat', 'problem', 'concern', 'issue', 'weakness', 'blocker'],
  validation:  ['validated', 'assumption', 'experiment', 'tested', 'proof', 'evidence', 'confidence'],
  competition: ['competitor', 'compete', 'market', 'landscape', 'differentiat', 'white space', 'gap'],
  memory:      ['why did we', 'decision', 'decided', 'history', 'remember', 'recall', 'past', 'previously'],
  opportunity: ['opportunity', 'missing', 'potential', 'untapped', 'discover', 'new market'],
  product:     ['feature', 'mvp', 'build', 'prototype', 'design', 'ux', 'product'],
  growth:      ['growth', 'launch', 'marketing', 'gtm', 'go-to-market', 'customer', 'acquisition', 'revenue'],
}

function classifyIntent(q) {
  const low = q.toLowerCase()
  for (const [intent, keywords] of Object.entries(INTENT_MAP)) {
    if (keywords.some((kw) => low.includes(kw))) return intent
  }
  return 'general'
}

// ---------------------------------------------------------------- page-context → source_type boosts

const PAGE_BOOST = {
  'competitive-intelligence': ['intel'],
  'market-signals':           ['market'],
  'memory':                   ['memory'],
  'research':                 ['research', 'validation'],
  'boardroom':                ['boardroom'],
  'experiments':              ['experiment', 'validation'],
  'mvp':                      ['mvp'],
  'prototype':                ['prototype'],
  'go-to-market':             ['gtm'],
  'ventures':                 ['research', 'validation', 'boardroom'],
}

// ---------------------------------------------------------------- gather structured data for context

async function structuredContext(user) {
  const ventures = await db.list('ventures', { user_id: user.id }, { limit: 50 })
  if (!ventures.length) return { ventures: [], summary: 'No ventures yet.' }

  const ctx = await Promise.all(ventures.map(async (v) => {
    const [boardSessions, experiments, competitors, signals, memory] = await Promise.all([
      db.list('boardroom_sessions', { venture_id: v.id, status: 'completed' }, { limit: 3 }),
      db.list('experiments', { venture_id: v.id }, { limit: 10 }),
      db.list('competitors', { venture_id: v.id }, { limit: 10 }),
      db.list('market_signals', { venture_id: v.id }, { limit: 10 }),
      db.list('venture_memory', { venture_id: v.id }, { limit: 20 }),
    ])
    const latestBoard = boardSessions[0]?.verdict
    return {
      id: v.id,
      name: v.name,
      idea: v.idea,
      stage: v.stage,
      overall_score: v.overall_score,
      verdict: v.verdict,
      board: latestBoard ? { decision: latestBoard.decision, confidence: latestBoard.confidence, summary: latestBoard.summary } : null,
      experiments: experiments.map((e) => ({ name: e.name, type: e.type, status: e.status, result: e.result })),
      competitors: competitors.map((c) => ({ name: c.name, threat: c.threat_level })),
      signals_count: signals.length,
      memory_count: memory.length,
    }
  }))

  return { ventures: ctx }
}

// ---------------------------------------------------------------- main ask route

r.post('/copilot/ask', async (req, res) => {
  const { question, page_context, history = [] } = req.body ?? {}
  if (!question?.trim()) throw new HttpError(400, 'question is required')

  const intent = classifyIntent(question)
  const typeBoost = PAGE_BOOST[page_context] ?? null

  // Fetch all ventures + structured metrics in parallel with knowledge base search
  const [structured, knowledgeRows] = await Promise.all([
    structuredContext(req.user),
    // Try vector search (falls back gracefully if no embeddings yet)
    (async () => {
      try {
        // Use the AI service to embed and search
        const result = await fetch(
          `${process.env.AI_URL || 'http://localhost:8000'}/copilot/search`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(process.env.AI_INTERNAL_KEY && { 'x-internal-key': process.env.AI_INTERNAL_KEY }) },
            body: JSON.stringify({ question, user_id: req.user.id, type_filter: typeBoost, match_count: 14 }),
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (!result.ok) return []
        const data = await result.json()
        return data.results ?? []
      } catch {
        return []
      }
    })(),
  ])

  // Build the full context object for the LLM
  const context = {
    intent,
    page_context: page_context ?? 'dashboard',
    user_question: question,
    ventures: structured.ventures,
    knowledge_snippets: knowledgeRows.slice(0, 12).map((r) => ({
      venture_id: r.venture_id,
      source_module: r.source_module,
      title: r.title,
      content: r.content.slice(0, 800),
      similarity: r.similarity,
      metadata: r.metadata,
    })),
    conversation_history: history.slice(-6),
  }

  // Call the LLM via AI service.
  // NOTE: fetch() does NOT throw on non-2xx status — we must check res.ok.
  let llmOut
  try {
    const aiRes = await fetch(
      `${process.env.AI_URL || 'http://localhost:8000'}/copilot/answer`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(process.env.AI_INTERNAL_KEY && { 'x-internal-key': process.env.AI_INTERNAL_KEY }) },
        body: JSON.stringify(context),
        signal: AbortSignal.timeout(60_000),
      }
    )
    if (!aiRes.ok) throw new Error(`AI service returned ${aiRes.status}`)
    const parsed = await aiRes.json()
    // Ensure the response actually contains an answer string
    if (!parsed?.answer) throw new Error('AI service returned empty answer')
    llmOut = parsed
  } catch {
    // Graceful fallback: rule-based answer from structured data (no AI needed)
    llmOut = ruleBasedAnswer(question, intent, structured, knowledgeRows, page_context)
  }

  // Final safety net — answer must always be a non-empty string
  const answer = llmOut.answer || ruleBasedAnswer(question, intent, structured, knowledgeRows, page_context).answer

  // Persist the exchange
  await Promise.all([
    db.insert('copilot_messages', { user_id: req.user.id, role: 'user',      content: question,      metadata: { page_context, intent } }),
    db.insert('copilot_messages', { user_id: req.user.id, role: 'assistant', content: answer,         metadata: { intent, retrieved_count: knowledgeRows.length } }),
  ])

  res.json({
    answer,
    evidence:           llmOut.evidence ?? [],
    recommendation:     llmOut.recommendation ?? '',
    intent,
    retrieved:          knowledgeRows.length,
    ventures_mentioned: llmOut.ventures_mentioned ?? [],
  })
})

// ---------------------------------------------------------------- rule-based fallback (no AI)

function ruleBasedAnswer(question, intent, structured, knowledge, page_context) {
  const { ventures } = structured
  if (!ventures.length) {
    return { answer: "You haven't created any ventures yet. Click **New venture** to get started and I'll be able to give you real insights.", evidence: [], recommendation: 'Create your first venture.' }
  }

  const sorted = [...ventures].sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
  const best = sorted[0]
  const withScores = ventures.filter((v) => v.overall_score != null)

  if (intent === 'comparison' || question.toLowerCase().includes('compare')) {
    const lines = sorted.map((v) => `**${v.name}** — Score: ${v.overall_score ?? '—'}/100 · Stage: ${v.stage}`).join('\n')
    return {
      answer: `Here's how your ventures stack up:\n\n${lines}`,
      evidence: withScores.map((v) => `${v.name}: ${v.overall_score}/100`),
      recommendation: best ? `${best.name} currently leads with the highest validation score.` : 'Run validation on your ventures to compare them.',
    }
  }

  if (intent === 'risk') {
    const risks = ventures.flatMap((v) => v.board?.decision === 'KILL' ? [`${v.name}: Boardroom voted KILL`] : v.overall_score && v.overall_score < 50 ? [`${v.name}: Low validation score (${v.overall_score}/100)`] : [])
    return {
      answer: risks.length ? `Your highest risks right now:\n\n${risks.map((r) => `• ${r}`).join('\n')}` : "No critical risks flagged yet. Run validation and boardroom sessions to identify risks.",
      evidence: risks,
      recommendation: 'Address the lowest-scoring areas first to reduce launch risk.',
    }
  }

  if (intent === 'strategy') {
    const notValidated = ventures.filter((v) => !v.overall_score)
    const noBoard = ventures.filter((v) => !v.board)
    const actions = []
    if (notValidated.length) actions.push(`Run validation on: ${notValidated.map((v) => v.name).join(', ')}`)
    if (noBoard.length) actions.push(`Hold a Boardroom session for: ${noBoard.map((v) => v.name).join(', ')}`)
    if (best) actions.push(`Focus resources on ${best.name} — your strongest venture`)
    return {
      answer: `Based on your portfolio, here's what I'd prioritize:\n\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
      evidence: [`${ventures.length} active venture(s)`, best ? `${best.name} leads at ${best.overall_score}/100` : ''],
      recommendation: actions[0] ?? 'Keep building and measuring.',
    }
  }

  if (question.toLowerCase().includes('what page') || question.toLowerCase().includes('where am i') || question.toLowerCase().includes('which page')) {
    const formatPage = (p) => !p || p === 'dashboard' ? 'the Dashboard' : `the ${p.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} section`
    return {
      answer: `You are currently viewing ${formatPage(page_context)}.\n\n*(Note: The AI service is currently disconnected, so I'm running in offline rule-based mode. Connect the backend AI to unlock semantic search and intelligent insights).*`,
      evidence: [],
      recommendation: 'Try asking to compare your ventures or identify risks.',
    }
  }

  // General fallback
  const summary = ventures.map((v) => `**${v.name}** (${v.stage}${v.overall_score ? `, score ${v.overall_score}/100` : ''})`).join(', ')
  return {
    answer: `You have ${ventures.length} venture(s): ${summary}.\n\nI can help you compare them, identify risks, plan next steps, or recall past decisions. What would you like to explore?`,
    evidence: [],
    recommendation: best ? `${best.name} is currently your strongest venture.` : 'Start by validating your ventures.',
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
