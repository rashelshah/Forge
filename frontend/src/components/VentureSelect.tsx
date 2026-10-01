import { Select } from '@/components/ui/input'
import { useVentureFilter } from '@/lib/venture'

/** Project picker for page headers. `allowAll` adds "All projects" (list pages); project pages always show one project. Hidden with fewer than two ventures. */
export function VentureSelect({ allowAll = false, className = '' }: { allowAll?: boolean; className?: string }) {
  const { ventures, venture, select } = useVentureFilter()
  if (ventures.length < 2) return null
  const value = venture?.id ?? (allowAll ? 'all' : ventures[0].id)
  return (
    <Select value={value} onChange={(e) => select(e.target.value)} className={`h-10 w-full sm:w-64 ${className}`} aria-label="Project" title={ventures.find((v) => v.id === value)?.name}>
      {allowAll && <option value="all">All projects</option>}
      {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </Select>
  )
}
