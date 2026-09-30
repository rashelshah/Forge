import { AnimatePresence, animate, motion } from 'framer-motion'
import {
  ArrowRight, AppWindow, Brain, CalendarDays, Check, Compass, FileText, FlaskConical, Gauge, Layers, ListChecks, Megaphone, MessagesSquare,
  Palette, Play, Presentation, Radar, RotateCcw, ShieldAlert, Sparkles, Store, Target, Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AGENTS, AgentAvatar } from '@/components/bits'
import { Button } from '@/components/ui/button'
import type { AgentKey } from '@/lib/types'
import { cn } from '@/lib/utils'

const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } } as const

export function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <motion.div {...fade} className="mx-auto max-w-2xl text-center">
      <p className="font-mono text-[12px] tracking-[0.2em] text-muted uppercase">{eyebrow}</p>
      <h2 className="mt-4 text-[34px] leading-[1.15] font-[450] tracking-[-0.025em] sm:text-[42px]">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">{sub}</p>}
    </motion.div>
  )
}

// ================================================================ 1. try the boardroom

type Decision = 'GO' | 'PIVOT' | 'KILL'
const IDEAS = [
  {
    id: 'campus', name: 'CampusCart', idea: 'A marketplace where college students buy and sell textbooks and dorm gear', icon: Store,
    scores: [['Demand', 74], ['Competition', 52], ['Defensibility', 41], ['Revenue', 58], ['Founder fit', 81]] as [string, number][],
    evidence: '38 Reddit threads · 12 G2 reviews · 4 competitors tracked',
    debate: [
      { agent: 'ceo' as AgentKey, text: 'Students already trade in group chats. Owning one campus is a wedge into thousands more.' },
      { agent: 'investor' as AgentKey, text: 'Graduation churn worries me. Where does recurring revenue come from?' },
      { agent: 'growth' as AgentKey, text: 'Campus ambassadors plus a referral queue: near-zero CAC for the first 10k users.' },
      { agent: 'failure' as AgentKey, text: 'WhatsApp is free. Why switch? Only verification and escrow give a reason.' },
    ],
    verdict: { decision: 'GO' as Decision, confidence: 70, headline: 'Build it — start on one campus.', next: 'Run a two-week pilot with verified .edu sellers and escrow.' },
  },
  {
    id: 'ledger', name: 'LedgerLeaf', idea: 'AI bookkeeping for freelancers: categorise spending, chase invoices, set aside tax', icon: Wallet,
    scores: [['Demand', 69], ['Competition', 34], ['Defensibility', 38], ['Revenue', 72], ['Founder fit', 55]] as [string, number][],
    evidence: '61 Reddit threads · 27 G2 reviews · 9 competitors tracked',
    debate: [
      { agent: 'product' as AgentKey, text: 'Invoice chasing is the painful job. Bookkeeping alone is a vitamin.' },
      { agent: 'investor' as AgentKey, text: 'QuickBooks and Wave own the category. You need a sharper wedge.' },
      { agent: 'technical' as AgentKey, text: 'Bank connections are the hard part. Start with invoices and email.' },
      { agent: 'failure' as AgentKey, text: 'Freelancers churn when they stop freelancing. LTV is shorter than it looks.' },
    ],
    verdict: { decision: 'PIVOT' as Decision, confidence: 64, headline: 'Pivot to late-invoice recovery.', next: 'Test a paid “get paid faster” product before any bookkeeping.' },
  },
  {
    id: 'voice', name: 'FieldVoice', idea: 'A voice-only CRM for field sales reps who hate typing notes', icon: MessagesSquare,
    scores: [['Demand', 48], ['Competition', 22], ['Defensibility', 30], ['Revenue', 52], ['Founder fit', 60]] as [string, number][],
    evidence: '14 Reddit threads · 27 G2 reviews · 6 competitors tracked',
    debate: [
      { agent: 'ceo' as AgentKey, text: 'The pain is real, but it is a feature inside Salesforce and HubSpot.' },
      { agent: 'technical' as AgentKey, text: 'Transcription in noisy cars is unreliable. Accuracy will decide trust.' },
      { agent: 'investor' as AgentKey, text: 'Easy to copy. I see no data moat or distribution edge.' },
      { agent: 'failure' as AgentKey, text: 'Incumbents ship voice notes next quarter. You are one release from irrelevant.' },
    ],
    verdict: { decision: 'KILL' as Decision, confidence: 71, headline: 'Do not build this as a standalone product.', next: 'If you still believe in it, test a plug-in for one CRM first.' },
  },
]
const VERDICT_STYLE: Record<Decision, { chip: string; glow: string; ring: string }> = {
  GO: { chip: 'bg-[#e8f3dc] text-[#3f6b17]', glow: 'rgb(132 204 22 / .16)', ring: '#5d8a2b' },
  PIVOT: { chip: 'bg-[#fbf0d9] text-[#8a5e12]', glow: 'rgb(234 179 8 / .18)', ring: '#c08827' },
  KILL: { chip: 'bg-[#fbe4e0] text-rose', glow: 'rgb(244 63 94 / .14)', ring: '#c43d2b' },
}
const STAGES = ['Scan the market', 'Score the idea', 'Board debate', 'Verdict']
const ORDER: AgentKey[] = ['ceo', 'investor', 'product', 'growth', 'technical', 'failure']
const SOURCES = ['r/college', 'Hacker News', 'G2 reviews', 'App Store', 'Product Hunt']

/** Types `text` out character by character; restarts whenever the text changes. */
function useTyped(text: string) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const t = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(t), k) : k + 1)), 16)
    return () => clearInterval(t)
  }, [text])
  return text.slice(0, n)
}

function Count({ to, run, className }: { to: number; run: boolean; className?: string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!run) { setV(0); return }
    const c = animate(0, to, { duration: 0.9, ease: 'easeOut', onUpdate: (x) => setV(Math.round(x)) })
    return () => c.stop()
  }, [to, run])
  return <span className={className}>{run ? v : '—'}</span>
}

function Ring({ value, color, run }: { value: number; color: string; run: boolean }) {
  const c = 2 * Math.PI * 34
  return (
    <div className="relative grid size-[84px] shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="-rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="#f0f0f0" strokeWidth="6" />
        <motion.circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: run ? c * (1 - value / 100) : c }} transition={{ duration: 1, ease: 'easeOut' }} /></svg>
      <span className="absolute text-center"><Count to={value} run={run} className="font-display text-[22px] font-medium tabular-nums" /><span className="block -mt-0.5 text-[9px] tracking-wide text-muted uppercase">sure</span></span>
    </div>
  )
}

export function TryBoardroom() {
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState(0) // 0 ready, 1-3 running, 4 verdict
  const [msgs, setMsgs] = useState(0)
  const idea = IDEAS[idx]
  const typed = useTyped(idea.idea)
  const timers = useRef<number[]>([])
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])
  const pick = (i: number) => { clear(); setIdx(i); setStage(0); setMsgs(0) }
  const run = () => {
    clear(); setStage(1); setMsgs(0)
    const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }
    at(1500, () => setStage(2))
    at(3000, () => setStage(3))
    for (let i = 1; i <= 4; i++) at(3000 + i * 1500, () => setMsgs(i))
    at(3000 + 4 * 1500 + 1500, () => setStage(4))
  }
  const running = stage > 0 && stage < 4
  const v = idea.verdict, vs = VERDICT_STYLE[v.decision]
  const speaker = stage === 3 && msgs > 0 ? idea.debate[msgs - 1].agent : null
  const involved = new Set(idea.debate.map((d) => d.agent))

  return (
    <section id="try" className="px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="Try it" title={<>Watch an idea get <span className="text-saffron">cross-examined</span></>} sub="Pick an idea and convene the board. Foundry scores it on evidence, then six AI advisors debate it — and sometimes the answer is no." />
      <motion.div {...fade} className="relative mx-auto mt-12 max-w-[1040px]">
        <div className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-[44px] bg-[radial-gradient(60%_80%_at_15%_0%,rgb(236_138_68/.18),transparent_70%),radial-gradient(60%_90%_at_90%_100%,rgb(165_187_252/.42),transparent_70%)] blur-2xl" />
        <div className="relative overflow-hidden rounded-[28px] border border-line bg-white shadow-float">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64"><div className="aurora-soft" /></div>
          <div className="relative p-5 sm:p-8">
            {/* prompt bar */}
            <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-white p-3 shadow-float sm:flex-row sm:items-center sm:p-2 sm:pl-5">
              <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1 sm:items-center sm:px-0">
                <Sparkles className="mt-1 size-4 shrink-0 text-saffron sm:mt-0" />
                <p className="flex min-h-[46px] min-w-0 flex-1 flex-wrap items-center gap-x-2 text-[15px] leading-snug sm:flex-nowrap sm:text-[16px]">
                  <span className="shrink-0 font-medium">{idea.name}</span><span className="hidden text-line-2 sm:inline">|</span>
                  <span className="min-w-0 text-ink-2 sm:truncate">{typed}<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-ink" /></span>
                </p>
              </div>
              <button onClick={run} disabled={running} className={cn('relative inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-ink px-5 text-[15px] font-medium text-white transition cursor-pointer hover:bg-dark disabled:cursor-default sm:w-auto', stage === 0 && 'animate-[ring_2.2s_ease-out_infinite]')}>
                {running ? <><Loader /> Board in session</> : stage === 4 ? <><RotateCcw className="size-4" />Run again</> : <><Play className="size-4" />Convene the board</>}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">Try an idea:</span>
              {IDEAS.map((x, i) => (
                <button key={x.id} onClick={() => pick(i)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition cursor-pointer', idx === i ? 'border-saffron/40 bg-[#fdf6ef] font-medium text-[#a2511c]' : 'border-line bg-white text-ink-2 hover:border-line-2')}>
                  <x.icon className="size-3.5" strokeWidth={1.75} />{x.name}
                </button>
              ))}
            </div>

            {/* progress */}
            <div className="mt-8 flex items-center" aria-label="Progress">
              {STAGES.map((s, i) => {
                const done = stage > i + 1 || stage === 4, now = stage === i + 1 || (stage === 4 && i === 3)
                return (
                  <div key={s} className={cn('flex items-center', i < STAGES.length - 1 && 'flex-1')}>
                    <span className={cn('flex shrink-0 items-center gap-2 text-[12.5px] transition', done || now ? 'text-ink' : 'text-faint')}>
                      <span className={cn('grid size-6 place-items-center rounded-full border text-[11px] transition', done ? 'border-leaf bg-leaf text-white' : now ? 'border-azure bg-mist text-azure' : 'border-line-2 bg-white')}>{done ? <Check className="size-3.5" /> : i + 1}</span>
                      <span className="hidden sm:inline">{s}</span>
                    </span>
                    {i < STAGES.length - 1 && <span className="relative mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-soft"><motion.span className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" initial={false} animate={{ width: stage > i + 1 || stage === 4 ? '100%' : stage === i + 1 ? '55%' : '0%' }} transition={{ duration: 1 }} /></span>}
                  </div>
                )
              })}
            </div>

            {/* evidence + boardroom */}
            <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl border border-line bg-white/90 p-5">
                <p className="text-[13px] font-medium">Evidence</p>
                <div className="mt-4 space-y-3.5">
                  {idea.scores.map(([k, n], i) => (
                    <div key={k}>
                      <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="text-ink-2">{k}</span><Count to={n} run={stage >= 2} className="font-medium tabular-nums" /></div>
                      <div className="h-2 overflow-hidden rounded-full bg-soft"><motion.div initial={false} animate={{ width: stage >= 2 ? `${n}%` : 0 }} transition={{ delay: i * 0.1, duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">{SOURCES.map((x, i) => <motion.span key={x} animate={stage === 1 ? { opacity: [0.35, 1, 0.35] } : { opacity: stage >= 2 ? 1 : 0.55 }} transition={stage === 1 ? { repeat: Infinity, duration: 1.2, delay: i * 0.18 } : { duration: 0.3 }} className={cn('rounded-full border px-2.5 py-0.5 text-[10.5px] whitespace-nowrap', stage >= 2 ? 'border-[#d8e9c2] bg-[#f5faef] text-[#3f6b17]' : 'border-line bg-canvas text-muted')}>{x}</motion.span>)}</div>
                <p className="mt-2.5 text-[12px] text-muted">{stage === 0 ? 'Scores appear here, each with its sources.' : stage === 1 ? 'Mining Reddit, Hacker News, G2 and the App Store…' : `Cited: ${idea.evidence}`}</p>
              </div>

              <div className="rounded-2xl border border-line bg-white/90 p-5">
                <div className="flex items-center justify-between"><p className="text-[13px] font-medium">The boardroom</p><span className="text-[11px] text-muted">{stage === 3 ? 'Debating…' : stage === 4 ? 'Adjourned' : 'Seated'}</span></div>
                <div className="mt-4 grid grid-cols-6 gap-1">
                  {ORDER.map((a) => {
                    const on = speaker === a, dim = stage >= 3 && !involved.has(a)
                    return (
                      <div key={a} className={cn('flex flex-col items-center gap-1.5 transition', dim && 'opacity-35')}>
                        <motion.span animate={{ scale: on ? 1.16 : 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className={cn('rounded-full p-0.5 transition', on ? 'ring-2 ring-ink ring-offset-2' : stage === 0 && 'opacity-70')}><AgentAvatar agent={a} size={40} /></motion.span>
                        <span className="text-[10px] text-muted">{AGENTS[a].name.replace(' Agent', '')}</span>
                        <span className="flex h-3 items-end gap-0.5">{on ? [0, 1, 2].map((k) => <motion.i key={k} className="w-0.5 rounded bg-ink" animate={{ height: [3, 11, 4] }} transition={{ repeat: Infinity, duration: 0.7, delay: k * 0.15 }} />) : null}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 min-h-[188px] space-y-2">
                  {stage < 3 && <p className="grid h-[188px] place-items-center text-center text-[13px] text-muted">{stage === 0 ? 'Six advisors are waiting for the scores.' : 'The board reads the evidence before speaking…'}</p>}
                  <AnimatePresence initial={false}>
                    {stage >= 3 && idea.debate.slice(0, stage === 4 ? 4 : msgs).map((m, i, all) => (
                      <motion.div key={m.agent + m.text} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: i === all.length - 1 || stage === 4 ? 1 : 0.55, y: 0 }} className={cn('rounded-xl rounded-tl-sm border px-3 py-2 text-[12.5px] leading-snug', AGENTS[m.agent].bubble)}>
                        <span className="mr-1.5 text-[10px] font-medium text-muted">{AGENTS[m.agent].name}</span>{m.text}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* verdict */}
            <AnimatePresence>
              {stage === 4 && (
                <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-float sm:p-6">
                  <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 140% at 0% 50%, ${vs.glow}, transparent 70%)` }} />
                  <div className="relative flex flex-wrap items-center gap-5">
                    <Ring value={v.confidence} color={vs.ring} run />
                    <div className="min-w-[200px] flex-1">
                      <span className={cn('inline-block rounded-lg px-3 py-1 font-display text-xl font-medium tracking-tight', vs.chip)}>{v.decision}</span>
                      <p className="mt-2 text-[18px] leading-snug font-medium tracking-[-0.01em]">{v.headline}</p>
                      <p className="mt-1 text-[14px] text-muted">{v.next}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <Button asChild><Link to="/app">Run this on your idea <ArrowRight /></Link></Button>
                      <button onClick={() => pick((idx + 1) % IDEAS.length)} className="text-[13px] text-muted transition hover:text-ink cursor-pointer">Try another idea →</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="mt-5 text-center text-[11px] text-faint">Illustrative run — real ventures use live web evidence and cited sources.</p>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

function Loader() {
  return <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
}

// ================================================================ 2. how it works: stepper with live mock-ups

const Win = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <div className={cn('w-full overflow-hidden rounded-2xl border border-line bg-white shadow-float', className)}>
    <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
      {['#f1b0a4', '#f3d28e', '#b9d99b'].map((c) => <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}
      <span className="ml-3 truncate font-mono text-[11px] text-muted">{title}</span>
    </div>
    <div className="p-5">{children}</div>
  </div>
)

function DiscoverMock({ go }: { go: () => void }) {
  const rows: [string, string, string, string][] = [
    ['Textbook resale is chaotic', 'Pain 8/10', 'Weekly', 'r/college · 38 threads'],
    ['Freelancers chase late invoices', 'Pain 8/10', 'Monthly', 'r/freelance · 61 threads'],
    ['Field reps hate data entry', 'Pain 7/10', 'Daily', 'G2 · 27 reviews'],
    ['Sublet scams every semester', 'Pain 7/10', 'Each term', 'Hacker News · 14 threads'],
  ]
  const [sel, setSel] = useState(0)
  return (
    <Win title="Opportunity discovery">
      <p className="text-[12px] text-muted">Recurring problems found in real conversations</p>
      <div className="mt-3 space-y-2">
        {rows.map(([t, p, f, s], i) => (
          <button key={t} onClick={() => setSel(i)} className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition cursor-pointer', sel === i ? 'border-saffron/40 bg-[#fdf6ef]' : 'border-line hover:border-line-2')}>
            <span className={cn('grid size-8 place-items-center rounded-lg text-[11px] font-medium', sel === i ? 'bg-saffron text-white' : 'bg-soft text-ink-2')}>{p.replace(/\D/g, '').slice(0, 1)}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium">{t}</span><span className="block text-[11px] text-muted">{f} · {s}</span></span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-canvas px-3 py-2.5 text-[12.5px]"><span className="text-muted">Bottom-up market size</span><b className="font-medium">~$240M serviceable</b></div>
      <Button size="sm" className="mt-4 w-full" onClick={go}>Validate this problem <ArrowRight /></Button>
    </Win>
  )
}

function ValidateMock() {
  const scores: [string, number][] = [['Demand', 74], ['Competition', 52], ['Defensibility', 41], ['Revenue potential', 58], ['Founder fit', 81]]
  return (
    <Win title="Validation · CampusCart">
      <div className="flex items-center gap-5">
        <div className="relative grid size-20 shrink-0 place-items-center"><svg viewBox="0 0 80 80" className="-rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="#f0f0f0" strokeWidth="7" /><motion.circle cx="40" cy="40" r="34" fill="none" stroke="#4250d5" strokeWidth="7" strokeLinecap="round" strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 213.6 * (1 - 0.64) }} transition={{ duration: 1 }} /></svg><span className="absolute font-display text-2xl font-medium">64</span></div>
        <div className="flex-1 space-y-2.5">{scores.map(([k, n], i) => (
          <div key={k}><div className="flex justify-between text-[11px]"><span className="text-muted">{k}</span><span className="font-medium tabular-nums">{n}</span></div><div className="mt-0.5 h-1.5 rounded-full bg-soft"><motion.div initial={{ width: 0 }} animate={{ width: `${n}%` }} transition={{ delay: i * 0.1, duration: 0.7 }} className="h-full rounded-full bg-[linear-gradient(90deg,#6a88e2,#4250d5)]" /></div></div>
        ))}</div>
      </div>
      <div className="mt-5 space-y-2 text-[12.5px]">
        {['“Every semester I lose $40 selling books on Facebook” — r/college', 'Competition: Facebook Marketplace has liquidity but no campus trust — G2', 'Key risk: two-sided liquidity on a single campus'].map((t, i) => (
          <motion.p key={t} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }} className={cn('rounded-xl border px-3 py-2', i === 2 ? 'border-[#f4cfc8] bg-[#fdf3f1]' : 'border-mist bg-[#f4f7fe]')}>{t}</motion.p>
        ))}
      </div>
    </Win>
  )
}

function BoardMock() {
  const order: AgentKey[] = ['ceo', 'investor', 'product', 'growth', 'technical', 'failure']
  const says: Record<AgentKey, string> = {
    ceo: 'Own one campus first. The wedge is trust, and trust compounds.',
    investor: 'Show me repeat revenue beyond graduation season before I believe the model.',
    product: 'Verification and listing speed are the two make-or-break features.',
    growth: 'Campus ambassadors and a referral queue beat paid acquisition here.',
    technical: 'Escrow and .edu checks are the hard parts; the marketplace itself is simple.',
    failure: 'Free group chats already work. If trust is not 10x better, nobody switches.',
  } as Record<AgentKey, string>
  const [sel, setSel] = useState<AgentKey>('failure')
  return (
    <Win title="Boardroom · “How should I charge for this?”">
      <p className="text-[12px] text-muted">Tap an advisor to hear their view</p>
      <div className="mt-3 flex flex-wrap gap-2">{order.map((a) => (
        <button key={a} onClick={() => setSel(a)} aria-label={AGENTS[a].name} className={cn('rounded-full p-0.5 transition cursor-pointer', sel === a ? 'ring-2 ring-ink ring-offset-2' : 'opacity-70 hover:opacity-100')}><AgentAvatar agent={a} size={38} /></button>
      ))}</div>
      <AnimatePresence mode="wait">
        <motion.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('mt-4 rounded-2xl rounded-tl-sm border p-4 text-[14px] leading-relaxed', AGENTS[sel].bubble)}>
          <p className="mb-1 text-[11px] font-medium text-muted">{AGENTS[sel].name} · {AGENTS[sel].role}</p>{says[sel]}
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-canvas p-3">
        <span className="rounded-lg bg-[#e8f3dc] px-3 py-1.5 font-display text-lg font-medium text-[#3f6b17]">GO</span>
        <p className="flex-1 text-[13px]"><b className="font-medium">Build it.</b> <span className="text-muted">Start with a free-buyer, 10% fee, $4.99 Pro plan on one campus.</span></p><span className="text-sm font-medium tabular-nums">70%</span>
      </div>
    </Win>
  )
}

function BuildMock() {
  const [tab, setTab] = useState<'Browse' | 'Saved' | 'Sell'>('Browse')
  const [dark, setDark] = useState(false)
  const items: [string, string, string][] = [['Campbell Biology 12e', '$45', 'BIO101'], ['Mini fridge 3.2 cu ft', '$60', 'DORM'], ['Micro-economics notes', '$30', 'ECON101'], ['Ergonomic desk chair', '$40', 'DORM']]
  const shown = tab === 'Saved' ? items.slice(1, 3) : items
  return (
    <Win title="Prototype · CampusCart" className="">
      <div className={cn('overflow-hidden rounded-xl border transition-colors duration-300', dark ? 'border-[#2a2f3a] bg-[#10131a] text-white' : 'border-line bg-white')}>
        <div className={cn('flex items-center gap-1 border-b px-3 py-2', dark ? 'border-[#2a2f3a]' : 'border-line')}>
          <span className="mr-2 grid size-5 place-items-center rounded-md bg-saffron text-[10px] font-bold text-white">C</span>
          {(['Browse', 'Saved', 'Sell'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-2.5 py-1 text-[12px] transition cursor-pointer', tab === t ? (dark ? 'bg-white/10 font-medium' : 'bg-soft font-medium') : dark ? 'text-white/60' : 'text-muted')}>{t}</button>)}
          <span className="ml-auto text-[10px] opacity-60">✓ Verified student</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 p-3">
          {tab === 'Sell' ? (
            <div className="col-span-2 space-y-2 py-2 text-[12px]"><div className={cn('rounded-lg border px-3 py-2', dark ? 'border-[#2a2f3a]' : 'border-line')}>Title · Campbell Biology 12e</div><div className={cn('rounded-lg border px-3 py-2', dark ? 'border-[#2a2f3a]' : 'border-line')}>Price · $45 <span className="opacity-60">— AI suggests $42–48</span></div><div className="rounded-lg bg-saffron px-3 py-2 text-center font-medium text-white">Post listing</div></div>
          ) : shown.map(([t, p, c], i) => (
            <motion.div key={t + tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn('rounded-lg border p-2.5', dark ? 'border-[#2a2f3a] bg-[#171b24]' : 'border-line')}>
              <div className="h-14 rounded-md bg-[linear-gradient(135deg,#fbd9bd,#c7d2fe)]" /><p className="mt-2 text-[12px] font-medium">{t}</p><div className="mt-0.5 flex justify-between text-[11px]"><span className="opacity-60">{c}</span><b className="font-medium">{p}</b></div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
        <p className="text-[11px] text-muted">Change anything — describe it like you would to a designer</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button onClick={() => setDark((d) => !d)} className={cn('rounded-full border px-3 py-1 text-[12px] transition cursor-pointer', dark ? 'border-dark bg-dark text-white' : 'border-line bg-white hover:border-line-2')}>{dark ? '✓ ' : ''}Make it dark mode</button>
          <button onClick={() => setTab('Saved')} className="rounded-full border border-line bg-white px-3 py-1 text-[12px] hover:border-line-2 cursor-pointer">Show saved items</button>
          <button onClick={() => setTab('Sell')} className="rounded-full border border-line bg-white px-3 py-1 text-[12px] hover:border-line-2 cursor-pointer">Add a sell flow</button>
        </div>
      </div>
    </Win>
  )
}

function LaunchMock() {
  const palettes = [{ n: 'Campus Teal', p: '#0f766e', s: '#0b2b2a', a: '#fbbf24' }, { n: 'Indigo Ink', p: '#4f46e5', s: '#1e1b4b', a: '#f59e0b' }, { n: 'Coral', p: '#e8603c', s: '#5b1d12', a: '#fde68a' }, { n: 'Forest', p: '#3f7d3a', s: '#14301a', a: '#f9a8d4' }]
  const [i, setI] = useState(0)
  const c = palettes[i]
  const assets: [ComponentType<{ className?: string }>, string][] = [[FileText, 'Brand guidelines'], [Palette, 'Logo pack'], [Presentation, 'Investor deck'], [CalendarDays, '30-day content calendar'], [Megaphone, 'Ad creatives'], [ListChecks, 'Launch checklist']]
  return (
    <Win title="Go-To-Market · Brand kit">
      <div className="flex items-center gap-2">{palettes.map((x, k) => <button key={x.n} onClick={() => setI(k)} aria-label={x.n} title={x.n} className={cn('size-7 rounded-full border-2 transition cursor-pointer', i === k ? 'scale-110 border-ink' : 'border-white ring-1 ring-line')} style={{ background: `linear-gradient(135deg, ${x.p} 50%, ${x.a} 50%)` }} />)}<span className="ml-2 text-[12px] text-muted">{c.n}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <div className="grid place-items-center rounded-2xl border border-line bg-white py-6">
          <svg viewBox="0 0 100 100" className="size-16 transition-all"><path d="M50 6 L88 20 V50 C88 72 72 86 50 94 C28 86 12 72 12 50 V20 Z" style={{ fill: c.s, transition: 'fill .3s' }} /><path d="M33 52 L45 64 L68 37" fill="none" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: c.p, transition: 'stroke .3s' }} /><circle cx="75" cy="27" r="9" style={{ fill: c.a, transition: 'fill .3s' }} /></svg>
          <p className="mt-2 font-display text-xl font-bold tracking-tight">CampusCart</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl p-5 text-white transition-[background] duration-300" style={{ background: `linear-gradient(140deg, ${c.p}, ${c.s})` }}>
          <span className="absolute -top-8 -right-8 size-28 rounded-full transition-colors duration-300" style={{ background: c.a }} />
          <p className="relative max-w-[70%] font-display text-[19px] leading-tight font-extrabold tracking-tight">Buy and sell safely on your campus</p>
          <span className="relative mt-4 inline-block rounded-full px-4 py-1.5 text-[12px] font-bold text-black transition-colors duration-300" style={{ background: c.a }}>Join the waitlist</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">{assets.map(([Icon, t]) => <span key={t} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[12px]"><Icon className="size-3.5 text-muted" />{t}<Check className="ml-auto size-3 text-leaf" /></span>)}</div>
    </Win>
  )
}

function TrackMock() {
  const bars: [string, number][] = [['Validation', 100], ['Competitors', 100], ['Boardroom', 100], ['Prototype', 50], ['Experiments', 50]]
  return (
    <Win title="Overview · CampusCart">
      <div className="rounded-2xl border border-line bg-[radial-gradient(60%_110%_at_6%_0%,rgb(236_138_68/.17),transparent_70%),radial-gradient(62%_120%_at_90%_0%,rgb(165_187_252/.4),transparent_70%)] p-4">
        <div className="flex items-start justify-between"><div><p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">AI venture partner</p><p className="mt-1 font-display text-lg">Today's founder brief</p></div><span className="rounded-full bg-[#fbf0d9] px-3 py-1 text-[12px] font-medium text-[#8a5e12]">Needs evidence</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-[12px] leading-snug">
          <p className="rounded-xl border border-[#d8e9c2] bg-[#f5faef] p-3"><b className="block font-mono text-[9px] tracking-widest text-[#3f6b17] uppercase">Biggest opportunity</b>Campus-only marketplace with escrow beats free Facebook groups.</p>
          <p className="rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] p-3"><b className="block font-mono text-[9px] tracking-widest text-rose uppercase">Biggest risk</b>10% fee may not cover AI and verification costs.</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[12px]"><span className="font-medium">Launch readiness</span><b className="font-display text-xl font-medium tabular-nums">78%</b></div>
      <div className="mt-2 space-y-2">{bars.map(([k, n], i) => <div key={k} className="flex items-center gap-3 text-[11px]"><span className="w-20 text-muted">{k}</span><div className="h-1.5 flex-1 rounded-full bg-soft"><motion.div initial={{ width: 0 }} animate={{ width: `${n}%` }} transition={{ delay: i * 0.1, duration: 0.7 }} className={cn('h-full rounded-full', n === 100 ? 'bg-leaf' : 'bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]')} /></div><span className="w-8 text-right tabular-nums">{n}%</span></div>)}</div>
      <p className="mt-4 flex items-center gap-2 rounded-xl border border-mist bg-[#f4f7fe] px-3 py-2 text-[12px]"><Radar className="size-3.5 text-azure" /><span><b className="font-medium">BookToCash</b> cut seller fees 12% → 8%. Suggested response: lead with trust, not price.</span></p>
    </Win>
  )
}

const STEPS: { id: string; label: string; title: string; body: string; icon: ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { id: 'discover', label: 'Discover', title: 'Find problems worth solving', body: 'Agents mine Reddit, Hacker News, G2 and the App Store for recurring pain, then size the opportunity bottom-up.', icon: Compass },
  { id: 'validate', label: 'Validate', title: 'Score it on cited evidence', body: 'Demand, competition, defensibility, revenue and founder fit, each backed by the sources behind it.', icon: Gauge },
  { id: 'board', label: 'Debate', title: 'Put it in front of a board', body: 'CEO, Investor, Product, Growth, Technical and Failure agents argue. The Chair issues GO, PIVOT or KILL.', icon: MessagesSquare },
  { id: 'build', label: 'Build', title: 'Get a working prototype', body: 'An AI product team designs, builds, screenshots and reviews a clickable app. Then you change anything in plain words.', icon: AppWindow },
  { id: 'launch', label: 'Launch', title: 'Leave with a launch package', body: 'Brand, logo pack, messaging, graphics, ads, investor deck, content calendar and a launch checklist.', icon: Megaphone },
  { id: 'track', label: 'Track', title: 'Always know what to do next', body: 'A founder brief, launch readiness, competitor moves and experiment results, updated as your venture changes.', icon: Target },
]

export function HowItWorks() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), 7500)
    return () => clearTimeout(t)
  }, [active, paused])
  const mock = [<DiscoverMock key="d" go={() => setActive(1)} />, <ValidateMock key="v" />, <BoardMock key="b" />, <BuildMock key="bu" />, <LaunchMock key="l" />, <TrackMock key="t" />][active]

  return (
    <section id="how" className="px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="How it works" title={<>From a spark to a <span className="text-saffron">launched company</span></>} sub="One connected studio. Each step feeds the next, and everything is remembered." />
      <motion.div {...fade} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="mx-auto mt-14 grid max-w-[1040px] gap-8 lg:grid-cols-[340px_1fr]">
        <div className="scrollbar-none flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setActive(i)} className={cn('relative shrink-0 overflow-hidden rounded-2xl border px-4 py-3 text-left transition cursor-pointer lg:shrink', active === i ? 'border-line bg-white shadow-float' : 'border-transparent hover:bg-white/70')}>
              <span className="flex items-center gap-3">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl transition', active === i ? 'bg-ink text-white' : 'bg-soft text-ink-2')}><s.icon className="size-4" strokeWidth={1.75} /></span>
                <span className="text-[15px] font-medium whitespace-nowrap lg:whitespace-normal">{i + 1}. {s.label}</span>
              </span>
              {active === i && <p className="mt-2 hidden pl-11 text-[13.5px] leading-relaxed text-muted lg:block"><b className="block font-medium text-ink">{s.title}</b>{s.body}</p>}
              {active === i && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-soft"><span key={String(paused) + active} className="block h-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" style={{ animation: paused ? 'none' : 'fill 7.5s linear forwards', width: paused ? '100%' : undefined }} /></span>}
            </button>
          ))}
        </div>
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_80%_at_20%_0%,rgb(236_138_68/.16),transparent_70%),radial-gradient(60%_90%_at_90%_100%,rgb(165_187_252/.4),transparent_70%)] blur-xl" />
          <p className="mb-3 text-[14px] leading-relaxed text-muted lg:hidden"><b className="font-medium text-ink">{STEPS[active].title}.</b> {STEPS[active].body}</p>
          <AnimatePresence mode="wait"><motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>{mock}</motion.div></AnimatePresence>
        </div>
      </motion.div>
    </section>
  )
}

// ================================================================ 3. what you leave with (mouse spotlight cards)

function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (r) { ref.current!.style.setProperty('--x', `${e.clientX - r.left}px`); ref.current!.style.setProperty('--y', `${e.clientY - r.top}px`) }
  }
  return (
    <div ref={ref} onMouseMove={move} className={cn('group relative overflow-hidden rounded-card border border-line bg-white p-6 transition duration-300 hover:-translate-y-0.5 hover:border-line-2 hover:shadow-float', className)}>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(240px circle at var(--x,50%) var(--y,50%), rgb(236 138 68 / .13), rgb(165 187 252 / .22) 45%, transparent 70%)' }} />
      <div className="relative">{children}</div>
    </div>
  )
}

export function Outputs() {
  const groups: { tag: string; tone: string; items: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; title: string; body: string }[] }[] = [
    { tag: 'Understand', tone: 'bg-lavender/60 text-indigo', items: [
      { icon: Gauge, title: 'Evidence-backed validation', body: 'Five scores, every one citing its sources and quotes.' },
      { icon: MessagesSquare, title: 'A boardroom verdict', body: 'GO, PIVOT or KILL with the reasons and the objections.' },
      { icon: Radar, title: 'Competitive intelligence', body: 'Weekly brief, feature gaps, white space and a positioning map.' },
    ] },
    { tag: 'Build', tone: 'bg-[#e8f3dc] text-[#3f6b17]', items: [
      { icon: Layers, title: 'MVP blueprint', body: 'Features, user stories, schema, APIs, architecture and sprints.' },
      { icon: AppWindow, title: 'A working prototype', body: 'Designed, built, screenshot-reviewed and refined by an AI team.' },
      { icon: FlaskConical, title: 'Live experiments', body: 'Share it with real users and measure sign-ups and feedback.' },
    ] },
    { tag: 'Launch', tone: 'bg-[#fdebdc] text-[#a2511c]', items: [
      { icon: Palette, title: 'Brand & logo pack', body: 'Identity, guidelines PDF and SVG/PNG logos ready to use.' },
      { icon: Presentation, title: 'Investor deck', body: 'Ten slides as PPTX and PDF, with traction kept honest.' },
      { icon: CalendarDays, title: 'Ads, content & checklist', body: 'Ad creatives, a 30-day calendar and a launch checklist.' },
    ] },
  ]
  return (
    <section id="outputs" className="px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="What you leave with" title="Real deliverables, not chat transcripts" sub="Everything is a document, design or file you can download, share or ship." />
      <div className="mx-auto mt-14 grid max-w-[1000px] gap-8 md:grid-cols-3">
        {groups.map((g, gi) => (
          <motion.div key={g.tag} {...fade} transition={{ ...fade.transition, delay: gi * 0.08 }} className="space-y-4">
            <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-medium', g.tone)}>{g.tag}</span>
            {g.items.map((it) => (
              <Spotlight key={it.title}><it.icon className="size-5 text-ink-2" strokeWidth={1.6} /><p className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{it.title}</p><p className="mt-1.5 text-[14px] leading-relaxed text-muted">{it.body}</p></Spotlight>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ================================================================ 4. principles

export function Principles() {
  const items = [
    { icon: Gauge, t: 'Grounded by design', d: 'Every score cites the web sources and library documents behind it.' },
    { icon: ShieldAlert, t: 'Adversarial by default', d: 'A Failure Agent attacks every assumption before investors or markets do.' },
    { icon: Brain, t: 'Memory that compounds', d: 'Research, debates, brand decisions and feedback are recalled by every future agent.' },
    { icon: Sparkles, t: 'Honest about uncertainty', d: 'Confidence is capped when evidence is thin, and assets flag what is still an assumption.' },
  ]
  return (
    <section className="px-4 py-20 sm:px-6">
      <SectionTitle eyebrow="Principles" title="Built for founders who want the truth" />
      <div className="mx-auto mt-12 grid max-w-[1000px] gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((x, i) => (
          <motion.div key={x.t} {...fade} transition={{ ...fade.transition, delay: i * 0.07 }}>
            <span className="grid size-10 place-items-center rounded-2xl bg-[linear-gradient(135deg,#fdebdc,#e3e9fd)]"><x.icon className="size-5 text-ink-2" strokeWidth={1.6} /></span>
            <p className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{x.t}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{x.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
