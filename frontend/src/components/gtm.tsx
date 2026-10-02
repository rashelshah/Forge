import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Download, Loader2, Megaphone, RefreshCw, Rocket, Target, TrendingUp } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ConfirmButton, Empty, ErrorNote, ScoreRing } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Disclose, FoldSection, FounderBrief, InsightCard, LongText, RiskCard, gist } from '@/components/ux'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { GtmAsset, GtmData } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

/* eslint-disable @typescript-eslint/no-explicit-any */
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cn('font-mono text-[10px] tracking-[0.14em] text-muted uppercase', className)}>{children}</p>

/** Each part of the launch package stays folded until opened; the nav pills below link straight into them. */
function Section({ id, n, title, blurb, children, downloads }: { id: string; n: number; title: string; blurb: string; children: ReactNode; downloads?: (GtmAsset | undefined)[] }) {
  const dl = downloads?.filter(Boolean) as GtmAsset[] | undefined
  return (
    <FoldSection id={id} title={`${n}. ${title}`} hint={blurb} aside={dl?.length ? <div className="flex flex-wrap gap-2">{dl.map((a) => <Dl key={a.key} a={a} />)}</div> : undefined}>{children}</FoldSection>
  )
}

const Dl = ({ a }: { a: GtmAsset }) => (
  <a href={a.url} target="_blank" rel="noreferrer" download={a.filename} className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm transition hover:border-line-2 hover:shadow-float">
    <Download className="size-3.5 shrink-0 text-muted" /><span className="truncate">{a.label}</span><span className="shrink-0 text-xs text-faint">{kb(a.bytes)}</span>
  </a>
)

const List = ({ items }: { items?: string[] }) => <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{(items ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>
const Field = ({ label, children }: { label: string; children: ReactNode }) => <div><Eyebrow>{label}</Eyebrow><div className="mt-1 text-[15px] leading-relaxed text-ink-2">{children}</div></div>

// ---------------------------------------------------------------- dashboard

const AREAS: [string, string][] = [['brand', 'Brand'], ['marketing', 'Marketing'], ['product', 'Product'], ['sales', 'Sales']]

function Dashboard({ rd }: { rd: any }) {
  return (
    <Card className="relative isolate overflow-hidden p-6">
      <div className="aurora-soft -z-10" />
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-4">
          <ScoreRing value={rd.readiness_percent} size={92} stroke={8} label={`Launch readiness ${rd.readiness_percent}%`} />
          <div><Eyebrow>Launch readiness</Eyebrow><p className="mt-1 text-3xl font-medium tabular-nums">{rd.launch_score}<span className="text-lg text-muted"> / 10 launch score</span></p>
            <p className="text-xs text-muted">{rd.asset_readiness}% of launch assets ready − {rd.penalty} points for blocking issues</p></div>
        </div>
        <div className="grid min-w-64 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {AREAS.map(([k, label]) => (
            <div key={k}><div className="flex justify-between text-xs"><span className="text-muted">{label} readiness</span><span className="font-medium tabular-nums">{rd.areas[k]}%</span></div>
              <div className="mt-1.5 h-1.5 rounded-full bg-soft"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" style={{ width: `${rd.areas[k]}%` }} /></div></div>
          ))}
        </div>
      </div>
      {rd.blocking_issues.length > 0 && (
        <div className="mt-6">
          <Eyebrow className="flex items-center gap-1.5"><AlertTriangle className="size-3 text-rose" />Blocking issues ({rd.blocking_issues.length})</Eyebrow>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">{rd.blocking_issues.map((b: any, i: number) => <RiskCard key={i} risk={b.issue} severity={b.severity} mitigation={b.fix} />)}</div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- sections

function Brand({ a, asset }: { a: Record<string, any>; asset: (k: string) => GtmAsset | undefined }) {
  const b = a.brand, v = a.visual, kit = a.kit
  useEffect(() => {
    if (!v) return
    const id = 'gtm-fonts'
    document.getElementById(id)?.remove()
    const l = Object.assign(document.createElement('link'), { id, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${[v.heading_font, v.body_font].map((f: string) => f.replace(/ /g, '+') + ':wght@400;700;800').join('&family=')}&display=swap` })
    document.head.appendChild(l)
    return () => l.remove()
  }, [v])
  if (!b) return <Card className="p-5 text-sm text-muted">The Brand Strategist is still working…</Card>
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="saffron">{b.archetype}</Badge>{b.personality.map((p: string) => <Badge key={p} tone="neutral">{p}</Badge>)}</div>
          <p className="mt-4 text-2xl leading-snug">“{b.core_promise}”</p>
          <p className="mt-2 text-sm text-muted">Tagline: <b className="font-medium text-ink">{b.tagline}</b></p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Mission">{b.mission}</Field><Field label="Vision">{b.vision}</Field></div>
          <p className="mt-4 text-sm text-ink-2"><b className="font-medium">Why {b.archetype}:</b> {b.archetype_reason}</p>
        </Card>
        <Card className="p-6">
          <Eyebrow>Brand voice</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">{b.voice.adjectives.map((x: string) => <Badge key={x} tone="indigo">{x}</Badge>)}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><Eyebrow>Do</Eyebrow><div className="mt-1"><List items={b.voice.do} /></div></div><div><Eyebrow>Don't</Eyebrow><div className="mt-1"><List items={b.voice.dont} /></div></div></div>
          <Eyebrow className="mt-4">Sounds like</Eyebrow>{b.voice.sample_lines.map((l: string, i: number) => <p key={i} className="mt-1 text-sm italic text-ink-2">“{l}”</p>)}
        </Card>
      </div>
      <Card className="p-6"><Eyebrow>Brand values</Eyebrow><div className="mt-3 grid gap-3 sm:grid-cols-3">{b.values.map((x: any) => <div key={x.name} className="rounded-xl bg-canvas p-4"><p className="font-medium">{x.name}</p><p className="mt-1 text-sm text-ink-2">{x.meaning}</p></div>)}</div></Card>
      {v && (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><Eyebrow>Logo</Eyebrow><p className="mt-1 text-lg">{v.concept_name}</p></div></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['logo_primary', 'logo_dark', 'logo_secondary', 'logo_icon'].map((k) => { const x = asset(k); return x && <figure key={k} className={cn('grid place-items-center rounded-2xl border border-line p-5', k === 'logo_dark' ? 'bg-[#10201f]' : 'bg-white')}><img src={x.url} alt={x.label} className="max-h-28 w-auto" /><figcaption className={cn('mt-2 text-xs', k === 'logo_dark' ? 'text-white/60' : 'text-muted')}>{x.label}</figcaption></figure> })}
            </div>
            <Eyebrow className="mt-6">Logo concepts</Eyebrow>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">{(kit?.concepts ?? []).map((c: any, i: number) => (
              <div key={i} className="rounded-2xl border border-line p-4"><img src={c.png_url} alt={c.name} className="mx-auto size-24 rounded-xl" /><p className="mt-2 text-sm font-medium">{i === 0 && <Badge tone="leaf" className="mr-1.5">Recommended</Badge>}{c.name}</p><p className="mt-1 text-xs text-muted">{c.rationale}</p>{c.image_url && <img src={c.image_url} alt={`AI concept ${c.name}`} className="mt-2 rounded-lg" />}</div>
            ))}</div>
            {kit?.image_generation === 'unavailable' && <p className="mt-3 text-xs text-muted">AI concept images are off: the image model isn't available on this API plan. Logos above are editable SVG marks.</p>}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-6"><Eyebrow>Colour palette</Eyebrow>
              <div className="mt-3 grid grid-cols-5 gap-2">{v.colors.map((c: any) => <div key={c.role} className="overflow-hidden rounded-xl border border-line"><div className="h-16" style={{ background: c.hex }} /><div className="p-2 text-[11px]"><p className="font-medium">{c.name}</p><p className="text-muted uppercase">{c.hex}</p><p className="text-faint capitalize">{c.role}</p></div></div>)}</div>
              <p className="mt-3 text-sm text-ink-2">{v.color_usage}</p></Card>
            <Card className="p-6"><Eyebrow>Typography</Eyebrow>
              <p className="mt-3 text-4xl font-extrabold" style={{ fontFamily: `'${v.heading_font}', sans-serif` }}>Aa — {v.heading_font}</p>
              <p className="mt-1 text-lg" style={{ fontFamily: `'${v.body_font}', sans-serif` }}>The quick brown fox — {v.body_font}</p><div className="mt-3"><List items={v.typography_rules} /></div></Card>
          </div>
          <Card className="grid gap-4 p-6 sm:grid-cols-3"><Field label="Design direction">{v.design_direction}</Field><Field label="Icon style">{v.icon_style}</Field><Field label="Illustration style">{v.illustration_style}</Field></Card>
        </>
      )}
    </div>
  )
}

function Positioning({ a }: { a: Record<string, any> }) {
  const p = a.positioning, m = a.messaging, l = a.landing
  const [tab, setTab] = useState<'pos' | 'msg' | 'landing'>('pos')
  if (!p) return <Card className="p-5 text-sm text-muted">Waiting for the Positioning Agent…</Card>
  return (
    <div className="space-y-4">
      <Card className="relative isolate overflow-hidden p-6"><div className="aurora-soft -z-10" /><Eyebrow>Positioning statement</Eyebrow><p className="mt-2 text-xl leading-snug">{p.statement}</p>
        <p className="mt-3 text-sm text-ink-2"><b className="font-medium">Unique value proposition:</b> {p.uvp}</p></Card>
      <div className="flex gap-1.5">{([['pos', 'Positioning'], ['msg', 'Messaging'], ['landing', 'Landing page copy']] as const).map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={cn('rounded-full border px-3.5 py-1.5 text-sm transition cursor-pointer', tab === k ? 'border-dark bg-dark text-white' : 'border-line bg-white text-ink-2 hover:border-line-2')}>{label}</button>)}</div>
      {tab === 'pos' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><Eyebrow>Competitive differentiation</Eyebrow><ul className="mt-2 space-y-3">{p.differentiation.map((d: any, i: number) => <li key={i} className="text-sm"><b className="font-medium">vs {d.against}:</b> <span className="text-ink-2">{d.edge}</span></li>)}</ul></Card>
          <Card className="p-5"><Eyebrow>Target market</Eyebrow><p className="mt-2 text-sm"><b className="font-medium">{p.target_market.primary}</b></p><div className="mt-2"><List items={p.target_market.segments} /></div><p className="mt-2 text-xs text-muted">{p.target_market.size_note}</p></Card>
          <Card className="p-5 lg:col-span-2"><Eyebrow>Category creation opportunity</Eyebrow><p className="mt-2 text-sm"><span className="text-muted line-through">{p.category.current_category}</span> → <b className="font-medium">{p.category.category_name}</b></p><p className="mt-1 text-sm text-ink-2">{p.category.creation_opportunity} {p.category.why}</p></Card>
        </div>
      )}
      {tab === 'msg' && m && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 lg:col-span-2"><Eyebrow>Website headline</Eyebrow><p className="mt-1 text-2xl">{m.website_headline}</p><p className="mt-1 text-ink-2">{m.subheadline}</p></Card>
          {[['One-sentence pitch', m.one_sentence], ['Elevator pitch', m.elevator_pitch], ['Product description', m.product_description], ['LinkedIn description', m.linkedin_description], ['Investor one-liner', m.investor_one_liner]].map(([k, t]) => <Card key={k} className="p-5"><Eyebrow>{k}</Eyebrow><p className="mt-2 text-sm leading-relaxed text-ink-2">{t}</p></Card>)}
          <Card className="p-5"><Eyebrow>App Store listing</Eyebrow><p className="mt-2 font-medium">{m.app_store.title}</p><p className="text-sm text-muted">{m.app_store.subtitle}</p><p className="mt-2 text-sm text-ink-2">{m.app_store.promo}</p><p className="mt-2 text-sm text-ink-2">{m.app_store.description}</p></Card>
          <Card className="p-5 lg:col-span-2"><Eyebrow>Messaging pillars</Eyebrow><div className="mt-2 grid gap-3 sm:grid-cols-3">{m.pillars.map((x: any) => <div key={x.pillar} className="rounded-xl bg-canvas p-3"><p className="font-medium">{x.pillar}</p><p className="mt-1 text-sm text-ink-2">{x.proof}</p></div>)}</div></Card>
        </div>
      )}
      {tab === 'landing' && l && (
        <div className="space-y-4">
          <Card className="p-6 text-center"><Eyebrow>{l.hero.eyebrow}</Eyebrow><h3 className="mx-auto mt-2 max-w-2xl text-3xl">{l.hero.headline}</h3><p className="mx-auto mt-2 max-w-xl text-ink-2">{l.hero.subheadline}</p>
            <div className="mt-4 flex justify-center gap-2"><span className="rounded-full bg-dark px-5 py-2 text-sm text-white">{l.hero.primary_cta}</span><span className="rounded-full border border-line-2 px-5 py-2 text-sm">{l.hero.secondary_cta}</span></div><p className="mt-2 text-xs text-muted">{l.hero.microcopy}</p></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><Eyebrow>Problem</Eyebrow><p className="mt-1 font-medium">{l.problem_headline}</p><p className="mt-1 text-sm text-ink-2">{l.problem_body}</p></Card>
            <Card className="p-5"><Eyebrow>How it works</Eyebrow><ol className="mt-2 space-y-2 text-sm">{l.how_it_works.map((s: any, i: number) => <li key={i}><b className="font-medium">{i + 1}. {s.title}</b> <span className="text-ink-2">{s.description}</span></li>)}</ol></Card>
            <Card className="p-5"><Eyebrow>Features</Eyebrow><ul className="mt-2 space-y-2 text-sm">{l.features.map((f: any) => <li key={f.title}><b className="font-medium">{f.title}</b> — <span className="text-ink-2">{f.description}</span></li>)}</ul></Card>
            <Card className="p-5"><Eyebrow>Benefits</Eyebrow><ul className="mt-2 space-y-2 text-sm">{l.benefits.map((f: any) => <li key={f.title}><b className="font-medium">{f.title}</b> — <span className="text-ink-2">{f.description}</span></li>)}</ul></Card>
            <Card className="p-5"><Eyebrow>Social proof</Eyebrow><p className="mt-1 text-sm text-ink-2">{l.social_proof.intro}</p>{l.social_proof.stats.map((s: any, i: number) => <p key={i} className="mt-2 text-sm"><b className="font-medium">{s.value}</b> {s.label} <span className="text-xs text-faint">({s.basis})</span></p>)}
              {l.social_proof.testimonial_templates.map((t: any, i: number) => <div key={i} className="mt-3 rounded-xl border border-dashed border-line-2 p-3 text-sm"><Badge tone="amber">Template — replace with a real quote</Badge><p className="mt-1.5 italic text-ink-2">“{t.quote}”</p><p className="mt-1 text-xs text-muted">Ask: {t.who}</p></div>)}<p className="mt-2 text-xs text-muted">{l.social_proof.how_to_collect}</p></Card>
            <Card className="p-5"><Eyebrow>FAQ</Eyebrow><div className="mt-2 space-y-2">{l.faq.map((f: any, i: number) => <details key={i} className="rounded-lg bg-canvas px-3 py-2 text-sm"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-1 text-ink-2">{f.a}</p></details>)}</div></Card>
            <Card className="p-5 lg:col-span-2 text-center"><Eyebrow>Final call to action</Eyebrow><p className="mt-1 text-xl">{l.final_cta.headline}</p><p className="text-sm text-ink-2">{l.final_cta.subtext}</p><span className="mt-3 inline-block rounded-full bg-dark px-5 py-2 text-sm text-white">{l.final_cta.button}</span><p className="mt-3 text-xs text-muted">SEO title: {l.seo_title} · {l.meta_description}</p></Card>
          </div>
        </div>
      )}
    </div>
  )
}

function Gallery({ items, cols = 'sm:grid-cols-2 lg:grid-cols-3' }: { items: GtmAsset[]; cols?: string }) {
  if (!items.length) return null
  return <div className={cn('grid gap-3', cols)}>{items.map((x) => <a key={x.key} href={x.url} target="_blank" rel="noreferrer"><figure className="overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-float"><img src={x.url} alt={x.label} loading="lazy" className="max-h-80 w-full object-contain bg-canvas" /><figcaption className="px-3 py-2 text-xs text-muted">{x.label}</figcaption></figure></a>)}</div>
}

function Marketing({ a, group }: { a: Record<string, any>; group: (g: string) => GtmAsset[] }) {
  const m = a.marketing
  return (
    <div className="space-y-4">
      <Gallery items={group('graphics')} />
      {m && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5"><Eyebrow>Instagram posts</Eyebrow>{m.instagram_posts.map((p: any, i: number) => <div key={i} className="mt-3 text-sm"><p className="text-ink-2">{p.caption}</p><p className="mt-1 text-xs text-azure">{p.hashtags.map((h: string) => '#' + h.replace(/^#/, '')).join(' ')}</p></div>)}</Card>
          <Card className="p-5"><Eyebrow>LinkedIn posts</Eyebrow>{m.linkedin_posts.map((p: string, i: number) => <p key={i} className="mt-3 text-sm whitespace-pre-line text-ink-2">{p}</p>)}</Card>
          <Card className="p-5"><Eyebrow>X / Twitter posts</Eyebrow>{m.x_posts.map((p: string, i: number) => <p key={i} className="mt-3 rounded-lg bg-canvas p-2.5 text-sm text-ink-2">{p}</p>)}</Card>
        </div>
      )}
    </div>
  )
}

function Deck({ a, group }: { a: Record<string, any>; group: (g: string) => GtmAsset[] }) {
  const d = a.deck
  return (
    <div className="space-y-4">
      <Gallery items={group('slides')} cols="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
      {d && <Card className="p-5"><Eyebrow>About the numbers</Eyebrow><LongText text={d.assumptions_note} className="mt-1" /></Card>}
    </div>
  )
}

function Growth({ a }: { a: Record<string, any> }) {
  const g = a.growth
  if (!g) return <Card className="p-5 text-sm text-muted">The Growth Strategist is still working…</Card>
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">{g.launch_strategy.map((p: any, i: number) => (
        <Card key={i} className="p-5"><Badge tone="saffron">Phase {i + 1} · {p.timeframe}</Badge><p className="mt-2 text-lg font-medium">{p.name}</p><p className="mt-1 text-sm text-ink-2">{gist(p.goal, 24)}</p><p className="mt-2 text-xs text-muted">KPI: {p.kpi}</p>
          <Disclose label="View tactics" className="mt-3"><List items={p.tactics} /></Disclose></Card>))}</div>
      <div>
        <h3 className="mb-2 text-lg">Acquisition channels</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{g.channels.map((c: any) => (
          <InsightCard key={c.channel} title={c.channel} category={`${c.cost} cost`} summary={c.expected_result}
            evidence={<div className="space-y-2 text-sm text-ink-2"><p><b className="font-medium text-ink">Why:</b> {c.why}</p><p><b className="font-medium text-ink">Tactic:</b> {c.tactic}</p></div>} />))}</div>
      </div>
      <Disclose label="View full growth plan">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {[['First 100 users', g.first_100], ['First 1,000 users', g.first_1000]].map(([t, items]: any) => <Card key={t} className="p-5"><Eyebrow>{t}</Eyebrow><ol className="mt-2 space-y-2 text-sm">{items.map((x: any, i: number) => <li key={i}><b className="font-medium">{i + 1}. {x.action}</b> <span className="text-ink-2">{x.detail}</span></li>)}</ol></Card>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5"><Eyebrow>Growth loops</Eyebrow>{g.growth_loops.map((l: any) => <div key={l.name} className="mt-3 text-sm"><b className="font-medium">{l.name}</b><p className="text-ink-2">{l.steps.join(' → ')}</p><p className="text-xs text-muted">Metric: {l.metric}</p></div>)}</Card>
            <Card className="p-5"><Eyebrow>Referral ideas</Eyebrow><div className="mt-2"><List items={g.referral_ideas} /></div><Eyebrow className="mt-4">Community strategy</Eyebrow><LongText text={g.community_strategy} className="mt-1" /></Card>
            <Card className="p-5"><Eyebrow>Partnerships</Eyebrow>{g.partnerships.map((p: any) => <div key={p.who} className="mt-3 text-sm"><b className="font-medium">{p.who}</b><p className="text-ink-2">{p.offer}</p><p className="text-xs text-muted">{p.why}</p></div>)}</Card>
          </div>
        </div>
      </Disclose>
    </div>
  )
}

const CH: Record<string, string> = { linkedin: 'bg-[#e6eefb] text-[#1f4f9c]', instagram: 'bg-[#fbe6f1] text-[#a1266a]', x: 'bg-soft text-ink', twitter: 'bg-soft text-ink', reddit: 'bg-[#fdebe0] text-[#b4440c]', email: 'bg-[#e8f3dc] text-[#3f6b17]', blog: 'bg-[#fbf0d9] text-[#8a5e12]', tiktok: 'bg-[#e4f6f6] text-[#0e6b6b]' }

function Calendar({ a }: { a: Record<string, any> }) {
  const days: any[] = [...(a.calendar?.days ?? [])].sort((x, y) => x.day - y.day), c = a.content
  const [sel, setSel] = useState<any>(null)
  if (!days.length) return <Card className="p-5 text-sm text-muted">The Content Marketing Agent is still working…</Card>
  const chip = (ch: string) => CH[Object.keys(CH).find((k) => ch.toLowerCase().includes(k)) ?? ''] ?? 'bg-soft text-ink'
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-7">{days.map((d) => (
          <button key={d.day} onClick={() => setSel(d)} className={cn('rounded-xl border p-2.5 text-left transition cursor-pointer hover:border-line-2', sel?.day === d.day ? 'border-dark' : 'border-line')}>
            <p className="text-[11px] font-medium text-muted">Day {d.day}</p><span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', chip(d.channel))}>{d.channel}</span><p className="mt-1 line-clamp-3 text-xs text-ink-2">{d.topic}</p></button>))}</div>
        {sel && <div className="mt-3 rounded-xl bg-canvas p-4 text-sm"><p className="font-medium">Day {sel.day} · {sel.channel} · {sel.format}</p><p className="mt-1">{sel.topic}</p><p className="mt-2 text-ink-2"><b className="font-medium">Hook:</b> {sel.hook}</p><p className="text-ink-2"><b className="font-medium">CTA:</b> {sel.cta}</p></div>}
      </Card>
      {c && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><Eyebrow>Blog topics</Eyebrow>{c.blog_topics.map((t: any) => <div key={t.title} className="mt-3 text-sm"><b className="font-medium">{t.title}</b><p className="text-ink-2">{t.angle}</p><p className="text-xs text-muted">Keyword: {t.keyword} · {t.intent}</p></div>)}</Card>
          <Card className="p-5"><Eyebrow>SEO opportunities</Eyebrow><table className="mt-2 w-full text-sm"><tbody>{c.seo.map((s: any) => <tr key={s.keyword} className="border-b border-line last:border-0"><td className="py-2 pr-2 font-medium">{s.keyword}</td><td className="py-2 pr-2 text-ink-2">{s.rationale}</td><td className="py-2"><Badge tone={s.difficulty === 'Low' ? 'leaf' : s.difficulty === 'Medium' ? 'amber' : 'rose'}>{s.difficulty}</Badge></td></tr>)}</tbody></table></Card>
          <Card className="p-5"><Eyebrow>X threads</Eyebrow>{c.x_threads.map((t: any, i: number) => <div key={i} className="mt-3 text-sm"><b className="font-medium">{t.hook}</b><ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-2">{t.tweets.map((x: string, j: number) => <li key={j}>{x}</li>)}</ol></div>)}</Card>
          <Card className="p-5"><Eyebrow>Reddit strategy</Eyebrow>{c.reddit.map((r: any) => <div key={r.subreddit} className="mt-3 text-sm"><b className="font-medium">{r.subreddit}</b><p className="text-ink-2">{r.approach} Idea: {r.post_idea}</p><p className="text-xs text-muted">{r.rules_note}</p></div>)}</Card>
          <Card className="p-5"><Eyebrow>LinkedIn content</Eyebrow>{c.linkedin_content.map((p: string, i: number) => <p key={i} className="mt-3 text-sm whitespace-pre-line text-ink-2">{p}</p>)}</Card>
          <Card className="p-5"><Eyebrow>Email campaigns</Eyebrow>{c.email_campaigns.map((e: any) => <div key={e.name} className="mt-3 text-sm"><b className="font-medium">{e.name}</b> <span className="text-xs text-muted">— {e.goal}</span><ul className="mt-1 space-y-1 text-ink-2">{e.emails.map((m: any, i: number) => <li key={i}>✉ {m.subject} <span className="text-xs text-faint">{m.preview}</span></li>)}</ul></div>)}<Eyebrow className="mt-4">Newsletter ideas</Eyebrow><div className="mt-1"><List items={c.newsletter_ideas} /></div></Card>
        </div>
      )}
    </div>
  )
}

function Checklist({ ventureId, a }: { ventureId: string; a: Record<string, any> }) {
  const items: any[] = a.readiness?.checklist ?? []
  // Ticks apply instantly; the save happens in the background and is rolled back (with a message) only if it fails.
  const [done, setDone] = useState<Set<string>>(() => new Set<string>(a.checklist_state?.done ?? []))
  const toggle = (id: string) => {
    const on = !done.has(id)
    const flip = (set: Set<string>, value: boolean) => { const n = new Set(set); if (value) n.add(id); else n.delete(id); return n }
    setDone((d) => flip(d, on))
    api(`/ventures/${ventureId}/gtm/checklist`, { id, done: on }).catch((e: Error) => { setDone((d) => flip(d, !on)); toast.error(`Couldn't save that change: ${e.message}`) })
  }
  if (!items.length) return <Card className="p-5 text-sm text-muted">The Launch Readiness Agent is still working…</Card>
  const cats = [...new Set(items.map((i) => i.category))]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-soft"><div className="h-full rounded-full bg-leaf transition-[width]" style={{ width: `${(100 * done.size) / items.length}%` }} /></div><span className="text-sm tabular-nums text-muted">{done.size} / {items.length} done</span></div>
      <div className="grid gap-4 lg:grid-cols-2">{cats.map((cat) => (
        <Card key={cat} className="p-5"><Eyebrow>{cat}</Eyebrow><ul className="mt-2 space-y-2">{items.filter((i) => i.category === cat).map((i) => {
          const d = done.has(i.id)
          return <li key={i.id} className="flex gap-3"><button onClick={() => toggle(i.id)} aria-pressed={d} aria-label={`${d ? 'Uncheck' : 'Check'} ${i.task}`} className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition cursor-pointer', d ? 'border-leaf bg-leaf text-white' : 'border-line-2 bg-white')}>{d && <Check className="size-3" />}</button>
            <div className={cn('text-sm', d && 'opacity-50')}><p className={cn('font-medium', d && 'line-through')}>{i.task} <Badge tone={i.priority === 'High' ? 'rose' : i.priority === 'Medium' ? 'amber' : 'neutral'} className="ml-1">{i.priority}</Badge></p><p className="text-xs text-muted">{i.why}</p></div></li>
        })}</ul></Card>))}</div>
    </div>
  )
}

// ---------------------------------------------------------------- founder brief

function GtmBrief({ a }: { a: Record<string, any> }) {
  const g = a.growth
  if (!g) return null
  const channel = g.channels.find((c: any) => c.cost === 'Low') ?? g.channels[0]
  const phase = g.launch_strategy[0]
  return (
    <FounderBrief
      note={a.readiness ? `Launch readiness ${a.readiness.readiness_percent}% · launch score ${a.readiness.launch_score}/10` : undefined}
      items={[
        { label: 'Best acquisition channel', icon: Target, tone: 'leaf', value: channel && `${channel.channel}: ${gist(channel.expected_result, 18)}` },
        { label: 'Biggest growth opportunity', icon: TrendingUp, tone: 'azure', value: g.first_100[0] && `First 100 users: ${g.first_100[0].action}` },
        { label: 'Recommended launch strategy', icon: Rocket, tone: 'amber', value: phase && `${phase.name} (${phase.timeframe}): ${gist(phase.goal, 18)}` },
      ]} />
  )
}

// ---------------------------------------------------------------- the tab

const NAV = [['brand', 'Brand identity'], ['messaging', 'Positioning & messaging'], ['marketing', 'Marketing assets'], ['deck', 'Investor deck'], ['growth', 'Growth strategy'], ['calendar', 'Content calendar'], ['ads', 'Ad creatives'], ['checklist', 'Launch checklist']]

export function GtmStudio({ ventureId }: { ventureId: string }) {
  const q = useQuery({
    queryKey: ['gtm', ventureId], queryFn: () => api<GtmData>(`/ventures/${ventureId}/gtm`), retry: false,
    refetchInterval: (query) => (['queued', 'running'].includes(query.state.data?.run?.status ?? '') ? 3000 : false), refetchIntervalInBackground: true,
  })
  const start = useAction((fresh: boolean) => api(`/ventures/${ventureId}/gtm`, { fresh }), [['gtm', ventureId], ['me']])
  if (q.error) return <ErrorNote error={q.error} />
  if (!q.data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-card bg-soft" />)}</div>
  const { run, events, artifacts: a, prerequisites } = q.data
  const assets: GtmAsset[] = a.assets?.files ?? []
  const asset = (k: string) => assets.find((x) => x.key === k)
  const group = (g: string) => assets.filter((x) => x.group === g && x.preview)
  const running = run?.status === 'queued' || run?.status === 'running'
  const DOWNLOADS = ['brand_guidelines_pdf', 'logo_pack_zip', 'deck_pptx', 'deck_pdf', 'marketing_graphics_zip', 'social_assets_zip', 'ad_creatives_zip', 'launch_checklist_csv', 'content_calendar_csv']

  if (!run) {
    return (
      <Empty icon={<Megaphone />} title="Go-To-Market Studio" action={<Button onClick={() => start.mutate(false)} loading={start.isPending} disabled={!prerequisites.ready}><Rocket />Build my launch package</Button>}>
        An AI agency team builds your brand identity, positioning, messaging, logo pack, launch graphics, ads, investor deck, growth plan, 30-day content calendar and launch checklist from your validation, competitor analysis and prototype.
        {!prerequisites.ready && <span className="mt-2 block text-rose">Run validation first — the brand is built from it.</span>}
        {prerequisites.ready && !prerequisites.prototype && <span className="mt-2 block text-[#8a5e12]">No prototype yet: product readiness will be low until you build one.</span>}
      </Empty>
    )
  }

  return (
    <div className="space-y-6">
      <GtmBrief a={a} />
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3">
        <Megaphone className="size-4 text-saffron" />
        <p className="min-w-0 flex-[1_1_16rem] text-sm">{running ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{run.stage ?? 'Starting'} — the launch team is working (about 3–8 minutes)…</span>
          : run.status === 'failed' ? <span className="text-rose">Stopped: {run.error}</span> : <>Launch package updated {ago(run.updated_at)}</>}</p>
        {run.status === 'failed' && <Button size="sm" onClick={() => start.mutate(false)} loading={start.isPending}><RefreshCw />Resume</Button>}
        {run.status === 'done' && (
          <ConfirmButton prompt="Rebuild package?" description="Rebuild everything from scratch? Current assets are replaced." onConfirm={() => start.mutate(true)}>
            <Button size="sm" variant="light" loading={start.isPending}><RefreshCw />Rebuild</Button>
          </ConfirmButton>
        )}
      </div>

      {events.length > 0 && (running || run.status === 'failed') && (
        <Card className="p-5"><Eyebrow>Agent activity</Eyebrow><ol className="mt-3 grid gap-2 sm:grid-cols-2">{events.map((e) => (
          <li key={e.id} className="flex gap-2.5 text-sm"><span className="mt-0.5">{e.status === 'running' ? <Loader2 className="size-4 animate-spin text-saffron" /> : e.status === 'failed' ? <AlertTriangle className="size-4 text-rose" /> : <Check className="size-4 text-leaf" />}</span><span className="min-w-0"><b className="font-medium">{e.agent}</b><span className="block truncate text-xs text-muted" title={e.summary ?? e.detail ?? ''}>{e.summary ?? e.detail}</span></span></li>))}</ol></Card>
      )}

      {a.readiness && <Dashboard rd={a.readiness} />}

      {a.readiness && (
        <Card className="p-5"><Eyebrow className="flex items-center gap-1.5"><Download className="size-3" />Download center</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">{DOWNLOADS.map((k) => asset(k)).filter(Boolean).map((x) => <Dl key={x!.key} a={x!} />)}</div></Card>
      )}

      <nav className="sticky top-16 z-10 -mx-1 flex gap-1.5 overflow-x-auto rounded-full border border-line bg-white/90 p-1.5 backdrop-blur" aria-label="Launch package sections">
        {NAV.map(([id, label]) => <a key={id} href={`#gtm-${id}`} className="rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-ink-2 hover:bg-soft">{label}</a>)}
      </nav>

      <Section id="gtm-brand" n={1} title="Brand identity" blurb="Who the brand is, how it sounds, and how it looks — with a logo pack and guidelines you can hand to a designer or a printer." downloads={[asset('logo_pack_zip'), asset('brand_guidelines_pdf')]}><Brand a={a} asset={asset} /></Section>
      <Section id="gtm-messaging" n={2} title="Positioning & messaging" blurb="The strategic position, the words that carry it, and complete launch-page copy."><Positioning a={a} /></Section>
      <Section id="gtm-marketing" n={3} title="Marketing assets" blurb="Launch, announcement, feature, waitlist and referral graphics as PNG plus editable HTML, with posts for each platform." downloads={[asset('marketing_graphics_zip'), asset('social_assets_zip')]}><Marketing a={a} group={group} /></Section>
      <Section id="gtm-deck" n={4} title="Investor deck" blurb="Ten slides from Problem to Ask. Traction is measured; financials and the ask are labelled assumptions." downloads={[asset('deck_pptx'), asset('deck_pdf')]}><Deck a={a} group={group} /></Section>
      <Section id="gtm-growth" n={5} title="Growth strategy" blurb="Phased launch, the first 100 and 1,000 users, channels, loops, referrals, community and partnerships."><Growth a={a} /></Section>
      <Section id="gtm-calendar" n={6} title="Content calendar" blurb="Thirty days of content, plus the blog, SEO, social, Reddit and email plans behind it." downloads={[asset('content_calendar_csv')]}><Calendar a={a} /></Section>
      <Section id="gtm-ads" n={7} title="Ad creatives" blurb="Two ads for each of Meta, Google, LinkedIn and Reddit, shown as platform mockups." downloads={[asset('ad_creatives_zip')]}>
        <Gallery items={group('ads')} cols="sm:grid-cols-2" />
        {a.ads && <div className="grid gap-3 lg:grid-cols-2">{a.ads.ads.map((x: any, i: number) => <Card key={i} className="p-4 text-sm"><Badge tone="indigo">{x.platform}</Badge> <span className="text-xs text-muted">{x.variant}</span><p className="mt-2 font-medium">{x.headline}</p><p className="text-ink-2">{x.primary_text}</p><p className="mt-1 text-xs text-muted">CTA: {x.cta} · Concept: {x.creative_concept} · Audience: {x.targeting}</p></Card>)}</div>}
      </Section>
      <Section id="gtm-checklist" n={8} title="Launch checklist" blurb="Everything between here and launch day, by priority. Tick items off as you go." downloads={[asset('launch_checklist_csv')]}><Checklist ventureId={ventureId} a={a} /></Section>
    </div>
  )
}

