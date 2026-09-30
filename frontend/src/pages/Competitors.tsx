import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Empty, Loading, PageHeader, SEVERITY_TONE } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAction, useVentures } from '@/lib/queries'
import type { Competitor, Signal } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

const THREAT = { low: 'leaf', medium: 'amber', high: 'rose' } as const
const INVALIDATE = [['competitors'], ['signals'], ['notifications'], ['dashboard'], ['memory'], ['activity'], ['me']]

function AddCompetitor({ ventureId, open, onOpenChange }: { ventureId?: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: ventures = [] } = useVentures()
  const [form, setForm] = useState({ venture_id: ventureId ?? '', name: '', url: '', description: '' })
  const add = useAction(() => api<Competitor>('/competitors', { ...form, venture_id: form.venture_id || ventures[0]?.id }), [['competitors']])
  const scan = useAction((id: string) => api(`/competitors/${id}/scan`, {}), INVALIDATE, 'Baseline captured')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Track a competitor</DialogTitle>
        <DialogDescription>The Competitor Intelligence Agent snapshots their site and news, then diffs every scan for pricing changes, launches, funding and acquisitions.</DialogDescription>
        <form className="mt-5 space-y-4" onSubmit={(e) => {
          e.preventDefault()
          add.mutate(undefined, { onSuccess: (c) => { onOpenChange(false); setForm({ ...form, name: '', url: '', description: '' }); scan.mutate(c.id) } })
        }}>
          {!ventureId && (
            <div><Label htmlFor="cv">Venture</Label>
              <Select id="cv" value={form.venture_id} onChange={(e) => setForm({ ...form, venture_id: e.target.value })} required>
                <option value="" disabled>Choose a venture</option>
                {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>
          )}
          <div><Label htmlFor="cn">Name</Label><Input id="cn" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Facebook Marketplace" /></div>
          <div><Label htmlFor="cu">Website</Label><Input id="cu" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/pricing" /></div>
          <div><Label htmlFor="cd">Notes</Label><Input id="cd" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Incumbent with liquidity but no campus trust" /></div>
          <Button type="submit" className="w-full" loading={add.isPending}><Plus />Track & scan</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SignalFeed({ signals, competitors }: { signals: Signal[]; competitors: Competitor[] }) {
  if (signals.length === 0) return <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-10 text-center text-sm text-muted">No signals yet. Scans run daily; you can also scan now.</p>
  return (
    <div className="space-y-3">
      {signals.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[s.severity]} className="capitalize">{s.type}</Badge>
            {s.competitor_id && <span className="text-xs text-muted">{competitors.find((c) => c.id === s.competitor_id)?.name}</span>}
            <span className="ml-auto text-[11px] text-faint">{ago(s.created_at)}</span>
          </div>
          <p className="mt-2 font-medium">{s.title}</p>
          {s.detail && <p className="mt-1 text-sm text-ink-2">{s.detail}</p>}
          {s.recommended_response && (
            <div className="mt-3 rounded-xl border border-mist bg-[#f4f7fe] px-3 py-2.5 text-sm">
              <span className="font-mono text-[10px] tracking-[0.12em] text-azure uppercase">Recommended response</span>
              <p className="mt-0.5 text-ink">{s.recommended_response}</p>
            </div>
          )}
          {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"><ExternalLink className="size-3" />Source</a>}
        </Card>
      ))}
    </div>
  )
}

export function CompetitorsPanel({ ventureId }: { ventureId?: string }) {
  const qs = ventureId ? `?venture_id=${ventureId}` : ''
  const { data: competitors = [], isLoading } = useQuery({ queryKey: ['competitors', { venture_id: ventureId }], queryFn: () => api<Competitor[]>(`/competitors${qs}`) })
  const { data: signals = [] } = useQuery({ queryKey: ['signals', { venture_id: ventureId }], queryFn: () => api<Signal[]>(`/signals${qs}`) })
  const { data: ventures = [] } = useVentures()
  const [open, setOpen] = useState(false)
  const scan = useAction((id: string) => api<{ signals: number }>(`/competitors/${id}/scan`, {}), INVALIDATE, (o) => `${o.signals} new signal(s)`)
  const del = useAction((id: string) => api(`/competitors/${id}`, undefined, 'DELETE'), [['competitors']])
  const threat = useAction(({ id, level }: { id: string; level: string }) => api(`/competitors/${id}`, { threat_level: level }, 'PATCH'), [['competitors']])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1.1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xl">Tracked competitors</h3><Button size="sm" variant="light" onClick={() => setOpen(true)} disabled={!ventures.length}><Plus />Track</Button></div>
        {isLoading ? <Loading /> : competitors.length === 0 ? (
          <Empty icon={<Radar />} title="No competitors tracked" action={<Button size="sm" onClick={() => setOpen(true)} disabled={!ventures.length}><Plus />Track a competitor</Button>}>
            Validation adds competitors it finds automatically. You can add your own too.
          </Empty>
        ) : (
          <div className="space-y-3">
            {competitors.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-soft font-display text-sm font-semibold">{c.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.name}</p>
                      <select value={c.threat_level} onChange={(e) => threat.mutate({ id: c.id, level: e.target.value })} aria-label="Threat level"
                        className={cn('rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize cursor-pointer', { low: 'bg-[#e8f3dc] text-[#3f6b17]', medium: 'bg-[#fbf0d9] text-[#8a5e12]', high: 'bg-[#fbe4e0] text-rose' }[c.threat_level])}>
                        {Object.keys(THREAT).map((t) => <option key={t} value={t}>{t} threat</option>)}
                      </select>
                      {!ventureId && <span className="text-xs text-muted">· {ventures.find((v) => v.id === c.venture_id)?.name}</span>}
                    </div>
                    {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-azure hover:underline">{c.url}</a>}
                    {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                    <p className="mt-2 text-[11px] text-faint">
                      {c.last_checked_at ? `Checked ${ago(c.last_checked_at)}` : 'Never scanned'}
                      {c.snapshot && ` · ${c.snapshot.prices.length} prices · ${c.snapshot.headings.length} sections tracked`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Scan ${c.name}`} onClick={() => scan.mutate(c.id)} loading={scan.isPending && scan.variables === c.id}>{!(scan.isPending && scan.variables === c.id) && <RefreshCw />}</Button>
                    <Button size="icon" variant="ghost" aria-label={`Stop tracking ${c.name}`} onClick={() => del.mutate(c.id)}><Trash2 /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-3 text-xl">Intelligence feed</h3>
        <SignalFeed signals={signals} competitors={competitors} />
      </div>
      <AddCompetitor ventureId={ventureId} open={open} onOpenChange={setOpen} />
    </div>
  )
}

export default function Competitors() {
  const [params, setParams] = useSearchParams()
  const venture = params.get('venture') ?? undefined
  const { data: ventures = [] } = useVentures()
  const run = useAction(() => api<{ signals: number }>('/monitor/run', {}), INVALIDATE, (o) => `Monitoring sweep complete · ${o.signals} new signal(s)`)
  return (
    <>
      <PageHeader eyebrow="Competitor intelligence" title="Competitors" description="Pricing changes, feature launches, funding and acquisitions — each with a recommended response. Agents sweep daily."
        actions={<>
          <Select value={venture ?? ''} onChange={(e) => setParams(e.target.value ? { venture: e.target.value } : {})} className="h-10 w-48" aria-label="Filter by venture">
            <option value="">All ventures</option>
            {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Button onClick={() => run.mutate()} loading={run.isPending}><Radar />Run monitoring now</Button>
        </>} />
      <CompetitorsPanel key={venture ?? 'all'} ventureId={venture} />
    </>
  )
}
