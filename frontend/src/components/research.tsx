import { ArrowUpRight, BookOpen, ChevronDown, Compass, Globe, Quote, Radar, Sparkles, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SCORE_KEYS, SCORE_LABELS, ScoreRing, scoreColor } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MvpView } from '@/components/mvp'
import { CardGrid, Disclose, FounderBrief, InsightCard, LongText, RiskCard, gist, wordCount } from '@/components/ux'
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

/** Name + one-line idea for a venture created from a discovered opportunity. */
export const ventureFromOpportunity = (o: Opportunity) => o.startup
  ? { name: o.startup.startup_name.slice(0, 60), idea: `${o.startup.startup_name} for ${o.startup.target_customer}: ${o.startup.solution} Problem: ${o.startup.problem}`, opportunity: o }
  : { name: o.title.slice(0, 60), idea: `${o.title} for ${o.potential_customers}: ${o.problem}`, opportunity: o }

const LEVEL_TONE = { low: 'rose', medium: 'amber', high: 'leaf' } as const
const SCORE_NAMES: Record<string, string> = {
  pain_severity: 'Pain severity', frequency: 'Frequency', growth_rate: 'Growth rate', urgency: 'Urgency', market_size: 'Market size',
  ai_leverage: 'AI leverage', automation_potential: 'Automation', revenue_potential: 'Revenue potential', competition_intensity: 'Competition intensity', defensibility: 'Defensibility',
  demand: 'Demand', competition: 'Room vs competition', distribution: 'Distribution', ai_advantage: 'AI advantage', speed_to_mvp: 'Speed to MVP', founder_accessibility: 'Founder accessibility',
}

function Fold({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="border-t border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between py-3 text-left text-sm font-medium">
        {title}<ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

const real = (items: string[]) => items.filter((t) => !/^not (stated|evidenced)/i.test(t.trim()))
const Bullets = ({ items }: { items: string[] }) => <ul className="space-y-1">{real(items).map((t) => <li key={t} className="flex gap-2 text-sm text-ink-2"><span className="text-faint">—</span>{t}</li>)}</ul>
const Label = ({ children }: { children: ReactNode }) => <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{children}</p>

function ScoreBars({ scores, invert }: { scores: Record<string, number>; invert?: string }) {
  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {Object.entries(scores).map(([k, v]) => (
        <div key={k}>
          <div className="flex justify-between text-xs"><span className="text-ink-2">{SCORE_NAMES[k] ?? k}</span><span className="font-medium">{v}</span></div>
          <div className="mt-1 h-1 rounded-full bg-soft"><div className={cn('h-full rounded-full', k === invert ? 'bg-rose' : 'bg-saffron')} style={{ width: `${v}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

export function OpportunityCard({ o, action }: { o: Opportunity; action?: ReactNode }) {
  const v = o.validation
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {o.rank && <p className="mb-1 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Opportunity #{o.rank}</p>}
          <h4 className="text-[17px] font-medium tracking-[-0.01em]">{o.title}</h4>
          <LongText text={o.problem} className="mt-1" />
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {v && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="dark">Validation {v.overall_score}/100</Badge>
          <Badge tone={LEVEL_TONE[v.confidence_level]} className="capitalize">{v.confidence_level} confidence</Badge>
          <Badge tone="outline">Evidence {o.evidence_strength}/100</Badge>
          <Badge tone="outline">{o.mentions} sources</Badge>
          <Badge tone="outline">{v.market_readiness}</Badge>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Frequency', o.frequency],
          ['Pain level', <span key="p" className="flex items-center gap-2">{o.pain_level}/10<span className="h-1 w-10 rounded-full bg-soft"><span className="block h-full rounded-full bg-saffron" style={{ width: `${o.pain_level * 10}%` }} /></span></span>],
          ['Target user', o.potential_customers],
          ['Market size', o.market_size],
        ].map(([k, val]) => (
          <div key={k as string} className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] text-muted">{k}</p>
            <div className="mt-0.5 text-sm font-medium">{val}</div>
          </div>
        ))}
      </div>
      <Disclose className="mt-4">
      <p className="mt-3 text-xs text-muted">{o.market_size_reasoning}</p>
      {o.quotes?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {o.quotes.map((q) => <p key={q} className="flex gap-2 text-xs text-ink-2 italic"><Quote className="size-3 shrink-0 text-faint" />{q}</p>)}
        </div>
      )}
      {o.sources?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{o.sources.map((s, i) => <SourceLink key={i} s={s} />)}</div>}

      {o.startup && (
        <div className="mt-4">
          <Fold title="Suggested startup" defaultOpen>
            <p className="text-base font-medium">{o.startup.startup_name}</p>
            <p className="mt-1 text-sm text-ink-2">{o.startup.solution}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {([['Target customer', o.startup.target_customer], ['Why now', o.startup.why_now], ['Business model', o.startup.business_model], ['Distribution', o.startup.distribution_strategy], ['Competitive advantage', o.startup.competitive_advantage]] as const).map(([k, t]) => (
                <div key={k} className={k === 'Competitive advantage' ? 'sm:col-span-2' : ''}><dt className="text-[11px] text-muted">{k}</dt><dd className="text-sm text-ink-2">{t}</dd></div>
              ))}
            </dl>
            {o.startup_sources && o.startup_sources.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{o.startup_sources.map((s, i) => <SourceLink key={i} s={s} />)}</div>}
          </Fold>
          {o.white_space && (
            <Fold title={`White space · ${o.white_space.opportunity_score}/100`} defaultOpen>
              <p className="text-sm font-medium">{o.white_space.gap}</p>
              <p className="mt-1 text-sm text-ink-2">{o.white_space.reason}</p>
            </Fold>
          )}
          {o.pain_points && o.pain_points.length > 0 && (
            <Fold title={`Pain evidence (${o.pain_points.length})`}>
              <ul className="space-y-3">
                {o.pain_points.map((p, i) => (
                  <li key={i} className="text-sm">
                    <p className="flex items-center gap-2 font-medium">{p.pain_point}<Badge tone={p.severity === 'high' ? 'rose' : p.severity === 'medium' ? 'amber' : 'neutral'} className="capitalize">{p.severity}</Badge></p>
                    <p className="mt-0.5 text-xs text-muted">{p.target_user} · {p.frequency}</p>
                    <p className="mt-1 text-xs text-ink-2 italic">{p.verbatim ? '' : 'Paraphrased: '}{p.evidence}</p>
                    <div className="mt-1.5"><SourceLink s={p.source} /></div>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
          <Fold title={`Existing solutions (${o.existing_solutions?.length ?? 0})`}>
            {o.existing_solutions?.length ? (
              <div className="space-y-3">
                {o.existing_solutions.map((s) => (
                  <div key={s.solution_name} className="rounded-xl border border-line p-3 text-sm">
                    <p className="flex items-center justify-between gap-2 font-medium">{s.solution_name}<span className="text-xs font-normal text-muted">{s.pricing}</span></p>
                    <p className="text-xs text-muted">{s.market_position}</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div><Label>Pros</Label><Bullets items={s.pros} /></div>
                      <div><Label>Cons</Label><Bullets items={s.cons} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted">No named competitor appeared in the scanned sources. That can mean white space, or that this scan was too narrow.</p>}
          </Fold>
          {o.failure_analysis && (
            <Fold title="Why current solutions fail">
              <div className="grid gap-4 sm:grid-cols-2">
                {([['Why users dislike them', o.failure_analysis.why_users_dislike], ['Why users abandon them', o.failure_analysis.why_users_abandon], ['Why users switch', o.failure_analysis.why_users_switch], ['Repeated complaints', o.failure_analysis.repeated_complaints]] as const).map(([k, items]) => real(items).length > 0 && <div key={k}><Label>{k}</Label><Bullets items={items} /></div>)}
              </div>
              {o.failure_sources && o.failure_sources.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{o.failure_sources.map((s, i) => <SourceLink key={i} s={s} />)}</div>}
            </Fold>
          )}
          {o.why && (
            <Fold title="Why this opportunity exists">
              <dl className="space-y-2.5">
                {([['Why it exists', o.why.why_exists], ['Why solutions fail', o.why.why_current_solutions_fail], ['Why demand is growing', o.why.why_demand_is_increasing], ['Why now', o.why.why_now]] as const).map(([k, t]) => <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="text-sm text-ink-2">{t}</dd></div>)}
              </dl>
            </Fold>
          )}
          {o.scores && v && (
            <Fold title="Scores">
              <Label>Opportunity qualification</Label>
              <ScoreBars scores={o.scores} invert="competition_intensity" />
              <div className="mt-4"><Label>Validation</Label></div>
              <ScoreBars scores={v.scores} />
              <p className="mt-3 text-sm text-ink-2">{v.validation_summary}</p>
              <p className="mt-2 text-xs text-muted">Ranked by opportunity score {o.opportunity_score} × evidence strength {o.evidence_strength} × market potential {o.market_potential}. Evidence strength and confidence are computed from the number of independent sources, source types and verbatim quotes found. Scores are model estimates from that evidence.</p>
            </Fold>
          )}
        </div>
      )}
      </Disclose>
    </Card>
  )
}

// ---------------------------------------------------------------- validation engine

export function ValidationView({ v }: { v: Validation }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <ScoreRing value={v.overall} size={96} stroke={8} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={v.verdict === 'Promising' ? 'leaf' : v.verdict === 'Weak' ? 'rose' : 'amber'}>{v.verdict}</Badge>
            <span className="text-xs text-muted">{v.web_sources} web sources · library evidence</span>
          </div>
          <LongText text={v.summary} className="mt-2" />
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
                  <LongText text={s.summary} />
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
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-medium"><TriangleAlert className="size-4 text-amber" />Key risks</p>
          <CardGrid>{v.key_risks.map((r) => <RiskCard key={r} risk={gist(r, 18)} detail={wordCount(r) > 18 ? r : undefined} />)}</CardGrid>
        </div>
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
      <LongText text={a.summary} className="mt-3" />
      <CardGrid className="mt-4">
        {a.insights.map((x) => <InsightCard key={x} category="Insight" title={gist(x, 18)} evidence={wordCount(x) > 18 ? <p className="text-sm text-ink-2">{x}</p> : undefined} />)}
        {a.recommended_next.map((x) => <InsightCard key={x} category="Next step" title={gist(x, 18)} evidence={wordCount(x) > 18 ? <p className="text-sm text-ink-2">{x}</p> : undefined} />)}
      </CardGrid>
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

// ---------------------------------------------------------------- research page: founder brief + key insights

const discoveries = (reports: Report[]) => reports.filter((r) => r.kind === 'discovery').flatMap((r) => (r.content as { opportunities?: Opportunity[] }).opportunities ?? [])
const topOpportunities = (reports: Report[]) => discoveries(reports).sort((a, b) => (b.rank_score ?? b.opportunity_score ?? 0) - (a.rank_score ?? a.opportunity_score ?? 0))

export function ResearchBrief({ reports }: { reports: Report[] }) {
  if (!reports.length) return null
  const top = topOpportunities(reports)[0]
  const val = reports.find((r) => r.kind === 'validation')?.content as Validation | undefined
  const weakest = val ? [...SCORE_KEYS].sort((a, b) => val[a].score - val[b].score)[0] : null
  return (
    <FounderBrief className="mb-8"
      confidence={top?.validation?.confidence ?? top?.evidence_strength ?? null}
      note={`Based on ${reports.length} report${reports.length === 1 ? '' : 's'}, newest first`}
      items={[
        { label: 'Most important market insight', icon: Sparkles, tone: 'leaf', value: top ? `${top.title}: ${gist(top.problem, 20)}` : gist(val?.summary) },
        { label: 'Strongest demand signal', icon: Radar, tone: 'azure', value: val?.demand ? `Demand scores ${val.demand.score}/100. ${gist(val.demand.summary, 18)}` : top ? `${top.mentions} sources describe it, at pain level ${top.pain_level}/10` : null },
        { label: 'Recommended research direction', icon: Compass, tone: 'amber', value: weakest ? `Dig into "${SCORE_LABELS[weakest].toLowerCase()}" next. It is the weakest score at ${val![weakest].score}/100.` : top ? `Validate "${top.title}" for demand, competition and fit.` : 'Run opportunity discovery to find a problem worth solving.' },
      ]} />
  )
}

export function ResearchInsights({ reports }: { reports: Report[] }) {
  const top = topOpportunities(reports).slice(0, 4)
  if (!top.length) return null
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-xl">Key insights</h2>
      <CardGrid className="lg:grid-cols-4">
        {top.map((o) => (
          <InsightCard key={o.title} title={o.title} category={o.cluster?.industry ?? 'Opportunity'} confidence={o.validation?.confidence ?? o.evidence_strength ?? null}
            evidence={<div className="space-y-2 text-sm text-ink-2"><LongText text={o.problem} /><p className="text-xs text-muted">{o.mentions} sources · pain {o.pain_level}/10 · {o.market_size}</p></div>} />
        ))}
      </CardGrid>
    </div>
  )
}
