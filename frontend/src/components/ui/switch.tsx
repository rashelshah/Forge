import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Switch = ({ className, ...p }: React.ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root className={cn('inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-line-2 p-0.5 transition data-[state=checked]:bg-dark', className)} {...p}>
    <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-5" />
  </SwitchPrimitive.Root>
)
