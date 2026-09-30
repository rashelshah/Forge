import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, AppWindow, Download, FlaskConical, Loader2, Maximize2, Monitor, RefreshCw, Send, Smartphone, Sparkles, Tablet, Undo2, Wand2, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Empty, ModeBadge } from '@/components/bits'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAction } from '@/lib/queries'
import type { Experiment, PrototypeContent, Report, Venture } from '@/lib/types'
import { ago, cn } from '@/lib/utils'

// The prototype runs in a sandboxed iframe with an opaque origin: generated code can't touch this app.
// Sandboxed frames can't use localStorage, so give it an in-memory stand-in, and report runtime errors to us.
const SHIM = `<script>try{window.localStorage.getItem('x')}catch(e){var __m={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:function(k){return k in __m?__m[k]:null},setItem:function(k,v){__m[k]=String(v)},removeItem:function(k){delete __m[k]},clear:function(){__m={}},key:function(i){return Object.keys(__m)[i]||null},get length(){return Object.keys(__m).length}}})}
window.addEventListener('error',function(e){parent.postMessage({__foundry:'error',message:String(e.message||e)},'*')});
window.addEventListener('unhandledrejection',function(e){parent.postMessage({__foundry:'error',message:'Unhandled promise rejection: '+String(e.reason)},'*')});
function __qa(){var t=(document.body&&document.body.innerText)||'';var m=t.match(/\\b(undefined|NaN)\\b|\\[object Object\\]/);if(m)parent.postMessage({__foundry:'error',message:'The '+(location.hash||'#/home')+' screen shows "'+m[0]+'" where a value should be — a field is missing from the data or miscalculated'},'*')}
window.addEventListener('load',function(){setTimeout(__qa,700)});window.addEventListener('hashchange',function(){setTimeout(__qa,400)});</script>`
const withShim = (html: string) => (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + SHIM) : SHIM + html)

const DEVICES = { desktop: { icon: Monitor, width: 1280 }, tablet: { icon: Tablet, width: 820 }, mobile: { icon: Smartphone, width: 390 } } as const
const SUGGESTIONS = ['Make it dark mode', 'Add a dashboard with charts', 'Add a checkout / booking flow', 'Use a calmer colour palette', 'Add an onboarding screen']
const BUILD_STEPS = ['Reading your research and MVP plan', 'Planning screens and user flows', 'Designing the interface', 'Writing working code', 'Checking the code for errors']

function PrototypeFrame({ html, width = 1280, height = 720, onError }: { html: string; width?: number; height?: number; onError?: (m: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(width)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!onError) return
    const on = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && e.data?.__foundry === 'error') onError(String(e.data.message).slice(0, 400))
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [onError])
  // Render at the real device width and scale down to fit, so "Desktop" always shows the desktop layout.
  const scale = Math.min(1, avail / width)
  return (
    <div ref={box} className="w-full overflow-hidden" style={{ height }}>
      <iframe ref={ref} title="Prototype preview" srcDoc={withShim(html)} sandbox="allow-scripts allow-forms allow-modals"
        className="mx-auto block origin-top-left bg-white" style={{ width, height: height / scale, transform: `scale(${scale})`, marginLeft: scale < 1 ? 0 : 'auto' }} />
    </div>
  )
}

export function PrototypePreview({ content }: { content: PrototypeContent }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
        {['#f1b0a4', '#f3d28e', '#b9d99b'].map((c) => <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}
        <span className="ml-3 truncate font-mono text-[11px] text-muted">{content.title}</span>
      </div>
      <PrototypeFrame html={content.html} />
    </Card>
  )
}

function Building() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 2600)
    return () => clearInterval(t)
  }, [])
  return (
    <Card className="relative overflow-hidden p-8">
      <div className="aurora-soft -z-10" />
      <p className="text-lg font-medium">Building your prototype…</p>
      <p className="mt-1 text-sm text-muted">Usually 10–30 seconds.</p>
      <ol className="mt-6 space-y-3">
        {BUILD_STEPS.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-3 text-sm transition', i > step && 'opacity-35')}>
            {i < step ? <span className="grid size-5 place-items-center rounded-full bg-leaf text-[10px] text-white">✓</span>
              : i === step ? <Loader2 className="size-5 animate-spin text-saffron" /> : <span className="size-5 rounded-full border border-line-2" />}
            {s}
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function PrototypeStudio({ venture, report }: { venture: Venture; report?: Report<PrototypeContent> }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [device, setDevice] = useState<keyof typeof DEVICES>('desktop')
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [full, setFull] = useState(false)
  const inv = [['research'], ['memory'], ['me'], ['activity']]

  // Put the new version straight into the cache so the preview updates instantly (no refetch race).
  const key = ['research', { venture_id: venture.id }]
  const put = (r: Report<PrototypeContent>) => qc.setQueryData<Report[]>(key, (old = []) => [r, ...old.filter((x) => x.id !== r.id)])
  const generate = useAction(() => api<Report<PrototypeContent>>(`/ventures/${venture.id}/prototype`, {}).then((r) => (put(r), r)), inv, 'Prototype ready')
  const edit = useAction((text: string) => api<Report<PrototypeContent>>(`/research/${report!.id}/prototype/edit`, { instruction: text }).then((r) => (put(r), r)), inv, (r) => r.summary ?? 'Updated')
  const undo = useAction(() => api<Report<PrototypeContent>>(`/research/${report!.id}/prototype/undo`, {}).then((r) => (put(r), r)), inv, 'Reverted to the previous version')
  const launch = useAction(() => api<Experiment>('/experiments', {
    venture_id: venture.id, type: 'prototype', prototype_report_id: report!.id, name: `${venture.name} prototype test`,
    hypothesis: 'At least 10% of people who try the prototype join the waitlist.', target_conversion: 10,
  }), [['experiments'], ['dashboard']], 'Your prototype is live for testers')

  // A new version clears the previous runtime error.
  useEffect(() => setError(null), [report?.content.html])

  if (generate.isPending) return <Building />
  if (!report) {
    return (
      <Empty icon={<AppWindow />} title="Build a working prototype" action={<Button onClick={() => generate.mutate()}><Sparkles />Generate prototype</Button>}>
        Foundry turns your research and MVP plan into a clickable first version of the product — real screens, sample data, and working actions — that you can refine by just describing changes.
      </Empty>
    )
  }

  const c = report.content
  const busy = edit.isPending || undo.isPending
  const submit = (text: string) => {
    if (!text.trim() || busy) return
    edit.mutate(text, { onSuccess: () => setInstruction('') })
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([c.html], { type: 'text/html' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${venture.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-prototype.html` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line bg-white p-0.5">
            {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((d) => {
              const Icon = DEVICES[d].icon
              return (
                <button key={d} onClick={() => setDevice(d)} aria-label={`${d} preview`} className={cn('rounded-full p-1.5 cursor-pointer', device === d ? 'bg-dark text-white' : 'text-muted hover:text-ink')}>
                  <Icon className="size-4" />
                </button>
              )
            })}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}><RefreshCw />Restart</Button>
          <Button size="sm" variant="ghost" onClick={() => setFull(true)}><Maximize2 />Full screen</Button>
          <Button size="sm" variant="ghost" onClick={download}><Download />Download code</Button>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge mode={c.mode} />
            <Button size="sm" onClick={() => launch.mutate(undefined, { onSuccess: (e) => nav(`/app/experiments/${e.id}`) })} loading={launch.isPending}><FlaskConical />Test with real users</Button>
          </div>
        </div>

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] px-4 py-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-rose" />
            <span className="min-w-0 flex-1 text-ink-2"><span className="font-medium text-rose">The prototype hit an error:</span> {error}</span>
            <Button size="sm" onClick={() => submit(`Fix this runtime error without changing how the app looks or behaves otherwise: ${error}`)} loading={busy}><Wand2 />Fix it for me</Button>
          </div>
        )}

        <Card className="relative overflow-hidden bg-[linear-gradient(180deg,#f7f8fb,#eef1f8)]">
          <div className="flex items-center gap-1.5 border-b border-line bg-white/80 px-4 py-2.5">
            {['#f1b0a4', '#f3d28e', '#b9d99b'].map((col) => <span key={col} className="size-2.5 rounded-full" style={{ background: col }} />)}
            <span className="ml-3 truncate font-mono text-[11px] text-muted">{c.title}</span>
            <span className="ml-auto text-[11px] text-faint">Updated {ago(c.history.at(-1)?.at ?? report.created_at)}</span>
          </div>
          <div className={cn(device !== 'desktop' && 'py-4')}>
            <PrototypeFrame key={nonce} html={c.html} width={DEVICES[device].width} onError={setError} />
          </div>
          <AnimatePresence>
            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[2px]">
                <div className="flex items-center gap-3 rounded-full bg-white px-5 py-3 text-sm shadow-float"><Loader2 className="size-4 animate-spin text-saffron" />Applying your change…</div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      <Card className="flex flex-col xl:max-h-[800px]">
        <div className="border-b border-line p-4">
          <p className="font-medium">Change anything</p>
          <p className="text-xs text-muted">Describe what you want, like you would to a designer.</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-xl bg-canvas p-3 text-sm text-ink-2">✨ {c.summary}</div>
          {c.history.map((h) => (
            <div key={h.at} className="space-y-1.5">
              <p className="ml-6 rounded-xl rounded-tr-sm bg-dark px-3 py-2 text-sm text-white">{h.instruction.startsWith('Fix this runtime error') ? 'Fix the error' : h.instruction}</p>
              <p className="mr-6 rounded-xl rounded-tl-sm bg-canvas px-3 py-2 text-sm text-ink-2">{h.summary}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-line p-4">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => setInstruction(s)} className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-ink-2 hover:border-line-2 cursor-pointer">{s}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); submit(instruction) }} className="space-y-2">
            <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} placeholder="e.g. Add a 'Saved items' page where users can bookmark listings"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(instruction) } }} />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={edit.isPending} disabled={!instruction.trim() || busy}><Send />Apply change</Button>
              {c.previous_html && <Button type="button" variant="light" onClick={() => undo.mutate()} disabled={busy} aria-label="Undo last change"><Undo2 /></Button>}
            </div>
          </form>
          <button onClick={() => confirm('Start over with a brand new prototype? Your current version will be replaced.') && generate.mutate()}
            className="w-full pt-1 text-center text-xs text-muted hover:text-ink cursor-pointer">Start over from scratch</button>
        </div>
      </Card>

      {full && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <span className="text-sm font-medium">{c.title}</span>
            <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setFull(false)} aria-label="Exit full screen"><X /></Button>
          </div>
          <PrototypeFrame html={c.html} height={window.innerHeight - 53} width={Math.max(1024, window.innerWidth)} onError={setError} />
        </div>
      )}
    </div>
  )
}
