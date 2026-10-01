import { useQuery } from '@tanstack/react-query'
import { Database, ExternalLink, Plus } from 'lucide-react'
import { Section, INTEL_KEYS } from '@/components/intel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Competitor, DataFact, Peer, PeersData } from '@/lib/types'

const REL = { direct: 'rose', adjacent: 'amber', unverified: 'neutral' } as const
const OUT = { dead: ['rose', 'Shut down'], exited: ['indigo', 'Exited'], operating: ['leaf', 'Operating'] } as const
const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`)

function Fact({ f }: { f: DataFact }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium">{f.title}</p>
      <p className="mt-1.5 text-sm text-ink-2">{f.text}</p>
      <p className="mt-2 text-xs text-muted">Source: {f.source} · {f.n} compan{f.n === 1 ? 'y' : 'ies'}</p>
      {f.caveat && <p className="mt-0.5 text-xs text-faint">Read with care: {f.caveat}.</p>}
    </Card>
  )
}

function PeerCard({ c, ventureId, tracked }: { c: Peer; ventureId: string; tracked: boolean }) {
  const track = useAction(() => api('/competitors', { venture_id: ventureId, name: c.name, url: c.website ?? '', description: c.one_liner }), INTEL_KEYS, `Tracking ${c.name}`)
  const link = c.website ?? c.yc_url
  const meta = [c.batch?.startsWith('YC') ? c.batch : c.batch ? `YC ${c.batch}` : null, c.year ? `Founded ${c.year}` : null, c.valuation_b ? `Valued $${c.valuation_b}B${c.valuation_date ? ` (${c.valuation_date.slice(0, 4)})` : ''}` : null,
    c.funding_usd ? `Raised ${usd(c.funding_usd)}${c.funding_note ? ` · ${c.funding_note}` : ''}` : null, c.location].filter(Boolean)
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-medium">{c.name}</p>
        <div className="flex shrink-0 gap-1.5">
          {c.outcome && <Badge tone={OUT[c.outcome][0]} title={c.outcome_note ?? undefined}>{OUT[c.outcome][1]}</Badge>}
          <Badge tone={REL[c.relevance]} className="capitalize">{c.relevance === 'unverified' ? 'Similar' : c.relevance}</Badge>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-2">{c.one_liner}</p>
      {c.reason && <p className="mt-1 text-xs text-muted">Why: {c.reason}</p>}
      {meta.length > 0 && <p className="mt-2 text-xs text-muted">{meta.join(' · ')}</p>}
      {c.outcome_note && <p className="text-xs text-faint">Outcome {c.outcome_note}.</p>}
      <p className="mt-1 text-[11px] text-faint">Source: {c.sources.join(', ')}</p>
      <div className="mt-3 flex items-center gap-3 pt-1">
        {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-azure hover:underline"><ExternalLink className="size-3" />Visit</a>}
        <span className="flex-1" />
        <Button size="sm" variant="light" onClick={() => track.mutate()} loading={track.isPending} disabled={tracked}><Plus />{tracked ? 'Tracked' : 'Track'}</Button>
      </div>
    </Card>
  )
}

/** Real companies and computed statistics from Forge's startup datasets. Every number shows its sample size, source and caveat. */
export function PeersPanel({ ventureId, competitors }: { ventureId: string; competitors: Competitor[] }) {
  const { data, isLoading } = useQuery({ queryKey: ['peers', ventureId], queryFn: () => api<PeersData>(`/peers?venture_id=${ventureId}`), staleTime: 10 * 60_000, retry: false })
  if (data && !data.available) return null // datasets not loaded on this deployment: show nothing rather than an empty promise
  const names = new Set(competitors.map((c) => c.name.toLowerCase()))
  return (
    <Section question="What does real startup data say about this space?" title="Peers & market evidence"
      right={data?.stats.reviewed ? <span className="text-xs text-muted">Reviewed {data.stats.reviewed} closest companies · {data.stats.direct} direct · {data.stats.adjacent} adjacent</span> : undefined}>
      {isLoading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-soft" />)}</div> : (
        <div className="space-y-6">
          {!!data?.facts.length && <div><h3 className="mb-2 text-sm font-medium text-ink-2">Computed from the datasets</h3><div className="grid gap-3 md:grid-cols-2">{data.facts.map((f) => <Fact key={f.id} f={f} />)}</div></div>}
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink-2">Companies that overlap with your idea</h3>
            {!data?.peers.length ? <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">None of the companies in our datasets overlap with this idea. That is a useful signal, but the datasets are snapshots and samples, so it is not proof that the space is empty.</p>
              : <div className="grid gap-3 md:grid-cols-2">{data.peers.map((c) => <PeerCard key={c.name} c={c} ventureId={ventureId} tracked={names.has(c.name.toLowerCase())} />)}</div>}
          </div>
          {!!data?.coverage.length && (
            <details className="text-xs text-muted">
              <summary className="flex cursor-pointer items-center gap-1.5"><Database className="size-3" />Datasets searched ({data.coverage.length})</summary>
              <ul className="mt-2 space-y-1">{data.coverage.map((c) => <li key={c.id}>{c.label} — {c.n} companies{c.years ? `, ${c.years}` : ''}</li>)}</ul>
              <p className="mt-2 text-faint">These are snapshots and samples of the startup world, not all of it. Outcomes are as of each dataset's snapshot date, and absence from them is not proof that a competitor or market does not exist.</p>
            </details>
          )}
        </div>
      )}
    </Section>
  )
}
