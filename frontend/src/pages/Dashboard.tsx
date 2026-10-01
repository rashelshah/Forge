import { useQuery } from '@tanstack/react-query'
import { AppWindow, ArrowRight, ArrowUpRight, Compass, FlaskConical, Gauge, Layers, MessagesSquare, Plus, Radar } from 'lucide-react'
import { Link } from 'react-router'
import { useShell } from '@/components/AppShell'
import { DecisionBadge, Empty, Loading, SCORE_KEYS, SCORE_LABELS, SEVERITY_TONE, ScoreRing, StageBadge, Stat, scoreColor } from '@/components/bits'
import { Spark } from '@/components/brand'
import { VentureSelect } from '@/components/VentureSelect'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useMe } from '@/lib/queries'
import { useVentureFilter } from '@/lib/venture'
import type { Activity, Signal, Venture } from '@/lib/types'
import { ago } from '@/lib/utils'

interface Dash { ventures: Venture[]; signals: Signal[]; activity: Activity[]; stats: { active: number; avgScore: number | null; boardroomSessions: number; agentRunsWeek: number; runningExperiments: number } }

export const PIPELINE = [
  { icon: Compass, label: 'Discover' }, { icon: Gauge, label: 'Validate' }, { icon: MessagesSquare, label: 'Boardroom' },
  { icon: Layers, label: 'MVP' }, { icon: AppWindow, label: 'Prototype' }, { icon: FlaskConical, label: 'Experiment' }, { icon: Radar, label: 'Monitor' },
]

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { newVenture } = useShell()
  const { data: me } = useMe()
  const { venture } = useVentureFilter() // undefined = whole portfolio
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', venture?.id], queryFn: () => api<Dash>(`/dashboard${venture ? `?venture_id=${venture.id}` : ''}`) })

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Overview</p>
          <h1 className="text-[34px] leading-[1.1] sm:text-[40px]">{greeting()}, {me?.full_name?.split(' ')[0] || 'founder'}</h1>
          <p className="mt-2 text-[15px] text-ink-2">Your agents have been busy. Here's the state of your studio.</p>
        </div>
        <div className="flex flex-wrap gap-2"><VentureSelect allowAll /><Button onClick={newVenture}><Plus />New venture</Button></div>
      </div>

      {isLoading || !data ? <Loading rows={4} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {venture ? <Stat label="Stage" value={<span className="capitalize">{venture.stage}</span>} /> : <Stat label="Active ventures" value={data.stats.active} />}
            <Stat label={venture ? 'Validation score' : 'Avg. validation'} value={data.stats.avgScore ?? '—'} hint="out of 100" />
            <Stat label="Boardroom sessions" value={data.stats.boardroomSessions} />
            <Stat label="Agent runs · 7d" value={data.stats.agentRunsWeek} />
            <Stat label="Live experiments" value={data.stats.runningExperiments} />
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
              <div className="flex items-center gap-3 lg:w-56">
                <Spark className="size-5" />
                <div><p className="text-sm font-medium">Venture pipeline</p><p className="text-xs text-muted">Every venture moves through seven agents</p></div>
              </div>
              <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                {PIPELINE.map(({ icon: Icon, label }, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs whitespace-nowrap text-ink-2"><Icon className="size-3.5" />{label}</span>
                    {i < PIPELINE.length - 1 && <span className="h-px w-3 bg-line-2" />}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl">{venture ? 'Project' : 'Portfolio'}</h2>
                <Link to="/app/ventures" className="flex items-center gap-1 text-sm text-muted hover:text-ink">All ventures <ArrowRight className="size-3.5" /></Link>
              </div>
              {data.ventures.length === 0 ? (
                <Empty icon={<Compass />} title="Start your first venture" action={<Button onClick={newVenture}><Plus />Create a venture</Button>}>
                  Describe an idea or let the Discovery Agent find one. Validation, the boardroom and the MVP architect take it from there.
                </Empty>
              ) : (
                <div className="space-y-3">
                  {data.ventures.slice(0, 6).map((v) => (
                    <Link key={v.id} to={`/app/ventures/${v.id}`} className="group block">
                      <Card className="flex flex-col gap-4 p-4 transition group-hover:border-line-2 group-hover:shadow-float sm:flex-row sm:items-center">
                        <ScoreRing value={v.overall_score} size={56} stroke={5} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{v.name}</p>
                            <StageBadge stage={v.stage} />
                            {v.verdict && ['GO', 'PIVOT', 'KILL'].includes(v.verdict) && <DecisionBadge decision={v.verdict} />}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-muted">{v.idea}</p>
                        </div>
                        <div className="hidden w-48 grid-cols-5 items-end gap-1.5 md:grid" title="Demand · Competition · Defensibility · Revenue · Founder fit">
                          {SCORE_KEYS.map((k) => (
                            <div key={k} className="flex h-10 items-end rounded bg-soft" title={`${SCORE_LABELS[k]}: ${v.scores[k] ?? '—'}`}>
                              <div className="w-full rounded" style={{ height: `${v.scores[k] ?? 0}%`, background: v.scores[k] != null ? scoreColor(v.scores[k]!) : undefined }} />
                            </div>
                          ))}
                        </div>
                        <ArrowUpRight className="hidden size-4 text-faint group-hover:text-ink sm:block" />
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-6">
              <Card>
                <CardHeader><CardTitle>Market signals</CardTitle><Link to="/app/competitive-intelligence" className="text-xs text-muted hover:text-ink">View all</Link></CardHeader>
                <div className="p-2">
                  {data.signals.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Track competitors to receive signals.</p>}
                  {data.signals.slice(0, 5).map((s) => (
                    <div key={s.id} className="rounded-xl px-3 py-2.5 hover:bg-canvas">
                      <div className="flex items-center gap-2"><Badge tone={SEVERITY_TONE[s.severity]} className="capitalize">{s.type}</Badge><span className="text-[11px] text-faint">{ago(s.created_at)}</span></div>
                      <p className="mt-1 text-sm font-medium">{s.title}</p>
                      {s.recommended_response && <p className="mt-0.5 line-clamp-2 text-xs text-muted">→ {s.recommended_response}</p>}
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader><CardTitle>Agent activity</CardTitle><Link to="/app/activity" className="text-xs text-muted hover:text-ink">View all</Link></CardHeader>
                <ol className="relative m-5 mt-4 space-y-4 border-l border-line pl-4">
                  {data.activity.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
                  {data.activity.slice(0, 7).map((a) => (
                    <li key={a.id} className="relative">
                      <span className={`absolute top-1.5 -left-[20.5px] size-2 rounded-full ring-4 ring-white ${a.actor === 'you' ? 'bg-faint' : 'bg-saffron'}`} />
                      <p className="text-sm"><span className="font-medium">{a.actor === 'you' ? 'You' : a.actor}</span> <span className="text-ink-2">{a.action.charAt(0).toLowerCase() + a.action.slice(1)}</span></p>
                      <p className="text-[11px] text-faint">{ago(a.created_at)}</p>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  )
}
