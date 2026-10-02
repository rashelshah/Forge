import { useQuery } from '@tanstack/react-query'
import { Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/input'
import { StatusBadge } from '@/components/studio'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useAction, useVentures } from '@/lib/queries'
import { avg } from '@/lib/studio'
import type { StudioProject } from '@/lib/types'
import { ago } from '@/lib/utils'

const EXAMPLES = [
  { name: 'Pipeline', idea: 'AI-powered CRM for small businesses: solo consultants and small agencies lose deals because follow-ups slip. It tells them who to contact today and drafts the message.', audience: 'Solo consultants and small agency owners', industry: 'Sales / CRM' },
  { name: 'Ledgerly', idea: 'A bookkeeping copilot for freelancers that categorises transactions, chases unpaid invoices and forecasts tax set-asides.', audience: 'Freelancers and independent contractors', industry: 'Fintech' },
]

export default function Studio() {
  const nav = useNavigate()
  const { data: ventures = [] } = useVentures()
  const [f, setF] = useState({ name: '', idea: '', audience: '', industry: '', requirements: '', max_iterations: '3', venture_id: '' })
  const list = useQuery({
    queryKey: ['studio'], queryFn: () => api<StudioProject[]>('/studio/projects'), retry: false,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'queued' || p.status === 'running') ? 4000 : false),
  })
  const create = useAction(() => api<StudioProject>('/studio/projects', { ...f, max_iterations: Number(f.max_iterations), venture_id: f.venture_id || undefined }), [['studio'], ['research']])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <>
      <PageHeader eyebrow="Autonomous product team" title="Product Studio" description="Twelve AI agents — strategist, UX architect, design researcher, designer, engineers, reviewers and a skeptical founder — turn your idea into a reviewed, refined prototype. You can watch every step." />

      <Card className="mb-10 p-6">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined, { onSuccess: (p) => nav(`/app/studio/${p.id}`) }) }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="sn">Startup name</Label><Input id="sn" required value={f.name} onChange={set('name')} placeholder="Pipeline" /></div>
            <div><Label htmlFor="si">Industry</Label><Input id="si" value={f.industry} onChange={set('industry')} placeholder="Sales / CRM" /></div>
          </div>
          <div><Label htmlFor="sd">Startup idea</Label><Textarea id="sd" required rows={3} value={f.idea} onChange={set('idea')} placeholder="AI-powered CRM for small businesses…" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="sa">Target audience</Label><Input id="sa" value={f.audience} onChange={set('audience')} placeholder="Solo consultants and small agency owners" /></div>
            <div><Label htmlFor="sm">Refinement rounds</Label>
              <Select id="sm" value={f.max_iterations} onChange={set('max_iterations')}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} — {n === 1 ? 'build and review once' : `up to ${n - 1} refinement${n > 2 ? 's' : ''} until every score ≥ 9`}</option>)}
              </Select>
            </div>
          </div>
          <div><Label htmlFor="sr">Requirements (optional)</Label><Textarea id="sr" rows={2} value={f.requirements} onChange={set('requirements')} placeholder="Must feel calm and fast. Needs a mobile-friendly daily queue." /></div>
          {ventures.length > 0 && (
            <div>
              <Label htmlFor="sv">Link to venture (optional)</Label>
              <Select id="sv" value={f.venture_id} onChange={set('venture_id')}>
                <option value="">None — standalone project</option>
                {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              {f.venture_id && <p className="mt-1 text-xs text-muted">The finished prototype will automatically appear in that venture’s Prototype tab.</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={create.isPending} disabled={f.idea.trim().length < 10 || !f.name.trim()}><Wand2 />Assemble the team</Button>
            <span className="text-xs text-muted">A full run takes roughly 10–25 minutes on free-tier models.</span>
            <span className="flex-1" />
            {EXAMPLES.map((x) => <button key={x.name} type="button" onClick={() => setF({ ...f, ...x })} className="text-xs text-azure hover:underline cursor-pointer">Try “{x.name}”</button>)}
          </div>
        </form>
      </Card>

      <h2 className="mb-3 text-xl">Your products</h2>
      {list.error ? <ErrorNote error={list.error} /> : list.isLoading ? <Loading /> : !list.data?.length ? (
        <Empty icon={<Sparkles />} title="No products yet">Describe a startup idea above and the team will design and build a prototype.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((p) => {
            const a = avg(p.scores)
            return (
              <Link key={p.id} to={`/app/studio/${p.id}`} className="block">
                <Card className="h-full p-4 transition hover:border-line-2">
                  <div className="flex items-start justify-between gap-2"><p className="text-[15px] font-medium">{p.name}</p><StatusBadge p={p} /></div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.idea}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-faint">
                    <span>{p.status === 'running' ? p.stage : p.status === 'done' && a != null ? `Quality ${a}/10 · v${p.best_iteration}` : p.status === 'failed' ? 'See details' : ' '}</span>
                    <span>{ago(p.created_at)}</span>
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
