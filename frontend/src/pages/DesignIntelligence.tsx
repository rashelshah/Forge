import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Layers, Loader2, Palette, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'
import { Empty, ErrorNote, Loading, PageHeader } from '@/components/bits'
import { Meta } from '@/components/doc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAction, useMe } from '@/lib/queries'
import type { DesignReference } from '@/lib/types'
import { ago, titleCase } from '@/lib/utils'

const STATUS = { queued: ['Queued', 'neutral'], analyzing: ['Analysing', 'amber'], done: ['Analysed', 'leaf'], failed: ['Failed', 'rose'] } as const
const busy = (d: DesignReference) => d.status === 'queued' || d.status === 'analyzing'

/** Accepts a JSON array or any mix of commas, spaces and newlines. */
function parseUrls(raw: string): string[] {
  try {
    const j = JSON.parse(raw)
    if (Array.isArray(j)) return j.map(String)
  } catch { /* not JSON */ }
  return raw.split(/[\s,]+/).map((u) => u.replace(/^["'“”]+|["'“”,]+$/g, '')).filter(Boolean)
}

const inline = (s: string): ReactNode[] => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))

/** The report only uses `##` headings, bullets and **bold**, so a tiny renderer beats a markdown dependency. */
function Report({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">
      {text.split('\n').filter((l) => l.trim()).map((l, i) =>
        l.startsWith('#') ? <h3 key={i} className="pt-4 text-lg text-ink">{l.replace(/^#+\s*/, '')}</h3>
          : /^\s*[-*•]\s/.test(l) ? <p key={i} className="pl-4 -indent-3">• {inline(l.replace(/^\s*[-*•]\s/, ''))}</p>
            : <p key={i}>{inline(l)}</p>)}
    </div>
  )
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? <img src={src} alt="" loading="lazy" className={`object-cover object-top ${className}`} /> : <div className={`grid place-items-center bg-soft text-faint ${className}`}><Palette className="size-6" /></div>
}

function BatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [raw, setRaw] = useState('')
  const urls = parseUrls(raw)
  const run = useAction(() => api<{ added: string[]; skipped: string[]; invalid: string[] }>('/design/references/batch', { urls }), [['design']],
    (o) => `${o.added.length} queued${o.skipped.length ? `, ${o.skipped.length} already added` : ''}${o.invalid.length ? `, ${o.invalid.length} invalid` : ''}`)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Import multiple websites</DialogTitle>
        <DialogDescription>Paste a JSON array or one URL per line. Sites are analysed one after another in the background.</DialogDescription>
        <Textarea rows={9} className="mt-4 font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'[\n  "https://linear.app",\n  "https://stripe.com",\n  "https://vercel.com"\n]'} />
        <Button className="mt-4 w-full" loading={run.isPending} disabled={!urls.length}
          onClick={() => run.mutate(undefined, { onSuccess: () => { setRaw(''); onOpenChange(false) } })}>
          Analyse {urls.length || ''} website{urls.length === 1 ? '' : 's'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: d, error } = useQuery({
    queryKey: ['design', 'detail', id], queryFn: () => api<DesignReference>(`/design/references/${id}`), enabled: !!id,
    refetchInterval: (q) => (q.state.data && busy(q.state.data) ? 3000 : false),
  })
  const rerun = useAction(() => api(`/design/references/${id}/rerun`, {}), [['design']], 'Re-running analysis')
  const del = useAction(() => api(`/design/references/${id}`, undefined, 'DELETE'), [['design']], 'Removed')
  const { capture, ...analysis } = (d?.metadata_json ?? {}) as Record<string, unknown>
  const shots = [['Homepage', d?.homepage_screenshot], ['Mobile', d?.mobile_screenshot], ['Dashboard', d?.dashboard_screenshot]] as const
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {error ? <><DialogTitle className="sr-only">Error</DialogTitle><ErrorNote error={error} /></> : !d ? <DialogTitle className="sr-only">Loading</DialogTitle> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS[d.status][1]}>{busy(d) && <Loader2 className="animate-spin" />}{STATUS[d.status][0]}</Badge>
              {d.industry && <Badge tone="indigo">{d.industry}</Badge>}
              {d.subcategory && <Badge tone="outline">{d.subcategory}</Badge>}
            </div>
            <DialogTitle className="mt-2">{d.name}</DialogTitle>
            <DialogDescription>{[d.style, d.target_audience].filter(Boolean).join(' · ') || 'Waiting for analysis'}</DialogDescription>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-azure hover:underline"><ExternalLink className="size-3.5" />{d.url}</a>
              <span className="text-xs text-faint">Updated {ago(d.updated_at)}</span>
              <span className="flex-1" />
              <Button size="sm" variant="outline" loading={rerun.isPending} disabled={busy(d)} onClick={() => rerun.mutate()}><RefreshCw />Re-run analysis</Button>
              <Button size="sm" variant="outline" loading={del.isPending} onClick={() => del.mutate(undefined, { onSuccess: onClose })}><Trash2 />Remove</Button>
            </div>
            {d.error && <div className="mt-4"><ErrorNote error={new Error(d.error)} /></div>}
            <Tabs defaultValue="report" className="mt-5">
              <TabsList><TabsTrigger value="report">Report</TabsTrigger><TabsTrigger value="metadata">Metadata</TabsTrigger><TabsTrigger value="shots">Screenshots</TabsTrigger></TabsList>
              <TabsContent value="report" className="pt-4">{d.analysis ? <Report text={d.analysis} /> : <p className="text-sm text-muted">No report yet.</p>}</TabsContent>
              <TabsContent value="metadata" className="pt-4">
                {d.status === 'done' ? <Meta value={analysis} /> : <p className="text-sm text-muted">No metadata yet.</p>}
                {!!capture && <p className="mt-6 text-xs text-faint">Captured with {(capture as { analysis_mode: string }).analysis_mode} analysis from {(capture as { final_url: string }).final_url}</p>}
              </TabsContent>
              <TabsContent value="shots" className="grid gap-4 pt-4 sm:grid-cols-[2fr_1fr]">
                {shots.filter(([, src]) => src).map(([label, src]) => (
                  <Fragment key={label}><figure><figcaption className="mb-1.5 text-xs text-muted">{label}</figcaption><a href={src!} target="_blank" rel="noreferrer"><img src={src!} alt={`${d.name} ${label}`} className="w-full rounded-xl border border-line" /></a></figure></Fragment>
                ))}
                {!d.homepage_screenshot && <p className="text-sm text-muted">No screenshots yet.</p>}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function DesignIntelligence() {
  const { data: me } = useMe()
  const [url, setUrl] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [batch, setBatch] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = useQuery({
    queryKey: ['design', 'list', search], queryFn: () => api<DesignReference[]>(`/design/references${search ? `?q=${encodeURIComponent(search)}` : ''}`),
    enabled: !!me?.admin, retry: false, refetchInterval: (query) => (query.state.data?.some(busy) ? 3000 : false),
  })
  const add = useAction(() => api('/design/references', { url }), [['design']], 'Queued for analysis')
  const data = list.data ?? []
  const pending = data.filter(busy).length

  if (me && !me.admin) return <Empty icon={<Palette />} title="Admins only">Add your email to ADMIN_EMAILS in .env to manage the Design Intelligence Knowledge Base.</Empty>

  return (
    <>
      <PageHeader eyebrow="Prototype Builder fuel" title="Design Intelligence" description="Crawl high-quality SaaS products, analyse their design with AI and store it as searchable knowledge for the Prototype Builder."
        actions={<Button variant="outline" onClick={() => setBatch(true)}><Upload />Import batch</Button>} />

      <Card className="mb-4 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); add.mutate(undefined, { onSuccess: () => setUrl('') }) }}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://linear.app" aria-label="Website URL" />
          <Button type="submit" loading={add.isPending} disabled={!url.trim()}><Layers />Analyse website</Button>
        </form>
      </Card>

      <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}>
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Search by pattern, e.g. “dark dev-tool landing page with dense feature grid”" aria-label="Search references" />
        </div>
        {search && <Button type="button" variant="outline" onClick={() => { setQ(''); setSearch('') }}><X />Clear</Button>}
        <Button type="submit" disabled={!q.trim()}>Search</Button>
      </form>
      {pending > 0 && <p className="mb-4 flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" />{pending} website{pending === 1 ? '' : 's'} in progress — this takes about a minute each.</p>}

      {list.error ? <ErrorNote error={list.error} /> : list.isLoading ? <Loading /> : data.length === 0 ? (
        <Empty icon={<Palette />} title={search ? 'No matches' : 'No references yet'}>{search ? 'Try different words, or add more websites.' : 'Add a SaaS website above, or import a batch of them.'}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <Card key={d.id} className="group overflow-hidden transition hover:border-line-2">
              <button onClick={() => setOpen(d.id)} className="block w-full text-left cursor-pointer">
                <Thumb src={d.homepage_screenshot} className="aspect-[16/10] w-full" />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-medium">{d.name}</p>
                    <Badge tone={STATUS[d.status][1]}>{busy(d) && <Loader2 className="animate-spin" />}{STATUS[d.status][0]}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-faint">{d.url.replace(/^https?:\/\//, '')}</p>
                  {d.status === 'failed' && <p className="mt-2 line-clamp-2 text-xs text-rose">{d.error}</p>}
                  {d.status === 'done' && <p className="mt-2 line-clamp-2 text-sm text-muted">{d.style}</p>}
                  {d.match && <p className="mt-2 line-clamp-3 rounded-lg bg-soft p-2 text-xs text-ink-2"><span className="font-medium">{titleCase(d.match.kind)} · {d.score}</span> — {d.match.text}</p>}
                  {d.industry && <Badge tone="indigo" className="mt-3">{d.industry}</Badge>}
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}

      <BatchDialog open={batch} onOpenChange={setBatch} />
      <Detail id={open} onClose={() => setOpen(null)} />
    </>
  )
}
