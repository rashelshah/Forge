import { useQuery } from '@tanstack/react-query'
import { BotAvatar } from 'bot-avatars'
import { Boxes, Camera, Check, Code2, Compass, Database, Download, Eye, FileText, Flag, Gauge, Hammer, LayoutTemplate, Loader2, Palette, PenTool, RefreshCw, Search, ShieldAlert, Sparkles, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/bits'
import { Meta } from '@/components/doc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Disclose } from '@/components/ux'
import { Select } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, download } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { StudioDetail, StudioEvent } from '@/lib/types'
import { ago, cn, titleCase } from '@/lib/utils'
import { StatusBadge } from '@/components/studio'
import { DIMENSIONS, avg } from '@/lib/studio'

const ICONS: Record<string, typeof Code2> = {
  'Product Strategist': Compass, 'UX Architect': LayoutTemplate, 'Design Researcher': Search, 'Product Designer': Palette, 'MVP Architect': Database,
  'Frontend Architect': Boxes, 'UI Engineer': Code2, 'Screenshot Agent': Camera, 'Vision Reviewer': Eye, 'Design Critic': PenTool, 'Failure Agent': ShieldAlert,
  'Quality Scorer': Gauge, 'Refinement Agent': Hammer, Studio: Flag,
}

/** Unique bot-avatar type for each studio agent — no two share the same shape. */
const STUDIO_BOT_TYPES: Record<string, string> = {
  'Product Strategist': 'clover',
  'UX Architect': 'triangle',
  'Design Researcher': 'blob',
  'Product Designer': 'cat',
  'MVP Architect': 'square',
  'Frontend Architect': 'mech',
  'UI Engineer': 'pill',
  'Screenshot Agent': 'ghost',
  'Vision Reviewer': 'drop',
  'Design Critic': 'pebble',
  'Failure Agent': 'puddle',
  'Quality Scorer': 'circle',
  'Refinement Agent': 'hexagon',
  Studio: 'star',
}
const DOCS = [['product_spec', 'Product requirements'], ['ux_blueprint', 'UX blueprint'], ['design_spec', 'Design spec'], ['technical_spec', 'Technical spec'], ['frontend_architecture', 'Frontend architecture']] as const
const SEVERITY = { high: 'rose', medium: 'amber', low: 'neutral' } as const
const tone = (v: number) => (v >= 9 ? 'text-[#3f6b17] bg-[#e8f3dc]' : v >= 7 ? 'text-indigo bg-lavender/60' : v >= 5 ? 'text-[#8a5e12] bg-[#fbf0d9]' : 'text-rose bg-[#fbe4e0]')

const ScoreChip = ({ label, value }: { label: string; value?: number }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs', value == null ? 'bg-soft text-muted' : tone(value))}>
    {titleCase(label)}<b className="tabular-nums">{value ?? '—'}</b>
  </span>
)
const Scores = ({ scores }: { scores?: Record<string, number> }) => <div className="flex flex-wrap gap-1.5">{DIMENSIONS.map((d) => <ScoreChip key={d} label={d} value={scores?.[d]} />)}</div>
const Reasoning = ({ text }: { text?: string }) => text ? (
  <Disclose label="View agent reasoning" className="mb-5"><div className="rounded-xl border border-line bg-canvas p-4"><p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">{text}</p></div></Disclose>
) : null
const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="mb-6"><h3 className="mb-2 text-lg">{title}</h3>{children}</section>
const Issues = ({ items }: { items?: { severity: 'high' | 'medium' | 'low'; where: string; problem: string; fix: string }[] }) => (
  <ul className="space-y-2">{(items ?? []).map((i, n) => (
    <li key={n} className="rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={SEVERITY[i.severity]}>{i.severity}</Badge><span className="font-medium">{i.where}</span></div>
      <p className="mt-1.5 text-ink-2">{i.problem}</p><p className="mt-1 text-muted"><b className="font-medium text-ink-2">Fix:</b> {i.fix}</p>
    </li>))}</ul>
)

function EventRow({ e, open }: { e: StudioEvent; open: boolean }) {
  const Icon = ICONS[e.agent] ?? Sparkles
  const botType = STUDIO_BOT_TYPES[e.agent] ?? 'circle'
  const isRunning = e.status === 'running'
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        {isRunning ? (
          <span className="shrink-0 leading-none" title={`${e.agent} is working…`}>
            <BotAvatar type={botType as any} size={32} state="working" face="eyes" shading="fabric" />
          </span>
        ) : (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border', e.status === 'failed' ? 'border-rose/40 bg-[#fbe4e0] text-rose' : 'border-line bg-white text-ink-2')}>
            {e.status === 'failed' ? <X className="size-4" /> : <Icon className="size-4" />}
          </span>
        )}
        <span className="mt-1 w-px flex-1 bg-line" />
      </div>
      <div className="min-w-0 flex-1 pb-6">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">{e.agent}{e.iteration > 0 && <Badge tone="outline">v{e.iteration}</Badge>}{e.status === 'done' && <Check className="size-3.5 text-[#5d8a2b]" />}<span className="text-xs font-normal text-faint">{ago(e.created_at)}</span></p>
        {e.summary && <p className="mt-0.5 text-sm text-ink-2">{e.summary}</p>}
        {isRunning && <p className="mt-0.5 text-sm text-muted">Working…</p>}
        {e.detail && (
          <details open={open || e.status === 'failed'} className="mt-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink-2">
            <summary className="cursor-pointer text-xs text-muted select-none">{e.status === 'failed' ? 'Error' : 'Reasoning'}</summary>
            <p className="mt-2 leading-relaxed whitespace-pre-line">{e.detail}</p>
          </details>
        )}
      </div>
    </li>
  )
}

export default function StudioProject() {
  const { id } = useParams()
  const nav = useNavigate()
  const [ver, setVer] = useState<number | null>(null)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [doc, setDoc] = useState<(typeof DOCS)[number][0]>('product_spec')
  const q = useQuery({
    queryKey: ['studio', id], queryFn: () => api<StudioDetail>(`/studio/projects/${id}`), retry: false,
    refetchInterval: (query) => (['queued', 'running'].includes(query.state.data?.project.status ?? '') ? 2500 : false),
  })
  const p = q.data?.project
  const version = ver ?? p?.best_iteration ?? q.data?.versions.at(-1)?.iteration ?? 1
  const html = useQuery({ queryKey: ['studio', id, 'html', version], queryFn: () => api<{ html: string }>(`/studio/projects/${id}/versions/${version}`), enabled: !!q.data?.versions.some((v) => v.iteration === version), staleTime: Infinity })
  const retry = useAction(() => api(`/studio/projects/${id}/retry`, {}), [['studio']], 'Restarting the team')
  const del = useAction(() => api(`/studio/projects/${id}`, undefined, 'DELETE'), [['studio']], 'Deleted')
  const save = useAction((f: 'html' | 'md' | 'json') => download(`/studio/projects/${id}/export?format=${f}&iteration=${version}`, `${p?.name ?? 'prototype'}.${f === 'md' ? 'md' : f}`))

  if (q.error) return <ErrorNote error={q.error} />
  if (!q.data || !p) return <Loading />
  const { events, artifacts, versions } = q.data
  const art = (kind: string, iteration?: number) => artifacts.filter((a) => a.kind === kind && (iteration === undefined || a.iteration === iteration)).at(-1)?.content
  const shots = art('screenshots', version)
  const review = art('review_report', version)
  const scoreOf = (it: number) => art('scores', it)?.final as Record<string, number> | undefined
  const research = art('design_research_report', 0)
  const running = p.status === 'queued' || p.status === 'running'
  const width = { desktop: '100%', tablet: '820px', mobile: '390px' }[device]
  const versionPicker = (
    <Select className="w-auto" aria-label="Version" value={version} onChange={(e) => setVer(Number(e.target.value))}>
      {versions.map((v) => <option key={v.iteration} value={v.iteration}>Version {v.iteration}{v.iteration === p.best_iteration ? ' · final' : ''}</option>)}
    </Select>
  )

  return (
    <>
      <Link to="/app/studio" className="mb-3 inline-block text-sm text-muted hover:text-ink">← Product Studio</Link>
      <PageHeader eyebrow={p.industry ?? 'Product Studio'} title={<span className="flex flex-wrap items-center gap-3">{p.name}<StatusBadge p={p} /></span>} description={p.idea}
        actions={<>
          {p.status !== 'running' && <Button variant="outline" loading={retry.isPending} onClick={() => retry.mutate()}><RefreshCw />{p.status === 'done' ? 'Run again' : 'Retry'}</Button>}
          {p.status !== 'running' && <Button variant="outline" loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: () => nav('/app/studio') })}><Trash2 />Delete</Button>}
        </>} />

      {running && <p className="mb-4 flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />{p.status === 'queued' ? 'Waiting for the team to be free…' : `${p.stage ?? 'Starting'} — version ${p.iteration || 1} of up to ${p.max_iterations}`}</p>}
      {p.error && <div className="mb-4"><ErrorNote error={new Error(p.error)} /></div>}
      {Object.keys(p.scores).length > 0 && <Card className="mb-6 p-4"><div className="mb-2 flex items-baseline justify-between"><p className="text-sm font-medium">Quality scores <span className="font-normal text-muted">(0–10, target ≥ 9)</span></p><p className="text-sm tabular-nums">Average <b>{avg(p.scores)}</b></p></div><Scores scores={p.scores} /></Card>}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Agent activity</TabsTrigger><TabsTrigger value="docs">Documents</TabsTrigger><TabsTrigger value="research">Design research</TabsTrigger>
          <TabsTrigger value="prototype">Prototype</TabsTrigger><TabsTrigger value="shots">Screenshot review</TabsTrigger><TabsTrigger value="critic">Design critic</TabsTrigger>
          <TabsTrigger value="history">Refinements</TabsTrigger><TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="pt-6">
          {events.length === 0 ? <Empty icon={<Sparkles />} title="The team is warming up">Agents appear here as they start, with their reasoning.</Empty> : (
            <ol className="max-w-3xl">{events.map((e, i) => <EventRow key={e.id} e={e} open={i === events.length - 1} />)}</ol>
          )}
        </TabsContent>

        <TabsContent value="docs" className="pt-6">
          <div className="mb-5 flex flex-wrap gap-2">{DOCS.map(([k, label]) => <Button key={k} size="sm" variant={doc === k ? 'dark' : 'outline'} onClick={() => setDoc(k)}><FileText />{label}</Button>)}</div>
          {art(doc, 0) ? <div className="max-w-3xl"><Reasoning text={art(doc, 0).reasoning} /><Meta value={Object.fromEntries(Object.entries(art(doc, 0)).filter(([k]) => k !== 'reasoning'))} /></div>
            : <Empty icon={<FileText />} title="Not written yet">This document appears once its agent finishes.</Empty>}
        </TabsContent>

        <TabsContent value="research" className="pt-6">
          {!research ? <Empty icon={<Search />} title="No research yet">The Design Researcher queries the Design Intelligence knowledge base after the UX blueprint.</Empty> : (
            <div className="max-w-3xl">
              <Reasoning text={research.reasoning} />
              <Section title="Reference products">
                <div className="grid gap-3 sm:grid-cols-2">{research.references.map((r: any) => (
                  <Card key={r.name} className="p-4"><p className="font-medium">{r.name}</p>{r.url && <p className="truncate text-xs text-faint">{r.url}</p>}<p className="mt-2 text-sm text-ink-2">{r.why_relevant}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{r.borrow.map((b: string, i: number) => <li key={i}>{b}</li>)}</ul></Card>
                ))}</div>
              </Section>
              {(['landing_patterns', 'dashboard_patterns', 'onboarding_patterns', 'component_patterns', 'patterns_to_avoid', 'recommendations', 'learned_from_past_projects'] as const).map((k) => research[k]?.length ? <Section key={k} title={titleCase(k)}><Meta value={research[k]} /></Section> : null)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prototype" className="pt-6">
          {versions.length === 0 ? <Empty icon={<Code2 />} title="No prototype yet">The UI Engineer builds it after the architecture is done.</Empty> : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {versionPicker}
                {(['desktop', 'tablet', 'mobile'] as const).map((d) => <Button key={d} size="sm" variant={device === d ? 'dark' : 'outline'} onClick={() => setDevice(d)}>{titleCase(d)}</Button>)}
                <span className="flex-1" />
                <span className="text-xs text-muted">{versions.find((v) => v.iteration === version)?.summary}</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-line bg-soft p-3">
                {html.data ? <iframe title="Prototype preview" srcDoc={html.data.html} sandbox="allow-scripts allow-forms allow-modals" style={{ width, height: 760 }} className="mx-auto block max-w-full rounded-xl border border-line bg-white" /> : <Loading rows={2} />}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="shots" className="pt-6">
          {!shots ? <Empty icon={<Camera />} title="No screenshots yet">The Screenshot Agent runs the prototype in a browser and captures desktop, tablet and mobile.</Empty> : (
            <>
              <div className="mb-4 flex items-center gap-3">{versionPicker}{!shots.rendered && <Badge tone="rose">Did not render</Badge>}</div>
              {shots.errors?.length > 0 && <div className="mb-4 rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] p-3 text-xs text-rose"><p className="font-medium">Runtime errors</p>{shots.errors.map((e: string, i: number) => <p key={i} className="mt-1 font-mono break-words">{e}</p>)}</div>}
              <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shots.shots.map((s: any) => (
                <figure key={s.role}><figcaption className="mb-1.5 text-xs text-muted">{titleCase(s.device)} · {s.route}</figcaption><a href={s.url} target="_blank" rel="noreferrer"><img src={s.url} alt={`${s.device} ${s.route}`} loading="lazy" className="max-h-96 w-full rounded-xl border border-line object-cover object-top" /></a></figure>
              ))}</div>
              {review && (
                <div className="max-w-3xl"><h2 className="mb-3 text-xl">Vision review</h2><Reasoning text={review.reasoning} /><p className="mb-4 text-[15px]">{review.summary}</p><Scores scores={review.scores} />
                  <Section title="Evaluation"><div className="mt-4 space-y-2">{review.evaluations.map((e: any, i: number) => <div key={i} className="flex gap-3 rounded-xl border border-line bg-white p-3 text-sm"><ScoreChip label={e.aspect} value={e.rating} /><p className="text-ink-2">{e.notes}</p></div>)}</div></Section>
                  <Section title="Issues found"><Issues items={review.issues} /></Section></div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="critic" className="pt-6">
          {(() => {
            const fb = art('design_feedback', version), fr = art('failure_report', version)
            return !fb ? <Empty icon={<PenTool />} title="No critique yet">The Design Critic and the skeptical Failure Agent review each version.</Empty> : (
              <div className="max-w-3xl">
                <div className="mb-4">{versionPicker}</div>
                <h2 className="mb-3 text-xl">Design critic</h2><Reasoning text={fb.reasoning} /><p className="mb-4 text-[15px]">{fb.verdict}</p><Scores scores={fb.scores} />
                <Section title="What works"><Meta value={fb.strengths} /></Section><Section title="Critique"><Issues items={fb.critique} /></Section>
                {fr && <><h2 className="mt-8 mb-3 text-xl">Failure report</h2><Reasoning text={fr.reasoning} /><p className="mb-4 rounded-xl bg-[#fdf3f1] p-3 text-sm text-rose"><b>Biggest risk:</b> {fr.biggest_risk}</p>
                  <div className="space-y-2">{fr.objections.map((o: any, i: number) => <div key={i} className="rounded-xl border border-line bg-white p-3 text-sm"><div className="flex items-center gap-2"><Badge tone={SEVERITY[o.likelihood as keyof typeof SEVERITY]}>{o.likelihood}</Badge><span className="font-medium">{o.question}</span></div><p className="mt-1.5 text-ink-2">{o.why_it_fails}</p><p className="mt-1 text-muted"><b className="font-medium text-ink-2">Fix:</b> {o.fix}</p></div>)}</div></>}
              </div>
            )
          })()}
        </TabsContent>

        <TabsContent value="history" className="pt-6">
          {versions.length === 0 ? <Empty icon={<Hammer />} title="No versions yet">Every refinement round is recorded here.</Empty> : (
            <ol className="max-w-3xl space-y-4">{versions.map((v) => {
              const s = scoreOf(v.iteration), r = art('refinement', v.iteration)
              return (
                <li key={v.iteration}><Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">Version {v.iteration}</p>{v.iteration === p.best_iteration && <Badge tone="leaf">Final</Badge>}{s && <span className="ml-auto text-sm tabular-nums">Average <b>{avg(s)}</b></span>}</div>
                  <p className="mt-1 text-sm text-ink-2">{r ? r.summary : 'First build from the UX blueprint and design spec.'}</p>
                  {r && <p className="mt-1 text-xs text-muted">{r.patches_applied}/{r.patches_total} edits applied · focus: {r.focus.join('; ')}{r.token_changes.length > 0 && ` · tokens: ${r.token_changes.map((t: any) => `${t.name}→${t.value}`).join(', ')}`}</p>}
                  {s ? <div className="mt-3"><Scores scores={s} /></div> : <p className="mt-2 text-xs text-faint">Not scored{v.iteration === versions.at(-1)?.iteration && running ? ' yet' : ' (it did not render)'}</p>}
                </Card></li>
              )
            })}</ol>
          )}
        </TabsContent>

        <TabsContent value="export" className="pt-6">
          {p.status !== 'done' ? <Empty icon={<Download />} title="Export appears when the prototype is ready">You can still download any version's documents once agents have written them.</Empty> : null}
          <div className={cn('grid max-w-3xl gap-3 sm:grid-cols-3', p.status !== 'done' && 'mt-6')}>
            {([['html', 'Prototype (HTML)', 'One self-contained file: open it in any browser or host it anywhere.'], ['md', 'Full report (Markdown)', 'PRD, UX blueprint, research, design and technical specs, reviews and reasoning.'], ['json', 'Raw data (JSON)', 'Every artifact from every iteration, for your own tooling.']] as const).map(([f, t, d]) => (
              <Card key={f} className="flex flex-col p-4"><p className="font-medium">{t}</p><p className="mt-1 flex-1 text-sm text-muted">{d}</p><Button className="mt-4" variant="outline" size="sm" loading={save.isPending && save.variables === f} onClick={() => save.mutate(f)}><Download />Download</Button></Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">Exports version {version}{version === p.best_iteration ? ' (the final, highest-scoring version)' : ''}. Pick another version in the Prototype tab first to export it.</p>
        </TabsContent>
      </Tabs>
    </>
  )
}
