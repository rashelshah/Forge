import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AppWindow, Bell, Brain, CircleHelp, FileSearch, FlaskConical, Layers, LayoutGrid, LogOut, Megaphone, PanelLeft, Menu, MessagesSquare, Plus, Radar, Rocket, Settings, TrendingUp, X, type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useOutletContext } from 'react-router'
import { Loading } from '@/components/bits'
import { Logo } from '@/components/brand'
import { NewVentureDialog } from '@/components/NewVentureDialog'
import { ProductTour } from '@/components/tour'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAction, useConfig, useMe } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import type { Notification } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

// `tab` items are tabs of a venture workspace: they open the current venture (or the newest one) on that tab.
type NavItem = { to: string; label: string; icon: LucideIcon; tab?: string }
const NAV: { label?: string; items: NavItem[] }[] = [
  { items: [{ to: '/app', label: 'Dashboard', icon: LayoutGrid }] },
  { label: 'Venture Studio', items: [
    { to: '/app/ventures', label: 'Ventures', icon: Rocket },
    { to: '/app/research', label: 'Research', icon: FileSearch },
    { to: '/app/boardroom', label: 'Boardroom', icon: MessagesSquare },
    { to: '/app/mvp', label: 'MVP Architect', icon: Layers, tab: 'mvp' },
    { to: '/app/prototype', label: 'Prototype', icon: AppWindow, tab: 'prototype' },
    { to: '/app/go-to-market', label: 'Go-To-Market', icon: Megaphone, tab: 'gtm' },
    { to: '/app/experiments', label: 'Validation Lab', icon: FlaskConical },
  ] },
  { label: 'Intelligence', items: [
    { to: '/app/competitive-intelligence', label: 'Competitive Intelligence', icon: Radar },
    { to: '/app/market-signals', label: 'Market Signals', icon: TrendingUp },
    { to: '/app/memory', label: 'Venture Memory', icon: Brain },
  ] },
  { label: 'Operations', items: [
    { to: '/app/activity', label: 'Agent Activity', icon: Activity },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ] },
]
const TABS = new Set(NAV.flatMap((g) => g.items).flatMap((i) => (i.tab ? [i.tab] : [])))

type ShellCtx = { newVenture: () => void }
export const useShell = () => useOutletContext<ShellCtx>()

function AiStatus() {
  const { data } = useConfig()
  const mode = data?.ai.mode
  const [dot, label] = mode === 'live' ? ['bg-[#6fa33a]', 'Agents live'] : mode === 'demo' ? ['bg-amber', 'Demo mode'] : mode === 'offline' ? ['bg-rose', 'AI offline'] : ['bg-faint', 'Connecting']
  return (
    <span className="hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 sm:inline-flex" title={mode === 'demo' ? 'Add a free GROQ_API_KEY to .env for live agents' : undefined}>
      <span className={cn('size-1.5 rounded-full', dot, mode === 'live' && 'animate-pulse')} />
      {label}
    </span>
  )
}

function Notifications() {
  const nav = useNavigate()
  const { data = [] } = useQuery({ queryKey: ['notifications'], queryFn: () => api<Notification[]>('/notifications'), refetchInterval: 30_000 })
  const read = useAction((ids?: string[]) => api('/notifications/read', { ids }), [['notifications']])
  const unread = data.filter((n) => !n.read).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-full border border-line bg-white text-ink-2 hover:text-ink cursor-pointer" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-saffron px-1 text-[10px] leading-4 font-medium text-white">{unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && <button className="text-xs text-azure hover:underline cursor-pointer" onClick={() => read.mutate(undefined)}>Mark all read</button>}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {data.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Agents will notify you about verdicts, competitor moves and experiment results.</p>}
          {data.map((n) => (
            <button key={n.id} className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-canvas cursor-pointer"
              onClick={() => { if (!n.read) read.mutate([n.id]); if (n.link) nav(n.link) }}>
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-saffron')} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{n.title}</span>
                {n.body && <span className="mt-0.5 line-clamp-2 block text-xs whitespace-pre-line text-muted">{n.body}</span>}
                <span className="mt-1 block text-[11px] text-faint">{ago(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Sidebar({ onNavigate, collapsed = false, onToggle }: { onNavigate?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  const { data: me } = useMe()
  const { signOut, demo } = useAuth()
  const pct = me ? Math.min(100, (100 * me.usage.agentRuns) / me.limits.agentRuns) : 0
  const { pathname, search } = useLocation()
  const ventureId = useMatch('/app/ventures/:id')?.params.id
  const tab = new URLSearchParams(search).get('tab') ?? ''
  const active = ({ to, tab: t }: NavItem) =>
    to === '/app' ? pathname === to
    : t ? pathname === to || (!!ventureId && tab === t)
    : to === '/app/ventures' ? pathname === to || (!!ventureId && !TABS.has(tab))
    : pathname === to || pathname.startsWith(`${to}/`)
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center', collapsed ? 'h-16 justify-center' : 'h-16 justify-between pr-3 pl-5')}>
        {!collapsed && <Logo to="/app" />}
        {onToggle && (
          <button onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid size-8 place-items-center rounded-lg text-ink-2 transition hover:bg-soft hover:text-ink cursor-pointer">
            <PanelLeft className="size-[19px]" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((group, i) => (
          <div key={i} className={cn('space-y-0.5', i > 0 && 'mt-3 border-t border-line pt-3')}>
            {group.label && !collapsed && <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{group.label}</p>}
            {group.items.map((item) => {
              const { label, icon: Icon } = item
              const on = active(item)
              return (
                <Link key={item.to} data-tour={item.to} to={item.tab && ventureId ? `/app/ventures/${ventureId}?tab=${item.tab}` : item.to} onClick={onNavigate} aria-current={on ? 'page' : undefined}
                  title={collapsed ? label : undefined} aria-label={label}
                  className={cn('flex items-center rounded-xl py-2 text-[14px] transition', collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    on ? 'bg-soft font-medium text-ink shadow-press-light' : 'text-ink-2 hover:bg-soft/60 hover:text-ink')}>
                  <Icon className="size-[17px] shrink-0" strokeWidth={1.75} />
                  {!collapsed && label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className={cn('space-y-3 p-3', collapsed && 'px-2')}>
        {me && !collapsed && (
          <div className="rounded-2xl border border-line bg-[linear-gradient(180deg,#fff,#f5f7fe)] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{me.limits.name} plan</span>
              <NavLink to="/app/settings" onClick={onNavigate} className="text-azure hover:underline">Upgrade</NavLink>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-[11px] text-muted">{me.usage.agentRuns} / {me.limits.agentRuns} agent runs this month</p>
          </div>
        )}
        <div className={cn('flex items-center rounded-xl py-1.5', collapsed ? 'justify-center' : 'gap-3 px-2')}>
          <span title={collapsed ? me?.full_name || me?.email : undefined} className="grid size-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#ec8a44,#6a88e2)] text-xs font-medium text-white">
            {(me?.full_name || me?.email || 'F').slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{me?.full_name || 'Founder'}</p>
                <p className="truncate text-xs text-muted">{demo ? 'Local demo workspace' : me?.email}</p>
              </div>
              {!demo && <button onClick={signOut} className="rounded-lg p-1.5 text-muted hover:bg-soft hover:text-ink cursor-pointer" aria-label="Sign out"><LogOut className="size-4" /></button>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const tourKey = (id: string) => `forge:tour:${id}`
const tourSeen = (id: string) => { try { return localStorage.getItem(tourKey(id)) === 'done' } catch { return false } }

export function AppShell() {
  const [mobile, setMobile] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const { data: me } = useMe()
  const qc = useQueryClient()
  // A brand-new founder (no ventures yet, tour never finished or skipped) is greeted with the tour. Finishing or skipping it is remembered
  // on the account (and in this browser, in case that save fails), so it never reappears; the ? button replays it.
  useEffect(() => {
    if (!me || me.settings.onboarded || me.usage.ventures > 0 || tourSeen(me.id)) return
    const t = setTimeout(() => setTourOpen(true), 700)
    return () => clearTimeout(t)
  }, [me])
  const closeTour = () => {
    setTourOpen(false)
    if (!me) return
    try { localStorage.setItem(tourKey(me.id), 'done') } catch { /* private mode */ }
    if (!me.settings.onboarded) api('/me', { settings: { onboarded: true } }, 'PATCH').then(() => qc.invalidateQueries({ queryKey: ['me'] })).catch(() => {})
  }
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('forge:sidebar') === 'collapsed' } catch { return false } })
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem('forge:sidebar', c ? 'expanded' : 'collapsed') } catch { /* private mode */ } return !c })
  const wide = collapsed && !tourOpen // the tour needs the sidebar labels visible
  const style = { '--sbw': wide ? '5rem' : '16rem' } as React.CSSProperties
  return (
    <div className="relative min-h-screen bg-canvas transition-[padding] duration-200 lg:pl-[var(--sbw)]" style={style}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden border-r border-line bg-white/85 backdrop-blur transition-[width] duration-200 lg:block lg:w-[var(--sbw)]">
        <Sidebar collapsed={wide} onToggle={toggle} />
      </aside>
      <AnimatePresence>
        {mobile && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-[#10121f]/25 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-float lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
              <button className="absolute top-4 right-4 rounded-full p-1.5 text-muted hover:bg-soft cursor-pointer" onClick={() => setMobile(false)} aria-label="Close menu"><X className="size-4" /></button>
              <Sidebar onNavigate={() => setMobile(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line/70 bg-canvas/80 px-4 backdrop-blur sm:px-8">
        <button className="rounded-full p-2 text-ink-2 hover:bg-soft lg:hidden cursor-pointer" onClick={() => setMobile(true)} aria-label="Open menu"><Menu className="size-5" /></button>
        <Logo to="/app" className="lg:hidden" />
        <div className="ml-auto flex items-center gap-2">
          <AiStatus />
          <button data-tour="help" onClick={() => setTourOpen(true)} aria-label="Take the product tour" title="Product tour"
            className="grid size-9 place-items-center rounded-full border border-line bg-white text-ink-2 hover:text-ink cursor-pointer"><CircleHelp className="size-4" /></button>
          <Notifications />
          <Button data-tour="new-venture" size="sm" onClick={() => setNewOpen(true)} className="h-9"><Plus />New venture</Button>
        </div>
      </header>

      <main className="relative isolate">
        <div className="page-wash -z-10 h-80" />
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
          <Suspense fallback={<Loading />}><Outlet context={{ newVenture: () => setNewOpen(true) } satisfies ShellCtx} /></Suspense>
        </motion.div>
      </main>
      <NewVentureDialog open={newOpen} onOpenChange={setNewOpen} />
      <ProductTour open={tourOpen} onClose={closeTour} onCreate={() => setNewOpen(true)} setSidebar={setMobile} />
    </div>
  )
}
