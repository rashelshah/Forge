import { ArrowRight, Check, ExternalLink, Loader2, Minus, Plus, RefreshCw, Sparkles, Swords, Target, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Competitor, IntelAction, IntelData, IntelReport, RadarItem, Signal } from '@/lib/types'
import { ago, cn, date, titleCase } from '@/lib/utils'

const KEYS = [['intel'], ['competitors'], ['signals'], ['notifications'], ['memory'], ['activity'], ['me']]
export const INTEL_KEYS = KEYS

// ---------------------------------------------------------------- shared bits

function Section({ n, title, question, children, right }: { n?: number; title: string; question: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{n ? `${n} · ` : ''}{question}</p>
          <h2 className="mt-1 text-2xl">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

const threatTone = (s: number) => (s >= 67 ? ['#c43d2b', 'High'] : s >= 34 ? ['#c08827', 'Medium'] : ['#5d8a2b', 'Low']) as [string, string]

function ThreatRing({ score }: { score: number }) {
  const [color, label] = threatTone(score)
  const r = 20, c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: 52, height: 52 }} title={`Strategic threat ${score}/100 (${label})`} aria-label={`Strategic threat ${score} out of 100, ${label}`}>
      <svg width="52" height="52" className="-rotate-90"><circle cx="26" cy="26" r={r} fill="none" stroke="#f0f0f0" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} /></svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-medium tabular-nums">{score}</span>
    </div>
  )
}

const BASIS = { website: 'Website', news: 'News', history: 'Our history', analysis: 'Analysis' } as const

// ---------------------------------------------------------------- 1. weekly brief + insight

function Brief({ r }: { r: IntelReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="p-6">
        <div className="flex items-center gap-2"><Badge tone="indigo">{r.brief.period}</Badge><span className="text-sm font-medium">Competitive intelligence summary</span></div>
        <ul className="mt-4 space-y-1.5 text-[15px]">
          {r.brief.counts.length === 0
            ? <li className="text-muted">No dated competitor changes found in the past 7 days.</li>
            : r.brief.counts.map((c) => <li key={c.label} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-saffron" /><span><b>{c.count}</b> competitor{c.count === 1 ? '' : 's'} {c.label} <span className="text-muted">({c.competitors.join(', ')})</span></span></li>)}
        </ul>
        {!!r.brief.baseline?.length && <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">First snapshot recorded for {r.brief.baseline.join(', ')}. Price and feature changes are detected by comparing against it on every later run.</p>}
        <p className="mt-5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Market trend</p>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{r.brief.market_trend}</p>
        <div className="mt-5 rounded-xl border border-mist bg-[#f4f7fe] p-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-azure uppercase">Recommendation</p>
          <p className="mt-1 text-[15px] leading-relaxed">{r.brief.recommendation}</p>
        </div>
      </Card>
      <Card className="relative overflow-hidden bg-dark p-6 text-white">
        <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase"><Sparkles className="size-3.5" />Strategic insight</p>
        <p className="mt-3 text-lg leading-snug">{r.insight.insight}</p>
        <p className="mt-5 font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase">How your strategy should change</p>
        <p className="mt-1 text-[15px] leading-relaxed text-white/85">{r.insight.recommendation}</p>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- 2. recommended actions

function Actions({ actions }: { actions: IntelAction[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {actions.map((a) => (
        <Card key={a.title} className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div><Badge tone="saffron" className="capitalize">{a.kind}</Badge><h3 className="mt-2 text-lg leading-snug">{a.title}</h3></div>
            <div className="shrink-0 text-right" title="How sure the agent is, based on the evidence found">
              <p className="text-2xl font-medium tabular-nums">{a.confidence}%</p><p className="text-[10px] tracking-wide text-muted uppercase">Confidence</p>
            </div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-soft"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" style={{ width: `${a.confidence}%` }} /></div>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Reason</dt><dd className="mt-0.5 text-ink-2">{a.reason}</dd></div>
            <div><dt className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Expected impact</dt><dd className="mt-0.5 text-ink-2">{a.impact}</dd></div>
          </dl>
          <details className="mt-4 rounded-xl border border-line bg-canvas px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs text-muted select-none">Supporting evidence ({a.evidence.length})</summary>
            <ul className="mt-2 space-y-2">{a.evidence.map((e, i) => (
              <li key={i} className="flex gap-2"><Badge tone="outline" className="mt-0.5 h-fit shrink-0">{BASIS[e.basis]}</Badge>
                <span><b className="font-medium">{e.competitor}:</b> {e.fact}{e.source_url && <a href={e.source_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-azure hover:underline"><ExternalLink className="size-3" />source</a>}</span></li>
            ))}</ul>
          </details>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- 3. watchlist

function Watch({ c, memory, scan, del, scanning }: { c: Competitor; memory: IntelData['memory'][string]; scan: () => void; del: () => void; scanning: boolean }) {
  const p = c.profile
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        {p ? <ThreatRing score={p.strategic_threat} /> : <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-soft font-display text-lg font-semibold">{c.name.slice(0, 1)}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-medium">{c.name}</p>
          {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-azure hover:underline">{c.url.replace(/^https?:\/\//, '')}</a> : <p className="text-xs text-faint">No website tracked</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(p?.category ?? c.category) && <Badge tone="neutral">{p?.category ?? c.category}</Badge>}
            {p && <Badge tone={p.strategic_threat >= 67 ? 'rose' : p.strategic_threat >= 34 ? 'amber' : 'leaf'}>{threatTone(p.strategic_threat)[1]} threat</Badge>}
          </div>
        </div>
        <div className="flex">
          <Button size="icon" variant="ghost" aria-label={`Quick scan ${c.name}`} onClick={scan} loading={scanning}>{!scanning && <RefreshCw />}</Button>
          <Button size="icon" variant="ghost" aria-label={`Stop tracking ${c.name}`} onClick={del}><Trash2 /></Button>
        </div>
      </div>
      {!p ? <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-muted">Not analysed yet. Run the analysis to get this competitor's threat score, recent changes and a suggested response.</p> : (
        <div className="mt-4 space-y-4 text-sm">
          <div><p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Why they matter</p><p className="mt-0.5 text-ink-2">{p.why_it_matters}</p></div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Recent activity</p>
            {p.recent_activity.length === 0 ? <p className="mt-0.5 text-muted">No verified changes found recently.</p> : (
              <ul className="mt-1 space-y-1">{p.recent_activity.map((a, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-saffron" /><span>{a.title}{a.source_url && <a href={a.source_url} target="_blank" rel="noreferrer" className="ml-1 text-azure" aria-label="Source"><ExternalLink className="inline size-3" /></a>}</span></li>)}</ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#fbf0d9]/60 p-3"><p className="font-mono text-[10px] tracking-[0.12em] text-[#8a5e12] uppercase">Potential impact</p><p className="mt-0.5 text-ink-2">{p.potential_impact}</p></div>
            <div className="rounded-xl bg-[#f4f7fe] p-3"><p className="font-mono text-[10px] tracking-[0.12em] text-azure uppercase">Suggested response</p><p className="mt-0.5 text-ink-2">{p.suggested_response}</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-[#3f6b17] uppercase"><TrendingUp className="size-3" />Why they're winning</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{p.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div><p className="flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-rose uppercase"><TrendingDown className="size-3" />Why they're vulnerable</p><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{p.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">Competitor memory</p>
            {memory?.length ? (
              <ul className="mt-1.5 space-y-1.5">{memory.map((m) => (
                <li key={m.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-muted">{m.name}:</span>
                  {m.changed ? <><span className="text-faint line-through">{m.first.value}</span><ArrowRight className="size-3 text-muted" /><b className="font-medium">{m.last.value}</b><span className="text-xs text-faint">since {date(m.first.at)}</span></>
                    : <span>{m.last.value} <span className="text-xs text-faint">(unchanged{m.points > 1 ? ` over ${m.points} checks` : ', first recorded ' + date(m.first.at)})</span></span>}
                </li>))}</ul>
            ) : <p className="mt-1 text-muted">No measurable numbers found yet. Changes will be tracked on every run.</p>}
            <p className="mt-2 text-xs text-ink-2"><b className="font-medium">Trend:</b> {p.positioning_trend}</p>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- 4. timeline

const FILTERS = [['all', 'All', null], ['feature', 'Feature launches', ['feature']], ['pricing', 'Pricing changes', ['pricing']], ['funding', 'Funding news', ['funding', 'acquisition']],
  ['partnership', 'Partnerships', ['partnership']], ['product', 'Product updates', ['product']]] as const
const TYPE_TONE: Record<string, 'indigo' | 'amber' | 'leaf' | 'saffron' | 'neutral'> = { feature: 'indigo', pricing: 'amber', funding: 'leaf', acquisition: 'leaf', partnership: 'saffron', product: 'neutral' }

function Timeline({ signals, competitors }: { signals: Signal[]; competitors: Competitor[] }) {
  const [f, setF] = useState<(typeof FILTERS)[number][0]>('all')
  const types = FILTERS.find((x) => x[0] === f)![2]
  const when = (s: Signal) => s.occurred_on ?? s.created_at.slice(0, 10)
  const list = signals.filter((s) => !types || (types as readonly string[]).includes(s.type)).sort((a, b) => when(b).localeCompare(when(a)))
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter timeline">
        {FILTERS.map(([k, label]) => <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={cn('rounded-full border px-3 py-1 text-sm transition cursor-pointer', f === k ? 'border-dark bg-dark text-white' : 'border-line bg-white text-ink-2 hover:border-line-2')}>{label}</button>)}
      </div>
      {list.length === 0 ? <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">No events in this category yet. Each analysis adds verified changes here.</p> : (
        <ol className="relative ml-2 space-y-5 border-l border-line pl-6">
          {list.map((s) => (
            <li key={s.id} className="relative">
              <span className="absolute top-1.5 -left-[31px] size-2.5 rounded-full border-2 border-white bg-saffron" />
              <p className="text-xs font-medium text-muted">{!s.occurred_on && 'Observed '}{new Date(when(s) + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2"><Badge tone={TYPE_TONE[s.type] ?? 'neutral'} className="capitalize">{s.type}</Badge><span className="text-sm font-medium">{competitors.find((c) => c.id === s.competitor_id)?.name}</span></div>
              <p className="mt-1 text-[15px]">{s.title}</p>
              {s.detail && <p className="mt-0.5 text-sm text-muted">{s.detail}</p>}
              {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-azure hover:underline"><ExternalLink className="size-3" />Source</a>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 5. feature gap analysis

function Mark({ on, label }: { on: boolean; label: string }) {
  return on ? <Check className="mx-auto size-4 text-[#3f6b17]" aria-label={`${label}: yes`} /> : <X className="mx-auto size-4 text-rose/60" aria-label={`${label}: no`} />
}

function FeatureGap({ r, venture }: { r: IntelReport; venture: string }) {
  const { competitors, rows } = r.matrix
  const white = r.radar.white_space
  return (
    <div className="space-y-5">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left">
            <th className="sticky left-0 bg-white px-4 py-3 font-medium">Feature</th>
            <th className="px-3 py-3 text-center font-medium text-saffron">{venture}</th>
            {competitors.map((c) => <th key={c} className="max-w-28 px-3 py-3 text-center text-xs font-medium text-muted"><span className="line-clamp-2">{c}</span></th>)}
          </tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.feature} className="border-b border-line last:border-0 hover:bg-canvas/60">
              <td className="sticky left-0 bg-white px-4 py-2.5">{row.feature}{row.competitors.length === 0 && <Badge tone="saffron" className="ml-2">White space</Badge>}</td>
              <td className="bg-[#fdf6ef] px-3 py-2.5"><Mark on={row.us} label={`${venture} ${row.feature}`} /></td>
              {competitors.map((c) => <td key={c} className="px-3 py-2.5"><Mark on={row.competitors.includes(c)} label={`${c} ${row.feature}`} /></td>)}
            </tr>))}</tbody>
        </table>
      </Card>
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-lg"><Target className="size-4 text-saffron" />White space opportunities</h3>
        {white.length === 0 ? <p className="mt-2 text-sm text-muted">Every feature in this analysis is offered by at least one tracked competitor.</p> : (
          <>
            <p className="mt-1 text-sm text-muted">No tracked competitor currently shows evidence of offering:</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{white.map((w) => <li key={w.feature} className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-sm"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-saffron" /><span>{w.feature}{w.us ? <Badge tone="leaf" className="ml-2">On your roadmap</Badge> : <Badge tone="outline" className="ml-2">Not planned</Badge>}</span></li>)}</ul>
          </>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- 6. positioning map (zoom, pan, hover)

function PositioningMap({ r }: { r: IntelReport }) {
  const { axes, points } = r.positioning
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<(typeof points)[number] | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
  const W = 640, H = 440, L = 70, T = 30, PW = W - L - 30, PH = H - T - 60
  const px = (x: number) => L + (x / 100) * PW
  const py = (y: number) => T + ((100 - y) / 100) * PH
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(4, Math.max(1, v.k * f)) }))
  const competitors = r.matrix.competitors
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute top-4 right-4 z-10 flex gap-1">
        <Button size="icon" variant="light" aria-label="Zoom in" onClick={() => zoom(1.4)}><Plus /></Button>
        <Button size="icon" variant="light" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)}><Minus /></Button>
        <Button size="sm" variant="light" onClick={() => setView({ k: 1, x: 0, y: 0 })}>Reset</Button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label={`Positioning map. ${points.map((p) => `${p.name} at ${p.x}, ${p.y}`).join('; ')}`}
        onWheel={(e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15) }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })) }}
        onPointerUp={() => { drag.current = null }}>
        <defs><clipPath id="plot"><rect x={L} y={T} width={PW} height={PH} rx="10" /></clipPath></defs>
        <rect x={L} y={T} width={PW} height={PH} rx="10" fill="#fafafa" stroke="#e7e7ea" />
        <g clipPath="url(#plot)">
          <g transform={`translate(${view.x} ${view.y}) translate(${W / 2} ${H / 2}) scale(${view.k}) translate(${-W / 2} ${-H / 2})`}>
            <rect x={px(50)} y={T} width={PW / 2} height={PH / 2} fill="#fdf0e3" opacity=".6" />
            <line x1={px(50)} x2={px(50)} y1={T} y2={T + PH} stroke="#d9d9de" strokeDasharray="4 4" /><line x1={L} x2={L + PW} y1={py(50)} y2={py(50)} stroke="#d9d9de" strokeDasharray="4 4" />
            {points.map((p) => {
              const i = competitors.indexOf(p.name)
              const col = p.us ? '#ec8a44' : ['#4250d5', '#6a88e2', '#7c6fc4', '#3f8f86', '#8a7a2e', '#b25c8a'][Math.max(0, i) % 6]
              return (
                <g key={p.name} transform={`translate(${px(p.x)} ${py(p.y)})`} className="cursor-pointer" tabIndex={0} role="button" aria-label={`${p.name}: ${p.reason}`}
                  onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
                  <circle r={(p.us ? 11 : 8) / view.k} fill={col} stroke="#fff" strokeWidth={2 / view.k} opacity={hover && hover.name !== p.name ? 0.45 : 1} />
                  <text y={-14 / view.k} textAnchor="middle" fontSize={11 / view.k} fontWeight={p.us ? 600 : 400} fill="#2b2b31">{p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name}</text>
                </g>
              )
            })}
          </g>
        </g>
        <text x={L} y={H - 28} fontSize="11" fill="#7b7c84">← {cut(axes.x_left, 40)}</text>
        <text x={L + PW} y={H - 28} fontSize="11" fill="#7b7c84" textAnchor="end">{cut(axes.x_right, 40)} →</text>
        <text transform={`translate(18 ${T + PH}) rotate(-90)`} fontSize="11" fill="#7b7c84">← {cut(axes.y_low, 26)}</text>
        <text transform={`translate(18 ${T}) rotate(-90)`} fontSize="11" fill="#7b7c84" textAnchor="end">{cut(axes.y_high, 26)} →</text>
      </svg>
      <div className="min-h-14 rounded-xl bg-canvas p-3 text-sm" aria-live="polite">
        {hover ? <><b className="font-medium">{hover.name}</b> <span className="text-muted">({hover.x}, {hover.y})</span><p className="mt-0.5 text-ink-2">{hover.reason}</p></> : <p className="text-muted">Hover or focus a point for details · scroll or use +/− to zoom · drag to pan. The orange corner is where you stand apart from the pack.</p>}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- 7. feature radar

const RADAR = [['emerging', 'Emerging', 'Offered by fewer than 20% of competitors', 'indigo'], ['growing', 'Growing', 'Offered by 20–60%', 'amber'], ['saturated', 'Saturated', 'Offered by more than 60%', 'neutral'], ['white_space', 'White space', 'Offered by no tracked competitor', 'saffron']] as const

function Radar({ r }: { r: IntelReport }) {
  const n = r.matrix.competitors.length
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {RADAR.map(([k, label, hint, tone]) => (
        <Card key={k} className={cn('p-4', k === 'white_space' && 'border-saffron/40 bg-[#fdf6ef]')}>
          <div className="flex items-center justify-between"><Badge tone={tone}>{label}</Badge><span className="text-xs text-faint">{r.radar[k].length}</span></div>
          <p className="mt-1.5 text-xs text-muted">{hint}</p>
          {r.radar[k].length === 0 ? <p className="mt-3 text-sm text-faint">None</p> : (
            <ul className="mt-3 space-y-2 text-sm">{r.radar[k].map((it: RadarItem) => <li key={it.feature}>{it.feature}<span className="ml-1.5 text-xs text-faint">{it.count}/{n}{it.us && ' · you'}</span></li>)}</ul>
          )}
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- the panel

export function IntelPanel({ ventureId, ventureName, data, isLoading, onAdd }: { ventureId: string; ventureName: string; data?: IntelData; isLoading: boolean; onAdd: () => void }) {
  const run = useAction(() => api('/intel/run', { venture_id: ventureId }), KEYS, 'Analysis started')
  const scan = useAction((id: string) => api<{ signals: number }>(`/competitors/${id}/scan`, {}), KEYS, (o) => `${o.signals} new signal(s)`)
  const del = useAction((id: string) => api(`/competitors/${id}`, undefined, 'DELETE'), KEYS)
  const report = data?.report?.content
  const competitors = data?.competitors ?? []
  const building = report?.build?.status === 'running' && Date.now() - new Date(report.build.started_at ?? 0).getTime() < 15 * 60_000
  const ready = report && report.brief

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-soft" />)}</div>
  const status = (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3">
      <Swords className="size-4 text-saffron" />
      <p className="min-w-0 flex-[1_1_16rem] text-sm">
        {building ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />The Competitive Intelligence Officer is reading {competitors.length} competitor{competitors.length === 1 ? '' : 's'} — about 2–4 minutes…</span>
          : ready ? <>Analysis updated <b className="font-medium">{ago(report.generated_at)}</b> · {competitors.length} competitor{competitors.length === 1 ? '' : 's'} tracked</> : 'Your AI strategy consultant for the competitive landscape.'}
      </p>
      <Button size="sm" variant="light" onClick={onAdd}><Plus />Track competitor</Button>
      <Button size="sm" onClick={() => run.mutate()} loading={run.isPending || building} disabled={!competitors.length}><Sparkles />{ready ? 'Refresh analysis' : 'Run competitive analysis'}</Button>
    </div>
  )
  const err = report?.build?.status === 'error' && <p className="rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] px-4 py-3 text-sm text-rose">The last analysis failed: {report.build.error}</p>

  if (!competitors.length) {
    return <div className="space-y-4">{status}<div className="rounded-card border border-dashed border-line-2 bg-white px-6 py-14 text-center"><Swords className="mx-auto size-6 text-muted" /><h3 className="mt-3 text-xl">No competitors tracked yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">Validation adds competitors it finds. You can also track your own — then the agent turns them into decisions.</p><Button className="mt-5" onClick={onAdd}><Plus />Track a competitor</Button></div></div>
  }

  return (
    <div className="space-y-12">
      {status}{err}
      {ready && <>
        <Section n={1} question="What changed in the market this week?" title="Weekly competitive intelligence brief"><Brief r={report} /></Section>
        <Section n={2} question="Which features should we build next? How should our strategy change?" title="Recommended actions"><Actions actions={report.actions} /></Section>
      </>}
      <Section n={ready ? 3 : 1} question="What are competitors doing? Where are they weak?" title="Competitor watchlist"
        right={report?.skipped?.length ? <span className="text-xs text-muted">{report.skipped.length} couldn't be analysed: {report.skipped.map((s) => s.name).join(', ')}</span> : undefined}>
        <div className="grid gap-4 xl:grid-cols-2">
          {[...competitors].sort((a, b) => (b.strategic_threat ?? -1) - (a.strategic_threat ?? -1)).map((c) => (
            <Watch key={c.id} c={c} memory={data?.memory[c.id] ?? []} scan={() => scan.mutate(c.id)} del={() => del.mutate(c.id)} scanning={scan.isPending && scan.variables === c.id} />
          ))}
        </div>
      </Section>
      <Section n={ready ? 4 : 2} question="What are competitors doing, and when?" title="Competitor timeline"><Timeline signals={data?.signals ?? []} competitors={competitors} /></Section>
      {ready && <>
        <Section question="What opportunities are currently underserved?" title="Feature gap analysis"><FeatureGap r={report} venture={ventureName} /></Section>
        <Section question="Where can we stand apart?" title="Market positioning map"><PositioningMap r={report} /></Section>
        <Section question="Which features are emerging, crowded or still open?" title="Feature radar"><Radar r={report} /></Section>
      </>}
      {(data?.market.length ?? 0) > 0 && (
        <Section question="Beyond competitors" title="Market signals">
          <div className="grid gap-3 md:grid-cols-2">{data!.market.map((s) => <Card key={s.id} className="p-4"><Badge tone="neutral" className="capitalize">{titleCase(s.type)}</Badge><p className="mt-2 text-[15px] font-medium">{s.title}</p>{s.detail && <p className="mt-1 line-clamp-3 text-sm text-muted">{s.detail}</p>}</Card>)}</div>
        </Section>
      )}
    </div>
  )
}
