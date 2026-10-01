import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, Minus, Radar, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Empty, ScoreRing } from '@/components/bits'
import { Section } from '@/components/intel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Level, MarketData, Signal } from '@/lib/types'
import { ago, cn, date, titleCase } from '@/lib/utils'

const KEYS = [['market'], ['memory'], ['activity'], ['notifications'], ['signals'], ['me']]
const HEALTH = { positive: ['leaf', 'Positive'], neutral: ['amber', 'Neutral'], negative: ['rose', 'Negative'] } as const
const BAD_WHEN_HIGH: Record<Level, 'rose' | 'amber' | 'leaf'> = { high: 'rose', medium: 'amber', low: 'leaf' }
const STRENGTH: Record<Level | 'info', 'saffron' | 'amber' | 'neutral'> = { high: 'saffron', medium: 'amber', low: 'neutral', info: 'neutral' }
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
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-[1_1_16rem] text-[16px] leading-snug font-medium">{s.title}</p>
        {s.type === 'radar' && <Badge tone={STRENGTH[s.severity]}>Signal strength: {titleCase(s.severity)}</Badge>}
      </div>
      {s.detail && <p className="mt-1.5 text-sm text-ink-2">{s.detail}</p>}
      {(s.impact || s.opportunity || s.recommended_response) && (
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          {s.impact && <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-muted">Potential impact</dt><dd className="mt-0.5">{s.impact}</dd></div>}
          {(s.opportunity || s.recommended_response) && <div className="rounded-xl bg-canvas p-3"><dt className="text-xs text-muted">{s.opportunity ? 'Opportunity' : 'Suggested response'}</dt><dd className="mt-0.5">{s.opportunity ?? s.recommended_response}</dd></div>}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
        <span>{when(s)}</span>
        {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-azure hover:underline"><ExternalLink className="size-3" />{s.source || new URL(s.source_url).hostname}</a>}
        {s.confidence != null && <span>Confidence {s.confidence}%</span>}
      </div>
    </Card>
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
      <div className="grid gap-3 md:grid-cols-2">
        {trends.filter((t) => !cat || t.category === cat).map((t) => {
          const [Icon, color, label] = MOMENTUM[t.momentum]
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><Badge tone="indigo">{t.category}</Badge><p className="mt-2 text-[16px] font-medium">{t.title}</p></div>
                <span className={cn('inline-flex shrink-0 items-center gap-1 text-sm font-medium', color)}><Icon className="size-4" />{label}</span>
              </div>
              {t.summary && <p className="mt-1.5 text-sm text-ink-2">{t.summary}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs"><Mini label="Confidence">{t.confidence}%</Mini><Mini label="Impact">{t.impact}</Mini></dl>
            </Card>
          )
        })}
      </div>
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
        <div className="grid gap-3 md:grid-cols-2">
          {data.opportunities.map((x) => (
            <Card key={x.id} className="p-5">
              <div className="flex items-start gap-3">
                <ScoreRing value={x.score} size={52} stroke={5} label={`Opportunity score ${x.score}`} />
                <div className="min-w-0"><p className="text-[16px] leading-snug font-medium">{x.title}</p>{x.description && <p className="mt-1 text-sm text-ink-2">{x.description}</p>}</div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                <Mini label="Market size"><Badge tone={SIZE[x.market_size]}>{x.market_size}</Badge></Mini>
                <Mini label="Difficulty"><Badge tone={BAD_WHEN_HIGH[x.difficulty]}>{x.difficulty}</Badge></Mini>
                <Mini label="Time horizon">{x.time_horizon}</Mini>
              </dl>
            </Card>
          ))}
        </div>
      </Section>

      <Section n={4} question="What could hurt us?" title="Threat radar">
        <div className="grid gap-3 md:grid-cols-2">
          {data.threats.map((t) => (
            <Card key={t.id} className="p-5">
              <p className="text-[16px] leading-snug font-medium">{t.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={BAD_WHEN_HIGH[t.severity]}>Severity: {t.severity}</Badge><Badge tone={BAD_WHEN_HIGH[t.likelihood]}>Likelihood: {t.likelihood}</Badge></div>
              {t.description && <p className="mt-2 text-sm text-ink-2">{t.description}</p>}
              <div className="mt-3 rounded-xl bg-canvas p-3 text-sm"><p className="text-xs text-muted">Suggested action</p><p className="mt-0.5">{t.suggested_action}</p></div>
            </Card>
          ))}
        </div>
      </Section>

      <Section n={5} question="Which trends matter right now?" title="Trend analysis"><Trends trends={data.trends} /></Section>

      <Section n={6} question="Where is the industry heading?" title="Industry outlook">
        <Card className="p-6">
          <Badge tone={healthTone} className="px-3 py-1 text-sm">{healthLabel}</Badge>
          {o.summary && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed">{o.summary}</p>}
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
