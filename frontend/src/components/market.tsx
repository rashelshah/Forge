import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Flame, Loader2, Minus, Radar, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Empty, ScoreRing } from '@/components/bits'
import { Section } from '@/components/intel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CardGrid, FounderBrief, InsightCard, LongText, OpportunityScoreCard, RiskCard, gist, wordCount } from '@/components/ux'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Level, MarketData, Signal } from '@/lib/types'
import { ago, cn, date, titleCase } from '@/lib/utils'

const KEYS = [['market'], ['memory'], ['activity'], ['notifications'], ['signals'], ['me']]
const HEALTH = { positive: ['leaf', 'Positive'], neutral: ['amber', 'Neutral'], negative: ['rose', 'Negative'] } as const
const BAD_WHEN_HIGH: Record<Level, 'rose' | 'amber' | 'leaf'> = { high: 'rose', medium: 'amber', low: 'leaf' }
const SIZE: Record<Level, 'leaf' | 'indigo' | 'neutral'> = { high: 'leaf', medium: 'indigo', low: 'neutral' }
const MOMENTUM = { growing: [TrendingUp, 'text-[#3f6b17]', 'Growing'], stable: [Minus, 'text-muted', 'Stable'], declining: [TrendingDown, 'text-rose', 'Declining'] } as const
const when = (s: Signal) => date(s.occurred_on ? `${s.occurred_on}T12:00:00` : s.created_at)

function Bullets({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <Card className="p-5">
      <p className="text-[13px] text-muted">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">{items.map((t) => <li key={t} className="flex gap-2"><span className={cn('mt-2 size-1.5 shrink-0 rounded-full', dot)} />{t}</li>)}</ul>
    </Card>
  )
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-faint">{label}</dt><dd className="mt-0.5 font-medium capitalize">{children}</dd></div>
}

function SignalCard({ s }: { s: Signal }) {
  const extra = [['Potential impact', s.impact], [s.opportunity ? 'Opportunity' : 'Suggested response', s.opportunity ?? s.recommended_response]] as const
  return (
    <InsightCard title={s.title} category={titleCase(s.type)} signal={s.type === 'radar' ? titleCase(s.severity) : undefined} confidence={s.confidence}
      evidence={(
        <div className="space-y-3 text-sm">
          <LongText text={s.detail} />
          {extra.map(([k, v]) => v && <div key={k} className="rounded-xl bg-canvas p-3"><p className="text-xs text-muted">{k}</p><p className="mt-0.5">{v}</p></div>)}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
            <span>{when(s)}</span>
            {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-azure hover:underline"><ExternalLink className="size-3" />{s.source || new URL(s.source_url).hostname}</a>}
          </div>
        </div>
      )} />
  )
}

const RANK = { high: 0, medium: 1, low: 2 } as const

function MarketBrief({ data }: { data: MarketData }) {
  const trend = [...data.trends].sort((a, b) => Number(b.momentum === 'growing') - Number(a.momentum === 'growing') || b.confidence - a.confidence)[0]
  const opp = [...data.opportunities].sort((a, b) => b.score - a.score)[0]
  const threat = [...data.threats].sort((a, b) => RANK[a.severity] - RANK[b.severity] || RANK[a.likelihood] - RANK[b.likelihood])[0]
  return (
    <FounderBrief confidence={data.outlook?.confidence ?? null}
      items={[
        { label: 'Most important trend', icon: TrendingUp, tone: 'azure', value: trend && `${trend.title}${trend.summary ? `: ${gist(trend.summary, 18)}` : ''}` },
        { label: 'Biggest opportunity', icon: Target, tone: 'leaf', value: opp && `${opp.title}. Opportunity score ${opp.score}/100.` },
        { label: 'Emerging threat', icon: Flame, tone: 'rose', value: threat && `${threat.title}${threat.suggested_action ? `. Response: ${gist(threat.suggested_action, 16)}` : ''}` },
      ]} />
  )
}

function Trends({ trends }: { trends: MarketData['trends'] }) {
  const [cat, setCat] = useState<string | null>(null)
  const cats = [...new Set(trends.map((t) => t.category))]
  return (
    <div className="space-y-4">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {[null, ...cats].map((c) => (
          <button key={c ?? 'all'} onClick={() => setCat(c)} className={cn('rounded-full px-3 py-1 text-xs whitespace-nowrap cursor-pointer', cat === c ? 'bg-dark text-white' : 'bg-soft text-ink-2 hover:bg-line-2')}>{c ?? 'All'}</button>
        ))}
      </div>
      <CardGrid>
        {trends.filter((t) => !cat || t.category === cat).map((t) => {
          const [Icon, , label] = MOMENTUM[t.momentum]
          return (
            <InsightCard key={t.id} icon={Icon} title={t.title} category={`${t.category} · ${label}`} confidence={t.confidence} signal={t.impact} summary={gist(t.summary, 22)}
              evidence={wordCount(t.summary) > 22 ? <LongText text={t.summary} /> : undefined} />
          )
        })}
      </CardGrid>
    </div>
  )
}

export function MarketRadar({ ventureId }: { ventureId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['market', ventureId], queryFn: () => api<MarketData>(`/market?venture_id=${ventureId}`) })
  const run = useAction(() => api<{ signals: number }>('/market/run', { venture_id: ventureId }), KEYS, (o) => `Radar updated · ${o.signals} new signal${o.signals === 1 ? '' : 's'}`)
  const [all, setAll] = useState(false)
  if (isLoading || !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-soft" />)}</div>
  const o = data.outlook
  const status = (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3">
      <Radar className="size-4 text-saffron" />
      <p className="min-w-0 flex-[1_1_16rem] text-sm">
        {run.isPending ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Scanning news and market chatter — about 1–2 minutes…</span>
          : o ? <>Radar updated <b className="font-medium">{ago(o.created_at)}</b> · {data.sources.length} source{data.sources.length === 1 ? '' : 's'} read</> : 'Your AI market radar: what is changing, opening up and threatening your venture.'}
      </p>
      <Button size="sm" onClick={() => run.mutate()} loading={run.isPending}><Sparkles />{o ? 'Refresh radar' : 'Scan the market'}</Button>
    </div>
  )
  if (!o) {
    return <div className="space-y-4">{status}{data.signals.length > 0 && <Section question="From the daily monitoring sweep" title="Signal feed"><div className="space-y-3">{data.signals.map((s) => <SignalCard key={s.id} s={s} />)}</div></Section>}
      {data.signals.length === 0 && <Empty icon={<Radar />} title="No market intelligence yet">The radar reads fresh news and community chatter, then tells you which signals, opportunities, threats and trends matter to your venture.</Empty>}</div>
  }
  const [healthTone, healthLabel] = HEALTH[o.health]
  const feed = all ? data.signals : data.signals.slice(0, 6)
  return (
    <div className="space-y-12">
      <MarketBrief data={data} />
      {status}
      {!o.live && <p className="rounded-xl border border-[#f3e0b3] bg-[#fdf6e6] px-4 py-3 text-sm text-[#8a5e12]">No live sources were available, so this radar is analysis from your venture's own data and the AI's market knowledge — add a Tavily key for real-time signals.</p>}

      <Section n={1} question="How healthy is the market for us right now?" title="Market overview">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_1fr_1fr]">
          <Card className="flex items-center gap-4 p-5">
            <ScoreRing value={o.confidence} size={72} stroke={6} label={`Confidence ${o.confidence}%`} />
            <div><p className="text-[13px] text-muted">Market health</p><Badge tone={healthTone} className="mt-1 px-3 py-1 text-sm">{healthLabel}</Badge><p className="mt-1.5 text-xs text-muted">Confidence {o.confidence}%</p></div>
          </Card>
          <Bullets title="Key drivers" items={o.drivers} dot="bg-[#6fa33a]" />
          <Bullets title="Key risks" items={o.risks} dot="bg-rose" />
        </div>
      </Section>

      <Section n={2} question="What is changing?" title="Signal feed" right={data.signals.length > 6 ? <Button size="sm" variant="light" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${data.signals.length}`}</Button> : undefined}>
        {feed.length ? <div className="space-y-3">{feed.map((s) => <SignalCard key={s.id} s={s} />)}</div>
          : <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">No new developments found in the sources this time.</p>}
      </Section>

      <Section n={3} question="What opportunities are emerging?" title="Emerging opportunities">
        <CardGrid>
          {data.opportunities.map((x) => (
            <OpportunityScoreCard key={x.id} opportunity={x.title} score={x.score}
              reason={<div className="space-y-3"><LongText text={x.description} />
                <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs"><Mini label="Market size"><Badge tone={SIZE[x.market_size]}>{x.market_size}</Badge></Mini><Mini label="Difficulty"><Badge tone={BAD_WHEN_HIGH[x.difficulty]}>{x.difficulty}</Badge></Mini><Mini label="Time horizon">{x.time_horizon}</Mini></dl></div>} />
          ))}
        </CardGrid>
      </Section>

      <Section n={4} question="What could hurt us?" title="Threat radar">
        <CardGrid>
          {data.threats.map((t) => (
            <RiskCard key={t.id} risk={t.title} severity={t.severity} mitigation={t.suggested_action}
              detail={<div className="space-y-2"><LongText text={t.description} /><p className="text-xs text-muted">Likelihood: <span className="capitalize text-ink-2">{t.likelihood}</span></p></div>} />
          ))}
        </CardGrid>
      </Section>

      <Section n={5} question="Which trends matter right now?" title="Trend analysis"><Trends trends={data.trends} /></Section>

      <Section n={6} question="Where is the industry heading?" title="Industry outlook">
        <Card className="p-6">
          <Badge tone={healthTone} className="px-3 py-1 text-sm">{healthLabel}</Badge>
          <LongText text={o.summary} className="mt-3 max-w-3xl" />
          {o.best_area && <div className="mt-4 rounded-xl bg-[#e8f3dc] p-4 text-sm"><p className="text-xs text-[#3f6b17]">Most promising area</p><p className="mt-0.5 font-medium">{o.best_area}</p></div>}
        </Card>
      </Section>

      {data.sources.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Sources read in the last scan ({data.sources.length})</summary>
          <ul className="mt-3 space-y-1.5">{data.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer" className="text-azure hover:underline">{s.title || s.domain}</a>{s.domain && <span className="text-faint"> · {s.domain}</span>}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
