import { useQuery } from '@tanstack/react-query'
import { Activity as ActivityIcon, Bot, CheckCircle2, Loader2, User, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { Empty, Loading, PageHeader } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { VentureSelect } from '@/components/VentureSelect'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useVentures } from '@/lib/queries'
import { useVentureFilter } from '@/lib/venture'
import type { Activity as Act, AgentRun } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

const dayLabel = (iso: string) => {
  const d = new Date(iso).toDateString()
  if (d === new Date().toDateString()) return 'Today'
  if (d === new Date(Date.now() - 864e5).toDateString()) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Activity() {
  const { venture } = useVentureFilter()
  const q = venture ? `?venture_id=${venture.id}` : ''
  const { data: acts = [], isLoading } = useQuery({ queryKey: ['activity', venture?.id], queryFn: () => api<Act[]>(`/activity${q}`), refetchInterval: 20_000 })
  const { data: runs = [] } = useQuery({ queryKey: ['agent-runs', venture?.id], queryFn: () => api<AgentRun[]>(`/agent-runs${q}`), refetchInterval: 20_000 })
  const { data: ventures = [] } = useVentures()
  const name = (id: string | null) => ventures.find((v) => v.id === id)?.name
  const groups = acts.reduce<Record<string, Act[]>>((g, a) => ((g[dayLabel(a.created_at)] ??= []).push(a), g), {})

  return (
    <>
      <PageHeader eyebrow="Agent activity" title="What your agents did" description="An audit trail of every agent action and founder decision across your studio." actions={<VentureSelect allowAll />} />
      <Tabs defaultValue="feed">
        <TabsList className="mb-6"><TabsTrigger value="feed">Feed</TabsTrigger><TabsTrigger value="runs">Agent runs</TabsTrigger></TabsList>
        <TabsContent value="feed">
          {isLoading ? <Loading /> : acts.length === 0 ? <Empty icon={<ActivityIcon />} title="No activity yet">Create a venture and your agents' work will appear here.</Empty> : (
            <div className="space-y-8">
              {Object.entries(groups).map(([day, items]) => (
                <section key={day}>
                  <p className="mb-3 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{day}</p>
                  <Card className="divide-y divide-line">
                    {items.map((a) => (
                      <div key={a.id} className="flex gap-3 px-4 py-3.5">
                        <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', a.actor === 'you' ? 'bg-soft text-ink-2' : 'bg-[linear-gradient(135deg,#ec8a44,#6a88e2)] text-white')}>
                          {a.actor === 'you' ? <User className="size-4" /> : <Bot className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm"><span className="font-medium">{a.actor === 'you' ? 'You' : a.actor}</span> <span className="text-ink-2">{a.action.charAt(0).toLowerCase() + a.action.slice(1)}</span></p>
                          {a.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.detail}</p>}
                          {a.venture_id && name(a.venture_id) && <Link to={`/app/ventures/${a.venture_id}`} className="mt-1 inline-block text-xs text-azure hover:underline">{name(a.venture_id)}</Link>}
                        </div>
                        <span className="shrink-0 text-[11px] text-faint">{ago(a.created_at)}</span>
                      </div>
                    ))}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="runs">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted">{['Agent', 'Venture', 'Status', 'Mode', 'Output', 'Duration', 'When'].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{r.agent}</td>
                    <td className="px-4 py-3 text-muted">{name(r.venture_id) ?? '—'}</td>
                    <td className="px-4 py-3">
                      {r.status === 'succeeded' ? <CheckCircle2 className="size-4 text-leaf" aria-label="Succeeded" /> : r.status === 'failed' ? <XCircle className="size-4 text-rose" aria-label="Failed" /> : <Loader2 className="size-4 animate-spin text-muted" aria-label="Running" />}
                    </td>
                    <td className="px-4 py-3">{r.mode && <Badge tone={r.mode === 'live' ? 'leaf' : 'outline'}>{r.mode}</Badge>}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-2" title={r.error ?? r.output_summary ?? ''}>{r.error ? <span className="text-rose">{r.error}</span> : r.output_summary}</td>
                    <td className="px-4 py-3 text-muted tabular-nums">{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-faint">{ago(r.created_at)}</td>
                  </tr>
                ))}
                {runs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No agent runs yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
