import { Plus, Rocket, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useShell } from '@/components/AppShell'
import { DecisionBadge, Empty, Loading, PageHeader, SCORE_KEYS, SCORE_LABELS, ScoreBar, ScoreRing, StageBadge } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useVentures } from '@/lib/queries'
import type { Stage } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

const FILTERS: ('all' | Stage)[] = ['all', 'idea', 'validating', 'building', 'launched', 'paused', 'killed']

export default function Ventures() {
  const { newVenture } = useShell()
  const { data = [], isLoading } = useVentures()
  const [stage, setStage] = useState<'all' | Stage>('all')
  const [q, setQ] = useState('')
  const list = data.filter((v) => (stage === 'all' || v.stage === stage) && `${v.name} ${v.idea}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <PageHeader eyebrow="Ventures" title="All ventures" description="Every idea you're exploring, scored and remembered." actions={<Button onClick={newVenture}><Plus />New venture</Button>} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="scrollbar-none flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStage(f)} className={cn('rounded-full px-3.5 py-1.5 text-sm capitalize transition cursor-pointer', stage === f ? 'bg-dark text-white shadow-press-dark' : 'text-ink-2 hover:bg-soft')}>
              {f} {f !== 'all' && <span className="opacity-60">{data.filter((v) => v.stage === f).length || ''}</span>}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ventures" className="pl-9" />
        </div>
      </div>

      {isLoading ? <Loading /> : data.length === 0 ? (
        <Empty icon={<Rocket />} title="No ventures yet" action={<Button onClick={newVenture}><Plus />Create a venture</Button>}>
          A venture is an idea under investigation. Create one to run validation, convene the boardroom and generate an MVP plan.
        </Empty>
      ) : list.length === 0 ? <p className="py-16 text-center text-sm text-muted">No ventures match.</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <Link key={v.id} to={`/app/ventures/${v.id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition group-hover:border-line-2 group-hover:shadow-float">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{v.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5"><StageBadge stage={v.stage} />{v.verdict && ['GO', 'PIVOT', 'KILL'].includes(v.verdict) && <DecisionBadge decision={v.verdict} />}</div>
                  </div>
                  <ScoreRing value={v.overall_score} size={52} stroke={5} />
                </div>
                <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-2">{v.idea}</p>
                <div className="mt-5 space-y-2">{SCORE_KEYS.map((k) => <ScoreBar key={k} label={SCORE_LABELS[k]} value={v.scores[k]} />)}</div>
                <p className="mt-4 text-[11px] text-faint">Updated {ago(v.updated_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
