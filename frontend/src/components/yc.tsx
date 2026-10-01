import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Plus } from 'lucide-react'
import { Section, INTEL_KEYS } from '@/components/intel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Competitor, YcData, YcItem } from '@/lib/types'

const TONE = { direct: 'rose', adjacent: 'amber', unverified: 'neutral' } as const

function Item({ c, ventureId, tracked }: { c: YcItem; ventureId: string; tracked: boolean }) {
  const track = useAction(() => api('/competitors', { venture_id: ventureId, name: c.name, url: c.website ?? '', description: c.one_liner }), INTEL_KEYS, `Tracking ${c.name}`)
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{c.name}</p>
          <p className="text-xs text-muted">{[c.batch ? `YC ${c.batch}` : c.founded ? `Founded ${c.founded}` : 'YC', c.status, c.team ? `${c.team} people` : null, c.location].filter(Boolean).join(' · ')}</p>
        </div>
        <Badge tone={TONE[c.relevance]} className="capitalize">{c.relevance === 'unverified' ? 'Similar' : c.relevance}</Badge>
      </div>
      <p className="mt-2 text-sm text-ink-2">{c.one_liner}</p>
      {c.reason && <p className="mt-1 text-xs text-muted">Why: {c.reason}</p>}
      <div className="mt-3 flex items-center gap-3 pt-1">
        {(c.website || c.yc_url) && <a href={c.website ?? c.yc_url ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-azure hover:underline"><ExternalLink className="size-3" />Visit</a>}
        <span className="flex-1" />
        <Button size="sm" variant="light" onClick={() => track.mutate()} loading={track.isPending} disabled={tracked}><Plus />{tracked ? 'Tracked' : 'Track'}</Button>
      </div>
    </Card>
  )
}

/** Real Y Combinator companies that overlap with the venture, from the YC directory. Honest about coverage: it is mostly recent companies. */
export function YcPanel({ ventureId, competitors }: { ventureId: string; competitors: Competitor[] }) {
  const { data, isLoading } = useQuery({ queryKey: ['yc', ventureId], queryFn: () => api<YcData>(`/yc/similar?venture_id=${ventureId}`), staleTime: 10 * 60_000, retry: false })
  if (data && !data.available) return null // directory not loaded on this deployment: show nothing rather than an empty promise
  const s = data?.stats
  const names = new Set(competitors.map((c) => c.name.toLowerCase()))
  return (
    <Section question="Who else is building this right now?" title="Y Combinator companies in your space"
      right={s?.reviewed ? <span className="text-xs text-muted">Reviewed the {s.reviewed} closest of {s.total} · {s.direct} direct · {s.adjacent} adjacent</span> : undefined}>
      {isLoading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-soft" />)}</div>
        : !data?.items.length ? <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">None of the YC companies we indexed overlap with this idea. That is a useful signal, but the directory is mostly recent companies, so it is not proof the space is empty.</p>
        : <div className="grid gap-3 md:grid-cols-2">{data.items.map((c) => <Item key={c.id} c={c} ventureId={ventureId} tracked={names.has(c.name.toLowerCase())} />)}</div>}
      {!!data?.items.length && <p className="text-xs text-faint">{s?.recent ?? 0} of the matches were founded in 2025 or later. The directory skews to recent companies, so it says little about older or failed startups.</p>}
    </Section>
  )
}
