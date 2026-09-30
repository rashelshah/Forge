import { AlertCircle, Briefcase, Cpu, Crown, Flame, Megaphone, Puzzle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentKey, Decision, Mode, ScoreKey, Stage } from '@/lib/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------- page scaffolding

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{eyebrow}</p>}
        <h1 className="text-[32px] leading-[1.1] sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-dashed border-line-2 bg-white px-6 py-14 text-center">
      <div className="dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="relative">
        {icon && <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-soft text-ink-2 [&_svg]:size-5">{icon}</div>}
        <h3 className="text-xl">{title}</h3>
        {children && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  )
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#f4cfc8] bg-[#fdf3f1] p-3 text-sm text-rose">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {(error as Error)?.message ?? 'Something went wrong'}
    </div>
  )
}

// ---------------------------------------------------------------- gradient tiles (Sarvam feature-card headers)

export const GRADIENTS = {
  lavender: 'bg-[radial-gradient(120%_120%_at_50%_0%,#c7d2fe_0%,#a5b4fc_45%,#8b9cf5_100%)]',
  saffron: 'bg-[radial-gradient(120%_120%_at_50%_0%,#f5b27e_0%,#e98a47_50%,#d86c2a_100%)]',
  leaf: 'bg-[radial-gradient(120%_120%_at_50%_0%,#cfe6a9_0%,#9ccb62_50%,#6fa33a_100%)]',
  rose: 'bg-[radial-gradient(120%_120%_at_50%_0%,#f5c3b7_0%,#e58f7c_50%,#c9523d_100%)]',
  amber: 'bg-[radial-gradient(120%_120%_at_50%_0%,#fde1a5_0%,#f7c45c_50%,#d99a2b_100%)]',
  slate: 'bg-[radial-gradient(120%_120%_at_50%_0%,#9aa3c7_0%,#5b6390_50%,#2f3458_100%)]',
}

export function GradientTile({ tone, icon, className }: { tone: keyof typeof GRADIENTS; icon: ReactNode; className?: string }) {
  return (
    <div className={cn('relative grid h-36 place-items-center overflow-hidden rounded-xl', GRADIENTS[tone], className)}>
      <svg className="absolute inset-0 size-full opacity-25" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden>
        {[20, 40, 60, 80].map((r) => <circle key={r} cx="100" cy="60" r={r} fill="none" stroke="white" strokeWidth=".6" />)}
        <path d="M0 60h200M100 0v120" stroke="white" strokeWidth=".4" />
      </svg>
      <div className="relative grid size-14 place-items-center rounded-full border border-white/70 bg-white/15 text-white backdrop-blur-sm [&_svg]:size-6">{icon}</div>
    </div>
  )
}

// ---------------------------------------------------------------- scores

export const SCORE_LABELS: Record<ScoreKey, string> = {
  demand: 'Demand',
  competition: 'Competition',
  defensibility: 'Defensibility',
  revenue_potential: 'Revenue potential',
  founder_fit: 'Founder fit',
}
export const SCORE_KEYS = Object.keys(SCORE_LABELS) as ScoreKey[]

export const scoreColor = (s: number) => (s >= 70 ? '#5d8a2b' : s >= 50 ? '#4250d5' : s >= 35 ? '#c08827' : '#c43d2b')

export function ScoreRing({ value, size = 64, stroke = 6, label }: { value: number | null | undefined; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value ?? 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={label ?? `Score ${value ?? 'not scored'}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
        {value != null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(v)} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-[stroke-dashoffset] duration-700" />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display font-medium tabular-nums" style={{ fontSize: size * 0.3 }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function ScoreBar({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value ?? '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-soft">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${value ?? 0}%`, background: value != null ? scoreColor(value) : undefined }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- status badges

const STAGE_TONE = { idea: 'neutral', validating: 'indigo', building: 'saffron', launched: 'leaf', paused: 'amber', killed: 'rose' } as const
export const StageBadge = ({ stage }: { stage: Stage }) => <Badge tone={STAGE_TONE[stage]} className="capitalize">{stage}</Badge>

const DECISION_TONE = { GO: 'leaf', PIVOT: 'amber', KILL: 'rose' } as const
export const DecisionBadge = ({ decision, className }: { decision: Decision | string; className?: string }) => (
  <Badge tone={DECISION_TONE[decision as Decision] ?? 'indigo'} className={className}>{decision}</Badge>
)

export const ModeBadge = ({ mode }: { mode?: Mode | null }) =>
  mode === 'demo' ? <Badge tone="outline" title="Generated offline from templates. Add API keys for live research.">Demo data</Badge> : null

export const SEVERITY_TONE = { info: 'neutral', low: 'indigo', medium: 'amber', high: 'rose' } as const

// ---------------------------------------------------------------- boardroom agents

export const AGENTS: Record<AgentKey, { name: string; role: string; icon: typeof Crown; tone: keyof typeof GRADIENTS; bubble: string }> = {
  ceo: { name: 'CEO', role: 'Vision · Growth · Opportunity', icon: Crown, tone: 'saffron', bubble: 'bg-[#fdf1e8] border-[#f7d9c1]' },
  investor: { name: 'Investor', role: 'Risk · Return · Scalability', icon: Briefcase, tone: 'leaf', bubble: 'bg-[#f1f7e9] border-[#d8e9c2]' },
  product: { name: 'Product', role: 'Pain · Retention · PMF', icon: Puzzle, tone: 'lavender', bubble: 'bg-[#f0f3ff] border-[#d5defb]' },
  growth: { name: 'Growth', role: 'Acquisition · Distribution', icon: Megaphone, tone: 'amber', bubble: 'bg-[#fdf6e6] border-[#f3e0b3]' },
  technical: { name: 'Technical', role: 'Engineering · Cost · Execution', icon: Cpu, tone: 'slate', bubble: 'bg-[#f3f4f8] border-[#dfe1ea]' },
  failure: { name: 'Failure Agent', role: 'Why this will fail', icon: Flame, tone: 'rose', bubble: 'bg-[#fdf0ed] border-[#f5cfc6]' },
}

export function AgentAvatar({ agent, size = 36 }: { agent: AgentKey; size?: number }) {
  const A = AGENTS[agent]
  const Icon = A.icon
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full text-white ring-2 ring-white', GRADIENTS[A.tone])} style={{ width: size, height: size }}>
      <Icon style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-white p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-2 font-display text-[34px] leading-none font-medium tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}
