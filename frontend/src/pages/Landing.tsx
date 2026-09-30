import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, BookOpen, Boxes, Brain, Check, Compass, Database, FlaskConical, Gauge, Layers, LineChart, Lock, MessagesSquare, Radar, Rocket,
  ShieldAlert, Sparkles, Store, Wallet, Workflow, Zap,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AGENTS, AgentAvatar, GradientTile } from '@/components/bits'
import { Eyebrow, Logo, Ornament, Spark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import type { AgentKey } from '@/lib/types'
import { cn } from '@/lib/utils'

const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } } as const

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-colors duration-300', scrolled ? 'border-b border-line bg-white/90 backdrop-blur' : 'bg-transparent')}>
      <div className="mx-auto flex h-[68px] max-w-[1120px] items-center px-4 sm:px-6">
        <Logo />
        <nav className="ml-auto hidden items-center gap-8 text-[15px] text-ink md:flex">
          <a href="#platform" className="hover:opacity-70">Platform</a>
          <a href="#boardroom" className="hover:opacity-70">Boardroom</a>
          <a href="#developers" className="hover:opacity-70">Developers</a>
          <a href="#pricing" className="hover:opacity-70">Pricing</a>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-8">
          <Button asChild size="sm" className="h-9 px-5 text-[15px]"><Link to="/login">Log In</Link></Button>
          <Button asChild size="sm" variant="light" className="hidden h-9 px-5 text-[15px] sm:inline-flex"><Link to="/app">Open Studio</Link></Button>
        </div>
      </div>
    </header>
  )
}

const SOURCES = ['Reddit', 'Product Hunt', 'Hacker News', 'G2 Reviews', 'App Store', 'Y Combinator', 'Startup School', 'Paul Graham Essays', 'The Mom Test', 'Lean Startup']

function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-[150px] pb-10 text-center">
      <div className="absolute inset-x-0 top-0 -z-10 h-[760px]">
        <div className="aurora" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-canvas to-transparent" />
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="px-4">
        <Ornament className="mx-auto w-[170px]" />
        <div className="mt-7"><Eyebrow>The AI Venture Studio</Eyebrow></div>
        <h1 className="mx-auto mt-7 max-w-[860px] text-[44px] leading-[1.05] font-[425] tracking-[-0.035em] text-ink sm:text-[64px]">
          Build companies, not guesses
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-[1.75] text-ink-2 sm:text-lg">
          Discover real problems. Validate them with evidence.
          <br className="hidden sm:block" /> Debate in an AI boardroom. Ship what the market wants.
        </p>
        <div className="mt-9 flex justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-6 text-[15px]"><Link to="/app">Start a venture</Link></Button>
          <Button asChild size="lg" variant="white" className="h-12 px-6 text-[15px]"><a href="#boardroom">Watch the boardroom</a></Button>
        </div>
      </motion.div>

      <div className="mt-24">
        <p className="font-mono text-[12px] tracking-[0.2em] text-muted uppercase">Signals and wisdom from</p>
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-14 pr-14">
            {[...SOURCES, ...SOURCES].map((s, i) => (
              <span key={i} className={cn('font-display text-[22px] whitespace-nowrap text-[#8d8f98]', i % 3 === 0 && 'font-semibold tracking-[-0.03em]', i % 3 === 1 && 'font-medium tracking-tight', i % 3 === 2 && 'font-normal italic')}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- interactive product panel

const DEMO_VENTURES = [
  { name: 'CampusCart', idea: 'Marketplace for college students', icon: Store },
  { name: 'LedgerLeaf', idea: 'Bookkeeping for freelancers', icon: Wallet },
  { name: 'FieldVoice', idea: 'Voice CRM for field sales', icon: MessagesSquare },
]
const DEMO_DEBATE: { agent: AgentKey; text: string }[] = [
  { agent: 'ceo', text: 'Students already trade on group chats. Owning one campus gives us a wedge into 4,000 more.' },
  { agent: 'investor', text: 'Seasonality and graduation churn worry me. Where does the recurring revenue come from?' },
  { agent: 'growth', text: 'Campus ambassadors plus a referral queue — near-zero CAC for the first 10k users.' },
  { agent: 'failure', text: 'Students won’t pay, WhatsApp is free, and Facebook Marketplace already has liquidity. Why would anyone switch?' },
]
const TABS = [
  { id: 'board', label: 'Boardroom', icon: MessagesSquare },
  { id: 'validate', label: 'Validation', icon: Gauge },
  { id: 'discover', label: 'Discovery', icon: Compass },
  { id: 'mvp', label: 'MVP Architect', icon: Layers },
] as const

function PanelCenter({ tab }: { tab: (typeof TABS)[number]['id'] }) {
  if (tab === 'validate') {
    return (
      <div className="w-full max-w-[240px] space-y-3">
        {[['Demand', 74], ['Competition', 52], ['Defensibility', 61], ['Revenue', 58], ['Founder fit', 81]].map(([k, v], i) => (
          <div key={k}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{k}</span><span className="font-medium">{v}</span></div>
            <div className="h-1.5 rounded-full bg-white"><motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: i * 0.12, duration: 0.8 }} className="h-full rounded-full bg-[linear-gradient(90deg,#6a88e2,#4250d5)]" /></div>
          </div>
        ))}
      </div>
    )
  }
  if (tab === 'mvp') {
    return (
      <div className="grid grid-cols-3 gap-2 text-[11px] font-medium">
        {['Web app', 'API', 'Auth', 'Listings', 'Payments', 'Postgres'].map((n, i) => (
          <motion.span key={n} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }} className={cn('rounded-lg border px-2 py-2 text-center', i === 1 ? 'border-dark bg-dark text-white' : 'border-line bg-white')}>{n}</motion.span>
        ))}
      </div>
    )
  }
  const label = tab === 'board' ? 'Convene board' : 'Scan sources'
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid size-40 place-items-center">
        <div className="absolute inset-0 animate-pulse rounded-full bg-[radial-gradient(circle,#d8ecc0_0%,#b9da94_45%,#9cc96f_70%,transparent_72%)] blur-[1px]" />
        <div className="absolute inset-3 rounded-full bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,.85),transparent_60%)]" />
        <span className="relative rounded-full bg-white px-4 py-2 text-[13px] font-medium shadow-float">{label}</span>
      </div>
      <p className="mt-5 max-w-[180px] text-center text-xs text-muted">{tab === 'board' ? 'Six agents debate. The Chair decides.' : 'Mining Reddit, HN, G2 and more.'}</p>
    </div>
  )
}

function PanelRight({ tab }: { tab: (typeof TABS)[number]['id'] }) {
  const [shown, setShown] = useState(1)
  useEffect(() => {
    setShown(1)
    const t = setInterval(() => setShown((n) => (n >= DEMO_DEBATE.length ? n : n + 1)), 1400)
    return () => clearInterval(t)
  }, [tab])
  if (tab === 'discover') {
    return (
      <div className="space-y-2.5">
        {[['Textbook resale is chaotic', 'Pain 8/10 · Weekly · r/college'], ['Sublets rely on group chats', 'Pain 7/10 · Each semester · HN'], ['No trusted tutor pricing', 'Pain 6/10 · Monthly · App Store']].map(([t, m], i) => (
          <motion.div key={t} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.25 }} className="rounded-xl border border-line bg-white p-3">
            <p className="text-[13px] font-medium">{t}</p><p className="mt-0.5 text-[11px] text-muted">{m}</p>
          </motion.div>
        ))}
      </div>
    )
  }
  if (tab !== 'board') {
    return (
      <div className="space-y-2.5 text-[13px]">
        {(tab === 'validate'
          ? ['Demand 74 — 38 Reddit threads describe weekly resale pain', 'Competition 52 — Facebook Marketplace has liquidity, no campus trust', 'Founder fit 81 — two founders ran a campus club marketplace']
          : ['6 must-have features · 9 user stories', '5 tables · 11 REST endpoints', '4 sprints · 2 engineers · $220/mo infra']
        ).map((t, i) => (
          <motion.p key={t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.2 }} className="rounded-xl border border-mist bg-[#f4f7fe] px-3 py-2.5">{t}</motion.p>
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      <AnimatePresence>
        {DEMO_DEBATE.slice(0, shown).map((m) => (
          <motion.div key={m.agent} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
            <AgentAvatar agent={m.agent} size={24} />
            <div className={cn('rounded-xl rounded-tl-sm border px-3 py-2 text-[12.5px] leading-snug', AGENTS[m.agent].bubble)}>
              <p className="mb-0.5 text-[10px] font-medium text-muted">{AGENTS[m.agent].name}</p>{m.text}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function ProductPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('board')
  const [venture, setVenture] = useState(0)
  return (
    <section id="platform" className="px-4 py-24 sm:px-6">
      <motion.h2 {...fade} className="mx-auto max-w-xl text-center text-[34px] leading-[1.15] font-[450] sm:text-[40px]">The venture studio<br />founders build on</motion.h2>
      <motion.div {...fade} className="relative mx-auto mt-14 max-w-[1000px]">
        <div className="absolute -inset-x-10 top-1/3 -bottom-16 -z-10 rounded-[40px] bg-[linear-gradient(180deg,transparent,#c7d2fe_55%,#a5b4fc)] opacity-60 blur-2xl" />
        <div id="boardroom" className="overflow-hidden rounded-[20px] border border-[#e8effc] bg-white/80 shadow-float backdrop-blur">
          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-line bg-white p-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] whitespace-nowrap transition cursor-pointer', tab === id ? 'bg-soft font-medium text-indigo shadow-press-light' : 'text-ink-2 hover:bg-soft/60')}>
                <Icon className="size-4" strokeWidth={1.75} />{label}
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-[230px_1fr_300px]">
            <div className="border-b border-line p-5 md:border-r md:border-b-0">
              <p className="mb-4 text-[13px] text-muted">Choose a venture</p>
              <div className="space-y-1">
                {DEMO_VENTURES.map((v, i) => (
                  <button key={v.name} onClick={() => setVenture(i)} className={cn('flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition cursor-pointer', venture === i ? 'bg-[#fdf1e8]' : 'hover:bg-soft/70')}>
                    <v.icon className={cn('mt-0.5 size-4 shrink-0', venture === i ? 'text-saffron' : 'text-muted')} strokeWidth={1.75} />
                    <span><span className={cn('block text-[14px]', venture === i ? 'font-medium text-[#a2511c]' : 'text-ink')}>{v.name}</span><span className="block text-[11px] text-muted">{v.idea}</span></span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dot-grid flex min-h-[340px] items-center justify-center bg-canvas p-8">
              <PanelCenter tab={tab} />
            </div>
            <div className="flex flex-col border-t border-line p-5 md:border-t-0 md:border-l">
              <div className="mb-4 flex items-center justify-between text-[13px]"><span className="text-muted">Illustrative output</span><span className="flex items-center gap-1.5 text-muted"><Spark className="size-3" />{DEMO_VENTURES[venture].name}</span></div>
              <div className="flex-1"><PanelRight tab={tab} /></div>
              <Button asChild className="mt-5 w-full"><Link to="/app">Build your own venture</Link></Button>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ---------------------------------------------------------------- developers

function Developers() {
  const cards = [
    { title: 'REST API', body: 'Every agent is an endpoint', icon: Zap },
    { title: 'Streaming', body: 'Debates stream over SSE', icon: Workflow },
    { title: 'Venture memory', body: 'pgvector-backed recall', icon: Brain },
    { title: 'Knowledge RAG', body: 'Bring your own playbooks', icon: BookOpen },
    { title: 'Monitoring', body: 'Daily competitor sweeps', icon: Radar },
    { title: 'Prototypes', body: 'Clickable apps you can refine', icon: FlaskConical },
  ]
  return (
    <section id="developers" className="px-4 py-24 sm:px-6">
      <motion.h2 {...fade} className="mx-auto max-w-xl text-center text-[34px] leading-[1.15] font-[450] sm:text-[40px]">Build anything with<br />Foundry agents</motion.h2>
      <div className="mx-auto mt-14 grid max-w-[1000px] gap-4 md:grid-cols-[1.1fr_1fr]">
        <motion.div {...fade} className="rounded-card border border-[#e8effc] bg-[linear-gradient(180deg,#fff_40%,#e8effc)] p-6">
          <div className="rounded-xl border border-line bg-white p-5 font-mono text-[12.5px] leading-[1.9]">
            <p><span className="text-[#a2511c]">const</span> res = <span className="text-[#a2511c]">await</span> fetch(<span className="text-leaf">'/api/ventures/:id/boardroom'</span>, {'{'}</p>
            <p className="pl-4">method: <span className="text-leaf">'POST'</span>,</p>
            <p className="pl-4">body: JSON.stringify({'{'}</p>
            <p className="pl-8">question: <span className="text-leaf">'Should we launch B2B first?'</span>,</p>
            <p className="pl-8">rounds: <span className="text-azure">2</span>,</p>
            <p className="pl-4">{'}'}),</p>
            <p>{'}'})</p>
            <p className="text-faint">// → CEO, Investor, Product, Growth,</p>
            <p className="text-faint">//   Technical and Failure agents stream in</p>
          </div>
          <Button asChild className="mt-6 w-full sm:w-auto"><Link to="/app">Open the studio & get started</Link></Button>
        </motion.div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map((c, i) => (
            <motion.div key={c.title} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="rounded-card border border-line bg-white p-4">
              <c.icon className="size-4 text-azure" strokeWidth={1.75} />
              <p className="mt-3 text-[16px] font-medium tracking-[-0.01em]">{c.title}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">{c.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- founders can

const GLYPHS = '✦ $ ↗ ∑ % ◎ → ⌘ ≈ △ ✧ ∞ ± ↘ ◇ ⊕'.split(' ')

function FoundersCan() {
  const chips = [
    { t: 'Demand', v: '78 / 100', c: 'left-[8%] top-[14%]' },
    { t: 'CAC payback', v: '4.2 months', c: 'right-[10%] top-[22%]' },
    { t: 'W4 retention', v: '41%', c: 'left-[18%] bottom-[18%]' },
    { t: 'Boardroom', v: 'PIVOT · 72%', c: 'right-[16%] bottom-[12%]' },
  ]
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-[1000px] gap-4 md:grid-cols-[320px_1fr]">
        <motion.div {...fade} className="flex flex-col rounded-card border border-line bg-white p-7">
          <h2 className="text-[36px] leading-[1.1] font-[450]">Evidence over opinion</h2>
          <p className="mt-5 flex-1 text-[16px] leading-[1.7] text-ink-2">
            From a spark of an idea to a funded roadmap, every score, verdict and plan in Foundry is grounded in cited evidence and
            remembered forever — so each decision makes the next one smarter.
          </p>
          <Button asChild className="mt-8 w-fit"><Link to="/app">Explore Foundry</Link></Button>
        </motion.div>
        <motion.div {...fade} className="relative min-h-[360px] overflow-hidden rounded-card border border-line bg-white">
          <div className="absolute inset-0 grid grid-cols-8 content-center gap-y-5 p-6 text-center font-display text-2xl text-[#e3e5ef] select-none sm:grid-cols-12">
            {Array.from({ length: 96 }, (_, i) => <span key={i} className={i % 7 === 0 ? 'text-[#f3cfb2]' : i % 11 === 0 ? 'text-[#c7d2fe]' : ''}>{GLYPHS[i % GLYPHS.length]}</span>)}
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.95)_20%,transparent_75%)]" />
          {chips.map((c, i) => (
            <motion.div key={c.t} className={cn('absolute rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-float', c.c)}
              animate={{ y: [0, -6, 0] }} transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}>
              <p className="text-[11px] text-muted">{c.t}</p>
              <p className="font-display text-lg font-medium tracking-tight">{c.v}</p>
            </motion.div>
          ))}
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-ink shadow-float"><Spark className="size-8" /></span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- pillars

function Pillars() {
  const items = [
    ['Grounded by design', 'Every validation score cites the web sources and library documents behind it.'],
    ['Adversarial by default', 'The Failure Agent attacks every assumption before investors or markets do.'],
    ['Memory that compounds', 'Research, debates, experiments and feedback are recalled by every future agent.'],
    ['Private by architecture', 'Row-level security on every table. Your ventures are yours alone.'],
  ]
  return (
    <section className="px-4 py-24 sm:px-6">
      <motion.h2 {...fade} className="text-center text-[34px] leading-[1.15] font-[450] sm:text-[40px]">Powering evidence-first founders</motion.h2>
      <div className="mx-auto mt-14 grid max-w-[1000px] items-center gap-10 md:grid-cols-2">
        <motion.div {...fade} className="relative aspect-[4/3.4] overflow-hidden rounded-card bg-[linear-gradient(180deg,#e5e9fd,#c7d0fb)]">
          <svg viewBox="0 0 400 340" className="absolute inset-0 size-full" aria-hidden>
            <defs>
              <linearGradient id="petal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#a5b4fc" stopOpacity=".6" /></linearGradient>
            </defs>
            {[-60, -30, 0, 30, 60].map((a) => (
              <path key={a} d="M200 330 C 140 250, 150 170, 200 110 C 250 170, 260 250, 200 330Z" fill="url(#petal)" opacity={a === 0 ? 0.95 : 0.55} transform={`rotate(${a} 200 330)`} />
            ))}
            <circle cx="200" cy="80" r="22" fill="#fff" opacity=".85" />
            <circle cx="200" cy="80" r="34" fill="none" stroke="#fff" opacity=".6" />
            <circle cx="200" cy="80" r="50" fill="none" stroke="#fff" opacity=".3" />
          </svg>
        </motion.div>
        <div className="space-y-9">
          {items.map(([t, d], i) => (
            <motion.div key={t} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} className="flex gap-4">
              <Spark className="mt-1 size-5 shrink-0" />
              <div>
                <p className="text-[19px] font-medium tracking-[-0.01em]">{t}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCards() {
  const cards: { tone: 'lavender' | 'saffron' | 'leaf'; icon: ReactNode; title: string; body: string; bullets: [typeof Rocket, string][] }[] = [
    {
      tone: 'lavender', icon: <Compass />, title: 'Opportunity discovery',
      body: 'Agents mine Reddit, Product Hunt, Hacker News, G2 and App Store reviews for recurring pain, then size it.',
      bullets: [[LineChart, 'Pain × frequency scoring'], [Database, 'Bottom-up market sizing'], [Gauge, 'Five-score validation engine']],
    },
    {
      tone: 'saffron', icon: <MessagesSquare />, title: 'Multi-agent boardroom',
      body: 'CEO, Investor, Product, Growth, Technical and Failure agents debate your venture and the Chair issues a verdict.',
      bullets: [[ShieldAlert, 'Failure Agent stress tests'], [Sparkles, 'GO · PIVOT · KILL verdicts'], [Brain, 'Transcripts stored forever']],
    },
    {
      tone: 'leaf', icon: <Radar />, title: 'Continuous monitoring',
      body: 'Competitor pricing, launches, funding and sentiment are tracked daily with a recommended response for each move.',
      bullets: [[Radar, 'Competitor intelligence'], [FlaskConical, 'Live experiment tracking'], [Boxes, 'MVP plans & working prototypes']],
    },
  ]
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="mx-auto grid max-w-[1000px] gap-6 md:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div key={c.title} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }}>
            <GradientTile tone={c.tone} icon={c.icon} />
            <h3 className="mt-6 text-[20px] font-medium tracking-[-0.015em]">{c.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{c.body}</p>
            <ul className="mt-5 space-y-3">
              {c.bullets.map(([Icon, t]) => <li key={t} className="flex items-center gap-2.5 text-[14px] text-ink-2"><Icon className="size-4 text-muted" strokeWidth={1.75} />{t}</li>)}
            </ul>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Pricing() {
  const plans = [
    { name: 'Free', price: '$0', note: 'For exploring ideas', features: ['3 ventures', '150 agent runs / month', 'Boardroom & validation', 'Foundry library'] },
    { name: 'Pro', price: '$49', note: 'For active founders', features: ['25 ventures', '3,000 agent runs / month', 'Daily competitor monitoring', 'Hosted experiments', 'Private knowledge base'], hl: true },
    { name: 'Studio', price: '$199', note: 'For studios & accelerators', features: ['Unlimited ventures', '20,000 agent runs / month', 'Team workspaces', 'Priority models'] },
  ]
  return (
    <section id="pricing" className="px-4 py-24 sm:px-6">
      <motion.h2 {...fade} className="text-center text-[34px] leading-[1.15] font-[450] sm:text-[40px]">Enterprise-grade.<br />Founder-priced.</motion.h2>
      <div className="mx-auto mt-14 grid max-w-[1000px] gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <motion.div key={p.name} {...fade} className={cn('flex flex-col rounded-card border bg-white p-7', p.hl ? 'border-periwinkle shadow-[0_20px_60px_-30px_#6a88e2]' : 'border-line')}>
            <div className="flex items-center justify-between"><p className="text-[17px] font-medium">{p.name}</p>{p.hl && <span className="rounded-full bg-lavender/60 px-2.5 py-0.5 text-xs text-indigo">Most popular</span>}</div>
            <p className="mt-1 text-sm text-muted">{p.note}</p>
            <p className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em]">{p.price}<span className="ml-1 text-sm text-muted">/ month</span></p>
            <ul className="mt-6 flex-1 space-y-2.5 text-[14px] text-ink-2">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 text-leaf" />{f}</li>)}</ul>
            <Button asChild variant={p.hl ? 'dark' : 'light'} className="mt-8"><Link to="/app">Get started</Link></Button>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-28 pb-32 text-center sm:px-6">
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[520px] rotate-180"><div className="aurora opacity-80" /></div>
      <motion.div {...fade}>
        <Eyebrow>Your next company deserves a board</Eyebrow>
        <h2 className="mx-auto mt-6 max-w-2xl text-[40px] leading-[1.08] font-[425] tracking-[-0.03em] sm:text-[56px]">Stop guessing. Start compounding.</h2>
        <div className="mt-9 flex justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-6 text-[15px]"><Link to="/app">Start free <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="white" className="h-12 px-6 text-[15px]"><Link to="/login">Log in</Link></Button>
        </div>
      </motion.div>
    </section>
  )
}

function Footer() {
  const cols: Record<string, [string, string][]> = {
    Platform: [['Opportunity Discovery', '/app/research'], ['Validation Engine', '/app/ventures'], ['Boardroom', '/app/boardroom'], ['MVP Architect', '/app/ventures']],
    Intelligence: [['Competitor Radar', '/app/competitors'], ['Experiment Center', '/app/experiments'], ['Activity Feed', '/app/activity'], ['Knowledge Base', '/app/knowledge']],
    Company: [['Pricing', '#pricing'], ['Developers', '#developers'], ['Log in', '/login'], ['Open the studio', '/app']],
  }
  return (
    <footer className="border-t border-line bg-white px-4 pt-16 pb-10 sm:px-6">
      <div className="mx-auto grid max-w-[1120px] gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">Foundry AI — the AI venture studio for startup discovery, validation and execution.</p>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted"><Lock className="size-3.5" />Row-level security · Your data never trains models</p>
        </div>
        {Object.entries(cols).map(([h, items]) => (
          <div key={h}>
            <p className="text-sm font-medium">{h}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">{items.map(([label, to]) => <li key={label}>{to.startsWith('#') ? <a href={to} className="hover:text-ink">{label}</a> : <Link to={to} className="hover:text-ink">{label}</Link>}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1120px] flex-col justify-between gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row">
        <span>© {new Date().getFullYear()} Foundry AI</span>
        <span>Built with LangGraph · pgvector · Supabase</span>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <Nav />
      <Hero />
      <ProductPanel />
      <Developers />
      <FoundersCan />
      <Pillars />
      <FeatureCards />
      <Pricing />
      <Cta />
      <Footer />
    </div>
  )
}
