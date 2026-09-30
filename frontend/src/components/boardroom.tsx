import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Flame, Gavel, Play } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { AGENTS, AgentAvatar, DecisionBadge, ModeBadge, ScoreRing } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stream } from '@/lib/api'
import type { AgentKey, BoardMessage, Mode, Venture, Verdict } from '@/lib/types'
import { cn } from '@/lib/utils'

const ORDER: AgentKey[] = ['ceo', 'investor', 'product', 'growth', 'technical', 'failure']
const STANCE_TONE = { support: 'leaf', concern: 'amber', oppose: 'rose' } as const

export function BoardTable({ speaking, done }: { speaking?: AgentKey | null; done?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-[linear-gradient(180deg,#fff_0%,#f3f6fe_100%)] px-4 py-6">
      <div className="dot-grid absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,transparent,black)]" />
      <div className="relative mx-auto grid max-w-3xl grid-cols-3 gap-3 sm:grid-cols-6">
        {ORDER.map((k) => {
          const active = speaking === k
          return (
            <div key={k} className="flex flex-col items-center text-center">
              <div className="relative">
                {active && <motion.span layoutId="speaker" className="absolute -inset-1.5 z-0 rounded-full bg-[conic-gradient(from_0deg,#ec8a44,#6a88e2,#ec8a44)] opacity-80 blur-[2px]" />}
                <div className={cn('relative z-10 transition', !active && speaking && 'opacity-45 grayscale-[.4]')}><AgentAvatar agent={k} size={48} /></div>
              </div>
              <p className="mt-2 text-[13px] font-medium">{AGENTS[k].name}</p>
              <p className="hidden text-[10px] leading-tight text-muted sm:block">{AGENTS[k].role}</p>
            </div>
          )
        })}
      </div>
      <div className="relative mx-auto mt-5 h-2 max-w-2xl rounded-full bg-[linear-gradient(90deg,transparent,#d5e2ff,transparent)]" />
      {done && <p className="relative mt-3 text-center text-xs text-muted">Session adjourned · transcript stored in venture memory</p>}
    </div>
  )
}

export function Transcript({ messages }: { messages: BoardMessage[] }) {
  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const A = AGENTS[m.agent]
          const newRound = i === 0 || messages[i - 1].round !== m.round
          const failure = m.agent === 'failure'
          return (
            <Fragment key={`${m.round}-${m.agent}`}>
              {newRound && (
                <div className="flex items-center gap-3 pt-2">
                  <span className="h-px flex-1 bg-line" />
                  <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Round {m.round}{m.round === 1 ? ' · Opening' : ' · Rebuttal'}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex gap-3">
                <AgentAvatar agent={m.agent} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    <Badge tone={STANCE_TONE[m.stance]} className="capitalize">{m.stance}</Badge>
                    <span className="text-[11px] text-muted">votes <span className="font-medium text-ink-2">{m.vote}</span></span>
                  </div>
                  <div className={cn('mt-1.5 rounded-2xl rounded-tl-md border px-4 py-3 text-[14.5px] leading-relaxed', A.bubble, failure && 'border-l-4 border-l-rose')}>
                    {failure && <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-rose uppercase"><Flame className="size-3" />Challenge</p>}
                    {m.content}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">↳ {m.key_point}</p>
                </div>
              </motion.div>
            </Fragment>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

const RISK_TONE = { low: 'leaf', medium: 'amber', high: 'rose' } as const

export function VerdictCard({ v }: { v: Verdict }) {
  const total = Math.max(1, v.votes.GO + v.votes.PIVOT + v.votes.KILL)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <div className="relative isolate flex flex-col gap-5 overflow-hidden p-6 sm:flex-row sm:items-center">
          <div className="aurora -z-10 opacity-25" />
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-dark text-white shadow-press-dark"><Gavel className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Chair's verdict</p>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-display text-4xl tracking-[-0.03em]">{v.decision}</span>
              <DecisionBadge decision={v.decision} />
            </div>
            <p className="mt-2 text-[15px] text-ink-2">{v.summary}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing value={v.confidence} size={72} />
            <span className="text-[11px] text-muted">confidence</span>
          </div>
        </div>
        <div className="flex h-2">
          {(['GO', 'PIVOT', 'KILL'] as const).map((d) => (
            <div key={d} style={{ width: `${(100 * v.votes[d]) / total}%` }} className={d === 'GO' ? 'bg-[#8fbf5a]' : d === 'PIVOT' ? 'bg-[#f0c060]' : 'bg-[#e0806c]'} title={`${d}: ${v.votes[d]}`} />
          ))}
        </div>
        <div className="grid gap-6 border-t border-line p-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Consensus</p>
            <ul className="space-y-1.5 text-sm">{v.consensus.map((x) => <li key={x} className="flex gap-2"><span className="text-leaf">✓</span>{x}</li>)}</ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Disagreements</p>
            <ul className="space-y-1.5 text-sm">{v.disagreements.map((x) => <li key={x} className="flex gap-2"><span className="text-amber">≠</span>{x}</li>)}</ul>
          </div>
        </div>
        <div className="border-t border-line p-6">
          <p className="mb-3 text-xs font-medium text-muted">Critical assumptions to test</p>
          <div className="space-y-2">
            {v.critical_assumptions.map((a) => (
              <div key={a.assumption} className="grid gap-2 rounded-xl border border-line bg-canvas p-3 sm:grid-cols-[minmax(0,1fr)_auto_1fr] sm:items-center">
                <p className="text-sm font-medium">{a.assumption}</p>
                <Badge tone={RISK_TONE[a.risk]} className="w-fit capitalize">{a.risk} risk</Badge>
                <p className="text-sm text-ink-2"><span className="text-muted">Test: </span>{a.test}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-line p-6">
          <p className="mb-2 text-xs font-medium text-muted">Next steps</p>
          <ol className="space-y-1.5 text-sm">{v.next_steps.map((x, i) => <li key={x} className="flex gap-2"><span className="font-mono text-xs text-muted">{i + 1}.</span>{x}</li>)}</ol>
        </div>
      </Card>
    </motion.div>
  )
}

type BoardEvent =
  | { type: 'session'; id: string }
  | { type: 'start'; mode: Mode; citations: string[] }
  | { type: 'message'; message: BoardMessage }
  | { type: 'round'; round: number }
  | { type: 'verdict'; verdict: Verdict }
  | { type: 'error'; error: string }

export function LiveBoardroom({ venture, onDone }: { venture: Venture; onDone?: (sessionId: string) => void }) {
  const qc = useQueryClient()
  const [question, setQuestion] = useState(`Should we commit to building ${venture.name}?`)
  const [rounds, setRounds] = useState(2)
  const [running, setRunning] = useState(false)
  const [messages, setMessages] = useState<BoardMessage[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [citations, setCitations] = useState<string[]>([])

  const nextSpeaker = (): AgentKey | null => {
    if (!running || verdict) return null
    const last = messages.at(-1)
    return last ? (ORDER[(ORDER.indexOf(last.agent) + 1) % ORDER.length] ?? null) : 'ceo'
  }
  const last = messages.at(-1)
  const chairing = running && !verdict && last?.agent === 'failure' && last.round === rounds

  async function start() {
    setRunning(true); setMessages([]); setVerdict(null); setCitations([])
    let id = ''
    try {
      await stream<BoardEvent>(`/ventures/${venture.id}/boardroom`, { question, rounds }, (e) => {
        if (e.type === 'session') id = e.id
        if (e.type === 'start') { setMode(e.mode); setCitations(e.citations) }
        if (e.type === 'message') setMessages((m) => [...m, e.message])
        if (e.type === 'verdict') setVerdict(e.verdict)
        if (e.type === 'error') toast.error(e.error)
      })
      ;[['boardroom'], ['ventures'], ['memory'], ['notifications'], ['activity'], ['dashboard']].forEach((queryKey) => qc.invalidateQueries({ queryKey }))
      if (id) onDone?.(id)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
          <div>
            <Label htmlFor="bq">Question for the board</Label>
            <Input id="bq" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={running} maxLength={500} />
          </div>
          <div>
            <Label htmlFor="br">Rounds</Label>
            <Select id="br" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} disabled={running}>
              <option value={1}>1 · Openings</option>
              <option value={2}>2 · Debate</option>
              <option value={3}>3 · Deep debate</option>
            </Select>
          </div>
          <Button onClick={start} loading={running} disabled={!question.trim()}><Play />{running ? 'In session' : 'Convene board'}</Button>
        </div>
      </Card>

      {(running || messages.length > 0) && (
        <>
          <BoardTable speaking={chairing ? null : nextSpeaker()} done={!!verdict && !running} />
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={mode} />
            {citations.slice(0, 4).map((c) => <Badge key={c} tone="outline"><BookOpen />{c}</Badge>)}
          </div>
          <Transcript messages={messages} />
          {chairing && <p className="animate-pulse text-center text-sm text-muted">The Chair is deliberating…</p>}
          {verdict && <VerdictCard v={verdict} />}
        </>
      )}
    </div>
  )
}
