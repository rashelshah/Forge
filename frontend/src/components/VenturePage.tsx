import { Radar } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Empty, Loading, PageHeader } from '@/components/bits'
import { Select } from '@/components/ui/input'
import { useVentures } from '@/lib/queries'

/** A page about one venture: header with a venture picker (?venture=, defaulting to the newest), and an empty state without ventures. */
export function VenturePage({ eyebrow, title, description, empty, children }: {
  eyebrow: string; title: string; description: string; empty: string; children: (venture: { id: string; name: string }) => ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const { data: ventures = [], isLoading } = useVentures()
  const venture = ventures.find((v) => v.id === params.get('venture')) ?? ventures[0]
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description}
        actions={ventures.length > 1 ? (
          <Select value={venture?.id ?? ''} onChange={(e) => setParams({ venture: e.target.value })} className="h-10 w-56" aria-label="Venture">
            {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        ) : undefined} />
      {isLoading ? <Loading /> : venture ? <div key={venture.id}>{children(venture)}</div> : <Empty icon={<Radar />} title="Create a venture first">{empty}</Empty>}
    </>
  )
}
