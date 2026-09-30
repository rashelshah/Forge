import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, AppWindow, Brain, CalendarDays, Check, Compass, FileText, FlaskConical, Gauge, Layers, ListChecks, Megaphone, MessagesSquare,
  Palette, Play, Presentation, Radar, RotateCcw, ShieldAlert, Sparkles, Store, Target, Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AGENTS, AgentAvatar } from '@/components/bits'
import { Spark } from '@/components/brand'
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
const TONE: Record<Decision, string> = { GO: 'bg-[#e8f3dc] text-[#3f6b17]', PIVOT: 'bg-[#fbf0d9] text-[#8a5e12]', KILL: 'bg-[#fbe4e0] text-rose' }
const STAGES = ['Scanning the market', 'Scoring the idea', 'Board debate', 'Verdict']

export function TryBoardroom() {
  const [idx, setIdx] = useState(0)
  const [stage, setStage] = useState(0) // 0 idle, 1-4 running, 5 done
  const [msgs, setMsgs] = useState(0)
  const idea = IDEAS[idx]
  const timers = useRef<number[]>([])
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => clear, [])
  const pick = (i: number) => { clear(); setIdx(i); setStage(0); setMsgs(0) }
  const run = () => {
    clear(); setStage(1); setMsgs(0)
    const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }
    at(1300, () => setStage(2))
    at(2600, () => setStage(3))
    for (let i = 1; i <= 4; i++) at(2600 + i * 1100, () => setMsgs(i))
    at(2600 + 5 * 1100, () => setStage(4))
  }
  const v = idea.verdict

  return (
    <section id="try" className="px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="Try it" title={<>Watch an idea get <span className="text-saffron">cross-examined</span></>} sub="Pick an idea and convene the board. Foundry scores it on evidence, then six AI advisors debate it — and sometimes the answer is no." />
      <motion.div {...fade} className="mx-auto mt-12 grid max-w-[1000px] overflow-hidden rounded-[22px] border border-line bg-white shadow-float md:grid-cols-[320px_1fr]">
        <div className="border-b border-line bg-canvas p-5 md:border-r md:border-b-0">
          <p className="text-[13px] text-muted">1 · Choose an idea</p>
          <div className="mt-3 space-y-2">
            {IDEAS.map((x, i) => (
              <button key={x.id} onClick={() => pick(i)} className={cn('flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition cursor-pointer', idx === i ? 'border-saffron/40 bg-[#fdf6ef] shadow-press-light' : 'border-line bg-white hover:border-line-2')}>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', idx === i ? 'bg-saffron text-white' : 'bg-soft text-ink-2')}><x.icon className="size-4" strokeWidth={1.75} /></span>
                <span className="min-w-0"><span className="block text-[14px] font-medium">{x.name}</span><span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted">{x.idea}</span></span>
              </button>
            ))}
          </div>
          <Button onClick={run} disabled={stage > 0 && stage < 4} className="mt-5 w-full">
            {stage === 0 ? <><Play />Convene the board</> : stage < 4 ? <>Board in session…</> : <><RotateCcw />Run it again</>}
          </Button>
          <p className="mt-3 text-center text-[11px] text-faint">Illustrative run · real ventures use live web evidence</p>
        </div>

        <div className="dot-grid relative min-h-[470px] bg-white p-5 sm:p-7">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s, i) => (
              <span key={s} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition', stage > i + 1 || stage === 5 ? 'border-[#d8e9c2] bg-[#f5faef] text-[#3f6b17]' : stage === i + 1 ? 'border-periwinkle bg-mist text-indigo' : 'border-line bg-white text-faint')}>
                {(stage > i + 1 || stage === 5) ? <Check className="size-3" /> : <span className={cn('size-1.5 rounded-full', stage === i + 1 ? 'animate-pulse bg-azure' : 'bg-line-2')} />}{s}
              </span>
            ))}
          </div>

          {stage === 0 && (
            <div className="grid h-[360px] place-items-center text-center">
              <div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink"><Spark className="size-7" /></span>
                <p className="mt-4 text-[17px] font-medium">{idea.name}</p><p className="mx-auto mt-1 max-w-xs text-sm text-muted">{idea.idea}</p>
                <p className="mt-5 text-[13px] text-muted">Press “Convene the board” to begin.</p></div>
            </div>
          )}

          {stage >= 1 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-[12px] font-medium text-muted">Evidence scores</p>
                <div className="mt-3 space-y-3">
                  {idea.scores.map(([k, n], i) => (
                    <div key={k}>
                      <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{k}</span><span className="font-medium tabular-nums">{stage >= 2 ? n : '—'}</span></div>
                      <div className="h-1.5 rounded-full bg-soft"><motion.div initial={{ width: 0 }} animate={{ width: stage >= 2 ? `${n}%` : 0 }} transition={{ delay: i * 0.1, duration: 0.7 }} className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" /></div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 rounded-xl bg-canvas px-3 py-2 text-[12px] text-muted">{stage === 1 ? 'Mining Reddit, Hacker News, G2 and the App Store…' : `Cited: ${idea.evidence}`}</p>
              </div>
              <div className="min-h-[260px]">
                <p className="text-[12px] font-medium text-muted">The boardroom</p>
                <div className="mt-3 space-y-2.5">
                  <AnimatePresence>
                    {idea.debate.slice(0, stage >= 3 ? Math.max(msgs, stage === 4 ? 4 : 0) : 0).map((m) => (
                      <motion.div key={m.agent + m.text} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
                        <AgentAvatar agent={m.agent} size={24} />
                        <div className={cn('rounded-xl rounded-tl-sm border px-3 py-2 text-[12.5px] leading-snug', AGENTS[m.agent].bubble)}><p className="mb-0.5 text-[10px] font-medium text-muted">{AGENTS[m.agent].name}</p>{m.text}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {stage < 3 && <p className="text-[12px] text-faint">Waiting for the scores…</p>}
                </div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {stage >= 4 && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-float">
                <span className={cn('rounded-xl px-4 py-2 font-display text-2xl font-medium tracking-tight', TONE[v.decision])}>{v.decision}</span>
                <div className="min-w-0 flex-1"><p className="text-[15px] font-medium">{v.headline}</p><p className="text-[13px] text-muted">{v.next}</p></div>
                <div className="text-right"><p className="text-xl font-medium tabular-nums">{v.confidence}%</p><p className="text-[10px] tracking-wide text-muted uppercase">confidence</p></div>
                <Button asChild size="sm"><Link to="/app">Run it on your idea <ArrowRight /></Link></Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  )
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
