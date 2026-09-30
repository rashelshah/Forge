import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useShell } from '@/components/AppShell'
import { BoardTable, LiveBoardroom, Transcript, VerdictCard } from '@/components/boardroom'
import { AGENTS, AgentAvatar, DecisionBadge, Empty, ErrorNote, Loading, ModeBadge, PageHeader } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useVentures } from '@/lib/queries'
import type { AgentKey, BoardSession } from '@/lib/types'
import { ago, date } from '@/lib/utils'

export default function Boardroom() {
  const { newVenture } = useShell()
  const nav = useNavigate()
  const { data: ventures = [] } = useVentures()
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ['boardroom'], queryFn: () => api<BoardSession[]>('/boardroom') })
  const [ventureId, setVentureId] = useState('')
  const venture = ventures.find((v) => v.id === ventureId) ?? ventures[0]

  return (
    <>
      <PageHeader eyebrow="Multi-agent boardroom" title="Boardroom" description="Six agents debate your venture from every angle — led by a Failure Agent whose only job is to kill bad ideas. The Chair issues a verdict." />

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
            <h2 className="text-xl">New session</h2>
            <Select value={venture?.id} onChange={(e) => setVentureId(e.target.value)} className="h-9 w-56 text-sm" aria-label="Venture">
              {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </div>
          {venture && <LiveBoardroom key={venture.id} venture={venture} onDone={(id) => nav(`/app/boardroom/${id}`)} />}
        </div>
      )}

      <h2 className="mb-3 text-xl">All sessions</h2>
      {isLoading ? <Loading /> : sessions.length === 0 ? <p className="text-sm text-muted">No sessions yet.</p> : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Link key={s.id} to={`/app/boardroom/${s.id}`}>
              <Card className="flex flex-col gap-2 p-4 transition hover:border-line-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex -space-x-2">{(['ceo', 'investor', 'failure'] as AgentKey[]).map((k) => <AgentAvatar key={k} agent={k} size={26} />)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.question}</p>
                  <p className="text-xs text-muted">{ventures.find((v) => v.id === s.venture_id)?.name} · {s.transcript.length} turns · {s.rounds} round{s.rounds > 1 ? 's' : ''}</p>
                </div>
                {s.verdict ? <DecisionBadge decision={s.verdict.decision} /> : <span className="text-xs text-muted capitalize">{s.status}</span>}
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
      <div className="space-y-6">
        <BoardTable done />
        {s.verdict && <VerdictCard v={s.verdict} />}
        <h3 className="pt-2 text-xl">Transcript</h3>
        <Transcript messages={s.transcript} />
      </div>
    </>
  )
}
