import { useQuery } from '@tanstack/react-query'
import { Brain, Check, Loader2, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Empty } from '@/components/bits'
import { Section } from '@/components/intel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { MemoryData, MemoryEvidence, MemoryHit } from '@/lib/types'
import { ago, date } from '@/lib/utils'

// Which Forge module each memory kind comes from.
const MODULE: Record<string, string> = {
  research: 'Research', boardroom: 'Boardroom', experiment: 'Validation Lab', feedback: 'Feedback', competitor: 'Competitive Intelligence',
  roadmap: 'MVP & Prototype', decision: 'Decisions', signal: 'Market Signals',
}
const moduleOf = (kind: string) => MODULE[kind] ?? kind
const day = (d: string) => date(`${d.slice(0, 10)}T12:00:00`)

function Evidence({ items }: { items: MemoryEvidence[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3">
      <p className="text-xs text-faint">Evidence</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{items.map((e) => <Badge key={e.title} tone="neutral" title={e.title} className="max-w-full"><span className="truncate">{moduleOf(e.kind)} · {e.title}</span></Badge>)}</div>
    </div>
  )
}

function Confidence({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="mt-3 flex items-center gap-3 text-xs">
      <span className="text-muted">Confidence</span>
      <div className="h-1.5 w-28 rounded-full bg-soft"><div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} /></div>
      <span className="font-medium tabular-nums">{value}%</span>
    </div>
  )
}

type Event = { at: string; label: 'Validated' | 'Failed assumption' | 'Decision'; tone: 'leaf' | 'rose' | 'indigo'; text: string; note: string }

function timeline(d: MemoryData): Event[] {
  return [
    ...d.validated.map((x): Event => ({ at: x.occurred_on, label: 'Validated', tone: 'leaf', text: x.statement, note: `Confidence: ${x.confidence}%` })),
    ...d.failed.map((x): Event => ({ at: x.occurred_on, label: 'Failed assumption', tone: 'rose', text: x.statement, note: `Confidence: ${x.confidence}%` })),
    ...d.decisions.map((x): Event => ({ at: x.occurred_on, label: 'Decision', tone: 'indigo', text: x.decision, note: `Reason: ${x.why}` })),
  ].sort((a, b) => a.at.localeCompare(b.at))
}

function MemorySearch({ ventureId }: { ventureId: string }) {
  const [q, setQ] = useState('')
  const search = useAction(() => api<{ results: MemoryHit[] }>('/memory/search', { venture_id: ventureId, query: q }))
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) search.mutate() }}>
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="pricing, trust, student interviews…" className="pl-9" aria-label="Search memory" />
        </div>
        <Button type="submit" loading={search.isPending} disabled={!q.trim()}>Search</Button>
      </form>
      {search.data && (search.data.results.length === 0 ? <p className="text-sm text-muted">Nothing in memory matches that.</p> : (
        <div className="space-y-2">
          {search.data.results.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="indigo">{moduleOf(m.kind)}</Badge><span className="text-xs text-faint">{date(m.created_at)}</span><span className="ml-auto text-xs text-faint">match {m.score}</span></div>
              <p className="mt-2 text-sm font-medium">{m.title}</p>
              <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-ink-2">{m.content}</p>
            </Card>
          ))}
        </div>
      ))}
    </div>
  )
}

export function MemoryHub({ ventureId }: { ventureId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ['memory', 'hub', ventureId], queryFn: () => api<MemoryData>(`/memory?venture_id=${ventureId}`) })
  const synth = useAction(() => api('/memory/synthesize', { venture_id: ventureId }), [['memory'], ['activity'], ['me']], 'Venture memory synthesized')
  if (isLoading || !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-soft" />)}</div>

  const since = data.synthesized_at ? data.memories.filter((m) => m.created_at > data.synthesized_at!).length : data.memories.length
  const byModule = Object.entries(data.memories.reduce<Record<string, number>>((a, m) => ({ ...a, [moduleOf(m.kind)]: (a[moduleOf(m.kind)] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  const events = timeline(data)

  const status = (
    <div className="space-y-2 rounded-card border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Brain className="size-4 text-saffron" />
        <p className="min-w-0 flex-[1_1_16rem] text-sm">
          {synth.isPending ? <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />The Venture Historian is reading {data.memories.length} memories — about a minute…</span>
            : data.synthesized_at ? <>Synthesized <b className="font-medium">{ago(data.synthesized_at)}</b> · {data.memories.length} memories{since > 0 && <> · <b className="font-medium">{since} new</b> since</>}</>
            : `${data.memories.length} memor${data.memories.length === 1 ? 'y' : 'ies'} stored — synthesize them into knowledge.`}
        </p>
        <Button size="sm" onClick={() => synth.mutate()} loading={synth.isPending} disabled={!data.memories.length}><Sparkles />{data.synthesized_at ? 'Re-synthesize' : 'Synthesize memory'}</Button>
      </div>
      {byModule.length > 0 && <div className="flex flex-wrap gap-1.5 pl-7">{byModule.map(([m, n]) => <Badge key={m} tone="neutral">{m} {n}</Badge>)}</div>}
    </div>
  )

  if (!data.memories.length) {
    return <div className="space-y-4">{status}<Empty icon={<Brain />} title="Memory is empty">Research, the boardroom, validation, competitive intelligence, prototypes, go-to-market and market signals all write what they learn here.</Empty></div>
  }
  const synthesized = !!data.synthesized_at
  const hint = <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">Synthesize memory to generate this.</p>
  const none = (what: string) => <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">{synthesized ? `No ${what} found in memory yet.` : 'Synthesize memory to generate this.'}</p>

  return (
    <div className="space-y-12">
      {status}

      <Section n={1} question="What have we learned so far?" title="What we know">
        {data.known.length ? (
          <Card className="p-5"><ul className="space-y-2.5">{data.known.map((k) => <li key={k.id} className="flex gap-2.5 text-[15px]"><Check className="mt-1 size-4 shrink-0 text-[#6fa33a]" />{k.statement}</li>)}</ul></Card>
        ) : synthesized ? none('learnings') : hint}
      </Section>

      <Section n={2} question="How did the venture's understanding evolve?" title="Learning timeline">
        {events.length ? (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute top-2 -left-[24.5px] size-2 rounded-full bg-periwinkle ring-4 ring-canvas" />
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={e.tone}>{e.label}</Badge><span className="text-xs text-faint">{day(e.at)}</span></div>
                  <p className="mt-2 text-[15px] font-medium">{e.text}</p>
                  <p className="mt-1 text-sm text-muted">{e.note}</p>
                </Card>
              </li>
            ))}
          </ol>
        ) : none('milestones')}
      </Section>

      <Section n={3} question="Why were decisions made?" title="Decision journal">
        {data.decisions.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.decisions.map((d) => (
              <Card key={d.id} className="p-5">
                <p className="text-xs text-faint">{day(d.occurred_on)}</p>
                <p className="mt-1 text-[16px] leading-snug font-medium">{d.decision}</p>
                <div className="mt-3 rounded-xl bg-canvas p-3 text-sm"><p className="text-xs text-muted">Why</p><p className="mt-0.5">{d.why}</p></div>
                <Evidence items={d.evidence} />
              </Card>
            ))}
          </div>
        ) : none('decisions')}
      </Section>

      <Section n={4} question="What assumptions were validated?" title="Validated assumptions">
        {data.validated.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.validated.map((a) => <Card key={a.id} className="p-5"><p className="text-[16px] leading-snug font-medium">{a.statement}</p><Confidence value={a.confidence} tone="#5d8a2b" /><Evidence items={a.evidence} /></Card>)}
          </div>
        ) : none('validated assumptions')}
      </Section>

      <Section n={5} question="What failed — so we don't repeat it?" title="Failed assumptions">
        {data.failed.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.failed.map((a) => (
              <Card key={a.id} className="p-5">
                <p className="text-[16px] leading-snug font-medium">{a.statement}</p>
                <Confidence value={a.confidence} tone="#c43d2b" />
                <div className="mt-3 rounded-xl bg-[#fdf3f1] p-3 text-sm"><p className="text-xs text-rose">Reason</p><p className="mt-0.5">{a.reason}</p></div>
                <Evidence items={a.evidence} />
              </Card>
            ))}
          </div>
        ) : none('failed assumptions')}
      </Section>

      <Section n={6} question="What did we already find out about…?" title="Search memory"><MemorySearch ventureId={ventureId} /></Section>

      <Section n={7} question="If you read one thing, read this" title="Top venture learnings">
        {data.top.length ? (
          <Card className="p-5"><ol className="space-y-3">{data.top.map((t, i) => <li key={t.id} className="flex gap-3 text-[15px]"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-soft text-xs font-medium">{i + 1}</span>{t.statement}</li>)}</ol></Card>
        ) : synthesized ? none('learnings') : hint}
      </Section>
    </div>
  )
}
