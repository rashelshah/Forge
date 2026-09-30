import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppWindow, ArrowRight, Check, FlaskConical, Gauge, Layers, Loader2, MessagesSquare, Radar, RefreshCw, Search, ShieldAlert, Sparkles, TrendingUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ScoreRing } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { ReadinessKey, VentureCommand } from '@/lib/types'
import { ago, cn, titleCase } from '@/lib/utils'

const STATUS_TONE: Record<string, 'leaf' | 'amber' | 'rose' | 'neutral'> = { Promising: 'leaf', 'Ready to launch': 'leaf', 'Needs evidence': 'amber', 'At risk': 'rose', 'Not validated yet': 'neutral' }
const SOURCE_ICON: Record<string, typeof Gauge> = {
  'Validation Agent': Gauge, 'Research Agent': Search, 'Competitor Agent': Radar, 'Boardroom Agent': MessagesSquare, 'Experiment Agent': FlaskConical, 'MVP Architect': Layers, 'Product Studio': AppWindow,
}
const SOURCE_TAB: Record<string, string> = { 'Validation Agent': 'overview', 'Research Agent': 'memory', 'Competitor Agent': 'competitors', 'Boardroom Agent': 'boardroom', 'Experiment Agent': 'experiments', 'MVP Architect': 'mvp', 'Product Studio': 'prototype' }
const MODULES: { key: ReadinessKey; label: string }[] = [
  { key: 'validation', label: 'Validation' }, { key: 'research', label: 'Research' }, { key: 'competitors', label: 'Competitors' },
  { key: 'boardroom', label: 'Boardroom' }, { key: 'prototype', label: 'Prototype' }, { key: 'experiments', label: 'Experiments' },
]

const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={cn('font-mono text-[10px] tracking-[0.14em] text-muted uppercase', className)}>{children}</p>

// ---------------------------------------------------------------- 1. founder brief

function FounderBrief({ c, refreshing, onRefresh }: { c: VentureCommand; refreshing: boolean; onRefresh: () => void }) {
  const b = c.brief
  return (
    <Card className="relative isolate overflow-hidden p-0">
      <div className="aurora-soft -z-10" />
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
        <div>
          <Eyebrow className="flex items-center gap-1.5"><Sparkles className="size-3 text-saffron" />AI venture partner</Eyebrow>
          <h2 className="mt-1 text-2xl sm:text-[28px]">Today's founder brief</h2>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="text-right">
            <Eyebrow>Overall status</Eyebrow>
            <Badge tone={STATUS_TONE[b.status] ?? 'neutral'} className="mt-1 px-3 py-1 text-sm">{b.status}</Badge>
          </div>
          <div className="flex flex-col items-center gap-1" title="How sure the advisor is, given how much evidence exists">
            <ScoreRing value={b.confidence} size={60} stroke={6} label={`Confidence ${b.confidence}%`} />
            <Eyebrow>Confidence</Eyebrow>
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-[#d8e9c2] bg-[#f5faef]/90 p-5">
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-[#3f6b17] uppercase"><TrendingUp className="size-3.5" />Biggest opportunity</p>
            <p className="mt-2 text-[17px] leading-snug">{b.opportunity}</p>
          </div>
          <div className="rounded-2xl border border-[#f4cfc8] bg-[#fdf3f1]/90 p-5">
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-rose uppercase"><ShieldAlert className="size-3.5" />Biggest risk</p>
            <p className="mt-2 text-[17px] leading-snug">{b.risk}</p>
          </div>
        </div>
        <div className="flex flex-col rounded-2xl bg-dark p-6 text-white">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase"><ArrowRight className="size-3.5" />Recommended direction</p>
          <p className="mt-3 flex-1 text-lg leading-snug sm:text-xl">{b.recommendation}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white/60 px-5 py-3 text-xs text-muted sm:px-7">
        {c.generating || refreshing
          ? <span className="flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" />Your venture partner is re-reading every module…</span>
          : c.source === 'ai' ? <span>Synthesised from validation, research, competitors, boardroom and experiments{c.generatedAt && ` · ${ago(c.generatedAt)}`}</span>
            : <span>Built from your module results. An AI-written brief replaces this when it finishes.</span>}
        {c.error && <span className="text-rose">Couldn't refresh: {c.error}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={c.generating || refreshing}><RefreshCw />Refresh brief</Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- 2. next recommended actions

function Actions({ c, ventureId, stage }: { c: VentureCommand; ventureId: string; stage: string }) {
  const [, setParams] = useSearchParams()
  const key = `foundry:actions-done:${ventureId}`
  const [done, setDone] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } })
  const toggle = (t: string) => setDone((d) => {
    const next = d.includes(t) ? d.filter((x) => x !== t) : [...d, t]
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  const open = c.actions.filter((a) => !done.includes(a.title)), finished = c.actions.filter((a) => done.includes(a.title))
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><Eyebrow>{titleCase(stage)} stage</Eyebrow><h2 className="mt-1 text-2xl">Next recommended actions</h2></div>
        <span className="text-sm text-muted">{open.length} to do{finished.length > 0 && ` · ${finished.length} done`}</span>
      </div>
      <ol className="space-y-2.5">
        {[...open, ...finished].map((a, i) => {
          const Icon = SOURCE_ICON[a.source] ?? Sparkles, isDone = done.includes(a.title), high = a.priority === 'High' && !isDone
          return (
            <li key={a.title} className={cn('flex gap-3 rounded-2xl border p-4 transition', high ? 'border-saffron/40 bg-[#fdf6ef] shadow-press-light' : 'border-line bg-white', isDone && 'opacity-55')}>
              <button onClick={() => toggle(a.title)} aria-pressed={isDone} aria-label={isDone ? `Mark "${a.title}" as not done` : `Mark "${a.title}" as done`}
                className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition cursor-pointer', isDone ? 'border-leaf bg-leaf text-white' : 'border-line-2 bg-white hover:border-ink')}>
                {isDone ? <Check className="size-3.5" /> : <span className="text-[11px] text-muted">{i + 1}</span>}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('font-medium', isDone && 'line-through')}>{a.title}</p>
                  <Badge tone={a.priority === 'High' ? 'rose' : a.priority === 'Medium' ? 'amber' : 'neutral'}>{a.priority}</Badge>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{a.description}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" />{a.source}</span>
                  {SOURCE_TAB[a.source] && !isDone && <button onClick={() => setParams({ tab: SOURCE_TAB[a.source] })} className="inline-flex items-center gap-1 text-azure hover:underline cursor-pointer">Open <ArrowRight className="size-3" /></button>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ---------------------------------------------------------------- 3. launch readiness

const BAR = { complete: 'bg-leaf', in_progress: 'bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]', not_started: 'bg-line-2' } as const
const STATUS_LABEL = { complete: 'Complete', in_progress: 'In progress', not_started: 'Not started' } as const

function Readiness({ c }: { c: VentureCommand }) {
  const [, setParams] = useSearchParams()
  const r = c.readiness
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><Eyebrow>How close are you?</Eyebrow><h2 className="mt-1 text-2xl">Launch readiness</h2></div>
        <div className="text-right"><p className="text-4xl font-medium tabular-nums">{r.overallReadinessScore}<span className="text-xl text-muted">%</span></p><Eyebrow>Overall progress</Eyebrow></div>
      </div>
      <div className="mb-6 h-2.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={r.overallReadinessScore} aria-valuemin={0} aria-valuemax={100} aria-label="Overall launch readiness">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)] transition-[width] duration-700" style={{ width: `${r.overallReadinessScore}%` }} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map(({ key, label }) => {
          const d = r.details[key]
          return (
            <button key={key} onClick={() => setParams({ tab: d.tab })} className="rounded-2xl border border-line bg-white p-4 text-left transition hover:border-line-2 hover:shadow-float cursor-pointer">
              <div className="flex items-center gap-2.5">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-white', d.status === 'complete' ? 'bg-leaf' : d.status === 'in_progress' ? 'bg-amber' : 'bg-line-2')} aria-hidden="true">
                  {d.status === 'complete' ? <Check className="size-3.5" /> : d.status === 'in_progress' ? <span className="size-2 rounded-full bg-white" /> : <X className="size-3.5" />}
                </span>
                <p className="flex-1 font-medium">{label}</p>
                <span className="text-sm tabular-nums">{d.progress}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-soft"><div className={cn('h-full rounded-full transition-[width] duration-700', BAR[d.status])} style={{ width: `${d.progress}%` }} /></div>
              <p className="mt-1 text-[11px] text-faint">{STATUS_LABEL[d.status]}</p>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div><dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Current</dt><dd className="mt-0.5 text-ink-2">{d.current}</dd></div>
                {d.missing.length > 0 && <div><dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Missing</dt><dd className="mt-0.5 text-ink-2">{d.missing.slice(0, 2).join(' · ')}{d.missing.length > 2 && <span className="text-faint"> +{d.missing.length - 2} more</span>}</dd></div>}
              </dl>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- the command centre

export function CommandCenter({ ventureId, stage }: { ventureId: string; stage: string }) {
  const q = useQuery({
    queryKey: ['command', ventureId], queryFn: () => api<VentureCommand>(`/ventures/${ventureId}/command`),
    refetchInterval: (query) => (query.state.data?.generating ? 3000 : false),
  })
  const qc = useQueryClient()
  const refresh = useAction(() => api(`/ventures/${ventureId}/command/refresh`, {}), [['command', ventureId]])
  // Bring the brief up to date once per visit when the modules have changed since it was written. This runs silently: the
  // rule-based brief stays on screen if it fails, and only the manual button reports errors.
  const asked = useRef(false)
  const c = q.data
  useEffect(() => {
    if (c && c.stale && !c.generating && !c.error && !asked.current) {
      asked.current = true
      api(`/ventures/${ventureId}/command/refresh`, {}).then(() => qc.invalidateQueries({ queryKey: ['command', ventureId] })).catch(() => {})
    }
  }, [c, ventureId, qc])
  if (!c) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-card bg-soft" />)}</div>
  return (
    <div className="space-y-6">
      <FounderBrief c={c} refreshing={refresh.isPending} onRefresh={() => refresh.mutate()} />
      <Actions c={c} ventureId={ventureId} stage={stage} />
      <Readiness c={c} />
    </div>
  )
}
