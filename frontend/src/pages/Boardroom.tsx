import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useShell } from '@/components/AppShell'
import { DECISION_COPY, LiveBoardroom, SessionResult } from '@/components/boardroom'
import { AGENTS, AgentAvatar, DecisionBadge, Empty, ErrorNote, Loading, ModeBadge, PageHeader } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { VentureSelect } from '@/components/VentureSelect'
import { api } from '@/lib/api'
import { useVentureFilter } from '@/lib/venture'
import { useVentures } from '@/lib/queries'
import type { AgentKey, BoardSession } from '@/lib/types'
import { ago, date } from '@/lib/utils'

export default function Boardroom() {
  const { newVenture } = useShell()
  const { ventures, venture: chosen } = useVentureFilter()
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['boardroom', { venture_id: chosen?.id }], queryFn: () => api<BoardSession[]>(`/boardroom${chosen ? `?venture_id=${chosen.id}` : ''}`),
  })
  const venture = chosen ?? ventures[0] // the board always discusses one project: the chosen one, else the newest

  return (
    <>
      <PageHeader eyebrow="Multi-agent boardroom" title="Boardroom" description="Ask a question about your venture. Six AI advisors — including a Failure Agent whose job is to find flaws — discuss it, then you get one clear answer and what to do next." actions={<VentureSelect allowAll />} />

      <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(AGENTS) as AgentKey[]).map((k) => (
          <Card key={k} className={k === 'failure' ? 'border-[#f5cfc6] bg-[#fffaf9] p-4' : 'p-4'}>
            <AgentAvatar agent={k} size={32} />
            <p className="mt-3 text-sm font-medium">{AGENTS[k].name}</p>
            <p className="text-[11px] leading-snug text-muted">{AGENTS[k].role}</p>
          </Card>
        ))}
      </div>

      {ventures.length === 0 ? (
        <Empty icon={<MessagesSquare />} title="Create a venture to convene the board" action={<Button onClick={newVenture}>New venture</Button>} />
      ) : (
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xl">Ask the board</h2>
            {venture && <span className="text-sm text-muted">about <b className="font-medium text-ink">{venture.name}</b>{!chosen && ventures.length > 1 && ' (newest — pick a project above to change)'}</span>}
          </div>
          {venture && <LiveBoardroom key={venture.id} venture={venture} />}
        </div>
      )}

      <h2 className="mb-3 text-xl">All sessions</h2>
      {isLoading ? <Loading /> : sessions.length === 0 ? <p className="text-sm text-muted">{chosen ? `No sessions for ${chosen.name} yet.` : 'No sessions yet.'}</p> : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} to={`/app/boardroom/${s.id}`}>
              <Card className="flex flex-col gap-2 p-4 transition hover:border-line-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex -space-x-2">{(['ceo', 'investor', 'failure'] as AgentKey[]).map((k) => <AgentAvatar key={k} agent={k} size={26} />)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.question}</p>
                  <p className="text-xs text-muted">{ventures.find((v) => v.id === s.venture_id)?.name} · {s.transcript.length} turns · {s.rounds} round{s.rounds > 1 ? 's' : ''}</p>
                </div>
                {s.verdict ? <DecisionBadge decision={s.verdict.decision} label={DECISION_COPY[s.verdict.decision].label} /> : <span className="text-xs text-muted capitalize">{s.status}</span>}
                <span className="text-xs text-faint">{ago(s.created_at)}</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

export function BoardroomSession() {
  const { id = '' } = useParams()
  const { data: s, isLoading, error } = useQuery({ queryKey: ['boardroom', id], queryFn: () => api<BoardSession>(`/boardroom/${id}`) })
  const { data: ventures = [] } = useVentures()
  if (isLoading) return <Loading rows={4} />
  if (error || !s) return <ErrorNote error={error ?? new Error('Not found')} />
  const venture = ventures.find((v) => v.id === s.venture_id)
  return (
    <>
      <Link to="/app/boardroom" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Boardroom</Link>
      <PageHeader eyebrow={`Session · ${date(s.created_at)}`} title={s.question}
        description={<span className="flex flex-wrap items-center gap-2">{venture && <Link className="text-azure hover:underline" to={`/app/ventures/${venture.id}?tab=boardroom`}>{venture.name}</Link>}· {s.rounds} round{s.rounds > 1 ? 's' : ''}<ModeBadge mode={s.mode} /></span>} />
      <SessionResult session={s} />
    </>
  )
}
