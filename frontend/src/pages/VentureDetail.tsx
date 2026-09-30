import { useQuery } from '@tanstack/react-query'
import { AppWindow, Brain, Check, FlaskConical, Gauge, Layers, Loader2, MessagesSquare, Radar, RefreshCw, Rocket, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { DECISION_COPY, LiveBoardroom } from '@/components/boardroom'
import { DecisionBadge, Empty, ErrorNote, Loading, ModeBadge, ScoreRing, StageBadge } from '@/components/bits'
import { PrototypeStudio } from '@/components/prototype'
import { MvpView, OpportunityCard, ValidationView } from '@/components/research'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAction, useVenture } from '@/lib/queries'
import type { BoardSession, Chunk, Experiment, Memory, MvpPlan, PrototypeContent, Report, Stage, Validation, Venture } from '@/lib/types'
import { ago, cn, date, titleCase } from '@/lib/utils'
import { CompetitorsPanel } from './Competitors'
import { ExperimentList } from './Experiments'

const STAGES: Stage[] = ['idea', 'validating', 'building', 'launched', 'paused', 'killed']

function useReports(ventureId: string) {
  const q = useQuery({ queryKey: ['research', { venture_id: ventureId }], queryFn: () => api<Report[]>(`/research?venture_id=${ventureId}`) })
  const latest = <C,>(kind: Report['kind']) => q.data?.find((r) => r.kind === kind) as Report<C> | undefined
  return { ...q, latest }
}

function Generating({ label }: { label: string }) {
  return (
    <Card className="flex items-center gap-3 p-6 text-sm text-ink-2">
      <Loader2 className="size-4 animate-spin text-saffron" />{label}
    </Card>
  )
}

// ---------------------------------------------------------------- overview

function Overview({ v, validation, validate, steps }: { v: Venture; validation?: Report<Validation>; validate: ReturnType<typeof useValidate>; steps: { label: string; done: boolean; tab: string }[] }) {
  const [, setParams] = useSearchParams()
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="mb-4 text-sm font-medium">Pipeline</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((s, i) => (
            <button key={s.label} onClick={() => setParams({ tab: s.tab })} className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition cursor-pointer', s.done ? 'border-[#d8e9c2] bg-[#f5faef]' : 'border-line hover:bg-canvas')}>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px]', s.done ? 'bg-leaf text-white' : 'bg-soft text-muted')}>{s.done ? <Check className="size-3" /> : i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {v.opportunity && (
        <div>
          <h3 className="mb-3 text-xl">Origin opportunity</h3>
          <OpportunityCard o={v.opportunity} />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><h3 className="text-xl">Validation</h3><ModeBadge mode={validation?.mode} />{validation && <span className="text-xs text-muted">{ago(validation.created_at)}</span>}</div>
          {validation && <Button size="sm" variant="light" onClick={() => validate.mutate()} loading={validate.isPending}><RefreshCw />Re-run</Button>}
        </div>
        {validate.isPending ? <Generating label="Validation Engine is gathering evidence and scoring demand, competition, defensibility, revenue and founder fit…" />
          : validation ? <ValidationView v={validation.content} />
          : <Empty icon={<Gauge />} title="Not validated yet" action={<Button onClick={() => validate.mutate()}><Sparkles />Run validation</Button>}>Five evidence-backed scores: demand, competition, defensibility, revenue potential and founder fit.</Empty>}
      </div>
    </div>
  )
}

function useValidate(id: string) {
  return useAction(() => api(`/ventures/${id}/validate`, {}), [['ventures'], ['research'], ['competitors'], ['memory'], ['dashboard'], ['notifications'], ['me']], 'Validation complete')
}

// ---------------------------------------------------------------- generators

function Generator<C>({ v, kind, report, label, running, empty, children }: { v: Venture; kind: 'mvp'; report?: Report<C>; label: string; running: string; empty: string; children: (c: C) => React.ReactNode }) {
  const gen = useAction(() => api(`/ventures/${v.id}/${kind}`, {}), [['research'], ['memory'], ['me'], ['activity']], `${label} ready`)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><ModeBadge mode={report?.mode} />{report && <span className="text-xs text-muted">Generated {ago(report.created_at)}</span>}</div>
        {report && <Button size="sm" variant="light" onClick={() => gen.mutate()} loading={gen.isPending}><RefreshCw />Regenerate</Button>}
      </div>
      {gen.isPending ? <Generating label={running} /> : report ? children(report.content)
        : <Empty icon={<Layers />} title={`No ${label.toLowerCase()} yet`} action={<Button onClick={() => gen.mutate()}><Sparkles />Generate {label.toLowerCase()}</Button>}>{empty}</Empty>}
    </div>
  )
}

// ---------------------------------------------------------------- memory

const MEMORY_TONE: Record<string, 'indigo' | 'saffron' | 'leaf' | 'rose' | 'amber' | 'neutral'> = {
  research: 'indigo', boardroom: 'saffron', roadmap: 'leaf', competitor: 'rose', experiment: 'amber', decision: 'neutral', feedback: 'neutral',
}

function MemoryTab({ v }: { v: Venture }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['memory', v.id], queryFn: () => api<Memory[]>(`/ventures/${v.id}/memory`) })
  const [q, setQ] = useState('')
  const [note, setNote] = useState('')
  const search = useAction(() => api<{ results: (Chunk & { memory_id: string; kind: string })[] }>(`/ventures/${v.id}/memory/search`, { query: q }))
  const add = useAction(() => api(`/ventures/${v.id}/memory`, { kind: 'feedback', title: 'Founder note', content: note }), [['memory', v.id]], 'Saved to memory')
  const kinds = [...new Set(data.map((m) => m.kind))]
  const [kind, setKind] = useState<string | null>(null)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[null, ...kinds].map((k) => (
            <button key={k ?? 'all'} onClick={() => setKind(k)} className={cn('rounded-full px-3 py-1 text-xs capitalize cursor-pointer', kind === k ? 'bg-dark text-white' : 'bg-soft text-ink-2 hover:bg-line-2')}>{k ?? 'All'} </button>
          ))}
        </div>
        {isLoading ? <Loading /> : data.length === 0 ? <Empty icon={<Brain />} title="Memory is empty">Every agent output is stored here and recalled by future agents.</Empty> : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {data.filter((m) => !kind || m.kind === kind).map((m) => (
              <li key={m.id} className="relative">
                <span className="absolute top-2 -left-[24.5px] size-2 rounded-full bg-periwinkle ring-4 ring-canvas" />
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={MEMORY_TONE[m.kind] ?? 'neutral'} className="capitalize">{m.kind}</Badge><span className="text-[11px] text-faint">{date(m.created_at)}</span></div>
                  <p className="mt-2 text-sm font-medium">{m.title}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{m.content}</p>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Semantic recall</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search.mutate() }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What did the board say about pricing?" />
            <Button size="icon" type="submit" loading={search.isPending} aria-label="Search memory">{!search.isPending && <Search />}</Button>
          </form>
          <div className="mt-3 space-y-2">
            {search.data?.results.map((r) => (
              <div key={r.memory_id} className="rounded-xl bg-canvas p-3 text-xs">
                <div className="flex justify-between gap-2"><span className="font-medium">{r.title}</span><span className="text-faint">{r.score}</span></div>
                <p className="mt-1 line-clamp-3 text-muted">{r.text}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Add feedback or a note</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Interviewed 3 RAs — all said move-out week is the peak pain…" />
          <Button size="sm" className="mt-2" onClick={() => add.mutate(undefined, { onSuccess: () => setNote('') })} loading={add.isPending} disabled={!note.trim()}>Save to memory</Button>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- page

export default function VentureDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const loc = useLocation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const { data: v, isLoading, error } = useVenture(id)
  const reports = useReports(id)
  const { data: sessions = [] } = useQuery({ queryKey: ['boardroom', { venture_id: id }], queryFn: () => api<BoardSession[]>(`/boardroom?venture_id=${id}`) })
  const { data: experiments = [] } = useQuery({ queryKey: ['experiments', { venture_id: id }], queryFn: () => api<Experiment[]>(`/experiments?venture_id=${id}`) })
  const { data: competitors = [] } = useQuery({ queryKey: ['competitors', { venture_id: id }], queryFn: () => api<{ id: string }[]>(`/competitors?venture_id=${id}`) })
  const validate = useValidate(id)
  const update = useAction((patch: Partial<Venture>) => api(`/ventures/${id}`, patch, 'PATCH'), [['ventures'], ['dashboard']])
  const remove = useAction(() => api(`/ventures/${id}`, undefined, 'DELETE'), [['ventures'], ['dashboard'], ['me']], 'Venture deleted')

  // Auto-run validation right after creation.
  const started = useRef(false)
  useEffect(() => {
    if ((loc.state as { autoValidate?: boolean })?.autoValidate && v && !started.current) {
      started.current = true
      nav('.', { replace: true, state: null })
      validate.mutate()
    }
  }, [loc.state, v, nav, validate])

  if (isLoading) return <Loading rows={4} />
  if (error || !v) return <ErrorNote error={error ?? new Error('Venture not found')} />

  const validation = reports.latest<Validation>('validation')
  const mvp = reports.latest<MvpPlan>('mvp')
  const prototype = reports.latest<PrototypeContent>('prototype')
  const steps = [
    { label: 'Validate', done: !!validation, tab: 'overview' },
    { label: 'Boardroom', done: sessions.some((s) => s.status === 'completed'), tab: 'boardroom' },
    { label: 'MVP plan', done: !!mvp, tab: 'mvp' },
    { label: 'Prototype', done: !!prototype, tab: 'prototype' },
    { label: 'Experiment', done: experiments.length > 0, tab: 'experiments' },
    { label: 'Monitor', done: competitors.length > 0, tab: 'competitors' },
  ]

  return (
    <>
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-start">
        <ScoreRing value={v.overall_score} size={84} stroke={7} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/app/ventures" className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase hover:text-ink">Ventures</Link>
            <span className="text-faint">/</span>
            <StageBadge stage={v.stage} />
            {v.verdict && (['GO', 'PIVOT', 'KILL'].includes(v.verdict) ? <DecisionBadge decision={v.verdict} /> : <Badge tone="indigo">{v.verdict}</Badge>)}
          </div>
          <h1 className="mt-2 text-[34px] leading-[1.1] sm:text-[40px]">{v.name}</h1>
          <p className="mt-2 max-w-3xl text-[15px] text-ink-2">{v.idea}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={v.stage} onChange={(e) => update.mutate({ stage: e.target.value as Stage })} className="h-9 w-36 text-sm capitalize" aria-label="Stage">
            {STAGES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
          <Button size="icon" variant="ghost" aria-label="Delete venture" onClick={() => confirm(`Delete ${v.name} and everything its agents produced?`) && remove.mutate(undefined, { onSuccess: () => nav('/app/ventures') })}><Trash2 /></Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t })}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview"><Gauge />Overview</TabsTrigger>
          <TabsTrigger value="boardroom"><MessagesSquare />Boardroom</TabsTrigger>
          <TabsTrigger value="mvp"><Layers />MVP Architect</TabsTrigger>
          <TabsTrigger value="prototype"><AppWindow />Prototype</TabsTrigger>
          <TabsTrigger value="competitors"><Radar />Competitors</TabsTrigger>
          <TabsTrigger value="experiments"><FlaskConical />Experiments</TabsTrigger>
          <TabsTrigger value="memory"><Brain />Memory</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><Overview v={v} validation={validation} validate={validate} steps={steps} /></TabsContent>

        <TabsContent value="boardroom" className="space-y-8">
          <LiveBoardroom venture={v} />
          {sessions.length > 1 && (
            <div>
              <h3 className="mb-3 text-xl">Earlier questions</h3>
              <div className="space-y-2">
                {sessions.slice(1).map((s) => (
                  <Link key={s.id} to={`/app/boardroom/${s.id}`}>
                    <Card className="flex items-center gap-3 p-4 transition hover:border-line-2">
                      <MessagesSquare className="size-4 text-muted" />
                      <span className="flex-1 truncate text-sm">{s.question}</span>
                      {s.verdict && <DecisionBadge decision={s.verdict.decision} label={DECISION_COPY[s.verdict.decision].label} />}
                      <span className="text-xs text-faint">{ago(s.created_at)}</span>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="mvp">
          <Generator v={v} kind="mvp" report={mvp} label="MVP blueprint" running="MVP Architect is drafting features, stories, schema, APIs, architecture and sprints…"
            empty="Features, user stories, database schema, APIs, an architecture diagram, a sprint plan and team requirements — informed by boardroom decisions in memory.">
            {(m) => <MvpView m={m} />}
          </Generator>
        </TabsContent>

        <TabsContent value="prototype"><PrototypeStudio venture={v} report={prototype} /></TabsContent>

        <TabsContent value="competitors"><CompetitorsPanel ventureId={v.id} /></TabsContent>
        <TabsContent value="experiments">
          <ExperimentList ventureId={v.id} empty={
            <Empty icon={<Rocket />} title="No experiments yet" action={<Button onClick={() => setParams({ tab: 'prototype' })}><AppWindow />Go to prototype</Button>}>
              Build a prototype, then share it with real users to measure demand and collect feedback.
            </Empty>
          } />
        </TabsContent>
        <TabsContent value="memory"><MemoryTab v={v} /></TabsContent>
      </Tabs>
    </>
  )
}
