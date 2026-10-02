import { useQuery } from '@tanstack/react-query'
import { AppWindow, ArrowLeft, Compass, FileSearch, FlaskConical, Gauge, Layers, LayoutTemplate, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Empty, ErrorNote, Loading, ModeBadge, PageHeader } from '@/components/bits'
import { OpportunityCard, ReportBody, ResearchBrief, ResearchInsights, ventureFromOpportunity } from '@/components/research'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { VentureSelect } from '@/components/VentureSelect'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAction, useVentures } from '@/lib/queries'
import { useVentureFilter } from '@/lib/venture'
import type { Opportunity, Report, ReportKind, Venture } from '@/lib/types'
import { cn, date } from '@/lib/utils'

const KINDS: Record<ReportKind, { label: string; icon: typeof Gauge; tone: 'indigo' | 'saffron' | 'leaf' | 'amber' | 'neutral' }> = {
  discovery: { label: 'Discovery', icon: Compass, tone: 'saffron' },
  validation: { label: 'Validation', icon: Gauge, tone: 'indigo' },
  mvp: { label: 'MVP blueprint', icon: Layers, tone: 'leaf' },
  prototype: { label: 'Prototype', icon: AppWindow, tone: 'amber' },
  landing: { label: 'Landing page (legacy)', icon: LayoutTemplate, tone: 'neutral' },
  experiment_analysis: { label: 'Experiment analysis', icon: FlaskConical, tone: 'neutral' },
}

export default function Research() {
  const [kind, setKind] = useState<ReportKind | null>(null)
  const [seed, setSeed] = useState('')
  const nav = useNavigate()
  const { venture } = useVentureFilter()
  const { data = [], isLoading } = useQuery({
    queryKey: ['research', 'list', { kind, venture_id: venture?.id }],
    queryFn: () => api<Report[]>(`/research?${new URLSearchParams({ slim: '1', ...(kind && { kind }), ...(venture && { venture_id: venture.id }) })}`),
  })
  const { data: ventures = [] } = useVentures()
  // The brief and insights summarise every report, whichever kind filter is active (its own cache key: the venture page keeps full reports under another).
  const { data: all = [] } = useQuery({ queryKey: ['research', 'brief', { venture_id: venture?.id }], queryFn: () => api<Report[]>(`/research?slim=1${venture ? `&venture_id=${venture.id}` : ''}`) })
  const discover = useAction(() => api<Report>('/discover', { seed }), [['research'], ['me'], ['activity']], 'Discovery complete')

  return (
    <>
      <PageHeader eyebrow="Research" title="Research reports" description="Every opportunity scan, validation, MVP blueprint, landing page and experiment analysis your agents have produced." actions={<VentureSelect allowAll />} />
      <ResearchBrief reports={all} />
      <ResearchInsights reports={all} />
      <Card className="mb-6 overflow-hidden">
        <div className="relative isolate flex flex-col gap-4 p-5 md:flex-row md:items-center">
          <div className="aurora-soft -z-10" />
          <div className="md:w-72">
            <p className="font-medium">Opportunity Discovery Agent</p>
            <p className="text-sm text-muted">Finds recurring, evidenced problems across communities, reviews, forums, job boards and GitHub, then builds the startup case.</p>
          </div>
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); discover.mutate(undefined, { onSuccess: (r) => nav(`/app/research/${r.id}`) }) }}>
            <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="A market to explore (blank = use your founder profile)" />
            <Button type="submit" loading={discover.isPending} className="shrink-0"><Compass />Discover</Button>
          </form>
        </div>
      </Card>

      <div className="scrollbar-none mb-5 flex gap-1 overflow-x-auto">
        {([null, ...Object.keys(KINDS)] as (ReportKind | null)[]).map((k) => (
          <button key={k ?? 'all'} onClick={() => setKind(k)} className={cn('rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition cursor-pointer', kind === k ? 'bg-dark text-white shadow-press-dark' : 'text-ink-2 hover:bg-soft')}>
            {k ? KINDS[k].label : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? <Loading /> : data.length === 0 ? (
        <Empty icon={<FileSearch />} title={venture ? `No reports for ${venture.name} yet` : 'No reports yet'}>Run discovery above, or validate a venture to generate your first report.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((r) => {
            const K = KINDS[r.kind]
            return (
              <Link key={r.id} to={`/app/research/${r.id}`} className="group">
                <Card className="flex h-full gap-4 p-5 transition group-hover:border-line-2 group-hover:shadow-float">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-ink-2"><K.icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={K.tone}>{K.label}</Badge><ModeBadge mode={r.mode} /><span className="text-[11px] text-faint">{date(r.created_at)}</span></div>
                    <p className="mt-2 truncate font-medium">{r.title}</p>
                    {r.venture_id && <p className="text-xs text-muted">{ventures.find((v) => v.id === r.venture_id)?.name}</p>}
                    {r.summary && <p className="mt-1.5 line-clamp-2 text-sm text-ink-2">{r.summary}</p>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

export function ReportPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: r, isLoading, error } = useQuery({ queryKey: ['research', id], queryFn: () => api<Report>(`/research/${id}`) })
  const { data: ventures = [] } = useVentures()
  const create = useAction((o: Opportunity) => api<Venture>('/ventures', ventureFromOpportunity(o)), [['ventures'], ['me']])
  const del = useAction(() => api(`/research/${id}`, undefined, 'DELETE'), [['research']], 'Report deleted')

  if (isLoading) return <Loading rows={4} />
  if (error || !r) return <ErrorNote error={error ?? new Error('Not found')} />
  const venture = ventures.find((v) => v.id === r.venture_id)

  return (
    <>
      <Link to="/app/research" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Research</Link>
      <PageHeader eyebrow={KINDS[r.kind].label} title={r.title}
        description={<span className="flex flex-wrap items-center gap-2">{date(r.created_at)}{venture && <>· <Link className="text-azure hover:underline" to={`/app/ventures/${venture.id}`}>{venture.name}</Link></>}<ModeBadge mode={r.mode} /></span>}
        actions={<Button size="icon" variant="ghost" aria-label="Delete report" onClick={() => confirm('Delete this report?') && del.mutate(undefined, { onSuccess: () => nav('/app/research') })}><Trash2 /></Button>} />
      {(r.kind === 'discovery' || r.kind === 'validation') && <ResearchBrief reports={[r]} />}
      {r.kind === 'discovery' ? (
        <div className="space-y-3">
          {(r.content as { opportunities: Opportunity[] }).opportunities.map((o) => (
            <OpportunityCard key={o.title} o={o} action={
              <Button size="sm" loading={create.isPending && create.variables === o} onClick={() => create.mutate(o, { onSuccess: (v) => nav(`/app/ventures/${v.id}`, { state: { autoValidate: true } }) })}>Create venture</Button>
            } />
          ))}
        </div>
      ) : <ReportBody r={r} />}
    </>
  )
}
