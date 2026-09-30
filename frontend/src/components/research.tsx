import { ArrowUpRight, BookOpen, ChevronDown, Globe, Quote, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SCORE_KEYS, SCORE_LABELS, ScoreRing, scoreColor } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MvpView } from '@/components/mvp'
import { PrototypePreview } from '@/components/prototype'
import type { ExperimentAnalysis, MvpPlan, Opportunity, PrototypeContent, Report, Source, Validation } from '@/lib/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------- sources & evidence

export function SourceLink({ s }: { s: Source }) {
  const Icon = s.type === 'library' ? BookOpen : Globe
  const inner = (
    <>
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{s.platform && s.platform !== 'Web' ? `${s.platform} · ` : ''}{s.title}</span>
      {s.url && <ArrowUpRight className="size-3 shrink-0" />}
    </>
  )
  const cls = 'inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] text-ink-2'
  return s.url ? <a href={s.url} target="_blank" rel="noreferrer" className={cn(cls, 'hover:border-line-2 hover:text-ink')}>{inner}</a> : <span className={cls}>{inner}</span>
}

// ---------------------------------------------------------------- opportunity discovery

export function OpportunityCard({ o, action }: { o: Opportunity; action?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-[17px] font-medium tracking-[-0.01em]">{o.title}</h4>
          <p className="mt-1 text-sm text-ink-2">{o.problem}</p>
        </div>
        {action}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Frequency', o.frequency],
          ['Pain level', <span key="p" className="flex items-center gap-2">{o.pain_level}/10<span className="h-1 w-10 rounded-full bg-soft"><span className="block h-full rounded-full bg-saffron" style={{ width: `${o.pain_level * 10}%` }} /></span></span>],
          ['Customers', o.potential_customers],
          ['Market size', o.market_size],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-muted">{k}</p>
            <div className="mt-0.5 text-sm font-medium">{v}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{o.market_size_reasoning}</p>
      {o.quotes?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {o.quotes.map((q) => <p key={q} className="flex gap-2 text-xs text-ink-2 italic"><Quote className="size-3 shrink-0 text-faint" />{q}</p>)}
        </div>
      )}
      {o.sources?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{o.sources.map((s, i) => <SourceLink key={i} s={s} />)}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------- validation engine

export function ValidationView({ v }: { v: Validation }) {
  const [open, setOpen] = useState<string | null>(SCORE_KEYS[0])
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <ScoreRing value={v.overall} size={96} stroke={8} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={v.verdict === 'Promising' ? 'leaf' : v.verdict === 'Weak' ? 'rose' : 'amber'}>{v.verdict}</Badge>
            <span className="text-xs text-muted">{v.web_sources} web sources · library evidence</span>
          </div>
          <p className="mt-2 text-[15px] text-ink-2">{v.summary}</p>
        </div>
      </Card>

      <div className="grid gap-3">
        {SCORE_KEYS.map((k) => {
          const s = v[k]
          const isOpen = open === k
          return (
            <Card key={k} className="overflow-hidden">
              <button className="flex w-full items-center gap-4 p-4 text-left cursor-pointer" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                <span className="w-44 shrink-0 text-sm font-medium">{SCORE_LABELS[k]}</span>
                <span className="h-1.5 flex-1 rounded-full bg-soft">
                  <span className="block h-full rounded-full" style={{ width: `${s.score}%`, background: scoreColor(s.score) }} />
                </span>
                <span className="w-8 text-right font-display text-lg tabular-nums">{s.score}</span>
                <ChevronDown className={cn('size-4 text-muted transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="border-t border-line bg-canvas/60 px-4 py-4">
                  <p className="text-sm text-ink-2">{s.summary}</p>
                  <p className="mt-4 mb-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Evidence</p>
                  {s.evidence.length === 0 && <p className="text-xs text-muted">No citable evidence found — treat this score as a hypothesis.</p>}
                  <ul className="space-y-2">
                    {s.evidence.map((e, i) => (
                      <li key={i} className="rounded-xl border border-line bg-white p-3">
                        <p className="text-sm">{e.claim}</p>
                        <div className="mt-2"><SourceLink s={e} /></div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {v.key_risks?.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium"><TriangleAlert className="size-4 text-amber" />Key risks</p>
          <ul className="space-y-1.5 text-sm text-ink-2">{v.key_risks.map((r) => <li key={r} className="flex gap-2"><span className="text-faint">—</span>{r}</li>)}</ul>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- experiment analysis

const OUTCOME_TONE = { validated: 'leaf', invalidated: 'rose', inconclusive: 'amber' } as const

export function AnalysisView({ a }: { a: ExperimentAnalysis }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2"><Badge tone={OUTCOME_TONE[a.outcome]} className="capitalize">{a.outcome}</Badge><span className="text-xs text-muted">{a.conversion}% conversion</span></div>
      <p className="mt-3 text-sm text-ink-2">{a.summary}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><p className="mb-2 text-xs font-medium text-muted">Insights</p><ul className="space-y-1 text-sm">{a.insights.map((x) => <li key={x}>· {x}</li>)}</ul></div>
        <div><p className="mb-2 text-xs font-medium text-muted">Recommended next</p><ul className="space-y-1 text-sm">{a.recommended_next.map((x) => <li key={x}>→ {x}</li>)}</ul></div>
      </div>
    </Card>
  )
}

export function ReportBody({ r }: { r: Report }) {
  switch (r.kind) {
    case 'discovery': return <div className="space-y-3">{(r.content as { opportunities: Opportunity[] }).opportunities.map((o) => <OpportunityCard key={o.title} o={o} />)}</div>
    case 'validation': return <ValidationView v={r.content as Validation} />
    case 'mvp': return <MvpView m={r.content as MvpPlan} />
    case 'prototype': return <PrototypePreview content={r.content as PrototypeContent} />
    case 'landing': return <Card className="p-6 text-sm text-muted">Landing pages were replaced by the Prototype Builder. Open the venture's Prototype tab to build a working app.</Card>
    case 'experiment_analysis': return <AnalysisView a={r.content as ExperimentAnalysis} />
  }
}
