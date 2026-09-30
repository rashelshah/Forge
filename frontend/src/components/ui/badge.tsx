import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'bg-soft text-ink-2',
      indigo: 'bg-lavender/60 text-indigo',
      saffron: 'bg-[#fdebdc] text-[#a2511c]',
      leaf: 'bg-[#e8f3dc] text-[#3f6b17]',
      rose: 'bg-[#fbe4e0] text-rose',
      amber: 'bg-[#fbf0d9] text-[#8a5e12]',
      dark: 'bg-dark text-white',
      outline: 'border border-line-2 text-ink-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export const Badge = ({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...p} />
)
