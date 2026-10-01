import { MarketRadar } from '@/components/market'
import { VenturePage } from '@/components/VenturePage'

export default function MarketSignals() {
  return (
    <VenturePage eyebrow="Intelligence" title="Market Signals" description="An AI market radar: what is changing, which opportunities are emerging, what threatens you and which trends matter right now."
      empty="The market radar is always relative to your own venture.">
      {(v) => <MarketRadar ventureId={v.id} />}
    </VenturePage>
  )
}
