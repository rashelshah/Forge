import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Brain, CircleHelp, FlaskConical, FileSearch, Layers, LayoutGrid, Megaphone, MessagesSquare, Plus, Radar, Rocket, Settings, Sparkles, TrendingUp, X, AppWindow, type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// A guided product tour: a spotlight on the real sidebar / header element each step talks about, with a card explaining it.

interface Step {
  id: string
  /** CSS selector of the element to highlight; none = a centred welcome card. */
  target?: string
  /** The target lives in the sidebar, which is a slide-over drawer on small screens. */
  nav?: boolean
  group?: string
  title: string
  body: string
  /** A concrete thing to try, shown as a tip. */
  tip?: string
  icon: LucideIcon
}

const nav = (to: string) => `[data-tour="${to}"]`

export const STEPS: Step[] = [
  { id: 'welcome', icon: Sparkles, title: 'Welcome to Forge',
    body: 'Forge is an AI venture studio. Describe a startup idea and a team of AI agents researches the market, debates it, plans the build, prototypes it and prepares your launch. This 2-minute tour shows where everything lives.' },
  { id: 'new', target: nav('new-venture'), icon: Plus, group: 'Start here', title: 'Create a venture',
    body: 'A venture is one startup idea. Describe it in a sentence, or let Forge discover opportunities for you. Every other feature works on a venture.',
    tip: 'Validation starts automatically as soon as the venture is created.' },
  { id: 'dashboard', target: nav('/app'), nav: true, icon: LayoutGrid, group: 'Home', title: 'Dashboard',
    body: 'Your portfolio at a glance: ventures and their scores, recent agent activity, running experiments and the latest market signals.' },
  { id: 'ventures', target: nav('/app/ventures'), nav: true, icon: Rocket, group: 'Venture Studio', title: 'Ventures',
    body: 'All your ideas. Open one to get its workspace: Overview, Boardroom, MVP, Prototype, Go-To-Market, Competitors, Experiments and Memory.',
    tip: 'Each Overview opens with an AI Founder Brief: what matters, the biggest risk and what to do next.' },
  { id: 'research', target: nav('/app/research'), nav: true, icon: FileSearch, group: 'Venture Studio', title: 'Research',
    body: 'Opportunity discovery scans communities, reviews and forums for real, evidenced problems. Every validation lives here too, scoring demand, competition, defensibility, revenue and founder fit, each backed by sources.' },
  { id: 'boardroom', target: nav('/app/boardroom'), nav: true, icon: MessagesSquare, group: 'Venture Studio', title: 'Boardroom',
    body: 'Six AI advisors, including a Failure Agent whose job is to find flaws, debate your question. In about 20 seconds you get a clear GO, PIVOT or KILL and what to do this week.',
    tip: 'Try "Should I build this?" or "How should I charge for it?"' },
  { id: 'mvp', target: nav('/app/mvp'), nav: true, icon: Layers, group: 'Venture Studio', title: 'MVP Architect',
    body: 'An AI CTO tells you what to build first and what to delay, what to buy instead of build, and gives you a week-by-week roadmap with costs and risks.' },
  { id: 'prototype', target: nav('/app/prototype'), nav: true, icon: AppWindow, group: 'Venture Studio', title: 'Prototype',
    body: 'A team of AI agents designs, builds and reviews a clickable prototype of your product. Change anything afterwards by describing it in plain English.' },
  { id: 'gtm', target: nav('/app/go-to-market'), nav: true, icon: Megaphone, group: 'Venture Studio', title: 'Go-To-Market',
    body: 'Your launch package: brand identity, positioning, logos, launch graphics, ads, an investor deck, a 30-day content calendar and a launch checklist.' },
  { id: 'lab', target: nav('/app/experiments'), nav: true, icon: FlaskConical, group: 'Venture Studio', title: 'Validation Lab',
    body: 'Share your prototype with real users, and log interviews and surveys. Forge analyses the results and tells you whether your assumption held.' },
  { id: 'intel', target: nav('/app/competitive-intelligence'), nav: true, icon: Radar, group: 'Intelligence', title: 'Competitive Intelligence',
    body: 'Track competitors and Forge watches their pricing, launches and news, finds white space nobody serves and recommends how to respond.' },
  { id: 'market', target: nav('/app/market-signals'), nav: true, icon: TrendingUp, group: 'Intelligence', title: 'Market Signals',
    body: 'An AI market radar: which trends matter, which opportunities are opening up and which threats are emerging for your venture.' },
  { id: 'memory', target: nav('/app/memory'), nav: true, icon: Brain, group: 'Intelligence', title: 'Venture Memory',
    body: 'The permanent memory of your startup: what you have learned, which assumptions held or failed, and why decisions were made. Future agent runs recall it.' },
  { id: 'settings', target: nav('/app/settings'), nav: true, icon: Settings, group: 'Account', title: 'Settings',
    body: 'Add your founder profile (skills, hours, capital) so fit scores and discovery are personal to you. Your plan and monthly agent-run usage live here too.' },
  { id: 'done', target: nav('help'), icon: CircleHelp, group: 'All set', title: 'You are ready',
    body: 'Create your first venture to see Forge work. You can replay this tour whenever you like from this button.' },
]

const CARD_W = 372
const PAD = 12

type Box = { left: number; top: number; width: number; height: number }

/** Follows the on-screen position of the first visible element matching `selector` (the sidebar exists twice: desktop and drawer). */
function useTarget(selector: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useEffect(() => {
    if (!selector) { setBox(null); return }
    let raf = 0, last = '', scrolled = false
    const tick = () => {
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      if (el) {
        if (!scrolled) { scrolled = true; el.scrollIntoView({ block: 'nearest' }) }
        const r = el.getBoundingClientRect()
        const key = `${r.left}|${r.top}|${r.width}|${r.height}`
        if (key !== last) { last = key; setBox({ left: r.left, top: r.top, width: r.width, height: r.height }) }
      } else if (last) { last = ''; setBox(null) }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [selector])
  return box
}

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

export function ProductTour({ open, onClose, onCreate, setSidebar }: {
  open: boolean
  onClose: (reason: 'done' | 'skipped') => void
  onCreate: () => void
  setSidebar: (open: boolean) => void
}) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  const box = useTarget(open ? step.target : undefined)
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null)
  const [cardH, setCardH] = useState(280)
  const [vw, setVw] = useState(() => window.innerWidth)
  const [vh, setVh] = useState(() => window.innerHeight)

  useEffect(() => { if (open) setI(0) }, [open])

  // On small screens the sidebar is a drawer: open it for sidebar steps, close it for the rest.
  useEffect(() => { if (open && !isDesktop()) setSidebar(!!step.nav) }, [open, step, setSidebar, vw])

  useEffect(() => {
    if (!open) return
    const resize = () => { setVw(window.innerWidth); setVh(window.innerHeight) }
    window.addEventListener('resize', resize)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('resize', resize); document.body.style.overflow = overflow }
  }, [open])

  // Measure the card that is actually on screen (a new one mounts after the old one finishes leaving).
  useLayoutEffect(() => {
    if (!cardEl) return
    const ro = new ResizeObserver(() => setCardH(cardEl.offsetHeight))
    ro.observe(cardEl)
    setCardH(cardEl.offsetHeight)
    return () => ro.disconnect()
  }, [cardEl])

  const finish = (reason: 'done' | 'skipped') => {
    if (!isDesktop()) setSidebar(false)
    document.querySelectorAll('aside nav').forEach((n) => { n.scrollTop = 0 }) // the tour scrolled the sidebar to reach its steps
    onClose(reason)
  }
  const next = () => (last ? finish('done') : setI((n) => Math.min(STEPS.length - 1, n + 1)))
  const back = () => setI((n) => Math.max(0, n - 1))

  // The key handler is installed once per open; it reads the latest finish() through a ref so it never acts on a stale render.
  const act = useRef({ finish, last })
  act.current = { finish, last }
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => {
      const { finish, last } = act.current
      if (e.key === 'Escape') finish('skipped')
      // Enter and Space are left to the focused button, so Enter on "Skip tour" skips instead of also advancing.
      else if (e.key === 'ArrowRight' && !last) setI((n) => n + 1)
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
      else if (e.key === 'Tab') {
        // Keep keyboard focus inside the tour: Tab must never reach the page behind it.
        const items = [...document.querySelectorAll<HTMLElement>('[role=dialog] button:not([disabled])')]
        if (!items.length) return
        const at = items.indexOf(document.activeElement as HTMLElement)
        const to = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at < 0 || at === items.length - 1 ? 0 : at + 1)
        e.preventDefault()
        items[to].focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); opener?.focus?.() }
  }, [open])

  if (!open) return null

  // Where the explanation card sits: beside the highlighted element when there is room, a bottom sheet on phones, centred when nothing is highlighted.
  const small = vw < 640
  const W = Math.min(CARD_W, vw - 2 * PAD)
  let pos: React.CSSProperties
  if (small) pos = box && box.top + box.height / 2 > vh * 0.5 ? { left: PAD, right: PAD, top: PAD } : { left: PAD, right: PAD, bottom: PAD } // never cover what is highlighted
  else if (!box) pos = { left: (vw - W) / 2, top: Math.max(PAD, (vh - cardH) / 2 - 20), width: W }
  else if (box.left + box.width + 20 + W <= vw - PAD) pos = { left: box.left + box.width + 20, top: Math.min(Math.max(PAD, box.top + box.height / 2 - cardH / 2), vh - cardH - PAD), width: W }
  else pos = { left: Math.min(Math.max(PAD, box.left + box.width / 2 - W / 2), vw - W - PAD), top: Math.min(box.top + box.height + 16, vh - cardH - PAD), width: W }

  const Icon = step.icon
  const centred = !box && !small

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Swallows clicks so the page underneath can't be used mid-tour. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {box ? (
        <div className="pointer-events-none absolute rounded-2xl transition-all duration-300 ease-out"
          style={{ left: box.left - 6, top: box.top - 5, width: box.width + 12, height: box.height + 10, boxShadow: '0 0 0 9999px rgba(16,18,31,0.62)' }}>
          <span className="absolute inset-0 rounded-2xl ring-2 ring-white/90" />
          <span className="absolute -inset-1 animate-pulse rounded-[20px] ring-2 ring-saffron/70" />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[#10121f]/62 backdrop-blur-[2px]" />
      )}

      <AnimatePresence mode="wait">
        <motion.div key={step.id} ref={setCardEl} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
          className={cn('absolute isolate overflow-y-auto rounded-3xl border border-white/60 bg-white shadow-[0_24px_70px_-12px_rgba(16,18,31,0.55)]', centred && 'text-center')} style={{ ...pos, maxHeight: vh - 2 * PAD }}>
          <div className="aurora-soft -z-10" />
          <div className="relative p-5 sm:p-6">
            <div className={cn('flex items-center gap-3', centred && 'flex-col')}>
              {step.id !== 'welcome' && <Icon className="size-[18px] shrink-0 text-ink-2" strokeWidth={1.75} />}
              <div className={cn('min-w-0 flex-1', centred && 'flex-none')}>
                {step.group && <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{step.group}</p>}
                <h2 className={cn('font-display leading-tight font-medium tracking-[-0.01em]', centred ? 'mt-2 text-[26px]' : 'text-[19px]')}>{step.title}</h2>
              </div>
              {!centred && <button onClick={() => finish('skipped')} aria-label="Close tour" className="-mt-1 -mr-1 self-start rounded-full p-1.5 text-muted transition hover:bg-soft hover:text-ink cursor-pointer"><X className="size-4" /></button>}
            </div>
            <p className={cn('mt-3 text-[14.5px] leading-relaxed text-ink-2', centred && 'mx-auto max-w-sm')}>{step.body}</p>
            {step.tip && <p className="mt-3 rounded-xl bg-[#f4f7fe] px-3 py-2 text-[13px] leading-snug text-ink-2"><span className="font-medium text-azure">Tip · </span>{step.tip}</p>}
            {step.id === 'welcome' && (
              <div className="mt-4 flex flex-wrap justify-center gap-x-1 gap-y-1.5 text-[11px] text-ink-2">
                {['Idea', 'Validate', 'Debate', 'Build', 'Launch'].map((s, n) => <span key={s} className="flex items-center gap-1"><span className="rounded-full border border-line bg-white px-2 py-1">{s}</span>{n < 4 && <ArrowRight className="size-3 text-faint" />}</span>)}
              </div>
            )}

            <div className="mt-5 flex items-center gap-1" aria-hidden>
              {STEPS.map((s, n) => <span key={s.id} className={cn('h-1 rounded-full transition-all', n === i ? 'w-5 bg-dark' : n < i ? 'w-1.5 bg-dark/40' : 'w-1.5 bg-line-2')} />)}
            </div>
            {last ? (
              <div className="mt-4 space-y-2">
                <Button className="w-full" onClick={() => { finish('done'); onCreate() }}><Plus />Create my first venture</Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={back}><ArrowLeft />Back</Button>
                  <span className="mr-auto text-xs whitespace-nowrap text-faint tabular-nums">{i + 1} of {STEPS.length}</span>
                  <Button variant="light" size="sm" autoFocus onClick={next}>Finish tour</Button>
                </div>
              </div>
            ) : (
              <div className={cn('mt-4 flex items-center gap-2', centred && 'flex-col-reverse sm:flex-row')}>
                <button onClick={() => finish('skipped')} className={cn('rounded-full px-3 py-2 text-[13px] whitespace-nowrap text-muted transition hover:bg-soft hover:text-ink cursor-pointer', centred && 'sm:mr-auto')}>Skip tour</button>
                {!centred && <span className="mr-auto text-xs whitespace-nowrap text-faint tabular-nums">{i + 1} of {STEPS.length}</span>}
                {i > 0 && <Button variant="outline" size="sm" onClick={back}><ArrowLeft />Back</Button>}
                <Button size="sm" autoFocus onClick={next} className={cn(centred && 'h-10 px-5 text-[15px]')}>{i === 0 ? 'Start the tour' : 'Next'}<ArrowRight /></Button>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}
