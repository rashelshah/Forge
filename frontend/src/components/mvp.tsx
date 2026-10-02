import { Ban, CalendarDays, CheckCircle2, Flag, Gauge, Hammer, Rocket, ShieldAlert, ShoppingCart, Target, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ActionCard, FoldSection, FounderBrief, LongText, RiskCard, gist } from '@/components/ux'
import type { Level, MvpComponent, MvpPlan, MvpStrategy } from '@/lib/types'
import { cn } from '@/lib/utils'

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

/** Reference material (schema, APIs, sprints…) stays folded until asked for. */
const Section = ({ title, children }: { title: string; children: ReactNode }) => <FoldSection title={title}>{children}</FoldSection>

const PRIORITY_TONE = { must: 'dark', should: 'indigo', could: 'neutral' } as const
const METHOD_TONE: Record<string, string> = { GET: 'text-[#3f6b17]', POST: 'text-azure', PUT: 'text-amber', PATCH: 'text-amber', DELETE: 'text-rose' }

// ---------------------------------------------------------------- planning maths

const DAY_CAPACITY = [5, 3.5] as const // focused build days per dev per week: best case, realistic
const TEAMS = [
  { key: 'solo', label: 'Solo founder', devs: 1 },
  { key: 'small', label: 'Small team', devs: 2 },
  { key: 'startup', label: 'Startup team', devs: 4 },
] as const
type TeamKey = (typeof TEAMS)[number]['key']

/** List-schedule components onto `devs` parallel developers, respecting dependencies. Days are focused dev days. */
function schedule(components: MvpComponent[], devs: number) {
  const byId = new Map(components.map((c) => [c.id, c]))
  const start = new Map<string, number>()
  const end = new Map<string, number>()
  const free = Array<number>(devs).fill(0)
  const pending = new Set(components.map((c) => c.id))
  while (pending.size) {
    const ready = [...pending].map((id) => byId.get(id)!).filter((c) => c.depends_on.every((d) => end.has(d)))
    if (!ready.length) break // cycle in model output: leave the rest unscheduled rather than loop forever
    const c = ready.sort((a, b) => Math.max(0, ...a.depends_on.map((d) => end.get(d)!)) - Math.max(0, ...b.depends_on.map((d) => end.get(d)!)))[0]
    const w = free.indexOf(Math.min(...free))
    const s = Math.max(free[w], ...c.depends_on.map((d) => end.get(d)!))
    start.set(c.id, s)
    end.set(c.id, s + c.effort_days)
    free[w] = s + c.effort_days
    pending.delete(c.id)
  }
  return { start, end, days: Math.max(0, ...end.values()) }
}

const weeks = (days: number, cap: number) => Math.max(1, Math.ceil(days / cap))
const span = (days: number) => {
  const [a, b] = [weeks(days, DAY_CAPACITY[0]), weeks(days, DAY_CAPACITY[1])]
  return a === b ? `${a} week${a > 1 ? 's' : ''}` : `${a}-${b} weeks`
}

// ---------------------------------------------------------------- shared bits

const LEVEL_TONE = { low: 'leaf', medium: 'amber', high: 'rose' } as const
const LEVEL_TONE_GOOD = { low: 'rose', medium: 'amber', high: 'leaf' } as const
const LevelBadge = ({ level, good }: { level: Level; good?: boolean }) => <Badge tone={(good ? LEVEL_TONE_GOOD : LEVEL_TONE)[level]} className="capitalize">{level}</Badge>

function Panel({ icon: Icon, title, hint, children, className }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-lg"><Icon className="size-4.5 text-muted" />{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

// ---------------------------------------------------------------- 1. recommendation

function Recommendation({ s }: { s: MvpStrategy }) {
  const r = s.recommendation
  return (
    <Card className="overflow-hidden">
      <div className="hero-light border-b border-line p-6 sm:p-8">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Product architect recommendation</p>
        <h2 className="mt-2 max-w-3xl text-[26px] leading-[1.2] sm:text-[30px]">{r.headline}</h2>
        <p className="mt-3 max-w-3xl text-[15px] text-ink-2"><span className="font-medium text-ink">Biggest challenge:</span> {r.biggest_challenge}</p>
      </div>
      <div className="p-6 sm:px-8"><LongText text={r.reason} /></div>
    </Card>
  )
}

// ---------------------------------------------------------------- 2. scope

const TIERS = [
  ['must', 'Must build', 'Required for launch', 'dark'],
  ['should', 'Should build', 'Important, not blocking', 'indigo'],
  ['could', 'Build later', 'Nice to have', 'neutral'],
] as const

const TIER_PRIORITY = { must: 'high', should: 'medium', could: 'low' } as const

function Scope({ features }: { features: MvpPlan['features'] }) {
  return (
    <Panel icon={Target} title="MVP scope" hint="Every feature sorted by what launch actually needs">
      <div className="space-y-5">
        {TIERS.map(([tier, label, sub, tone]) => {
          const list = features.filter((f) => f.priority === tier)
          return list.length ? (
            <div key={tier}>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Badge tone={tone}>{label}</Badge><span className="text-xs font-normal text-muted">{sub}</span></p>
              <div className="grid gap-2">
                {list.map((f) => <ActionCard key={f.name} className="bg-canvas" action={f.name} impact={f.user_impact} priority={TIER_PRIORITY[tier]} effort={f.effort} detail={<p className="text-sm text-ink-2">{f.reason || f.description}</p>} />)}
              </div>
            </div>
          ) : null
        })}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- 3. build vs buy

function BuildVsBuy({ rows }: { rows: MvpStrategy['build_vs_buy'] }) {
  return (
    <Panel icon={ShoppingCart} title="Build vs buy" hint="Don't spend launch weeks rebuilding solved infrastructure">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {rows.map((b) => (
          <li key={b.component} className="px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{b.component}</p>
              <Badge tone={b.decision === 'buy' ? 'indigo' : 'saffron'} className="uppercase">{b.decision}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-2">{b.provider} <span className="text-faint">·</span> <span className="text-muted">{b.time_saved}</span></p>
            <p className="mt-0.5 text-xs text-muted">{b.reason}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ---------------------------------------------------------------- 4. roadmap

function Roadmap({ components }: { components: MvpComponent[] }) {
  const [team, setTeam] = useState<TeamKey>('solo')
  const devs = TEAMS.find((t) => t.key === team)!.devs
  const plan = useMemo(() => schedule(components, devs), [components, devs])
  const weekOf = (d: number) => Math.ceil(d / 4) // 4 focused days a week is the realistic case
  const byWeek = new Map<number, MvpComponent[]>()
  for (const c of components) if (plan.start.has(c.id)) byWeek.set(weekOf(plan.start.get(c.id)! + 1), [...(byWeek.get(weekOf(plan.start.get(c.id)! + 1)) ?? []), c])
  const total = weekOf(plan.days)
  return (
    <Panel icon={CalendarDays} title="Launch roadmap" hint={`Realistic plan at 4 focused build days a week · done in about ${total} week${total > 1 ? 's' : ''}`}>
      <div className="mb-4 inline-flex rounded-full bg-soft p-0.5">
        {TEAMS.map((t) => (
          <button key={t.key} onClick={() => setTeam(t.key)} className={cn('cursor-pointer rounded-full px-3 py-1 text-xs', team === t.key ? 'bg-dark text-white' : 'text-ink-2 hover:text-ink')}>{t.label}</button>
        ))}
      </div>
      <ol className="space-y-3">
        {[...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([w, list]) => (
          <li key={w} className="flex gap-3">
            <div className="w-16 shrink-0 pt-0.5 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Week {w}</div>
            <ul className="flex-1 space-y-1.5 border-l border-line pl-3">
              {list.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted">{c.effort_days}d effort · done wk {weekOf(plan.end.get(c.id)!)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{components.reduce((n, c) => n + c.effort_days, 0)} developer-days of work · ready to launch around week {total}</p>
    </Panel>
  )
}

// ---------------------------------------------------------------- 5. complexity & cost

function CostPanel({ s }: { s: MvpStrategy }) {
  const c = s.complexity
  const days = (devs: number) => schedule(s.components, devs).days
  const priciest = [...s.components].sort((a, b) => b.effort_days - a.effort_days)[0]
  return (
    <Panel icon={Gauge} title="Complexity & cost" hint="What it takes to execute">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([['Frontend', c.frontend], ['Backend', c.backend], ['Infra', c.infrastructure], ['Overall', c.overall]] as const).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line p-2.5"><p className="text-[11px] text-muted">{k}</p><div className="mt-1"><LevelBadge level={v} /></div></div>
        ))}
      </div>
      <p className="mt-5 mb-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Estimated build time</p>
      <dl className="space-y-1 text-sm">
        {TEAMS.map((t) => <div key={t.key} className="flex justify-between"><dt className="text-ink-2">{t.label} ({t.devs} dev{t.devs > 1 ? 's' : ''})</dt><dd className="font-medium">{span(days(t.devs))}</dd></div>)}
      </dl>
      <p className="mt-5 mb-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Estimated development cost</p>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-ink-2">Bootstrap</dt><dd className="font-medium">{c.bootstrap_cost}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Agency</dt><dd className="font-medium">{c.agency_cost}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-2">Startup team</dt><dd className="font-medium">{c.team_cost}</dd></div>
      </dl>
      {priciest && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Biggest cost driver: <span className="font-medium text-ink-2">{priciest.name}</span> ({priciest.effort_days} developer-days)</p>}
    </Panel>
  )
}

// ---------------------------------------------------------------- 6. dependency graph

const NODE_W = 172, NODE_H = 58, GAP_X = 72, GAP_Y = 18

function DependencyGraph({ components }: { components: MvpComponent[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { pos, size } = useMemo(() => {
    const byId = new Map(components.map((c) => [c.id, c]))
    const level = new Map<string, number>()
    const depth = (id: string, seen: string[] = []): number => {
      if (level.has(id)) return level.get(id)!
      if (seen.includes(id)) return 0 // cycle guard
      const l = Math.max(-1, ...(byId.get(id)?.depends_on ?? []).filter((d) => byId.has(d)).map((d) => depth(d, [...seen, id]))) + 1
      level.set(id, l)
      return l
    }
    components.forEach((c) => depth(c.id))
    const rows = new Map<number, number>()
    const pos = new Map<string, { x: number; y: number }>()
    for (const c of components) {
      const l = level.get(c.id)!, r = rows.get(l) ?? 0
      rows.set(l, r + 1)
      pos.set(c.id, { x: l * (NODE_W + GAP_X), y: r * (NODE_H + GAP_Y) })
    }
    return { pos, size: { w: (Math.max(...level.values()) + 1) * (NODE_W + GAP_X) - GAP_X, h: Math.max(...rows.values()) * (NODE_H + GAP_Y) - GAP_Y } }
  }, [components])

  const active = hover ? components.find((c) => c.id === hover) : null
  const linked = (id: string) => !!active && (id === active.id || active.depends_on.includes(id) || components.find((c) => c.id === id)?.depends_on.includes(active.id))
  const nameOf = (id: string) => components.find((c) => c.id === id)?.name ?? id

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto rounded-xl border border-line bg-canvas p-4 pb-28">
        <div className="dot-grid relative rounded-lg" style={{ width: size.w, height: size.h, margin: 'auto' }}>
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h}>
            {components.flatMap((c) => c.depends_on.filter((d) => pos.has(d)).map((d) => {
              const a = pos.get(d)!, b = pos.get(c.id)!
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2, mx = (x1 + x2) / 2
              const on = !!active && (active.id === c.id || active.id === d)
              return <path key={`${d}-${c.id}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" strokeWidth={on ? 2 : 1.25}
                className={on ? 'stroke-azure' : 'stroke-faint'} opacity={active && !on ? 0.25 : 1} />
            }))}
          </svg>
          {components.map((c) => {
            const p = pos.get(c.id)!
            return (
              <button key={c.id} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                className={cn('absolute cursor-pointer rounded-xl border bg-white px-3 py-2 text-left shadow-press-light transition', active && !linked(c.id) ? 'opacity-40' : '', active?.id === c.id ? 'border-azure' : 'border-line-2')}>
                <span className="block truncate text-[13px] font-medium">{c.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted"><span className={cn('size-1.5 rounded-full', { low: 'bg-leaf', medium: 'bg-amber', high: 'bg-rose' }[c.complexity])} />{c.complexity} · {c.effort_days}d</span>
              </button>
            )
          })}
          {active && (
            <div role="tooltip" className="absolute z-10 w-64 rounded-xl border border-line-2 bg-white p-3 text-xs shadow-lg"
              style={{ left: Math.max(0, Math.min(pos.get(active.id)!.x, (scroller.current ? scroller.current.scrollLeft + scroller.current.clientWidth - 40 : size.w) - 256)), top: pos.get(active.id)!.y + NODE_H + 6 }}>
              <p className="text-sm font-medium">{active.name}</p>
              <p className="mt-1 text-ink-2">{active.description}</p>
              <p className="mt-2 text-muted">Complexity: <span className="font-medium capitalize text-ink-2">{active.complexity}</span> · {active.effort_days} developer-days</p>
              <p className="mt-0.5 text-muted">Depends on: <span className="text-ink-2">{active.depends_on.length ? active.depends_on.map(nameOf).join(', ') : 'nothing, start here'}</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 7-10. risks, metrics, avoid, investors

function Risks({ risks }: { risks: MvpStrategy['risks'] }) {
  const order = { high: 0, medium: 1, low: 2 }
  return (
    <Panel icon={ShieldAlert} title="Implementation risks" hint="Technical and business, worst first">
      <div className="grid gap-2">
        {[...risks].sort((a, b) => order[a.severity] - order[b.severity]).map((r) => (
          <RiskCard key={r.title} className="bg-canvas" risk={r.title} severity={r.severity} mitigation={r.mitigation} detail={<p>{r.explanation}</p>} />
        ))}
      </div>
    </Panel>
  )
}

function Metrics({ metrics }: { metrics: MvpStrategy['metrics'] }) {
  return (
    <Panel icon={Flag} title="Success metrics" hint="What good looks like for each feature">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {metrics.map((m) => (
          <li key={m.feature} className="px-3.5 py-2.5">
            <p className="text-sm font-medium">{m.feature}</p>
            <p className="mt-0.5 text-xs text-ink-2"><span className="text-muted">Success metric:</span> {m.metric}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Avoid({ avoid }: { avoid: MvpStrategy['avoid'] }) {
  return (
    <Panel icon={Ban} title="What not to build" hint="Most founders build too much. Skip these for now" className="border-[#f4cfc8] bg-[#fdf9f8]">
      <ul className="space-y-2.5">
        {avoid.map((a) => (
          <li key={a.name} className="flex gap-2.5">
            <X className="mt-0.5 size-4 shrink-0 text-rose" />
            <div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted">{a.reason}</p></div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Investor({ i }: { i: MvpStrategy['investor'] }) {
  const rows = [['Technical complexity', i.technical_complexity, false], ['Scalability', i.scalability, true], ['Defensibility', i.defensibility, true], ['Monetization', i.monetization, true], ['Execution risk', i.execution_risk, false]] as const
  return (
    <Panel icon={TrendingUp} title="Investor readiness" hint="How investors may read this venture">
      <dl className="space-y-2">
        {rows.map(([k, v, good]) => <div key={k} className="flex items-center justify-between text-sm"><dt className="text-ink-2">{k}</dt><dd><LevelBadge level={v} good={good} /></dd></div>)}
      </dl>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{i.note}</p>
    </Panel>
  )
}

// ---------------------------------------------------------------- page

export function MvpView({ m }: { m: MvpPlan }) {
  const s = m.strategy
  const metricFor = new Map((s?.metrics ?? []).map((x) => [x.feature, x.metric]))
  const first = s?.recommendation.prioritize.length ? s.recommendation.prioritize : m.features.filter((f) => f.priority === 'must').map((f) => f.name)
  const later = s?.recommendation.delay.length ? s.recommendation.delay : m.features.filter((f) => f.priority === 'could').map((f) => f.name)
  const solo = s?.components.length ? span(schedule(s.components, 1).days) : null
  return (
    <div className="space-y-6">
      <FounderBrief
        note={solo ? `Timeline assumes a solo founder at 4 to 5 focused build days a week` : undefined}
        items={[
          { label: 'Build first', icon: Hammer, tone: 'leaf', value: first.slice(0, 3).join(' · ') },
          { label: 'Delay', icon: Ban, tone: 'amber', value: later.slice(0, 3).join(' · ') },
          { label: 'Fastest path to launch', icon: Rocket, tone: 'azure', value: s ? `${first[0] ? `Ship ${first[0]} first. ` : ''}${solo ? `A solo founder can launch in about ${solo}.` : gist(s.recommendation.headline, 20)}` : null },
        ]} />
      {s ? (
        <>
          <Recommendation s={s} />
          <div className="grid gap-6 lg:grid-cols-2"><Scope features={m.features} /><BuildVsBuy rows={s.build_vs_buy} /></div>
          <div className="grid gap-6 lg:grid-cols-2"><Roadmap components={s.components} /><CostPanel s={s} /></div>
          <FoldSection title="Dependency graph" hint="Build left to right. Hover a step to see what it needs"><DependencyGraph components={s.components} /></FoldSection>
          <div className="grid gap-6 lg:grid-cols-2"><Risks risks={s.risks} /><Metrics metrics={s.metrics} /></div>
          <div className="grid gap-6 lg:grid-cols-2"><Avoid avoid={s.avoid} /><Investor i={s.investor} /></div>
        </>
      ) : (
        <Card className="p-5 text-sm text-ink-2">This blueprint was generated before the strategy sections existed. Press Regenerate for the architect's recommendation, build vs buy, roadmap, risks and more.</Card>
      )}

      <div className="space-y-3 pt-2">
        <Card className="p-6">
          <LongText text={m.summary} />
          <div className="mt-4 flex flex-wrap gap-1.5">{m.stack.map((t) => <Badge key={t} tone="outline">{t}</Badge>)}</div>
          <p className="mt-3 text-xs text-muted">Estimated infrastructure: {m.monthly_cost_estimate}</p>
        </Card>
      <Section title="Features">
        <div className="grid gap-3 sm:grid-cols-2">
          {m.features.map((f) => (
            <Card key={f.name} className="p-4">
              <div className="flex items-center justify-between gap-2"><p className="font-medium">{f.name}</p><Badge tone={PRIORITY_TONE[f.priority]} className="capitalize">{f.priority}</Badge></div>
              <p className="mt-1 text-sm text-muted">{f.description}</p>
              {metricFor.get(f.name) && <p className="mt-2 text-xs text-ink-2"><span className="text-muted">Success metric:</span> {metricFor.get(f.name)}</p>}
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
    </div>
  )
}
