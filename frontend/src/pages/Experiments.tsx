import { useQuery } from '@tanstack/react-query'
import { Copy, ExternalLink, FlaskConical, MessageSquareText, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Empty, ErrorNote, Loading, PageHeader, Stat } from '@/components/bits'
import { AnalysisView } from '@/components/research'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, publicPageUrl } from '@/lib/api'
import { useAction, useVentures } from '@/lib/queries'
import type { Experiment, ExperimentAnalysis, Report } from '@/lib/types'
import { ago, cn, date, titleCase } from '@/lib/utils'

const STATUS_TONE = { draft: 'neutral', running: 'leaf', completed: 'indigo' } as const

export function ExperimentList({ ventureId, empty }: { ventureId?: string; empty?: ReactNode }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['experiments', { venture_id: ventureId }], queryFn: () => api<Experiment[]>(`/experiments${ventureId ? `?venture_id=${ventureId}` : ''}`) })
  const { data: ventures = [] } = useVentures()
  if (isLoading) return <Loading />
  if (data.length === 0) return <>{empty}</>
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((e) => {
        const pct = Math.min(100, (100 * e.metrics.conversion) / (e.target_conversion || 1))
        return (
          <Link key={e.id} to={`/app/experiments/${e.id}`} className="group">
            <Card className="h-full p-5 transition group-hover:border-line-2 group-hover:shadow-float">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted">{titleCase(e.type)}{!ventureId && ` · ${ventures.find((v) => v.id === e.venture_id)?.name ?? ''}`}</p>
                </div>
                <Badge tone={STATUS_TONE[e.status]} className="capitalize">{e.status}</Badge>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[['Visitors', e.metrics.visitors], ['Signups', e.metrics.signups], ['Conversion', `${e.metrics.conversion}%`]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-canvas py-2.5"><p className="font-display text-xl tabular-nums">{v}</p><p className="text-[11px] text-muted">{k}</p></div>
                ))}
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] text-muted"><span>vs target {e.target_conversion}%</span><span>{Math.round(pct)}%</span></div>
                <div className="h-1.5 rounded-full bg-soft"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-leaf' : 'bg-azure-2')} style={{ width: `${pct}%` }} /></div>
              </div>
              {e.result && <p className="mt-3 line-clamp-2 text-xs text-ink-2">{e.result}</p>}
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

function NewExperiment({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate()
  const { data: ventures = [] } = useVentures()
  const [f, setF] = useState({ venture_id: '', name: '', hypothesis: '', type: 'prototype', target_conversion: 10 })
  const create = useAction(async () => {
    const venture_id = f.venture_id || ventures[0]?.id
    let prototype_report_id: string | undefined
    if (f.type === 'prototype') prototype_report_id = (await api<Report[]>(`/research?venture_id=${venture_id}&kind=prototype`))[0]?.id
    return api<Experiment>('/experiments', { ...f, venture_id, prototype_report_id })
  }, [['experiments'], ['dashboard']], 'Experiment created')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New experiment</DialogTitle>
        <DialogDescription>Write a hypothesis you could prove wrong. Prototype tests share the venture's latest prototype with a feedback and waitlist widget.</DialogDescription>
        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onSuccess: (x) => { onOpenChange(false); nav(`/app/experiments/${x.id}`) } }) }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="ev">Venture</Label>
              <Select id="ev" value={f.venture_id} onChange={(e) => setF({ ...f, venture_id: e.target.value })}>
                {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
            <div><Label htmlFor="et">Type</Label>
              <Select id="et" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                {['prototype', 'interviews', 'survey', 'ads', 'other'].map((t) => <option key={t} value={t}>{t === 'prototype' ? 'Prototype test' : titleCase(t)}</option>)}
              </Select>
            </div>
          </div>
          <div><Label htmlFor="en">Name</Label><Input id="en" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="10 interviews with RAs" /></div>
          <div><Label htmlFor="eh">Hypothesis</Label><Textarea id="eh" value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} placeholder="At least 6 of 10 students describe selling textbooks as a painful weekly task." /></div>
          <div><Label htmlFor="ec">Target conversion (%)</Label><Input id="ec" type="number" min={0.1} max={100} step={0.1} value={f.target_conversion} onChange={(e) => setF({ ...f, target_conversion: Number(e.target.value) })} /></div>
          <Button type="submit" className="w-full" loading={create.isPending} disabled={!ventures.length}>Create experiment</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Experiments() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <PageHeader eyebrow="Experiment center" title="Experiments" description="Share prototypes with real users, log interviews and surveys. Results flow into venture memory and future agent decisions."
        actions={<Button onClick={() => setOpen(true)}><Plus />New experiment</Button>} />
      <ExperimentList empty={<Empty icon={<FlaskConical />} title="No experiments yet" action={<Button onClick={() => setOpen(true)}><Plus />New experiment</Button>}>Build a prototype from a venture and share it with testers, or log interviews and surveys by hand.</Empty>} />
      <NewExperiment open={open} onOpenChange={setOpen} />
    </>
  )
}

// ---------------------------------------------------------------- detail

function DailyChart({ events }: { events: NonNullable<Experiment['events']> }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5)
    return d.toISOString().slice(0, 10)
  })
  const count = (type: string, day: string) => events.filter((e) => e.type === type && e.created_at.slice(0, 10) === day).length
  const rows = days.map((d) => ({ d, v: count('visit', d), s: count('signup', d) }))
  const max = Math.max(1, ...rows.map((r) => r.v))
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium">Last 14 days</p>
        <div className="flex gap-3 text-xs text-muted"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-lavender" />Visitors</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-azure" />Signups</span></div>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${r.d}: ${r.v} visitors, ${r.s} signups`}>
            <div className="relative w-full rounded-t-md bg-lavender" style={{ height: `${(100 * r.v) / max}%`, minHeight: r.v ? 3 : 0 }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-azure" style={{ height: r.v ? `${(100 * r.s) / r.v}%` : 0 }} />
            </div>
            <span className="mt-1.5 text-center text-[9px] text-faint">{r.d.slice(8)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function ExperimentDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: e, isLoading, error } = useQuery({ queryKey: ['experiments', id], queryFn: () => api<Experiment>(`/experiments/${id}`), refetchInterval: 15_000 })
  const { data: analyses = [] } = useQuery({
    queryKey: ['research', { venture_id: e?.venture_id, kind: 'experiment_analysis' }], enabled: !!e,
    queryFn: () => api<Report<ExperimentAnalysis>[]>(`/research?venture_id=${e!.venture_id}&kind=experiment_analysis`),
  })
  const [note, setNote] = useState('')
  const inv = [['experiments'], ['research'], ['memory'], ['notifications'], ['activity']]
  const update = useAction((patch: Partial<Experiment>) => api(`/experiments/${id}`, patch, 'PATCH'), inv)
  const addNote = useAction(() => api(`/experiments/${id}/events`, { type: 'feedback', text: note }), inv, 'Feedback logged')
  const analyze = useAction(() => api<{ analysis: ExperimentAnalysis }>(`/experiments/${id}/analyze`, {}), inv, 'Analysis complete')
  const del = useAction(() => api(`/experiments/${id}`, undefined, 'DELETE'), [['experiments'], ['dashboard']], 'Experiment deleted')

  if (isLoading) return <Loading rows={4} />
  if (error || !e) return <ErrorNote error={error ?? new Error('Not found')} />
  const url = e.type === 'prototype' ? publicPageUrl(e.slug) : null
  const feedback = (e.events ?? []).filter((x) => x.type === 'feedback' || x.type === 'survey').reverse()
  const latest = analyze.data?.analysis ?? analyses.find((a) => a.title.endsWith(e.name))?.content

  return (
    <>
      <PageHeader eyebrow={`Experiment · ${titleCase(e.type)}`} title={e.name} description={e.hypothesis}
        actions={<>
          <Select value={e.status} onChange={(x) => update.mutate({ status: x.target.value as Experiment['status'] })} className="h-10 w-36" aria-label="Status">
            {['draft', 'running', 'completed'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
          <Button onClick={() => analyze.mutate()} loading={analyze.isPending}><Sparkles />Analyze results</Button>
          <Button size="icon" variant="ghost" aria-label="Delete experiment" onClick={() => confirm('Delete this experiment and its data?') && del.mutate(undefined, { onSuccess: () => nav('/app/experiments') })}><Trash2 /></Button>
        </>} />

      {url && (
        <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Badge tone={STATUS_TONE[e.status]} className="w-fit capitalize">{e.status === 'running' ? 'Live' : e.status}</Badge>
          <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="light" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))}><Copy />Copy</Button>
            <Button size="sm" variant="light" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink />Open</a></Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visitors" value={e.metrics.visitors} />
        <Stat label="Signups" value={e.metrics.signups} />
        <Stat label="Conversion" value={`${e.metrics.conversion}%`} hint={`Target ${e.target_conversion}%`} />
        <Stat label="Feedback" value={feedback.length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {url && <DailyChart events={e.events ?? []} />}
          {latest && <div><h3 className="mb-3 text-xl">Analyst verdict</h3><AnalysisView a={latest} /></div>}
          {!latest && e.result && <Card className="p-5 text-sm text-ink-2">{e.result}</Card>}
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 text-sm font-medium">Log interview notes or survey answers</p>
            <Textarea value={note} onChange={(x) => setNote(x.target.value)} placeholder="“Last week I spent 3 hours posting my textbooks in 4 group chats…”" />
            <Button size="sm" className="mt-2" onClick={() => addNote.mutate(undefined, { onSuccess: () => setNote('') })} loading={addNote.isPending} disabled={!note.trim()}>Add</Button>
          </Card>
          <Card>
            <p className="border-b border-line px-4 py-3 text-sm font-medium">Feedback & survey results</p>
            <div className="max-h-[520px] divide-y divide-line overflow-y-auto">
              {feedback.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No feedback yet.</p>}
              {feedback.map((f) => (
                <div key={f.id} className="flex gap-3 px-4 py-3">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <p className="text-sm">{f.payload.text}</p>
                    <p className="mt-1 text-[11px] text-faint">{f.payload.email ?? f.payload.source ?? f.type} · {ago(f.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <p className="text-center text-[11px] text-faint">Started {date(e.created_at)}</p>
        </div>
      </div>
    </>
  )
}
