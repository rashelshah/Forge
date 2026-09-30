import * as React from 'react'
import { cn } from '@/lib/utils'

const field = 'w-full rounded-xl border border-line-2 bg-white px-3.5 text-[15px] text-ink placeholder:text-faint transition focus:border-periwinkle focus:outline-none focus:ring-4 focus:ring-lavender/60 disabled:opacity-60'

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={cn(field, 'h-10', className)} {...p} />
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(field, 'min-h-24 py-2.5 leading-relaxed', className)} {...p} />
)
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(field, 'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%237b7c84%27%20stroke-width=%272%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[position:right_12px_center] bg-no-repeat pr-9', className)} {...p} />
)
