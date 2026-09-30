import { ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, Globe, Quote, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SCORE_KEYS, SCORE_LABELS, ScoreRing, scoreColor } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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

// ---------------------------------------------------------------- MVP architect

const LAYERS = [
  ['client', 'Client'], ['api', 'API'], ['service', 'Services'], ['data', 'Data'], ['external', 'External'],
] as const
const LAYER_STYLE: Record<string, string> = {
  client: 'bg-[#fdf1e8] border-[#f7d9c1]', api: 'bg-dark text-white border-dark', service: 'bg-[#f0f3ff] border-[#d5defb]',
  data: 'bg-[#f1f7e9] border-[#d8e9c2]', external: 'bg-soft border-line-2',
}

export function ArchitectureDiagram({ arch }: { arch: MvpPlan['architecture'] }) {
  const cols = LAYERS.filter(([l]) => arch.nodes.some((n) => n.layer === l))
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-canvas p-4">
      <div className="dot-grid rounded-lg p-4" style={{ minWidth: cols.length * 150 }}>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(130px, 1fr))` }}>
          {cols.map(([layer, label], ci) => (
            <div key={layer} className="relative flex flex-col items-stretch gap-3">
              <p className="text-center font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{label}</p>
              <div className="flex flex-1 flex-col justify-center gap-3">
                {arch.nodes.filter((n) => n.layer === layer).map((n) => {
                  const out = arch.edges.filter((e) => e.source === n.id).map((e) => arch.nodes.find((x) => x.id === e.target)?.label).filter(Boolean)
                  return (
                    <div key={n.id} className={cn('rounded-xl border px-3 py-2.5 text-center text-[13px] font-medium shadow-press-light', LAYER_STYLE[layer])}>
                      {n.label}
                      {out.length > 0 && <p className="mt-1 text-[10px] font-normal opacity-60">→ {out.join(', ')}</p>}
                    </div>
                  )
                })}
              </div>
              {ci < cols.length - 1 && <span className="absolute top-1/2 -right-3 text-faint">›</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-xl">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

const PRIORITY_TONE = { must: 'dark', should: 'indigo', could: 'neutral' } as const
const METHOD_TONE: Record<string, string> = { GET: 'text-[#3f6b17]', POST: 'text-azure', PUT: 'text-amber', PATCH: 'text-amber', DELETE: 'text-rose' }

export function MvpView({ m }: { m: MvpPlan }) {
  return (
    <div className="space-y-10">
      <Card className="p-6">
        <p className="text-[15px] text-ink-2">{m.summary}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">{m.stack.map((s) => <Badge key={s} tone="outline">{s}</Badge>)}</div>
        <p className="mt-3 text-xs text-muted">Estimated infrastructure: {m.monthly_cost_estimate}</p>
      </Card>

      <Section title="Features">
        <div className="grid gap-3 sm:grid-cols-2">
          {m.features.map((f) => (
            <Card key={f.name} className="p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-medium">{f.name}</p><Badge tone={PRIORITY_TONE[f.priority]} className="capitalize">{f.priority}</Badge></div>
              <p className="mt-1 text-sm text-muted">{f.description}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="User stories">
        <div className="grid gap-3 md:grid-cols-2">
          {m.user_stories.map((s, i) => (
            <Card key={i} className="p-4 text-sm">
              <p><span className="text-muted">As a</span> {s.as_a}, <span className="text-muted">I want</span> {s.i_want}, <span className="text-muted">so that</span> {s.so_that}.</p>
              <ul className="mt-3 space-y-1">{s.acceptance.map((a) => <li key={a} className="flex gap-2 text-xs text-ink-2"><CheckCircle2 className="size-3.5 shrink-0 text-leaf" />{a}</li>)}</ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Architecture"><ArchitectureDiagram arch={m.architecture} /></Section>

      <Section title="Database schema">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {m.database_schema.map((t) => (
            <Card key={t.table} className="overflow-hidden">
              <p className="border-b border-line bg-canvas px-4 py-2 font-mono text-[13px] font-medium">{t.table}</p>
              <ul className="divide-y divide-line">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 px-4 py-1.5 font-mono text-xs">
                    <span>{c.name}</span>
                    <span className="text-muted">{c.type}{c.note ? ` · ${c.note}` : ''}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="APIs">
        <Card className="divide-y divide-line">
          {m.apis.map((a) => (
            <div key={a.method + a.path} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <span className={cn('w-16 font-mono text-xs font-medium', METHOD_TONE[a.method])}>{a.method}</span>
              <span className="font-mono text-[13px] sm:w-64">{a.path}</span>
              <span className="text-sm text-muted">{a.description}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Sprint plan">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {m.sprint_plan.map((s) => (
            <Card key={s.sprint} className="p-4">
              <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Sprint {s.sprint}</p>
              <p className="mt-1 font-medium">{s.goal}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">{s.tasks.map((t) => <li key={t} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />{t}</li>)}</ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Team requirements">
        <div className="grid gap-3 sm:grid-cols-3">
          {m.team.map((t) => (
            <Card key={t.role} className="p-4">
              <p className="font-display text-3xl">{t.count}×</p>
              <p className="mt-1 font-medium">{t.role}</p>
              <p className="mt-1 text-sm text-muted">{t.why}</p>
            </Card>
          ))}
        </div>
      </Section>
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
