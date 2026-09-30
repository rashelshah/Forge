import { useQuery } from '@tanstack/react-query'
import { BookOpen, ExternalLink, Library, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Loading, ModeBadge, PageHeader } from '@/components/bits'
import { Spark } from '@/components/brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Chunk, KnowledgeDoc, Mode } from '@/lib/types'
import { date } from '@/lib/utils'

function AddDoc({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({ title: '', category: 'Playbook', url: '', text: '' })
  const add = useAction(() => api('/knowledge', f), [['knowledge'], ['activity']], 'Document indexed')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add to knowledge base</DialogTitle>
        <DialogDescription>Documents are chunked, embedded into Supabase pgvector and retrieved by every agent alongside the Forge library.</DialogDescription>
        <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined, { onSuccess: () => { onOpenChange(false); setF({ title: '', category: 'Playbook', url: '', text: '' }) } }) }}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div><Label htmlFor="kt">Title</Label><Input id="kt" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Our pricing research" /></div>
            <div><Label htmlFor="kc">Category</Label><Input id="kc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          </div>
          <Tabs defaultValue="url">
            <TabsList><TabsTrigger value="url">From URL</TabsTrigger><TabsTrigger value="text">Paste text</TabsTrigger></TabsList>
            <TabsContent value="url" className="pt-3"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value, text: '' })} placeholder="https://paulgraham.com/growth.html" /></TabsContent>
            <TabsContent value="text" className="pt-3"><Textarea rows={8} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value, url: '' })} placeholder="Paste notes, interview transcripts, market reports…" /></TabsContent>
          </Tabs>
          <Button type="submit" className="w-full" loading={add.isPending} disabled={!f.title || (!f.url && !f.text)}>Index document</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DocCard({ d, onOpen, onDelete }: { d: KnowledgeDoc; onOpen: () => void; onDelete?: () => void }) {
  return (
    <Card className="group flex flex-col p-4 transition hover:border-line-2">
      <button onClick={onOpen} className="flex-1 text-left cursor-pointer">
        <Badge tone={d.user_id ? 'indigo' : 'neutral'}>{d.category}</Badge>
        <p className="mt-2.5 text-[15px] leading-snug font-medium">{d.title}</p>
        <p className="mt-2 text-[11px] text-faint">{d.chunk_count} chunks · {date(d.created_at)}</p>
      </button>
      {onDelete && <button onClick={onDelete} className="mt-2 flex w-fit items-center gap-1 text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-rose cursor-pointer"><Trash2 className="size-3" />Remove</button>}
    </Card>
  )
}

export default function Knowledge() {
  const { data = [], isLoading } = useQuery({ queryKey: ['knowledge'], queryFn: () => api<KnowledgeDoc[]>('/knowledge') })
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const doc = useQuery({ queryKey: ['knowledge', viewing], queryFn: () => api<KnowledgeDoc>(`/knowledge/${viewing}`), enabled: !!viewing })
  const ask = useAction(() => api<{ answer: string | null; chunks: Chunk[]; mode: Mode }>('/knowledge/ask', { question: q }), [['me']])
  const del = useAction((id: string) => api(`/knowledge/${id}`, undefined, 'DELETE'), [['knowledge']], 'Removed')
  const mine = data.filter((d) => d.user_id)
  const library = data.filter((d) => !d.user_id)
  const categories = [...new Set(library.map((d) => d.category))]

  return (
    <>
      <PageHeader eyebrow="Startup intelligence RAG" title="Knowledge Base" description="The Forge library of startup wisdom plus your own documents — retrieved by every agent to ground its reasoning."
        actions={<Button onClick={() => setOpen(true)}><Plus />Add document</Button>} />

      <Card className="relative isolate mb-8 overflow-hidden p-6">
        <div className="aurora-soft -z-10" />
        <p className="flex items-center gap-2 font-medium"><Spark className="size-4" />Ask the library</p>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask.mutate() }}>
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="How should I run customer interviews without leading the witness?" className="pl-9" />
          </div>
          <Button type="submit" loading={ask.isPending}><Sparkles />Ask</Button>
        </form>
        {ask.data && (
          <div className="mt-5 space-y-3">
            <ModeBadge mode={ask.data.mode} />
            {ask.data.answer && <p className="rounded-xl border border-line bg-white p-4 text-[15px] leading-relaxed whitespace-pre-line">{ask.data.answer}</p>}
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Retrieved passages</p>
            <div className="grid gap-2 md:grid-cols-2">
              {ask.data.chunks.map((c, i) => (
                <button key={i} onClick={() => setViewing(c.doc_id)} className="rounded-xl border border-line bg-white p-3 text-left text-sm hover:border-line-2 cursor-pointer">
                  <div className="flex justify-between gap-2 text-xs"><span className="font-medium">K{i + 1} · {c.title}</span><span className="text-faint">{c.score}</span></div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted">{c.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {isLoading ? <Loading /> : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-xl">Your documents <span className="text-base text-muted">{mine.length}</span></h2>
            {mine.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-2 bg-white px-6 py-8 text-center text-sm text-muted">Add interview notes, market reports or your own playbooks — agents will cite them.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{mine.map((d) => <DocCard key={d.id} d={d} onOpen={() => setViewing(d.id)} onDelete={() => del.mutate(d.id)} />)}</div>
            )}
          </section>
          {categories.map((c) => (
            <section key={c}>
              <h2 className="mb-3 flex items-center gap-2 text-xl"><Library className="size-4 text-muted" />{c}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{library.filter((d) => d.category === c).map((d) => <DocCard key={d.id} d={d} onOpen={() => setViewing(d.id)} />)}</div>
            </section>
          ))}
        </div>
      )}

      <AddDoc open={open} onOpenChange={setOpen} />
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          {doc.data ? (
            <>
              <Badge tone="neutral">{doc.data.category}</Badge>
              <DialogTitle className="mt-3">{doc.data.title}</DialogTitle>
              <DialogDescription>{doc.data.source}</DialogDescription>
              {doc.data.url && <a href={doc.data.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-azure hover:underline"><ExternalLink className="size-3.5" />{doc.data.url}</a>}
              <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{doc.data.content}</p>
            </>
          ) : <><DialogTitle className="sr-only">Loading</DialogTitle><BookOpen className="mx-auto size-5 animate-pulse text-muted" /></>}
        </DialogContent>
      </Dialog>
    </>
  )
}
