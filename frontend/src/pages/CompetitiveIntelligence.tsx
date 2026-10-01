import { useQuery } from '@tanstack/react-query'
import { Plus, Radar } from 'lucide-react'
import { useState } from 'react'
import { Empty, Loading, PageHeader } from '@/components/bits'
import { INTEL_KEYS, IntelPanel } from '@/components/intel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/input'
import { VentureSelect } from '@/components/VentureSelect'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAction, useVentures } from '@/lib/queries'
import { useVentureFilter } from '@/lib/venture'
import type { Competitor, IntelData } from '@/lib/types'

const INVALIDATE = INTEL_KEYS

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

export function CompetitiveIntelligencePanel({ ventureId }: { ventureId: string }) {
  const { data: ventures = [] } = useVentures()
  const [open, setOpen] = useState(false)
  const intel = useQuery({
    queryKey: ['intel', ventureId], queryFn: () => api<IntelData>(`/intel?venture_id=${ventureId}`),
    // Follow a running analysis until it lands.
    refetchInterval: (q) => (q.state.data?.report?.content.build?.status === 'running' ? 3000 : false),
  })
  return (
    <>
      <IntelPanel ventureId={ventureId} ventureName={ventures.find((v) => v.id === ventureId)?.name ?? 'You'} data={intel.data} isLoading={intel.isLoading} onAdd={() => setOpen(true)} />
      <AddCompetitor ventureId={ventureId} open={open} onOpenChange={setOpen} />
    </>
  )
}

export default function CompetitiveIntelligence() {
  const { ventures, isLoading, venture: chosen } = useVentureFilter()
  const venture = (chosen ?? ventures[0])?.id
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Competitive Intelligence" description="An AI strategy consultant that watches your competitors, finds the gaps and tells you what to do next."
        actions={<VentureSelect />} />
      {isLoading ? <Loading /> : venture ? <CompetitiveIntelligencePanel key={venture} ventureId={venture} /> : <Empty icon={<Radar />} title="Create a venture first">Competitive intelligence is always relative to your own product.</Empty>}
    </>
  )
}
