import { Radar } from 'lucide-react'
import type { ReactNode } from 'react'
import { Empty, Loading, PageHeader } from '@/components/bits'
import { VentureSelect } from '@/components/VentureSelect'
import { useVentureFilter } from '@/lib/venture'

/** A page about one venture: header with a venture picker (?venture=, defaulting to the newest), and an empty state without ventures. */
export function VenturePage({ eyebrow, title, description, empty, children }: {
  eyebrow: string; title: string; description: string; empty: string; children: (venture: { id: string; name: string }) => ReactNode
}) {
  const { ventures, isLoading, venture: chosen } = useVentureFilter()
  const venture = chosen ?? ventures[0]
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description}
        actions={<VentureSelect />} />
      {isLoading ? <Loading /> : venture ? <div key={venture.id}>{children(venture)}</div> : <Empty icon={<Radar />} title="Create a venture first">{empty}</Empty>}
    </>
  )
}
