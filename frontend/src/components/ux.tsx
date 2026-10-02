import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { ScoreRing } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Shared building blocks for the "conclusions first, evidence second, details last" layout.
// Every module page: FounderBrief -> insight / action / risk cards -> Disclose / ExpandableInsightCard for the long text.

const clean = (t?: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
export const wordCount = (t?: string | null) => (clean(t) ? clean(t).split(' ').length : 0)

/** The first sentence of `text`, cut at `max` words: the one-line version of a paragraph. */
export function gist(text?: string | null, max = 22) {
  const t = clean(text)
  const first = t.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? t
  const w = first.split(' ')
  return w.length > max ? `${w.slice(0, max).join(' ').replace(/[,;:\-–—]$/, '')}…` : first
}

type Level = 'high' | 'medium' | 'low'
export const level = (n: number): Level => (n >= 70 ? 'high' : n >= 40 ? 'medium' : 'low')
const lv = (s?: string | null): Level | null => { const k = clean(s).toLowerCase(); return k === 'high' || k === 'medium' || k === 'low' ? k : null }
const GOOD = { high: 'leaf', medium: 'amber', low: 'neutral' } as const // high is good news (impact, signal, confidence)
const BAD = { high: 'rose', medium: 'amber', low: 'leaf' } as const // high is bad news (severity, effort)
const URGENT = { high: 'saffron', medium: 'amber', low: 'neutral' } as const // priority: hot colours for what to do first

// ---------------------------------------------------------------- progressive disclosure

/** "View full analysis" toggle. Everything long goes inside one of these. */
export function Disclose({ label = 'View full analysis', children, className }: { label?: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-azure hover:underline">
        {open ? 'Hide' : label}<ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

/** A paragraph that collapses behind "View full analysis" once it passes `max` words (100 by default). */
export function LongText({ text, className, max = 100 }: { text?: string | null; className?: string; max?: number }) {
  if (!clean(text)) return null
  if (wordCount(text) <= max) return <p className={cn('text-sm leading-relaxed whitespace-pre-line text-ink-2', className)}>{text}</p>
  return (
    <div className={className}>
      <p className="text-sm leading-relaxed text-ink-2">{gist(text, 30)}</p>
      <Disclose className="mt-1.5"><p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{text}</p></Disclose>
    </div>
  )
}

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('font-mono text-[10px] tracking-[0.14em] text-muted uppercase', className)}>{children}</p>
)

export const CardGrid = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('grid gap-3 md:grid-cols-2', className)} {...p} />

const Confidence = ({ value }: { value: number }) => <Badge tone={GOOD[level(value)]} title="Confidence in this finding">{value}% confidence</Badge>

/** Summary up front, the full write-up behind a button. For the AI-written reports. */
export function ExpandableInsightCard({ title, summary, details, confidence, className }: { title: string; summary?: string; details: ReactNode; confidence?: number | null; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-[1_1_14rem] text-[16px] leading-snug font-medium">{title}</h3>
        {confidence != null && <Confidence value={confidence} />}
      </div>
      {summary && <p className="mt-1.5 text-sm text-ink-2">{summary}</p>}
      <Disclose className="mt-3">{details}</Disclose>
    </Card>
  )
}

/** A collapsed-by-default section for the heavy, reference-style content (schemas, calendars, brand kits). */
export function FoldSection({ id, title, hint, defaultOpen, aside, children }: { id?: string; title: string; hint?: string; defaultOpen?: boolean; aside?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen)
  // An in-page link to this section (#id) opens it.
  useEffect(() => {
    if (!id) return
    const on = () => { if (location.hash === `#${id}`) setOpen(true) }
    on()
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [id])
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 w-full cursor-pointer items-center gap-3 rounded-card border border-line bg-white px-5 py-4 text-left transition hover:border-line-2">
          <span className="min-w-0 flex-1"><span className="block text-lg font-medium tracking-[-0.01em]">{title}</span>{hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}</span>
          <span className="shrink-0 text-xs text-azure">{open ? 'Hide' : 'View details'}</span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition', open && 'rotate-180')} />
        </button>
        {aside}
      </div>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------- AI founder brief

export type BriefTone = 'leaf' | 'rose' | 'azure' | 'amber' | 'neutral'
export interface BriefItem { label: string; value?: string | null; tone: BriefTone; icon: LucideIcon }

const TILE: Record<BriefTone, string> = {
  leaf: 'border-[#d8e9c2] bg-[#f5faef]/90 text-[#3f6b17]',
  rose: 'border-[#f4cfc8] bg-[#fdf3f1]/90 text-rose',
  azure: 'border-mist bg-[#f4f7fe]/90 text-azure',
  amber: 'border-[#f3e0b3] bg-[#fdf6e6]/90 text-[#8a5e12]',
  neutral: 'border-line bg-white/80 text-muted',
}

/** The three-line answer at the top of every page: what matters, the main risk, what to do next. Items without a value are dropped. */
export function FounderBrief({ items, confidence, note, className }: { items: BriefItem[]; confidence?: number | null; note?: ReactNode; className?: string }) {
  const shown = items.filter((i) => clean(i.value))
  if (!shown.length) return null
  return (
    <Card className={cn('relative isolate overflow-hidden', className)}>
      <div className="aurora-soft -z-10" />
      <div className="flex items-center gap-3 px-5 pt-4 sm:px-6">
        <Eyebrow className="flex-1">AI Founder Brief</Eyebrow>
        {confidence != null && (
          <div className="flex items-center gap-2" title="How sure the advisor is, given the evidence behind this page">
            <Eyebrow>Confidence</Eyebrow>
            <ScoreRing value={confidence} size={44} stroke={5} label={`Confidence ${confidence}%`} />
          </div>
        )}
      </div>
      <div className={cn('grid gap-3 p-5 pt-3 sm:px-6 sm:pb-5', shown.length > 1 && 'md:grid-cols-3')}>
        {shown.map((i) => (
          <div key={i.label} className={cn('rounded-2xl border p-4', TILE[i.tone])}>
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase [&_svg]:size-3.5"><i.icon />{i.label}</p>
            <p className="mt-2 line-clamp-4 text-[16px] leading-snug text-ink">{i.value}</p>
          </div>
        ))}
      </div>
      {note && <div className="border-t border-line bg-white/60 px-5 py-2.5 text-xs text-muted sm:px-6">{note}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------- cards

const Mini = ({ label, children }: { label: string; children: ReactNode }) => (
  <div><p className="text-[10px] tracking-wide text-muted uppercase">{label}</p><div className="mt-0.5">{children}</div></div>
)

/** A finding: title first, confidence or signal strength next, the evidence on demand. */
export function InsightCard({ title, summary, confidence, category, signal, evidence, icon: Icon, className }: {
  title: string; summary?: string; confidence?: number | null; category?: string; signal?: string; evidence?: ReactNode; icon?: LucideIcon; className?: string
}) {
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <div className="flex items-start gap-3">
        {Icon && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-soft text-ink-2 [&_svg]:size-4"><Icon /></span>}
        <div className="min-w-0 flex-1">
          {category && <Badge tone="neutral" className="mb-1.5">{category}</Badge>}
          <h3 className="text-[15px] leading-snug font-medium">{title}</h3>
        </div>
      </div>
      {(confidence != null || signal) && (
        <div className="mt-3 flex gap-5">
          {confidence != null && <Mini label="Confidence"><span className="font-display text-lg tabular-nums">{confidence}%</span></Mini>}
          {signal && <Mini label="Signal strength"><Badge tone={GOOD[lv(signal) ?? 'low']} className="capitalize">{signal}</Badge></Mini>}
        </div>
      )}
      {summary && <p className="mt-2.5 line-clamp-2 text-sm text-ink-2">{summary}</p>}
      {evidence && <Disclose label="View evidence" className="mt-3">{evidence}</Disclose>}
    </Card>
  )
}

const tone = (v: string, map: typeof GOOD | typeof BAD | typeof URGENT) => map[lv(v) ?? 'low']

/** Something to do: how much it moves the needle, how urgent, how costly. */
export function ActionCard({ action, impact, priority, effort, detail, className }: { action: string; impact?: string; priority?: string; effort?: string; detail?: ReactNode; className?: string }) {
  const cells = [['Impact', impact, GOOD], ['Priority', priority, URGENT], ['Effort', effort, BAD]] as const
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <h3 className="text-[15px] leading-snug font-medium">{action}</h3>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {cells.map(([k, v, map]) => v && <Mini key={k} label={k}><Badge tone={tone(v, map)} className="capitalize">{v}</Badge></Mini>)}
      </div>
      {detail && <Disclose label="Why" className="mt-3">{detail}</Disclose>}
    </Card>
  )
}

/** A scored opportunity: the number first, the reasoning behind it on demand. */
export function OpportunityScoreCard({ opportunity, score, reason, className }: { opportunity: string; score: number; reason?: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-3">
        <ScoreRing value={score} size={52} stroke={5} label={`Opportunity score ${score}`} />
        <div className="min-w-0"><h3 className="text-[15px] leading-snug font-medium">{opportunity}</h3><Eyebrow className="mt-1">Opportunity score</Eyebrow></div>
      </div>
      {reason && <Disclose label="Why" className="mt-3">{reason}</Disclose>}
    </Card>
  )
}

/** A risk: how bad, and what to do about it. */
export function RiskCard({ risk, severity, mitigation, detail, className }: { risk: string; severity?: string; mitigation?: string; detail?: ReactNode; className?: string }) {
  const long = wordCount(mitigation) > 24
  return (
    <Card className={cn('flex flex-col p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] leading-snug font-medium">{risk}</h3>
        {severity && <Badge tone={tone(severity, BAD)} className="shrink-0 capitalize">{severity}</Badge>}
      </div>
      {mitigation && <p className="mt-2.5 text-sm text-ink-2"><span className="text-muted">Mitigation: </span>{long ? gist(mitigation, 22) : mitigation}</p>}
      {(detail || long) && <Disclose label="View details" className="mt-3">{<div className="space-y-2 text-sm text-ink-2">{long && <p>{mitigation}</p>}{detail}</div>}</Disclose>}
    </Card>
  )
}
