import { motion } from 'framer-motion'
import { Compass, Lightbulb, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { OpportunityCard, ventureFromOpportunity } from '@/components/research'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Opportunity, Report, Venture } from '@/lib/types'

const EXAMPLES = ['AI-powered marketplace for college students', 'Automated bookkeeping for freelance designers', 'Voice-first CRM for field sales teams']
const PLATFORMS = ['communities (Reddit, Hacker News, Indie Hackers)', 'review sites (G2, Capterra, Trustpilot)', 'app stores', 'vendor forums', 'job boards', 'GitHub issues']

export function NewVentureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [seed, setSeed] = useState('')
  const [found, setFound] = useState<Report<{ opportunities: Opportunity[]; sources_scanned: number; note?: string }> | null>(null)

  const create = useAction(
    (body: { name?: string; idea: string; opportunity?: Opportunity }) => api<Venture>('/ventures', body),
    [['ventures'], ['dashboard'], ['me']],
  )
  const discover = useAction(() => api<Report<{ opportunities: Opportunity[]; sources_scanned: number; note?: string }>>('/discover', { seed }), [['research']])

  const go = (body: { name?: string; idea: string; opportunity?: Opportunity }) =>
    create.mutate(body, {
      onSuccess: (v) => {
        onOpenChange(false)
        setName(''); setIdea(''); setFound(null)
        nav(`/app/ventures/${v.id}`, { state: { autoValidate: true } })
      },
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Create a venture</DialogTitle>
        <DialogDescription>Start from your own idea, or let the Discovery Agent mine real complaints for opportunities.</DialogDescription>
        <Tabs defaultValue="idea" className="mt-5">
          <TabsList>
            <TabsTrigger value="idea"><Lightbulb />I have an idea</TabsTrigger>
            <TabsTrigger value="discover"><Compass />Discover opportunities</TabsTrigger>
          </TabsList>

          <TabsContent value="idea" className="space-y-4 pt-5">
            <div>
              <Label htmlFor="v-idea">Idea</Label>
              <Textarea id="v-idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="AI-powered marketplace for college students" autoFocus />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x} onClick={() => setIdea(x)} className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-ink-2 hover:border-line-2 hover:text-ink cursor-pointer">{x}</button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="v-name">Name <span className="font-normal text-faint">(optional)</span></Label>
              <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CampusCart" maxLength={80} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted">The Validation Engine will score it as soon as it's created.</p>
              <Button loading={create.isPending} disabled={idea.trim().length < 8} onClick={() => go({ name, idea })}><Sparkles />Create & validate</Button>
            </div>
          </TabsContent>

          <TabsContent value="discover" className="pt-5">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); discover.mutate(undefined, { onSuccess: setFound }) }}>
              <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="A space to explore, e.g. college students, dental clinics… (optional)" />
              <Button type="submit" loading={discover.isPending} className="shrink-0"><Compass />Scan</Button>
            </form>
            {discover.isPending && (
              <div className="mt-6 space-y-2">
                {PLATFORMS.map((p, i) => (
                  <motion.div key={p} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.35 }} className="flex items-center gap-3 text-sm text-ink-2">
                    <span className="size-1.5 animate-pulse rounded-full bg-saffron" />Scanning {p}…
                  </motion.div>
                ))}
              </div>
            )}
            {!discover.isPending && found && (
              <div className="mt-5 space-y-3">
                <p className="text-xs text-muted">{found.content.opportunities.length} opportunities · {found.content.sources_scanned} sources scanned</p>
                {found.content.note && <p className="text-sm text-ink-2">{found.content.note}</p>}
                {found.content.opportunities.map((o) => (
                  <OpportunityCard key={o.title} o={o} action={
                    <Button size="sm" loading={create.isPending && create.variables?.opportunity === o}
                      onClick={() => go(ventureFromOpportunity(o))}>
                      Create venture
                    </Button>
                  } />
                ))}
              </div>
            )}
            {!discover.isPending && !found && (
              <p className="mt-6 text-sm text-muted">Scans {PLATFORMS.join(', ')} for recurring pain, clusters the complaints, studies why current tools fail, then proposes a startup only where the evidence supports it.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
