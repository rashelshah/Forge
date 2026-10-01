import { MemoryHub } from '@/components/memory'
import { VenturePage } from '@/components/VenturePage'

export default function VentureMemory() {
  return (
    <VenturePage eyebrow="Intelligence" title="Venture Memory" description="The permanent memory of your startup: what you have learned, which assumptions held or failed, why decisions were made and the evidence behind them."
      empty="Venture memory belongs to a venture — every agent writes what it learns there.">
      {(v) => <MemoryHub ventureId={v.id} />}
    </VenturePage>
  )
}
