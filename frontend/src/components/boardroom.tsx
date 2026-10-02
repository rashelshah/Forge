import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Flame, MessageSquarePlus, Play, ShieldAlert, Users, Vote } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { AGENTS, AgentAvatar, ModeBadge, ScoreRing } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardGrid, Disclose, FounderBrief, RiskCard, gist, wordCount } from '@/components/ux'
import { api } from '@/lib/api'
import { clearBoardRun, startBoard, useBoardRun } from '@/lib/boardroomStore'
import type { AgentKey, BoardMessage, BoardSession, Decision, Venture, Verdict } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

const ORDER: AgentKey[] = ['ceo', 'investor', 'product', 'growth', 'technical', 'failure']
const STANCE_TONE = { support: 'leaf', concern: 'amber', oppose: 'rose' } as const

export const DECISION_COPY: Record<Decision, { label: string; tone: string; blurb: string }> = {
  GO: { label: 'Build it', tone: 'bg-[#e8f3dc] text-[#3f6b17]', blurb: 'The board thinks this is worth building now.' },
  PIVOT: { label: 'Change direction', tone: 'bg-[#fbf0d9] text-[#8a5e12]', blurb: 'Keep the goal, but change the approach first.' },
  KILL: { label: "Don't build this", tone: 'bg-[#fbe4e0] text-rose', blurb: 'The board recommends stopping and moving on.' },
}
const THINKING: Record<AgentKey, string> = {
  ceo: 'The CEO is sizing up the opportunity',
  investor: 'The Investor is weighing risk and return',
  product: 'The Product lead is checking if users really need this',
  growth: 'The Growth lead is working out how to find customers',
  technical: 'The Technical lead is estimating build effort and cost',
  failure: 'The Failure Agent is hunting for reasons this could fail',
}

// ---------------------------------------------------------------- full debate (secondary)

export function Transcript({ messages }: { messages: BoardMessage[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => {
        const failure = m.agent === 'failure'
        return (
          <Fragment key={`${m.round}-${m.agent}`}>
            {(i === 0 || messages[i - 1].round !== m.round) && (
              <div className="flex items-center gap-3 pt-2">
                <span className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Round {m.round}{m.round === 1 ? ' · First thoughts' : ' · Responses'}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            <div className="flex gap-3">
              <AgentAvatar agent={m.agent} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{m.name}</span>
                  <Badge tone={STANCE_TONE[m.stance]} className="capitalize">{m.stance}</Badge>
                  <span className="text-[11px] text-muted">says <span className="font-medium text-ink-2">{DECISION_COPY[m.vote].label.toLowerCase()}</span></span>
                </div>
                <div className={cn('mt-1.5 rounded-2xl rounded-tl-md border px-4 py-3 text-[14px] leading-relaxed', AGENTS[m.agent].bubble, failure && 'border-l-4 border-l-rose')}>
                  {failure && <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-rose uppercase"><Flame className="size-3" />Challenge</p>}
                  {wordCount(m.content) <= 25 ? m.content : (
                    <>
                      <p className="font-medium">{m.key_point || gist(m.content)}</p>
                      <Disclose label="Read full argument" className="mt-1.5"><p className="whitespace-pre-line">{m.content}</p></Disclose>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function DebateToggle({ messages }: { messages: BoardMessage[] }) {
  const [open, setOpen] = useState(false)
  if (!messages.length) return null
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-4 text-left cursor-pointer hover:bg-canvas" aria-expanded={open}>
        <div className="flex -space-x-2">{ORDER.map((k) => <AgentAvatar key={k} agent={k} size={24} />)}</div>
        <span className="flex-1 text-sm font-medium">{open ? 'Hide the full debate' : `Read the full debate (${messages.length} messages)`}</span>
        <ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-line p-5"><Transcript messages={messages} /></div>}
    </Card>
  )
}

// ---------------------------------------------------------------- the answer (primary)

export function VerdictCard({ v }: { v: Verdict }) {
  const copy = DECISION_COPY[v.decision]
  const total = v.votes.GO + v.votes.PIVOT + v.votes.KILL
  const [more, setMore] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <div className="relative isolate p-6 sm:p-8">
          <div className="aurora-soft -z-10" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">The board's answer</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="font-display text-[40px] leading-none tracking-[-0.03em]">{copy.label}</span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', copy.tone)}>{v.decision}</span>
              </div>
              <p className="mt-4 text-[17px] leading-relaxed text-ink">{v.headline || copy.blurb}</p>
            </div>
            <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end">
              <div className="flex items-center gap-3">
                <ScoreRing value={v.confidence} size={64} />
                <span className="text-xs leading-tight text-muted">how sure<br />the board is</span>
              </div>
              {total > 0 && <p className="text-xs text-muted"><span className="font-medium text-ink">{v.votes[v.decision]} of {total}</span> board members agree</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
          <div className="bg-white p-6">
            <p className="mb-3 text-sm font-medium">Why</p>
            <ul className="space-y-2.5 text-[15px] text-ink-2">
              {(v.reasons?.length ? v.reasons : [v.summary]).map((r) => <li key={r} className="flex gap-2.5"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-periwinkle" />{r}</li>)}
            </ul>
          </div>
          <div className="bg-white p-6">
            <p className="mb-3 text-sm font-medium">What to do this week</p>
            <ol className="space-y-2.5 text-[15px] text-ink-2">
              {v.next_steps.map((x, i) => <li key={x} className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-dark text-[11px] text-white">{i + 1}</span>{x}</li>)}
            </ol>
          </div>
        </div>

        <div className="border-t border-line p-6">
          <p className="mb-1 text-sm font-medium">Check these before you spend money</p>
          <p className="mb-4 text-xs text-muted">Each one could sink the idea if it's wrong — and each can be tested cheaply in about two weeks.</p>
          <CardGrid>
            {v.critical_assumptions.map((a) => <RiskCard key={a.assumption} risk={a.assumption} severity={a.risk} mitigation={a.test} />)}
          </CardGrid>
        </div>

        {(v.consensus.length > 0 || v.disagreements.length > 0) && (
          <div className="border-t border-line">
            <button onClick={() => setMore(!more)} className="flex w-full items-center justify-between px-6 py-4 text-sm text-muted hover:text-ink cursor-pointer" aria-expanded={more}>
              Where the board agreed and disagreed <ChevronDown className={cn('size-4 transition', more && 'rotate-180')} />
            </button>
            {more && (
              <div className="grid gap-6 px-6 pb-6 md:grid-cols-2">
                <ul className="space-y-1.5 text-sm">{v.consensus.map((x) => <li key={x} className="flex gap-2"><span className="text-leaf">✓</span>{x}</li>)}</ul>
                <ul className="space-y-1.5 text-sm">{v.disagreements.map((x) => <li key={x} className="flex gap-2"><span className="text-amber">≠</span>{x}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------- founder brief + the whole outcome

const RISK_RANK = { high: 0, medium: 1, low: 2 } as const

function BoardBrief({ v, messages }: { v: Verdict; messages: BoardMessage[] }) {
  const copy = DECISION_COPY[v.decision]
  const total = v.votes.GO + v.votes.PIVOT + v.votes.KILL
  const objection = messages.findLast((m) => m.agent === 'failure')?.key_point || v.disagreements[0] || [...v.critical_assumptions].sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk])[0]?.assumption
  return (
    <FounderBrief confidence={v.confidence}
      items={[
        { label: 'Board consensus', icon: Vote, tone: 'leaf', value: `${total ? `${v.votes[v.decision]} of ${total} advisors: ${copy.label.toLowerCase()}. ` : ''}${gist(v.consensus[0] ?? v.headline ?? copy.blurb, 20)}` },
        { label: 'Strongest objection', icon: ShieldAlert, tone: 'rose', value: gist(objection, 24) },
        { label: 'Recommended decision', icon: ArrowRight, tone: 'azure', value: `${copy.label}. ${gist(v.next_steps[0], 20)}` },
      ]} />
  )
}

function Outcome({ v, messages }: { v: Verdict; messages: BoardMessage[] }) {
  return (
    <div className="space-y-4">
      <BoardBrief v={v} messages={messages} />
      <VerdictCard v={v} />
      <DebateToggle messages={messages} />
    </div>
  )
}

// ---------------------------------------------------------------- while the board meets

export function BoardInSession({ question, rounds, messages }: { question: string; rounds: number; messages: BoardMessage[] }) {
  const total = rounds * ORDER.length + 1
  const done = messages.length
  const next = done >= rounds * ORDER.length ? null : ORDER[done % ORDER.length]
  const currentRound = Math.min(rounds, Math.floor(done / ORDER.length) + 1)
  const spoke = new Set(messages.filter((m) => m.round === currentRound).map((m) => m.agent))
  return (
    <Card className="relative overflow-hidden">
      <div className="dot-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black)]" />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-center gap-2 text-xs text-muted"><span className="size-1.5 animate-pulse rounded-full bg-saffron" />The board is meeting · round {currentRound} of {rounds}</div>
        <p className="mt-2 text-xl font-medium tracking-[-0.01em]">“{question}”</p>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ORDER.map((k) => {
            const active = next === k
            const finished = (spoke.has(k) || !next) && !active
            return (
              <div key={k} className="flex flex-col items-center text-center">
                <div className="relative">
                  {active && <motion.span layoutId="speaker" className="absolute -inset-1.5 z-0 rounded-full bg-[conic-gradient(from_0deg,#ec8a44,#6a88e2,#ec8a44)] opacity-80 blur-[2px]" />}
                  <div className={cn('relative z-10 transition', !active && !finished && 'opacity-40')}><AgentAvatar agent={k} size={44} /></div>
                  {finished && <span className="absolute -right-1 -bottom-1 z-20 grid size-4 place-items-center rounded-full bg-leaf text-white"><Check className="size-2.5" /></span>}
                </div>
                <p className="mt-2 text-xs font-medium">{AGENTS[k].name}</p>
              </div>
            )
          })}
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-soft">
          <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" animate={{ width: `${Math.max(4, (100 * done) / total)}%` }} />
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={next ?? 'chair'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 text-sm text-ink-2">
            {next ? `${THINKING[next]}…` : 'The Chair is writing up the final answer…'}
          </motion.p>
        </AnimatePresence>
        <p className="mt-1 text-xs text-muted">Usually under a minute. You can switch tabs — the board keeps working and saves everything.</p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- the boardroom for one venture

function AskForm({ venture, onCancel }: { venture: Venture; onCancel?: () => void }) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState(`Should I build ${venture.name}?`)
  const [rounds, setRounds] = useState(2)
  const suggestions = [`Should I build ${venture.name}?`, 'Who should my first customers be?', 'How should I charge for this?', 'What should I build first?']
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-lg font-medium">Ask the board a question</p>
      <p className="mt-1 text-sm text-muted">Six AI advisors discuss it from every angle, then give you one clear answer.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button key={s} onClick={() => setQuestion(s)} className={cn('rounded-full border px-3 py-1 text-xs cursor-pointer', question === s ? 'border-dark bg-dark text-white' : 'border-line bg-canvas text-ink-2 hover:border-line-2')}>{s}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_170px_auto] sm:items-end">
        <div>
          <Label htmlFor="bq">Your question</Label>
          <Input id="bq" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
        </div>
        <div>
          <Label htmlFor="br">Depth</Label>
          <Select id="br" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            <option value={1}>Quick take</option>
            <option value={2}>Full discussion</option>
            <option value={3}>Deep dive</option>
          </Select>
        </div>
        <div className="flex gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button onClick={() => { startBoard(venture.id, question, rounds, qc); onCancel?.() }} disabled={!question.trim()}><Play />Ask the board</Button>
        </div>
      </div>
    </Card>
  )
}

export function LiveBoardroom({ venture }: { venture: Venture }) {
  const qc = useQueryClient()
  const run = useBoardRun(venture.id)
  const [asking, setAsking] = useState(false)
  const { data: sessions } = useQuery({ queryKey: ['boardroom', { venture_id: venture.id }], queryFn: () => api<BoardSession[]>(`/boardroom?venture_id=${venture.id}`) })
  const latest = sessions?.[0]
  // A session still running on the server (e.g. after a page reload) is followed by polling.
  const serverRunning = !run && latest?.status === 'running' && Date.now() - new Date(latest.created_at).getTime() < 10 * 60_000
  const { data: polled } = useQuery({
    queryKey: ['boardroom', latest?.id], queryFn: () => api<BoardSession>(`/boardroom/${latest!.id}`),
    enabled: serverRunning, refetchInterval: serverRunning ? 3000 : false,
  })
  useEffect(() => {
    if (polled && polled.status !== 'running') qc.invalidateQueries({ queryKey: ['boardroom'] })
  }, [polled, qc])

  if (run?.status === 'running') return <BoardInSession question={run.question} rounds={run.rounds} messages={run.messages} />
  if (serverRunning && latest) return <BoardInSession question={latest.question} rounds={latest.rounds} messages={(polled ?? latest).transcript} />

  const result = run?.status === 'done' && run.verdict
    ? { question: run.question, verdict: run.verdict, messages: run.messages, mode: run.mode, at: null as string | null }
    : latest?.verdict ? { question: latest.question, verdict: latest.verdict, messages: latest.transcript, mode: latest.mode, at: latest.created_at } : null

  if (asking || !result) {
    return (
      <div className="space-y-4">
        {run?.status === 'error' && <p className="rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] p-3 text-sm text-rose">{run.error}</p>}
        <AskForm venture={venture} onCancel={result ? () => { setAsking(false); clearBoardRun(venture.id) } : undefined} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">You asked{result.at ? ` · ${ago(result.at)}` : ''}</p>
          <p className="truncate text-[15px] font-medium">“{result.question}”</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeBadge mode={result.mode} />
          <Button variant="light" size="sm" onClick={() => { clearBoardRun(venture.id); setAsking(true) }}><MessageSquarePlus />Ask another question</Button>
        </div>
      </div>
      <Outcome v={result.verdict} messages={result.messages} />
    </div>
  )
}

export function SessionResult({ session }: { session: BoardSession }) {
  if (!session.verdict) {
    return session.status === 'running'
      ? <BoardInSession question={session.question} rounds={session.rounds} messages={session.transcript} />
      : <Card className="p-6 text-sm text-muted"><Users className="mb-2 size-5" />This session ended without a verdict.</Card>
  }
  return <Outcome v={session.verdict} messages={session.transcript} />
}
