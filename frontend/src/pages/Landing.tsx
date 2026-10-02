import { motion } from 'framer-motion'
import { ArrowRight, Check, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Eyebrow, Logo, Ornament } from '@/components/brand'
import { HowItWorks, Outputs, Principles, TryBoardroom } from '@/components/landing-demos'
import { AgentFeatures } from '@/components/agent-features'
import { Button } from '@/components/ui/button'
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
          <a href="#how" className="hover:opacity-70">Platform</a>
          <a href="#try" className="hover:opacity-70">Boardroom</a>
          <a href="#outputs" className="hover:opacity-70">Outputs</a>
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
          The Operating System for Startup Creation
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-[17px] leading-[1.75] text-ink-2 sm:text-lg">
          AI agents discover opportunities, challenge assumptions, and build launch-ready ventures.
          <br className="hidden sm:block" />
        </p>
        <div className="mt-9 flex justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-6 text-[15px]"><Link to="/app">Start a venture</Link></Button>
          <Button asChild size="lg" variant="white" className="h-12 px-6 text-[15px]"><a href="#try">Watch the boardroom</a></Button>
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

function Pricing() {
  const plans = [
    { name: 'Free', price: '$0', note: 'For exploring ideas', features: ['5 ventures', '150 agent runs / month', 'Boardroom & validation', 'Forge library'] },
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
    Intelligence: [['Competitive Intelligence', '/app/competitive-intelligence'], ['Market Signals', '/app/market-signals'], ['Venture Memory', '/app/memory'], ['Experiment Center', '/app/experiments'], ['Activity Feed', '/app/activity'], ['Knowledge Base', '/app/knowledge']],
    Company: [['Pricing', '#pricing'], ['How it works', '#how'], ['Log in', '/login'], ['Open the studio', '/app']],
  }
  return (
    <footer className="border-t border-line bg-white px-4 pt-16 pb-10 sm:px-6">
      <div className="mx-auto grid max-w-[1120px] gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">Forge AI — the AI venture studio for startup discovery, validation and execution.</p>
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
        <span>© {new Date().getFullYear()} Forge AI</span>
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
      <TryBoardroom />
      <HowItWorks />
      <AgentFeatures />
      <Outputs />
      <Principles />
      <Pricing />
      <Cta />
      <Footer />
    </div>
  )
}
