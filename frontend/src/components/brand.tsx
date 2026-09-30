import { useId } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export function Spark({ className, gradient = true }: { className?: string; gradient?: boolean }) {
  const id = useId()
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {gradient && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ec8a44" />
            <stop offset="1" stopColor="#4250d5" />
          </linearGradient>
        </defs>
      )}
      <path d="M12 1.5c.7 5.4 3.6 8.3 9 9-5.4.7-8.3 3.6-9 9-.7-5.4-3.6-8.3-9-9 5.4-.7 8.3-3.6 9-9z" fill={gradient ? `url(#${CSS.escape(id)})` : 'currentColor'} />
    </svg>
  )
}

export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2 text-ink', className)} aria-label="Foundry AI home">
      <span className="grid size-7 place-items-center rounded-[9px] bg-ink">
        <Spark className="size-4" />
      </span>
      <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.04em]">foundry</span>
    </Link>
  )
}

/** Hero ornament: a symmetric hairline flourish around a spark, echoing Sarvam's decorative crest. */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 40" className={cn('text-white', className)} fill="none" aria-hidden>
      <path d="M2 30h196" stroke="currentColor" strokeOpacity=".7" />
      {[1, -1].map((dir) => (
        <g key={dir} transform={dir === -1 ? 'translate(200 0) scale(-1 1)' : undefined} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M34 25c14 0 26-2 38-8" />
          <path d="M52 25c10-.5 20-3 28-9" />
          <path d="M70 25c8-1 14-4 18-9" />
          <circle cx="84" cy="12" r="4.5" />
        </g>
      ))}
      <path d="M100 2c.8 6 3.9 9.2 10 10-6.1.8-9.2 4-10 10-.8-6-3.9-9.2-10-10 6.1-.8 9.2-4 10-10z" fill="currentColor" />
    </svg>
  )
}

/** Hairline-framed eyebrow, as on Sarvam's hero ("India's Sovereign AI Platform"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-block px-6 py-2.5 text-[15px] tracking-[0.01em] text-indigo', className)}>
      <span className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#c9ccef_20%,#c9ccef_80%,transparent)]" />
      {children}
      <span className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,#c9ccef_20%,#c9ccef_80%,transparent)]" />
    </span>
  )
}
