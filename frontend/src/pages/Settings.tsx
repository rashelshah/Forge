import { Check, CircleDashed } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Loading, PageHeader } from '@/components/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { useAction, useConfig, useMe } from '@/lib/queries'
import { cn } from '@/lib/utils'

export default function Settings() {
  const { data: me, isLoading } = useMe()
  const { data: config } = useConfig()
  const [f, setF] = useState({ full_name: '', skills: '', industries: '', years_experience: 0, weekly_hours: 0, capital: '', background: '' })
  useEffect(() => {
    if (!me) return
    const p = me.founder_profile
    setF({ full_name: me.full_name ?? '', skills: (p.skills ?? []).join(', '), industries: (p.industries ?? []).join(', '), years_experience: p.years_experience ?? 0, weekly_hours: p.weekly_hours ?? 0, capital: p.capital ?? '', background: p.background ?? '' })
  }, [me])
  const save = useAction(() => api('/me', { full_name: f.full_name, founder_profile: f }, 'PATCH'), [['me']], 'Saved')
  const setMonitoring = useAction((on: boolean) => api('/me', { settings: { daily_monitoring: on } }, 'PATCH'), [['me']])

  if (isLoading || !me) return <Loading rows={4} />
  const integrations = [
    ['Supabase Postgres + Auth', config?.db === 'supabase', 'Local JSON store'],
    ['Supabase pgvector (RAG + memory)', config?.ai.vector === 'pgvector', 'Local vector file'],
    ['Groq LLMs (free)', !!config?.ai.openai, 'Template agents'],
    ['Tavily search + extract', !!config?.ai.tavily, 'No live web evidence'],
    ['Firecrawl (optional)', !!config?.ai.firecrawl, config?.ai.tavily ? 'Using Tavily Extract' : 'Direct page fetch'],
  ] as const

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><div><CardTitle>Founder profile</CardTitle><CardDescription>Powers the Founder Fit score and personalises opportunity discovery.</CardDescription></div></CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
                <div><Label htmlFor="fn">Full name</Label><Input id="fn" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="sk">Skills</Label><Input id="sk" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="marketplaces, react, growth" /></div>
                  <div><Label htmlFor="in">Industries</Label><Input id="in" value={f.industries} onChange={(e) => setF({ ...f, industries: e.target.value })} placeholder="edtech, fintech" /></div>
                  <div><Label htmlFor="ye">Years of experience</Label><Input id="ye" type="number" min={0} value={f.years_experience} onChange={(e) => setF({ ...f, years_experience: Number(e.target.value) })} /></div>
                  <div><Label htmlFor="wh">Hours per week</Label><Input id="wh" type="number" min={0} value={f.weekly_hours} onChange={(e) => setF({ ...f, weekly_hours: Number(e.target.value) })} /></div>
                </div>
                <div><Label htmlFor="ca">Capital available</Label><Input id="ca" value={f.capital} onChange={(e) => setF({ ...f, capital: e.target.value })} placeholder="$20k savings" /></div>
                <div><Label htmlFor="bg">Background</Label><Textarea id="bg" value={f.background} onChange={(e) => setF({ ...f, background: e.target.value })} placeholder="Ex-PM at a marketplace startup; ran a campus club with 2,000 members." /></div>
                <Button type="submit" loading={save.isPending}>Save profile</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Plan & usage</CardTitle><CardDescription>Billing-ready: plans are enforced server-side and can be switched by a payment webhook.</CardDescription></div></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {Object.entries(me.plans).map(([key, p]) => (
                <div key={key} className={cn('rounded-2xl border p-4', me.plan === key ? 'border-periwinkle bg-[#f6f8ff]' : 'border-line')}>
                  <div className="flex items-center justify-between"><p className="font-medium">{p.name}</p>{me.plan === key && <Badge tone="indigo">Current</Badge>}</div>
                  <p className="mt-2 font-display text-3xl">${p.price}<span className="text-sm text-muted">/mo</span></p>
                  <p className="mt-2 text-xs text-muted">{p.ventures ?? 'Unlimited'} ventures · {p.agentRuns.toLocaleString()} runs/mo</p>
                </div>
              ))}
            </CardContent>
            <CardContent className="grid gap-4 border-t border-line sm:grid-cols-2">
              {([['Ventures', me.usage.ventures, me.limits.ventures], ['Agent runs this month', me.usage.agentRuns, me.limits.agentRuns]] as const).map(([k, used, max]) => (
                <div key={k}>
                  <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{k}</span><span className="tabular-nums">{used} / {max ?? '∞'}</span></div>
                  <div className="h-1.5 rounded-full bg-soft"><div className="h-full rounded-full bg-[linear-gradient(90deg,#ec8a44,#6a88e2)]" style={{ width: `${max ? Math.min(100, (100 * used) / max) : 2}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
            <CardContent>
              <label className="flex items-start justify-between gap-4">
                <span><span className="block text-sm font-medium">Daily monitoring</span><span className="text-xs text-muted">Agents sweep competitors, markets and sentiment every 24 hours and notify you.</span></span>
                <Switch checked={me.settings?.daily_monitoring !== false} onCheckedChange={(on) => setMonitoring.mutate(on)} />
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Integrations</CardTitle><CardDescription>Configured through environment variables.</CardDescription></div></CardHeader>
            <CardContent className="space-y-3">
              {integrations.map(([name, on, fallback]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  {on ? <Check className="size-4 text-leaf" /> : <CircleDashed className="size-4 text-faint" />}
                  <span className="flex-1">{name}</span>
                  <span className="text-xs text-muted">{on ? 'Connected' : fallback}</span>
                </div>
              ))}
              {config?.ai.model && <p className="pt-2 text-xs text-muted">Models: <code className="font-mono">{[config.ai.model, ...(config.ai.fast_models ?? [])].join(', ')}</code></p>}
              {config?.ai.embeddings && <p className="text-xs text-muted">Embeddings: <code className="font-mono">{config.ai.embeddings}</code> (local, free)</p>}
              {config?.ai.mode === 'offline' && <p className="rounded-xl bg-[#fdf3f1] p-3 text-xs text-rose">AI service is offline. Start it with <code className="font-mono">npm run dev:ai</code>.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
